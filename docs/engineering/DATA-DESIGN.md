# R1 Data Design — ERD and Lifecycle

**Status:** Ready for review
**Version:** 0.1
**Scope:** Issue #6 — R1 ERD and data lifecycle for Cloudflare D1
**Sources:** PRD, BUSINESS-RULES, TEST-DATA (`r1-v1`), TDD, CLOUDFLARE-USAGE-MODEL
**Budgets:** Every query pattern below must fit §3 of the usage model (≤ 8 D1 queries per endpoint, indexed `(workspace_id, …)` access, checkout in one batch).

## 1. Scope decision: workspace-scoped copies, one production database

One production D1 database; every mutable row carries a trusted `workspace_id` derived from the signed workspace context/session, never from request payloads (BR-ACC-002). Seed reference content (venues, events, sessions, tickets) is **copied per workspace** with identical seed values rather than shared as global rows, because:

- reset/expiration delete exactly one workspace's rows (`WHERE workspace_id = ?`);
- the Free plan allows only 10 databases, ruling out per-workspace databases;
- per-workspace storage is < 100 KB, so copies cost nothing measurable.

"Shared reference content" in TDD §4 therefore means identical seed values, not shared rows.

## 2. ERD

```text
workspaces 1───* users 1───* sessions
    │              │
    │              ├───* bookings ───1 booking_items *─── ticket_types
    │              │        │                    │
    │              │        └─── payment_attempts (booking_id NULL on decline)
    │              │
    │              └───* idempotency_keys ──→ bookings (nullable, success only)
    │
    ├───* venues 1───* events 1───* event_sessions 1───* ticket_types
    │                                              │
    │                                     confirmed_quantity counter
    │
    └── seed_version, seed_reference_at (T0), last_active_at, status
```

### 2.1 Tables (all instants TEXT ISO-8601 UTC; money INTEGER IDR)

| Table | Key | Workspace scope | Purpose / requirement |
| --- | --- | --- | --- |
| `workspaces` | `id` TEXT PK | Self (`id`) | Seed version, `seed_reference_at` (T0), `last_active_at`, `status` (`ACTIVE`/`EXPIRED`); WSP-001…004 |
| `users` | `id` TEXT PK; UNIQUE `(workspace_id, email)` | `workspace_id` FK → workspaces, explicit ordered deletes (cascades unsafe until FK enforcement is proven per-connection) | Seeded attendees + non-interactive fixture owner; `seed_key` NULL for user-created (none in R1); `password_hash`; ACC-001, BR-ACC-001 |
| `sessions` | `token_hash` TEXT PK (store hash, never raw token) | `workspace_id` + `user_id` FKs | HTTP-only session; `expires_at`, `revoked_at`; ACC-001 |
| `venues` | `id` TEXT PK | `workspace_id`; `seed_key` | Fictional Jakarta venues; `time_zone` always `Asia/Jakarta`; BR-TIM-001 |
| `events` | `id` TEXT PK; UNIQUE `(workspace_id, slug)` | `workspace_id`, `venue_id` FK | `status` DRAFT/PUBLISHED/CANCELLED; `sales_open_at`, `sales_close_at`; EVT-001/002, BR-EVT-001/004 |
| `event_sessions` | `id` TEXT PK | `workspace_id`, `event_id` FK | `status` SCHEDULED/CANCELLED/COMPLETED; `start_at`, `end_at`; `capacity`; `confirmed_quantity` counter (default 0); BR-EVT-002/003/005 |
| `ticket_types` | `id` TEXT PK | `workspace_id`, `event_id`, `event_session_id` FKs | `name`, `price_idr` INTEGER ≥ 0; capacity shared at session level, never per ticket type; BKG-001, BR-TKT-001/002 |
| `bookings` | `id` TEXT PK; UNIQUE `(workspace_id, reference)` | `workspace_id`, `user_id`, `event_id`, `event_session_id` FKs | `reference` human-readable unique; `status` always `CONFIRMED` in R1; `quantity`, `total_idr`; `created_at`; BKG-003/004/005, BR-BKG-006 |
| `booking_items` | `id` TEXT PK; UNIQUE `(booking_id)` (one ticket type per checkout) | `workspace_id`, `booking_id`, `ticket_type_id` FKs | `quantity` 1–5, `unit_price_idr` **snapshot** copied at checkout, `subtotal_idr`; BR-TKT-003 |
| `payment_attempts` | `id` TEXT PK | `workspace_id`, `user_id` FKs; `booking_id` NULL FK (set on success only) | `outcome` SUCCEEDED/DECLINED; stores outcome, never the simulation code; decline rows are attempt records, not booking records (BR-BKG-006); PAY-001, BR-PAY-004 |
| `idempotency_keys` | PK `(workspace_id, user_id, key)` | Composite PK is the scope | `fingerprint` (SHA-256 of canonical booking input; hash only, raw sim code never stored — NFR-006), `booking_id` NULL, `outcome` NULL, `created_at`; BR-BKG-004 |

## 3. Constraints that enforce the invariants

- **Ownership:** every read/write filters `workspace_id = ?` (and `user_id = ?` for bookings/sessions) inside the SQL, never post-filters in code; `BR-BKG-005` listing/detail queries join on both columns (R-004 mitigation).
- **Idempotent retry:** `POST /api/checkout` looks up `(workspace_id, user_id, key)` first. Same `fingerprint` → return stored outcome without touching capacity. Different `fingerprint` → reject with stable conflict error, no side effects (BR-BKG-004).
- **Capacity:** checkout batch ends with a conditional counter update, keeping the whole operation inside one D1 batch:
  ```sql
  UPDATE event_sessions
     SET confirmed_quantity = confirmed_quantity + ?1
   WHERE id = ?2 AND workspace_id = ?3
     AND confirmed_quantity + ?1 <= capacity;
  ```
  The Worker checks the update affected exactly 1 row; otherwise it aborts the batch and returns a stable conflict (sold out / stale input). No confirmed booking exists without its capacity increment (BR-BKG-002/003). The batch also inserts `bookings`, `booking_items`, `payment_attempts` (SUCCEEDED), and `idempotency_keys` together — partial confirmed state is impossible **iff** D1 batches are atomic (see §6 spike).
- **Price authority:** `unit_price_idr`/`total_idr` are computed server-side from `ticket_types.price_idr × quantity`; client totals are ignored; later price changes cannot alter `booking_items` snapshots (BR-TKT-002/003).
- **Time authority:** sales-window and future-session checks use server `now` against UTC instants; `sales_open_at <= now < sales_close_at AND now < start_at` (BR-TIM-002/003).
- **No card data:** no column exists for card numbers, CVCs, or expiries; adding one later requires a new ADR plus migration review (R-006).

## 4. Indexes (every filter column indexed; billed rows = rows scanned)

- `users(workspace_id, email)`; `sessions(token_hash)`; `sessions(workspace_id, user_id)`
- `events(workspace_id, status)`; `events(workspace_id, slug)`; `events(workspace_id, start_at)` via session join for catalog future-session filter
- `event_sessions(workspace_id, event_id, start_at)`; `event_sessions(workspace_id, status, start_at)`
- `ticket_types(workspace_id, event_session_id)`; `ticket_types(workspace_id, event_id)`
- `bookings(workspace_id, user_id, created_at DESC)`; `bookings(workspace_id, reference)`
- `booking_items(booking_id)`; `payment_attempts(workspace_id, user_id, created_at DESC)`
- `idempotency_keys(workspace_id, user_id, key)` (PK covers it)
- `workspaces(status, last_active_at)` for cleanup scan (never a full table scan)

## 5. Data lifecycles

### 5.1 Provision (WSP-004)

One batched write set (≤ 10 statements, ≤ 45 rows): insert `workspaces` row (`seed_version = 'r1-v1'`, fresh `seed_reference_at = T0`, `last_active_at = now`, `ACTIVE`), 2 venues, 5 events, sessions, ticket types, 2 interactive users (hashed passwords) + 1 fixture identity, 2 seeded bookings + items + SUCCEEDED attempts, and set `event_sessions.confirmed_quantity` to seeded values (2 and 5). All-or-nothing: failure returns explicit retry-later, never a half-seeded workspace.

### 5.2 Reset (WSP-002)

Scoped to the active workspace only, in child-to-parent order within batches (`sessions → payment_attempts → booking_items → bookings → idempotency_keys → ticket_types → event_sessions → events → venues → users`), then re-run the §5.1 seed with a new T0 and update the kept `workspaces` row. Rate-limited per usage model §5. Reset counts as activity (`last_active_at = now`).

### 5.3 Activity and expiration (WSP-003, BR-WSP-001/002)

Successful `/api/*` requests with a valid signed workspace context update `workspaces.last_active_at`; static hits and rejected requests do not. Cleanup tick selects a bounded batch via `workspaces(status, last_active_at)` where `last_active_at < now − 7 days`, runs the §5.2 child deletes per workspace in chunks (resumable cursor across ticks for the 10 ms Cron CPU cap), then sets `status = 'EXPIRED'`. Expired rows stay minimal (workspace row only) so a returning token gets an explicit expired → new-workspace flow; operator purges `EXPIRED` rows older than 30 days.

### 5.4 Sessions

Created on sign-in (1 row), invalidated on sign-out (`revoked_at`) or expiry; lookup is a single indexed `token_hash` read plus workspace/user scoping on every protected query.

## 6. D1 concurrency: assumptions and required spike (R-002)

Assumptions detailed design relies on: (a) D1 `batch()` executes atomically (all-or-nothing); (b) per-database single-threaded execution serializes concurrent batches so two checkouts for the last seat cannot both pass the conditional `UPDATE`; (c) `rows_written`/`rows_read` in the batch `meta` object accurately reflect billed usage for #11 verification.

These are **not yet proven** — the R1 release gate forbids overbooking under supported concurrency, so a spike must run before implementation checkout code is accepted: ≥ 20 parallel checkouts against the last 5 seats asserting total confirmed ≤ capacity, losers receive stable conflict with no booking rows, and same-key retries return the original outcome. If the spike fails, fallback is a serialized writer (single conditional-update statement as the gate, retries with backoff) documented in a follow-up revision; no checkout code merges until one path passes.

## 7. Migrations and deterministic seed

- Numbered forward-only SQL migrations via Wrangler D1 (`0001_init.sql`, …); schema changes never edit applied migrations. Seed data is **not** in migrations — it runs through the provision/reset path (§5.1) so local, preview, and production derive identical logical state from T0 + `Asia/Jakarta` offsets (NFR-007, R-003).
- Migration acceptance per environment: apply to clean local and preview databases, run reset-invariant checks (TEST-DATA reset invariants), then promote. Destructive migrations require a new ADR.
- `seed_version` stored per workspace; a future `r1-v2` seed is a code + migration change, never an in-place edit of seed meaning.

## 8. Budget fit and handoff

- Catalog (1–2 queries/≤ 30 reads), detail (2–3/≤ 50), checkout (≤ 8/one batch/≤ 30 reads/≤ 8 writes), list/detail reads, provision (≤ 10/≤ 45 writes), reset (≤ 12/≤ 60 writes), cleanup (≤ 20/≤ 500) — all inside usage-model §3 and the 50-query invocation cap.
- Issues #7/#8 now own: exact routes/schemas/error codes, canonical fingerprint fields, session cookie/hash choice with the 10 ms CPU benchmark, secret rotation, and final rate-limit values.

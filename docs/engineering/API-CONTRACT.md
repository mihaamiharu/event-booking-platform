# R1 Public API Contract

**Status:** Ready for review
**Version:** 0.1
**Scope:** Issue #7 — stable HTTP operations for every R1 product workflow
**Sources:** PRD, ERROR-CATALOG, INFORMATION-ARCHITECTURE, TRACEABILITY, DATA-DESIGN, CLOUDFLARE-USAGE-MODEL
**Base path:** `/api` (Worker route; all other paths serve static assets)

## 1. Global contracts

### 1.1 Representation

- JSON request/response bodies; UTF-8.
- Dates: RFC-3339 UTC strings (`startAt: "2026-09-18T02:00:00Z"`). Display in `Asia/Jakarta`/WIB is a client derivation; the API never returns local-time strings without offset.
- Currency: integer IDR minor-unit-free amounts (`priceIdr: 150000`) plus `"currency": "IDR"`. No fractional digits, no tax/fee fields in R1.
- Examples below use fixed timestamps for illustration; real values derive from the workspace `seed_reference_at` (T0).

### 1.2 Error shape (NFR-004)

```json
{
  "error": {
    "code": "CAPACITY_INSUFFICIENT",
    "message": "Only 2 places remain for this session.",
    "correlationId": "01J9Z…",
    "fields": { "quantity": "QUANTITY_INVALID" }
  }
}
```

- `code` is stable and listed in §6; `message` is English R1 copy and may change without notice.
- `correlationId` is present on 409/422/429/5xx and on auth failures for operator lookup; never include stack traces, SQL, secrets, tokens, or cross-workspace existence clues.
- Validation failures create no booking and consume no capacity.

### 1.3 Context and authorization

- Workspace context: signed `ebp_workspace` cookie set by provision, required on every `/api/*` operation except `POST /api/workspaces/provision` and `GET /api/health`. Missing/invalid → `WORKSPACE_REQUIRED` (401); expired → `WORKSPACE_EXPIRED` (410).
- Attendee session: HTTP-only `ebp_session` cookie set by sign-in. Protected operations (§3.4, §3.5, `POST /api/workspaces/reset` optional per §3.1) without a valid session → `AUTH_REQUIRED` (401).
- Ownership is enforced inside SQL (`workspace_id`, `user_id`); not-found and not-owned return the same `*_NOT_FOUND` code (non-enumerating).

### 1.4 Pagination

List responses use `?page=` (1-based, default 1) and `?perPage=` (default 20, max 50):

```json
{ "data": [ … ], "pagination": { "page": 1, "perPage": 20, "total": 42 } }
```

### 1.5 Test-support boundaries

No test-only endpoints, bulk-delete routes, or seed-injection parameters exist in any environment. Deterministic state comes only from provision/reset with seed `r1-v1`; preview uses the same operations against a disposable database. Load and concurrency tests must respect the provision/reset rate limits or run against local Wrangler state.

## 2. Requirement → operation matrix

| Requirement | Operation(s) |
| --- | --- |
| `ACC-001` | `POST /api/session`, `DELETE /api/session` |
| `EVT-001` | `GET /api/events` |
| `EVT-002` | `GET /api/events/:slug` |
| `BKG-001` | `POST /api/checkout` (selection validation) |
| `BKG-002` | `POST /api/checkout` (server revalidation) |
| `BKG-003` | `POST /api/checkout` (201 created / 200 replay) |
| `BKG-004` | `GET /api/bookings/:reference` |
| `BKG-005` | `GET /api/bookings` |
| `PAY-001` | `POST /api/checkout` (`paymentCode` field) |
| `WSP-001` | All operations (workspace scoping); `GET /api/workspaces/status` |
| `WSP-002` | `POST /api/workspaces/reset` |
| `WSP-003` | `GET /api/workspaces/status`, expiry codes |
| `WSP-004` | `POST /api/workspaces/provision` |

## 3. Operations

### 3.1 Workspaces

**`POST /api/workspaces/provision`** — create or reuse the caller's workspace (WSP-004). No workspace context required. Rate-limited (→ `WORKSPACE_RATE_LIMITED`, 429 + `Retry-After`).

```json
// Response 200
{ "workspace": { "status": "ACTIVE", "seedVersion": "r1-v1",
  "seedReferenceAt": "2026-09-04T00:00:00Z",
  "expiresAt": "2026-09-11T00:00:00Z" } }
```

Sets `ebp_workspace`. Reuse path returns the existing active workspace unchanged. Failure to seed fully → `WORKSPACE_PROVISION_FAILED` (503), never a partial workspace.

**`GET /api/workspaces/status`** — workspace required. Returns the provision shape plus `lastActiveAt`. Expired context → `WORKSPACE_EXPIRED` (410) with guidance to provision anew.

**`POST /api/workspaces/reset`** — workspace required, session optional. Body: `{ "confirm": true }` (`confirm: true` required, else `VALIDATION_FAILED`). Rate-limited. Success 200 returns the provision shape with a new `seedReferenceAt` plus `{ "reset": { "seedVersion": "r1-v1" } }`. Incomplete restore → `WORKSPACE_RESET_FAILED` (500).

### 3.2 Session

**`POST /api/session`** — workspace required. Body `{ "email": "alex.attendee@example.test", "password": "Attend123!" }`. Success 200 sets `ebp_session` and returns `{ "attendee": { "email": "…", "displayName": "Alex" } }`. Bad credentials → `AUTH_INVALID_CREDENTIALS` (401, one non-enumerating message). Throttled → `AUTH_RATE_LIMITED` (429).

**`DELETE /api/session`** — session required. 204, clears the cookie. Invalidating an already-invalid session still returns 204 (no oracle).

### 3.3 Events

**`GET /api/events?page=&perPage=`** — visitor with workspace. 200:

```json
{ "data": [{
    "slug": "jakarta-design-systems-workshop",
    "name": "Jakarta Design Systems Workshop",
    "venue": { "name": "Merdeka Community Hall", "city": "Jakarta" },
    "dateRange": { "startAt": "2026-09-18T02:00:00Z", "endAt": "2026-09-18T05:00:00Z" },
    "startingPriceIdr": 150000, "currency": "IDR",
    "availabilityStatus": "AVAILABLE" }],
  "pagination": { "page": 1, "perPage": 20, "total": 2 } }
```

Only `PUBLISHED` events with a future session appear; `availabilityStatus` is `AVAILABLE` / `SOLD_OUT`. Empty catalog returns `"data": []`, never an error.

**`GET /api/events/:slug`** — 200 with description, venue, sessions (id, WIB-derivable UTC range, status, `remainingCapacity`, `bookable` + reason when false), and ticket types (id, name, `priceIdr`). Missing/inaccessible → `EVENT_NOT_FOUND` (404).

### 3.4 Checkout (auth required)

**`POST /api/checkout`** — header `Idempotency-Key: <uuid-v4>` required (missing → `IDEMPOTENCY_KEY_REQUIRED`, 400).

```json
// Request
{ "eventSlug": "jakarta-design-systems-workshop",
  "eventSessionId": "sess_design_01",
  "ticketTypeId": "ticket_design_general",
  "quantity": 2,
  "paymentCode": "SIMULATE-SUCCESS" }
```

- `quantity` must be an integer 1–5 (→ `QUANTITY_INVALID`, 400).
- Unknown/foreign ticket type (→ `TICKET_TYPE_INVALID`, 400); unbookable session (→ `SESSION_NOT_BOOKABLE`, 409); insufficient capacity (→ `CAPACITY_INSUFFICIENT`, 409).
- `paymentCode` must be `SIMULATE-SUCCESS` or `SIMULATE-DECLINE` (other → `PAYMENT_CODE_INVALID`, 400, no side effects).
- `SIMULATE-DECLINE` → 422 `PAYMENT_DECLINED`; no booking row, no capacity consumed; the client preserves the selection for a new attempt with a new key.
- Success → `201` with the booking shape:
```json
{ "booking": { "reference": "BKG-7F3QXA",
    "eventSlug": "jakarta-design-systems-workshop",
    "eventSessionId": "sess_design_01",
    "ticketTypeId": "ticket_design_general",
    "quantity": 2, "unitPriceIdr": 150000, "totalIdr": 300000,
    "currency": "IDR", "paymentStatus": "SUCCEEDED",
    "bookingStatus": "CONFIRMED", "createdAt": "2026-09-04T10:01:00Z" } }
```
- Same key + byte-equivalent canonical input → `200` replay of the stored outcome (including a stored decline). Same key + different canonical input → `IDEMPOTENCY_CONFLICT` (409); the client starts a new attempt. Canonical fingerprint covers `{eventSlug, eventSessionId, ticketTypeId, quantity, paymentCode}` as SHA-256 (hash stored, raw code never persisted — NFR-006).

### 3.5 Bookings (auth required)

**`GET /api/bookings?page=&perPage=`** — own workspace + attendee only, newest first. Item: `{reference, eventName, sessionStartAt, quantity, totalIdr, currency, bookingStatus}`. Empty → `"data": []`.

**`GET /api/bookings/:reference`** — full booking shape (§3.4) plus event/session/ticket names. Foreign or missing reference → `BOOKING_NOT_FOUND` (404).

### 3.6 Operational

**`GET /api/health`** — no context required. `{ "status": "ok", "seedVersion": "r1-v1" }`. Never exposes quota internals.

## 4. Quota-exhaustion mapping

Per the usage model §8, Worker-request, CPU, and D1 row/storage exhaustion all surface as `SERVICE_UNAVAILABLE` (503, `Retry-After` to midnight UTC where applicable) or `STORAGE_FULL` (503) for the storage cap — never raw 1027/1102/D1 errors, never partial bookings.

## 5. Examples traceability

Checkout success/decline/invalid-code, idempotent replay/conflict, empty catalog/bookings, foreign-booking 404, and expired-workspace 410 examples above are the contract fixtures issues #10 (UI) and #11 (test strategy) must reuse.

## 6. Stable error codes (adopts the product error catalog plus three approved additions)

All catalog codes are adopted unchanged with their HTTP categories. Approved additions (required by the usage model and rate-limit design; the error catalog is updated in this same change):

| Code | HTTP | Meaning |
| --- | --- | --- |
| `AUTH_RATE_LIMITED` | 429 | Sign-in throttling tripped; retry with backoff |
| `SERVICE_UNAVAILABLE` | 503 | Quota/CPU/overload retry-later; includes `Retry-After` where known |
| `STORAGE_FULL` | 503 | Database storage cap reached; reads unaffected |
| `WORKSPACE_PROVISION_FAILED` | 503 | Provisioning could not complete; no partial workspace |

# R1 Cloudflare Free-Plan Usage Model

**Status:** Ready for review
**Version:** 0.1
**Review date:** 2026-09-04
**Scope:** Issue #9 — Model Cloudflare free-plan usage and resources
**Decision basis:** ADR-0002 (Cloudflare free-plan services, no VPS); NFR-001; WSP-001 through WSP-004; risks R-001, R-002

This document proves the R1 architecture can operate on Cloudflare free plans. It records authoritative limits, per-operation budgets, bindings, environments, abuse controls, Turnstile triggers, monitoring, and quota-exhaustion behavior. Exact table columns, SQL row counts, and password-hash CPU measurements are finalized in issues #6 (ERD), #7 (API), and #8 (auth); this model sets the budgets those designs must fit.

## 1. Authoritative limits (reviewed 2026-09-04)

| Service | Free-plan limit | Behavior on exceed | Source (last updated) |
| --- | --- | --- | --- |
| Workers requests | 100,000/day, resets midnight UTC | Error 1027; route fail-open bypasses Worker or fail-closed returns 1027 | https://developers.cloudflare.com/workers/platform/limits/ (2026-09-03) |
| Workers CPU per HTTP request | 10 ms (I/O wait excluded) | Error 1102, single request terminated | Same as above |
| Workers CPU per Cron trigger | 10 ms; 15 min wall time | Error 1102 for that tick | Same as above |
| Workers memory | 128 MB per isolate | Error 1102 | Same as above |
| Subrequests per invocation | 50 (includes D1/KV/fetch/Cache calls) | Further calls fail | Same as above |
| Simultaneous outgoing connections | 6 waiting for headers | 7th queued | Same as above |
| Env vars | 64/Worker, 5 KB each | Deploy rejected | Same as above |
| Worker size | 3 MB gzip | Deploy rejected | Same as above |
| Workers per account | 100 | Must reuse/consolidate | Same as above |
| Cron triggers per account | 5 | R1 uses 1 (production cleanup) | Same as above |
| Static Assets files | 20,000/version, 25 MiB/file; `_headers` 100 rules; `_redirects` 2,100 total | Deploy rejected | Same as above; billing page (2026-04-23) |
| Static asset requests | Free and unlimited; no storage charge | N/A | https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/ (2026-04-23) |
| `run_worker_first` caveat | Matching patterns always invoke Worker; over-quota returns 429 instead of falling back to assets | 429 | Same as above |
| D1 rows read | 5,000,000/day, resets midnight UTC | Queries fail until reset; email alert; stored data unaffected | https://developers.cloudflare.com/d1/platform/pricing/ (2026-04-21); enforcement changelog 2026-09-01 |
| D1 rows written | 100,000/day, resets midnight UTC | Same as above | Same as above |
| D1 storage | 5 GB total per account | Inserts/DDL blocked until cleanup | Same as above |
| D1 databases | 10 max (Free) | R1 uses 1 production + disposable preview/local | https://developers.cloudflare.com/d1/platform/limits/ (2026-04-21) |
| D1 max database size | 500 MB (Free) | Must clean up / split before limit | Same as above |
| D1 queries per Worker invocation | 50 (Free) | Excess fails | Same as above |
| D1 Time Travel | 7 days (Free) | Point-in-time recovery window only | Same as above |
| D1 concurrency | Single-threaded per database; excess queued then `overloaded` error | Retry with backoff; keep transactions short | Same as above (FAQ) |
| D1 simultaneous connections | 6 per Worker invocation | 7th queued | Same as above |
| Turnstile Free | $0; up to 20 widgets; unlimited challenges; 10 hostnames/widget; 7-day analytics; pre-clearance yes; no ephemeral IDs/offlabel | Widget/hostname cap blocks new widgets only | https://developers.cloudflare.com/turnstile/plans/ (2026-08-14) |
| Workers Logs Free | 200,000 events/day; 3-day retention | 1% sampling applied after cap | https://developers.cloudflare.com/workers/observability/logs/workers-logs/ (2026-08-11) |

No R2, Queues, Durable Objects, KV, Hyperdrive, or paid service is required for R1 per ADR-0002.

## 2. Routing and bindings

### 2.1 Routing

- `/api/*` and one documented operational route (e.g. `/api/health`) invoke the Worker. Fail mode: **fail-closed** (return 1027/429/503 with stable error, never serve cross-workspace data).
- All other paths serve Static Assets without invoking the Worker. Do **not** enable `run_worker_first` for asset patterns; it converts free asset hits into billed Worker invocations and returns 429 instead of assets when over quota.
- No SSR, no per-page function invocation, no background polling. The client calls `/api/*` only for dynamic state (catalog, detail, session, checkout, bookings, workspace provision/reset).

### 2.2 Bindings (per environment)

| Binding | Type | Local | Preview | Production |
| --- | --- | --- | --- | --- |
| `DB` | D1 | Local Wrangler D1 state | Disposable preview D1 (recreated per PR or shared preview) | Single production D1, all rows scoped by trusted `workspace_id` |
| `SESSION_SECRET` | Secret | Local dev secret | Preview secret | Production secret (rotation = issue #8) |
| `WORKSPACE_SECRET` | Secret | Local dev secret | Preview secret | Production secret for signed workspace context |
| `TURNSTILE_SECRET` | Secret | Dummy/disabled | Preview widget secret | Production widget secret |
| Cron trigger | Schedule | Manual `scheduled` test endpoint | Disabled | 1 daily trigger (of 5/account), e.g. `30 0 * * *` UTC |
| Observability | Setting | `enabled: true`, full sampling | `enabled: true`, full sampling | `enabled: true`, sampled (see §7) |

One production D1 database (not per-workspace databases): the Free plan allows only 10 databases, and per-workspace databases would exhaust that cap and duplicate seed reference data. Workspace isolation is by `workspace_id` column derived from the signed context/session, never from request payloads (BR-ACC-002).

## 3. Per-operation budgets (estimates; validated in #6/#7/#11)

Assumes indexed access on `(workspace_id, …)` and the R1 seed (`r1-v1`: 2 venues, 5 events, ≤3 sessions, ≤4 ticket types, 2 interactive accounts + 1 fixture identity, 2 seeded bookings). Row counts are billed rows scanned/written, so every filter column must be indexed.

| Operation | Worker reqs | D1 queries | Rows read | Rows written | Notes |
| --- | --- | --- | --- | --- | --- |
| Catalog list `GET /api/events` | 1 | 1–2 | ≤ 30 | 0 | Compact paginated response; no N+1 |
| Event detail `GET /api/events/:slug` | 1 | 2–3 | ≤ 50 | 0 | Event + sessions + ticket types in bulk selects |
| Sign-in `POST /api/session` | 1 | 2 | ≤ 5 | 1 (session) | Password-hash CPU must be measured for 10 ms budget (issue #8 risk) |
| Sign-out `DELETE /api/session` | 1 | 1–2 | ≤ 3 | 1 | Session invalidate |
| Checkout `POST /api/checkout` | 1 | ≤ 8 (one batch) | ≤ 30 | ≤ 8 (booking + item + payment outcome + capacity update + idempotency record) | Single D1 batch/transaction; must stay under 50 queries/invocation |
| Booking list `GET /api/bookings` | 1 | 1–2 | ≤ 20 | 0 | Newest-first, paginated |
| Booking detail `GET /api/bookings/:ref` | 1 | 2 | ≤ 10 | 0 | Ownership check inside query, not post-filter |
| Workspace provision | 1 | ≤ 10 (batched) | ≤ 10 | ≤ 45 | Seed accounts + capacity + metadata in batches |
| Workspace reset | 1 | ≤ 12 (batched) | ≤ 30 | ≤ 60 (delete + re-seed) | Scoped `WHERE workspace_id = ?` only; never global |
| Cron cleanup tick | 1 Cron | ≤ 20 | ≤ 500 | ≤ 500 | Paginated: scan expired batch, delete in chunks; next tick continues |

Why this fits: Worker requests (100k/day) bind before D1 reads (5M/day) for this workload. Writes (100k/day) are the abuse-sensitive budget: one abusive client provisioning/resetting in a loop can consume thousands of writes per minute, hence §5 rate limits. Reference day: 500 active learners × 50 API calls = 25,000 Worker reqs; ≈ 600k rows read; ≈ 30k rows written — inside all three daily caps with headroom for cleanup and retries. Storage: one workspace seed is < 100 KB; 10,000 retained workspaces ≈ < 1 GB of the 5 GB account cap and far under the 500 MB single-DB cap only if cleanup runs — expiration deletion is therefore a correctness requirement, not an optimization.

Hard constraints for detailed design: no endpoint may exceed 8 D1 queries or 10 ms CPU at p99; checkout batch must be atomic (BR-BKG-003) without exceeding the 50-query invocation cap; cleanup tick must finish useful work within 10 ms CPU by paginating (wall time allows 15 min, CPU does not).

## 4. Scheduled expiration cleanup

- One production Cron trigger, daily (e.g. `30 0 * * *` UTC). Uses 1 of 5 account triggers; preview/local have none.
- Each tick: `SELECT` a bounded batch of workspaces with `last_active_at < now - 7 days` via index (never a full table scan), then delete/mask their mutable rows in chunks (`DELETE … WHERE workspace_id = ? LIMIT n` loop), updating a cleanup cursor so the next tick resumes.
- Successful `/api/*` requests with a valid signed workspace context update `last_active_at`; static asset hits and rejected requests do not (BR-WSP-001). Reset counts as activity.
- Cron CPU is 10 ms on Free: handler does minimal deserialization, no password hashing, no JSON pretty-printing, no full-catalog reads. Large backlogs drain over multiple ticks; this is by design.
- Cleanup progress and per-tick deleted-workspace/row counts are logged as one structured summary line (no personal data).

## 5. Abuse controls (provisioning/reset/auth)

D1 writes and Worker requests share one account quota across production and preview, so unauthenticated writes are the primary abuse surface (R-001):

- Rate-limit by IP + route: provision (e.g. 10/hour/IP), reset (e.g. 20/hour/workspace, 30/hour/IP), sign-in failures (e.g. 10/10 min/IP with backoff). Limits are illustrative; final values in issue #8 with config (not code) changes.
- Over-limit response: `429` with `Retry-After` and a stable error code (no stack traces, no quota internals).
- Provision/reset responses include no cross-workspace existence signals.
- Preview environment uses a separate D1 database so load testing never consumes production write quota.
- Password verification cost is a CPU risk under the 10 ms cap: issue #8 must benchmark the chosen hash in a Worker (isolate, cold and warm) and set work-factor/iteration budgets accordingly; seeded passwords stay hashed at rest per TEST-DATA.

## 6. Turnstile trigger conditions

Turnstile Free imposes no verification-request quota (unlimited challenges; 20 widgets; 10 hostnames/widget), so Turnstile is an abuse brake, not a quota risk:

- **Off by default** on catalog, event detail, sign-in, checkout, and booking reads to preserve UX, CPU, and test automatability.
- **Armed** only when: (a) provision/reset rate limiter fires repeatedly for an IP, or (b) sign-in failure backoff is exceeded. Then the next provision/reset response requires a Turnstile token for that IP before the write executes.
- Widgets: 1 production + 1 preview (of 20). Hostnames: production `workers.dev` host + preview host + local excluded via dummy pass (of 10/widget).
- Verification is one server-side subrequest; it counts toward the 50-subrequest invocation budget — verify once per challenged action, cache the pass for a short window (e.g. 10 min/IP), never per API call.

## 7. Monitoring (inside free observability)

- Workers Logs Free: 200,000 events/day, 3-day retention. Production sets `head_sampling_rate < 1` (e.g. 0.1–0.25, tuned after launch) with **always-log** for 4xx/5xx, checkout conflict/decline, provision/reset rejection, D1-limit errors, and cleanup summaries. Invocation logs stay on; per-row debug logging stays off.
- Track per database via D1 `meta.rows_read/rows_written` and dashboard Metrics → Row Metrics; alert (dashboard + email) at 70% and 90% of daily read/write/request budgets.
- Track Worker Metrics → Errors → Invocation Statuses for `exceededCpu`, `exceededMemory`, and 1027 request-cap events.
- Log schema: correlation ID, route, status, duration/CPU ms, workspace pseudonym (hash, not ID), stable error code. Never log passwords, session tokens, cookies, Turnstile tokens, or payment simulation codes (NFR-006).

## 8. Quota-exhaustion behavior (explicit)

| Exhausted limit | User-visible behavior | Invariants preserved |
| --- | --- | --- |
| Worker 100k req/day | `/api/*` returns stable `service_unavailable_retry_later` (429/503 + `Retry-After` to midnight UTC); static assets keep serving | No partial booking; catalog page renders shell with retry state |
| Worker CPU 10 ms on one request | That request returns stable `service_unavailable_retry_later` (1102 mapped, never raw); rest of traffic unaffected | Validation failure consumes no capacity (BKG-002) |
| D1 rows read/write cap | API returns stable `service_unavailable_retry_later`; `Retry-After` to midnight UTC; email alert to operator | Checkout batch rolls back; no confirmed booking without payment success (BR-BKG-002/003) |
| D1 storage 5 GB / DB 500 MB | Writes return stable `storage_full_retry_later`; cleanup prioritized; operator deletes stale preview DBs first | Reads keep serving; existing bookings remain retrievable |
| D1 per-DB overload (queue full) | Checkout/list return stable conflict/retry error with backoff; concurrency test in #11 proves no overbooking | Capacity never exceeded (R-002); idempotency key safe to retry |
| Turnstile outage | Challenged provision/reset fail closed with retry-later; normal (unchallenged) routes unaffected | No workspace created half-seeded (WSP-004) |
| Logs cap | Sampling drops to 1%; error logs preserved by priority | No product behavior change |

Fail-closed applies to every `/api/*` route: when in doubt the API errors rather than serving or mutating another workspace's data.

## 9. What this unlocks and what remains

- Proves NFR-001 on current published limits: static client + narrowly routed Worker + single D1 + 1 Cron + conditional Turnstile needs no VPS and no paid Worker plan at R1 scale.
- Issues #6/#7/#8 must now: keep every query indexed and counted against §3; define the canonical idempotency fingerprint and retention (R-005); benchmark password hashing under 10 ms CPU; specify secret rotation; keep preview D1 disposable.
- Issue #11 must verify: request/row budgets per endpoint from live `meta`, concurrent-checkout no-overbook proof, reset/provision isolation under load, cleanup drain over multiple ticks, and all §8 exhaustion paths returning stable errors.

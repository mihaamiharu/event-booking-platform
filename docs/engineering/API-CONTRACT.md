# R1 Public API Contract

**Status:** Ready for review
**Version:** 0.3
**Scope:** Issues #7, #66, and #69 — stable HTTP operations for attendee booking and organizer event management
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
- `correlationId` is present on 409/422/429/5xx and on auth failures for operator lookup; the same opaque request ID is returned as `x-correlation-id` and is searchable in structured logs. Never include stack traces, SQL, secrets, tokens, or cross-workspace existence clues.
- Validation failures create no booking and consume no capacity.

### 1.3 Context and authorization

- Workspace context: signed `ebp_workspace` cookie set by provision, required on every `/api/*` operation except `POST /api/workspaces/provision` and `GET /api/health`. Missing/invalid → `WORKSPACE_REQUIRED` (401); expired → `WORKSPACE_EXPIRED` (410).
- Attendee session: HTTP-only `ebp_session` cookie set by sign-in. Protected operations (§3.4, §3.5 including cancellation, `POST /api/workspaces/reset` optional per §3.1) without a valid session → `AUTH_REQUIRED` (401).
- Ownership is enforced inside SQL (`workspace_id`, `user_id`); not-found and not-owned return the same `*_NOT_FOUND` code (non-enumerating).

### 1.4 Pagination

List responses use `?page=` (1-based, default 1) and `?perPage=` (default 20, max 50):

```json
{ "data": [ … ], "pagination": { "page": 1, "perPage": 20, "total": 42 } }
```

### 1.5 Row-budget envelope (`meta`)

Successful JSON responses carry `{ "meta": { "rows_read": n, "rows_written": m } }`
reporting D1 billed rows for that operation (204 responses carry no body and
therefore no envelope). Tests assert the S8-reconciled ceilings from the
usage model; a ceiling breach files against the offending query with its
`EXPLAIN QUERY PLAN`.

### 1.6 Test-support boundaries

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
| `BKG-006` | `POST /api/bookings/:reference/cancel` |
| `BKG-007` | `GET /api/bookings`, `GET /api/bookings/:reference`, `POST /api/bookings/:reference/cancel` |
| `PAY-001` | `POST /api/checkout` (`paymentCode` field) |
| `WSP-001` | All operations (workspace scoping); `GET /api/workspaces/status` |
| `WSP-002` | `POST /api/workspaces/reset` |
| `WSP-003` | `GET /api/workspaces/status`, expiry codes |
| `WSP-004` | `POST /api/workspaces/provision` |
| `ORG-001` | `POST /api/session` role response; `GET/POST/PUT /api/organizer*` authorization |
| `ORG-002` | `GET /api/organizer`, `POST /api/organizer/events`, `PUT /api/organizer/events/:id` |
| `ORG-003` | `POST /api/organizer/events`, `PUT /api/organizer/events/:id`, public event reads |
| `NFR-011` | All organizer writes and workspace-scoped organizer reads |

## 3. Operations

### 3.1 Workspaces

**`POST /api/workspaces/provision`** — create or reuse the caller's workspace (WSP-004). No workspace context required. JSON body required. Rate-limited (→ `WORKSPACE_RATE_LIMITED`, 429 + `Retry-After`). An IP armed by repeated rate-limit hits must instead present a challenge token (`{ "turnstileToken": "…" }`, → `TURNSTILE_REQUIRED`, 403 without one).

```json
// Response 200
{ "workspace": { "status": "ACTIVE", "seedVersion": "r1-v1",
  "seedReferenceAt": "2026-09-04T00:00:00Z",
  "expiresAt": "2026-09-11T00:00:00Z" } }
```

Sets `ebp_workspace`. Reuse path returns the existing active workspace unchanged. Failure to seed fully → `WORKSPACE_PROVISION_FAILED` (503), never a partial workspace.

**`GET /api/workspaces/status`** — workspace required. Returns the provision shape plus `lastActiveAt`. Expired context → `WORKSPACE_EXPIRED` (410) with guidance to provision anew.

**`POST /api/workspaces/reset`** — workspace required, session optional. Body: `{ "confirm": true }` (`confirm: true` required, else `VALIDATION_FAILED`). Rate-limited. An armed IP additionally sends `{ "confirm": true, "turnstileToken": "…" }` (→ `TURNSTILE_REQUIRED`, 403 without one). Success 200 returns the provision shape with a new `seedReferenceAt` plus `{ "reset": { "seedVersion": "r1-v1" } }`. Incomplete restore → `WORKSPACE_RESET_FAILED` (500).

### 3.2 Session

**`POST /api/session`** — workspace required. Body `{ "email": "alex.attendee@example.test", "password": "Attend123!" }`. Success 200 sets `ebp_session` and returns `{ "attendee": { "email": "…", "displayName": "Alex" }, "role": "ATTENDEE" }`; the seeded organizer returns `"role": "ORGANIZER"`. Bad credentials → `AUTH_INVALID_CREDENTIALS` (401, one non-enumerating message). Throttled → `AUTH_RATE_LIMITED` (429).

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

**`GET /api/bookings/:reference`** — full booking shape (§3.4) plus event/session/ticket names. Foreign or missing reference → `BOOKING_NOT_FOUND` (404). The response includes the stored `bookingStatus` and nullable `cancelledAt`; cancelled records remain readable.

**`POST /api/bookings/:reference/cancel`** — cancel an attendee-owned confirmed booking before its session starts (BKG-006/007). The request body is `{}` and must be JSON. Success returns 200:

```json
{ "data": {
    "reference": "BKG-7F3QXA",
    "bookingStatus": "CANCELLED",
    "cancelledAt": "2026-09-04T10:02:00Z",
    "releasedQuantity": 2
  } }
```

The transition and shared session-capacity release execute as one logical write. `BOOKING_ALREADY_CANCELLED` (409) is returned for a repeat attempt without another release; `BOOKING_CANCELLATION_CLOSED` (409) is returned once the session has started or the record is otherwise non-confirmed; `BOOKING_CANCELLATION_CONFLICT` (409) asks the client to refresh after an unexpected concurrent state change. Missing and foreign references return `BOOKING_NOT_FOUND` (404), and no body ownership field is accepted.

### 3.6 Operational

**`GET /api/health`** — no context required. `{ "status": "ok", "seedVersion": "r1-v1" }`. Never exposes quota internals.

**`GET /api/qa/config`** — no workspace context required. Returns the
deployment-safe cockpit gate and configured external evidence links:

```json
{
  "enabled": true,
  "environment": "local",
  "logViews": {
    "cloudflare": "https://configured.example/logs",
    "grafana": "https://configured.example/explore"
  }
}
```

`logViews` contains only configured credential-free HTTP(S) URLs and omits
unset or invalid values. Local and preview enable the cockpit unless
`QA_OBSERVABILITY_ENABLED=false`; production is disabled unless that variable
is explicitly `true`. This endpoint never returns credentials, cookies,
workspace identifiers, raw logs, or exercise payloads.

### 3.7 Organizer event management (organizer session required)

**`GET /api/organizer`** — returns workspace venues and all workspace events, including draft status, session room capacity/confirmed quantity, and ticket types. Missing session → `AUTH_REQUIRED` (401); attendee session → `ORGANIZER_FORBIDDEN` (403). No workspace-owned rows are returned across workspace boundaries.

**`POST /api/organizer/events`** — creates one event with nested sessions and ticket types. The body is:

```json
{ "name": "Room-aware workshop", "description": "…", "venueId": "venue-id",
  "salesOpenAt": "2026-09-10T00:00:00Z", "salesCloseAt": "2026-10-10T23:59:00Z",
  "sessions": [{ "startAt": "2026-10-15T02:00:00Z", "endAt": "2026-10-15T05:00:00Z", "capacity": 30 }],
  "ticketTypes": [{ "sessionIndex": 0, "name": "General", "priceIdr": 75000 }],
  "publish": false }
```

The server generates event/session/ticket IDs, stores `DRAFT` when `publish` is false, and returns 201 with the full organizer event view. `publish: true` runs the publication gate first.

**`PUT /api/organizer/events/:id`** — replaces the submitted event/session/ticket configuration in one atomic nested write. Existing child IDs may be retained; omitted children are removed only when booking history permits. `publish: true` sets `PUBLISHED`; false saves `DRAFT`. Foreign/missing event IDs → `EVENT_NOT_FOUND` (404). Publication and field failures use the stable organizer error catalog.

## 4. Quota-exhaustion mapping

Per the usage model §8, Worker-request, CPU, and D1 row/storage exhaustion all surface as `SERVICE_UNAVAILABLE` (503, `Retry-After` to midnight UTC where applicable) or `STORAGE_FULL` (503) for the storage cap — never raw 1027/1102/D1 errors, never partial bookings.

## 5. Examples traceability

Checkout success/decline/invalid-code, idempotent replay/conflict, empty catalog/bookings, foreign-booking 404, and expired-workspace 410 examples above are the contract fixtures issues #10 (UI) and #11 (test strategy) must reuse.

## 6. Stable error codes (adopts the product error catalog plus lifecycle additions)

All catalog codes are adopted unchanged with their HTTP categories. Approved additions (required by the usage model and rate-limit design; the error catalog is updated in this same change):

| Code | HTTP | Meaning |
| --- | --- | --- |
| `AUTH_RATE_LIMITED` | 429 | Sign-in throttling tripped; retry with backoff |
| `SERVICE_UNAVAILABLE` | 503 | Quota/CPU/overload retry-later; includes `Retry-After` where known |
| `STORAGE_FULL` | 503 | Database storage cap reached; reads unaffected |
| `WORKSPACE_PROVISION_FAILED` | 503 | Provisioning could not complete; no partial workspace |
| `TURNSTILE_REQUIRED` | 403 | Armed IP must complete a challenge before provision/reset writes |
| `BOOKING_ALREADY_CANCELLED` | 409 | The attendee's booking has already been cancelled; capacity is unchanged |
| `BOOKING_CANCELLATION_CLOSED` | 409 | The booking can no longer be cancelled because its session has started or its state is closed |
| `BOOKING_CANCELLATION_CONFLICT` | 409 | Booking state changed while cancellation was being attempted; refresh and retry |
| `ORGANIZER_FORBIDDEN` | 403 | Authenticated user lacks the organizer role |
| `EVENT_NAME_INVALID` / `EVENT_DESCRIPTION_INVALID` | 400 | Event text is missing or exceeds the documented bounds |
| `VENUE_REQUIRED` / `VENUE_INVALID` | 400 | Event venue is missing or not in the active workspace |
| `SESSION_REQUIRED` / `SESSION_INVALID` | 400 | Session time or room-capacity configuration is invalid |
| `SESSION_OVERLAP` | 409 | Submitted sessions overlap |
| `TICKET_LIST_INVALID` / `TICKET_INVALID` | 400 | Ticket configuration is malformed or not workspace-owned |
| `SALES_WINDOW_INVALID` | 400 | Sales opening and closing times are invalid |
| `TICKET_REQUIRED` | 400 | Publication requires at least one ticket type |
| `PUBLICATION_INVALID` | 409 | Publication requires a future scheduled session and open sales window |
| `CAPACITY_INVALID` | 400 | Capacity is invalid or below confirmed quantity |
| `CAPACITY_IN_USE` / `SESSION_IN_USE` / `TICKET_IN_USE` | 409 | Existing booking history prevents destructive configuration change |

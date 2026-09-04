# Release 1 Business Rules

**Status:** Ready for review
**Release:** R1 — Attendee Booking

These rules refine the PRD without replacing its requirements. Each rule must remain traceable to implementation and verification evidence.

## Identity and ownership

### BR-ACC-001 — Seeded identity

Each learner workspace contains at least one documented attendee account. The same documented credential values may be reused in different workspaces because the workspaces isolate their mutable records.

### BR-ACC-002 — Trusted ownership

The server derives attendee and workspace ownership from the authenticated session. A request cannot choose ownership through a body, query, or path value.

## Event discovery

### BR-EVT-001 — Public discovery

An event appears in the public catalog only when its status is `PUBLISHED` and it has at least one future session.

### BR-EVT-002 — Bookable session

A session is bookable only when all of the following are true:

- its event is `PUBLISHED`;
- its status is `SCHEDULED`;
- its sales window is open;
- its start time is in the future; and
- its remaining capacity is greater than zero.

### BR-EVT-003 — Shared session capacity

All ticket types belonging to one session consume the same session capacity. Ticket-type availability cannot make total confirmed quantity exceed session capacity.

### BR-EVT-004 — Event status vocabulary

R1 seed and read behavior recognize:

- `DRAFT`: not publicly discoverable;
- `PUBLISHED`: eligible for public discovery when a future session exists; and
- `CANCELLED`: not publicly discoverable or bookable.

R1 does not expose a status-changing organizer operation.

### BR-EVT-005 — Session status vocabulary

R1 recognizes `SCHEDULED`, `CANCELLED`, and `COMPLETED`. Only `SCHEDULED` can be bookable, subject to time, sales-window, and capacity rules.

## Ticket selection and price

### BR-TKT-001 — Quantity boundary

One R1 checkout accepts one ticket type and an integer quantity from 1 through 5 inclusive.

### BR-TKT-002 — Authoritative total

The server calculates subtotal as authoritative unit price multiplied by quantity. Prices are non-negative integer Indonesian rupiah values. R1 has no fractional amount, tax, booking fee, discount, or currency conversion.

User-facing amounts identify IDR and use Indonesian thousands grouping with no decimal digits. Formatting never changes the authoritative stored integer.

### BR-TKT-003 — Immutable booking price

A confirmed booking stores a unit-price snapshot. A later ticket-price change does not alter an existing booking.

## Checkout and booking

### BR-BKG-001 — Final validation

Checkout revalidates event, session, ticket type, sales window, price, and remaining capacity immediately before confirmation.

### BR-BKG-002 — Confirmation boundary

Capacity is consumed only when simulated payment succeeds and the booking becomes `CONFIRMED`. Declined or invalid payment input consumes no capacity.

### BR-BKG-003 — Atomic outcome

Booking, booking item, successful payment result, and capacity consumption form one logical success. A partial confirmed state is invalid.

### BR-BKG-004 — Idempotent retry

The same attendee repeating checkout with the same idempotency key and equivalent request receives the original outcome. Reusing the key with different booking input is rejected.

### BR-BKG-005 — Booking privacy

An authenticated attendee may list or retrieve only bookings owned by their attendee identity and learner workspace.

### BR-BKG-006 — R1 booking state

R1 creates a booking only when it can immediately become `CONFIRMED`. Decline and validation outcomes do not create pending or failed booking records. Booking cancellation is not available.

## Payment simulation

### BR-PAY-001 — Success

`SIMULATE-SUCCESS` produces the success branch when all booking rules pass.

### BR-PAY-002 — Decline

`SIMULATE-DECLINE` produces a payment-declined outcome and no confirmed booking.

### BR-PAY-003 — Invalid code

Any other payment simulation value produces an input-validation error rather than a payment decline.

### BR-PAY-004 — Payment outcome vocabulary

The simulator produces `SUCCEEDED` or `DECLINED`. A validation error occurs before a payment outcome exists. The simulator input itself is not persisted.

## Workspace lifecycle

### BR-WSP-001 — Inactivity

A workspace is inactive when seven consecutive 24-hour periods pass without a successful API request associated with its valid signed workspace context. An attendee session is not required. Static asset requests and rejected requests do not update activity.

### BR-WSP-002 — Expiration

Expired workspace state is not restored. A returning visitor receives or creates a new deterministic workspace.

### BR-WSP-003 — Reset

Reset replaces the active workspace's mutable data with the documented seed state and does not change any other workspace.

## Time and sales windows

### BR-TIM-001 — R1 time zone

Every R1 venue, event, and session uses the IANA time zone `Asia/Jakarta`. User-facing event times display the `WIB` zone label. Persisted instants use UTC.

### BR-TIM-002 — Server-authoritative current time

The server's current time determines whether a sales window is open and whether a session is in the future. A client clock cannot make a session bookable.

### BR-TIM-003 — Sales-window boundary

A sales window is open when `sales_open_at <= now < sales_close_at` and `now < session_start_at`. The opening instant is included; the closing and session-start instants are excluded.

## Language

### BR-LNG-001 — R1 language

R1 user-facing content is English only. Human-readable text is not used as a persistent identifier or authorization input.

## Rules deferred beyond R1

- Localization and language selection.
- Multi-currency, conversion, tax, and booking fees.
- Venue-specific time zones and daylight-saving transitions.
- Cancellation, refunds, temporary ticket holds, and waitlists.

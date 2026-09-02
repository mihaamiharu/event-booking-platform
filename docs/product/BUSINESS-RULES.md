# Release 1 Business Rules

**Status:** Draft
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

## Ticket selection and price

### BR-TKT-001 — Quantity boundary

One R1 checkout accepts one ticket type and an integer quantity from 1 through 5 inclusive.

### BR-TKT-002 — Authoritative total

The server calculates subtotal as authoritative unit price multiplied by quantity. R1 has no tax, booking fee, discount, or currency conversion.

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

## Payment simulation

### BR-PAY-001 — Success

`SIMULATE-SUCCESS` produces the success branch when all booking rules pass.

### BR-PAY-002 — Decline

`SIMULATE-DECLINE` produces a payment-declined outcome and no confirmed booking.

### BR-PAY-003 — Invalid code

Any other payment simulation value produces an input-validation error rather than a payment decline.

## Workspace lifecycle

### BR-WSP-001 — Inactivity

A workspace is inactive when seven consecutive 24-hour periods pass without a successful authenticated API request.

### BR-WSP-002 — Expiration

Expired workspace state is not restored. A returning visitor receives or creates a new deterministic workspace.

### BR-WSP-003 — Reset

Reset replaces the active workspace's mutable data with the documented seed state and does not change any other workspace.

## Unresolved business rules

- The R1 currency and its formatting rules.
- Whether session times use one platform time zone or each venue's named time zone.
- Exact event and session sales-window boundary semantics at the closing instant.

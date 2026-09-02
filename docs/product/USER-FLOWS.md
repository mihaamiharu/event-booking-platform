# Release 1 User Flows

**Status:** Draft
**Release:** R1 — Attendee Booking

## UF-001 — Enter a learner workspace

**Actor:** Visitor
**Outcome:** The visitor has an active isolated workspace and can use the target product.

1. The visitor opens the public target website.
2. The application checks for a valid signed workspace context.
3. If none exists, the application provisions a deterministic workspace subject to abuse controls.
4. The application stores only the signed workspace context needed to identify subsequent API requests.
5. The visitor sees the normal product entry experience.

Alternate outcomes:

- An expired context leads to a new workspace rather than restoration.
- A provisioning rate limit produces an explicit retry-later result.
- A workspace reset returns this workspace to documented seed state.

Requirements: `WSP-001`, `WSP-002`, `WSP-003`, `WSP-004`

## UF-002 — Sign in as an attendee

**Actor:** Attendee
**Outcome:** A valid attendee session is established.

1. The attendee opens sign-in.
2. The attendee enters the documented seeded credentials.
3. The platform verifies the credential within the active workspace.
4. The platform establishes an HTTP-only session.
5. The attendee is returned to the product without losing their intended destination.

Alternate outcomes:

- Invalid credentials show a stable error and create no session.
- An expired workspace requires a new workspace before sign-in can succeed.
- Signing out invalidates the session.

Requirement: `ACC-001`

## UF-003 — Discover a bookable event

**Actor:** Attendee
**Outcome:** The attendee identifies an available session and ticket type.

1. The attendee browses the published event catalog.
2. The attendee opens an event.
3. The platform shows event, venue, session, ticket, price, and availability information.
4. The attendee chooses an available session and ticket type.

Alternate outcomes:

- An empty catalog shows an explicit empty state.
- A missing event shows a not-found outcome.
- An unavailable session remains visible when useful but cannot be selected.

Requirements: `EVT-001`, `EVT-002`

## UF-004 — Complete a successful booking

**Actor:** Authenticated attendee
**Outcome:** One confirmed booking exists and session capacity is reduced once.

1. The attendee selects a quantity from 1 through 5.
2. The platform displays authoritative ticket price, quantity, and subtotal.
3. The attendee enters `SIMULATE-SUCCESS`.
4. The attendee submits checkout with an idempotency key.
5. The server revalidates publication, schedule, ticket relationship, price, and capacity.
6. Simulated payment succeeds.
7. The platform commits the booking, booking item, payment result, and capacity consumption.
8. The attendee sees the unique booking reference and confirmation details.

Alternate outcomes:

- Invalid quantity or insufficient capacity creates no booking.
- A stale client price is ignored and cannot change the authoritative total.
- Retrying the same checkout does not duplicate the booking.

Requirements: `BKG-001`, `BKG-002`, `BKG-003`, `PAY-001`

## UF-005 — Receive a payment decline

**Actor:** Authenticated attendee
**Outcome:** The decline is observable and no booking or capacity consumption occurs.

1. The attendee completes a valid ticket selection.
2. The attendee enters `SIMULATE-DECLINE`.
3. The server validates the booking input.
4. The payment simulator returns a decline.
5. The platform displays a stable declined result.
6. The attendee may retry with a new checkout attempt.

Requirements: `BKG-002`, `PAY-001`

## UF-006 — View a confirmed booking

**Actor:** Authenticated attendee
**Outcome:** The attendee sees the durable record of their booking.

1. The attendee opens their booking list or follows the confirmation link.
2. The attendee selects a booking reference.
3. The platform authorizes the attendee and workspace.
4. The platform shows the event, session, ticket, quantity, unit price, total, payment status, and booking status.

Alternate outcomes:

- A missing or foreign booking returns the same stable not-found outcome.

Requirements: `BKG-004`, `BKG-005`

# Product Requirements Document

**Product:** Event Booking Platform  
**Release:** R1 — Attendee Booking  
**Status:** Draft  
**Version:** 0.1

## 1. Release objective

Release 1 provides a complete, persistent attendee booking journey for a published event. It establishes the product, API, and data contracts that later organizer, check-in, administration, and testing scenarios will extend.

## 2. Actors

### Attendee

An authenticated user who can browse public events and create or view bookings in their workspace.

### Platform

The system responsible for validating availability, calculating totals, simulating payment, persisting bookings, and returning observable results.

## 3. Functional requirements

### Accounts

#### ACC-001 — Attendee sign-in

The platform shall allow an attendee to sign in with a deterministic seeded account and establish a session scoped to the attendee's learner workspace.

Acceptance criteria:

- Valid credentials establish a session and identify the attendee.
- Invalid credentials do not establish a session and produce a stable, user-readable error.
- Session cookies are HTTP-only, secure in production, and scoped to the target application.
- Signing out invalidates the active session.

### Event discovery

#### EVT-001 — Published event catalog

The platform shall list upcoming published events available in the attendee's workspace.

Acceptance criteria:

- Draft, cancelled, and past events do not appear in the public catalog.
- Each result includes its name, date range, venue summary, starting price, and availability status.
- An empty catalog displays an explicit empty state rather than an error.

#### EVT-002 — Event details

The platform shall present the information required to decide whether to book an event.

Acceptance criteria:

- The page includes event description, venue, sessions, ticket types, prices, and remaining availability.
- Unavailable sessions and ticket types are visibly unavailable and cannot be selected.
- A missing or inaccessible event returns a stable not-found outcome.

### Booking

#### BKG-001 — Ticket selection

The platform shall allow an attendee to select one ticket type and a quantity from 1 through 5 for an available session.

Acceptance criteria:

- Quantity below 1 or above 5 is rejected.
- Quantity greater than remaining capacity is rejected.
- Price, quantity, and calculated subtotal are displayed before payment.

#### BKG-002 — Server-side booking validation

The platform shall revalidate all booking inputs when checkout is submitted.

Acceptance criteria:

- The server verifies the event is published and bookable.
- The server verifies the session and ticket type belong to the selected event.
- The server verifies the requested capacity is still available.
- The server calculates authoritative prices; client-provided totals are ignored.
- Validation failure creates no confirmed booking and consumes no capacity.

#### BKG-003 — Confirmed booking

Following successful simulated payment, the platform shall create one confirmed booking and reserve its capacity.

Acceptance criteria:

- A successful request returns a unique, human-readable booking reference.
- Booking, booking items, payment result, and capacity change are committed as one logical operation.
- Repeating the same checkout request with the same idempotency key does not create another booking or consume capacity twice.
- A confirmed booking belongs to the authenticated attendee and workspace.

#### BKG-004 — Booking detail

The platform shall allow an attendee to retrieve their confirmed booking.

Acceptance criteria:

- Booking detail shows reference, event, session, ticket type, quantity, price, total, payment status, and booking status.
- One attendee cannot retrieve another attendee's booking.
- A missing or inaccessible booking returns a stable not-found outcome without revealing whether it exists elsewhere.

### Simulated payment

#### PAY-001 — Deterministic payment simulation

The platform shall simulate payment without contacting a real payment provider.

Acceptance criteria:

- R1 provides a documented success input that confirms payment.
- A rejected input produces a stable payment-declined result.
- A declined payment creates no confirmed booking and consumes no capacity.
- No real card number or financial credential is requested or stored.

### Workspace lifecycle

#### WSP-001 — Isolated learner workspace

The platform shall isolate mutable data created by different learner workspaces.

Acceptance criteria:

- A workspace cannot access another workspace's accounts, bookings, or mutable inventory.
- Shared reference content may be reused without exposing mutable workspace data.
- Workspace identity cannot be changed by editing an ordinary request body field.

#### WSP-002 — Workspace reset

The platform shall restore an authorized workspace to deterministic seed state.

Acceptance criteria:

- Reset deletes only data belonging to the active workspace.
- Reset restores documented accounts, events, ticket types, and capacity.
- Reset is rate-limited and protected against automated abuse.

## 4. Non-functional requirements

### NFR-001 — Free-tier operation

The initial hosted product shall use Cloudflare free-plan services and shall not require a VPS or paid Worker plan.

### NFR-002 — Accessibility baseline

Core R1 workflows shall be operable by keyboard, expose appropriate names and roles, retain visible focus, and provide programmatically associated form guidance and errors.

### NFR-003 — Responsive operation

Core R1 workflows shall be usable at mobile and desktop viewport sizes without horizontal page overflow.

### NFR-004 — Stable API errors

Public API errors shall use a documented response shape and stable error code independent of human-readable message wording.

### NFR-005 — Traceability

Material product behavior, API operations, data entities, tests, and defects shall reference applicable requirement IDs.

## 5. Open questions

- What public product name replaces the working name?
- How long should an inactive learner workspace remain available?
- Should R1 allow self-registration, or only deterministic seeded accounts?
- Which simulated payment inputs should produce success and decline?
- Should the first deployment use a `workers.dev` hostname or an existing custom subdomain?


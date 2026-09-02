# Product Requirements Document

**Product:** Event Booking Platform
**Release:** R1 — Attendee Booking
**Status:** Draft
**Version:** 0.2

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
- Self-registration and password recovery are not available in R1.
- The seed-data specification documents the R1 credentials and expected account state.

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

#### BKG-005 — Attendee booking list

The platform shall allow an attendee to find their confirmed bookings after leaving the confirmation page.

Acceptance criteria:

- The list includes only confirmed bookings owned by the authenticated attendee and active workspace.
- Each result includes booking reference, event name, session start, quantity, total, and booking status.
- Results are ordered by booking creation time with the newest first.
- An attendee with no confirmed bookings sees an explicit empty state.
- Selecting a result opens its booking detail.

### Simulated payment

#### PAY-001 — Deterministic payment simulation

The platform shall simulate payment without contacting a real payment provider.

Acceptance criteria:

- The simulation code `SIMULATE-SUCCESS` produces a successful payment result.
- The simulation code `SIMULATE-DECLINE` produces a stable payment-declined result.
- Any other value is rejected as an invalid simulation code.
- A declined payment creates no confirmed booking and consumes no capacity.
- The interface clearly labels the field as a simulation code.
- No real card number, security code, expiry date, or financial credential is requested or stored.

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

#### WSP-003 — Workspace expiration

The platform shall expire a learner workspace after seven consecutive days without authenticated activity.

Acceptance criteria:

- Successful authenticated API activity updates the workspace's last-active time.
- Loading static assets alone does not extend workspace lifetime.
- Expired workspace data is unavailable and eligible for scheduled deletion.
- Returning after expiration creates or requests a new workspace rather than restoring expired mutable data.
- Resetting a workspace counts as authenticated activity.

#### WSP-004 — Workspace provisioning

The platform shall provide a deterministic learner workspace when a visitor first uses the dynamic target product.

Acceptance criteria:

- A valid existing signed workspace context is reused.
- When no valid context exists, the platform provisions documented seed state subject to rate limiting and abuse controls.
- Provisioning does not require a TestingWithEkki account.
- A provisioned workspace contains the documented attendee account, events, sessions, ticket types, and mutable capacity.
- A failure to provision produces an explicit retry-later result rather than a partially seeded workspace.

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

## 5. Accepted release decisions

- “Event Booking Platform” remains the working name until branding is selected.
- R1 uses deterministic seeded attendee accounts and does not provide self-registration.
- Learner workspaces expire after seven days without authenticated activity.
- Simulated payment accepts the documented `SIMULATE-SUCCESS` and `SIMULATE-DECLINE` codes.
- The first deployment uses a free `workers.dev` hostname.

See [Product Decisions](DECISIONS.md) for rationale and consequences.

## 6. Open discovery questions

- Which single currency does R1 display and calculate?
- Does R1 support one product-wide time zone or display each event in its venue time zone?
- What public product name replaces the working name?

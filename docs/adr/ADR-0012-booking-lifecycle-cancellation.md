# ADR-0012 — Preserve attendee booking history through cancellation

**Status:** Proposed
**Date:** 2026-09-10
**Decision owners:** Event Booking Platform maintainers
**Requirements:** BKG-006, BKG-007, NFR-010

## Context

R1 ends at a confirmed booking. A QA learning product needs a realistic lifecycle transition that changes shared inventory, exercises attendee/workspace ownership, and leaves a durable record for revisit and negative-path testing. The existing schema has a booking status but no cancellation timestamp or lifecycle write contract.

## Decision

Allow an authenticated attendee to cancel an attendee-owned `CONFIRMED` booking until the session's server-authoritative start instant. The booking remains in the database with `status = 'CANCELLED'` and `cancelled_at`; its item and successful payment attempt remain readable. The shared session counter is decremented by the booking quantity in the same D1 batch as the state transition.

The batch writes a unique internal `cancellation_id` to the booking first, then conditionally releases capacity only when that token is present. This makes a repeat or concurrent cancellation a no-op for inventory and allows the API to return a stable `BOOKING_ALREADY_CANCELLED` or conflict result. Missing and foreign references use the existing non-enumerating `BOOKING_NOT_FOUND` response.

## Alternatives considered

1. **Delete the booking and release capacity.** Rejected: it destroys audit/read-back state and turns a normal lifecycle transition into an existence oracle.
2. **Add a separate cancellation table and event-sourced counter.** Rejected for this slice: it adds schema and query surface without improving the R1 learner journey; a future audit/event release can introduce it deliberately.
3. **Update capacity and booking status in separate requests.** Rejected: partial transitions could create over-release or a cancelled booking that still consumes capacity.
4. **Support rescheduling in the same slice.** Rejected: rescheduling needs a destination-session contract, price/capacity semantics, and additional user-facing choices that are not required for cancellation coverage.

## Consequences

- Booking list/detail must display both confirmed and cancelled records.
- `0003_booking_cancellation.sql` is forward-only; reset seed behavior remains unchanged.
- Cancellation endpoint budgets stay within the existing free-plan D1 envelope.
- Refunds, organizer actions, email delivery, and rescheduling remain deferred.
- If future product requirements need a full audit trail, this ADR must be superseded rather than rewritten.

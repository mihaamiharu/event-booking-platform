# Product Personas

**Status:** Ready for review

Personas describe recurring user needs and risks. They are not seeded user records and do not imply collection of real personal information.

## R1 primary persona — Alya, attendee

### Context

Alya discovers workshops and community events from a phone or laptop. She wants to understand the schedule and total cost before committing. She may leave the page, return later, or retry when an operation fails.

### Goals

- Find an event that is actually open for booking.
- Compare session and ticket options without hidden fees.
- Know whether enough capacity remains for the requested group.
- Receive a durable booking reference after successful payment.
- Find the booking again after leaving confirmation.

### Needs

- Clear event, venue, time-zone, ticket, price, and availability information.
- Keyboard-accessible forms and understandable validation.
- Stable outcomes when checkout is retried.
- A decline that does not silently consume capacity.
- Privacy between her bookings and another attendee's bookings.

### Failure concerns

- Being charged or confirmed twice after retrying.
- Seeing stale availability.
- Reaching confirmation without a recoverable booking.
- Losing the intended event after sign-in.
- Seeing another attendee's booking details.

## Future persona — Raka, organizer

Raka creates events, defines sessions and ticket types, publishes accurate information, and monitors bookings. Organizer behavior begins after R1 but influences the event and session concepts established now.

## Future persona — Dewi, check-in staff

Dewi validates booking references at a venue, prevents duplicate check-in, and needs clear offline or service-failure handling. Check-in behavior begins after R1.

## Future persona — Platform administrator

The administrator handles user access, event governance, operational exceptions, and audit review. Administration begins after R1 and must not be treated as a shortcut around normal authorization.

## Operational actor — Learner workspace holder

The holder of a valid signed workspace context can provision or reset their isolated demo state. This is a public-environment capability, not a marketplace business role and not a TestingWithEkki identity.

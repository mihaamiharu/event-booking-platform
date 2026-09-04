# Product Brief

**Working name:** Event Booking Platform
**Status:** Ready for review
**Version:** 0.3
**Initial release:** R1 — Attendee Booking

## Product statement

The Event Booking Platform helps people discover and reserve places at events while giving event teams a reliable operational record of availability, bookings, and attendance.

It is a real, independently usable product and a documented system under test. The development history, requirements, releases, and defects are designed to support education without turning the application into a static mock.

## Primary users

### Attendee

Discovers events, reviews schedules and availability, reserves tickets, and views booking confirmation.

### Organizer

Creates and manages events, sessions, ticket types, and capacity. Organizer workflows begin after R1.

### Check-in staff

Validates tickets and records attendance. Check-in workflows begin after R1.

### Administrator

Manages platform access, event governance, and operational exceptions. Administration begins after R1.

## Initial problem

An attendee needs to understand what an event offers, determine whether a suitable session has capacity, reserve a valid number of tickets, complete a predictable simulated payment, and retain evidence of the booking.

## Product principles

1. Availability and pricing must be understandable before confirmation.
2. A confirmed booking must have durable, traceable state.
3. State transitions must have explicit rules and observable outcomes.
4. Test data and failure scenarios must be deterministic.
5. The hosted application must not require paid infrastructure during the nonprofit phase.

## R1 outcome

Given a published event with an available session, an attendee can reserve tickets through simulated payment and later retrieve an accurate booking record.

## R1 delivery decisions

- The public brand remains undecided; “Event Booking Platform” is the working name.
- R1 uses deterministic seeded attendee accounts rather than self-registration.
- A learner workspace expires after seven days without successful dynamic activity from its valid signed context.
- Payment uses explicit success and decline simulation codes, never card data.
- The first public deployment uses a free `workers.dev` hostname.
- R1 prices are integer Indonesian rupiah values displayed as IDR.
- R1 event and session times use `Asia/Jakarta` and display WIB.
- R1 user-facing content is English only.

The rationale and consequences are recorded in [Product Decisions](DECISIONS.md).

## Measures of completion

- The primary attendee journey works against a deployed Cloudflare environment.
- Product behavior is documented with stable requirements and acceptance criteria.
- Public UI and API contracts agree with persisted D1 state.
- Seed and reset operations create deterministic learner workspaces.
- The product can be used independently of any course or learning platform.

## R1 success signals

- A first-time visitor can reach a published event without account registration.
- A seeded attendee can complete the primary booking flow without facilitator intervention.
- The same valid checkout retry cannot create a duplicate booking.
- Capacity, booking, and payment outcomes agree across the UI, API, and persisted state.
- Reset returns the active workspace to the documented seed state.
- No product operation exposes another workspace's mutable data.
- The public deployment remains within Cloudflare's free-plan limits under the documented usage controls.

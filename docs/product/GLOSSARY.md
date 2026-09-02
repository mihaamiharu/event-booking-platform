# Domain Glossary

This glossary gives product terms one stable meaning across requirements, design, APIs, tests, and defects.

## Attendee

An authenticated user who discovers events and owns bookings inside one learner workspace.

## Availability

Whether a session can currently accept a requested ticket quantity under its publication, schedule, sales-window, and capacity rules.

## Booking

The durable record of an attendee's confirmed reservation for one ticket type, session, and quantity. R1 does not use “order” as a synonym.

## Booking reference

A unique, human-readable identifier shown to an attendee and safe to use in support or operational communication. It is not proof of authorization.

## Currency

R1 uses Indonesian rupiah, identified as IDR. Authoritative amounts are non-negative integers with no fractional digits.

## Capacity

The maximum number of attendees that one session may accept across all of its ticket types.

## Event

The public experience being offered, such as a workshop, conference, or community meetup. An event contains one or more scheduled sessions.

## Idempotency key

A client-generated value that allows a checkout request to be retried without creating a second booking or consuming capacity twice.

## Learner workspace

An isolated, resettable collection of mutable target-product data. A workspace is an operational boundary for the public training environment, not a TestingWithEkki account.

## Workspace activity

A successful dynamic API request associated with a valid signed learner-workspace context. An attendee session is not required. Static asset requests and rejected API requests do not count.

## Payment simulation code

A documented non-financial input that deterministically selects a simulated payment outcome.

## Published event

An event approved for public discovery. Publication alone does not guarantee that every session is bookable.

## Remaining capacity

Session capacity minus the quantity held by confirmed bookings in the same workspace. R1 has no temporary reservation or payment-pending hold.

## Seed data

The documented accounts, events, sessions, ticket types, and mutable state created when a learner workspace is provisioned or reset.

## Seed reference time

The UTC instant stored when a workspace is provisioned or reset. Relative seed dates are derived from it using Asia/Jakarta calendar rules.

## Session

A scheduled occurrence of an event with its own start, end, venue, sales window, status, and capacity.

## Sales window

The server-authoritative interval during which an otherwise eligible session accepts checkout. The opening instant is included and the closing instant is excluded.

## Ticket type

A named booking option for one session with its own unit price and availability status. All ticket types for a session share that session's total capacity in R1.

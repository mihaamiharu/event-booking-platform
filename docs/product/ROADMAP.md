# Product Roadmap

**Status:** Directional

The roadmap describes learning and product progression, not delivery dates. Each release requires its own accepted scope before implementation.

## R0 — Product inception

Define the standalone product, Cloudflare free-plan constraint, documentation workflow, R1 requirements, business rules, roles, seed data, and release gates.

## R1 — Attendee booking

Deliver isolated workspaces, seeded sign-in, event discovery, ticket selection, deterministic payment success/decline, booking confirmation, and booking history.

## R2 — Organizer lifecycle

Introduce organizer identity and authorization, event drafts, venue and session management, ticket types, publication review, capacity editing, and change history.

Potential testing themes:

- Requirement changes and backward compatibility
- Role-based authorization
- Form validation and draft persistence
- API contract evolution
- Database migrations

## R3 — Event operations

Introduce attendee cancellation, check-in staff, duplicate check-in prevention, attendance reporting, promo codes, and deterministic notification records.

Potential testing themes:

- State transitions and audit trails
- Date and cancellation boundaries
- Mobile operational UI
- API plus UI workflows
- Reporting consistency

## R4 — Reliability and integration

Introduce temporary ticket holds, concurrent final-capacity attempts, asynchronous confirmation, retryable operations, controlled service failures, and evidence-rich operational diagnostics.

Potential testing themes:

- Concurrency and race conditions
- Idempotency and retries
- Eventual consistency
- Failure classification
- Performance and resilience

## Controlled defect policy

The canonical baseline remains correct against its accepted specification. Teaching defects are introduced through versioned scenario profiles or explicit release branches. A defect profile must identify the intended requirement, reset behavior, and observable symptom without corrupting unrelated workspaces.

## Explicitly unscheduled

- Real payments and payouts
- Native applications
- Multi-currency marketplace behavior
- User-generated public content and moderation
- Real email or SMS delivery
- Integration with learning-platform accounts

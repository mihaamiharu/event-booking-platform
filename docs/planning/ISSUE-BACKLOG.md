# GitHub Issue Backlog

**Status:** Created on GitHub on 2026-09-03

This list is the durable fallback and ordering source for GitHub issues. GitHub issue bodies should link to the relevant versioned documents rather than duplicate their complete contents.

## Product-discovery review

### [#1 — Review the R1 product-discovery package](https://github.com/mihaamiharu/event-booking-platform/issues/1)

**Purpose:** Owner review of the complete R1 product contract.

Review:

- `docs/product/DISCOVERY-CHECKLIST.md`
- `docs/product/PRD.md`
- `docs/product/BUSINESS-RULES.md`
- `docs/releases/RELEASE-001.md`

Completion means the owner accepts the package or records requested changes with affected requirement IDs.

### [#2 — Review the R1 regional presentation contract](https://github.com/mihaamiharu/event-booking-platform/issues/2)

**Purpose:** Confirm IDR integer amounts, Asia/Jakarta/WIB time, and English-only R1 content.

Decision sources: `PD-006`, `PD-007`, and `PD-008` in `docs/product/DECISIONS.md`.

### [#3 — Review seeded identity and learner-workspace lifecycle](https://github.com/mihaamiharu/event-booking-platform/issues/3)

**Purpose:** Confirm public seeded accounts, seven inactive days, deterministic provisioning/reset, and no TWE runtime identity.

Decision sources: `PD-002`, `PD-003`, ADR-0001, and ADR-0004.

### [#4 — Review the deterministic payment contract](https://github.com/mihaamiharu/event-booking-platform/issues/4)

**Purpose:** Confirm simulation-code input, success/decline behavior, and absence of card-shaped data.

Decision source: `PD-004`; requirements: `PAY-001`, `BKG-002`, and `BKG-003`.

### [#5 — Choose the public product name before general availability](https://github.com/mihaamiharu/event-booking-platform/issues/5)

**Purpose:** Replace the working name before branded hostname selection and general availability.

This issue is explicitly non-blocking for R1 design and implementation.

## Engineering-design backlog

### [#6 — Design the R1 ERD and data lifecycle](https://github.com/mihaamiharu/event-booking-platform/issues/6)

Define workspace scoping, users/sessions, events/sessions/tickets, bookings/items, payment outcomes, idempotency, seed metadata, indexes, deletion, and migration rules.

### [#7 — Define the R1 public API contract](https://github.com/mihaamiharu/event-booking-platform/issues/7)

Define operations, schemas, stable errors, authentication, idempotency, pagination, date/currency representation, and test-support boundaries.

### [#8 — Design authentication and workspace security](https://github.com/mihaamiharu/event-booking-platform/issues/8)

Define signed context, session lifecycle, password hashing, authorization enforcement, CSRF posture, reset authorization, abuse controls, and redaction.

### [#9 — Model Cloudflare free-plan usage and resources](https://github.com/mihaamiharu/event-booking-platform/issues/9)

Define Worker routing, D1 bindings, static assets, Cron cleanup, Turnstile trigger conditions, request/write budgets, monitoring, and quota-exhaustion behavior.

### [#10 — Create R1 UI design and responsive wireframes](https://github.com/mihaamiharu/event-booking-platform/issues/10)

Design the catalog, event detail, sign-in, checkout, booking list/detail, and demo controls with loading, empty, validation, conflict, decline, expired, and unexpected-error states.

### [#11 — Define the requirement-based R1 test strategy](https://github.com/mihaamiharu/event-booking-platform/issues/11)

Map UI, API, database, integration, E2E, accessibility, browser, concurrency, reset, security, and free-tier verification to `docs/product/TRACEABILITY.md`.

### [#12 — Plan the first implementation vertical slice](https://github.com/mihaamiharu/event-booking-platform/issues/12)

Sequence repository scaffolding, Cloudflare resources, migrations/seed, event reads, identity, checkout, booking reads, reset/expiration, and release verification without hiding unresolved dependencies.

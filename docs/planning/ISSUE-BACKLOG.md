# GitHub Issue Backlog

**Status:** Prepared for GitHub creation

This list is the durable fallback and ordering source for GitHub issues. GitHub issue bodies should link to the relevant versioned documents rather than duplicate their complete contents.

## Product-discovery review

### Review the R1 product-discovery package

**Purpose:** Owner review of the complete R1 product contract.

Review:

- `docs/product/DISCOVERY-CHECKLIST.md`
- `docs/product/PRD.md`
- `docs/product/BUSINESS-RULES.md`
- `docs/releases/RELEASE-001.md`

Completion means the owner accepts the package or records requested changes with affected requirement IDs.

### Review the R1 regional presentation contract

**Purpose:** Confirm IDR integer amounts, Asia/Jakarta/WIB time, and English-only R1 content.

Decision sources: `PD-006`, `PD-007`, and `PD-008` in `docs/product/DECISIONS.md`.

### Review seeded identity and learner-workspace lifecycle

**Purpose:** Confirm public seeded accounts, seven inactive days, deterministic provisioning/reset, and no TWE runtime identity.

Decision sources: `PD-002`, `PD-003`, ADR-0001, and ADR-0004.

### Review the deterministic payment contract

**Purpose:** Confirm simulation-code input, success/decline behavior, and absence of card-shaped data.

Decision source: `PD-004`; requirements: `PAY-001`, `BKG-002`, and `BKG-003`.

### Choose the public product name before general availability

**Purpose:** Replace the working name before branded hostname selection and general availability.

This issue is explicitly non-blocking for R1 design and implementation.

## Engineering-design backlog

### Design the R1 ERD and data lifecycle

Define workspace scoping, users/sessions, events/sessions/tickets, bookings/items, payment outcomes, idempotency, seed metadata, indexes, deletion, and migration rules.

### Define the R1 public API contract

Define operations, schemas, stable errors, authentication, idempotency, pagination, date/currency representation, and test-support boundaries.

### Design authentication and workspace security

Define signed context, session lifecycle, password hashing, authorization enforcement, CSRF posture, reset authorization, abuse controls, and redaction.

### Model Cloudflare free-plan usage and resources

Define Worker routing, D1 bindings, static assets, Cron cleanup, Turnstile trigger conditions, request/write budgets, monitoring, and quota-exhaustion behavior.

### Create R1 UI design and responsive wireframes

Design the catalog, event detail, sign-in, checkout, booking list/detail, and demo controls with loading, empty, validation, conflict, decline, expired, and unexpected-error states.

### Define the requirement-based R1 test strategy

Map UI, API, database, integration, E2E, accessibility, browser, concurrency, reset, security, and free-tier verification to `docs/product/TRACEABILITY.md`.

### Plan the first implementation vertical slice

Sequence repository scaffolding, Cloudflare resources, migrations/seed, event reads, identity, checkout, booking reads, reset/expiration, and release verification without hiding unresolved dependencies.

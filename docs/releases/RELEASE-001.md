# R1 — Attendee Booking

**Status:** Accepted (release verification S8, 2026-09-08; sign-off via PR review)
**Target infrastructure:** Cloudflare free plans
**Public hostname:** `workers.dev` hostname to be assigned

## Release claim

An attendee can use a deterministic learner workspace to sign in, discover a published event, select available tickets, complete a deterministic simulated payment, and retrieve one durable confirmed booking without another workspace observing or changing that state.

## Included requirements

- `ACC-001`
- `EVT-001` through `EVT-002`
- `BKG-001` through `BKG-005`
- `PAY-001`
- `WSP-001` through `WSP-004`
- `NFR-001` through `NFR-009`

## Primary user flows

- `UF-001` — Enter a learner workspace
- `UF-002` — Sign in as an attendee
- `UF-003` — Discover a bookable event
- `UF-004` — Complete a successful booking
- `UF-005` — Receive a payment decline
- `UF-006` — View a confirmed booking

## Release gates

### Product gate

- R1 requirements and business rules are approved.
- IDR, Asia/Jakarta, and English-only R1 decisions are reflected across the product documents.
- Seed accounts, events, sessions, tickets, existing bookings, and reset expectations are documented.
- All user-visible errors have stable product meaning.

### Engineering gate

- Static client and API Worker deploy without a paid Cloudflare plan.
- D1 migrations apply to a clean local and preview database.
- Workspace reset and expiration affect only their intended workspace.
- Booking confirmation is idempotent and cannot overbook known capacity under supported concurrency.

### Quality gate

- Requirement-to-test traceability covers every R1 requirement.
- Core flows pass at supported mobile and desktop viewport sizes.
- Keyboard and accessible-name checks cover the primary journey.
- API contract verification covers success, validation, authorization, not-found, conflict, and decline outcomes.
- Database verification proves booking, price snapshot, payment result, ownership, and capacity state.
- A clean deployment can be seeded, exercised, reset, and exercised again.

## Known release risks

- D1 concurrency guarantees must be validated before choosing the capacity-update implementation.
- Workspace provisioning and reset could consume free-plan writes if abused.
- Relative seed-date calculation must agree across local, preview, and production environments.
- The public `workers.dev` name cannot be finalized before the Worker name is selected.
- The three-browser matrix must remain executable in CI; see ADR-0010. A browser-engine failure is a release-quality failure, not silent scope reduction.

## R1 verification evidence (S8, 2026-09-08)

Product gate: PRD, business rules, error catalog (now incl. `TURNSTILE_REQUIRED`),
seed data, and traceability reviewed across S0–S8; 22/22 R1 IDs covered by
tests under `--strict-coverage`.

Engineering gate: static client + Worker deploy to disposable preview on the
free plan (config accepted: assets, hourly cron, observability); D1
migrations apply clean locally and on preview; reset/expiry proven
workspace-scoped (isolation soak, T-04); checkout idempotent with no
overbooking (T-08/T-09, SPIKE-B gated pattern); row budgets reconciled in the
usage model.

Quality gate: full local matrix green — unit, API, DB, a11y/keyboard
passes, 360px + desktop viewports (NFR-003 cited), error-stability +
redaction + CSRF harnesses, Chromium/Firefox/WebKit E2E. Disposable preview run:
migrate-clean → seed → exercise (catalog, sign-in, decline, booking) →
reset → re-exercise (seeded-only state) → resources deleted; no secrets,
database IDs, or preview URLs retained.

## Discovery evidence

- [Product requirements](../product/PRD.md)
- [Product decisions](../product/DECISIONS.md)
- [Business rules](../product/BUSINESS-RULES.md)
- [User flows](../product/USER-FLOWS.md)
- [Roles and permissions](../product/ROLES-AND-PERMISSIONS.md)
- [Information architecture](../product/INFORMATION-ARCHITECTURE.md)
- [Error catalog](../product/ERROR-CATALOG.md)
- [Seed data](../testing/TEST-DATA.md)
- [Traceability](../product/TRACEABILITY.md)
- [Risks and assumptions](../product/RISKS-AND-ASSUMPTIONS.md)

## Explicit exclusions

See [Release 1: Out of Scope](../product/OUT-OF-SCOPE.md).

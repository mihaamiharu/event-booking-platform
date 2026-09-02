# R1 — Attendee Booking

**Status:** Ready for discovery review
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

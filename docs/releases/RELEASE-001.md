# R1 — Attendee Booking

**Status:** Discovery
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
- `NFR-001` through `NFR-005`

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
- Currency and time-zone decisions are resolved.
- Seed accounts and events are documented.
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
- Time-zone and sales-window ambiguity could create boundary defects until the policy is accepted.
- The public `workers.dev` name cannot be finalized before the Worker name is selected.

## Explicit exclusions

See [Release 1: Out of Scope](../product/OUT-OF-SCOPE.md).

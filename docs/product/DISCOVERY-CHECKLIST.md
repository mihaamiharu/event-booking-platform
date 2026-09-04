# R1 Product Discovery Review

**Status:** Approved by product owner on 2026-09-04

## Product definition

- [x] Standalone product relationship to learning platforms is defined.
- [x] Product problem, R1 outcome, principles, and success signals are defined.
- [x] Primary and future personas are documented.
- [x] Working name is accepted and public branding is explicitly deferred.

## Release scope

- [x] R1 release claim is defined.
- [x] Included functional and non-functional requirements have stable IDs.
- [x] Explicit exclusions prevent hidden R1 scope.
- [x] Later releases have directional boundaries without committing dates.

## Behavior

- [x] Primary, alternate, decline, authorization, expiration, and reset flows are documented.
- [x] Roles and permissions are explicit.
- [x] Event, session, capacity, ticket, price, booking, idempotency, payment, workspace, time, and language rules are explicit.
- [x] Stable product error meanings are proposed.
- [x] Information architecture covers every R1 screen and state.

## Data and environment

- [x] R1 uses IDR integer prices.
- [x] R1 uses Asia/Jakarta and displays WIB.
- [x] R1 is English only.
- [x] Seed accounts, events, sessions, tickets, bookings, payment outcomes, and reset invariants are documented.
- [x] Workspace isolation, seven-day expiration, privacy, and abuse risks are documented.
- [x] Cloudflare free-plan operation and `workers.dev` launch are accepted.

## Quality and traceability

- [x] Every functional requirement maps to user flow, business rules, interface, seed/scenario, and planned evidence.
- [x] Non-functional requirements have planned evidence.
- [x] Product risks, assumptions, review triggers, and controlled-defect policy are documented.
- [x] Release product, engineering, and quality gates are documented.

## Owner review

- [x] Product owner reviewed the R1 discovery package on 2026-09-04 (issues #1, #2, #3, #4 approved).
- [x] Product owner accepted IDR, Asia/Jakarta/WIB, and English-only R1 decisions (PD-006, PD-007, PD-008; NFR-009).
- [x] Product owner accepted seeded personas, event content, and seven-day workspace lifecycle (PD-002, PD-003; WSP-001 through WSP-004).
- [x] Product owner accepted the R1 release claim and exclusions, including the deterministic payment contract (PD-004; PAY-001).

## Next stage after approval

Product discovery does not select database tables, API payloads, libraries, or UI styling. The next stage produces:

1. Initial ERD and data lifecycle design
2. Public API contract and error schema
3. Authentication and workspace security design
4. Cloudflare resource and quota model
5. UI design system and wireframes
6. Requirement-based test strategy
7. Implementation plan for the first vertical slice

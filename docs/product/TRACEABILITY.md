# R1 Discovery Traceability

**Status:** Ready for review

This matrix connects accepted product behavior to user flow, business rules, interface, seed state, and planned verification. API operations are specified in [R1 public API contract](../../engineering/API-CONTRACT.md) §2 (requirement → operation matrix); database entities are specified in [R1 data design](../../engineering/DATA-DESIGN.md) §2.

| Requirement | User flow | Business rules | Primary interface | Seed or scenario | Planned evidence |
| --- | --- | --- | --- | --- | --- |
| `ACC-001` | `UF-002` | `BR-ACC-001`, `BR-ACC-002` | Sign in, sign out | Alex and Maya accounts | UI, API, session and authorization tests |
| `EVT-001` | `UF-003` | `BR-EVT-001` | Event catalog | Published, draft, cancelled, and past fixtures | UI, API, catalog-query tests |
| `EVT-002` | `UF-003` | `BR-EVT-002`, `BR-EVT-003`, `BR-TIM-001` | Event detail | Available and sold-out events | UI, API, accessibility tests |
| `BKG-001` | `UF-004`, `UF-005` | `BR-TKT-001`, `BR-TKT-002` | Event detail, checkout | General and Premium tickets | Boundary, UI and API validation tests |
| `BKG-002` | `UF-004`, `UF-005` | `BR-BKG-001`, `BR-TIM-002`, `BR-TIM-003` | Checkout | Available, sold-out, closed and stale input states | API, service and state tests |
| `BKG-003` | `UF-004` | `BR-BKG-002` through `BR-BKG-004` | Checkout, confirmation | Success code and available capacity | E2E, API, idempotency, concurrency and database tests |
| `BKG-004` | `UF-006` | `BR-BKG-005` | Booking detail | Maya seeded booking and foreign references | UI, API and authorization tests |
| `BKG-005` | `UF-006` | `BR-BKG-005` | My bookings | Alex empty state and Maya populated state | UI, API, sorting and ownership tests |
| `PAY-001` | `UF-004`, `UF-005` | `BR-PAY-001` through `BR-PAY-003` | Checkout | Success, decline and invalid simulation input | UI, API and database-side-effect tests |
| `WSP-001` | `UF-001` | `BR-ACC-002` | All dynamic interfaces | Two isolated workspaces | Negative API and database-scope tests |
| `WSP-002` | `UF-001` | `BR-WSP-003` | Demo controls | Mutated then reset workspace | API, database and cross-workspace tests |
| `WSP-003` | `UF-001`, `UF-002` | `BR-WSP-001`, `BR-WSP-002` | Demo controls, sign in | Active and expired workspace contexts | Time-boundary and cleanup tests |
| `WSP-004` | `UF-001` | Seed invariants | Product entry | Fresh, existing and rate-limited contexts | API, atomic seed and recovery tests |

## Non-functional traceability

| Requirement | Discovery source | Planned evidence |
| --- | --- | --- |
| `NFR-001` | ADR-0002, TDD free-plan controls | Deployment configuration and usage-budget review |
| `NFR-002` | Personas, information architecture | Keyboard, focus, name, role, error and contrast checks |
| `NFR-003` | Information architecture responsive priorities | 320px mobile and desktop viewport checks |
| `NFR-004` | Product error catalog | Contract tests for stable codes and safe messages |
| `NFR-005` | This matrix and contribution workflow | PR review and requirement-link checks |
| `NFR-006` | Seed-data safety and security baseline | Log review and absence of real-data fields |
| `NFR-007` | Seed-data reset invariants | Repeat provision/reset comparison |
| `NFR-008` | Release definition | Current Chromium, Firefox and WebKit execution |
| `NFR-009` | Product decisions and business rules | English copy, IDR formatting, and WIB display checks |

## Traceability maintenance

When a requirement changes, update its user flows, business rules, interface contract, seed/scenario data, and planned evidence in the same pull request.

# R1 Risks and Assumptions

**Status:** Ready for review

## Assumptions

| ID | Assumption | Validation point |
| --- | --- | --- |
| `A-001` | R1 visitors can use public seeded credentials instead of registering | Product review and usability walkthrough |
| `A-002` | Seven inactive days is enough for a multi-session learning exercise | Usage review after public launch |
| `A-003` | IDR and Asia/Jakarta are coherent for the initial seeded event catalog | Seed-data and content review |
| `A-004` | English-only UI is sufficient for R1 | Audience feedback before R2 planning |
| `A-005` | Static assets plus bounded API calls can remain within Cloudflare free plans | Load model and deployed usage monitoring |
| `A-006` | Visitors do not need durable data after workspace expiration | Product review and expiration feedback |

## Product and delivery risks

| ID | Risk | Impact | Mitigation or evidence required |
| --- | --- | --- | --- |
| `R-001` | Automated abuse exhausts Worker or D1 daily limits | Dynamic product becomes unavailable until quota reset | Rate-limit provisioning/reset, use Turnstile where justified, bound seed writes, monitor usage |
| `R-002` | Capacity updates race under concurrent checkout | Overbooking or inconsistent state | Prove the selected D1 transaction/conditional-update strategy before R1 release |
| `R-003` | Relative seed dates become inconsistent across resets or time zones | Flaky requirements and tests | Store one seed reference instant and derive all dates in Asia/Jakarta using documented rules |
| `R-004` | Workspace scope is omitted from a query | Cross-workspace disclosure or mutation | Centralize trusted scope, review every mutable query, add negative authorization tests |
| `R-005` | Idempotency stores or compares incomplete input | Duplicate or incorrect booking reuse | Define canonical request fingerprint and retention in API/data design |
| `R-006` | Public documentation encourages real personal or card input | Privacy and safety harm | Use `.test` identities, simulation-code UI, explicit warnings, no card-shaped fields |
| `R-007` | Requirements and implementation drift | Educational evidence becomes misleading | Require requirement IDs and documentation impact in pull requests |
| `R-008` | Teaching defect profiles contaminate the correct baseline | Learners see unrelated or irreproducible failures | Version profiles, scope by workspace, verify reset, keep canonical baseline correct |
| `R-009` | Branding is selected late | Copy and hostname rework | Keep product name externalizable and decide before general availability |

## Review triggers

Revisit this document when Cloudflare limits change, R1 traffic becomes measurable, a new business role is introduced, or a release adds external services, uploads, concurrency, or user-provided personal data.

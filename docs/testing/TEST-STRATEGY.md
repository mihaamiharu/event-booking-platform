# R1 Test Strategy

**Status:** Ready for review
**Version:** 0.1
**Scope:** Issue #11 — manual and automated verification before implementation
**Sources:** TRACEABILITY, PRD, BUSINESS-RULES, TEST-DATA (`r1-v1`), API-CONTRACT, DATA-DESIGN, AUTH-SECURITY (T-01…T-12), UI-DESIGN, CLOUDFLARE-USAGE-MODEL, RELEASE-001 gates

## 1. Layer separation

| Layer | Runs against | Owns | Never owns |
| --- | --- | --- | --- |
| Unit | Pure functions in repo | Pricing math, fingerprint canonicalization, IDR/WIB formatters, validation schemas, error mapping | I/O, time, quota |
| API contract | Deployed Worker + D1 (local first) | Every operation × success/validation/auth/not-found/conflict/decline/rate-limit; stable codes; `meta.rows_read/rows_written` budget assertions | Browser rendering |
| Database state | D1 directly (local) | Booking/item/payment rows, price snapshots, capacity counters, ownership scoping, reset invariants, index usage (`EXPLAIN QUERY PLAN` on hot paths) | HTTP semantics |
| UI component + a11y | Component harness + browser | UI-DESIGN §4 states, §6 annotations: keyboard paths, names/roles, focus moves, error association, contrast values | Business logic |
| E2E journeys | Full stack (local, preview smoke) | UF-001…006 end to end on Playwright Chromium, Firefox, WebKit at 360px and desktop viewports | Quota exhaustion, abuse soaks |
| Concurrency spike | Local + preview | DATA-DESIGN §6: ≥20 parallel last-seat checkouts; idempotent replay/conflict suite | Production load |
| Workspace lifecycle | API + D1 | Provision/reuse/rate-limit, reset isolation + invariants, expiry boundary via direct `last_active_at` manipulation (**local D1 only**), cleanup-batch drain | Real 7-day waits |
| Security negative | API + logs | AUTH-SECURITY T-01…T-12 verbatim | Penetration testing beyond R1 scope |
| Free-tier/operational | Meta + dashboards | Per-endpoint row budgets, sampling config, exhaustion-code mapping (unit-tested mappers + reviewed budgets; never deliberately exhaust production) | Load testing production |

Tooling proposal (ratified in #12): Playwright for E2E (per NFR-008), a TS HTTP runner for API contract tests, `node:test` or equivalent for unit; no choice here binds implementation.

## 2. Requirement × layer matrix

| Requirement | Unit | API | DB | UI/a11y | E2E | Special |
| --- | --- | --- | --- | --- | --- | --- |
| `ACC-001` | schemas | sign-in/out, 401 shapes, throttle | session rows, hash format | sign-in states, focus | UF-002 | T-05/T-06 |
| `EVT-001` | — | catalog filter/pagination/empty | seed visibility flags | catalog cards/empty | UF-003 | — |
| `EVT-002` | WIB formatter | detail/unavailable/404 | session/ticket seed | detail radios/disabled | UF-003 | a11y names |
| `BKG-001` | quantity bounds | boundary 400s | — | quantity control/total live region | UF-004 | — |
| `BKG-002` | — | stale-price/capacity/window rejections | no-write-on-failure proofs | conflict panels | UF-004/005 | — |
| `BKG-003` | fingerprint | 201/200-replay/409-conflict | atomic rows + counter | confirmation banner | UF-004 | concurrency spike, T-08/T-09 |
| `BKG-004` | — | detail/404 parity | ownership scoping | detail list | UF-006 | T-01 |
| `BKG-005` | — | list order/pagination/empty | newest-first query | list/empty | UF-006 | — |
| `PAY-001` | code validator | success/decline/invalid, no side effects | attempt rows, no booking on decline | decline panel | UF-004/005 | — |
| `WSP-001` | — | cross-workspace 404 parity suite | scope-column audit of every table | — | — | T-02/T-04 |
| `WSP-002` | — | reset auth/confirm/rate-limit/failure | invariants + isolation | demo controls states | UF-001 | — |
| `WSP-003` | — | 410 flow, `last_active_at` semantics | expiry-batch drain | expired banner | — | local time manipulation |
| `WSP-004` | — | provision/reuse/throttle/atomic-fail | seed row counts | entry experience | UF-001 | T-07 (local/preview) |
| `NFR-001` | — | — | — | — | — | budget review + dashboard checks |
| `NFR-002` | — | — | — | keyboard/focus/name/contrast per UI-DESIGN §6 | keyboard-only journey pass | — |
| `NFR-003` | — | — | — | 360px + desktop viewport pass | same in E2E | no horizontal overflow assertion |
| `NFR-004` | error mapper | code-stability suite (codes pinned, messages free) | — | — | — | — |
| `NFR-005` | — | — | — | — | — | ID-in-name lint + PR checklist (§5) |
| `NFR-006` | — | — | no card columns; sim codes unpersisted | no card fields | — | T-10 log redaction grep |
| `NFR-007` | — | — | reset-twice diff (logical equality modulo T0/hashes) | — | — | — |
| `NFR-008` | — | — | — | — | Chromium/Firefox/WebKit | document engine-specific limits |
| `NFR-009` | formatter | `currency`/`priceIdr` shapes | integer storage, UTC instants | `IDR 150.000` + `WIB` rendering | — | — |

## 3. Deterministic seed usage

- Suites derive dates from the workspace `seedReferenceAt` (T0); hardcoded calendar dates are forbidden (R-003).
- Each suite worker provisions its own workspace (parallel-safe); reset precedes state-sensitive cases; Maya/Alex fixtures used as documented (Maya = populated, Alex = empty).
- Expiry tests set `last_active_at` directly in **local** D1, then exercise status/cleanup endpoints — the only permitted direct-DB test write, and it never runs against preview/production.

## 4. Environments and gates

- Local: full matrix, concurrency spike, abuse soaks, redaction grep. Must pass before any preview run.
- Preview: disposable DB; contract smoke + E2E journeys + migration-from-clean check. Lightweight by quota design (does not consume production writes).
- Production: post-deploy smoke only (provision → catalog → sign-in → decline-checkout → reset), rate-limit-respecting, followed by dashboard budget review.
- Release gates (RELEASE-001) map to layers: product gate ← matrices + review; engineering gate ← spike + isolation + budget proofs; quality gate ← a11y/viewport/browser/API/DB/reset evidence.

## 5. Evidence and defect conventions (NFR-005, NFR-007 in RISKS)

- Test names and files carry requirement IDs (e.g. `bkg-003.idempotency.spec.ts`); CI lints that every R1 ID appears at least once (traceability stays executable).
- Defect reports reference requirement IDs + seed version + workspace pseudonym + correlation ID; suspected controlled-defect-profile contamination is ruled out first via workspace reset (R-008).
- Row-budget evidence: API tests assert `meta.rows_read/rows_written` ceilings from the usage model; failures file against the offending query with its `EXPLAIN QUERY PLAN`.
- A11y evidence: keyboard-only E2E pass recording, focus-order notes, and measured contrast ratios attached to the UI slice PR, not just checkmarks.

## 6. Manual and AI-assisted workflow

- Manual: exploratory passes per release (stale-availability, double-submit, back-button-after-checkout, expired-session mid-checkout), recorded as charters with requirement links; manual findings become automated regressions before merge.
- AI-assisted authoring/debugging: generators may draft cases from this strategy and the contract fixtures, but every generated test must cite its requirement ID and fail-then-pass against a deliberate fault (validation flip, capacity race, revoked session) before counting as evidence. Generated tests that cannot be traced to §2 are rejected in review.

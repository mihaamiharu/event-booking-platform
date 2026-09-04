# R1 Implementation Vertical-Slice Plan

**Status:** Ready for review
**Version:** 0.1
**Scope:** Issue #12 — dependency-aware build order for the first testable product path
**Dependencies:** Accepted outputs of #6 (DATA-DESIGN), #7 (API-CONTRACT), #8 (AUTH-SECURITY), #9 (CLOUDFLARE-USAGE-MODEL), #10 (UI-DESIGN), #11 (TEST-STRATEGY). No unresolved design work remains hidden; the two pre-implementation spikes below gate their slices.

## 1. Ratified tooling (proposals from #11 confirmed here)

TypeScript throughout; Cloudflare Wrangler for Worker/D1/migrations; `node:test` + TS HTTP runner for unit/API layers; Playwright (Chromium, Firefox, WebKit) for E2E. No framework beyond this: client stays dependency-free TypeScript compiled to Static Assets until a slice proves otherwise in review.

## 2. Pre-implementation spikes (gate slices S3/S5)

- **SPIKE-A (CPU):** PBKDF2-SHA256 iteration benchmark in a real Worker isolate, cold + warm; record p99 verify ms and lock the count (AUTH-SECURITY §3.1). Gates S4.
- **SPIKE-B (concurrency):** D1 `batch()` atomicity + ≥20 parallel last-seat checkouts against scratch schema; pass = total confirmed ≤ capacity with stable outcomes (DATA-DESIGN §6). Gates S5. Fallback on failure: serialized conditional-update writer, same slice.

## 3. Slices (each: requirements → deliverables → verification; docs updated in the same PR)

| Slice | Content | Requirements | Verification |
| --- | --- | --- | --- |
| S0 Scaffold | Repo layout (`/client`, `/worker`, `/db/migrations`, `/tests`), TS configs, lint (ID-in-name), CI skeleton | NFR-005 | CI green on empty suites |
| S1 Environments | Wrangler configs + bindings per usage-model §2.2; `/api/health`; local/preview D1 | NFR-001 | Deploy local + preview; health check |
| S2 Schema + seed | `0001_init.sql` (DATA-DESIGN §2–§4) + provision/reset engine without HTTP | WSP-004, NFR-007 | Migration on clean DBs; reset-twice logical diff |
| S3 Provision + event reads | Provision/status endpoints, catalog + detail endpoints + UI routes `/events`, `/events/:slug` with loading/empty/error | WSP-001/003/004, EVT-001/002, NFR-009 | API + DB + UI/a11y + E2E discovery journey; row budgets asserted |
| S4 Identity | Sign-in/out endpoints + `/sign-in` route, session lifecycle, rate limits | ACC-001 | T-05/T-06, session tests, keyboard pass |
| S5 Checkout | Checkout batch + simulator + idempotency + capacity; `/checkout` + confirmation; **first observable end-to-end booking** | BKG-001/002/003, PAY-001 | SPIKE-B proof, replay/conflict suite, decline no-side-effect proofs, E2E UF-004/005 |
| S6 Bookings | List/detail endpoints + `/bookings*` routes | BKG-004/005 | Ownership parity (T-01), sorting/pagination, UF-006 |
| S7 Lifecycle | Reset endpoint + `/demo` controls, Cron cleanup tick, expiry flows | WSP-002/003 | Isolation soak, expiry-boundary (local), cleanup drain, T-07 |
| S8 Release | Rate-limit/Turnstile arming, sampling config, redaction grep, viewport/browser matrix, dashboard budget review, release gates | NFR-001…009 | Full TEST-STRATEGY §2 matrix green; RELEASE-001 gates signed |

## 4. Rules

- Slices merge in order; each is independently observable (S3 browsable catalog → S5 first booking → S8 release candidate).
- Every slice PR carries requirement IDs, doc updates, and its §3 verification evidence; generated tests follow TEST-STRATEGY §6 admission.
- Cloudflare-only, free-plan constraint holds throughout: single Worker + single prod D1 + 1 Cron + conditional Turnstile; preview never spends production quota.

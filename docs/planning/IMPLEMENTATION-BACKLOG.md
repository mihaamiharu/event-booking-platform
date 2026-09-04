# R1 Implementation Backlog (Prepared Issues)

**Status:** Ready for review
**Source:** `SLICE-PLAN.md` S0–S8 plus the two gating spikes

This list is the durable fallback and ordering source for implementation issues, following the `ISSUE-BACKLOG.md` convention: GitHub issue bodies link to the versioned documents below rather than duplicating them. Create the GitHub issues in this order; numbers will follow the existing sequence (design issues and PRs have used #1–#19).

Spikes gate their slices: SPIKE-A gates S4, SPIKE-B gates S5. Slices merge in order S0→S8.

## Spikes

### [Spike] SPIKE-A — PBKDF2 CPU benchmark in a Worker isolate

**Objective:** Lock the password-hash iteration count before identity code merges.

**Scope:** Benchmark PBKDF2-SHA256 verify in a real Worker isolate, cold and warm; record p99 ms; select a count with p99 ≤ 5 ms (proposal: 100,000, adjustable down by config).

**Sources:** `docs/engineering/AUTH-SECURITY.md` §3.1; `docs/engineering/CLOUDFLARE-USAGE-MODEL.md` §1 (10 ms CPU cap).

**Acceptance:** Results recorded in the spike PR; iteration count set in config; S4 unblocked.

**Requirements:** `ACC-001`, `NFR-001` · **Gates:** S4

### [Spike] SPIKE-B — D1 batch atomicity and concurrency proof

**Objective:** Prove checkout cannot overbook before checkout code merges.

**Scope:** ≥ 20 parallel last-seat checkouts against scratch schema; assert total confirmed ≤ capacity, losers get stable 409 with no booking rows, same-key retries replay. Fallback on failure: serialized conditional-update writer.

**Sources:** `docs/engineering/DATA-DESIGN.md` §3, §6; `docs/testing/TEST-STRATEGY.md` §1–§2 (`BKG-003` row).

**Acceptance:** Proof evidence in the spike PR, or fallback implemented and proven; S5 unblocked.

**Requirements:** `BKG-002`, `BKG-003` · **Gates:** S5

## Slices

### S0 — Repository and application scaffolding

**Objective:** Reviewable repo layout with green CI on empty suites.

**Scope:** `/client`, `/worker`, `/db/migrations`, `/tests` layout; TypeScript configs; requirement-ID-in-name lint; CI skeleton. Ratified tooling: TypeScript, Wrangler, `node:test`, Playwright.

**Sources:** `docs/planning/SLICE-PLAN.md` §1–§3; `docs/testing/TEST-STRATEGY.md` §5.

**Acceptance:** CI green; layout matches plan; no product behavior yet.

**Requirements:** `NFR-005`

### S1 — Cloudflare environments and bindings

**Objective:** Local + preview deployments with a health check.

**Scope:** Wrangler configs and bindings per usage-model §2.2; `GET /api/health`; local and preview D1 databases; no paid services.

**Sources:** `docs/engineering/CLOUDFLARE-USAGE-MODEL.md` §2; `docs/engineering/API-CONTRACT.md` §3.6; `docs/engineering/TDD.md` §8.

**Acceptance:** Health check passes on local and preview; free-plan-only verified.

**Requirements:** `NFR-001`

### S2 — D1 migrations and deterministic seed engine

**Objective:** Schema plus provision/reset engine without HTTP.

**Scope:** `0001_init.sql` (DATA-DESIGN §2–§4); provision and reset as callable units; reset-twice logical-equality check (modulo T0/hashes).

**Sources:** `docs/engineering/DATA-DESIGN.md` §2, §4, §5, §7; `docs/testing/TEST-DATA.md` (invariants).

**Acceptance:** Migrations apply to clean local + preview DBs; reset invariants hold; `WSP-004` atomic-failure path covered.

**Requirements:** `WSP-004`, `NFR-007`

### S3 — Workspace provisioning and event reads

**Objective:** First browsable product path (catalog + detail).

**Scope:** Provision/status endpoints; catalog + detail endpoints; `/events` and `/events/:slug` routes with loading/empty/error states; per-endpoint row-budget assertions.

**Sources:** API-CONTRACT §3.1, §3.3; UI-DESIGN §3.1, §3.2; TEST-STRATEGY `EVT-001`/`EVT-002`/`WSP-001`/`WSP-003`/`WSP-004` rows.

**Acceptance:** E2E discovery journey green (Chromium, Firefox, WebKit; 360px + desktop); budgets hold.

**Requirements:** `EVT-001`, `EVT-002`, `WSP-001`, `WSP-003`, `WSP-004`, `NFR-009`

### S4 — Seeded attendee identity

**Objective:** Sign-in/out with session lifecycle and throttling.

**Scope:** Session endpoints; `/sign-in` route; PBKDF2 verify at SPIKE-A count; rate limits + non-enumerating errors; keyboard pass. **Depends on SPIKE-A.**

**Sources:** AUTH-SECURITY §3–§5; API-CONTRACT §3.2; UI-DESIGN §3.3; TEST-STRATEGY T-05/T-06.

**Acceptance:** UF-002 E2E green; enumeration-differential and throttle tests pass.

**Requirements:** `ACC-001`

### S5 — Checkout, payment simulation, idempotency, capacity

**Objective:** First end-to-end booking.

**Scope:** Checkout batch + simulator + fingerprint + conditional capacity update; `/checkout` route + confirmation; replay/conflict/decline suites; **depends on SPIKE-B.**

**Sources:** API-CONTRACT §3.4; DATA-DESIGN §3; UI-DESIGN §3.4, §3.5; TEST-STRATEGY `BKG-001`–`003`, `PAY-001` rows; T-08/T-09.

**Acceptance:** UF-004/UF-005 E2E green; decline consumes nothing; no overbooking under concurrency.

**Requirements:** `BKG-001`, `BKG-002`, `BKG-003`, `PAY-001`

### S6 — Booking list and detail

**Objective:** Durable booking retrieval.

**Scope:** List/detail endpoints; `/bookings` routes; ownership parity; sorting/pagination; confirmation-vs-revisit banner behavior.

**Sources:** API-CONTRACT §3.5; UI-DESIGN §3.5, §3.6; TEST-STRATEGY `BKG-004`/`BKG-005` rows; T-01.

**Acceptance:** UF-006 E2E green; cross-attendee/cross-workspace 404 parity proven.

**Requirements:** `BKG-004`, `BKG-005`

### S7 — Reset, expiration, and cleanup

**Objective:** Full workspace lifecycle.

**Scope:** Reset endpoint + `/demo` controls; Cron cleanup tick; expiry-boundary tests (local time manipulation); reset isolation soak.

**Sources:** API-CONTRACT §3.1; DATA-DESIGN §5; UI-DESIGN §3.7; TEST-STRATEGY `WSP-002`/`WSP-003` rows; T-07.

**Acceptance:** UF-001 full green; reset affects only its workspace; cleanup drains over ticks within CPU cap.

**Requirements:** `WSP-002`, `WSP-003`

### S8 — Release verification

**Objective:** R1 release candidate.

**Scope:** Turnstile arming, production sampling config, log-redaction grep, full viewport/browser matrix, dashboard budget review, RELEASE-001 product/engineering/quality gates sign-off.

**Sources:** TEST-STRATEGY §2, §4, §5; RELEASE-001 gates; USAGE-MODEL §7, §8; T-10/T-11/T-12.

**Acceptance:** Entire §2 matrix green; gates recorded; deployment seeded → exercised → reset → exercised again.

**Requirements:** `NFR-001`…`NFR-009` (all)

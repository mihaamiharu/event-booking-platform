# SPIKE-A Results (Closes #21)

Requirements `ACC-001`, `NFR-001`. Gates S4.
Sources: `docs/engineering/AUTH-SECURITY.md` §3.1; `docs/engineering/CLOUDFLARE-USAGE-MODEL.md` §1.

## Environment (local)

- Machine: Darwin 25.5.0 arm64, Apple M3
- `wrangler 4.129.0`, `workerd 2026-09-03`, `node v22.21.1`
- Harness: `spikes/spike-a/src/worker.ts` (`POST /__spike/pbkdf2`,
  `crypto.subtle.deriveBits` PBKDF2-SHA256, server-side `performance.now()`),
  driver `src/run.ts` (sequential POSTs, fixed 16B salt per cell).
- Password: fixture `Attend123!` (TEST-DATA `attendee_alex`); value redacted from logs.
- Cold ≈ first request after `wrangler dev` restart (local approximation).

## Run 1 — proposal grid (200 warm runs/cell)

| iterations | cold server ms | warm p50 | warm p99 | warm mean | warm max | client wall p99 | p99 ≤ 5ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 10000 | 2.00 | 1.00 | 1.00 | 0.69 | 1.00 | 3.32 | PASS |
| 50000 | 3.00 | 3.00 | 4.00 | 3.21 | 4.00 | 5.11 | PASS |
| 100000 | 6.00 | 6.00 | 7.00 | 6.49 | 7.00 | 8.60 | FAIL |
| 150000 | 9.00 | 10.00 | 11.00 | 9.69 | 14.00 | 14.59 | FAIL |

## Run 2 — boundary refinement (200 warm runs/cell)

| iterations | cold server ms | warm p50 | warm p99 | warm mean | warm max | client wall p99 | p99 ≤ 5ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 40000 | 3.00 | 3.00 | 3.00 | 2.55 | 3.00 | 5.52 | PASS |
| 50000 | 3.00 | 3.00 | 4.00 | 3.25 | 4.00 | 6.44 | PASS |
| 60000 | 4.00 | 4.00 | 5.00 | 3.90 | 7.00 | 6.60 | PASS (no margin) |
| 75000 | 4.00 | 5.00 | 6.00 | 4.87 | 7.00 | 7.87 | FAIL |

## Decision

- The 100,000 proposal **exceeds** the 5ms p99 verify budget on local workerd
  (p99 7ms). Per AUTH-SECURITY §3.1, reduce iterations rather than add infra.
- **Locked: `PASSWORD_PBKDF2_ITERATIONS = 50,000`** — p99 4ms across two runs,
  1ms headroom for the remaining 2-query sign-in budget inside the 10ms CPU cap.
  60,000 passes at exactly 5.00ms but with max 7ms and no margin: rejected.
- S4 consumption proposal: wrangler var `PASSWORD_PBKDF2_ITERATIONS` (default
  `50000`) read in `worker/src/config.ts`; provision inserts precomputed hash
  constants (zero hashing CPU on provision path, per §3.1); sign-in verifies once
  per attempt behind §5 throttling.

## Preview (pending)

One bounded disposable preview deploy + 100-run bench per cell still required
to prove real-isolate timing (needs owner `wrangler login`). Local evidence
above is sufficient to lock 50k as the S4 input; preview may only tune down.
No production runs. No secrets or passwords in logs.

# SPIKE-B Results (Closes #22)

Requirements `BKG-002`, `BKG-003`. Gates S5.
Sources: `docs/engineering/DATA-DESIGN.md` §3, §6;
`docs/testing/TEST-STRATEGY.md` §1–§2; `docs/engineering/API-CONTRACT.md` §3.4.

## Environment (local)

- Machine: Darwin 25.5.0 arm64, Apple M3
- `wrangler 4.129.0`, `workerd 2026-09-03`, `node v22.21.1`
- Harness: `spikes/spike-b/src/worker.ts` (scratch `spike_*` tables, local D1),
  driver `src/run.ts` (25 parallel qty-1 `POST /__spike/checkout` vs capacity 5,
  then same-key replay + same-key-different-qty conflict per mode).
- Two runs, identical verdicts.

## Evidence (run 1 and run 2 — identical)

| mode | contenders | capacity | statuses | confirmed | bookedQty/rows | replay | conflict | orphans | verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| batch | 25 | 5 | 201×5, 409×20 | 5 | 25/25 | BROKEN | ok | PRESENT | FAIL |
| gated | 25 | 5 | 201×5, 409×20 | 5 | 5/5 | ok | ok | none | PASS |

## Analysis

- The capacity counter itself never overbooks in either mode (exactly 5×201,
  20×409, `confirmed = 5`): D1 serializes the concurrent writes.
- Naive full-batch checkout **fails** anyway: a conditional `UPDATE` matching
  zero rows is a successful statement, not an error, so `DB.batch()` does not
  roll back the losers' `INSERT`s. All 25 contenders leave booking +
  idempotency rows (20 orphans), and a loser's key replays as `200 SUCCEEDED`
  (poisoned idempotency) instead of its real `409` outcome.
- Gated fallback **passes** fully: conditional `UPDATE` solo first, inserts only
  on success. No overbook, no orphans, replay `200` identical, changed-input
  `409 IDEMPOTENCY_CONFLICT`, state untouched on both negative paths.

## Decision for S5

Use the documented fallback: **serialized conditional-UPDATE gate, then inserts**
(`mode=gated` in the harness). The DATA-DESIGN §3 "one batch" shape must not be
implemented as written — S5 checkout does the capacity `UPDATE` as a standalone
gating statement and only then writes booking/item/payment/idempotency rows.

## Preview + residual (pending)

One bounded disposable-preview run still required to confirm on a real D1
(needs owner `wrangler login` + disposable `ebp-spike-b-preview` DB; see
README). Statement-error mid-batch atomicity (e.g. constraint violation) was
not exercised — irrelevant to the S5 decision above, noted for S5 review.
No prod data touched. No secrets in logs.

# ADR-0008: Treat D1 foreign keys as enforced and share one delete order

**Status:** Accepted  
**Date:** 2026-09-08

## Context

DATA-DESIGN assumed referential cleanup via explicit ordered deletes because
"FK enforcement is [un]proven per-connection": the schema declares foreign
keys for documentation, and `RESET_TABLES` in `worker/src/seed.ts` deleted
child-to-parent on the assumption that order was tidy-up rather than
load-bearing. The `node:sqlite` test adapter leaves foreign keys off by
default, so the test suite agreed with the assumption.

In S7, reset-after-checkout failed on local D1 with
`FOREIGN KEY constraint failed`: D1 enforces foreign keys, and the delete
order placed `idempotency_keys` (whose nullable `booking_id` still constrains
the parent delete) after `bookings`. Clean workspaces reset fine only because
the seed writes no idempotency rows — the first user checkout introduced the
constraining child row.

## Decision

- D1 foreign keys are treated as enforced everywhere. Delete order is
  load-bearing: `idempotency_keys` precedes `bookings` in `RESET_TABLES`.
- One canonical order: `RESET_TABLES` is exported from `worker/src/seed.ts`
  and reused by the cleanup tick (`worker/src/cleanup.ts`), so the two can
  never drift.
- Test fidelity: the `node:sqlite` adapter enables `PRAGMA foreign_keys = ON`
  so row-state tests enforce what D1 enforces.

## Consequences

- Any future table with a foreign key must be inserted into `RESET_TABLES` in
  child-to-parent position; the unit test pins the full order.
- Checkout insert batches already write parents before children and are
  unaffected.
- DATA-DESIGN §2 keeps its "explicit ordered deletes" rule; the
  per-connection caveat is resolved for D1 (local proven; preview smoke
  2026-09-08 showed no constraint errors on real D1).

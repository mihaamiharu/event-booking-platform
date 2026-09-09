# Fault-injection and mutation admission

An automated test counts as strong QA evidence when it can detect a deliberate, reversible fault. The canonical baseline must remain correct; faults are activated only through the explicit local/disposable scenario-profile switch.

## Required representative checks

| Layer | Profile | Expected detector |
| --- | --- | --- |
| API/DB/concurrency | `bkg-capacity-bypass` | Last-seat parallel checkout proves confirmed quantity cannot exceed capacity. |
| API/DB | `bkg-stale-price` | Checkout price snapshot differs from the event contract and the test fails. |
| API/security | `bkg-ownership-leak` | A second attendee receives a booking detail instead of `BOOKING_NOT_FOUND`; authorization test fails. |
| API/DB lifecycle | `wsp-activity-frozen` | Successful dynamic activity does not update `last_active_at`; expiry test fails. |

For each profile, record the failing test output, restore `baseline`, and rerun the same case to prove the test passes again. The profile catalog and safe activation rules live in `worker/src/scenario.ts` and are covered by `tests/unit/scenario.nfr-005.test.ts`.

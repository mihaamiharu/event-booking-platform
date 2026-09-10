// Pure lifecycle boundary checks (BKG-006, BKG-007, NFR-010).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canCancelBooking } from "../../worker/src/routes/bookings.ts";

const NOW = "2026-09-04T01:00:00.000Z";

describe("bkg-006/007 cancellation boundary", () => {
  it("allows only confirmed bookings whose session is strictly in the future", () => {
    assert.equal(canCancelBooking("CONFIRMED", "2026-09-04T01:00:00.001Z", NOW), true);
    assert.equal(canCancelBooking("CONFIRMED", NOW, NOW), false);
    assert.equal(canCancelBooking("CONFIRMED", "2026-09-04T00:59:59.999Z", NOW), false);
    assert.equal(canCancelBooking("CANCELLED", "2026-09-04T02:00:00.000Z", NOW), false);
  });
});

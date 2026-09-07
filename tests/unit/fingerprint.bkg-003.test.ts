// Unit: checkout fingerprint, key shape, reference shape (BKG-003, PAY-001).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkoutFingerprint,
  isIdempotencyKey,
  newBookingReference,
} from "../../worker/src/idempotency.ts";

describe("bkg-003 checkout fingerprint is canonical", () => {
  it("stable for identical input, distinct for any alteration", async () => {
    const base = {
      eventSlug: "jakarta-design-systems-workshop",
      eventSessionId: "sess_design_01",
      ticketTypeId: "ticket_design_general",
      quantity: 2,
      paymentCode: "SIMULATE-SUCCESS",
    };
    const a = await checkoutFingerprint(base);
    assert.match(a, /^[0-9a-f]{64}$/);
    assert.equal(await checkoutFingerprint({ ...base }), a);
    assert.notEqual(await checkoutFingerprint({ ...base, quantity: 3 }), a);
    assert.notEqual(await checkoutFingerprint({ ...base, paymentCode: "SIMULATE-DECLINE" }), a);
    assert.notEqual(await checkoutFingerprint({ ...base, ticketTypeId: "other" }), a);
  });

  it("accepts uuid-v4 keys only", () => {
    assert.ok(isIdempotencyKey(crypto.randomUUID()));
    assert.ok(!isIdempotencyKey(""));
    assert.ok(!isIdempotencyKey("not-a-uuid"));
    assert.ok(!isIdempotencyKey("7F3QXA"));
  });

  it("issues human-readable unique references", () => {
    const refs = new Set(Array.from({ length: 50 }, () => newBookingReference()));
    assert.equal(refs.size, 50);
    for (const r of refs) assert.match(r, /^BKG-[A-Z2-9]{6}$/);
  });
});

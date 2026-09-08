// Unit: stable error shape (NFR-004) — codes pinned, messages free.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { err } from "../../worker/src/errors.ts";

async function shape(status: number, code: string, opts?: Parameters<typeof err>[2]) {
  const res = err(status, code, opts);
  assert.equal(res.status, status);
  assert.equal(res.headers.get("content-type"), "application/json");
  return (await res.json()) as {
    error: { code: string; message: string; correlationId?: string; fields?: Record<string, string> };
  };
}

describe("nfr-004 stable error contract", () => {
  it("pins codes while messages stay free-form", async () => {
    const body = await shape(409, "CAPACITY_INSUFFICIENT", { message: "custom wording" });
    assert.equal(body.error.code, "CAPACITY_INSUFFICIENT");
    assert.equal(body.error.message, "custom wording");
    assert.deepEqual(Object.keys(body).sort(), ["error"]);
    assert.deepEqual(Object.keys(body.error).sort(), ["code", "correlationId", "message"]);
  });

  it("carries correlation IDs except on 400", async () => {
    for (const status of [401, 404, 409, 422, 429, 500, 503]) {
      const body = await shape(status, "X_CODE");
      assert.ok(body.error.correlationId, `correlationId on ${status}`);
    }
    const bad = await shape(400, "VALIDATION_FAILED");
    assert.equal(bad.error.correlationId, undefined);
  });

  it("passes fields through and never leaks internals", async () => {
    const body = await shape(400, "VALIDATION_FAILED", { fields: { quantity: "QUANTITY_INVALID" } });
    assert.deepEqual(body.error.fields, { quantity: "QUANTITY_INVALID" });
    const text = JSON.stringify(body);
    assert.ok(!/at .*:\d+|Error:|SELECT |FROM |SECRET|token/i.test(text));
  });
});

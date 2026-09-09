import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emitLog,
  setLogSink,
  withCorrelationId,
  workspacePseudonym,
} from "../../worker/src/logger.ts";

describe("nfr-004 structured logging and correlation", () => {
  it("uses one correlation ID in error body and header", async () => {
    const id = "corr-test-001";
    const response = await withCorrelationId(
      new Response(JSON.stringify({ error: { code: "CAPACITY_INSUFFICIENT", correlationId: "old" } }), {
        status: 409,
        headers: { "content-type": "application/json" },
      }),
      id,
    );
    assert.equal(response.headers.get("x-correlation-id"), id);
    assert.equal((await response.json()).error.correlationId, id);
  });

  it("supports a capture sink and pseudonymizes workspace IDs", async () => {
    const records: unknown[] = [];
    const restore = setLogSink((record) => records.push(record));
    emitLog({ event: "api.request", timestamp: new Date().toISOString(), correlationId: "corr-test-002", route: "/api/health", status: 200 });
    restore();
    assert.equal(records.length, 1);
    const pseudonym = await workspacePseudonym("workspace-secret-value");
    assert.match(pseudonym ?? "", /^[0-9a-f]{8}$/);
    assert.notEqual(pseudonym, "workspace-secret-value");
  });
});

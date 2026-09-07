// Health contract test (NFR-001, API-CONTRACT §3.6).
// Asserts the exact shape, then stops the server.
// Local-only in CI (shared runner); preview asserted manually in S1.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { baseUrl, startWorker } from "./support/harness.ts";

const PORT = Number(process.env.EBP_API_PORT ?? 8789);
const BASE = baseUrl(PORT);

let stop: () => void;
before(async () => {
  stop = await startWorker(PORT);
});
after(() => stop());

describe("nfr-001 GET /api/health", () => {
  it("returns the exact contract shape", async () => {
    const res = await fetch(`${BASE}/api/health`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/json");
    assert.deepEqual(await res.json(), {
      status: "ok",
      seedVersion: "r1-v1",
    });
  });

  it("unknown routes require workspace context first (no route oracle)", async () => {
    const res = await fetch(`${BASE}/api/nope`);
    assert.equal(res.status, 401);
    const body = (await res.json()) as { error: { code: string } };
    assert.equal(body.error.code, "WORKSPACE_REQUIRED");
  });
});

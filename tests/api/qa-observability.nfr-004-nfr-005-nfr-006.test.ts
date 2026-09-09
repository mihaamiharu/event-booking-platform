// QA cockpit config endpoint (NFR-004/NFR-005/NFR-006).
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { baseUrl, startWorker } from "./support/harness.ts";

const PORT = Number(process.env.EBP_API_PORT ?? 8796);
const BASE = baseUrl(PORT);

let stop: () => void;
before(async () => {
  stop = await startWorker(PORT);
});
after(() => stop());

describe("nfr-004/nfr-005/nfr-006 GET /api/qa/config", () => {
  it("is readable before workspace provisioning and returns safe fields", async () => {
    const res = await fetch(`${BASE}/api/qa/config`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      enabled: boolean;
      environment: string;
      logViews: Record<string, string>;
    };
    assert.equal(body.enabled, true);
    assert.equal(body.environment, "local");
    assert.deepEqual(body.logViews, {});
    assert.doesNotMatch(JSON.stringify(body), /password|cookie|secret|workspace|log payload/i);
  });
});

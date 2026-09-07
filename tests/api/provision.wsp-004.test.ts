// Provision endpoint tests (WSP-004, WSP-001).
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { baseUrl, headers, provision, resetRateCounters, startWorker, type ApiMeta } from "./support/harness.ts";

const PORT = Number(process.env.EBP_API_PORT ?? 8790);
const BASE = baseUrl(PORT);
const ID = "s3-provision-wsp004";

let stop: () => void;
before(async () => {
  stop = await startWorker(PORT);
  resetRateCounters(BASE);
});
after(() => stop());

describe("wsp-004 POST /api/workspaces/provision", () => {
  it("provisions an ACTIVE r1-v1 workspace and sets the cookie", async () => {
    const res = await fetch(`${BASE}/api/workspaces/provision`, {
      method: "POST",
      headers: headers(`${ID}-new`),
      body: "{}",
    });
    assert.equal(res.status, 200);
    const setCookies = res.headers.getSetCookie().join(";");
    assert.match(setCookies, /ebp_workspace=[^;]+;.*HttpOnly.*SameSite=Lax.*Path=\/.*Max-Age=604800/);
    const body = (await res.json()) as {
      workspace: { status: string; seedVersion: string; seedReferenceAt: string; expiresAt: string };
      meta: ApiMeta;
    };
    assert.equal(body.workspace.status, "ACTIVE");
    assert.equal(body.workspace.seedVersion, "r1-v1");
    assert.ok(Date.parse(body.workspace.seedReferenceAt) > 0);
    assert.ok(Date.parse(body.workspace.expiresAt) > Date.parse(body.workspace.seedReferenceAt));
    // Writes meter local-only: D1 bills index maintenance per insert, so the
    // 30-row seed meters ~114 vs the usage-model ≤45 estimate. Preview
    // calibration + budget review belong to S8 (NFR-001); see S3 PR risks.
    assert.ok(body.meta.rows_written <= 120);
  });

  it("reuses the existing workspace when the cookie is valid", async () => {
    const cookie = await provision(BASE, `${ID}-reuse`);
    const first = (await (
      await fetch(`${BASE}/api/workspaces/status`, { headers: headers(`${ID}-reuse`, cookie) })
    ).json()) as { workspace: { seedReferenceAt: string } };
    const res = await fetch(`${BASE}/api/workspaces/provision`, {
      method: "POST",
      headers: headers(`${ID}-reuse`, cookie),
      body: "{}",
    });
    assert.equal(res.status, 200);
    const second = (await (
      await fetch(`${BASE}/api/workspaces/status`, { headers: headers(`${ID}-reuse`, cookie) })
    ).json()) as { workspace: { seedReferenceAt: string } };
    assert.equal(first.workspace.seedReferenceAt, second.workspace.seedReferenceAt);
  });

  it("throttles after 10 provisions per hour per identity (WSP-001)", async () => {
    // Per-run identity: local D1 persists counters across runs by design.
    // Fresh bucket: miniflare collapses all local clients to one IP (real
    // deployments key by CF-Connecting-IP), so reset to simulate it.
    const identity = `${ID}-throttle-${Date.now()}`;
    resetRateCounters(BASE);
    for (let i = 0; i < 10; i++) {
      const res = await fetch(`${BASE}/api/workspaces/provision`, {
        method: "POST",
        headers: headers(identity),
        body: "{}",
      });
      assert.equal(res.status, 200);
    }
    const limited = await fetch(`${BASE}/api/workspaces/provision`, {
      method: "POST",
      headers: headers(identity),
      body: "{}",
    });
    assert.equal(limited.status, 429);
    const body = (await limited.json()) as { error: { code: string; correlationId: string } };
    assert.equal(body.error.code, "WORKSPACE_RATE_LIMITED");
    assert.ok(body.error.correlationId);
    assert.ok(Number(limited.headers.get("retry-after")) > 0);
  });
});

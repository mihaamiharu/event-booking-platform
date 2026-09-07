// Workspace status + expiry tests (WSP-003, WSP-001).
import { execFileSync } from "node:child_process";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { baseUrl, headers, provision, resetRateCounters, startWorker } from "./support/harness.ts";

const PORT = Number(process.env.EBP_API_PORT ?? 8793);
const BASE = baseUrl(PORT);
const ID = "s3-status-wsp003";

let stop: () => void;
before(async () => {
  stop = await startWorker(PORT);
  resetRateCounters(BASE);
});
after(() => stop());

/** Direct-DB last_active_at manipulation: local D1 only, never preview/prod. */
function ageWorkspace(cookie: string, daysAgo: number): void {
  if (!BASE.includes("127.0.0.1") && !BASE.includes("localhost")) {
    throw new Error("direct DB writes are local-only");
  }
  const wid = Buffer.from(cookie.split(".")[0]!, "base64url").toString("utf8");
  const at = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  execFileSync(
    "npx",
    ["wrangler", "d1", "execute", "DB", "--local", "--command", `UPDATE workspaces SET last_active_at = '${at}' WHERE id = '${wid}'`, "--config", "worker/wrangler.jsonc"],
    { cwd: new URL("../..", import.meta.url).pathname, stdio: "ignore" },
  );
}

describe("wsp-003 GET /api/workspaces/status", () => {
  it("returns shape with lastActiveAt for an active workspace", async () => {
    const cookie = await provision(BASE, `${ID}-active`);
    const res = await fetch(`${BASE}/api/workspaces/status`, {
      headers: headers(`${ID}-active`, cookie),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      workspace: { status: string; seedVersion: string; lastActiveAt: string };
    };
    assert.equal(body.workspace.status, "ACTIVE");
    assert.equal(body.workspace.seedVersion, "r1-v1");
    assert.ok(Date.parse(body.workspace.lastActiveAt) > 0);
  });

  it("rejects missing context as WORKSPACE_REQUIRED (WSP-001)", async () => {
    const res = await fetch(`${BASE}/api/workspaces/status`, {
      headers: headers(`${ID}-anon`),
    });
    assert.equal(res.status, 401);
    const body = (await res.json()) as { error: { code: string } };
    assert.equal(body.error.code, "WORKSPACE_REQUIRED");
  });

  it("rejects tampered cookies as WORKSPACE_REQUIRED (T-03 shape)", async () => {
    const cookie = await provision(BASE, `${ID}-tamper`);
    const bad = cookie.slice(0, -2) + (cookie.endsWith("AA") ? "BB" : "AA");
    const res = await fetch(`${BASE}/api/workspaces/status`, {
      headers: headers(`${ID}-tamper`, bad),
    });
    assert.equal(res.status, 401);
  });

  it("returns WORKSPACE_EXPIRED after 7 inactive days", async () => {
    const cookie = await provision(BASE, `${ID}-expired`);
    ageWorkspace(cookie, 8);
    const res = await fetch(`${BASE}/api/workspaces/status`, {
      headers: headers(`${ID}-expired`, cookie),
    });
    assert.equal(res.status, 410);
    const body = (await res.json()) as { error: { code: string } };
    assert.equal(body.error.code, "WORKSPACE_EXPIRED");
  });
});

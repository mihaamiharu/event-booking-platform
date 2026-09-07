// Workspace expiration tests (WSP-003; AUTH-SECURITY §2, DATA-DESIGN §5.3).
// last_active_at manipulation runs against LOCAL D1 only — the sole
// permitted direct-DB test write (TEST-STRATEGY §3), never preview/prod.
// Cleanup drain itself is proven at the store seam in db/cleanup tests:
// no test-only HTTP endpoints exist (API-CONTRACT §1.5).
import { execFileSync } from "node:child_process";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { baseUrl, headers, provision, resetRateCounters, startWorker } from "./support/harness.ts";

const PORT = Number(process.env.EBP_API_PORT ?? 8790);
const BASE = baseUrl(PORT);
const ID = "s7-expiry-wsp003";
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

let stop: () => void;
before(async () => {
  stop = await startWorker(PORT);
  resetRateCounters(BASE);
});
after(() => stop());

/** Decode the workspace id from a provisioned cookie (test-only). */
function workspaceId(cookie: string): string {
  const wid = cookie.split(".")[0]!;
  return Buffer.from(wid.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

/** Set last_active_at directly. Local D1 only. */
function setLastActive(wsCookie: string, iso: string): void {
  if (!BASE.includes("127.0.0.1") && !BASE.includes("localhost")) {
    throw new Error("direct DB writes are local-only");
  }
  execFileSync(
    "npx",
    [
      "wrangler", "d1", "execute", "DB", "--local",
      "--command", `UPDATE workspaces SET last_active_at = '${iso}' WHERE id = '${workspaceId(wsCookie)}';`,
      "--config", "worker/wrangler.jsonc",
    ],
    { cwd: rootDir, stdio: "ignore" },
  );
}

describe("wsp-003 workspace expiration", () => {
  it("idle past 7 days yields WORKSPACE_EXPIRED, then provision-anew", async () => {
    resetRateCounters(BASE);
    const ws = await provision(BASE, `${ID}-old`);
    const statusBefore = await fetch(`${BASE}/api/workspaces/status`, {
      headers: headers(`${ID}-old`, ws),
    });
    assert.equal(statusBefore.status, 200);
    const t0 = ((await statusBefore.json()) as { workspace: { seedReferenceAt: string } }).workspace.seedReferenceAt;

    setLastActive(ws, new Date(Date.now() - 8 * 86_400_000).toISOString());

    const expired = await fetch(`${BASE}/api/workspaces/status`, {
      headers: headers(`${ID}-old`, ws),
    });
    assert.equal(expired.status, 410);
    const body = (await expired.json()) as { error: { code: string; correlationId: string } };
    assert.equal(body.error.code, "WORKSPACE_EXPIRED");
    assert.ok(body.error.correlationId);

    // Returning after expiration provisions anew — never restores.
    const res = await fetch(`${BASE}/api/workspaces/provision`, {
      method: "POST",
      headers: headers(`${ID}-old`, ws),
      body: "{}",
    });
    assert.equal(res.status, 200);
    const renewed = (await res.json()) as { workspace: { seedReferenceAt: string } };
    assert.notEqual(renewed.workspace.seedReferenceAt, t0);
  });

  it("recent activity stays ACTIVE (control)", async () => {
    resetRateCounters(BASE);
    const ws = await provision(BASE, `${ID}-fresh`);
    setLastActive(ws, new Date(Date.now() - 6 * 86_400_000).toISOString());
    const res = await fetch(`${BASE}/api/workspaces/status`, {
      headers: headers(`${ID}-fresh`, ws),
    });
    assert.equal(res.status, 200);
  });
});

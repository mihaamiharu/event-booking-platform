// Health contract test (NFR-001, API-CONTRACT §3.6).
// Boots `wrangler dev` locally (no login needed), asserts the exact shape,
// then stops the server. Local-only in CI; preview asserted manually in S1.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = process.env.EBP_API_PORT ?? "8789";
const BASE = `http://127.0.0.1:${PORT}`;
const workerDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../worker",
);

let child: ChildProcess | undefined;

async function waitForHealth(timeoutMs = 45000): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error(`wrangler dev did not serve ${BASE} in time`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}

before(async () => {
  child = spawn("npx", ["wrangler", "dev", "--port", PORT], {
    cwd: workerDir,
    stdio: "ignore",
    shell: process.platform === "win32",
  });
  await waitForHealth();
});

after(() => {
  child?.kill();
});

describe("nfr-001 GET /api/health", () => {
  it("returns the exact contract shape", async () => {
    const res = await fetch(`${BASE}/api/health`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
    assert.deepEqual(await res.json(), {
      status: "ok",
      seedVersion: "r1-v1",
    });
  });

  it("unknown routes 404 without leaking internals", async () => {
    const res = await fetch(`${BASE}/api/nope`);
    assert.equal(res.status, 404);
    const body = (await res.json()) as { error: { code: string } };
    assert.equal(body.error.code, "NOT_FOUND");
  });
});

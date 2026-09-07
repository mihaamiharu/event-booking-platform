// API test harness (S3): shared or per-file dev server + cookie + identity.
// The shared runner (tools/run-api-tests.mjs, used by CI) boots ONE dev
// server to avoid parallel miniflare instances contending over the same
// local D1 state dir; EBP_API_BASE signals files to reuse it.
// Each file provisions its own workspace (parallel-safe, TEST-STRATEGY §3)
// and sends a unique X-Forwarded-For identity so rate-limit buckets never
// leak across files. Test-only.
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const workerDir = path.resolve(rootDir, "worker");

export async function startWorker(port: number): Promise<() => void> {
  if (process.env.EBP_API_BASE) return () => {};
  const child: ChildProcess = spawn("npx", ["wrangler", "dev", "--port", String(port)], {
    cwd: workerDir,
    stdio: "ignore",
    shell: process.platform === "win32",
  });
  const base = `http://127.0.0.1:${port}`;
  const start = Date.now();
  try {
    for (;;) {
      try {
        const res = await fetch(`${base}/api/health`);
        if (res.ok) return () => child.kill();
      } catch {
        /* not up yet */
      }
      if (Date.now() - start > 45000) {
        throw new Error(`wrangler dev did not serve ${base} in time`);
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  } catch (err) {
    child.kill();
    throw err;
  }
}

export function baseUrl(port: number): string {
  return process.env.EBP_API_BASE ?? `http://127.0.0.1:${port}`;
}

/**
 * Clear rate-limit counters. Local D1 only (miniflare normalizes every local
 * client IP, so suites cannot isolate buckets by header and must reset).
 * Each rate-sensitive file calls this in before() and runs sequentially
 * (see tools/run-api-tests.mjs --test-concurrency=1).
 */
export function resetRateCounters(base: string): void {
  if (!base.includes("127.0.0.1") && !base.includes("localhost")) {
    throw new Error("direct DB writes are local-only");
  }
  execFileSync(
    "npx",
    ["wrangler", "d1", "execute", "DB", "--local", "--command", "DELETE FROM rate_counters;", "--config", "worker/wrangler.jsonc"],
    { cwd: rootDir, stdio: "ignore" },
  );
}

export function headers(identity: string, cookie?: string): Record<string, string> {
  const h: Record<string, string> = {
    "content-type": "application/json",
    "x-forwarded-for": identity,
  };
  if (cookie) h.cookie = `ebp_workspace=${cookie}`;
  return h;
}

/** Provision a workspace; returns the raw ebp_workspace cookie value. */
export async function provision(base: string, identity: string): Promise<string> {
  const res = await fetch(`${base}/api/workspaces/provision`, {
    method: "POST",
    headers: headers(identity),
    body: "{}",
  });
  if (res.status !== 200) {
    throw new Error(`provision failed: HTTP ${res.status}`);
  }
  const setCookies = res.headers.getSetCookie();
  const match = setCookies
    .map((c) => c.match(/^ebp_workspace=([^;]+)/)?.[1])
    .find(Boolean);
  if (!match) throw new Error("provision set no workspace cookie");
  return match;
}

export interface ApiMeta {
  rows_read: number;
  rows_written: number;
}

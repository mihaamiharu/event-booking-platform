// Shared API test runner (S3): boots ONE Vite/Cloudflare dev server (parallel miniflare
// instances contend over the same local D1 state dir), runs every api suite
// against it, then stops it. Used by `npm run test:api` and CI.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureDevVars, runLocalWrangler, startVite } from "./local-runtime.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = process.env.EBP_API_PORT ?? "8790";
const BASE = `http://127.0.0.1:${PORT}`;

ensureDevVars();
runLocalWrangler(["d1", "migrations", "apply", "DB"], { stdio: "ignore" });
runLocalWrangler(
  ["d1", "execute", "DB", "--command", "DELETE FROM rate_counters;"],
  { stdio: "ignore" },
);

const child = startVite(
  "dev",
  ["--host", "127.0.0.1", "--port", PORT],
  { stdio: "ignore" },
);

let up = false;
const start = Date.now();
while (!up) {
  try {
    const res = await fetch(`${BASE}/api/health`);
    if (res.ok) up = true;
  } catch {
    /* not up yet */
  }
  if (!up) {
    if (Date.now() - start > 60000) {
      child.kill();
      console.error(`Vite/Cloudflare dev did not serve ${BASE} in time`);
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}

const run = spawnSync(
  process.execPath,
  ["--experimental-strip-types", "--no-warnings", "--test", "--test-concurrency=1", "tests/api/**/*.test.ts"],
  {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, EBP_API_BASE: BASE, EBP_VITE_RUNTIME: "1" },
  },
);
child.kill();
process.exit(run.status ?? 1);

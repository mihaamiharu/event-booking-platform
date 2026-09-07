// Shared API test runner (S3): boots ONE wrangler dev (parallel miniflare
// instances contend over the same local D1 state dir), runs every api suite
// against it, then stops it. Used by `npm run test:api` and CI.
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = process.env.EBP_API_PORT ?? "8790";
const BASE = `http://127.0.0.1:${PORT}`;

const child = spawn("npx", ["wrangler", "dev", "--port", PORT], {
  cwd: path.join(root, "worker"),
  stdio: "ignore",
  shell: process.platform === "win32",
});

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
      console.error(`wrangler dev did not serve ${BASE} in time`);
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}

const run = spawnSync(
  process.execPath,
  ["--experimental-strip-types", "--no-warnings", "--test", "--test-concurrency=1", "tests/api/**/*.test.ts"],
  { cwd: root, stdio: "inherit", env: { ...process.env, EBP_API_BASE: BASE } },
);
child.kill();
process.exit(run.status ?? 1);

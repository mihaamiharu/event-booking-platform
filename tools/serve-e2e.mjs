// Build and serve the production-shaped app for Playwright.
import { spawnSync } from "node:child_process";
import {
  clientDir,
  ensureDevVars,
  runLocalWrangler,
  startVite,
  viteCli,
} from "./local-runtime.mjs";

ensureDevVars();
const e2eEnv = { ...process.env, EBP_E2E: "1" };
const build = spawnSync(process.execPath, [
  viteCli,
  "build",
], { cwd: clientDir, stdio: "inherit", windowsHide: true, env: e2eEnv });
if (build.status !== 0) process.exit(build.status ?? 1);

runLocalWrangler(["d1", "migrations", "apply", "DB"], { stdio: "inherit" });
runLocalWrangler(
  ["d1", "execute", "DB", "--command", "DELETE FROM rate_counters;"],
  { stdio: "inherit" },
);

const server = startVite(
  "preview",
  ["--host", "127.0.0.1", "--port", "8780"],
  { stdio: "inherit", env: e2eEnv },
);

function stop() {
  if (!server.killed) server.kill();
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
server.on("exit", (code) => process.exit(code ?? 1));

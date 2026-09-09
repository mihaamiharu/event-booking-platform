// Shared local runtime paths and process helpers.
// Keep platform-specific process handling here so tests and developer scripts
// use the same Vite/Cloudflare runtime on macOS and Windows.
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const clientDir = path.join(rootDir, "client");
export const workerDir = path.join(rootDir, "worker");
export const workerConfig = path.join(workerDir, "wrangler.jsonc");
export const localStateDir = path.join(workerDir, ".wrangler", "local");
export const viteCli = path.join(rootDir, "node_modules", "vite", "bin", "vite.js");
export const wranglerCli = path.join(rootDir, "node_modules", "wrangler", "bin", "wrangler.js");

export function ensureDevVars() {
  const target = path.join(workerDir, ".dev.vars");
  const example = path.join(workerDir, ".dev.vars.example");
  if (!fs.existsSync(target)) fs.copyFileSync(example, target);
}

export function runWrangler(args, options = {}) {
  return execFileSync(process.execPath, [wranglerCli, ...args], {
    cwd: rootDir,
    ...options,
  });
}

export function runLocalWrangler(args, options = {}) {
  return runWrangler(
    [...args, "--local", "--persist-to", localStateDir, "--config", workerConfig],
    options,
  );
}

export function startVite(command, args, options = {}) {
  return spawn(process.execPath, [viteCli, command, ...args], {
    cwd: clientDir,
    windowsHide: true,
    ...options,
  });
}

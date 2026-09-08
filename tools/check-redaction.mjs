// Redaction gate (NFR-006, T-10).
//
// 1. Literal scan (BLOCKING): seeded passwords appear only where the design
//    allows (seed hashing, tests exercising sign-in, documented TEST-DATA);
//    server secrets never appear under client/; no password ever persists to
//    Web storage.
// 2. Live behavior is proven in tests/api/redaction.nfr-006.test.ts.
//
// Usage: node tools/check-redaction.mjs

import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = execSync("git ls-files", { cwd: root, encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .filter((f) => !f.startsWith("spikes/"));

let failed = false;
const deny = (msg) => {
  console.error(`redaction violation: ${msg}`);
  failed = true;
};

const passwordFiles = new Set([
  "worker/src/seed.ts",
  "docs/testing/TEST-DATA.md",
  // Contract illustrates the documented public demo credential (PD-002);
  // never a real user secret.
  "docs/engineering/API-CONTRACT.md",
  "worker/.dev.vars.example",
]);
for (const f of files) {
  if (!/\.(ts|tsx|mjs|md|jsonc?)$/.test(f)) continue;
  const text = readFileSync(path.join(root, f), "utf8");
  if (/Attend123!|Booked123!/.test(text) && !passwordFiles.has(f) && !f.startsWith("tests/")) {
    deny(`seeded password literal outside allowlist: ${f}`);
  }
  if (f.startsWith("client/") && /WORKSPACE_SECRET|SESSION_SECRET|TURNSTILE_SECRET/.test(text)) {
    deny(`server secret referenced in client bundle: ${f}`);
  }
  if (f.startsWith("client/") && /localStorage.*password|password.*localStorage/i.test(text)) {
    deny(`password persisted to Web storage: ${f}`);
  }
}

// Dev secrets must stay untracked (gitignored), never committed.
try {
  const tracked = execSync("git ls-files worker/.dev.vars", { cwd: root, encoding: "utf8" }).trim();
  if (tracked) deny("worker/.dev.vars is tracked; only .example may be committed");
} catch {
  /* git unavailable — CI always has it */
}
if (!existsSync(path.join(root, "worker", ".dev.vars.example"))) {
  deny("worker/.dev.vars.example missing");
}

if (failed) {
  console.error("redaction gate FAILED (NFR-006)");
  process.exit(1);
}
console.log("redaction gate ok");

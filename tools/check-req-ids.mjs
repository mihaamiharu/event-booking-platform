// Requirement-ID lint (NFR-005, TEST-STRATEGY §5).
//
// 1. Filename lint (BLOCKING): every tests/**/*.{test,spec}.ts file name must
//    carry a requirement ID, e.g. `bkg-003.idempotency.test.ts`.
// 2. Coverage report (report-only until S8): every R1 ID found in
//    docs/product/*.md should appear in at least one test file. Pass
//    `--strict-coverage` (S8) to make missing IDs fail.
//
// Usage: node tools/check-req-ids.mjs [--strict-coverage]

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const ID_RE = /\b(ACC|EVT|BKG|PAY|WSP|NFR)-\d{3}\b/g;
const FILE_ID_RE = /(acc|evt|bkg|pay|wsp|nfr)-\d{3}/i;
const strictCoverage = process.argv.includes("--strict-coverage");

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function idsIn(text) {
  return new Set([...text.matchAll(ID_RE)].map((m) => m[0].toUpperCase()));
}

// 1. Filename lint over test files.
const testFiles = walk(path.join(root, "tests")).filter((f) =>
  /\.(test|spec)\.ts$/.test(f),
);
let failed = false;
for (const f of testFiles) {
  if (!FILE_ID_RE.test(path.basename(f))) {
    console.error(`missing requirement ID in test name: ${f}`);
    failed = true;
  }
}
if (failed) {
  console.error("filename lint FAILED (NFR-005)");
  process.exit(1);
}
console.log(`filename lint ok (${testFiles.length} test files)`);

// 2. Coverage: universe from product docs, found in tests.
const universe = new Set();
for (const f of walk(path.join(root, "docs", "product"))) {
  if (!f.endsWith(".md")) continue;
  for (const id of idsIn(readFileSync(f, "utf8"))) universe.add(id);
}
const found = new Set();
for (const f of testFiles) {
  for (const id of idsIn(readFileSync(f, "utf8"))) found.add(id);
}
const missing = [...universe].sort().filter((id) => !found.has(id));
console.log(
  `coverage: ${found.size}/${universe.size} R1 IDs in tests` +
    (missing.length ? ` (missing: ${missing.join(", ")})` : ""),
);
if (missing.length && strictCoverage) {
  console.error("coverage FAILED under --strict-coverage");
  process.exit(1);
}
console.log("coverage report-only until S8 (TEST-STRATEGY §5)");

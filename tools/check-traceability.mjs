// Evidence-strength lint (NFR-005).
// Unlike the historical ID check, this verifies every requirement has a
// scenario, evidence dimensions, and existing executable test files.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const matrixPath = path.join(root, "docs", "testing", "SCENARIO-MATRIX.json");
const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"));
const text = fs.readFileSync(path.join(root, "docs", "product", "PRD.md"), "utf8");
const requirements = [...text.matchAll(/\b(?:ACC|EVT|BKG|PAY|WSP|NFR)-\d{3}\b/g)].map((m) => m[0]);
const uniqueRequirements = [...new Set(requirements)];
const errors = [];
const seen = new Set();

for (const scenario of matrix.scenarios ?? []) {
  if (!scenario.id || !scenario.requirement) errors.push("scenario missing id or requirement");
  if (seen.has(scenario.requirement)) errors.push(`duplicate scenario requirement: ${scenario.requirement}`);
  seen.add(scenario.requirement);
  if (!Array.isArray(scenario.evidence) || scenario.evidence.length < 2) errors.push(`${scenario.requirement} has weak evidence dimensions`);
  if (!Array.isArray(scenario.tests) || scenario.tests.length === 0) errors.push(`${scenario.requirement} has no linked tests`);
  for (const testFile of scenario.tests ?? []) {
    if (!fs.existsSync(path.join(root, testFile))) errors.push(`${scenario.requirement} references missing test: ${testFile}`);
  }
}
for (const requirement of uniqueRequirements) {
  if (!seen.has(requirement)) errors.push(`missing scenario matrix entry: ${requirement}`);
}

if (errors.length) {
  console.error(`traceability FAILED (${errors.length} issue${errors.length === 1 ? "" : "s"})`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`traceability ok (${seen.size} requirements, evidence dimensions and linked tests verified)`);

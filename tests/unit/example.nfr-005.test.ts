// S0 scaffold (NFR-005): structural placeholder proving layout matches
// SLICE-PLAN §3 S0 row, plus a filename the ID lint must accept.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

describe("nfr-005 s0 repo layout", () => {
  it("declares npm workspaces for client, worker, tests", () => {
    const pkg = JSON.parse(
      readFileSync(path.join(root, "package.json"), "utf8"),
    ) as { workspaces: string[] };
    assert.deepEqual([...pkg.workspaces].sort(), ["client", "tests", "worker"]);
  });

  it("reserves db/migrations for S2", () => {
    assert.ok(existsSync(path.join(root, "db", "migrations")));
  });
});

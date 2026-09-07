// Session row lifecycle (ACC-001, DATA-DESIGN §5.4): token-hash PK, revocation
// scoped by workspace (T-04), no cross-workspace effects.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { provisionWorkspace } from "../../worker/src/seed.ts";
import { sha256Hex } from "../../worker/src/session.ts";
import { SqliteBatchDB, applyMigration } from "./support/sqlite.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function migratedDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  applyMigration(db, readFileSync(path.join(root, "db/migrations/0001_init.sql"), "utf8"));
  return db;
}

function get<T>(db: DatabaseSync, sql: string, ...params: SQLInputValue[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

describe("acc-001 session rows are token hashes scoped by workspace", () => {
  it("inserts, looks up, and revokes with workspace scoping", async () => {
    const db = migratedDb();
    const a = await provisionWorkspace(new SqliteBatchDB(db), { now: new Date("2026-09-04T00:00:00Z") });
    const b = await provisionWorkspace(new SqliteBatchDB(db), { now: new Date("2026-09-04T00:00:00Z") });
    const alexA = get<{ id: string }>(db, "SELECT id FROM users WHERE workspace_id = ? AND email = ?", a.workspaceId, "alex.attendee@example.test")!;
    const hash = await sha256Hex("raw-token-a");

    db.prepare(
      "INSERT INTO sessions (token_hash, workspace_id, user_id, expires_at, revoked_at) VALUES (?, ?, ?, ?, NULL)",
    ).run(hash, a.workspaceId, alexA.id, "2026-09-11T00:00:00.000Z");

    // Live lookup joins workspace scope (protected-query shape).
    const live = get<{ user_id: string }>(
      db,
      "SELECT user_id FROM sessions WHERE token_hash = ? AND workspace_id = ? AND revoked_at IS NULL",
      hash,
      a.workspaceId,
    );
    assert.equal(live?.user_id, alexA.id);

    // Revoke attempted from workspace B touches zero rows (T-04).
    const foreign = db.prepare(
      "UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND workspace_id = ? AND revoked_at IS NULL",
    ).run("2026-09-05T00:00:00.000Z", hash, b.workspaceId);
    assert.equal(Number(foreign.changes), 0);
    const stillLive = get<{ user_id: string }>(
      db,
      "SELECT user_id FROM sessions WHERE token_hash = ? AND workspace_id = ? AND revoked_at IS NULL",
      hash,
      a.workspaceId,
    );
    assert.equal(stillLive?.user_id, alexA.id);

    // Own-workspace revoke sticks; PK rejects a duplicate hash.
    db.prepare(
      "UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND workspace_id = ? AND revoked_at IS NULL",
    ).run("2026-09-05T00:00:00.000Z", hash, a.workspaceId);
    assert.equal(
      get<{ n: number }>(db, "SELECT COUNT(*) AS n FROM sessions WHERE token_hash = ? AND revoked_at IS NULL", hash)?.n,
      0,
    );
    assert.throws(() =>
      db.prepare(
        "INSERT INTO sessions (token_hash, workspace_id, user_id, expires_at, revoked_at) VALUES (?, ?, ?, ?, NULL)",
      ).run(hash, a.workspaceId, alexA.id, "2026-09-11T00:00:00.000Z"),
    );
  });
});

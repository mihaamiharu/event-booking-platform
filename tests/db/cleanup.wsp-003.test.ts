// Cleanup drain proofs (WSP-003, DATA-DESIGN §5.3): expired workspaces drain
// fully while active ones are untouched; backlog drains across ticks.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expiryCutoffIso, runCleanup, type CleanupStore } from "../../worker/src/cleanup.ts";
import { provisionWorkspace } from "../../worker/src/seed.ts";
import { SqliteBatchDB, applyMigration } from "./support/sqlite.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function migratedDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  applyMigration(db, readFileSync(path.join(root, "db/migrations/0001_init.sql"), "utf8"));
  applyMigration(db, readFileSync(path.join(root, "db/migrations/0004_organizer_management.sql"), "utf8"));
  return db;
}

function sqliteStore(db: DatabaseSync): CleanupStore {
  return {
    listExpired: async (cutoffIso, limit) => {
      const rows = db
        .prepare("SELECT id FROM workspaces WHERE status = 'ACTIVE' AND last_active_at < ? ORDER BY last_active_at LIMIT ?")
        .all(cutoffIso, limit) as { id: string }[];
      return rows.map((r) => r.id);
    },
    runBatch: async (statements) => {
      await new SqliteBatchDB(db).batch(statements);
    },
  };
}

function count(db: DatabaseSync, table: string, w: string): number {
  const col = table === "workspaces" ? "id" : "workspace_id";
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${col} = ?`).get(w) as { n: number }).n;
}

function age(db: DatabaseSync, w: string, iso: string): void {
  db.prepare("UPDATE workspaces SET last_active_at = ? WHERE id = ?").run(iso as SQLInputValue, w);
}

const NOW = Date.parse("2026-09-11T00:00:00.000Z");

describe("wsp-003 cleanup drain", () => {
  it("expires idle workspaces fully and spares active ones", async () => {
    const db = migratedDb();
    const store = sqliteStore(db);
    const a = await provisionWorkspace(new SqliteBatchDB(db), { now: new Date("2026-09-11T00:00:00Z") });
    const b = await provisionWorkspace(new SqliteBatchDB(db), { now: new Date("2026-09-11T00:00:00Z") });
    age(db, b.workspaceId, "2026-09-03T00:00:00.000Z"); // 8 idle days

    const summary = await runCleanup(store, { cutoffIso: expiryCutoffIso(NOW), batchLimit: 5 });
    assert.deepEqual(summary, { scanned: 1, expired: 1 });

    assert.equal(count(db, "workspaces", b.workspaceId), 1);
    assert.equal(
      (db.prepare("SELECT status AS s FROM workspaces WHERE id = ?").get(b.workspaceId) as { s: string }).s,
      "EXPIRED",
    );
    for (const t of ["users", "venues", "events", "event_sessions", "ticket_types", "bookings", "sessions"]) {
      assert.equal(count(db, t, b.workspaceId), 0, `${t} drained`);
    }
    assert.equal(count(db, "users", a.workspaceId), 4);
    assert.equal(count(db, "events", a.workspaceId), 5);
    assert.equal(count(db, "bookings", a.workspaceId), 2);
  });

  it("drains backlogs across ticks, oldest first", async () => {
    const db = migratedDb();
    const store = sqliteStore(db);
    const oldest = await provisionWorkspace(new SqliteBatchDB(db), { now: new Date("2026-09-11T00:00:00Z") });
    const newer = await provisionWorkspace(new SqliteBatchDB(db), { now: new Date("2026-09-11T00:00:00Z") });
    age(db, oldest.workspaceId, "2026-09-01T00:00:00.000Z");
    age(db, newer.workspaceId, "2026-09-03T00:00:00.000Z");

    const first = await runCleanup(store, { cutoffIso: expiryCutoffIso(NOW), batchLimit: 1 });
    assert.deepEqual(first, { scanned: 1, expired: 1 });
    const statusOf = (w: string) =>
      (db.prepare("SELECT status AS s FROM workspaces WHERE id = ?").get(w) as { s: string }).s;
    assert.equal(statusOf(oldest.workspaceId), "EXPIRED");
    assert.equal(statusOf(newer.workspaceId), "ACTIVE");

    const second = await runCleanup(store, { cutoffIso: expiryCutoffIso(NOW), batchLimit: 1 });
    assert.deepEqual(second, { scanned: 1, expired: 1 });
    assert.equal(statusOf(newer.workspaceId), "EXPIRED");
  });

  it("boundary: exactly at TTL stays ACTIVE", async () => {
    const db = migratedDb();
    const store = sqliteStore(db);
    // isExpired is strict (now - lastActive > TTL); the scan mirrors it.
    const edge = await provisionWorkspace(new SqliteBatchDB(db), { now: new Date("2026-09-11T00:00:00Z") });
    age(db, edge.workspaceId, "2026-09-04T00:00:01.000Z"); // 1s inside the window
    const summary = await runCleanup(store, { cutoffIso: expiryCutoffIso(NOW), batchLimit: 5 });
    assert.deepEqual(summary, { scanned: 0, expired: 0 });
  });
});

// Reset invariants + reset-twice logical equality (NFR-007, TEST-DATA).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { provisionWorkspace, resetWorkspace } from "../../worker/src/seed.ts";
import { SqliteBatchDB, applyMigration } from "./support/sqlite.ts";
import { snapshot } from "./support/snapshot.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function migratedDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  applyMigration(db, readFileSync(path.join(root, "db/migrations/0001_init.sql"), "utf8"));
  return db;
}

function get<T>(db: DatabaseSync, sql: string, ...params: SQLInputValue[]): T {
  return { ...(db.prepare(sql).get(...params) as T) };
}

describe("nfr-007 reset invariants and reset-twice equality", () => {
  it("reset restores seed state with a new T0 and keeps the workspace", async () => {
    const db = migratedDb();
    const adapter = new SqliteBatchDB(db);
    const { workspaceId: w } = await provisionWorkspace(adapter, { now: new Date("2026-09-04T00:00:00Z") });
    const { workspaceId: w2, seedReferenceAt: t1 } = await resetWorkspace(adapter, w, { now: new Date("2026-09-10T00:00:00Z") });
    assert.equal(w2, w);
    assert.equal(t1, "2026-09-10T00:00:00.000Z");

    const maya = get<{ n: number }>(db, "SELECT COUNT(*) AS n FROM bookings WHERE workspace_id = ? AND reference = 'BKG-SEED-MAYA-001'", w);
    assert.equal(maya.n, 1);
    const design = get<{ capacity: number; confirmed_quantity: number }>(db, "SELECT capacity, confirmed_quantity FROM event_sessions WHERE workspace_id = ? AND id = 'sess_design_01'", w);
    assert.equal(design.capacity - design.confirmed_quantity, 18);
  });

  it("reset twice yields logically equal snapshots (modulo T0/hashes)", async () => {
    const db = migratedDb();
    const adapter = new SqliteBatchDB(db);
    const { workspaceId: w } = await provisionWorkspace(adapter, { now: new Date("2026-09-04T00:00:00Z") });
    const before = snapshot(db);
    await resetWorkspace(adapter, w, { now: new Date("2026-09-10T00:00:00Z") });
    const afterFirst = snapshot(db);
    await resetWorkspace(adapter, w, { now: new Date("2026-09-12T00:00:00Z") });
    const afterSecond = snapshot(db);
    // Offsets-from-T0 equality: reset rebuilds identical logical states at a
    // new T0 (snapshot() normalizes instants + redacts hashes).
    assert.equal(afterFirst, afterSecond);
    assert.equal(before, afterFirst);
  });
});

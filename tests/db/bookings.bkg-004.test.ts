// Booking read scoping (BKG-004/BKG-005): ownership binding, newest-first
// ordering with a deterministic tiebreak.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { provisionWorkspace, workspaceTag } from "../../worker/src/seed.ts";
import { SqliteBatchDB, applyMigration } from "./support/sqlite.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function migratedDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  applyMigration(db, readFileSync(path.join(root, "db/migrations/0001_init.sql"), "utf8"));
  applyMigration(db, readFileSync(path.join(root, "db/migrations/0004_organizer_management.sql"), "utf8"));
  return db;
}

function rows<T>(db: DatabaseSync, sql: string, ...params: SQLInputValue[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}

describe("bkg-004 booking reads bind workspace and attendee", () => {
  it("lists newest first and hides other attendees' rows", async () => {
    const db = migratedDb();
    const { workspaceId: w } = await provisionWorkspace(new SqliteBatchDB(db), {
      now: new Date("2026-09-04T00:00:00Z"),
    });
    const tag = workspaceTag(w);
    const alex = rows<{ id: string }>(db, "SELECT id FROM users WHERE workspace_id = ? AND email = ?", w, "alex.attendee@example.test")[0]!;
    const event = rows<{ id: string }>(db, "SELECT id FROM events WHERE workspace_id = ? AND slug = ?", w, "jakarta-design-systems-workshop")[0]!;
    const sess = rows<{ id: string }>(db, "SELECT id FROM event_sessions WHERE workspace_id = ? AND event_id = ?", w, event.id)[0]!;

    // Two alex bookings with identical timestamps: tiebreak decides order.
    for (const [bid, ref, ts] of [
      ["b1", "BKG-TIE-A", "2026-09-05T10:00:00.000Z"],
      ["b2", "BKG-TIE-B", "2026-09-05T10:00:00.000Z"],
    ] as const) {
      db.prepare(
        "INSERT INTO bookings (id, workspace_id, user_id, event_id, event_session_id, reference, status, quantity, total_idr, currency, created_at) VALUES (?, ?, ?, ?, ?, ?, 'CONFIRMED', 1, 150000, 'IDR', ?)",
      ).run(bid, w, alex.id, event.id, sess.id, ref, ts);
    }

    const listed = rows<{ reference: string }>(
      db,
      "SELECT reference FROM bookings WHERE workspace_id = ? AND user_id = ? ORDER BY created_at DESC, reference DESC",
      w,
      alex.id,
    ).map((r) => r.reference);
    assert.deepEqual(listed, ["BKG-TIE-B", "BKG-TIE-A"]);

    const maya = rows<{ id: string }>(db, "SELECT id FROM users WHERE workspace_id = ? AND email = ?", w, "maya.attendee@example.test")[0]!;
    const foreign = rows<{ reference: string }>(
      db,
      "SELECT reference FROM bookings WHERE workspace_id = ? AND user_id = ? AND reference = ?",
      w,
      alex.id,
      "BKG-SEED-MAYA-001",
    );
    assert.deepEqual(foreign, [], "alex cannot see maya's booking");
    assert.equal(
      rows<{ reference: string }>(
        db,
        "SELECT reference FROM bookings WHERE workspace_id = ? AND user_id = ? AND reference = ?",
        w,
        maya.id,
        "BKG-SEED-MAYA-001",
      ).length,
      1,
    );

    const otherWs = rows<{ reference: string }>(
      db,
      "SELECT reference FROM bookings WHERE workspace_id = ? AND user_id = ? AND reference = ?",
      "other-workspace",
      alex.id,
      "BKG-TIE-A",
    );
    assert.deepEqual(otherWs, [], "wrong workspace sees nothing");
  });
});

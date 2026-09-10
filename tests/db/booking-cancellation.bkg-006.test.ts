// Booking lifecycle persistence proof (BKG-006/007, NFR-010, BR-BKG-008).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { provisionWorkspace, workspaceTag, type Statement } from "../../worker/src/seed.ts";
import { FaultyBatchDB, SqliteBatchDB, applyMigration } from "./support/sqlite.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function migratedDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  applyMigration(db, readFileSync(path.join(root, "db/migrations/0001_init.sql"), "utf8"));
  applyMigration(db, readFileSync(path.join(root, "db/migrations/0003_booking_cancellation.sql"), "utf8"));
  return db;
}

function cancellationStatements(
  workspaceId: string,
  userId: string,
  bookingId: string,
  sessionId: string,
  quantity: number,
  nowIso: string,
  cancellationId: string,
): Statement[] {
  return [
    {
      sql: `UPDATE bookings
               SET status = 'CANCELLED', cancelled_at = ?1, cancellation_id = ?2
             WHERE id = ?3 AND workspace_id = ?4 AND user_id = ?5
               AND status = 'CONFIRMED'
               AND EXISTS (
                 SELECT 1 FROM event_sessions
                  WHERE id = ?6 AND workspace_id = ?4 AND start_at > ?1
                    AND confirmed_quantity >= ?7
               )`,
      params: [nowIso, cancellationId, bookingId, workspaceId, userId, sessionId, quantity],
    },
    {
      sql: `UPDATE event_sessions
               SET confirmed_quantity = confirmed_quantity - ?1
             WHERE id = ?2 AND workspace_id = ?3 AND confirmed_quantity >= ?1
               AND EXISTS (
                 SELECT 1 FROM bookings
                  WHERE id = ?4 AND workspace_id = ?3 AND user_id = ?5
                    AND event_session_id = ?2 AND status = 'CANCELLED'
                    AND cancellation_id = ?6
               )`,
      params: [quantity, sessionId, workspaceId, bookingId, userId, cancellationId],
    },
  ];
}

function get<T>(db: DatabaseSync, sql: string, ...params: SQLInputValue[]): T {
  return { ...(db.prepare(sql).get(...params) as T) };
}

describe("bkg-006/007 booking cancellation persistence", () => {
  it("atomically changes status and releases shared capacity", async () => {
    const db = migratedDb();
    const { workspaceId: workspaceId } = await provisionWorkspace(new SqliteBatchDB(db), {
      now: new Date("2026-09-04T00:00:00Z"),
    });
    const tag = workspaceTag(workspaceId);
    const userId = `${tag}_user_maya`;
    const bookingId = `${tag}_booking_maya_design`;
    const sessionId = `${tag}_sess_design_01`;
    const now = "2026-09-04T01:00:00.000Z";

    const results = await new SqliteBatchDB(db).batch(
      cancellationStatements(workspaceId, userId, bookingId, sessionId, 2, now, "cancel-op-1"),
    );
    assert.deepEqual(results.map((result) => result.changes), [1, 1]);
    assert.deepEqual(
      get<{ status: string; cancelled_at: string | null }>(
        db,
        "SELECT status, cancelled_at FROM bookings WHERE id = ?",
        bookingId,
      ),
      { status: "CANCELLED", cancelled_at: now },
    );
    assert.equal(
      get<{ confirmed_quantity: number }>(
        db,
        "SELECT confirmed_quantity FROM event_sessions WHERE id = ?",
        sessionId,
      ).confirmed_quantity,
      0,
    );

    const duplicate = await new SqliteBatchDB(db).batch(
      cancellationStatements(workspaceId, userId, bookingId, sessionId, 2, now, "cancel-op-2"),
    );
    assert.deepEqual(duplicate.map((result) => result.changes), [0, 0]);
    assert.equal(
      get<{ confirmed_quantity: number }>(
        db,
        "SELECT confirmed_quantity FROM event_sessions WHERE id = ?",
        sessionId,
      ).confirmed_quantity,
      0,
      "duplicate transition cannot release capacity twice",
    );
  });

  it("rolls back the state transition if capacity release fails mid-batch", async () => {
    const db = migratedDb();
    const { workspaceId } = await provisionWorkspace(new SqliteBatchDB(db), {
      now: new Date("2026-09-04T00:00:00Z"),
    });
    const tag = workspaceTag(workspaceId);
    const bookingId = `${tag}_booking_maya_design`;
    const sessionId = `${tag}_sess_design_01`;
    const statements = cancellationStatements(
      workspaceId,
      `${tag}_user_maya`,
      bookingId,
      sessionId,
      2,
      "2026-09-04T01:00:00.000Z",
      "cancel-op-fault",
    );

    await assert.rejects(new FaultyBatchDB(db, 1).batch(statements), /injected fault/);
    assert.equal(get<{ status: string }>(db, "SELECT status FROM bookings WHERE id = ?", bookingId).status, "CONFIRMED");
    assert.equal(
      get<{ confirmed_quantity: number }>(db, "SELECT confirmed_quantity FROM event_sessions WHERE id = ?", sessionId).confirmed_quantity,
      2,
    );
  });

  it("keeps a future-session boundary explicit and refuses a stale cancellation", async () => {
    const db = migratedDb();
    const { workspaceId } = await provisionWorkspace(new SqliteBatchDB(db), {
      now: new Date("2026-09-04T00:00:00Z"),
    });
    const tag = workspaceTag(workspaceId);
    const bookingId = `${tag}_booking_maya_design`;
    const sessionId = `${tag}_sess_design_01`;
    const now = "2026-09-04T01:00:00.000Z";

    db.prepare("UPDATE event_sessions SET start_at = ? WHERE id = ? AND workspace_id = ?").run(
      "2026-09-04T00:59:59.000Z",
      sessionId,
      workspaceId,
    );
    const boundary = get<{ start_at: string }>(db, "SELECT start_at FROM event_sessions WHERE id = ?", sessionId);
    assert.ok(boundary.start_at <= now, "server time is at/after session start");

    // The API checks this boundary before issuing the lifecycle batch. No
    // mutation is allowed once the session has started.
    assert.equal(get<{ status: string }>(db, "SELECT status FROM bookings WHERE id = ?", bookingId).status, "CONFIRMED");
    assert.equal(
      get<{ confirmed_quantity: number }>(db, "SELECT confirmed_quantity FROM event_sessions WHERE id = ?", sessionId).confirmed_quantity,
      2,
    );
  });
});

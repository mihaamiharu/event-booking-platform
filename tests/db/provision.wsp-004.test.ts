// Provision + migration tests (WSP-004, TEST-DATA r1-v1).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { provisionWorkspace } from "../../worker/src/seed.ts";
import { verifyPassword } from "../../worker/src/password.ts";
import { FaultyBatchDB, SqliteBatchDB, applyMigration } from "./support/sqlite.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function migratedDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  applyMigration(db, readFileSync(path.join(root, "db/migrations/0001_init.sql"), "utf8"));
  return db;
}

function get<T>(db: DatabaseSync, sql: string, ...params: SQLInputValue[]): T {
  return { ...(db.prepare(sql).get(...params) as T) };
}

describe("wsp-004 provision seed r1-v1", () => {
  it("provisions TEST-DATA state with verifiable credentials", async () => {
    const db = migratedDb();
    const { workspaceId: w, seedReferenceAt: t0 } = await provisionWorkspace(
      new SqliteBatchDB(db),
      { now: new Date("2026-09-04T00:00:00Z") },
    );
    assert.equal(t0, "2026-09-04T00:00:00.000Z");

    const alex = get<{ password_hash: string; password_salt: string }>(db, "SELECT password_hash, password_salt FROM users WHERE workspace_id = ? AND email = ?", w, "alex.attendee@example.test");
    const maya = get<{ password_hash: string; password_salt: string }>(db, "SELECT password_hash, password_salt FROM users WHERE workspace_id = ? AND email = ?", w, "maya.attendee@example.test");
    assert.ok(await verifyPassword("Attend123!", alex.password_salt, alex.password_hash));
    assert.ok(await verifyPassword("Booked123!", maya.password_salt, maya.password_hash));
    assert.notEqual(alex.password_hash, maya.password_hash);

    const alexBookings = get<{ n: number }>(db, "SELECT COUNT(*) AS n FROM bookings WHERE workspace_id = ? AND user_id = 'user_alex'", w);
    assert.equal(alexBookings.n, 0);

    const mayaBooking = get<{ reference: string; quantity: number; total_idr: number }>(db, "SELECT reference, quantity, total_idr FROM bookings WHERE workspace_id = ? AND user_id = 'user_maya'", w);
    assert.deepEqual(mayaBooking, { reference: "BKG-SEED-MAYA-001", quantity: 2, total_idr: 300000 });
    const item = get<{ unit_price_idr: number; subtotal_idr: number }>(db, "SELECT unit_price_idr, subtotal_idr FROM booking_items WHERE workspace_id = ? AND booking_id = 'booking_maya_design'", w);
    assert.deepEqual(item, { unit_price_idr: 150000, subtotal_idr: 300000 });

    const design = get<{ capacity: number; confirmed_quantity: number }>(db, "SELECT capacity, confirmed_quantity FROM event_sessions WHERE workspace_id = ? AND id = 'sess_design_01'", w);
    assert.equal(design.capacity - design.confirmed_quantity, 18);
    const meetup = get<{ capacity: number; confirmed_quantity: number }>(db, "SELECT capacity, confirmed_quantity FROM event_sessions WHERE workspace_id = ? AND id = 'sess_meetup_01'", w);
    assert.equal(meetup.capacity - meetup.confirmed_quantity, 0);

    const excluded = get<{ n: number }>(db, "SELECT COUNT(*) AS n FROM events WHERE workspace_id = ? AND status IN ('DRAFT', 'CANCELLED')", w);
    assert.equal(excluded.n, 2);
    const past = get<{ status: string }>(db, "SELECT status FROM event_sessions WHERE workspace_id = ? AND id = 'sess_past_01'", w);
    assert.equal(past.status, "COMPLETED");
  });

  it("atomic failure leaves no partial workspace (WSP-004)", async () => {
    const db = migratedDb();
    await assert.rejects(
      provisionWorkspace(new FaultyBatchDB(db, 5), { now: new Date("2026-09-04T00:00:00Z") }),
      /injected fault/,
    );
    for (const t of ["workspaces", "users", "venues", "events", "bookings"]) {
      const row = get<{ n: number }>(db, `SELECT COUNT(*) AS n FROM ${t}`);
      assert.equal(row.n, 0, `table ${t} must be empty after rollback`);
    }
  });
});

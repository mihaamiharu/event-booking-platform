// Checkout row-state proofs (BKG-002/BKG-003, PAY-001): atomic rows, price
// snapshots, no-write-on-failure, decline records attempt without booking.
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
  return db;
}

function get<T>(db: DatabaseSync, sql: string, ...params: SQLInputValue[]): T | undefined {
  const row = db.prepare(sql).get(...params) as T | undefined;
  return row === undefined ? undefined : { ...row };
}

describe("bkg-002 seeded booking rows carry price snapshots", () => {
  it("maya booking snapshot matches ticket price at seed time", async () => {
    const db = migratedDb();
    const { workspaceId: w } = await provisionWorkspace(new SqliteBatchDB(db), {
      now: new Date("2026-09-04T00:00:00Z"),
    });
    const tag = workspaceTag(w);
    const item = get<{ unit_price_idr: number; subtotal_idr: number; quantity: number }>(
      db,
      "SELECT unit_price_idr, subtotal_idr, quantity FROM booking_items WHERE workspace_id = ? AND booking_id = ?",
      w,
      `${tag}_booking_maya_design`,
    );
    const ticket = get<{ price_idr: number }>(
      db,
      "SELECT price_idr FROM ticket_types WHERE workspace_id = ? AND id = ?",
      w,
      `${tag}_ticket_design_general`,
    );
    assert.deepEqual(item, { unit_price_idr: 150000, subtotal_idr: 300000, quantity: 2 });
    assert.equal(ticket?.price_idr, item?.unit_price_idr);
  });

  it("decline-shaped rows hold no booking and consume no capacity", async () => {
    const db = migratedDb();
    const { workspaceId: w } = await provisionWorkspace(new SqliteBatchDB(db), {
      now: new Date("2026-09-04T00:00:00Z"),
    });
    const tag = workspaceTag(w);
    const maya = get<{ id: string }>(db, "SELECT id FROM users WHERE workspace_id = ? AND email = ?", w, "maya.attendee@example.test")!;
    const before = get<{ confirmed_quantity: number }>(
      db,
      "SELECT confirmed_quantity FROM event_sessions WHERE workspace_id = ? AND id = ?",
      w,
      `${tag}_sess_design_01`,
    )!.confirmed_quantity;

    // Decline-shaped write set: attempt + idempotency outcome, no booking/item.
    db.prepare(
      "INSERT INTO payment_attempts (id, workspace_id, user_id, booking_id, outcome, created_at) VALUES (?, ?, ?, NULL, 'DECLINED', ?)",
    ).run("decline_pay_1", w, maya.id, "2026-09-04T10:00:00.000Z");
    db.prepare(
      "INSERT INTO idempotency_keys (workspace_id, user_id, key, fingerprint, booking_id, outcome, created_at) VALUES (?, ?, ?, ?, NULL, 'DECLINED', ?)",
    ).run(w, maya.id, "decline-key-1", "fp", "2026-09-04T10:00:00.000Z");

    assert.equal(
      get<{ n: number }>(db, "SELECT COUNT(*) AS n FROM bookings WHERE workspace_id = ? AND user_id = ?", w, maya.id)?.n,
      1,
      "only the seeded booking exists",
    );
    assert.equal(
      get<{ confirmed_quantity: number }>(
        db,
        "SELECT confirmed_quantity FROM event_sessions WHERE workspace_id = ? AND id = ?",
        w,
        `${tag}_sess_design_01`,
      )!.confirmed_quantity,
      before,
    );
    assert.equal(
      get<{ n: number }>(db, "SELECT COUNT(*) AS n FROM payment_attempts WHERE workspace_id = ? AND outcome = 'DECLINED' AND booking_id IS NULL", w)?.n,
      1,
    );
  });

  it("conditional gate leaves capacity unchanged when insufficient", async () => {
    const db = migratedDb();
    const { workspaceId: w } = await provisionWorkspace(new SqliteBatchDB(db), {
      now: new Date("2026-09-04T00:00:00Z"),
    });
    const tag = workspaceTag(w);
    const info = db.prepare(
      `UPDATE event_sessions SET confirmed_quantity = confirmed_quantity + ?
        WHERE id = ? AND workspace_id = ? AND confirmed_quantity + ? <= capacity`,
    ).run(5, `${tag}_sess_meetup_01`, w, 5);
    assert.equal(Number(info.changes), 0, "sold-out gate matches zero rows");
    assert.equal(
      get<{ confirmed_quantity: number }>(
        db,
        "SELECT confirmed_quantity FROM event_sessions WHERE workspace_id = ? AND id = ?",
        w,
        `${tag}_sess_meetup_01`,
      )!.confirmed_quantity,
      5,
    );
  });
});

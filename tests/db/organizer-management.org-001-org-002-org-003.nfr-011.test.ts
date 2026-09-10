// Organizer migration and nested-write atomicity (ORG-001/ORG-002/ORG-003, NFR-011).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { provisionWorkspace, workspaceTag } from "../../worker/src/seed.ts";
import { FaultyBatchDB, SqliteBatchDB, applyMigration } from "./support/sqlite.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function migratedDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  applyMigration(db, readFileSync(path.join(root, "db/migrations/0001_init.sql"), "utf8"));
  applyMigration(db, readFileSync(path.join(root, "db/migrations/0004_organizer_management.sql"), "utf8"));
  return db;
}

describe("org-001/org-002/org-003 organizer persistence", () => {
  it("seeds the organizer role and keeps a nested event write atomic", async () => {
    const db = migratedDb();
    const { workspaceId: workspace } = await provisionWorkspace(new SqliteBatchDB(db), { now: new Date("2026-09-10T00:00:00Z") });
    const raka = db.prepare("SELECT role FROM users WHERE workspace_id = ? AND email = ?").get(workspace, "raka.organizer@example.test") as { role: string };
    assert.equal(raka.role, "ORGANIZER");
    const attendee = db.prepare("SELECT role FROM users WHERE workspace_id = ? AND email = ?").get(workspace, "alex.attendee@example.test") as { role: string };
    assert.equal(attendee.role, "ATTENDEE");

    const tag = workspaceTag(workspace);
    const eventId = `${tag}_org_atomic_event`;
    const sessionId = `${tag}_org_atomic_session`;
    await assert.rejects(
      new FaultyBatchDB(db, 2).batch([
        { sql: "INSERT INTO events (id, workspace_id, venue_id, slug, name, description, status, sales_open_at, sales_close_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'DRAFT', ?7, ?8)", params: [eventId, workspace, `${tag}_venue_merdeka`, "org-atomic-event", "Atomic event", "", "2026-09-10T00:00:00.000Z", "2026-10-10T00:00:00.000Z"] },
        { sql: "INSERT INTO event_sessions (id, workspace_id, event_id, status, start_at, end_at, capacity, confirmed_quantity) VALUES (?1, ?2, ?3, 'SCHEDULED', ?4, ?5, 20, 0)", params: [sessionId, workspace, eventId, "2026-10-15T02:00:00.000Z", "2026-10-15T05:00:00.000Z"] },
        { sql: "INSERT INTO ticket_types (id, workspace_id, event_id, event_session_id, name, price_idr) VALUES (?1, ?2, ?3, ?4, 'General', 100000)", params: [`${tag}_org_atomic_ticket`, workspace, eventId, "foreign-session",] },
      ]),
      /injected fault/,
    );
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM events WHERE id = ?").get(eventId) as { n: number }).n, 0);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM event_sessions WHERE id = ?").get(sessionId) as { n: number }).n, 0);
  });
});

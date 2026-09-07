// Unit: cleanup statement shape + expiry boundary (WSP-003).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cleanupWorkspaceStatements, expiryCutoffIso } from "../../worker/src/cleanup.ts";
import { WORKSPACE_TTL_MS } from "../../worker/src/workspace.ts";

describe("wsp-003 cleanup statements drain one workspace", () => {
  it("deletes children before parents and marks EXPIRED last", () => {
    const stmts = cleanupWorkspaceStatements("ws-1");
    const tables = stmts
      .map((s) => s.sql.match(/^(?:DELETE FROM|UPDATE) (\w+)/)?.[1])
      .filter(Boolean);
    assert.deepEqual(tables, [
      "sessions",
      "payment_attempts",
      "booking_items",
      "idempotency_keys",
      "bookings",
      "ticket_types",
      "event_sessions",
      "events",
      "venues",
      "users",
      "workspaces",
    ]);
    for (const s of stmts) {
      assert.ok(s.params.includes("ws-1"), "every statement binds its workspace");
      assert.ok(!s.sql.includes("ws-1"), "no identifier interpolation");
    }
    assert.match(stmts.at(-1)!.sql, /SET status = 'EXPIRED'/);
  });

  it("cutoff is exactly the 7-day TTL behind now", () => {
    const now = Date.parse("2026-09-11T00:00:00.000Z");
    assert.equal(expiryCutoffIso(now), "2026-09-04T00:00:00.000Z");
    assert.equal(WORKSPACE_TTL_MS, 7 * 86_400_000);
  });
});

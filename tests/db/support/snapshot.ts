// Canonical DB snapshot for reset-twice comparison (NFR-007). Test-only.
// Volatile columns (per-workspace random salts/hashes) normalize to constants.
import { DatabaseSync } from "node:sqlite";

const TABLES = [
  "workspaces",
  "users",
  "sessions",
  "venues",
  "events",
  "event_sessions",
  "ticket_types",
  "bookings",
  "booking_items",
  "payment_attempts",
  "idempotency_keys",
];

const VOLATILE: Record<string, string[]> = {
  users: ["password_hash", "password_salt"],
};

export function snapshot(db: DatabaseSync): string {
  const out: Record<string, unknown[]> = {};
  for (const t of TABLES) {
    const rows = db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all() as Record<string, unknown>[];
    out[t] = rows.map((r) => {
      const copy: Record<string, unknown> = { ...r };
      for (const c of VOLATILE[t] ?? []) copy[c] = "<redacted>";
      return copy;
    });
  }
  // Logical equality (TEST-DATA): a reset creates a new T0 and rebuilds the
  // same states at the same offsets — so normalize every UTC instant to its
  // offset from this snapshot's seed_reference_at.
  const t0 = Date.parse(
    (out.workspaces[0] as Record<string, unknown>).seed_reference_at as string,
  );
  return JSON.stringify(out, (_key, value: unknown) =>
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
      ? `T+${Date.parse(value) - t0}`
      : value,
  );
}

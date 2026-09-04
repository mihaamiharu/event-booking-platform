// Deterministic seed engine (WSP-004, NFR-007, TEST-DATA r1-v1).
// Callable units with no HTTP: S3/S7 handlers call these; tests drive them
// through a BatchDB adapter (node:sqlite locally, D1 binding at runtime).
// Direct SQL, no ORM — row budgets demand counted indexed queries
// (DATA-DESIGN §3, §8).
//
// Atomicity: statement streams open with BEGIN and close with COMMIT. These
// are adapter-interpreted intents, not raw SQL: the SQLite adapter runs a
// real transaction (fault test proves rollback); the D1 adapter strips the
// markers and sends the data statements via one db.batch() call. Proven on
// preview 2026-09-04: D1 rejects explicit BEGIN/COMMIT, but batch() rolls
// back on statement ERROR (bad-table and PK-conflict probes left zero rows).
// A 0-row conditional UPDATE is not an error — S5 checkout therefore uses
// the SPIKE-B gated pattern, never a conflict batch.
import { SEED_VERSION_FALLBACK } from "./config.ts";
import { hashPassword, randomSaltB64 } from "./password.ts";

export interface Statement {
  sql: string;
  params: unknown[];
}

export interface BatchResult {
  changes: number;
}

export interface BatchDB {
  batch(statements: Statement[]): Promise<BatchResult[]>;
}

export interface ProvisionResult {
  workspaceId: string;
  seedReferenceAt: string;
}

export interface ProvisionOptions {
  now?: Date;
}

const DAY = 86_400_000;
const WIB_OFFSET = 7 * 3_600_000;

/** UTC ms of Jakarta local midnight `plusDays` after T0's Jakarta date. */
function jakartaMidnightUtc(t0ms: number, plusDays: number): number {
  const midnightJkt = Math.floor((t0ms + WIB_OFFSET) / DAY) * DAY;
  return midnightJkt + plusDays * DAY - WIB_OFFSET;
}

function at(midnightUtc: number, h: number, m: number): string {
  return new Date(midnightUtc + h * 3_600_000 + m * 60_000).toISOString();
}

interface SeedContext {
  w: string; // workspace id
  t0: string; // seed_reference_at (UTC ISO)
}

function seedStatements(ctx: SeedContext, creds: { alex: { salt: string; hash: string }; maya: { salt: string; hash: string }; fixture: { salt: string; hash: string } }): Statement[] {
  const { w, t0 } = ctx;
  const t0ms = Date.parse(t0);
  const S: Statement[] = [];
  const run = (sql: string, ...params: unknown[]) => {
    S.push({ sql, params });
  };

  run(
    "INSERT INTO workspaces (id, seed_version, seed_reference_at, last_active_at, status) VALUES (?1, ?2, ?3, ?3, 'ACTIVE')",
    w,
    SEED_VERSION_FALLBACK,
    t0,
  );

  // Venues (fictional Jakarta).
  run("INSERT INTO venues (id, workspace_id, seed_key, name, city, time_zone) VALUES (?1, ?2, 'venue_merdeka', 'Merdeka Community Hall', 'Jakarta', 'Asia/Jakarta')", "venue_merdeka", w);
  run("INSERT INTO venues (id, workspace_id, seed_key, name, city, time_zone) VALUES (?1, ?2, 'venue_cendana', 'Cendana Creative Studio', 'Jakarta', 'Asia/Jakarta')", "venue_cendana", w);

  // Users: two interactive + one non-interactive fixture (no credential).
  run("INSERT INTO users (id, workspace_id, email, display_name, password_hash, password_salt, seed_key) VALUES ('user_alex', ?1, 'alex.attendee@example.test', 'Alex', ?2, ?3, 'attendee_alex')", w, creds.alex.hash, creds.alex.salt);
  run("INSERT INTO users (id, workspace_id, email, display_name, password_hash, password_salt, seed_key) VALUES ('user_maya', ?1, 'maya.attendee@example.test', 'Maya', ?2, ?3, 'attendee_maya')", w, creds.maya.hash, creds.maya.salt);
  run("INSERT INTO users (id, workspace_id, email, display_name, password_hash, password_salt, seed_key) VALUES ('user_fixture_soldout', ?1, 'fixture.soldout@example.test', 'Fixture', ?2, ?3, NULL)", w, creds.fixture.hash, creds.fixture.salt);

  // Available published event: T0+14d 09:00–12:00 WIB, sales T0-1d → T0+13d 23:59.
  const d14 = jakartaMidnightUtc(t0ms, 14);
  const d13 = jakartaMidnightUtc(t0ms, 13);
  const dMinus1 = jakartaMidnightUtc(t0ms, -1);
  run("INSERT INTO events (id, workspace_id, venue_id, slug, name, description, status, sales_open_at, sales_close_at) VALUES ('event_design_workshop', ?1, 'venue_merdeka', 'jakarta-design-systems-workshop', 'Jakarta Design Systems Workshop', 'A hands-on morning on design systems.', 'PUBLISHED', ?2, ?3)", w, at(dMinus1, 0, 0), at(d13, 23, 59));
  run("INSERT INTO event_sessions (id, workspace_id, event_id, status, start_at, end_at, capacity, confirmed_quantity) VALUES ('sess_design_01', ?1, 'event_design_workshop', 'SCHEDULED', ?2, ?3, 20, 2)", w, at(d14, 9, 0), at(d14, 12, 0));
  run("INSERT INTO ticket_types (id, workspace_id, event_id, event_session_id, name, price_idr) VALUES ('ticket_design_general', ?1, 'event_design_workshop', 'sess_design_01', 'General', 150000)", w);
  run("INSERT INTO ticket_types (id, workspace_id, event_id, event_session_id, name, price_idr) VALUES ('ticket_design_premium', ?1, 'event_design_workshop', 'sess_design_01', 'Premium', 250000)", w);

  // Sold-out published event: T0+21d 18:30–21:00 WIB, sales T0-1d → T0+20d 23:59.
  const d21 = jakartaMidnightUtc(t0ms, 21);
  const d20 = jakartaMidnightUtc(t0ms, 20);
  run("INSERT INTO events (id, workspace_id, venue_id, slug, name, description, status, sales_open_at, sales_close_at) VALUES ('event_product_meetup', ?1, 'venue_cendana', 'community-product-meetup', 'Community Product Meetup', 'An evening meetup for product people.', 'PUBLISHED', ?2, ?3)", w, at(dMinus1, 0, 0), at(d20, 23, 59));
  run("INSERT INTO event_sessions (id, workspace_id, event_id, status, start_at, end_at, capacity, confirmed_quantity) VALUES ('sess_meetup_01', ?1, 'event_product_meetup', 'SCHEDULED', ?2, ?3, 5, 5)", w, at(d21, 18, 30), at(d21, 21, 0));
  run("INSERT INTO ticket_types (id, workspace_id, event_id, event_session_id, name, price_idr) VALUES ('ticket_meetup_general', ?1, 'event_product_meetup', 'sess_meetup_01', 'General', 50000)", w);

  // Excluded fixtures: draft, cancelled, past (COMPLETED session).
  const d28 = jakartaMidnightUtc(t0ms, 28);
  const d10 = jakartaMidnightUtc(t0ms, 10);
  const dPast = jakartaMidnightUtc(t0ms, -7);
  run("INSERT INTO events (id, workspace_id, venue_id, slug, name, description, status, sales_open_at, sales_close_at) VALUES ('event_draft_conference', ?1, 'venue_merdeka', 'modern-web-conference', 'Modern Web Conference', 'Draft fixture, not listed.', 'DRAFT', ?2, ?3)", w, at(dMinus1, 0, 0), at(d28, 23, 59));
  run("INSERT INTO event_sessions (id, workspace_id, event_id, status, start_at, end_at, capacity, confirmed_quantity) VALUES ('sess_draft_01', ?1, 'event_draft_conference', 'SCHEDULED', ?2, ?3, 10, 0)", w, at(d28, 10, 0), at(d28, 12, 0));
  run("INSERT INTO ticket_types (id, workspace_id, event_id, event_session_id, name, price_idr) VALUES ('ticket_draft_general', ?1, 'event_draft_conference', 'sess_draft_01', 'General', 100000)", w);
  run("INSERT INTO events (id, workspace_id, venue_id, slug, name, description, status, sales_open_at, sales_close_at) VALUES ('event_cancelled_evening', ?1, 'venue_cendana', 'creative-tech-evening', 'Creative Tech Evening', 'Cancelled fixture, not listed.', 'CANCELLED', ?2, ?3)", w, at(dMinus1, 0, 0), at(d10, 23, 59));
  run("INSERT INTO event_sessions (id, workspace_id, event_id, status, start_at, end_at, capacity, confirmed_quantity) VALUES ('sess_cancelled_01', ?1, 'event_cancelled_evening', 'SCHEDULED', ?2, ?3, 10, 0)", w, at(d10, 18, 0), at(d10, 20, 0));
  run("INSERT INTO ticket_types (id, workspace_id, event_id, event_session_id, name, price_idr) VALUES ('ticket_cancelled_general', ?1, 'event_cancelled_evening', 'sess_cancelled_01', 'General', 100000)", w);
  run("INSERT INTO events (id, workspace_id, venue_id, slug, name, description, status, sales_open_at, sales_close_at) VALUES ('event_past_forum', ?1, 'venue_merdeka', 'product-leadership-forum', 'Product Leadership Forum', 'Past fixture, not listed.', 'PUBLISHED', ?2, ?3)", w, at(dMinus1, 0, 0), at(dPast, 23, 59));
  run("INSERT INTO event_sessions (id, workspace_id, event_id, status, start_at, end_at, capacity, confirmed_quantity) VALUES ('sess_past_01', ?1, 'event_past_forum', 'COMPLETED', ?2, ?3, 10, 0)", w, at(dPast, 14, 0), at(dPast, 16, 0));
  run("INSERT INTO ticket_types (id, workspace_id, event_id, event_session_id, name, price_idr) VALUES ('ticket_past_general', ?1, 'event_past_forum', 'sess_past_01', 'General', 100000)", w);

  // Seeded bookings: Maya 2× General (300000); fixture owns sold-out 5× (250000).
  run("INSERT INTO bookings (id, workspace_id, user_id, event_id, event_session_id, reference, status, quantity, total_idr, currency, created_at) VALUES ('booking_maya_design', ?1, 'user_maya', 'event_design_workshop', 'sess_design_01', 'BKG-SEED-MAYA-001', 'CONFIRMED', 2, 300000, 'IDR', ?2)", w, t0);
  run("INSERT INTO booking_items (id, workspace_id, booking_id, ticket_type_id, quantity, unit_price_idr, subtotal_idr) VALUES ('item_maya_design', ?1, 'booking_maya_design', 'ticket_design_general', 2, 150000, 300000)", w);
  run("INSERT INTO payment_attempts (id, workspace_id, user_id, booking_id, outcome, created_at) VALUES ('pay_maya_design', ?1, 'user_maya', 'booking_maya_design', 'SUCCEEDED', ?2)", w, t0);
  run("INSERT INTO bookings (id, workspace_id, user_id, event_id, event_session_id, reference, status, quantity, total_idr, currency, created_at) VALUES ('booking_fixture_soldout', ?1, 'user_fixture_soldout', 'event_product_meetup', 'sess_meetup_01', 'BKG-SEED-SOLDOUT-001', 'CONFIRMED', 5, 250000, 'IDR', ?2)", w, t0);
  run("INSERT INTO booking_items (id, workspace_id, booking_id, ticket_type_id, quantity, unit_price_idr, subtotal_idr) VALUES ('item_fixture_soldout', ?1, 'booking_fixture_soldout', 'ticket_meetup_general', 5, 50000, 250000)", w);
  run("INSERT INTO payment_attempts (id, workspace_id, user_id, booking_id, outcome, created_at) VALUES ('pay_fixture_soldout', ?1, 'user_fixture_soldout', 'booking_fixture_soldout', 'SUCCEEDED', ?2)", w, t0);

  return S;
}

/** Provision one workspace with seed r1-v1. All-or-nothing (WSP-004). */
export async function provisionWorkspace(
  db: BatchDB,
  opts: ProvisionOptions = {},
): Promise<ProvisionResult> {
  const t0 = (opts.now ?? new Date()).toISOString();
  const w = crypto.randomUUID();
  const [alexSalt, mayaSalt, fixtureSalt] = [randomSaltB64(), randomSaltB64(), randomSaltB64()];
  const [alexHash, mayaHash, fixtureHash] = await Promise.all([
    hashPassword("Attend123!", alexSalt),
    hashPassword("Booked123!", mayaSalt),
    hashPassword(crypto.randomUUID(), fixtureSalt),
  ]);
  const stmts: Statement[] = [{ sql: "BEGIN", params: [] }];
  stmts.push(
    ...seedStatements({ w, t0 }, {
      alex: { salt: alexSalt, hash: alexHash },
      maya: { salt: mayaSalt, hash: mayaHash },
      fixture: { salt: fixtureSalt, hash: fixtureHash },
    }),
  );
  stmts.push({ sql: "COMMIT", params: [] });
  await db.batch(stmts);
  return { workspaceId: w, seedReferenceAt: t0 };
}

const RESET_TABLES = [
  "sessions",
  "payment_attempts",
  "booking_items",
  "bookings",
  "idempotency_keys",
  "ticket_types",
  "event_sessions",
  "events",
  "venues",
  "users",
];

/** Reset one workspace to fresh seed (WSP-002 shape; HTTP + rate limits in S7). */
export async function resetWorkspace(
  db: BatchDB,
  workspaceId: string,
  opts: ProvisionOptions = {},
): Promise<ProvisionResult> {
  const t0 = (opts.now ?? new Date()).toISOString();
  const [alexSalt, mayaSalt, fixtureSalt] = [randomSaltB64(), randomSaltB64(), randomSaltB64()];
  const [alexHash, mayaHash, fixtureHash] = await Promise.all([
    hashPassword("Attend123!", alexSalt),
    hashPassword("Booked123!", mayaSalt),
    hashPassword(crypto.randomUUID(), fixtureSalt),
  ]);
  // Re-seed content rows (deterministic IDs) without touching the workspace row.
  const reseed = seedStatements({ w: workspaceId, t0 }, {
    alex: { salt: alexSalt, hash: alexHash },
    maya: { salt: mayaSalt, hash: mayaHash },
    fixture: { salt: fixtureSalt, hash: fixtureHash },
  }).filter((s) => !s.sql.startsWith("INSERT INTO workspaces"));
  const stmts: Statement[] = [{ sql: "BEGIN", params: [] }];
  for (const t of RESET_TABLES) {
    stmts.push({ sql: `DELETE FROM ${t} WHERE workspace_id = ?1`, params: [workspaceId] });
  }
  stmts.push(...reseed);
  stmts.push({
    sql: "UPDATE workspaces SET seed_reference_at = ?1, last_active_at = ?1, status = 'ACTIVE' WHERE id = ?2",
    params: [t0, workspaceId],
  });
  stmts.push({ sql: "COMMIT", params: [] });
  await db.batch(stmts);
  return { workspaceId, seedReferenceAt: t0 };
}

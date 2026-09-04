-- 0001_init.sql — R1 initial schema (S2, DATA-DESIGN §2).
-- Forward-only; never edit after apply. Seed data is NOT in migrations —
-- it runs through provision/reset (worker/src/seed.ts, DATA-DESIGN §7).
-- FKs are declared for documentation; enforcement is by explicit ordered
-- deletes in code (cascades unsafe until FK enforcement is proven
-- per-connection, DATA-DESIGN §2.1). No CASCADE anywhere.

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  seed_version TEXT NOT NULL,
  seed_reference_at TEXT NOT NULL,
  last_active_at TEXT NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces (id),
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  seed_key TEXT,
  UNIQUE (workspace_id, email)
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces (id),
  user_id TEXT NOT NULL REFERENCES users (id),
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE venues (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces (id),
  seed_key TEXT NOT NULL,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  time_zone TEXT NOT NULL
);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces (id),
  venue_id TEXT NOT NULL REFERENCES venues (id),
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  sales_open_at TEXT NOT NULL,
  sales_close_at TEXT NOT NULL,
  UNIQUE (workspace_id, slug)
);

CREATE TABLE event_sessions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces (id),
  event_id TEXT NOT NULL REFERENCES events (id),
  status TEXT NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  capacity INTEGER NOT NULL,
  confirmed_quantity INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE ticket_types (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces (id),
  event_id TEXT NOT NULL REFERENCES events (id),
  event_session_id TEXT NOT NULL REFERENCES event_sessions (id),
  name TEXT NOT NULL,
  price_idr INTEGER NOT NULL
);

CREATE TABLE bookings (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces (id),
  user_id TEXT NOT NULL REFERENCES users (id),
  event_id TEXT NOT NULL REFERENCES events (id),
  event_session_id TEXT NOT NULL REFERENCES event_sessions (id),
  reference TEXT NOT NULL,
  status TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  total_idr INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'IDR',
  created_at TEXT NOT NULL,
  UNIQUE (workspace_id, reference)
);

CREATE TABLE booking_items (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces (id),
  booking_id TEXT NOT NULL REFERENCES bookings (id),
  ticket_type_id TEXT NOT NULL REFERENCES ticket_types (id),
  quantity INTEGER NOT NULL,
  unit_price_idr INTEGER NOT NULL,
  subtotal_idr INTEGER NOT NULL,
  UNIQUE (booking_id)
);

CREATE TABLE payment_attempts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces (id),
  user_id TEXT NOT NULL REFERENCES users (id),
  booking_id TEXT REFERENCES bookings (id),
  outcome TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE idempotency_keys (
  workspace_id TEXT NOT NULL REFERENCES workspaces (id),
  user_id TEXT NOT NULL REFERENCES users (id),
  key TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  booking_id TEXT REFERENCES bookings (id),
  outcome TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, user_id, key)
);

-- Indexes: every filter column indexed (DATA-DESIGN §4; billed rows scanned).
CREATE INDEX idx_users_workspace_email ON users (workspace_id, email);
CREATE INDEX idx_sessions_workspace_user ON sessions (workspace_id, user_id);
CREATE INDEX idx_events_workspace_status ON events (workspace_id, status);
CREATE INDEX idx_events_workspace_slug ON events (workspace_id, slug);
CREATE INDEX idx_sessions_workspace_event_start ON event_sessions (workspace_id, event_id, start_at);
CREATE INDEX idx_sessions_workspace_status_start ON event_sessions (workspace_id, status, start_at);
CREATE INDEX idx_tickets_workspace_session ON ticket_types (workspace_id, event_session_id);
CREATE INDEX idx_tickets_workspace_event ON ticket_types (workspace_id, event_id);
CREATE INDEX idx_bookings_workspace_user_created ON bookings (workspace_id, user_id, created_at);
CREATE INDEX idx_bookings_workspace_reference ON bookings (workspace_id, reference);
CREATE INDEX idx_booking_items_booking ON booking_items (booking_id);
CREATE INDEX idx_payments_workspace_user_created ON payment_attempts (workspace_id, user_id, created_at);
CREATE INDEX idx_workspaces_status_active ON workspaces (status, last_active_at);

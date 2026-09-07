-- 0002_rate_limits.sql — abuse counters (S3, AUTH-SECURITY §5).
-- IP-scoped, keyed by hash (never raw IPs, AUTH-SECURITY §7). Forward-only.
CREATE TABLE rate_counters (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_start TEXT NOT NULL
);

-- 0003_booking_cancellation.sql — attendee booking lifecycle (BKG-006/007).
-- Forward-only. A cancellation timestamp preserves the lifecycle history;
-- the operation token makes the capacity-release batch single-use.
ALTER TABLE bookings ADD COLUMN cancelled_at TEXT;
ALTER TABLE bookings ADD COLUMN cancellation_id TEXT;

-- 0004_organizer_management.sql — ORG-001/ORG-002/ORG-003.
-- Forward-only role metadata. Existing users remain attendees; the seed adds
-- one workspace-scoped organizer identity for the R2 management slice.
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'ATTENDEE';

CREATE INDEX idx_users_workspace_role ON users (workspace_id, role);

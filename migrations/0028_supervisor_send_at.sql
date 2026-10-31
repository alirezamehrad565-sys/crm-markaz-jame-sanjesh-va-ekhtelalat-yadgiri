ALTER TABLE staff ADD COLUMN role_ext TEXT
  CHECK (role_ext IS NULL OR role_ext = 'supervisor');

ALTER TABLE notifications ADD COLUMN send_at TEXT;
CREATE INDEX IF NOT EXISTS idx_notifications_dispatch
  ON notifications(status, send_at);

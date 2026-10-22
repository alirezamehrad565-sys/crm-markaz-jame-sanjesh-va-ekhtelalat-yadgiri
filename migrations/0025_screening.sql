CREATE TABLE IF NOT EXISTS screening_entries (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  day        TEXT NOT NULL,                    -- YYYY-MM-DD به وقت تهران
  tags       TEXT NOT NULL DEFAULT '[]',       -- آرایهٔ JSON رشته
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_screening_day       ON screening_entries(day);
CREATE INDEX IF NOT EXISTS idx_screening_created_by ON screening_entries(created_by);

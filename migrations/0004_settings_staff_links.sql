CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,              -- JSON
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS staff_bot_links (
  id         TEXT PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,
  staff_id   TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  chat_id    TEXT,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'linked')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_staff_bot_links_staff ON staff_bot_links(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_bot_links_chat ON staff_bot_links(chat_id);

ALTER TABLE staff ADD COLUMN notify_enabled INTEGER NOT NULL DEFAULT 1
  CHECK (notify_enabled IN (0, 1));

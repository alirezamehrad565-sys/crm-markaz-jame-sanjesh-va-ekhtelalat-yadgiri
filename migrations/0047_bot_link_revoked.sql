CREATE TABLE IF NOT EXISTS bot_links_new (
  id         TEXT PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  chat_id    TEXT,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'linked', 'revoked')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO bot_links_new (id, code, student_id, chat_id, status, created_by, created_at, updated_at)
  SELECT id, code, student_id, chat_id, status, created_by, created_at, updated_at FROM bot_links;
DROP TABLE bot_links;
ALTER TABLE bot_links_new RENAME TO bot_links;

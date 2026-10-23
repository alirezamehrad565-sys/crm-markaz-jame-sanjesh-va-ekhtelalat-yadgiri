CREATE TABLE IF NOT EXISTS knowledge_attachments (
  id TEXT PRIMARY KEY,
  knowledge_id TEXT NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  file_key TEXT NOT NULL,                       -- کلید در ObjectStore (R2 یا D1 تکه‌تکه)
  file_name TEXT NOT NULL,
  file_mime TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_knowledge_attachments_item ON knowledge_attachments(knowledge_id, created_at);

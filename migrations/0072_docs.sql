-- m201 — نمون‌برگ‌ها و اسناد خام: مخزن فایل‌های اداری مرکز
-- دسترسی: مدیر و منشی (کنترل در routes) — فایل‌ها در ObjectStore با کلید docs/{docId}/{fileId}
CREATE TABLE IF NOT EXISTS docs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',  -- circular | form | regulation | report | finance | other
  description TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',          -- آرایه JSON برچسب آزاد
  created_by TEXT NOT NULL REFERENCES staff(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_docs_created ON docs(created_at);
CREATE INDEX IF NOT EXISTS idx_docs_category ON docs(category);

CREATE TABLE IF NOT EXISTS docs_files (
  id TEXT PRIMARY KEY,
  doc_id TEXT NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
  file_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_mime TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_docs_files_doc ON docs_files(doc_id, created_at);

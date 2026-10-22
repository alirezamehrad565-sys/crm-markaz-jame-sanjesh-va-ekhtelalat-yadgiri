CREATE TABLE IF NOT EXISTS announcements (
  id                TEXT PRIMARY KEY,
  title             TEXT NOT NULL,
  body              TEXT NOT NULL,
  show_login        INTEGER NOT NULL DEFAULT 0 CHECK (show_login IN (0, 1)),
  show_panel        INTEGER NOT NULL DEFAULT 0 CHECK (show_panel IN (0, 1)),
  bot_sent_staff    INTEGER NOT NULL DEFAULT 0 CHECK (bot_sent_staff IN (0, 1)),
  bot_sent_families INTEGER NOT NULL DEFAULT 0 CHECK (bot_sent_families IN (0, 1)),
  active            INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_by        TEXT NOT NULL REFERENCES staff(id),
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(active, created_at);

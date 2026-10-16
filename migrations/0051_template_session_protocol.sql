-- مایگریشن اسکیما D1 — پروتکل جلسهٔ قالب
-- سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
-- 0051_template_session_protocol.sql — بازسازی‌شده از اسکیمای زندهٔ تولید
-- قالب‌های مسیر + پروتکل جلسه‌به‌جلسه (خواست کاربر: «اجازه یه پروتکل جلسه به جلسه
-- تعریف کنن و هر جلسه رو بهش تمرین و تکلیف و بازی و دستورالعمل اتچ کنن»).
-- اعمال‌شده روی تولید — این نسخه برای محیط‌های تازه است.

CREATE TABLE IF NOT EXISTS pathway_templates (
  id          TEXT PRIMARY KEY,
  key         TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  description TEXT,
  protocol    TEXT,                            -- legacy ( اولیه)
  target_key  TEXT,
  steps       TEXT NOT NULL DEFAULT '[]',
  is_system   INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  sessions_json TEXT,                          -- پروتکل جلسه‌به‌جلسه (JSON)
  created_by  TEXT
);

CREATE TABLE IF NOT EXISTS pathway_sessions (
  id          TEXT PRIMARY KEY,
  pathway_id  TEXT NOT NULL REFERENCES intervention_paths(id) ON DELETE CASCADE,
  ord         INTEGER NOT NULL,                -- ترتیب جلسه (۱-base)
  title       TEXT NOT NULL,
  plan        TEXT,
  status      TEXT NOT NULL DEFAULT 'planned', -- planned|done|skipped
  done_at     TEXT,
  note        TEXT,
  created_by  TEXT NOT NULL REFERENCES staff(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  items_json  TEXT NOT NULL DEFAULT '[]'       -- تمرین/تکلیف/بازی/دستورالعمل
);
CREATE INDEX IF NOT EXISTS idx_pathway_sessions_path ON pathway_sessions(pathway_id, ord);

ALTER TABLE intervention_paths ADD COLUMN template_key TEXT;
ALTER TABLE intervention_paths ADD COLUMN template_title TEXT;

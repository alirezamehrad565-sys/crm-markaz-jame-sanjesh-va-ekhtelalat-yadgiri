-- مایگریشن اسکیما D1 — مدارس و کلاس‌ها
-- سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
-- ─────────────────────────────────────────────────────────────
--: مدارس v۲ — مدیر مدرسه + کلاس‌ها با معلم + اتصال بات معلم مدرسه
-- * schools: نام و تلفن مدیر (مهم برای ارتباط مرکز با مدرسه)
-- * classes: هر مدرسه چند کلاس؛ هر کلاس نام + معلم + تلفن معلم
-- * students.class_id: دانش‌آموز به کلاس مدرسه‌اش متصل می‌شود
-- (فرم دانش‌آموز، اعلان معلم مدرسه و KPI همکاری معلم‌ها از این استفاده می‌کنند)
-- * class_bot_links: معلم مدرسه (خارج از مرکز) با /link CODE بات را به
-- کلاسش متصل می‌کند تا اعلان نوبت دانش‌آموزانش را از بله بگیرد
-- ─────────────────────────────────────────────────────────────

ALTER TABLE schools ADD COLUMN principal_name TEXT;
ALTER TABLE schools ADD COLUMN principal_phone TEXT;

CREATE TABLE IF NOT EXISTS classes (
  id            TEXT PRIMARY KEY,
  school_id     TEXT NOT NULL REFERENCES schools(id),
  name          TEXT NOT NULL,
  teacher_name  TEXT,
  teacher_phone TEXT,
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (school_id, name)
);
CREATE INDEX IF NOT EXISTS idx_classes_school ON classes(school_id);

ALTER TABLE students ADD COLUMN class_id TEXT REFERENCES classes(id);
CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_id);

CREATE TABLE IF NOT EXISTS class_bot_links (
  id         TEXT PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,
  class_id   TEXT NOT NULL REFERENCES classes(id),
  chat_id    TEXT,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'linked', 'revoked')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_class_bot_links_class ON class_bot_links(class_id);
CREATE INDEX IF NOT EXISTS idx_class_bot_links_chat  ON class_bot_links(chat_id);

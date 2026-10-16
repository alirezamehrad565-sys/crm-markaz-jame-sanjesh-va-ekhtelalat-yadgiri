-- مایگریشن اسکیما D1 — برچسب‌ها
-- سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
-- migrations/0006_tags.sql
-- — برچسب‌گذاری دانش‌آموز (نوع اختلال، پایه تحصیلی، نوع مدرسه، سفارشی)
-- برچسب‌ها soft-state هستند (active 0/1) — تاریخچه student_tags حفظ می‌شود.
-- ────────────────────────────────────────────────────────────

-- ───────────── tags (taxonomy مشترک) ─────────────
CREATE TABLE IF NOT EXISTS tags (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  category   TEXT NOT NULL CHECK (category IN ('disorder', 'grade', 'school_type', 'custom')),
  color      TEXT,
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (category, name)
);
CREATE INDEX IF NOT EXISTS idx_tags_category ON tags(category);

-- ───────────── student_tags (پیوند چند‌به‌چند) ─────────────
CREATE TABLE IF NOT EXISTS student_tags (
  student_id TEXT NOT NULL REFERENCES students(id),
  tag_id     TEXT NOT NULL REFERENCES tags(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (student_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_student_tags_tag ON student_tags(tag_id);

-- ───────────── برچسب‌های پیش‌فرض (idempotent — INSERT OR IGNORE) ─────────────

-- نوع اختلال
INSERT OR IGNORE INTO tags (id, name, category) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', 'نارساخوانی (دیس‌لکسی)', 'disorder'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'نارسانویسی (دیس‌گرافی)', 'disorder'),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'نارساریاضی (دیس‌کالکولی)', 'disorder'),
  ('aaaaaaaa-0000-4000-8000-000000000004', 'بیش‌فعالی و کم‌توجهی (ADHD)', 'disorder'),
  ('aaaaaaaa-0000-4000-8000-000000000005', 'طیف اتیسم', 'disorder'),
  ('aaaaaaaa-0000-4000-8000-000000000006', 'اختلال زبانی و بیان', 'disorder'),
  ('aaaaaaaa-0000-4000-8000-000000000007', 'اضطراب', 'disorder'),
  ('aaaaaaaa-0000-4000-8000-000000000008', 'اختلال هماهنگی حرکتی', 'disorder');

-- پایه تحصیلی
INSERT OR IGNORE INTO tags (id, name, category) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000101', 'پیش‌دبستانی', 'grade'),
  ('aaaaaaaa-0000-4000-8000-000000000102', 'اول', 'grade'),
  ('aaaaaaaa-0000-4000-8000-000000000103', 'دوم', 'grade'),
  ('aaaaaaaa-0000-4000-8000-000000000104', 'سوم', 'grade'),
  ('aaaaaaaa-0000-4000-8000-000000000105', 'چهارم', 'grade'),
  ('aaaaaaaa-0000-4000-8000-000000000106', 'پنجم', 'grade'),
  ('aaaaaaaa-0000-4000-8000-000000000107', 'ششم', 'grade'),
  ('aaaaaaaa-0000-4000-8000-000000000108', 'هفتم', 'grade'),
  ('aaaaaaaa-0000-4000-8000-000000000109', 'هشتم', 'grade'),
  ('aaaaaaaa-0000-4000-8000-000000000110', 'نهم', 'grade'),
  ('aaaaaaaa-0000-4000-8000-000000000111', 'دهم', 'grade'),
  ('aaaaaaaa-0000-4000-8000-000000000112', 'یازدهم', 'grade'),
  ('aaaaaaaa-0000-4000-8000-000000000113', 'دوازدهم', 'grade');

-- نوع مدرسه
INSERT OR IGNORE INTO tags (id, name, category) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000201', 'دولتی', 'school_type'),
  ('aaaaaaaa-0000-4000-8000-000000000202', 'غیرانتفاعی', 'school_type'),
  ('aaaaaaaa-0000-4000-8000-000000000203', 'استثنایی', 'school_type'),
  ('aaaaaaaa-0000-4000-8000-000000000204', 'خاص', 'school_type');

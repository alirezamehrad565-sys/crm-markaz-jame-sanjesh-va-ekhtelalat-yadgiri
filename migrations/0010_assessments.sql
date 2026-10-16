-- مایگریشن اسکیما D1 — پروندهٔ ارزیابی
-- سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
-- ─────────────────────────────────────────────────────────────
--: پرونده ارزیابی دانش‌آموز
-- * assessments: هر ارزیابی یک سند بالینی برای یک دانش‌آموز است —
-- نوع (اولیه/پیگیری/تخصصی/پیشرفت)، ارزیاب (کارمند مرکز)، تاریخ انجام،
-- یافته‌ها و توصیه‌ها + وضعیت (پیش‌نویس/نهایی)
-- * وضعیت «نهایی» یک‌طرفه است (final → draft ممنوع) تا سند پایه کمیسیون
-- ثابت بماند؛ ویرایش متن‌ها بعد از نهایی‌سازی با audit مجاز است.
-- * assessment_files: پیوست سند (حداکثر ۱۰ فایل × ۵۱۲KB) — محتوا base64
-- داخل D1 نگه داشته می‌شود (استقرار فعلی بدون R2)؛ متادیتا جدا از محتوا
-- خوانده می‌شود تا فهرست‌ها سبک بمانند.
-- * soft-state (active 0/1) — ارزیابی هرگز hard-delete نمی‌شود (append-only).
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS assessments (
  id             TEXT PRIMARY KEY,
  student_id     TEXT NOT NULL REFERENCES students(id),
  staff_id       TEXT REFERENCES staff(id),
  kind           TEXT NOT NULL CHECK (kind IN ('initial', 'followup', 'specialized', 'progress')),
  title          TEXT NOT NULL,
  performed_at   TEXT NOT NULL,
  findings       TEXT,
  recommendation TEXT,
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'final')),
  active         INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_by     TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_assessments_student ON assessments(student_id);
CREATE INDEX IF NOT EXISTS idx_assessments_staff   ON assessments(staff_id);
CREATE INDEX IF NOT EXISTS idx_assessments_performed ON assessments(performed_at);

CREATE TABLE IF NOT EXISTS assessment_files (
  id             TEXT PRIMARY KEY,
  assessment_id  TEXT NOT NULL REFERENCES assessments(id),
  filename       TEXT NOT NULL,
  mime_type      TEXT NOT NULL,
  size_bytes     INTEGER NOT NULL,
  content_b64    TEXT NOT NULL,
  created_by     TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_assessment_files_assessment ON assessment_files(assessment_id);

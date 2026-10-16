-- مایگریشن اسکیما D1 — یکپارچه‌سازی حضور و بررسی تأخیر
-- سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
-- 0046_attendance_unify_late_check.sql — بازسازی‌شده از اسکیمای زندهٔ تولید
-- «تأخیر» به وضعیت‌های مجاز حضور همکار اضافه شد (جدول با CHECK جدید بازسازی شد).
-- اعمال‌شده روی تولید (d1_migrations) — این نسخه برای محیط‌های تازه است.

CREATE TABLE IF NOT EXISTS staff_attendance_new (
  id         TEXT PRIMARY KEY,
  staff_id   TEXT NOT NULL REFERENCES staff(id),
  date       TEXT NOT NULL,
  status     TEXT NOT NULL
             CHECK (status IN ('present', 'late', 'absent', 'leave', 'sick')),
  note       TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (staff_id, date)
);
INSERT INTO staff_attendance_new (id, staff_id, date, status, note, created_at, updated_at)
  SELECT id, staff_id, date, status, note, created_at, updated_at FROM staff_attendance;
DROP TABLE staff_attendance;
ALTER TABLE staff_attendance_new RENAME TO staff_attendance;

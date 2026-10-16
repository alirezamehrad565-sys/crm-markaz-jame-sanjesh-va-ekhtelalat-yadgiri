-- مایگریشن اسکیما D1 — حضور کارکنان
-- سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
-- ─────────────────────────────────────────────────────────────
--: حضور و غیاب همکاران (ثبت روزانه وضعیت هر کارمند)
-- تاریخ به وقت تهران با فرمت میلادی YYYY-MM-DD ذخیره می‌شود
-- (نمایش جلالی در فرانت با formatJalaliNumeric انجام می‌شود)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS staff_attendance (
  id         TEXT PRIMARY KEY,
  staff_id   TEXT NOT NULL REFERENCES staff(id),
  date       TEXT NOT NULL,
  status     TEXT NOT NULL
             CHECK (status IN ('present', 'absent', 'leave', 'sick')),
  note       TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (staff_id, date)
);

CREATE INDEX IF NOT EXISTS idx_staff_attendance_date  ON staff_attendance(date);
CREATE INDEX IF NOT EXISTS idx_staff_attendance_staff ON staff_attendance(staff_id);

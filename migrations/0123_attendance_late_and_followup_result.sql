-- ۱.۲۷.۵۹ — اصلاح نقص‌های اثبات‌شدهٔ نقد پروندهٔ دانش‌آموز
-- ریشهٔ باگ ۵۰۰: مهاجرت ۰۰۴۶ فقط CHECK جدول staff_attendance را بازسازی کرد؛
-- CHECK جدول appointment_students (مهاجرت ۰۰۰۱) همچنان late را نمی‌پذیرفت و
-- ثبت «حضور با تأخیر» روی سرور با خطای داخلی تمام می‌شد.
-- الگوی بازسازی همان ۰۰۴۶ است؛ ستون‌های بعدی (۰۰۱۵ و ۰۱۱۴) حفظ می‌شوند.

CREATE TABLE IF NOT EXISTS appointment_students_new (
  appointment_id  TEXT NOT NULL REFERENCES appointments(id),
  student_id      TEXT NOT NULL REFERENCES students(id),
  facet_id        TEXT,
  attendance      TEXT NOT NULL DEFAULT 'pending'
                  CHECK (attendance IN ('pending', 'present', 'late', 'absent', 'cancelled')),
  note            TEXT,
  session_note    TEXT,
  next_action     TEXT,
  session_type_id TEXT,
  updated_at      TEXT,
  PRIMARY KEY (appointment_id, student_id)
);
INSERT INTO appointment_students_new (appointment_id, student_id, facet_id, attendance, note, session_note, next_action, session_type_id, updated_at)
  SELECT appointment_id, student_id, facet_id, attendance, note, session_note, next_action, session_type_id, updated_at
    FROM appointment_students;
DROP TABLE appointment_students;
ALTER TABLE appointment_students_new RENAME TO appointment_students;
CREATE INDEX IF NOT EXISTS idx_appt_students_student ON appointment_students(student_id);
CREATE INDEX IF NOT EXISTS idx_appt_students_attendance ON appointment_students(attendance);

-- نقص «ثبت نتیجه»: پیگیری فقط با status=done بسته می‌شد و هیچ نتیجه‌ای ثبت نمی‌شد.
ALTER TABLE followups ADD COLUMN result TEXT;

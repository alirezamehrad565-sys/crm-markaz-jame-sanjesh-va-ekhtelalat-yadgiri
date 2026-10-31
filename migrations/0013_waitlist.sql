CREATE TABLE IF NOT EXISTS waitlist (
  id                       TEXT PRIMARY KEY,
  first_name               TEXT NOT NULL,
  last_name                TEXT NOT NULL,
  phone                    TEXT NOT NULL,                -- موبایل ولیّ نرمال‌شده 09xxxxxxxxx
  national_id              TEXT,                         -- اختیاری — در /schedule برای ساخت پرونده لازم می‌شود
  birth_date               TEXT,                         -- YYYY-MM-DD اختیاری
  school_id                TEXT REFERENCES schools(id),
  class_id                 TEXT REFERENCES classes(id),
  source                   TEXT NOT NULL DEFAULT 'self'
                           CHECK (source IN ('self', 'school', 'teacher', 'doctor', 'other')),
  service_type             TEXT,                         -- نوع خدمت درخواستی (متن آزاد)
  note                     TEXT,                         -- یادداشت + لاگ تماس‌ها/رد (append)
  priority                 TEXT NOT NULL DEFAULT 'normal'
                           CHECK (priority IN ('normal', 'urgent')),
  status                   TEXT NOT NULL DEFAULT 'waiting'
                           CHECK (status IN ('waiting', 'called', 'scheduled', 'admitted', 'rejected', 'no_show', 'cancelled')),
  manual_order             INTEGER,                      -- NULL = ترتیب خودکار؛ عدد = حالت دستی
  call_count               INTEGER NOT NULL DEFAULT 0,
  last_call_at             TEXT,                         -- ISO UTC
  scheduled_appointment_id TEXT REFERENCES appointments(id),
  admitted_student_id      TEXT REFERENCES students(id),
  created_by               TEXT NOT NULL REFERENCES staff(id),
  deleted_at               TEXT,                         -- soft delete
  created_at               TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at               TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_waitlist_status ON waitlist(status, manual_order, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_waitlist_phone  ON waitlist(phone);
CREATE INDEX IF NOT EXISTS idx_waitlist_appt   ON waitlist(scheduled_appointment_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_student ON waitlist(admitted_student_id);

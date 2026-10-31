CREATE TABLE IF NOT EXISTS student_education_history (
  id          TEXT PRIMARY KEY,
  student_id  TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  study_year  TEXT NOT NULL,             -- سال تحصیلی آزاد: «۱۴۰۲–۱۴۰۳» یا «سال دوم»
  school_name TEXT,                      -- کجا درس خوانده (متن آزاد)
  level       TEXT,                      -- سطح/پایهٔ دانش‌آموز در همان سال
  notes       TEXT,                      -- توضیحات آزاد
  created_by  TEXT REFERENCES staff(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_edu_hist_student ON student_education_history(student_id, created_at);

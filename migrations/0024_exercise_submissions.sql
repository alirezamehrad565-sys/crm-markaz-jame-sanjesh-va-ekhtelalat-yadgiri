CREATE TABLE IF NOT EXISTS exercise_submissions (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES exercise_assignments(id),
  student_id TEXT NOT NULL REFERENCES students(id),
  file_name TEXT,
  file_mime TEXT,
  file_size INTEGER,
  file_key TEXT,                                -- کلید در ObjectStore (داخل D1 یا R2)
  source_chat_id TEXT,                          -- چت بله فرستنده (ولیّ) — برای ردیابی
  note TEXT,                                    -- کپشن پیام خانواده
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_exercise_submissions_assignment ON exercise_submissions(assignment_id, created_at);
CREATE INDEX IF NOT EXISTS idx_exercise_submissions_student ON exercise_submissions(student_id, created_at);

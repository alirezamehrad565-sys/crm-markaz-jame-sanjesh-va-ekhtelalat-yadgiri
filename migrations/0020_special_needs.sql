ALTER TABLE students ADD COLUMN special_need_type TEXT;
ALTER TABLE students ADD COLUMN special_need_severity TEXT;
ALTER TABLE students ADD COLUMN identified_at TEXT;

CREATE INDEX IF NOT EXISTS idx_students_special_need
  ON students (special_need_type)
  WHERE special_need_type IS NOT NULL;

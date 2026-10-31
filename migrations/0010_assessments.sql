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

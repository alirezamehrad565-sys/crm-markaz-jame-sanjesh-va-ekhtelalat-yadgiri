CREATE TABLE IF NOT EXISTS exercise_packages (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  published INTEGER NOT NULL DEFAULT 1,
  send_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES staff(id),
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_exercise_packages_published ON exercise_packages(published, deleted_at, created_at);

CREATE TABLE IF NOT EXISTS exercise_package_items (
  package_id TEXT NOT NULL REFERENCES exercise_packages(id),
  exercise_id TEXT NOT NULL REFERENCES exercises(id),
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (package_id, exercise_id)
);

CREATE INDEX IF NOT EXISTS idx_exercise_package_items_ex ON exercise_package_items(exercise_id);

CREATE TABLE IF NOT EXISTS exercise_package_tags (
  package_id TEXT NOT NULL REFERENCES exercise_packages(id),
  tag_id TEXT NOT NULL REFERENCES tags(id),
  PRIMARY KEY (package_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_exercise_package_tags_tag ON exercise_package_tags(tag_id);

CREATE TABLE IF NOT EXISTS exercise_batches (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id),
  package_id TEXT REFERENCES exercise_packages(id),
  title TEXT NOT NULL,
  note TEXT,
  assigned_by TEXT NOT NULL,                    -- staff id یا class:<classId>
  assigned_via TEXT NOT NULL DEFAULT 'panel',   -- bot | panel
  sent_at TEXT,
  sent_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_exercise_batches_student ON exercise_batches(student_id, created_at);

ALTER TABLE exercise_assignments ADD COLUMN batch_id TEXT REFERENCES exercise_batches(id);
CREATE INDEX IF NOT EXISTS idx_exercise_assignments_batch ON exercise_assignments(batch_id);

ALTER TABLE exercises ADD COLUMN assign_count INTEGER NOT NULL DEFAULT 0;

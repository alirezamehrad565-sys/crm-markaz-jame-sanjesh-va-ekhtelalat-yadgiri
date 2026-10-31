CREATE TABLE IF NOT EXISTS exercises (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  format TEXT NOT NULL DEFAULT 'worksheet',     -- worksheet | game | instruction — ماتریس در کد
  published INTEGER NOT NULL DEFAULT 1,         -- فقط منتشرشده‌ها در بات/برچسب دیده می‌شوند
  file_name TEXT,
  file_mime TEXT,
  file_size INTEGER,
  file_key TEXT,                                -- کلید در ObjectStore (داخل D1 یا R2)
  created_by TEXT NOT NULL REFERENCES staff(id),
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_exercises_published ON exercises(published, deleted_at, created_at);

CREATE TABLE IF NOT EXISTS exercise_tags (
  exercise_id TEXT NOT NULL REFERENCES exercises(id),
  tag_id TEXT NOT NULL REFERENCES tags(id),
  PRIMARY KEY (exercise_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_exercise_tags_tag ON exercise_tags(tag_id);

CREATE TABLE IF NOT EXISTS exercise_assignments (
  id TEXT PRIMARY KEY,
  exercise_id TEXT NOT NULL REFERENCES exercises(id),
  student_id TEXT NOT NULL REFERENCES students(id),
  assigned_by TEXT NOT NULL,                    -- staff id یا class:<classId> (معلم مدرسه)
  assigned_via TEXT NOT NULL DEFAULT 'bot',     -- bot | panel
  note TEXT,
  status TEXT NOT NULL DEFAULT 'assigned',      -- assigned | done | cancelled — ماتریس در کد
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_exercise_assignments_student ON exercise_assignments(student_id, created_at);
CREATE INDEX IF NOT EXISTS idx_exercise_assignments_exercise ON exercise_assignments(exercise_id, created_at);

CREATE TABLE IF NOT EXISTS exercise_files (
  key TEXT PRIMARY KEY,
  mime TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  content_b64 TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bot_menu_state (
  chat_id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,                        -- JSON: {v, cats?, filter?, ex?, stu?, sent?}
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

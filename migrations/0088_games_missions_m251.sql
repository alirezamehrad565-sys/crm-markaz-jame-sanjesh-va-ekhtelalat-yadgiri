-- m251-ب — M1 (۱.۲۵.۰۷) بستر بک‌اند بازی: تجویز، مأموریت، جلسه، پاسخ
-- اصول غیرقابل مذاکرهٔ نقشهٔ راه (§۱):
--   · game_attempts فقط اضافه‌شونده است (append-only)؛ idem_key یگانه → تکرار ایمن است.
--   · حذف فیزیکی ممنوع؛ status/validity روایت می‌کند.
--   · کلید پاسخ هیچ‌گاه به کلاینت نمی‌رسد — نمره‌دهی فقط سمت سرور.

CREATE TABLE IF NOT EXISTS game_prescriptions (
  id              TEXT PRIMARY KEY,
  child_id        TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  package_id      TEXT NOT NULL,
  package_version TEXT NOT NULL,                -- تجویز به نسخهٔ خودش وصل می‌ماند (§۱۳)
  goal_id         TEXT NOT NULL REFERENCES game_goals(id),
  pathway_id      TEXT REFERENCES intervention_paths(id) ON DELETE SET NULL,
  dose_override   TEXT,                          -- JSON جزئی؛ فقط کلیدهای حاضر بازنویسی می‌شوند
  suggested_by    TEXT NOT NULL CHECK (suggested_by IN ('recommender','therapist')),
  created_by      TEXT NOT NULL REFERENCES staff(id),
  approved_by     TEXT NOT NULL REFERENCES staff(id),   -- هیچ تجویزی بدون امضای درمانگر فعال نمی‌شود (§۹)
  approved_at     TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','stopped','completed')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_game_rx_child ON game_prescriptions(child_id, status);

CREATE TABLE IF NOT EXISTS game_missions (
  id              TEXT PRIMARY KEY,
  prescription_id TEXT NOT NULL REFERENCES game_prescriptions(id) ON DELETE CASCADE,
  scheduled_for   TEXT NOT NULL,                 -- DATE (روز محلّی)
  mission_ref     TEXT NOT NULL,                 -- id مأموریت داخل JSON بسته
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','done','expired')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_game_missions_rx ON game_missions(prescription_id, scheduled_for);

CREATE TABLE IF NOT EXISTS game_sessions (
  id               TEXT PRIMARY KEY,
  mission_id       TEXT NOT NULL REFERENCES game_missions(id) ON DELETE CASCADE,
  state            TEXT NOT NULL DEFAULT 'child_active'
                   CHECK (state IN ('parent_pre','child_active','child_done','parent_gate','parent_post','closed')),
  validity         TEXT NOT NULL DEFAULT 'valid' CHECK (validity IN ('valid','partial','invalid')),
  started_at       TEXT,
  ended_at         TEXT,
  last_activity_at TEXT,
  metrics_json     TEXT,                         -- {metricId: value} محاسبه‌شده در پایان (فقط پروب)
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_game_sessions_mission ON game_sessions(mission_id);

CREATE TABLE IF NOT EXISTS game_attempts (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  item_id       TEXT NOT NULL,
  phase         TEXT NOT NULL CHECK (phase IN ('train','probe')),
  response_json TEXT NOT NULL,
  correct       INTEGER CHECK (correct IN (0,1)), -- NULL = پاسخ باز (سنجهٔ دستی)
  rt_ms         INTEGER,
  rt_valid      INTEGER NOT NULL DEFAULT 1,
  idem_key      TEXT NOT NULL UNIQUE,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_game_attempts_session ON game_attempts(session_id);

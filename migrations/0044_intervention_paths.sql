CREATE TABLE IF NOT EXISTS intervention_paths (
  id                TEXT PRIMARY KEY,
  student_id        TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  target_key        TEXT NOT NULL,               -- کلید هدف از دانش‌نامهٔ ۱۸گانه (targets.ts)
  status            TEXT NOT NULL DEFAULT 'suggested', -- suggested|reviewed|active|closed — ترنزیشن در کد
  engine_hypothesis TEXT,                        -- JSON snapshot فرضیهٔ موتور (null = هدف دستی درمانگر)
  decision          TEXT,                        -- JSON تصمیم درمانگر
  steps             TEXT NOT NULL DEFAULT '[]',  -- JSON گام‌های مسیر
  exercise_ids      TEXT NOT NULL DEFAULT '[]',  -- JSON آرایهٔ id تمرین
  reassess_at       TEXT,                        -- — یادآور بازسنجی ۴–۶ هفته
  created_by        TEXT NOT NULL REFERENCES staff(id),
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at        TEXT
);

CREATE INDEX IF NOT EXISTS idx_ip_student ON intervention_paths(student_id, status) WHERE deleted_at IS NULL;

-- 1.25.48 — m6 «امتیاز شناسنامه + هم‌قراردادسازی برگزیده‌ها با قرارداد واقعی CP»
-- ─────────────────────────────────────────────────────────────────────────────────────
-- ① مولد امتیاز: امتیاز هر آیتم (میزان ارجاع و استفاده) را «خودِ سامانهٔ کلاینت» تولید
--    می‌کند و در content_score_report مادی می‌شود؛ CP هنگام جمع‌آوری فقط-خواندنی می‌خواند.
--    فرمول v1 ثابت دو طرفه: min(50,refs×5)+min(50,uses×2) — کل ۰..۱۰۰.
-- ② هم‌قرارداد با قرارداد واقعی CP (cp-repo m5/m6): گونه‌های کامل کتابخانه
--    (card=document/clearbook هم اضافه می‌شوند) + ستون‌های شناسنامهٔ طراح/فایل/زیردسته/امتیاز.
-- ③ پیوند کارت محلی: exercises.source_ref_network — «افزودن به بانک کارت» از برگزیده‌های CP.
-- هیچ ردیفی حذف نمی‌شود؛ بازسازی جدول با حفظ کامل (SQLite ویرایش CHECK ندارد).

-- ① گزارش امتیاز مولدِ خودِ کلاینت
CREATE TABLE IF NOT EXISTS content_score_report (
  source_table     TEXT NOT NULL,               -- 'exercises' | 'pathway_templates'
  source_id        TEXT NOT NULL,
  refs             INTEGER NOT NULL DEFAULT 0,  -- ارجاع: کارت در کارت‌های جلسهٔ pathway + exercise_ids مسیر
  uses             INTEGER NOT NULL DEFAULT 0,  -- استفاده: تخصیص واقعی (لغوشده شمرده نمی‌شود) / مسیر برخاسته از قالب
  score            INTEGER NOT NULL DEFAULT 0,
  formula_version  INTEGER NOT NULL DEFAULT 1,
  generated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (source_table, source_id)
);
CREATE INDEX IF NOT EXISTS idx_content_score_score ON content_score_report(score DESC);

-- ② بازسازی network_content — گونه‌های کامل CP + ستون‌های شناسنامه (حفظ ردیف‌ها)
CREATE TABLE network_content_new (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('exercise', 'card', 'document', 'plan', 'doc', 'clearbook')),
  title         TEXT NOT NULL,
  summary       TEXT,
  body          TEXT,
  tags          TEXT NOT NULL DEFAULT '[]',
  subcategory   TEXT,                          -- زیردستهٔ واقعی ماژول مبدأ (calendar/phase برای clearbook)
  author_name   TEXT,                          -- طراح تمرین — پایان‌بندی اعتبار اثر (m6)
  co_author_name TEXT,
  file_name     TEXT,                          -- شناسنامهٔ فایل مبدأ (بایت در CP می‌ماند — دانلود فقط-خواندنی)
  file_size     INTEGER,
  external_url  TEXT,
  quality       TEXT,                          -- JSON شناسنامهٔ CP (امتیاز ارجاع/استفاده + منبع تولید)
  origin        TEXT NOT NULL DEFAULT 'local' CHECK (origin IN ('local', 'cp')),
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'queued', 'submitted', 'withdrawn', 'published')),
  source_center TEXT,
  source_ref    TEXT,
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  submitted_at  TEXT,
  synced_at     TEXT,
  created_by    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO network_content_new
  (id, kind, title, summary, body, tags, subcategory, author_name, co_author_name,
   file_name, file_size, external_url, quality, origin, status, source_center, source_ref,
   active, submitted_at, synced_at, created_by, created_at, updated_at)
SELECT
  id, kind, title, summary, body, tags, NULL, NULL, NULL,
  NULL, NULL, NULL, NULL, origin, status, source_center, source_ref,
  active, submitted_at, synced_at, created_by, created_at, updated_at
FROM network_content;

DROP TABLE network_content;
ALTER TABLE network_content_new RENAME TO network_content;

CREATE INDEX IF NOT EXISTS idx_network_content_kind   ON network_content(kind, active, updated_at);
CREATE INDEX IF NOT EXISTS idx_network_content_status ON network_content(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_network_content_origin ON network_content(origin, active, updated_at);

-- ③ پیوند کارت محلیِ ساخته‌شده از برگزیده‌های CP
ALTER TABLE exercises ADD COLUMN source_ref_network TEXT;
CREATE INDEX IF NOT EXISTS idx_exercises_source_ref_network ON exercises(source_ref_network);

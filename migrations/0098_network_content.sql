-- 1.25.46 — کتابخانهٔ شبکه (محور دوم): محتوای همرسان‌شدهٔ محلی + برگزیده‌های توزیع‌شده از CP
-- قرارداد: docs/cp-node-content-hub.md — سه نوع محتوا: تمرین/کارت آماده (exercise)،
-- طرح درمان (plan)، سند خام (doc).
--   origin='local'  → ردیف‌هایی که خود مرکز می‌سازد و برای همرسانی صف می‌کند
--                     (status: draft→queued→submitted؛ withdrawn = کنارگذاری محلی)
--   origin='cp'     → ردیف‌های برگزیده‌ای که کنترل‌پلین پس از کیوریشن توزیع می‌کند؛
--                     فقط با پیشوند «cp-content-» نوشته می‌شوند (گارد دو لایه در ماژول سینک)
--                     و active:false یعنی بایگانی — حذف فیزیکی ممنوع.
-- بدون هیچ FK تازه؛ created_by برای ردیف‌های cp لازم نیست کارمند واقعی باشد.
CREATE TABLE IF NOT EXISTS network_content (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('exercise', 'plan', 'doc')),
  title         TEXT NOT NULL,
  summary       TEXT,
  body          TEXT,                          -- JSON ساختارمند محتوا (مراحل/موارد/متن سند)
  tags          TEXT NOT NULL DEFAULT '[]',    -- JSON آرایهٔ برچسب‌های متنی
  origin        TEXT NOT NULL DEFAULT 'local' CHECK (origin IN ('local', 'cp')),
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'queued', 'submitted', 'withdrawn', 'published')),
  source_center TEXT,                          -- کد مرکز مبدأ (ردیف‌های cp)
  source_ref    TEXT,                          -- ارجاع اختیاری به آیتم محلی مبدأ (exercises.id و …)
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  submitted_at  TEXT,
  synced_at     TEXT,
  created_by    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_network_content_kind   ON network_content(kind, active, updated_at);
CREATE INDEX IF NOT EXISTS idx_network_content_status ON network_content(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_network_content_origin ON network_content(origin, active, updated_at);

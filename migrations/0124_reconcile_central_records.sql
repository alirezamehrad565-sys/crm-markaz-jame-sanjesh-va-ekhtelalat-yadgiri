-- 0124_reconcile_central_records.sql (sdt156 — بستن data-001 رجیستری ممیزی، 1.27.79-B1)
-- آشتی «نصب از صفر» با پروداکشن برای جفت تکراری 0026: در پروداکشن ترتیب اعمال «حذف (05:29) → ساخت
-- (18:49)» بود (docs/MIGRATIONS.md §شماره‌های تکراری) پس central_records در پروداکشن موجود است؛
-- ولی اجرای لغویِ نام فایل‌ها در نصب تازه «ساخت → حذف» است و جدول باقی نمی‌ماند. این مایگریشن
-- انتهایی روی پروداکشن no-op است (جدول از پیش هست) و روی نصب تازهٔ ابری/موتور محلی/d1-seed همان
-- شکل را می‌سازد. DDL عیناً از 0026_central_data.sql کپی شده — فایل اعمال‌شده هرگز ویرایش نمی‌شود.
CREATE TABLE IF NOT EXISTS central_records (
  id          TEXT PRIMARY KEY,
  dataset     TEXT NOT NULL,
  name        TEXT NOT NULL,
  payload     TEXT NOT NULL DEFAULT '{}',
  source      TEXT,
  external_id TEXT,
  created_by  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (dataset, external_id)
);
CREATE INDEX IF NOT EXISTS idx_central_records_dataset ON central_records(dataset, name);
CREATE INDEX IF NOT EXISTS idx_central_records_updated ON central_records(updated_at);

-- مایگریشن اسکیما D1 — دادهٔ مرکزی
-- سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
-- ─────────────────────────────────────────────────────────────
--: پایگاه دادهٔ مرکزی — مخزن عمومی داده‌های ورودی از منابع مختلف
-- * مرکزِ داده‌ها: هر فایل/لیستی که کاربر می‌فرستد (عوامل اجرایی،
-- مدارس شهرستان، مراکز همکار و…) یک dataset مستقل است.
-- * payload: JSON آزاد فیلدها (کلید = برچسب فارسی ستون منبع)
-- * external_id: کلید یکتا در منبع (کدملی / شناسهٔ سایت مبدأ) →
-- ایمپورت تکراری به‌جای رکورد تکراری، رکورد را به‌روز می‌کند
-- * source: نام فایل یا URL منبع — برای ردیابی
-- ─────────────────────────────────────────────────────────────

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

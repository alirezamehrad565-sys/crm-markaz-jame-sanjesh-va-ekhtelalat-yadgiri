-- 0112 — rust-f12-A: جدول نمایشی اطلاعیه‌های سینک‌شده از مرکز (docs/rust/node-sync.md §صندوق ورودی)
-- چرا جدول جدا و نه استقرار در announcements (0008)? جدول اصلی created_by TEXT NOT NULL
-- REFERENCES staff(id) دارد؛ payload اطلاعیهٔ صندوق (projection سمت ابر در 0110) چنین FK
-- محلی ندارد و ردیف مرکز به کارمند محلی اشاره نمی‌کند — درج در جدول اصلی «دروغ FK» است و
-- ممنوع. پس ردیف نمایشی مستقل اینجا انبار می‌شود (هم‌تصمیم معماری «جدول نمایشی»).
-- صندوق node_sync_inbox (0110) transport log و منبع حقیقت می‌ماند؛ این جدول فقط «نمایش»
-- را برای مصرف‌کنندهٔ محلی می‌سازد و با UPSERT هم‌گام می‌شود (نگاشت در internal-sync/service.ts).
-- بدنهٔ TEXT NOT NULL DEFAULT '' — payload بدون body اطلاعیهٔ خالی‌متن است نه رد نامعتبر.

CREATE TABLE IF NOT EXISTS synced_announcements (
  id           TEXT PRIMARY KEY,                   -- شناسهٔ اطلاعیهٔ مرکز در ابر — همان id آیتم صندوق
  title        TEXT NOT NULL,                      -- عنوان از payload؛ بدون آن نگاشت نرم رد می‌شود
  body         TEXT NOT NULL DEFAULT '',           -- متن از payload — پیش‌فرض خالی
  published_at TEXT,                               -- ISO از payload اگر بود؛ وگرنه NULL
  active       INTEGER NOT NULL DEFAULT 1,         -- صفر/یک نمایشی — payload ابر فقط فعال‌ها را می‌فرستد
  received_at  TEXT NOT NULL DEFAULT (datetime('now'))  -- لحظهٔ آخرین دریافت/به‌روزرسانی (هم‌فرمت 0110)
);

CREATE INDEX IF NOT EXISTS idx_synced_announcements_received ON synced_announcements(received_at);

-- مایگریشن اسکیما D1 — پایگاه دانش
-- سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
-- ============================================================
-- — دانش‌افزایی مرکز (دستور کاربر: «باید بخش‌هایی برای اطلاع‌رسانی و
-- دانش‌افزایی بگذاریم») — پایگاه دانش داخلی همکاران
-- جدول‌ها:
-- knowledge_items مقالهٔ کوتاه/پروتکل/نکتهٔ آموزشی/خبر — خواندن همهٔ همکاران،
-- مدیریت دفتر (مدیر/منشی)؛ حذف کامل فقط مدیر (الگوی اعلان‌ها)
-- قراردادها: بدون CHECK در SQL (الگوی D7 — enum در کد)، حذف کامل (ثبت اشتباه
-- باید قابل پاک‌کردن باشد) + audit؛ حذف نرم لازم نیست چون
-- «پیش‌نویس/بایگانی» با published پوشش داده می‌شود.
-- ============================================================

CREATE TABLE IF NOT EXISTS knowledge_items (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'tip',  -- tip | protocol | article | news — ماتریس در کد
  pinned      INTEGER NOT NULL DEFAULT 0,
  published   INTEGER NOT NULL DEFAULT 1,
  created_by  TEXT NOT NULL REFERENCES staff(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_knowledge_pub ON knowledge_items(published, pinned, created_at);

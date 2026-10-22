-- مایگریشن اسکیما D1 — پیوست مقالهٔ دانش
-- سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
-- ============================================================
-- — پیوست فایل/تصویر برای مقاله‌های دانش‌افزایی (دستور کاربر:
-- «توی قسمت دانش‌افزایی باید بشه فایل مقاله یا تصویر گذاشت»)
--
-- الگوی 0036_exercise_attachments — بازاستفادهٔ کامل:
-- * جدول پیوست با ارجاع به صاحب فایل + کلید ObjectStore (R2 یا D1 تکه‌تکه)
-- * قطعات فایل‌های بزرگ داخل همان جدول مشترک exercise_file_chunks
--   (key/seq/content — آداپتر chunked-d1-store) نگه داشته می‌شود؛
--   کلیدها با پیشوند knowledge/<itemId>/<fileId> از پیوست تمرین‌ها جدا هستند
--   و نیازی به جدول قطعهٔ جدید نیست (حداقل تغییر).
-- * مجوزها همان مدیریت دانش: افزودن/حذف پیوست = دفتر (مدیر/منشی)؛
--   دانلود = همهٔ همکاران احرازشده (مثل خواندن خود مقاله).
-- * بک‌فیل لازم نیست — تا امروز مقالهٔ دانش فایلی نداشته است.
-- ============================================================

CREATE TABLE IF NOT EXISTS knowledge_attachments (
  id TEXT PRIMARY KEY,
  knowledge_id TEXT NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  file_key TEXT NOT NULL,                       -- کلید در ObjectStore (R2 یا D1 تکه‌تکه)
  file_name TEXT NOT NULL,
  file_mime TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_knowledge_attachments_item ON knowledge_attachments(knowledge_id, created_at);

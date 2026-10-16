-- مایگریشن اسکیما D1 — پیوست تمرین
-- سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
-- ============================================================
-- — پیوست‌های چندگانهٔ تمرین (چند فایل برای هر تمرین)
-- ============================================================
-- تا هر تمرین فقط یک فایل داشت (ستون‌های file_* روی exercises).
-- از هر تمرین می‌تواند چند فایل داشته باشد (PDF/تصویر/ویدیو/سند —
-- هر فایل تا سقف متغیر بر اساس آداپتر ذخیره: D1 ← ۵۱۲KB، R2 ← ۵۰MB).
--
-- سازگاری کامل با گذشته:
-- * ستون‌های file_* جدول exercises «فایل اصلی» می‌مانند (آینهٔ اولین
-- پیوست) — بات و لینک عمومی خانواده بدون تغییر کار می‌کنند.
-- * بک‌فیل idempotent: هر تمرینِ دارای فایل، یک ردیف پیوست با همان
-- file_key می‌گیرد (اجرای مجدد ردیف تکراری نمی‌سازد).
-- ============================================================

CREATE TABLE IF NOT EXISTS exercise_attachments (
  id TEXT PRIMARY KEY,
  exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  file_key TEXT NOT NULL,                       -- کلید در ObjectStore (R2 یا D1)
  file_name TEXT NOT NULL,
  file_mime TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_exercise_attachments_ex ON exercise_attachments(exercise_id, created_at);

-- — ذخیره‌سازی تکه‌تکهٔ فایل‌های بزرگ داخل D1 (تا ۵۰ مگابایت — آداپتر chunked-d1-store)
-- هر فایل به قطعات ~۱.۵ مگابایتی BLOB شکسته می‌شود (زیر سقف ۲MB ردیف D1)؛
-- کلید = file_key پیوست در جدول بالا. فعال‌شدن R2 در آینده این جدول را بلااستفاده می‌کند.
CREATE TABLE IF NOT EXISTS exercise_file_chunks (
  key TEXT NOT NULL,
  seq INTEGER NOT NULL,
  content BLOB NOT NULL,
  PRIMARY KEY (key, seq)
);

-- بک‌فیل idempotent — فایل‌های قدیمی تک‌فایلی به پیوست تبدیل می‌شوند
INSERT INTO exercise_attachments (id, exercise_id, file_key, file_name, file_mime, file_size, created_at)
SELECT lower(
         hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-'
         || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-'
         || hex(randomblob(6))
       ),
       e.id, e.file_key, e.file_name, e.file_mime, e.file_size, datetime('now')
  FROM exercises e
 WHERE e.file_key IS NOT NULL
   AND e.file_name IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM exercise_attachments a WHERE a.exercise_id = e.id);

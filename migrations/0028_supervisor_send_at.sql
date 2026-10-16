-- مایگریشن اسکیما D1 — زمان ارسال سرپرست
-- سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
-- migrations/0028_supervisor_send_at.sql
-- — نقش «ناظر اداره» + موتور پیش‌نویس اعلان (send_at)
-- ────────────────────────────────────────────────────────────
-- چرا بازسازی staff انجام نشد؟
-- CHECK نقش در 0001 روی staff است؛ SQLite تغییر CHECK ندارد و بازسازی جدول
-- نیازمند DROP جدول والد با فرزندان FK-دار است — D1 محدودیت FK را اجباری
-- می‌کند (تست تجربی: defer_foreign_keys/foreign_keys=OFF اثر نمی‌کنند).
-- پس الگوی فقط-افزودنی پروژه: ستون role_ext نقش مؤثر را گسترش می‌دهد.
-- نقش مؤثر = COALESCE(role_ext, role) — همهٔ لایه‌های auth/bot از همین می‌خوانند.

-- ───────────── نقش ناظر اداره (فقط-افزودنی) ─────────────
ALTER TABLE staff ADD COLUMN role_ext TEXT
  CHECK (role_ext IS NULL OR role_ext = 'supervisor');

-- ───────────── موتور پیش‌نویس اعلان ─────────────
-- NULL = فوری؛ مقدار ISO آینده = در صف «ساعت ارسال» — dispatchPending فقط
-- رکوردهای send_at <= now را می‌فرستد؛ اعلان ثبت نوبت جدید تا ساعت تنظیم‌شده
-- (notify_batch_hour، پیش‌فرض 18:00 تهران) پیش‌نویس می‌ماند.
ALTER TABLE notifications ADD COLUMN send_at TEXT;
CREATE INDEX IF NOT EXISTS idx_notifications_dispatch
  ON notifications(status, send_at);

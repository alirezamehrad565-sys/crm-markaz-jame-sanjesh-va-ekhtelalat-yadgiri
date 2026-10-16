-- مایگریشن اسکیما D1 — ورود کارکنان
-- سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
-- ─────────────────────────────────────────────────────────────
--: ورود با رمز + کارمند v۲
-- - staff: username / password_hash / phone / national_id
-- - ایمیل دیگر اجباری نیست (ستون legacy برای Cloudflare Access می‌ماند)
-- - ثبت حضور همکاران فقط برای «همان روز» است (قاعده در سرویس، نه اسکیما)
-- نکته: UNIQUE با ایندکس جزئی (partial) انجام می‌شود تا NULLها تداخل نداشته باشند.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE staff ADD COLUMN phone TEXT;
ALTER TABLE staff ADD COLUMN national_id TEXT;
ALTER TABLE staff ADD COLUMN username TEXT;
ALTER TABLE staff ADD COLUMN password_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_username
  ON staff(username) WHERE username IS NOT NULL AND TRIM(username) != '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_national_id
  ON staff(national_id) WHERE national_id IS NOT NULL AND TRIM(national_id) != '';

-- backfill: نام کاربری پیش‌فرض از بخش محلی ایمیل (برای ردیف‌های قدیمی)
UPDATE staff
   SET username = lower(substr(replace(email, '@', '.'), 1, 20))
 WHERE username IS NULL OR TRIM(username) = '';

-- backfill: رمز پیش‌فرض «1234» (SHA-256) — امنیت صفحه ورود اولویت نیست (تصمیم کاربر)
UPDATE staff
   SET password_hash = '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'
 WHERE password_hash IS NULL OR TRIM(password_hash) = '';

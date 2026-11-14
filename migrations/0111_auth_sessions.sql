-- 0111 — مایلستون ۱ بخش ۸ (فاز ۶): ابطال سمت‌سرور نشست‌ها — JWT دیگر بی‌حالت نیست
-- مشکل: تا 0110، توکن سشن تا انقضا (۳۰ روز) حتی پس از خروج معتبر می‌ماند؛ logout فقط
-- audit می‌نوشت و توکن سمت کلاینت پاک می‌شد.
-- راه‌حل: هر نشست یک ردیف اینجا دارد (sid = claim جدید JWT)؛ middleware بعد از وارسی
-- امضا، ردیف را چک می‌کند (موجود + revoked_at خالی + expires_at آینده). خروج ردیف را
-- باطل می‌کند؛ هرس فرصت‌طلب ردیف‌های منقضی در login انجام می‌شود.
-- سخت‌گیری عمدی: توکن بدون sid (صدور پیش از 0111) ۴۰۱ می‌گیرد — کاربران یک‌بار ورود
-- دوباره لازم دارند. مسیرهای CF-Access / X-Dev-Staff-Id / X-Api-Key از این چک عبور
-- نمی‌کنند چون اصلاً توکن سشن اپ نیستند (زنجیرهٔ جدا در middleware).
-- مهاجرت خط main (تولید وب) بعداً با wrangler migrations apply اعمال می‌شود — این
-- تغییر در خط rust توسعه یافته و هیچ عملیات Cloudflare اجرا نکرده است.

CREATE TABLE IF NOT EXISTS auth_sessions (
  sid        TEXT PRIMARY KEY,                     -- شناسهٔ یکتای نشست — claim `sid` در JWT
  staff_id   TEXT NOT NULL REFERENCES staff(id),
  issued_at  TEXT NOT NULL,                        -- ISO UTC
  expires_at TEXT NOT NULL,                        -- ISO UTC — هم‌مقدار exp توکن
  revoked_at TEXT                                  -- NULL = فعال؛ خروج اینجا را پر می‌کند
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_staff   ON auth_sessions(staff_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry  ON auth_sessions(expires_at);

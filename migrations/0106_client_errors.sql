-- 0106 — تکمیل لولهٔ خطای مرورگر: افزودن ستون app_version به جدول موجود 0057 + اندیس هم‌بستگی نسخه
-- زمینه: جدول client_errors از 0057 («مانیتورینگ بدون سرویس خارجی») ساخته شده بود اما مسیر
-- مصرف‌کنندهٔ طراحی‌شده (POST /api/client-errors) هرگز پیاده نشد — کلاینت پست می‌کرد و میدل‌ور
-- احراز ۴۰۱ می‌داد؛ COUNTهای cp-report نیز برای همیشه صفر می‌ماندند.
-- ۱.۲۵.۶۶ مسیر را وصل می‌کند: POST /public/client-errors بی‌احراز (هم‌الگوی /public/rum —
-- خطاهای صفحهٔ ورود هم گزارش شوند) + GET /api/client-errors فقط‌مدیر.
-- ستون user_agent جدول 0057 قانون PII دارد: هرگز پر نمی‌شود (بدون IP/UA — design.md §۶).

ALTER TABLE client_errors ADD COLUMN app_version TEXT;

CREATE INDEX IF NOT EXISTS idx_client_errors_ver ON client_errors (app_version, occurred_at);

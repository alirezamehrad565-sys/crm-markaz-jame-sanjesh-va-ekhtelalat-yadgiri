-- 0125_audit_log_created_at_index.sql (sdt156 — بستن data-005 رجیستری ممیزی، 1.27.79-B3)
-- audit_log بزرگ‌ترین جدول لاگ است و هرس شبانهٔ نگه‌داشت (src/core/audit/writer.ts —
-- DELETE FROM audit_log WHERE created_at < ?) و خواندنی‌های بازه‌تاریخ پنل سلامت روی
-- created_at فیلتر می‌کنند؛ تا امروز فقط idx_audit_resource و idx_audit_actor وجود داشت
-- و هر دو مسیر اسکن کامل جدول بودند (هزینهٔ تکرارشوندهٔ شبانه، کران‌دار با نگه‌داشت ۱۸۰روزه).
-- ایندکس فقط-افزودنی، هم‌الگوی idx_rum_ts / idx_client_errors_time.
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at);

-- مایگریشن اسکیما D1 — ایندکس‌های پرکاربرد
-- سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
-- 0021_hot_query_indexes.sql — (نظم دیتابیس)
-- ایندکس داغ برای پرس‌وجوهای بازه‌ای تابلو/داشبورد:
-- WHERE a.start_at >= ? AND a.start_at < ? (working-day board + dashboard)
-- ایندکس compound قبلی idx_appointments_staff_time با پیشوند staff_id برای
-- این الگو (بدون فیلتر کارمند) قابل استفاده نیست → اسکن کامل می‌شد.
-- Additive-only؛ مطابق قرارداد migrationهای پروژه.
CREATE INDEX IF NOT EXISTS idx_appointments_start_at ON appointments(start_at);

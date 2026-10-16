-- مایگریشن اسکیما D1 — وضعیت عملیاتی نوبت
-- سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
-- ─────────────────────────────────────────────────────────────
-- فاز ۱ (بورد منشی — Master Spec v2.0 §7): وضعیت عملیاتی نوبت
-- تصمیم D1 REMAKE-PLAN: ستون additive بدون rebuild جدول appointments
-- - CHECK فعلی status IN ('scheduled','cancelled') دست‌نخورده می‌ماند
-- - NULL = برنامه‌ریزی‌شدهٔ عادی (رفتار فعلی همهٔ نوبت‌های موجود)
-- - مقادیر مجاز (کنترل در pure.ts ماتریس ترنزیشن — نه SQL):
-- checked_in | delayed | in_session | completed | no_show
-- - completed/no_show پایان‌حالت‌اند؛ لغو همچنان فقط از مسیر status
-- + تصمیم D2: تفکیک یادداشت انسانی/سیستمی در لاگ روز کاری
-- kind='human' پیش‌فرض — همهٔ ردیف‌های موجود انسانی می‌مانند
-- ─────────────────────────────────────────────────────────────

ALTER TABLE appointments ADD COLUMN ops_status TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_ops_status ON appointments(ops_status);

ALTER TABLE day_notes ADD COLUMN kind TEXT NOT NULL DEFAULT 'human';

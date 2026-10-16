-- مایگریشن اسکیما D1 — گزارش جلسه
-- سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
-- ─────────────────────────────────────────────────────────────
-- فاز ۲ (گزارش جلسه — Master Spec v2.0 §8): نتیجهٔ هر جلسه برای
-- هر دانش‌آموزِ نوبت — روی همان appointment_students (بدون جدول جدید)
-- session_note: متن گزارش جلسه (سقف ۲۰۰۰ نویسه — کنترل با Zod)
-- next_action: اقدام بعدی (تصمیم D7) — NULL = هیچ اقدامی ('none')
-- مقادیر: follow_up | next_appointment | contact | referral
-- بدون CHECK در SQL تا توسعه‌پذیر بماند (enum منبع حقیقت:
-- core/shared/constants.ts + Zod؛ ماتریس/اعتبارسنجی در کد)
-- session_type_id: فقط سازگاری آینده §8.8 — فعلاً در API/UI استفاده نمی‌شود
-- مالکیت WRITE این سه ستون با ماژول application/session-notes است؛
-- attendance و بقیهٔ ستون‌ها دست ماژول‌های مالک خودشان می‌ماند.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE appointment_students ADD COLUMN session_note TEXT NULL;
ALTER TABLE appointment_students ADD COLUMN next_action TEXT NULL;
ALTER TABLE appointment_students ADD COLUMN session_type_id TEXT NULL;

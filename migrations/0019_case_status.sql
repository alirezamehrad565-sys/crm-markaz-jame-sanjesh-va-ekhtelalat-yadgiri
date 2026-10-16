-- مایگریشن اسکیما D1 — وضعیت مورد
-- سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
-- ─────────────────────────────────────────────────────────────
-- فاز ۶ (Master Remake — §11/§14 + تصمیم D5): وضعیت پرونده دانش‌آموز
-- - ستون additive روی students — بدون rebuild و بدون دست‌زدن هیچ CHECK
-- - بدون CHECK در SQL (الگوی D7): enum در @core/shared (STUDENT_CASE_STATUSES)
-- و اعتبارسنجی با Zod — مقادیر: identified | awaiting_assessment |
-- in_intervention | monitoring | archived
-- - NULL = «بدون وضعیت ثبت‌شده» (رفتار همهٔ ردیف‌های موجود — پروفایل چیزی
-- بیشتر از قبل نشان نمی‌دهد؛ فقط وقتی منشی/مدیر وضعیت بگذارد ظاهر می‌شود)
-- - «نیازمند پیگیری» حالت ذخیره‌شده نیست — از وجود follow-up باز مشتق می‌شود
-- - تغییر وضعیت از PATCH /api/students/:id/case-status با audit هم‌تراکنش
-- student.case_status.changed — رویداد تایم‌لاین فاز ۶ همین audit را می‌خواند
-- ─────────────────────────────────────────────────────────────

ALTER TABLE students ADD COLUMN case_status TEXT;

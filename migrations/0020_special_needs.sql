-- مایگریشن اسکیما D1 — نیازهای ویژه
-- سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
-- ─────────────────────────────────────────────────────────────
-- فاز ۷ (Master Remake — §12 + §15 + تصمیم D3): نیازهای ویژه دانش‌آموز
-- - سه ستون additive روی students — بدون rebuild و بدون دست‌زدن هیچ CHECK
-- - بدون CHECK در SQL (الگوی D7): enum در @core/shared
-- (SPECIAL_NEED_TYPES + SPECIAL_NEED_SEVERITIES) و اعتبارسنجی با Zod
-- - D3: ستون ساختاریافته منبع حقیقت «نیاز شناسایی‌شده» برای گرید/هیت‌مپ است؛
-- برچسب‌های disorder فقط taxonomy آزاد فیلترپذیر می‌مانند — مهاجرت خودکار
-- از تگ به ستون انجام نمی‌شود (دادهٔ بالینی است؛ مقداردهی فقط منشی/مدیر از UI)
-- - NULL = «نیاز ویژهٔ ثبت‌شده ندارد» (رفتار همهٔ ردیف‌های موجود — هیچ نمای
-- موجودی چیزی بیشتر از قبل نشان نمی‌دهد)
-- - تغییر از PATCH /api/students/:id/special-need (فقط منشی/مدیر) با audit
-- هم‌تراکنش student.special_need.changed — فقط id فیلدها (§12.10: متن
-- تشخیص آزاد وجود ندارد و هرگز اضافه نمی‌شود)
-- - PII §12.10: هیچ ستون متن آزاد تشخیص ساخته نمی‌شود — عمداً
-- ─────────────────────────────────────────────────────────────

ALTER TABLE students ADD COLUMN special_need_type TEXT;
ALTER TABLE students ADD COLUMN special_need_severity TEXT;
ALTER TABLE students ADD COLUMN identified_at TEXT;

CREATE INDEX IF NOT EXISTS idx_students_special_need
  ON students (special_need_type)
  WHERE special_need_type IS NOT NULL;

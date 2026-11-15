-- 0103 — فیلد اختیاری «توضیحات» در سنجش روزانه (۱.۲۵.۵۷ — خواست کارفرما)
-- یک ستون additive روی screening_entries؛ ردیف‌های موجود دست‌نخورده می‌مانند.
-- خالی = ثبت‌نشده؛ سقف ۵۰۰ نویسه در اسکیما (ScreeningNoteSchema).

ALTER TABLE screening_entries ADD COLUMN note TEXT;

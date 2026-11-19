-- ۱.۲۷.۲۸ — M5 POLISH-3: شناسنامهٔ ابزار در فرم‌ساز — منبع و هنجار سنی/روایی هر قالب رویداد
-- دو ستون فقط-افزودنی؛ قالب‌های موجود تا ثبت شناسنامه در فرم‌ساز null می‌مانند.
ALTER TABLE case_event_types ADD COLUMN tool_source TEXT;
ALTER TABLE case_event_types ADD COLUMN tool_norm TEXT;

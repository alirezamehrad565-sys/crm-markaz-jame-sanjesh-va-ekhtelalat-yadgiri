-- m202 — بازآرایی دسته‌های «نمون‌برگ‌ها و اسناد خام» به طبقه‌بندی جدید مرکز
-- طبقه‌بندی جدید (به ترتیب منو):
--   sanjesh          سنجش
--   ekhtelalat       اختلالات
--   hesabdari        حسابداری
--   bazdidha         بازدیدها
--   tablo_mohr_poster تابلو/مُهر/پوستر
--   ayinnameha       آیین‌نامه‌ها
--   other            سایر
-- نگاشت اسناد موجود (طبقهٔ قدیمی m201 → جدید):
--   circular (بخشنامه) و regulation (آیین‌نامه) → ayinnameha
--   finance (مالی)                             → hesabdari
--   report  (گزارش)                            → bazdidha
--   form    (فرم اداری)                        → other
-- سایر دسته‌های نامشخص (اگر روزی دستی درج شده باشند) سرویس هنگام خواندن به other نگاشت می‌کند.
-- کوئری‌ها ذاتاً idempotent هستند (پس از اجرای اول، هیچ ردیفی با دستهٔ قدیمی نمی‌ماند).

UPDATE docs SET category = 'ayinnameha' WHERE category IN ('circular', 'regulation');
UPDATE docs SET category = 'hesabdari'   WHERE category = 'finance';
UPDATE docs SET category = 'bazdidha'    WHERE category = 'report';
UPDATE docs SET category = 'other'       WHERE category = 'form';

-- ۰۱۰۰ — سنجش روزانه: دو فیلد اختیاری «تاریخ تولد» و «نمره آمادگی تحصیلی» (۱.۲۵.۵۰)
-- هر دو ستون NULL-پذیرند — ردیف‌های موجود دست‌نخورده می‌مانند و ثبت‌های قدیمی بدون این فیلدها معتبرند.
-- birth_date: میلادی YYYY-MM-DD (قرارداد مشترک همهٔ تاریخ‌های سامانه؛ نمایش شمسی سمت کلاینت است)
-- readiness_score: عدد صحیح ۰..۱۰۰ (رنج در zod سمت سرور اعمال می‌شود)

ALTER TABLE screening_entries ADD COLUMN birth_date TEXT;
ALTER TABLE screening_entries ADD COLUMN readiness_score INTEGER;

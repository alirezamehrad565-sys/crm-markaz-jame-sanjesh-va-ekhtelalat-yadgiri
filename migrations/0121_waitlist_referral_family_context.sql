-- 0121 — فرم تکمیلی وضعیت خانواده برای معرفی دانش‌آموز (۱.۲۷.۳۶ — خواست کارفرما:
-- «زیر دانش‌آموز»: وضع فرهنگی خانواده، سطح مالی و میزان همکاری خانواده).
-- یک ستون JSON additive روی waitlist_referrals؛ ردیف‌های موجود دست‌نخورده می‌مانند و NULL می‌گیرند.
-- کلیدها: {culture:'low|mid|high', finance:'low|mid|high', cooperation:'low|mid|high'} —
-- enum در Zod با REFERRAL_FAMILY_LEVELS (الگوی D7 — بدون CHECK در SQL).
-- سطح مالی فقط برای اولویت‌بندی خدمات رایگان و کمک‌ها است؛ تأثیری در پذیرش ندارد (در فرم هم شفاف گفته می‌شود).

ALTER TABLE waitlist_referrals ADD COLUMN family_context TEXT;

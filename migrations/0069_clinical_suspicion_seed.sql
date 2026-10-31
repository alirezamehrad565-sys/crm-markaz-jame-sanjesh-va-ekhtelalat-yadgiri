-- m185 — بازسازی رگرسیون وکسلر: نوع رویداد «جمع‌بندی شک بالینی» که در پروداکشن وجود داشت
-- ولی هرگز در مایگریشن‌های مخزن seed نشده بود (نصب‌های تازهٔ داکر/سلف‌هاست آن را نداشتند)
-- + قرارداد: computeSuspicion در گیت‌ها روی همین کلید تصمیم را می‌خواند.
INSERT INTO case_event_types (id, key, title, category, icon, family_fillable, fields, bands, subscales, active, created_by, is_system, audience, description)
SELECT 'bbbbbbbb-9700-4000-8000-000000000001', 'ce-clinical-suspicion-v1',
       'جمع‌بندی شک بالینی پس از چک‌لیست‌ها', 'note', '🚩', 0,
       '[{"key":"suspect","label":"شک بالینی فعلی","type":"select","options":["بیش‌فعالی/کم‌توجهی","اضطراب","بیش‌فعالی و اضطراب هم‌زمان","شک جدی ندارم"],"required":true},{"key":"signal_summary","label":"خلاصهٔ نتایج چک‌لیست‌ها","type":"text","placeholder":"مثلاً: SNAP-IV والد IA=۱۸ و معلم IA=۱۷ — هر دو پرخطر"},{"key":"decision","label":"تصمیم درمانگر در همین گام","type":"select","options":["ادامهٔ مسیر استاندارد (وکسلر و ارزیابی کامل)","شناسایی قطعی — ورود موازی به مداخله","بازبینی پس از مشاهدهٔ کلاس","ارجاع تخصصی (روان‌پزشک/روان‌شناس)"],"required":true},{"key":"note","label":"یادداشت بالینی","type":"longtext"}]',
       NULL, NULL, 1, 'system', 1, 'staff',
       'بعد از دیدن نتیجهٔ چک‌لیست‌های والد و معلم، شک فعلی، خلاصهٔ نتایج و تصمیم قدم بعد رو این‌جا ثبت کنید. این جمع‌بندی می‌ره توی تایم‌لاین پرونده و گزارش کمیسیون.'
WHERE NOT EXISTS (SELECT 1 FROM case_event_types WHERE key = 'ce-clinical-suspicion-v1' AND deleted_at IS NULL);

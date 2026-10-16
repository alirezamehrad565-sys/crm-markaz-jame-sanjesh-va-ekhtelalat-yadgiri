-- مایگریشن اسکیما D1 — انواع جلسه و مسیرها
-- سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
-- ============================================================
-- — موتور «مسیر تفسیر بالینی» — بخش ۱: نوع نوبت + مسیر پرونده
-- (جدول ۴ اساس‌نامه: سه نحوهٔ ارائه + زمان‌بندی جلسات)
-- ۱) appointments.session_type — نوع جلسه (۵ نوع از جدول ۴؛ NULL = نوبت‌های قدیمی/بدون نوع)
-- بدون CHECK در SQL (الگوی D7) — enum در @core/shared + اعتبارسنجی Zod
-- ۲) students.pathway — مسیر پرونده (learning = اختلال یادگیری / rehab = توانبخشی ذهنی-جسمی)
-- NULL = هنوز تعیین نشده (رفتار همهٔ ردیف‌های موجود)
-- ۳) فرم‌های سیستمی مسیر تفسیر (is_system=1):
-- - ce-results-v1: فرم نتایج — جمع‌بندی نتایج ارزیابی
-- - ce-wechsler-w4-v1: فرم نتایج وکسلر ۴ (WISC-IV) — آمادهٔ اتصال به موتور تحلیل
-- - ce-rehab-cog-v1: ارزیابی شناختی کاردرمانی ذهنی (شاخهٔ توانبخشی)
-- - ce-rehab-motor-v1: ارزیابی حرکتی-جسمی (شاخهٔ توانبخشی)
-- - ce-rehab-adl-v1: مهارت‌های خودیاری و زندگی روزمره (شاخهٔ توانبخشی)
-- additive — هیچ ستون/جدول موجودی تغییر نمی‌کند؛ نوبت‌های قدیمی session_type=NULL می‌مانند
-- ============================================================

ALTER TABLE appointments ADD COLUMN session_type TEXT;
ALTER TABLE students ADD COLUMN pathway TEXT;

-- ─── فرم نتایج — جمع‌بندی نتایج ارزیابی (هر دو مسیر) ───
INSERT OR IGNORE INTO case_event_types (id, key, title, category, icon, family_fillable, fields, bands, tags, audience, active, created_by, subscales, is_system)
VALUES (
  'bbbbbbbb-8900-4000-8000-000000000001',
  'ce-results-v1',
  'فرم نتایج — جمع‌بندی ارزیابی',
  'note',
  '🧾',
  0,
  '[{"key":"period","label":"بازهٔ ارزیابی","type":"select","options":["ارزیابی اولیه","ارزیابی تخصصی","بازسنجی","جمع‌بندی نهایی"],"required":true},{"key":"tools_done","label":"ابزارها و آزمون‌های انجام‌شده","type":"longtext","placeholder":"مثلاً: وکسلر ۴، SDQ والد و معلم، پروب خواندن، مشاهدهٔ کلاس"},{"key":"key_findings","label":"یافته‌های کلیدی","type":"longtext","required":true},{"key":"strengths","label":"نقاط قوت کودک","type":"longtext"},{"key":"priority_diffs","label":"دشواری‌های اولویت‌دار","type":"longtext","required":true},{"key":"recommendation","label":"توصیه‌ها (خانواده / مدرسه / مرکز)","type":"longtext"},{"key":"next_action","label":"اقدام بعدی","type":"select","options":["شروع مداخله","ارزیابی تخصصی بیشتر","ارجاع","جلسهٔ مشترک با خانواده","پیگیری آموزشی مدرسه"],"required":true},{"key":"next_action_note","label":"توضیح اقدام بعدی","type":"text"}]',
  NULL,
  NULL,
  'staff',
  1,
  'seed-m89',
  NULL,
  1
);

-- ─── فرم نتایج وکسلر ۴ (WISC-IV) — آمادهٔ اتصال به موتور تحلیل وکسلر ───
INSERT OR IGNORE INTO case_event_types (id, key, title, category, icon, family_fillable, fields, bands, tags, audience, active, created_by, subscales, is_system)
VALUES (
  'bbbbbbbb-8900-4000-8000-000000000002',
  'ce-wechsler-w4-v1',
  'فرم نتایج وکسلر ۴ (WISC-IV) — ثبت درمانگر',
  'session',
  '🧠',
  0,
  '[{"key":"age_at_test","label":"سن کودک در زمان آزمون (سال و ماه — مثلاً ۹ و ۴)","type":"text","placeholder":"مثلاً ۹ سال و ۴ ماه"},{"key":"fsiq","label":"هوشبهر کلی (FSIQ)","type":"number","required":true},{"key":"vci","label":"شاخص درک کلامی (VCI)","type":"number"},{"key":"pri","label":"شاخص استدلال عینی (PRI)","type":"number"},{"key":"wmi","label":"شاخص حافظهٔ کاری (WMI)","type":"number"},{"key":"psi","label":"شاخص سرعت پردازش (PSI)","type":"number"},{"key":"raw_sim","label":"نمرهٔ خام — شباهت‌ها","type":"number"},{"key":"raw_voc","label":"نمرهٔ خام — واژگان","type":"number"},{"key":"raw_com","label":"نمرهٔ خام — درک","type":"number"},{"key":"raw_bd","label":"نمرهٔ خام — مکعب‌ها","type":"number"},{"key":"raw_pc","label":"نمرهٔ خام — مفاهیم تصویری","type":"number"},{"key":"raw_mr","label":"نمرهٔ خام — ماتریس‌ها","type":"number"},{"key":"raw_ds","label":"نمرهٔ خام — اعداد (دیجیت)","type":"number"},{"key":"raw_ln","label":"نمرهٔ خام — ترتیب اعداد و حروف","type":"number"},{"key":"raw_cd","label":"نمرهٔ خام — رمزنویسی (کد)","type":"number"},{"key":"raw_ss","label":"نمرهٔ خام — جستجوی نماد","type":"number"},{"key":"engine_output","label":"خروجی موتور تحلیل وکسلر (کپی/جای‌گذاری)","type":"longtext","placeholder":"خروجی موتور تحلیل وکسلر را این‌جا کپی کنید — اتصال زندهٔ API در فاز بعد فعال می‌شود"},{"key":"strengths_weaknesses","label":"نقاط قوت و ضعف پروفایل (شکاف شاخص‌ها)","type":"longtext"},{"key":"interpretation","label":"تفسیر بالینی","type":"longtext"},{"key":"recommendation","label":"توصیه‌ها","type":"longtext"},{"key":"next_action","label":"اقدام بعدی","type":"select","options":["هیچ","پیگیری","نوبت بعدی","تماس با خانواده","ارجاع"]}]',
  NULL,
  NULL,
  'staff',
  1,
  'seed-m89',
  NULL,
  1
);

-- ─── ارزیابی شناختی کاردرمانی ذهنی — شاخهٔ توانبخشی ───
INSERT OR IGNORE INTO case_event_types (id, key, title, category, icon, family_fillable, fields, bands, tags, audience, active, created_by, subscales, is_system)
VALUES (
  'bbbbbbbb-8900-4000-8000-000000000003',
  'ce-rehab-cog-v1',
  'ارزیابی شناختی — کاردرمانی ذهنی',
  'checklist',
  '🧩',
  0,
  '[{"key":"h01","label":"توجه و تمرکز: روی یک فعالیت ساخت‌یافته تا انتها می‌ماند","type":"scale","scaleMax":3,"scaleLabels":["تقریباً هرگز","گاهی","اغلب","تقریباً همیشه"],"required":true,"subscaleId":"att"},{"key":"h02","label":"حواسش با محرک‌های ساده پرت می‌شود و کارش نیمه‌کاره می‌ماند","type":"scale","scaleMax":3,"scaleLabels":["تقریباً هرگز","گاهی","اغلب","تقریباً همیشه"],"required":true,"subscaleId":"att","reverse":true},{"key":"h03","label":"چیزهای تازه را به یاد می‌آورد (قرارها، دستورها، جای وسایل)","type":"scale","scaleMax":3,"scaleLabels":["تقریباً هرگز","گاهی","اغلب","تقریباً همیشه"],"required":true,"subscaleId":"mem"},{"key":"h04","label":"دستور دومرحله‌ای («بشوی دست‌ها و بعد حوله بیار») را کامل اجرا می‌کند","type":"scale","scaleMax":3,"scaleLabels":["تقریباً هرگز","گاهی","اغلب","تقریباً همیشه"],"required":true,"subscaleId":"exec"},{"key":"h05","label":"پیش از عمل فکر می‌کند و کار را گام‌به‌گام جلو می‌برد","type":"scale","scaleMax":3,"scaleLabels":["تقریباً هرگز","گاهی","اغلب","تقریباً همیشه"],"required":true,"subscaleId":"exec"},{"key":"h06","label":"در تغییر روال یا برنامهٔ تازه دچار گِر می‌شود","type":"scale","scaleMax":3,"scaleLabels":["تقریباً هرگز","گاهی","اغلب","تقریباً همیشه"],"required":true,"subscaleId":"exec","reverse":true},{"key":"h07","label":"شکل‌ها، رنگ‌ها و جزئیات تصویرها را درست تشخیص می‌دهد","type":"scale","scaleMax":3,"scaleLabels":["تقریباً هرگز","گاهی","اغلب","تقریباً همیشه"],"required":true,"subscaleId":"per"},{"key":"h08","label":"جهت‌ها (چپ/راست، بالا/پایین) و نسبت فضا را درست درک می‌کند","type":"scale","scaleMax":3,"scaleLabels":["تقریباً هرگز","گاهی","اغلب","تقریباً همیشه"],"required":true,"subscaleId":"per"},{"key":"h09","label":"مسئله‌های سادهٔ عملی را با راهنمای کم حل می‌کند","type":"scale","scaleMax":3,"scaleLabels":["تقریباً هرگز","گاهی","اغلب","تقریباً همیشه"],"required":true,"subscaleId":"ps"},{"key":"h10","label":"سرعت انجام کارهای ذهنی ساده با هم‌سالانش برابری می‌کند","type":"scale","scaleMax":3,"scaleLabels":["تقریباً هرگز","گاهی","اغلب","تقریباً همیشه"],"required":true,"subscaleId":"ps"},{"key":"h11","label":"وقتی خسته یا آشفته است، چطور خودش را آرام می‌کند (استراتژی خودتنظیمی دارد)","type":"scale","scaleMax":3,"scaleLabels":["تقریباً هرگز","گاهی","اغلب","تقریباً همیشه"],"required":true,"subscaleId":"reg"},{"key":"h12","label":"بعد از استراحت کوتاه، به فعالیت برمی‌گردد و ادامه می‌دهد","type":"scale","scaleMax":3,"scaleLabels":["تقریباً هرگز","گاهی","اغلب","تقریباً همیشه"],"required":true,"subscaleId":"reg"}]',
  '[{"max":9999,"label":"ثبت شد","color":"ok","advice":"این ارزیابی پایهٔ مسیر توانبخشی است — با فرم نتایج جمع‌بندی کنید و اهداف کوچک تعیین کنید."}]',
  NULL,
  'staff',
  1,
  'seed-m89',
  '[{"id":"att","name":"توجه و تمرکز"},{"id":"mem","name":"حافظه و یادآوری"},{"id":"exec","name":"کارکرد اجرایی و انعطاف"},{"id":"per","name":"ادراک دیداری-فضایی"},{"id":"ps","name":"حل مسئله و سرعت پردازش"},{"id":"reg","name":"خودتنظیمی"}]',
  1
);

-- ─── ارزیابی حرکتی-جسمی — شاخهٔ توانبخشی ───
INSERT OR IGNORE INTO case_event_types (id, key, title, category, icon, family_fillable, fields, bands, tags, audience, active, created_by, subscales, is_system)
VALUES (
  'bbbbbbbb-8900-4000-8000-000000000004',
  'ce-rehab-motor-v1',
  'ارزیابی حرکتی-جسمی — توانبخشی',
  'checklist',
  '🤸',
  0,
  '[{"key":"m01","label":"راه رفتن و دویدن هماهنگ و بی‌خطر است","type":"scale","scaleMax":3,"scaleLabels":["محدودیت زیاد","محدودیت متوسط","کمی محدود","همسالان"],"required":true,"subscaleId":"gross"},{"key":"m02","label":"از پله‌ها (رفتن و آمدن) بدون کمک استفاده می‌کند","type":"scale","scaleMax":3,"scaleLabels":["محدودیت زیاد","محدودیت متوسط","کمی محدود","همسالان"],"required":true,"subscaleId":"gross"},{"key":"m03","label":"تعادل در بازی‌های یک‌پا یا حرکات تعادلی حفظ می‌کند","type":"scale","scaleMax":3,"scaleLabels":["محدودیت زیاد","محدودیت متوسط","کمی محدود","همسالان"],"required":true,"subscaleId":"bal"},{"key":"m04","label":"قلم را درست می‌گیرد و فشار دستش مناسب است","type":"scale","scaleMax":3,"scaleLabels":["محدودیت زیاد","محدودیت متوسط","کمی محدود","همسالان"],"required":true,"subscaleId":"fine"},{"key":"m05","label":"بریدن، تاکردن، دکمه‌بستن و بستن زیپ را انجام می‌دهد","type":"scale","scaleMax":3,"scaleLabels":["محدودیت زیاد","محدودیت متوسط","کمی محدود","همسالان"],"required":true,"subscaleId":"fine"},{"key":"m06","label":"چشم و دست با هم کار می‌کند (توپ‌گیری، مهره‌چیدن، کپی کردن شکل)","type":"scale","scaleMax":3,"scaleLabels":["محدودیت زیاد","محدودیت متوسط","کمی محدود","همسالان"],"required":true,"subscaleId":"eye"},{"key":"m07","label":"وضعیت نشستن و استقامت تن در مدت کلاس پایدار است","type":"scale","scaleMax":3,"scaleLabels":["محدودیت زیاد","محدودیت متوسط","کمی محدود","همسالان"],"required":true,"subscaleId":"post"},{"key":"m08","label":"بدون خستگی زودهنگام، فعالیت بدنی کلاس را کامل می‌کند","type":"scale","scaleMax":3,"scaleLabels":["محدودیت زیاد","محدودیت متوسط","کمی محدود","همسالان"],"required":true,"subscaleId":"post"}]',
  '[{"max":9999,"label":"ثبت شد","color":"ok","advice":"ارزیابی حرکتی ثبت شد — اهداف با اولویت حرکت درشت/ظریف در مسیر مداخله تعیین شود."}]',
  NULL,
  'staff',
  1,
  'seed-m89',
  '[{"id":"gross","name":"حرکت درشت"},{"id":"bal","name":"تعادل"},{"id":"fine","name":"حرکت ظریف و دست"},{"id":"eye","name":"هماهنگی چشم-دست"},{"id":"post","name":"تن و استقامت"}]',
  1
);

-- ─── مهارت‌های خودیاری و زندگی روزمره — شاخهٔ توانبخشی ───
INSERT OR IGNORE INTO case_event_types (id, key, title, category, icon, family_fillable, fields, bands, tags, audience, active, created_by, subscales, is_system)
VALUES (
  'bbbbbbbb-8900-4000-8000-000000000005',
  'ce-rehab-adl-v1',
  'مهارت‌های خودیاری و زندگی روزمره',
  'checklist',
  '🥣',
  1,
  '[{"key":"a01","label":"خوردن مستقل (قاشق، لیوان، بدون ریختن زیاد)","type":"scale","scaleMax":3,"scaleLabels":["کاملاً وابسته","با کمک زیاد","با راهنمای کم","مستقل"],"required":true,"subscaleId":"care"},{"key":"a02","label":"پوشیدن و درآوردن لباس (دکمه، زیپ، انتخاب لباس تناسب هوا)","type":"scale","scaleMax":3,"scaleLabels":["کاملاً وابسته","با کمک زیاد","با راهنمای کم","مستقل"],"required":true,"subscaleId":"care"},{"key":"a03","label":"بهداشت فردی (دست‌شویی، مسواک، شست‌وشوی دست)","type":"scale","scaleMax":3,"scaleLabels":["کاملاً وابسته","با کمک زیاد","با راهنمای کم","مستقل"],"required":true,"subscaleId":"hyg"},{"key":"a04","label":"مرتب‌کردن وسایل خودش (کیف، میز، اسباب‌بازی)","type":"scale","scaleMax":3,"scaleLabels":["کاملاً وابسته","با کمک زیاد","با راهنمای کم","مستقل"],"required":true,"subscaleId":"org"},{"key":"a05","label":"جابه‌جایی در مدرسه/خانه و رسیدن به مقصد شناخته‌شده","type":"scale","scaleMax":3,"scaleLabels":["کاملاً وابسته","با کمک زیاد","با راهنمای کم","مستقل"],"required":true,"subscaleId":"mob"},{"key":"a06","label":"استفاده از وسایل کلاس و لوازم‌التحریر به‌شکل هدفمند","type":"scale","scaleMax":3,"scaleLabels":["کاملاً وابسته","با کمک زیاد","با راهنمای کم","مستقل"],"required":true,"subscaleId":"org"},{"key":"a07","label":"در خرید، صف یا موقعیت‌های اجتماعی سادهٔ روزمره مناسب رفتار می‌کند","type":"scale","scaleMax":3,"scaleLabels":["کاملاً وابسته","با کمک زیاد","با راهنمای کم","مستقل"],"required":true,"subscaleId":"soc"}]',
  '[{"max":9999,"label":"ثبت شد","color":"ok","advice":"مهارت‌های پایه ثبت شد — هدف‌گذاری کوچک و خانواده‌محور (تمرین روزانه در خانه) توصیه می‌شود."}]',
  NULL,
  'staff',
  1,
  'seed-m89',
  '[{"id":"care","name":"مراقبت شخصی"},{"id":"hyg","name":"بهداشت فردی"},{"id":"org","name":"سازماندهی وسایل"},{"id":"mob","name":"جابه‌جایی و مسیر"},{"id":"soc","name":"موقعیت‌های اجتماعی روزمره"}]',
  1
);

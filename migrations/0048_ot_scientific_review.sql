-- مایگریشن اسکیما D1 — بررسی علمی OT
-- سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
-- ============================================================
-- (0.73.0) — اصلاحات علمی داوری دو متخصص (روانشناسی + کاردرمانی) روی
-- ۱) ot_skills.expected_age — بازهٔ سنی موردانتظار (مرجع رشدی — نه ملاک قبولی)
-- ۲) ot_skills.skill_group + is_primary — مهارت‌های هم‌سازه؛ فقط primary در شمارش پیشرفت
-- ۳) ot_progress.prompt_level — سطح راهنما برای «با کمک» (کلامی/ژستی/لمسی جزئی/فیزیکی کامل)
-- ۴) بازنویسی معیارهای مبهم + جایگزینی آیتم‌های نوزادی + جابه‌جایی ترتیب سختی (یافته‌های P0/P1)
-- ۵) فرم ce-needs-v1 — چهار نیاز ویژهٔ تکمیلی: ناتوانی هوشی / تأخیر رشدی جهانی /
-- اختلال ارتباط اجتماعی / اختلال تیک
-- additive — هیچ جدولی حذف نمی‌شود؛ بدون CHECK (الگوی D7) — enum در کد
-- ============================================================

ALTER TABLE ot_skills ADD COLUMN expected_age TEXT;
ALTER TABLE ot_skills ADD COLUMN skill_group TEXT;
ALTER TABLE ot_skills ADD COLUMN is_primary INTEGER NOT NULL DEFAULT 1;
ALTER TABLE ot_progress ADD COLUMN prompt_level TEXT;

-- ─── ۱) جایگزینی آیتم‌های نوزادی (غلت پهلویی و محلی‌سازی صدا = سطح ۶-۱۰ ماهگی) ───
UPDATE ot_skills SET
  title     = 'غلت جلو روی تشک',
  criterion = '۳ غلت جلو پیوسته با جمع‌کردن زانوها و خروج مستقل از حالت جمع',
  expected_age = '۴-۵ سال'
WHERE id = 'ot-gross-02';

UPDATE ot_skills SET
  title     = 'تمرکز شنیداری — واکنش به صدای هدف',
  criterion = 'بلندکردن دست به‌محض شنیدن صدای هدف در ۴ از ۵ بار (بدون صدای مزاحم)',
  expected_age = '۴-۵ سال'
WHERE id = 'ot-aud-01';

-- ─── ۲) بازنویسی معیارهای مبهم → معیار کمی قابل‌اندازه‌گیری (هم‌سانی بین درمانگرها) ───
UPDATE ot_skills SET criterion = 'گیر سه‌انگشتی (شست-اشاره-میانه) با فضای باز بین انگشتان — در ۱۰ دقیقه نوشتن، نوک مداد نشکند و کاغذ پاره نشود' WHERE id = 'ot-fine-05';
UPDATE ot_skills SET criterion = '۳ توپ‌گیری موفق از ۵ پرتاب از فاصلهٔ ۲ متر با توپ بادی حدود ۲۰ سانتی‌متر' WHERE id = 'ot-gross-10';
UPDATE ot_skills SET criterion = 'خوردن کامل یک وعده با کمتر از ۳ قاشق ریخته' WHERE id = 'ot-adl-01';
UPDATE ot_skills SET criterion = 'لیوان ۲/۳ پر — ریزش کمتر از ۱۰ میلی‌لیتر' WHERE id = 'ot-adl-02';
UPDATE ot_skills SET criterion = 'لوزی با ۴ ضلع بسته و زاویه‌های مجاور ۹۰±۳۰ درجه — یا ستارهٔ ۵ رأس کامل' WHERE id = 'ot-visual-10';
UPDATE ot_skills SET criterion = 'ساختن الگوی سه‌عضوی با ترتیب درست و ۲ تکرار بی‌خطا' WHERE id = 'ot-visual-12';
UPDATE ot_skills SET criterion = 'رو به رو شدن و حفظ تماس چشمی حداقل ۲ ثانیه در شروع و پایان' WHERE id = 'ot-soc-02';
UPDATE ot_skills SET criterion = 'اجرای قواعد با حداکثر ۱ یادآوری کلامی در ۱۰ دقیقه بازی' WHERE id = 'ot-soc-06';
UPDATE ot_skills SET criterion = 'بدون کمک فیزیکی — ناراحتی کمتر از ۳۰ ثانیه؛ بدون پرتاب و بدون گریهٔ بیش از ۱ دقیقه' WHERE id = 'ot-soc-11';
UPDATE ot_skills SET criterion = 'تغییر قاعدهٔ طبقه‌بندی و ادامهٔ کار بدون ترک فعالیت یا ابراز ناراحتی آشکار' WHERE id = 'ot-cog-11';
UPDATE ot_skills SET criterion = 'اجرای دستور با نویز پس‌زمینهٔ حدود ۶۰ دسی‌بل (نسبت سیگنال به نویز حدود ۱۰+ دسی‌بل)' WHERE id = 'ot-aud-11';

-- ─── ۳) جابه‌جایی ترتیب سختی (داوری کاردرمانی — تعادل ایستا مقدم بر پویا و...) ───
-- حرکات درشت: چهاردست‌وپا → ۲؛ غلت جلو → ۳؛ پرتاب به هدف → ۶؛ پاشنه/پنجه → ۷؛ پرش از مانع → ۹ (تک‌پا در ۸ می‌ماند)
UPDATE ot_skills SET ord = 2 WHERE id = 'ot-gross-03';
UPDATE ot_skills SET ord = 3 WHERE id = 'ot-gross-02';
UPDATE ot_skills SET ord = 6 WHERE id = 'ot-gross-09';
UPDATE ot_skills SET ord = 7 WHERE id = 'ot-gross-06';
UPDATE ot_skills SET ord = 9 WHERE id = 'ot-gross-07';
-- حرکات ظریف: قیچی خط مستقیم → ۷؛ رنگ‌آمیزی → ۸؛ دکمه/زیپ → ۹؛ قیچی منحنی → ۱۰
UPDATE ot_skills SET ord = 7 WHERE id = 'ot-fine-08';
UPDATE ot_skills SET ord = 8 WHERE id = 'ot-fine-07';
UPDATE ot_skills SET ord = 9 WHERE id = 'ot-fine-10';
UPDATE ot_skills SET ord = 10 WHERE id = 'ot-fine-09';
-- ادراک دیداری: ترتیب کامل — تطابق، کپی اشکال، حافظه، تفاوت‌ها، ماز، تکمیل تصویر، مارپیچ، شلوغ‌یابی، جهت‌ها، لوزی/ستاره، الگو، آینه‌ای
UPDATE ot_skills SET ord = 2  WHERE id = 'ot-visual-07';
UPDATE ot_skills SET ord = 3  WHERE id = 'ot-visual-04';
UPDATE ot_skills SET ord = 4  WHERE id = 'ot-visual-02';
UPDATE ot_skills SET ord = 5  WHERE id = 'ot-visual-09';
UPDATE ot_skills SET ord = 6  WHERE id = 'ot-visual-03';
UPDATE ot_skills SET ord = 7  WHERE id = 'ot-visual-08';
UPDATE ot_skills SET ord = 8  WHERE id = 'ot-visual-05';
UPDATE ot_skills SET ord = 9  WHERE id = 'ot-visual-06';
UPDATE ot_skills SET ord = 11 WHERE id = 'ot-visual-12';
UPDATE ot_skills SET ord = 12 WHERE id = 'ot-visual-11';
-- توجه و مهارت‌های ذهنی: توجه پایدار → ۶؛ حذف هدف → ۷؛ الگو → ۸؛ تغییر قاعده → ۹؛ حافظهٔ کاری → ۱۰؛ سیگنال معکوس → ۱۱
UPDATE ot_skills SET ord = 6  WHERE id = 'ot-cog-07';
UPDATE ot_skills SET ord = 7  WHERE id = 'ot-cog-08';
UPDATE ot_skills SET ord = 8  WHERE id = 'ot-cog-06';
UPDATE ot_skills SET ord = 9  WHERE id = 'ot-cog-11';
UPDATE ot_skills SET ord = 10 WHERE id = 'ot-cog-09';
UPDATE ot_skills SET ord = 11 WHERE id = 'ot-cog-10';
-- اجتماعی-هیجانی: شناخت هیجان (۷) → ۶؛ قواعد بازی (۶) → ۷
UPDATE ot_skills SET ord = 6 WHERE id = 'ot-soc-07';
UPDATE ot_skills SET ord = 7 WHERE id = 'ot-soc-06';

-- ─── ۴) گروه‌بندی سازه‌های هم‌پوشان — فقط primary در شمارش پیشرفت ───
-- «دکمه و زیپ»: fine-10 (سنجش ظریف — primary) و adl-08 (روی خود در لباس واقعی — مکمل)
UPDATE ot_skills SET skill_group = 'buttons', is_primary = 1 WHERE id = 'ot-fine-10';
UPDATE ot_skills SET skill_group = 'buttons', is_primary = 0 WHERE id = 'ot-adl-08';

-- ─── ۵) بازهٔ سنی موردانتظار هر ۸۴ مهارت (مرجع رشدی — هنجارهای PDMS-2/BOT-2/Beery/بومی) ───
UPDATE ot_skills SET expected_age = CASE id
  WHEN 'ot-gross-01' THEN '۴-۵ سال'   WHEN 'ot-gross-02' THEN '۴-۵ سال'
  WHEN 'ot-gross-03' THEN '۳-۴ سال'   WHEN 'ot-gross-04' THEN '۴-۵ سال'
  WHEN 'ot-gross-05' THEN '۳-۴ سال'   WHEN 'ot-gross-06' THEN '۵-۶ سال'
  WHEN 'ot-gross-07' THEN '۴-۵ سال'   WHEN 'ot-gross-08' THEN '۵-۶ سال'
  WHEN 'ot-gross-09' THEN '۴-۵ سال'   WHEN 'ot-gross-10' THEN '۵-۶ سال'
  WHEN 'ot-gross-11' THEN '۶-۷ سال'   WHEN 'ot-gross-12' THEN '۶-۷ سال'
  ELSE expected_age END
WHERE domain = 'gross';

UPDATE ot_skills SET expected_age = CASE id
  WHEN 'ot-fine-01' THEN '۲-۳ سال'   WHEN 'ot-fine-02' THEN '۳-۴ سال'
  WHEN 'ot-fine-03' THEN '۳-۴ سال'   WHEN 'ot-fine-04' THEN '۳-۴ سال'
  WHEN 'ot-fine-05' THEN '۵-۶ سال'   WHEN 'ot-fine-06' THEN '۵-۶ سال'
  WHEN 'ot-fine-07' THEN '۴-۵ سال'   WHEN 'ot-fine-08' THEN '۵-۶ سال'
  WHEN 'ot-fine-09' THEN '۵-۶ سال'   WHEN 'ot-fine-10' THEN '۴-۵ سال'
  WHEN 'ot-fine-11' THEN '۶-۷ سال'   WHEN 'ot-fine-12' THEN '۶-۷ سال'
  ELSE expected_age END
WHERE domain = 'fine';

UPDATE ot_skills SET expected_age = CASE id
  WHEN 'ot-visual-01' THEN '۲-۳ سال'   WHEN 'ot-visual-07' THEN '۳-۵ سال'
  WHEN 'ot-visual-04' THEN '۴-۵ سال'   WHEN 'ot-visual-02' THEN '۴-۵ سال'
  WHEN 'ot-visual-09' THEN '۵-۶ سال'   WHEN 'ot-visual-03' THEN '۴-۵ سال'
  WHEN 'ot-visual-08' THEN '۵-۶ سال'   WHEN 'ot-visual-05' THEN '۵-۶ سال'
  WHEN 'ot-visual-06' THEN '۵-۶ سال'   WHEN 'ot-visual-10' THEN '۶-۷ سال'
  WHEN 'ot-visual-12' THEN '۶-۷ سال'   WHEN 'ot-visual-11' THEN '۶-۷ سال'
  ELSE expected_age END
WHERE domain = 'visual';

UPDATE ot_skills SET expected_age = CASE id
  WHEN 'ot-aud-01' THEN '۴-۵ سال'   WHEN 'ot-aud-02' THEN '۳-۴ سال'
  WHEN 'ot-aud-03' THEN '۴-۵ سال'   WHEN 'ot-aud-04' THEN '۳-۴ سال'
  WHEN 'ot-aud-05' THEN '۴-۵ سال'   WHEN 'ot-aud-06' THEN '۵-۶ سال'
  WHEN 'ot-aud-07' THEN '۵-۶ سال'   WHEN 'ot-aud-08' THEN '۵-۶ سال'
  WHEN 'ot-aud-09' THEN '۵-۶ سال'   WHEN 'ot-aud-10' THEN '۵-۶ سال'
  WHEN 'ot-aud-11' THEN '۷-۸ سال'   WHEN 'ot-aud-12' THEN '۶-۷ سال'
  ELSE expected_age END
WHERE domain = 'auditory';

UPDATE ot_skills SET expected_age = CASE id
  WHEN 'ot-cog-01' THEN '۳-۴ سال'   WHEN 'ot-cog-02' THEN '۳-۴ سال'
  WHEN 'ot-cog-03' THEN '۴-۵ سال'   WHEN 'ot-cog-04' THEN '۴-۵ سال'
  WHEN 'ot-cog-05' THEN '۴-۵ سال'   WHEN 'ot-cog-07' THEN '۵-۶ سال'
  WHEN 'ot-cog-08' THEN '۶-۷ سال'   WHEN 'ot-cog-06' THEN '۵-۶ سال'
  WHEN 'ot-cog-11' THEN '۴-۵ سال'   WHEN 'ot-cog-09' THEN '۶-۷ سال'
  WHEN 'ot-cog-10' THEN '۶-۷ سال'   WHEN 'ot-cog-12' THEN '۶-۷ سال'
  ELSE expected_age END
WHERE domain = 'cognitive';

UPDATE ot_skills SET expected_age = CASE id
  WHEN 'ot-adl-01' THEN '۲-۳ سال'   WHEN 'ot-adl-02' THEN '۲-۳ سال'
  WHEN 'ot-adl-03' THEN '۳-۴ سال'   WHEN 'ot-adl-04' THEN '۴-۵ سال'
  WHEN 'ot-adl-05' THEN '۳-۴ سال'   WHEN 'ot-adl-06' THEN '۵-۶ سال'
  WHEN 'ot-adl-07' THEN '۴-۵ سال'   WHEN 'ot-adl-08' THEN '۴-۵ سال'
  WHEN 'ot-adl-09' THEN '۴-۵ سال'   WHEN 'ot-adl-10' THEN '۶-۷ سال'
  WHEN 'ot-adl-11' THEN '۶-۷ سال'   WHEN 'ot-adl-12' THEN '۷-۸ سال'
  ELSE expected_age END
WHERE domain = 'adl';

UPDATE ot_skills SET expected_age = CASE id
  WHEN 'ot-soc-01' THEN '۲-۳ سال'   WHEN 'ot-soc-02' THEN '۳-۴ سال'
  WHEN 'ot-soc-03' THEN '۴-۵ سال'   WHEN 'ot-soc-04' THEN '۴-۵ سال'
  WHEN 'ot-soc-05' THEN '۴-۵ سال'   WHEN 'ot-soc-07' THEN '۴-۵ سال'
  WHEN 'ot-soc-06' THEN '۵-۶ سال'   WHEN 'ot-soc-08' THEN '۵-۶ سال'
  WHEN 'ot-soc-09' THEN '۵-۶ سال'   WHEN 'ot-soc-10' THEN '۶-۷ سال'
  WHEN 'ot-soc-11' THEN '۶-۷ سال'   WHEN 'ot-soc-12' THEN '۷-۸ سال'
  ELSE expected_age END
WHERE domain = 'social';

-- ─── ۶) فرم سیستمی ce-needs-v1 — چهار نیاز تکمیلی در گزینه‌ها ───
UPDATE case_event_types SET fields =
  '[{"key":"evidence","label":"خلاصهٔ شواهد شناسایی (شرح‌حال / چک‌لیست‌های رفتاری / وکسلر / ارزیابی مهارتی)","type":"longtext"},{"key":"need_type","label":"نیاز ویژهٔ نهایی","type":"select","options":["نارساخوانی (دیس‌لکسی)","نارسانویسی (دیس‌گرافی)","نارساریاضی (دیس‌کالکولی)","بیش‌فعالی و کم‌توجهی","طیف اتیسم","اختلال زبانی و بیان","اضطراب","اختلال هماهنگی حرکتی","دیرآموز","ناتوانی هوشی","تأخیر رشدی جهانی","اختلال ارتباط اجتماعی (پراگماتیک)","اختلال تیک","سایر"],"required":true},{"key":"protocol","label":"پروتکل مداخله","type":"select","options":["پروتکل اختلال یادگیری","پروتکل دیرآموز","پروتکل کاردرمانی ذهنی","پروتکل توانبخشی ذهنی-جسمی"],"required":true},{"key":"protocol_secondary","label":"پروتکل پشتیبان (اختیاری)","type":"select","options":["هیچ","پروتکل اختلال یادگیری","پروتکل دیرآموز","پروتکل کاردرمانی ذهنی","پروتکل توانبخشی ذهنی-جسمی"]},{"key":"goals","label":"اهداف کوچک دورهٔ اول","type":"longtext"},{"key":"session_plan","label":"برنامهٔ جلسات پیشنهادی","type":"text","placeholder":"مثلاً: هفته‌ای ۲ جلسهٔ فردی ۴۵ دقیقه + هفته‌ای یک جلسهٔ خانواده‌محور"}]'
WHERE key = 'ce-needs-v1' AND is_system = 1;

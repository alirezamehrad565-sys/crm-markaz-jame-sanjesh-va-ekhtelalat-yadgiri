-- 0131 — بازموضع‌سازی اختصاصی مرکز به «اختلال یادگیری (SLD) و دیرآموزی» (خواست کارفرما: بدون اتیسم)
-- چهار بلوک، همه نرم و بازگشت‌پذیر و Idempotent (اجرای دوباره = بدون تغییر):
--   ① بایگانی پنج قالب سیستمی خارج از مأموریت جدید: active=0 + یادداشت بایگانی در انتهای description
--     (الگوی بازنشستگی نرم 0127؛ قالب غیرفعال از فهرست API می‌افتد — service.ts:953 — و ساخت مسیر از آن
--     مسدود می‌شود — service.ts:740 — ولی ردیف و متن برای بازگشت محفوظ می‌ماند).
--     فعال می‌مانند (۶): sys-sld-reading، sys-sld-writing، sys-sld-math، sys-wm-primary، sys-writing-g12، sys-math-g1.
--   ② بایگانی چهار کارت اتیسم بانک تمرین: published=0 (ستون دیده‌شدن 0023:35 — فقط منتشرشده‌ها در بات/برچسب)؛
--     حذف نرم deleted_at عمداً استفاده نشد تا کارت در پنل برای انتشار دوباره قابل دیدن بماند.
--     سه کارت 0043: 113 تابلوی پیش‌بینی، 114 بازی نوبت‌گیری، 115 قصهٔ اجتماعی + کارت 0129: 212 بازی نوبت‌گیری خانه.
--     کارت‌های توجه/حافظه/بازی (110/111/112/131/132/133/207/211/…) عمداً دست‌نخورده‌اند — پشتیبان درمان SLD هستند.
--   ③ بایگانی شش فرم باتری خارج از مأموریت: active=0 — الگوی حرف‌به‌حرف 0127_intake_v2_retire.sql.
--     ce-asd-criteria-v1، ce-odd-criteria-v1، ce-scared-p-v1، ce-snap-iv-p-v1، ce-snap-iv-t-v1، ce-dcdq-v1.
--     حفظ می‌شوند: ce-sdq-p/t (فرم پایش دو مرجع)، همهٔ ce-probe-*، همهٔ ce-sld-*، شرح‌حال/ورودی، فرم‌های حسی خانواده.
--     راستی‌آزمایی مرجع‌ها: هر ce-* ارجاعیِ شش قالب فعال فقط ce-probe-read/write/calc-v1 و ce-sld-read/wri/calc-v1 است
--     (کاوش متن 0128/0130) — هیچ کلید بایگانی‌شده‌ای در قالب‌های فعال صدا زده نمی‌شود؛ قالب‌های بایگانی‌شده
--     هم‌زمان با فرم‌های خود بایگانی می‌شوند و قابل نمونه‌سازی نیستند، پس چیزی نمی‌شکند.
--   ④ پیوند واقعی کارت‌های بانک به آیتم‌های جلسه (لینک‌سازی دروازهٔ ۴ — ادامهٔ سیاست 0130:11-17):
--     شناسهٔ ردیف‌های بانکِ تولید در خروجی ثبت نیست؛ پس شناسه‌ها «در لحظهٔ اجرا» با زیرکوئری عنوانِ دقیق از
--     جدول exercises حل می‌شود — شناسه واقعی، نه ساختگی. اگر کارت در پایگاه نبود یا ادغام/تغییرنام خورده بود،
--     گارد EXISTS اجرای UPDATE را بی‌اثر می‌کند و linkId همان null می‌ماند (هیچ شناسه‌ای ساخته نمی‌شود).
--     دو کارت seed با شناسهٔ لفظی ثابت 0043/0129 (103 خواندن دوبارهٔ یک‌خطی، 206 مسئلهٔ کلامی چهارگام) لینک مستقیم می‌گیرند.
--     JSON خروجی با json_set بازسازی می‌شود — شکل 0051 (sessions_json آیتم‌های {type,text,done,linkId}) دست‌نخورده.
--     گزینشگرهای قطعی بر پایهٔ سند تکلیف کارت‌ها (download/تکلیف-کارت-ها-و-نقشه-طرح-درمان.md):
--       · «حافظه فعال» ۱۴ردیفه → کانونیِ دو‌فایلیِ instruction (تک‌ردیف با format='instruction').
--       · «تقویت حافظه دیداری» سه‌ردیفه → کانونیِ سه‌فایلی = آخرین created_at (ORDER BY created_at DESC LIMIT 1).
--       · بقیهٔ عنوان‌ها تک‌ردیف‌اند — LIMIT 1 فقط ضامن قطعیت است.

-- ─── ① بایگانی پنج قالب سیستمی خارج از مأموریت (نرم + یادداشت؛ Idempotent با گارد active=1) ───
UPDATE pathway_templates SET
  active = 0,
  updated_at = datetime('now'),
  description = description || ' [بایگانی 0131 — بازموضع‌سازی مرکز فقط به اختلال یادگیری و دیرآموزی؛ این قالب غیرفعال شد و در صورت بازگشت مأموریت با active=1 دوباره فعال می‌شود.]'
WHERE key IN ('sys-adhd-preschool', 'sys-adhd-primary', 'sys-anxiety-emotion', 'sys-speech-delay', 'sys-attention-g123')
  AND active = 1;

-- ─── ② بایگانی چهار کارت اتیسم بانک تمرین (published=0 — نرم و بازگشت‌پذیر) ───
UPDATE exercises SET published = 0, updated_at = datetime('now')
WHERE id IN (
  'cccccccc-8200-4000-8000-000000000113', -- تابلوی پیش‌بینی روز (اتیسم) — 0043
  'cccccccc-8200-4000-8000-000000000114', -- بازی نوبت‌گیری (اتیسم) — 0043
  'cccccccc-8200-4000-8000-000000000115', -- قصهٔ اجتماعی (اتیسم) — 0043
  'cccccccc-8200-4000-8000-000000000212'  -- بازی نوبت‌گیری خانه (اتیسم) — 0129
) AND published = 1;

-- ─── ③ بایگانی شش فرم باتری خارج از مأموریت (active=0 — الگوی 0127؛ Idempotent) ───
UPDATE case_event_types SET active = 0, updated_at = datetime('now')
WHERE key IN (
  'ce-asd-criteria-v1',
  'ce-odd-criteria-v1',
  'ce-scared-p-v1',
  'ce-snap-iv-p-v1',
  'ce-snap-iv-t-v1',
  'ce-dcdq-v1'
) AND active = 1;

-- ─── ④ پیوند واقعی کارت‌ها به آیتم‌های جلسه — شناسه در لحظهٔ اجرا از بانک حل می‌شود ───

-- ④-الف) دو کارت seed با شناسهٔ لفظی ثابت (0043/0129) — قالب‌های SLD 0128
UPDATE pathway_templates SET sessions_json = json_set(sessions_json, '$[4].items[1].linkId', 'cccccccc-8200-4000-8000-000000000103'), updated_at = datetime('now')
WHERE key = 'sys-sld-reading' -- تکلیف خانهٔ جلسهٔ ۵: «خواندن دوبارهٔ یک‌خطی در خانه» → کارت 0043-103
  AND json_extract(sessions_json, '$[4].items[1].linkId') IS NULL;

UPDATE pathway_templates SET sessions_json = json_set(sessions_json, '$[3].items[1].linkId', 'cccccccc-8200-4000-8000-000000000206'), updated_at = datetime('now')
WHERE key = 'sys-sld-math' -- تکلیف خانهٔ جلسهٔ ۴: «مسئلهٔ کلامی چهارگام خانه» → کارت 0129-206
  AND json_extract(sessions_json, '$[3].items[1].linkId') IS NULL;

-- ④-ب) sys-wm-primary — پنج کارت بانک تولید، هفت آیتم
UPDATE pathway_templates SET sessions_json = json_set(sessions_json, '$[0].items[1].linkId',
  (SELECT id FROM exercises WHERE title = 'شمارش برعکس' AND published = 1 AND deleted_at IS NULL ORDER BY created_at LIMIT 1)), updated_at = datetime('now')
WHERE key = 'sys-wm-primary' -- جلسهٔ ۱: «کارت بانک تمرین «شمارش برعکس» — سطح ۱»
  AND EXISTS (SELECT 1 FROM exercises WHERE title = 'شمارش برعکس' AND published = 1 AND deleted_at IS NULL)
  AND json_extract(sessions_json, '$[0].items[1].linkId') IS NULL;

UPDATE pathway_templates SET sessions_json = json_set(sessions_json, '$[1].items[0].linkId',
  (SELECT id FROM exercises WHERE title = 'بازی حافظه اشکال' AND published = 1 AND deleted_at IS NULL ORDER BY created_at LIMIT 1)), updated_at = datetime('now')
WHERE key = 'sys-wm-primary' -- جلسهٔ ۲: «کارت بانک تمرین «بازی حافظهٔ اشکال»»
  AND EXISTS (SELECT 1 FROM exercises WHERE title = 'بازی حافظه اشکال' AND published = 1 AND deleted_at IS NULL)
  AND json_extract(sessions_json, '$[1].items[0].linkId') IS NULL;

UPDATE pathway_templates SET sessions_json = json_set(sessions_json, '$[1].items[1].linkId',
  (SELECT id FROM exercises WHERE title = 'تقویت حافظه دیداری' AND published = 1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1)), updated_at = datetime('now')
WHERE key = 'sys-wm-primary' -- جلسهٔ ۲: «حافظهٔ دیداری — سری کاربرگ‌ها» → کانونی سه‌فایلی (آخرین ردیف)
  AND EXISTS (SELECT 1 FROM exercises WHERE title = 'تقویت حافظه دیداری' AND published = 1 AND deleted_at IS NULL)
  AND json_extract(sessions_json, '$[1].items[1].linkId') IS NULL;

UPDATE pathway_templates SET sessions_json = json_set(sessions_json, '$[1].items[2].linkId',
  (SELECT id FROM exercises WHERE title = 'شمارش برعکس' AND published = 1 AND deleted_at IS NULL ORDER BY created_at LIMIT 1)), updated_at = datetime('now')
WHERE key = 'sys-wm-primary' -- تکلیف جلسهٔ ۲: «تکرار شمارش برعکس سطح ۱»
  AND EXISTS (SELECT 1 FROM exercises WHERE title = 'شمارش برعکس' AND published = 1 AND deleted_at IS NULL)
  AND json_extract(sessions_json, '$[1].items[2].linkId') IS NULL;

UPDATE pathway_templates SET sessions_json = json_set(sessions_json, '$[2].items[0].linkId',
  (SELECT id FROM exercises WHERE title = 'بازی حافظه شنیداری' AND published = 1 AND deleted_at IS NULL ORDER BY created_at LIMIT 1)), updated_at = datetime('now')
WHERE key = 'sys-wm-primary' -- جلسهٔ ۳: «کارت بانک تمرین «بازی حافظهٔ شنیداری»»
  AND EXISTS (SELECT 1 FROM exercises WHERE title = 'بازی حافظه شنیداری' AND published = 1 AND deleted_at IS NULL)
  AND json_extract(sessions_json, '$[2].items[0].linkId') IS NULL;

UPDATE pathway_templates SET sessions_json = json_set(sessions_json, '$[3].items[0].linkId',
  (SELECT id FROM exercises WHERE title = 'حافظه فعال' AND format = 'instruction' AND published = 1 AND deleted_at IS NULL ORDER BY created_at LIMIT 1)), updated_at = datetime('now')
WHERE key = 'sys-wm-primary' -- جلسهٔ ۴: «کارت کانونی «حافظهٔ فعال»» → ردیف کانونی دو‌فایلیِ instruction (سند تکلیف)
  AND EXISTS (SELECT 1 FROM exercises WHERE title = 'حافظه فعال' AND format = 'instruction' AND published = 1 AND deleted_at IS NULL)
  AND json_extract(sessions_json, '$[3].items[0].linkId') IS NULL;

UPDATE pathway_templates SET sessions_json = json_set(sessions_json, '$[3].items[2].linkId',
  (SELECT id FROM exercises WHERE title = 'شمارش برعکس' AND published = 1 AND deleted_at IS NULL ORDER BY created_at LIMIT 1)), updated_at = datetime('now')
WHERE key = 'sys-wm-primary' -- تکلیف جلسهٔ ۴: «شمارش برعکس سطح چهار تا پنج عدد»
  AND EXISTS (SELECT 1 FROM exercises WHERE title = 'شمارش برعکس' AND published = 1 AND deleted_at IS NULL)
  AND json_extract(sessions_json, '$[3].items[2].linkId') IS NULL;

-- ④-ج) sys-writing-g12 — پنج کارت بانک تولید، شش آیتم
UPDATE pathway_templates SET sessions_json = json_set(sessions_json, '$[1].items[0].linkId',
  (SELECT id FROM exercises WHERE title = 'تمرینات فراستیگ ( درک دیداری فضایی)' AND published = 1 AND deleted_at IS NULL ORDER BY created_at LIMIT 1)), updated_at = datetime('now')
WHERE key = 'sys-writing-g12' -- جلسهٔ ۲: «کارت بانک تمرین «فراستیگ — کاربرگ‌های درک دیداری-فضایی»»
  AND EXISTS (SELECT 1 FROM exercises WHERE title = 'تمرینات فراستیگ ( درک دیداری فضایی)' AND published = 1 AND deleted_at IS NULL)
  AND json_extract(sessions_json, '$[1].items[0].linkId') IS NULL;

UPDATE pathway_templates SET sessions_json = json_set(sessions_json, '$[1].items[1].linkId',
  (SELECT id FROM exercises WHERE title = 'تمرینات ماز' AND published = 1 AND deleted_at IS NULL ORDER BY created_at LIMIT 1)), updated_at = datetime('now')
WHERE key = 'sys-writing-g12' -- جلسهٔ ۲: «کارت بانک تمرین «ماز — کاربرگ‌های درک دیداری-فضایی و حرکت چشم»»
  AND EXISTS (SELECT 1 FROM exercises WHERE title = 'تمرینات ماز' AND published = 1 AND deleted_at IS NULL)
  AND json_extract(sessions_json, '$[1].items[1].linkId') IS NULL;

UPDATE pathway_templates SET sessions_json = json_set(sessions_json, '$[1].items[3].linkId',
  (SELECT id FROM exercises WHERE title = 'تمرینات فراستیگ ( درک دیداری فضایی)' AND published = 1 AND deleted_at IS NULL ORDER BY created_at LIMIT 1)), updated_at = datetime('now')
WHERE key = 'sys-writing-g12' -- تکلیف جلسهٔ ۲: «دو برگ فراستیگ در خانه»
  AND EXISTS (SELECT 1 FROM exercises WHERE title = 'تمرینات فراستیگ ( درک دیداری فضایی)' AND published = 1 AND deleted_at IS NULL)
  AND json_extract(sessions_json, '$[1].items[3].linkId') IS NULL;

UPDATE pathway_templates SET sessions_json = json_set(sessions_json, '$[2].items[0].linkId',
  (SELECT id FROM exercises WHERE title = 'پروتکل پیش نیاز مهارت نوشتن' AND published = 1 AND deleted_at IS NULL ORDER BY created_at LIMIT 1)), updated_at = datetime('now')
WHERE key = 'sys-writing-g12' -- جلسهٔ ۳: «کارت بانک تمرین «پروتکل پیش‌نیاز نوشتن»»
  AND EXISTS (SELECT 1 FROM exercises WHERE title = 'پروتکل پیش نیاز مهارت نوشتن' AND published = 1 AND deleted_at IS NULL)
  AND json_extract(sessions_json, '$[2].items[0].linkId') IS NULL;

UPDATE pathway_templates SET sessions_json = json_set(sessions_json, '$[2].items[3].linkId',
  (SELECT id FROM exercises WHERE title = 'تقویت هماهنگی دو نیمکره' AND published = 1 AND deleted_at IS NULL ORDER BY created_at LIMIT 1)), updated_at = datetime('now')
WHERE key = 'sys-writing-g12' -- تکلیف جلسهٔ ۳: «گرم‌کردن روزانه با کارت بانک تمرین «هماهنگی دو نیمکره»»
  AND EXISTS (SELECT 1 FROM exercises WHERE title = 'تقویت هماهنگی دو نیمکره' AND published = 1 AND deleted_at IS NULL)
  AND json_extract(sessions_json, '$[2].items[3].linkId') IS NULL;

UPDATE pathway_templates SET sessions_json = json_set(sessions_json, '$[3].items[1].linkId',
  (SELECT id FROM exercises WHERE title = 'تقویت تمیز دیداری' AND published = 1 AND deleted_at IS NULL ORDER BY created_at LIMIT 1)), updated_at = datetime('now')
WHERE key = 'sys-writing-g12' -- جلسهٔ ۴: «کارت بانک تمرین «تمیز دیداری»»
  AND EXISTS (SELECT 1 FROM exercises WHERE title = 'تقویت تمیز دیداری' AND published = 1 AND deleted_at IS NULL)
  AND json_extract(sessions_json, '$[3].items[1].linkId') IS NULL;

-- ④-د) sys-math-g1 — دو کارت بانک تولید، چهار آیتم («پروتکل ریاضی ۲» عمداً لینک نمی‌گیرد — شرطی بودن آن، 0130:17)
UPDATE pathway_templates SET sessions_json = json_set(sessions_json, '$[2].items[0].linkId',
  (SELECT id FROM exercises WHERE title = 'پروتکل پیش نیازهای مهارت ریاضی' AND published = 1 AND deleted_at IS NULL ORDER BY created_at LIMIT 1)), updated_at = datetime('now')
WHERE key = 'sys-math-g1' -- جلسهٔ ۳: «کارت بانک تمرین «پروتکل پیش‌نیازهای مهارت ریاضی (بخش ۱)»» → ردیف بدون پسوند «۲»
  AND EXISTS (SELECT 1 FROM exercises WHERE title = 'پروتکل پیش نیازهای مهارت ریاضی' AND published = 1 AND deleted_at IS NULL)
  AND json_extract(sessions_json, '$[2].items[0].linkId') IS NULL;

UPDATE pathway_templates SET sessions_json = json_set(sessions_json, '$[2].items[2].linkId',
  (SELECT id FROM exercises WHERE title = 'پروتکل پیش نیازهای مهارت ریاضی' AND published = 1 AND deleted_at IS NULL ORDER BY created_at LIMIT 1)), updated_at = datetime('now')
WHERE key = 'sys-math-g1' -- تکلیف جلسهٔ ۳: «ادامهٔ بخش کاربرگ پروتکل در خانه» → همان کارت
  AND EXISTS (SELECT 1 FROM exercises WHERE title = 'پروتکل پیش نیازهای مهارت ریاضی' AND published = 1 AND deleted_at IS NULL)
  AND json_extract(sessions_json, '$[2].items[2].linkId') IS NULL;

UPDATE pathway_templates SET sessions_json = json_set(sessions_json, '$[3].items[0].linkId',
  (SELECT id FROM exercises WHERE title = 'شمارش برعکس' AND published = 1 AND deleted_at IS NULL ORDER BY created_at LIMIT 1)), updated_at = datetime('now')
WHERE key = 'sys-math-g1' -- جلسهٔ ۴: «کارت بانک تمرین «شمارش برعکس»»
  AND EXISTS (SELECT 1 FROM exercises WHERE title = 'شمارش برعکس' AND published = 1 AND deleted_at IS NULL)
  AND json_extract(sessions_json, '$[3].items[0].linkId') IS NULL;

UPDATE pathway_templates SET sessions_json = json_set(sessions_json, '$[3].items[2].linkId',
  (SELECT id FROM exercises WHERE title = 'شمارش برعکس' AND published = 1 AND deleted_at IS NULL ORDER BY created_at LIMIT 1)), updated_at = datetime('now')
WHERE key = 'sys-math-g1' -- تکلیف جلسهٔ ۴: «تکرار شمارش برعکس سه روز در هفته»
  AND EXISTS (SELECT 1 FROM exercises WHERE title = 'شمارش برعکس' AND published = 1 AND deleted_at IS NULL)
  AND json_extract(sessions_json, '$[3].items[2].linkId') IS NULL;

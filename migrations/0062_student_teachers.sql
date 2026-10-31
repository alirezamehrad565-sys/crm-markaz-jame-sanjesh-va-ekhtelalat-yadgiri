CREATE TABLE IF NOT EXISTS student_teachers (
  id          TEXT PRIMARY KEY,
  student_id  TEXT NOT NULL REFERENCES students(id),
  name        TEXT NOT NULL,                    -- نام و نام خانوادگی معلم
  class_label TEXT,                             -- برچسب کلاس/درس (آزاد — مثل «چهارم ب — ریاضی»)
  contact     TEXT,                             -- راه ارتباطی (تلفن/بله)
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_student_teachers_student ON student_teachers(student_id, created_at);

INSERT INTO student_teachers (id, student_id, name, class_label, contact, created_at)
SELECT lower(hex(randomblob(16))), s.id, trim(c.teacher_name), c.name, c.teacher_phone, datetime('now')
  FROM students s
  JOIN classes c ON c.id = s.class_id
 WHERE trim(c.teacher_name) != ''
   AND NOT EXISTS (
        SELECT 1 FROM student_teachers t
         WHERE t.student_id = s.id AND t.name = trim(c.teacher_name)
       );

INSERT OR IGNORE INTO case_event_types (id, key, title, category, icon, family_fillable, fields, bands, tags, audience, active, created_by, subscales, is_system)
VALUES (
  'bbbbbbbb-8200-4000-8000-000000000020',
  'ce-sld-class-t-v1',
  'ملاک‌های کلاسی خواندن/نوشتن/حساب — فرم معلم',
  'checklist',
  '📖',
  1,
  '[{"key":"r01","label":"در خواندن بلندِ متن، کلمه‌ها را حرف‌به‌حرف می‌خواند یا با توقف‌های مکرر روانی خواندن را از دست می‌دهد","type":"scale","scaleMax":2,"scaleLabels":["اصلاً به‌چشم نمی‌خورد","تا حدی به‌چشم می‌خورد","به‌روشنی و مکرر"],"required":true,"subscaleId":"sld_read"},{"key":"r02","label":"در خواندن، کلمه‌های آشنا و پرتکرار را جایگزین، حذف یا اضافه می‌کند","type":"scale","scaleMax":2,"scaleLabels":["اصلاً به‌چشم نمی‌خورد","تا حدی به‌چشم می‌خورد","به‌روشنی و مکرر"],"required":true,"subscaleId":"sld_read"},{"key":"r03","label":"در خواندن همان متنی که کلاس می‌خواند، بسیار کندتر از هم‌کلاسی‌ها پیش می‌رود و زود خسته می‌شود","type":"scale","scaleMax":2,"scaleLabels":["اصلاً به‌چشم نمی‌خورد","تا حدی به‌چشم می‌خورد","به‌روشنی و مکرر"],"required":true,"subscaleId":"sld_read"},{"key":"r04","label":"پس از خواندن یک متن کوتاه، در پاسخ به پرسش‌های ساده از خودِ متن دچار مشکل است","type":"scale","scaleMax":2,"scaleLabels":["اصلاً به‌چشم نمی‌خورد","تا حدی به‌چشم می‌خورد","به‌روشنی و مکرر"],"required":true,"subscaleId":"sld_read"},{"key":"w01","label":"در دیکته، خطای حذف یا جابه‌جایی حرف‌ها دارد — حتی در کلمه‌هایی که درس داده شده است","type":"scale","scaleMax":2,"scaleLabels":["اصلاً به‌چشم نمی‌خورد","تا حدی به‌چشم می‌خورد","به‌روشنی و مکرر"],"required":true,"subscaleId":"sld_write"},{"key":"w02","label":"نوشته‌هایش بسیار کوتاه‌تر از انتظار پایهٔ تحصیلی است و از فعالیت‌های نوشتنی پرهیز می‌کند","type":"scale","scaleMax":2,"scaleLabels":["اصلاً به‌چشم نمی‌خورد","تا حدی به‌چشم می‌خورد","به‌روشنی و مکرر"],"required":true,"subscaleId":"sld_write"},{"key":"w03","label":"در نگارش، جمله‌های ناقص یا درهم می‌نویسد و نظم دادن به نوشته برایش دشوار است","type":"scale","scaleMax":2,"scaleLabels":["اصلاً به‌چشم نمی‌خورد","تا حدی به‌چشم می‌خورد","به‌روشنی و مکرر"],"required":true,"subscaleId":"sld_write"},{"key":"w04","label":"نوشتنش روی کاغذ یا تخته بیش از هم‌کلاسی‌ها زمان می‌برد و نتیجه‌اش ناخواناست","type":"scale","scaleMax":2,"scaleLabels":["اصلاً به‌چشم نمی‌خورد","تا حدی به‌چشم می‌خورد","به‌روشنی و مکرر"],"required":true,"subscaleId":"sld_write"},{"key":"m01","label":"در جمع‌های سادهٔ ذهنی (جمع و تفریق اعداد یک‌رقمی) گیر می‌کند و به شمارش انگشتی برمی‌گردد","type":"scale","scaleMax":2,"scaleLabels":["اصلاً به‌چشم نمی‌خورد","تا حدی به‌چشم می‌خورد","به‌روشنی و مکرر"],"required":true,"subscaleId":"sld_calc"},{"key":"m02","label":"در حل مسئلهٔ ریاضی، عملِ درست را تشخیص نمی‌دهد و وسط مسئله گم می‌شود","type":"scale","scaleMax":2,"scaleLabels":["اصلاً به‌چشم نمی‌خورد","تا حدی به‌چشم می‌خورد","به‌روشنی و مکرر"],"required":true,"subscaleId":"sld_calc"},{"key":"m03","label":"در محاسبه‌های چندرقمی، ستون‌بندی و رقم‌ها را جابه‌جا می‌کند و خطایشان تکراری است","type":"scale","scaleMax":2,"scaleLabels":["اصلاً به‌چشم نمی‌خورد","تا حدی به‌چشم می‌خورد","به‌روشنی و مکرر"],"required":true,"subscaleId":"sld_calc"},{"key":"m04","label":"مفهوم‌های پایهٔ ریاضی (ترتیب اعداد، مقایسه، اندازه) را دیرتر از هم‌کلاسی‌ها می‌فهمد","type":"scale","scaleMax":2,"scaleLabels":["اصلاً به‌چشم نمی‌خورد","تا حدی به‌چشم می‌خورد","به‌روشنی و مکرر"],"required":true,"subscaleId":"sld_calc"}]',
  '[{"max":6,"label":"در محدودهٔ عادی","color":"ok","advice":"نشانهٔ کلاسی دشواری یادگیری برجسته نیست — پایش دوره‌ای کافی است."},{"max":10,"label":"مرزی — نیاز به توجه","color":"warn","advice":"نشانه‌های کلاسی مرزی است؛ زیرمقیاس‌ها دیده شود و در صورت تکرار، پروب همان حوزه گرفته شود."},{"max":9999,"label":"قابل توجه — نیاز به بررسی بیشتر","color":"danger","advice":"نشانه‌های کلاسی بالاست؛ پروب سه‌گانه (خواندن/نوشتن/حساب) برای تعیین حوزهٔ اصلی پیشنهاد می‌شود."}]',
  '[]',
  'teacher',
  1,
  'seed-m150b',
  '[{"id":"sld_read","name":"خواندن در کلاس","bands":[{"max":2,"label":"در محدودهٔ عادی","color":"ok","advice":"نشانهٔ دشواری خواندن برجسته نیست — پایش دوره‌ای کافی است."},{"max":4,"label":"مرزی — نیاز به توجه","color":"warn","advice":"نشانه‌های خواندن مرزی است؛ پروب کوتاه خواندن برای سنجش دقیق‌تر پیشنهاد می‌شود."},{"max":9999,"label":"قابل توجه — نیاز به بررسی بیشتر","color":"danger","advice":"نشانه‌های خواندن بالاست؛ پروب خواندن + چک‌لیست ملاکی دشواری خواندن پیشنهاد می‌شود."}]},{"id":"sld_write","name":"نوشتن و املاء در کلاس","bands":[{"max":2,"label":"در محدودهٔ عادی","color":"ok"},{"max":4,"label":"مرزی — نیاز به توجه","color":"warn","advice":"نشانه‌های نوشتن مرزی است؛ نمونهٔ املا و تکلیف نگارش اخیر بررسی شود."},{"max":9999,"label":"قابل توجه — نیاز به بررسی بیشتر","color":"danger","advice":"نشانه‌های نوشتن بالاست؛ پروب نوشتن + تجزیهٔ خطای دیکته پیشنهاد می‌شود."}]},{"id":"sld_calc","name":"حساب در کلاس","bands":[{"max":2,"label":"در محدودهٔ عادی","color":"ok"},{"max":4,"label":"مرزی — نیاز به توجه","color":"warn","advice":"نشانه‌های حساب مرزی است؛ کار با مادهٔ عملی و پایش جلسه‌ای توصیه می‌شود."},{"max":9999,"label":"قابل توجه — نیاز به بررسی بیشتر","color":"danger","advice":"نشانه‌های حساب بالاست؛ پروب حساب + ارزیابی مفاهیم پایهٔ ریاضی پیشنهاد می‌شود."}]}]',
  1
);

UPDATE case_event_types SET description = 'دوازده جملهٔ کوتاه دربارهٔ کارکرد روزمرهٔ دانش‌آموز شما در کلاس — روانی و دقت خواندن، املاء و نگارش، و حساب. برای هر جمله بگویید چه اندازه در کلاس به‌چشم شما می‌خورد. پاسخ درست یا غلط ندارد؛ مشاهدهٔ واقعی شما ارزشمندترین دادهٔ ماست. حدود ۴ دقیقه وقت می‌برد.' WHERE key = 'ce-sld-class-t-v1' AND description IS NULL;

INSERT OR IGNORE INTO case_event_types (id, key, title, category, icon, family_fillable, fields, bands, tags, audience, active, created_by, subscales, is_system)
VALUES (
  'bbbbbbbb-8200-4000-8000-000000000021',
  'ce-comp-teacher-v2',
  'فرم جامع معلم — بستهٔ کامل مشاهدهٔ کلاس',
  'session',
  '🧑‍🏫',
  1,
  '[{"key":"pkg_sec","label":"مشاهدهٔ کلاس و زمینهٔ گزارش معلم","type":"heading"},{"key":"obs_role","label":"نقش شما با این دانش‌آموز چیست؟","type":"select","options":["معلم کلاس","معلم ویژهٔ درس (مثل ریاضی یا فارسی)","معلم تقویتی / کلاس جبرانی","سایر"],"required":true},{"key":"obs_period","label":"چه مدت او را دارید و کلاس می‌روید؟","type":"select","options":["کمتر از سه ماه","سه تا شش ماه","شش ماه تا یک سال","بیش از یک سال"],"required":true},{"key":"main_concern","label":"بزرگ‌ترین دغدغهٔ شما دربارهٔ کارکرد او در کلاس چیست؟ (کوتاه بنویسید)","type":"text"},{"key":"class_support","label":"تا حالا چه حمایت یا آموزش ویژه‌ای در کلاس برای او انجام داده‌اید؟ (مثلاً نوبت‌دهی، صندلی جلو، تکلیف کوتاه‌تر)","type":"longtext"},{"key":"teacher_notes","label":"هر نکتهٔ دیگری که به نظرتان برای درمانگر مهم است (اختیاری)","type":"longtext"}]',
  NULL,
  '[]',
  'teacher',
  1,
  'seed-m150b',
  NULL,
  1
);

UPDATE case_event_types SET description = 'یک لینک جداگانه برای هر معلم؛ چهار بخش پشت‌سرهم: چند پرسش کوتاه مشاهدهٔ کلاس، چک‌لیست توجه و بی‌قراری (SNAP-IV)، پرسش‌نامهٔ رفتار (SDQ) و ملاک‌های کلاسی خواندن/نوشتن/حساب. پاسخ‌ها جداگانه نمره می‌خورند و روی پروندهٔ دانش‌آموز با نام شما ثبت می‌شوند. حدود ۱۵ تا ۲۰ دقیقه وقت می‌برد؛ می‌توانید آرام و بدون عجله جلو بروید — همهٔ پاسخ‌ها یک‌جا در پایان ارسال می‌شود.' WHERE key = 'ce-comp-teacher-v2' AND description IS NULL;

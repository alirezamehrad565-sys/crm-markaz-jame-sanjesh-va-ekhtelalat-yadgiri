ALTER TABLE case_event_types ADD COLUMN tags TEXT;
ALTER TABLE case_event_types ADD COLUMN audience TEXT NOT NULL DEFAULT 'family';
ALTER TABLE case_events ADD COLUMN sent_at TEXT;
ALTER TABLE case_events ADD COLUMN sent_count INTEGER NOT NULL DEFAULT 0;

INSERT OR IGNORE INTO case_event_types (id, key, title, category, icon, family_fillable, fields, bands, tags, audience, active, created_by)
VALUES (
  'bbbbbbbb-7600-4000-8000-000000000001',
  'sdq-parent',
  'SDQ — نقاط قوت و دشواری‌ها (والدین)',
  'checklist', '📋', 1,
  '[{"key":"i01","label":"نسبت به دیگران مهربان و با ملاحظه است","type":"scale","scaleMax":2,"required":true},
    {"key":"i02","label":"بی‌قرار و بیش‌فعال است و طولانی نمی‌تواند سر جایش بماند","type":"scale","scaleMax":2,"required":true},
    {"key":"i03","label":"اغلب سردرد یا دل‌درد دارد یا حالت عصبی نشان می‌دهد","type":"scale","scaleMax":2,"required":true},
    {"key":"i04","label":"با بزرگ‌سالان به‌خوبی حرف می‌زند و وسایلش را به اشتراک می‌گذارد","type":"scale","scaleMax":2,"required":true},
    {"key":"i05","label":"گاهی عصبانیت یا خشم شدید نشان می‌دهد","type":"scale","scaleMax":2,"required":true},
    {"key":"i06","label":"در تنهایی می‌ماند و معمولاً تنها بازی می‌کند","type":"scale","scaleMax":2,"required":true},
    {"key":"i07","label":"معمولاً اطاعت می‌کند و کارهایش را خوب انجام می‌دهد","type":"scale","scaleMax":2,"required":true},
    {"key":"i08","label":"نگرانی زیاد دارد و گاهی نگرانی‌اش او را ناتوان می‌کند","type":"scale","scaleMax":2,"required":true},
    {"key":"i09","label":"اگر کسی آسیب‌ببیند یا ناراحت باشد، دلش می‌خواهد کمکش کند","type":"scale","scaleMax":2,"required":true},
    {"key":"i10","label":"پیوسته دست‌وپا می‌زند و آرام نمی‌نشیند","type":"scale","scaleMax":2,"required":true},
    {"key":"i11","label":"حداقل یک دوست صمیمی دارد","type":"scale","scaleMax":2,"required":true},
    {"key":"i12","label":"با بقیه دعوا می‌کند یا بقیه را اذیت می‌کند","type":"scale","scaleMax":2,"required":true},
    {"key":"i13","label":"غمگین و بی‌حال به نظر می‌رسد","type":"scale","scaleMax":2,"required":true},
    {"key":"i14","label":"عموماً مورد پسند دیگران است","type":"scale","scaleMax":2,"required":true},
    {"key":"i15","label":"حواسش به‌راحتی پرت می‌شود","type":"scale","scaleMax":2,"required":true},
    {"key":"i16","label":"عصبی و چسبنده به بزرگ‌سالان است","type":"scale","scaleMax":2,"required":true},
    {"key":"i17","label":"با دیگران مهربان و سخاوتمند است","type":"scale","scaleMax":2,"required":true},
    {"key":"i18","label":"بیشتر از هم‌سن‌هایش دروغ می‌گوید یا تقلب می‌کند","type":"scale","scaleMax":2,"required":true},
    {"key":"i19","label":"از بچه‌های ضعیف‌تر یا تازه‌واردان می‌ترسد و تحت فشارشان است","type":"scale","scaleMax":2,"required":true},
    {"key":"i20","label":"برای کمک به دیگران بدون چشمداشت پیش‌قدم می‌شود","type":"scale","scaleMax":2,"required":true},
    {"key":"i21","label":"پیش از فکر کردن کار می‌کند","type":"scale","scaleMax":2,"required":true},
    {"key":"i22","label":"کارهایی می‌کند که برای خودش یا دیگران دردسرساز است","type":"scale","scaleMax":2,"required":true},
    {"key":"i23","label":"با هم‌سالانش رابطهٔ خوبی دارد","type":"scale","scaleMax":2,"required":true},
    {"key":"i24","label":"خوب تمرکز می‌کند و به‌راحتی از کارش منصرف نمی‌شود","type":"scale","scaleMax":2,"required":true},
    {"key":"i25","label":"در رفتارش با بزرگ‌سالان مؤدب و مودب است","type":"scale","scaleMax":2,"required":true}]',
  '[{"max":13,"label":"در محدودهٔ عادی"},{"max":16,"label":"مرزی — نیاز به توجه"},{"max":9999,"label":"قابل توجه — نیاز به ارزیابی تخصصی"}]',
  NULL, 'family', 1, 'seed-m76'
);

INSERT OR IGNORE INTO case_event_types (id, key, title, category, icon, family_fillable, fields, bands, tags, audience, active, created_by)
VALUES (
  'bbbbbbbb-7600-4000-8000-000000000002',
  'conners-short',
  'کانرز کوتاه — بیش‌فعالی و کم‌توجهی',
  'checklist', '⚡', 1,
  '[{"key":"c01","label":"دست‌وپای خود را تکان می‌دهد یا سر جایش می‌پیچد","type":"scale","scaleMax":3,"required":true},
    {"key":"c02","label":"در مکان‌هایی که باید ساکت بماند، با صدای بلند راه می‌افتد","type":"scale","scaleMax":3,"required":true},
    {"key":"c03","label":"به‌راحتی حواسش پرت می‌شود و مزاحم دیگران می‌شود","type":"scale","scaleMax":3,"required":true},
    {"key":"c04","label":"نوبت‌گیری و منتظر ماندن برایش سخت است","type":"scale","scaleMax":3,"required":true},
    {"key":"c05","label":"پیش از تمام شدن پرسش، جواب می‌دهد","type":"scale","scaleMax":3,"required":true},
    {"key":"c06","label":"در تکمیل کارها پیگیری ندارد و نیمه‌کاره می‌گذارد","type":"scale","scaleMax":3,"required":true},
    {"key":"c07","label":"بی‌قرار است و انگار موتور روشن دارد","type":"scale","scaleMax":3,"required":true},
    {"key":"c08","label":"در کارهای ظریف (نوشتن، بریدن، کشیدن) مشکل دارد","type":"scale","scaleMax":3,"required":true},
    {"key":"c09","label":"به‌راحتی اغراق می‌کند یا موج‌های خشم می‌گیرد","type":"scale","scaleMax":3,"required":true},
    {"key":"c10","label":"با هم‌سالانش درگیری و کتک‌کاری دارد","type":"scale","scaleMax":3,"required":true}]',
  '[{"max":14,"label":"در محدودهٔ عادی"},{"max":19,"label":"مرزی — نیاز به توجه"},{"max":9999,"label":"قابل توجه — نیاز به ارزیابی تخصصی"}]',
  '["aaaaaaaa-0000-4000-8000-000000000004"]', 'both', 1, 'seed-m76'
);

INSERT OR IGNORE INTO case_event_types (id, key, title, category, icon, family_fillable, fields, bands, tags, audience, active, created_by)
VALUES (
  'bbbbbbbb-7600-4000-8000-000000000003',
  'achenbach-practical',
  'چک‌لیست رفتاری کودک (والدین)',
  'checklist', '🧠', 1,
  '[{"key":"a01","label":"از جدا شدن از والدین ناراحت و مضطرب می‌شود","type":"scale","scaleMax":2,"required":true},
    {"key":"a02","label":"شب‌ها خواب راحتی ندارد یا کابوس می‌بیند","type":"scale","scaleMax":2,"required":true},
    {"key":"a03","label":"به‌راحتی از حرف‌های دیگران رنجیده می‌شود","type":"scale","scaleMax":2,"required":true},
    {"key":"a04","label":"بیشتر از بچه‌های دیگر گریه یا جیغ می‌زند","type":"scale","scaleMax":2,"required":true},
    {"key":"a05","label":"از جمع و مدرسه فرار می‌کند","type":"scale","scaleMax":2,"required":true},
    {"key":"a06","label":"کارها را تکرار یا مرتب می‌کند (به شکل وسواسی)","type":"scale","scaleMax":2,"required":true},
    {"key":"a07","label":"ناخن می‌جود یا عادت‌های عصبی دارد","type":"scale","scaleMax":2,"required":true},
    {"key":"a08","label":"با خواهر/برادر یا هم‌سالان درگیری فیزیکی دارد","type":"scale","scaleMax":2,"required":true},
    {"key":"a09","label":"وسایل دیگران را بدون اجازه برمی‌دارد","type":"scale","scaleMax":2,"required":true},
    {"key":"a10","label":"دروغ می‌گوید تا از تنبیه فرار کند","type":"scale","scaleMax":2,"required":true},
    {"key":"a11","label":"اعتمادبه‌نفس پایینی دارد و خودش را ضعیف نشان می‌دهد","type":"scale","scaleMax":2,"required":true},
    {"key":"a12","label":"غمگین است و از بازی‌های موردعلاقه‌اش لذت نمی‌برد","type":"scale","scaleMax":2,"required":true},
    {"key":"a13","label":"بدون فکر کردن رفتار خطرناک می‌کند","type":"scale","scaleMax":2,"required":true},
    {"key":"a14","label":"توجه‌اش سریع پرت می‌شود و در تمرکز ضعیف است","type":"scale","scaleMax":2,"required":true},
    {"key":"a15","label":"بی‌قراری حرکتی مداوم دارد","type":"scale","scaleMax":2,"required":true},
    {"key":"a16","label":"با بزرگ‌ترها لجبازی و سرکشی می‌کند","type":"scale","scaleMax":2,"required":true},
    {"key":"a17","label":"در برقراری ارتباط و حرف زدن با دیگران سخت می‌گیرد","type":"scale","scaleMax":2,"required":true},
    {"key":"a18","label":"به قوانین بازی‌ها پایبند نیست","type":"scale","scaleMax":2,"required":true},
    {"key":"a19","label":"از تغییر روتین روزانه ناراحت می‌شود","type":"scale","scaleMax":2,"required":true},
    {"key":"a20","label":"ترس‌های بیش از اندازه از چیزهای خاص دارد","type":"scale","scaleMax":2,"required":true}]',
  '[{"max":12,"label":"در محدودهٔ عادی"},{"max":20,"label":"مرزی — نیاز به توجه"},{"max":9999,"label":"قابل توجه — نیاز به ارزیابی تخصصی"}]',
  '["aaaaaaaa-0000-4000-8000-000000000004","aaaaaaaa-0000-4000-8000-000000000007"]', 'family', 1, 'seed-m76'
);

INSERT OR IGNORE INTO case_event_types (id, key, title, category, icon, family_fillable, fields, bands, tags, audience, active, created_by)
VALUES (
  'bbbbbbbb-7600-4000-8000-000000000004',
  'teacher-classroom',
  'چک‌لیست رفتار کلاس (معلم)',
  'checklist', '🏫', 1,
  '[{"key":"t01","label":"تکالیف کلاس را سر وقت و کامل انجام می‌دهد","type":"scale","scaleMax":3,"required":true},
    {"key":"t02","label":"در فعالیت‌های گروهی همکاری می‌کند","type":"scale","scaleMax":3,"required":true},
    {"key":"t03","label":"قوانین کلاس را رعایت می‌کند","type":"scale","scaleMax":3,"required":true},
    {"key":"t04","label":"در مهارت‌های خواندن/نوشتن/ریاضی به هم‌سن‌هایش می‌رسد","type":"scale","scaleMax":3,"required":true},
    {"key":"t05","label":"رابطهٔ مناسب با هم‌کلاسی‌ها دارد","type":"scale","scaleMax":3,"required":true},
    {"key":"t06","label":"در طول کلاس تمرکز و توجه کافی دارد","type":"scale","scaleMax":3,"required":true},
    {"key":"t07","label":"بی‌قراری و بلند شدن مکرر از جا دارد","type":"scale","scaleMax":3,"required":true},
    {"key":"t08","label":"با هم‌کلاسی‌ها درگیری یا اذیت‌گری می‌کند","type":"scale","scaleMax":3,"required":true},
    {"key":"t09","label":"در ابراز احساسات مناسب مشکل دارد","type":"scale","scaleMax":3,"required":true},
    {"key":"t10","label":"از حضور در مدرسه ناراضی است یا غیبت زیاد دارد","type":"scale","scaleMax":3,"required":true},
    {"key":"t11","label":"در مهارت‌های حرکتی درسی (نوشتن/بریدن/نقاشی) ضعف دارد","type":"scale","scaleMax":3,"required":true},
    {"key":"t12","label":"به تذکر واکنش‌های شدید نشان می‌دهد","type":"scale","scaleMax":3,"required":true}]',
  '[{"max":12,"label":"در محدودهٔ عادی"},{"max":20,"label":"مرزی — نیاز به توجه"},{"max":9999,"label":"قابل توجه — نیاز به ارزیابی تخصصی"}]',
  '["aaaaaaaa-0000-4000-8000-000000000004","aaaaaaaa-0000-4000-8000-000000000001","aaaaaaaa-0000-4000-8000-000000000002","aaaaaaaa-0000-4000-8000-000000000003"]', 'teacher', 1, 'seed-m76'
);

-- مایگریشن D1 — فرم جامع خانواده (T5 — m150 موج ۲)
-- سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
-- ============================================================
-- تصمیم کارفرما (طرح واحد §۲ P0 ردیف ۳/۶/۷ + §۳ — قطعی):
-- ۱) ce-sdq-p-v1 — رسمی‌سازی SDQ والد: ۲۵ آیتم استاندارد والد (همان ساختار/لنگر نسخهٔ معلم،
--    پنج آیتمِ متکی به کلاس والدپسند بازنویسی شده)، زیرمقیاس‌های دقیقاً emo/cond/hyper/peer/pros
--    و برش‌ها هم‌سان ce-sdq-t-v1 (هم‌گرایی والد×معلم خودکار در موتور).
--    — legacy 'sdq-parent' دست‌نخورده می‌ماند؛ نگاشت قواعد legacy در موج ۳ (T6).
-- ۲) ce-id-adapt-v1 — سنجهٔ انطباقی ۱۲ آیتمی (ارتباط/مراقبت از خود/اجتماعی/کار مدرسه)،
--    زیرمقیاس id_adapt، نمرهٔ بالاتر = انطباق بهتر؛ باندهای پایین/مرزی/نرمال —
--    ملاک تفکیک ID از دیرآموز (FSIQ≤۷۰ + انطباق پایین → مسیر ID — طرح §۳.۱).
-- ۳) ce-comp-family-v2 — پکیج چند-ابزاری: یک لینک عمومی، رندر بخش‌به‌بخش، یک submit →
--    رویداد مستقل به‌ازای هر کامپوننت (ce-snap-iv-p-v1/ce-sdq-p-v1/ce-scared-p-v1/ce-id-adapt-v1
--    به‌ترتیب — قرارداد COMPOSITE_FAMILY_COMPONENTS در case-events/pure.ts) + رویداد زمینهٔ همین type.
-- — تکی‌های v1 دست‌نخورده (فقط seed سه type جدید). بازتولید: منبع حقیقت فیلدها
--   src/domain/clinical-engine/battery-composite.json؛ هر تغییر ملاک = مایگریشن جدید.
--   idempotent: INSERT OR IGNORE. اجرای ریموت با ریلیز مجری اصلی (در تست‌ها خودکار اعمال می‌شود).
-- ============================================================

-- ce-sdq-p-v1 — پرسش‌نامهٔ رفتار کودک — فرم خانواده (SDQ) [منبع: Goodman 1997 — نسخهٔ والد؛ ساخت آیتم‌ها (کلید و ترتیب) و لنگرهای پاسخ عین نسخهٔ معلم (ce-sdq-t-v1) و برش‌ها هم‌سان آن (تصمیم T5/m150 برای هم‌گرایی والد×معلم)؛ فقط متنِ پنج آیتمِ متکی به کلاس، والدپسند بازنویسی شده است. کالیبراسیون برش ویژهٔ والد با دادهٔ مرکز در.]
INSERT OR IGNORE INTO case_event_types (id, key, title, category, icon, family_fillable, fields, bands, tags, audience, active, created_by, subscales, is_system)
VALUES (
  'bbbbbbbb-8200-4000-8000-000000000017',
  'ce-sdq-p-v1',
  'پرسش‌نامهٔ رفتار کودک — فرم خانواده (SDQ)',
  'checklist',
  '📋',
  1,
  '[{"key":"i01","label":"به احساسات دیگران توجه و ملاحظه نشان می‌دهد","type":"scale","scaleMax":2,"scaleLabels":["اصلاً درست نیست","تا حدی درست است","کاملاً درست است"],"required":true,"subscaleId":"pros"},{"key":"i02","label":"بی‌قرار و بیش‌فعال است و نمی‌تواند مدتی طولانی سر جایش بماند","type":"scale","scaleMax":2,"scaleLabels":["اصلاً درست نیست","تا حدی درست است","کاملاً درست است"],"required":true,"subscaleId":"hyper"},{"key":"i03","label":"اغلب از سردرد یا دل‌درد شاکی است","type":"scale","scaleMax":2,"scaleLabels":["اصلاً درست نیست","تا حدی درست است","کاملاً درست است"],"required":true,"subscaleId":"emo"},{"key":"i04","label":"آماده است وسایلش را با دیگران به اشتراک بگذارد","type":"scale","scaleMax":2,"scaleLabels":["اصلاً درست نیست","تا حدی درست است","کاملاً درست است"],"required":true,"subscaleId":"pros"},{"key":"i05","label":"گاهی خشم شدید نشان می‌دهد","type":"scale","scaleMax":2,"scaleLabels":["اصلاً درست نیست","تا حدی درست است","کاملاً درست است"],"required":true,"subscaleId":"cond"},{"key":"i06","label":"بیشتر تنهایی بازی می‌کند و سراغ بازی گروهی نمی‌رود","type":"scale","scaleMax":2,"scaleLabels":["اصلاً درست نیست","تا حدی درست است","کاملاً درست است"],"required":true,"subscaleId":"peer"},{"key":"i07","label":"معمولاً فرمان‌بر است و خواسته‌های بزرگ‌سالان را انجام می‌دهد","type":"scale","scaleMax":2,"scaleLabels":["اصلاً درست نیست","تا حدی درست است","کاملاً درست است"],"required":true,"subscaleId":"cond","reverse":true},{"key":"i08","label":"نگرانی‌های فراوان دارد و اغلب نگران به نظر می‌رسد","type":"scale","scaleMax":2,"scaleLabels":["اصلاً درست نیست","تا حدی درست است","کاملاً درست است"],"required":true,"subscaleId":"emo"},{"key":"i09","label":"اگر کسی ناراحت یا آسیب‌دیده باشد آماده کمک است","type":"scale","scaleMax":2,"scaleLabels":["اصلاً درست نیست","تا حدی درست است","کاملاً درست است"],"required":true,"subscaleId":"pros"},{"key":"i10","label":"پیوسته دست‌وپا می‌زند یا در جای خود می‌پیچد","type":"scale","scaleMax":2,"scaleLabels":["اصلاً درست نیست","تا حدی درست است","کاملاً درست است"],"required":true,"subscaleId":"hyper"},{"key":"i11","label":"حداقل یک دوست خوب دارد","type":"scale","scaleMax":2,"scaleLabels":["اصلاً درست نیست","تا حدی درست است","کاملاً درست است"],"required":true,"subscaleId":"peer","reverse":true},{"key":"i12","label":"اغلب با دیگران دعوا یا درگیری می‌کند","type":"scale","scaleMax":2,"scaleLabels":["اصلاً درست نیست","تا حدی درست است","کاملاً درست است"],"required":true,"subscaleId":"cond"},{"key":"i13","label":"اغلب غمگین، دل‌شکسته یا بی‌حال است","type":"scale","scaleMax":2,"scaleLabels":["اصلاً درست نیست","تا حدی درست است","کاملاً درست است"],"required":true,"subscaleId":"emo"},{"key":"i14","label":"مورد پسند و پذیرفتهٔ هم‌سالانش است","type":"scale","scaleMax":2,"scaleLabels":["اصلاً درست نیست","تا حدی درست است","کاملاً درست است"],"required":true,"subscaleId":"peer","reverse":true},{"key":"i15","label":"به‌راحتی حواسش پرت می‌شود و تمرکزش را از دست می‌دهد","type":"scale","scaleMax":2,"scaleLabels":["اصلاً درست نیست","تا حدی درست است","کاملاً درست است"],"required":true,"subscaleId":"hyper"},{"key":"i16","label":"در موقعیت‌های تازه مضطرب یا چسبنده است","type":"scale","scaleMax":2,"scaleLabels":["اصلاً درست نیست","تا حدی درست است","کاملاً درست است"],"required":true,"subscaleId":"emo"},{"key":"i17","label":"با کودکان کوچک‌تر مهربان و دلسوز است","type":"scale","scaleMax":2,"scaleLabels":["اصلاً درست نیست","تا حدی درست است","کاملاً درست است"],"required":true,"subscaleId":"pros"},{"key":"i18","label":"اغلب دروغ می‌گوید یا تقلب می‌کند","type":"scale","scaleMax":2,"scaleLabels":["اصلاً درست نیست","تا حدی درست است","کاملاً درست است"],"required":true,"subscaleId":"cond"},{"key":"i19","label":"از سوی هم‌سالانش اذیت یا مسخره می‌شود","type":"scale","scaleMax":2,"scaleLabels":["اصلاً درست نیست","تا حدی درست است","کاملاً درست است"],"required":true,"subscaleId":"peer"},{"key":"i20","label":"بی‌چشمداشت به دیگران کمک می‌کند","type":"scale","scaleMax":2,"scaleLabels":["اصلاً درست نیست","تا حدی درست است","کاملاً درست است"],"required":true,"subscaleId":"pros"},{"key":"i21","label":"پیش از عمل، فکر می‌کند و سنجیده رفتار می‌کند","type":"scale","scaleMax":2,"scaleLabels":["اصلاً درست نیست","تا حدی درست است","کاملاً درست است"],"required":true,"subscaleId":"hyper","reverse":true},{"key":"i22","label":"وسایل مدرسه یا دیگران را بدون اجازه برمی‌دارد","type":"scale","scaleMax":2,"scaleLabels":["اصلاً درست نیست","تا حدی درست است","کاملاً درست است"],"required":true,"subscaleId":"cond"},{"key":"i23","label":"با بزرگ‌سالان بهتر از هم‌سن‌هایش کنار می‌آید","type":"scale","scaleMax":2,"scaleLabels":["اصلاً درست نیست","تا حدی درست است","کاملاً درست است"],"required":true,"subscaleId":"peer"},{"key":"i24","label":"ترس‌های فراوان و بی‌تناسب دارد","type":"scale","scaleMax":2,"scaleLabels":["اصلاً درست نیست","تا حدی درست است","کاملاً درست است"],"required":true,"subscaleId":"emo"},{"key":"i25","label":"کارها را تا انتها دنبال می‌کند و دامنهٔ توجه خوبی دارد","type":"scale","scaleMax":2,"scaleLabels":["اصلاً درست نیست","تا حدی درست است","کاملاً درست است"],"required":true,"subscaleId":"hyper","reverse":true}]',
  '[{"max":11,"label":"در محدودهٔ عادی","color":"ok","advice":"نمرهٔ کل دشواری‌ها عادی است — پایش دوره‌ای کافی است."},{"max":15,"label":"مرزی — نیاز به توجه","color":"warn","advice":"نمرهٔ کل مرزی است؛ بازپرسانی پس از ۴ تا ۶ هفته مداخله توصیه می‌شود."},{"max":9999,"label":"قابل توجه — نیاز به بررسی بیشتر","color":"danger","advice":"نمرهٔ کل بالاست؛ به زیرمقیاس‌ها و ابزارهای اختصاصی همان حوزه بروید."}]',
  '["aaaaaaaa-0000-4000-8000-000000000004","aaaaaaaa-0000-4000-8000-000000000007"]',
  'family',
  1,
  'seed-m150',
  '[{"id":"emo","name":"حال و احساسات","bands":[{"max":4,"label":"در محدودهٔ عادی","color":"ok","advice":"نشانهٔ هیجانی برجسته نیست — پایش دوره‌ای کافی است."},{"max":5,"label":"مرزی — نیاز به توجه","color":"warn","advice":"نشانهٔ هیجانی مرزی است؛ پایش ماهانه و هماهنگی با خانواده توصیه می‌شود."},{"max":9999,"label":"قابل توجه — نیاز به بررسی بیشتر","color":"danger","advice":"نشانهٔ هیجانی بالا است؛ ابزار اختصاصی اضطراب (SCARED) پیشنهاد می‌شود."}]},{"id":"cond","name":"رفتار و قاعده‌شکنی","bands":[{"max":2,"label":"در محدودهٔ عادی","color":"ok"},{"max":3,"label":"مرزی — نیاز به توجه","color":"warn","advice":"الگوی رفتاری مرزی؛ تقویت مثبت قواعد کلاس و هماهنگی خانه-مدرسه توصیه می‌شود."},{"max":9999,"label":"قابل توجه — نیاز به بررسی بیشتر","color":"danger","advice":"قاعده‌شکنی بالاست؛ چک‌لیست ملاکی ODD و ارزیابی چندمرجعی پیشنهاد می‌شود."}]},{"id":"hyper","name":"توجه و بی‌قراری","bands":[{"max":5,"label":"در محدودهٔ عادی","color":"ok"},{"max":6,"label":"مرزی — نیاز به توجه","color":"warn","advice":"نشانه‌های توجه مرزی است؛ SNAP-IV معلم مکمل شود."},{"max":9999,"label":"قابل توجه — نیاز به بررسی بیشتر","color":"danger","advice":"نشانهٔ بالا؛ SNAP-IV والد و معلم برای ارزیابی چندمرجعی پیشنهاد می‌شود."}]},{"id":"peer","name":"دوستی‌ها و هم‌سالان","bands":[{"max":2,"label":"در محدودهٔ عادی","color":"ok"},{"max":3,"label":"مرزی — نیاز به توجه","color":"warn","advice":"روابط هم‌سالان مرزی؛ فعالیت گروهی ساخت‌یافته توصیه می‌شود."},{"max":9999,"label":"قابل توجه — نیاز به بررسی بیشتر","color":"danger","advice":"مشکلات هم‌سالان بالا؛ چک‌لیست ملاکی اتیسم و ارزیابی مهارت اجتماعی پیشنهاد می‌شود."}]},{"id":"pros","name":"مهارت‌های اجتماعی (نقطهٔ قوت)","excludeFromTotal":true,"bands":[{"max":5,"label":"نیازمند تقویت — قابل توجه","color":"danger","advice":"مهارت‌های اجتماعی مطلوب پایین است؛ آموزش اجتماعی هدفمند لازم است."},{"max":7,"label":"مرزی","color":"warn"},{"max":10,"label":"در محدودهٔ مطلوب","color":"ok"}]}]',
  1
);

UPDATE case_event_types SET description = 'بیست‌وپنج جملهٔ کوتاه دربارهٔ رفتار و حال فرزند شما در خانه و زندگی روزمره — از احساسات و توجه تا دوستی‌ها و مهارت‌های اجتماعی. پاسخ درست یا غلط ندارد؛ هر جمله را با توجه به شش ماه گذشته علامت بزنید. حدود ۵ دقیقه وقت می‌برد.' WHERE key = 'ce-sdq-p-v1' AND description IS NULL;

-- ce-id-adapt-v1 — سنجهٔ انطباق روزمره — فرم خانواده [منبع: سنجهٔ انطباقی ۱۲ آیتمی — بازآفرینی مرکز بر پایهٔ حوزه‌های انطباق (ارتباط/مراقبت از خود/اجتماعی/کار مدرسه)؛ هر آیتم ۰–۲، نمرهٔ بالاتر = انطباق بهتر. برش‌های سه‌گانهٔ پایین/مرزی/نرمال اولیه است (پایین ≤۱۲، مرزی ۱۳–۱۷، نرمال ۱۸–۲۴) — کالیبراسیون با دادهٔ مرکز در. ملاک تفکیک ID از دیرآموز (طرح §۳.۱): FSIQ≤۷۰ همراه انطباق پایین → مسیر ID.]
INSERT OR IGNORE INTO case_event_types (id, key, title, category, icon, family_fillable, fields, bands, tags, audience, active, created_by, subscales, is_system)
VALUES (
  'bbbbbbbb-8200-4000-8000-000000000018',
  'ce-id-adapt-v1',
  'سنجهٔ انطباق روزمره — فرم خانواده',
  'checklist',
  '🧭',
  1,
  '[{"key":"a01","label":"خواسته یا نیازش را با کلمه یا اشارهٔ روشن بیان می‌کند","type":"scale","scaleMax":2,"scaleLabels":["هنوز نمی‌تواند","با کمک یا تا حدی","خودش، به‌خوبی"],"required":true,"subscaleId":"id_adapt"},{"key":"a02","label":"دستور و توضیح سادهٔ یک‌مرحله‌ای را می‌فهمد و انجام می‌دهد","type":"scale","scaleMax":2,"scaleLabels":["هنوز نمی‌تواند","با کمک یا تا حدی","خودش، به‌خوبی"],"required":true,"subscaleId":"id_adapt"},{"key":"a03","label":"در گفت‌وگوی روزمره جواب می‌دهد و مکالمهٔ کوتاه ادامه می‌دهد","type":"scale","scaleMax":2,"scaleLabels":["هنوز نمی‌تواند","با کمک یا تا حدی","خودش، به‌خوبی"],"required":true,"subscaleId":"id_adapt"},{"key":"a04","label":"غذا خوردن با قاشق و لیوان را مستقل انجام می‌دهد","type":"scale","scaleMax":2,"scaleLabels":["هنوز نمی‌تواند","با کمک یا تا حدی","خودش، به‌خوبی"],"required":true,"subscaleId":"id_adapt"},{"key":"a05","label":"لباس پوشیدن و درآوردن و بستن دکمه یا زیپ را بدون کمک انجام می‌دهد","type":"scale","scaleMax":2,"scaleLabels":["هنوز نمی‌تواند","با کمک یا تا حدی","خودش، به‌خوبی"],"required":true,"subscaleId":"id_adapt"},{"key":"a06","label":"بهداشت شخصی (شست‌وشوی دست‌وصورت، مسواک) را با یادآوری کم انجام می‌دهد","type":"scale","scaleMax":2,"scaleLabels":["هنوز نمی‌تواند","با کمک یا تا حدی","خودش، به‌خوبی"],"required":true,"subscaleId":"id_adapt"},{"key":"a07","label":"به بازی مشترک هم‌سالان می‌پیوندد یا بازی مشترک شروع می‌کند","type":"scale","scaleMax":2,"scaleLabels":["هنوز نمی‌تواند","با کمک یا تا حدی","خودش، به‌خوبی"],"required":true,"subscaleId":"id_adapt"},{"key":"a08","label":"قواعد بازی و نوبت‌گیری را رعایت می‌کند","type":"scale","scaleMax":2,"scaleLabels":["هنوز نمی‌تواند","با کمک یا تا حدی","خودش، به‌خوبی"],"required":true,"subscaleId":"id_adapt"},{"key":"a09","label":"تشکر، خوشامدگویی و درخواست مؤدبانه را در جای خود به‌کار می‌برد","type":"scale","scaleMax":2,"scaleLabels":["هنوز نمی‌تواند","با کمک یا تا حدی","خودش، به‌خوبی"],"required":true,"subscaleId":"id_adapt"},{"key":"a10","label":"لوازم مدرسه‌اش را خودش آماده می‌کند و سرجایش می‌گذارد","type":"scale","scaleMax":2,"scaleLabels":["هنوز نمی‌تواند","با کمک یا تا حدی","خودش، به‌خوبی"],"required":true,"subscaleId":"id_adapt"},{"key":"a11","label":"تکالیف و کارهای سادهٔ مدرسه را با یادآوری کم شروع می‌کند و ادامه می‌دهد","type":"scale","scaleMax":2,"scaleLabels":["هنوز نمی‌تواند","با کمک یا تا حدی","خودش، به‌خوبی"],"required":true,"subscaleId":"id_adapt"},{"key":"a12","label":"قواعد کلاس را می‌فهمد و بدون تذکر مکرر رعایت می‌کند","type":"scale","scaleMax":2,"scaleLabels":["هنوز نمی‌تواند","با کمک یا تا حدی","خودش، به‌خوبی"],"required":true,"subscaleId":"id_adapt"}]',
  '[{"max":12,"label":"پایین — نیاز به بررسی","color":"danger","advice":"انطباق روزمره پایین گزارش شده است — در کنار هوش کلی (FSIQ)، ملاک تفکیک مسیر ارزیابی است."},{"max":17,"label":"مرزی","color":"warn","advice":"انطباق روزمره مرزی است؛ آموزش مهارت‌های روزمره و پایش دوره‌ای توصیه می‌شود."},{"max":24,"label":"نرمال","color":"ok","advice":"انطباق روزمره در محدودهٔ مطلوب است."}]',
  '[]',
  'family',
  1,
  'seed-m150',
  '[{"id":"id_adapt","name":"انطباق روزمره","bands":[{"max":12,"label":"پایین — نیاز به بررسی","color":"danger","advice":"انطباق روزمره پایین گزارش شده است — در کنار هوش کلی (FSIQ)، ملاک تفکیک مسیر ارزیابی است."},{"max":17,"label":"مرزی","color":"warn","advice":"انطباق روزمره مرزی است؛ آموزش مهارت‌های روزمره و پایش دوره‌ای توصیه می‌شود."},{"max":24,"label":"نرمال","color":"ok","advice":"انطباق روزمره در محدودهٔ مطلوب است."}]}]',
  1
);

UPDATE case_event_types SET description = 'دوازده جملهٔ کوتاه دربارهٔ مهارت‌های روزمرهٔ فرزند شما — ارتباط، مراقبت از خود، بازی و دوستی، و کارهای مدرسه. برای هر جمله بگویید او چقدر خودش از عهده‌اش برمی‌آید. حدود ۳ دقیقه وقت می‌برد.' WHERE key = 'ce-id-adapt-v1' AND description IS NULL;

-- ce-comp-family-v2 — فرم جامع خانواده — بستهٔ کامل غربالگری [منبع: پکیج چند-ابزاری فرم جامع خانواده (T5/m150 — طرح واحد §۲ P0 ردیف ۷): یک لینک عمومی، رندر بخش‌به‌بخش، یک submit → رویداد مستقل به‌ازای هر کامپوننت (همان اسکورینگ/زیرمقیاس/باند ابزار تکی) + رویداد زمینهٔ همین type. کامپوننت‌ها به‌ترتیب در packageComponents و آینهٔ آن COMPOSITE_FAMILY_COMPONENTS در case-events/pure.ts (تست پاریتی دارد). سقف ۴۵ فیلد/۸ زیرمقیاس هر type محترم است — پکیج type واحد نیست.]
INSERT OR IGNORE INTO case_event_types (id, key, title, category, icon, family_fillable, fields, bands, tags, audience, active, created_by, subscales, is_system)
VALUES (
  'bbbbbbbb-8200-4000-8000-000000000019',
  'ce-comp-family-v2',
  'فرم جامع خانواده — بستهٔ کامل غربالگری',
  'session',
  '🧺',
  1,
  '[{"key":"pkg_sec","label":"زمینهٔ خانواده","type":"heading"},{"key":"filled_by","label":"این فرم را چه کسی پر می‌کند؟","type":"select","options":["مادر","پدر","هر دو والد","سایر مراقب"],"required":true},{"key":"main_concern","label":"امروز بیشترین دغدغهٔ شما دربارهٔ فرزندتان چیست؟ (کوتاه بنویسید)","type":"text"},{"key":"recent_changes","label":"در دو سه ماه اخیر تغییر مهمی بوده که روی او اثر گذاشته باشد؟ (مثلاً جابه‌جایی، مدرسهٔ جدید، تولد خواهر یا برادر، بیماری)","type":"longtext"}]',
  NULL,
  '[]',
  'family',
  1,
  'seed-m150',
  NULL,
  1
);

UPDATE case_event_types SET description = 'یک لینک برای خانواده؛ پنج بخش پشت‌سرهم: چند پرسش کوتاه زمینه، چک‌لیست توجه و بی‌قراری (SNAP-IV)، پرسش‌نامهٔ رفتار (SDQ)، پرسش‌نامهٔ اضطراب (SCARED) و سنجهٔ انطباق روزمره. پاسخ‌ها جداگانه نمره می‌خورند و روی پرونده می‌نشینند. حدود ۲۵ تا ۳۵ دقیقه وقت می‌برد؛ می‌توانید آرام و بدون عجله جلو بروید — همهٔ پاسخ‌ها یک‌جا در پایان ارسال می‌شود.' WHERE key = 'ce-comp-family-v2' AND description IS NULL;

-- پایان 0061

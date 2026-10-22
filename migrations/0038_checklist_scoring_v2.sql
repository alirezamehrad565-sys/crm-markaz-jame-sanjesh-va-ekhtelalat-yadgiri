ALTER TABLE case_events ADD COLUMN deleted_at TEXT;
ALTER TABLE case_events ADD COLUMN deleted_by TEXT;
ALTER TABLE case_event_types ADD COLUMN subscales TEXT;

UPDATE case_event_types SET
subscales = '[
  {"id":"emotional","name":"هیجانی و اضطرابی","bands":[{"max":2,"label":"در محدودهٔ عادی","color":"ok","advice":"نشانهٔ هیجانی برجسته نیست — پایش دوره‌ای کافی است."},{"max":3,"label":"مرزی — نیاز به توجه","color":"warn","advice":"نشانه‌های اضطرابی-هیجانی مرزی است؛ پایش ماهانه و گفت‌وگو با خانواده توصیه می‌شود."},{"max":9999,"label":"قابل توجه — نیاز به ارزیابی تخصصی","color":"danger","advice":"نشانه‌های هیجانی بالا است؛ ارزیابی بالینی و مشاورهٔ خانواده پیشنهاد می‌شود."}]},
  {"id":"conduct","name":"رفتاری و قاعده‌شکنی","bands":[{"max":2,"label":"در محدودهٔ عادی","color":"ok"},{"max":3,"label":"مرزی — نیاز به توجه","color":"warn","advice":"الگوی رفتاری مرزی؛ تقویت مثبت قواعد و هماهنگی خانه-مرکز توصیه می‌شود."},{"max":9999,"label":"قابل توجه — نیاز به ارزیابی تخصصی","color":"danger","advice":"الگوی قاعده‌شکنی بالا؛ ارزیابی تخصصی رفتار و آموزش والدگری لازم است."}]},
  {"id":"hyper","name":"بیش‌فعالی و کم‌توجهی","bands":[{"max":3,"label":"در محدودهٔ عادی","color":"ok"},{"max":4,"label":"مرزی — نیاز به توجه","color":"warn","advice":"نشانه‌های توجه/بیش‌فعالی مرزی است؛ چک‌لیست معلم و مشاهدهٔ کلاس مکمل شود."},{"max":9999,"label":"قابل توجه — نیاز به ارزیابی تخصصی","color":"danger","advice":"نشانه‌های بیش‌فعالی/کم‌توجهی بالا؛ ارزیابی چندمرجعی (والد + معلم) پیشنهاد می‌شود."}]},
  {"id":"peer","name":"مشکلات با هم‌سالان","bands":[{"max":2,"label":"در محدودهٔ عادی","color":"ok"},{"max":3,"label":"مرزی — نیاز به توجه","color":"warn","advice":"روابط هم‌سالان مرزی؛ فعالیت گروهی ساخت‌یافته توصیه می‌شود."},{"max":9999,"label":"قابل توجه — نیاز به ارزیابی تخصصی","color":"danger","advice":"مشکلات هم‌سالان بالا؛ ارزیابی مهارت‌های اجتماعی و مداخلهٔ گروهی لازم است."}]},
  {"id":"prosocial","name":"رفتار اجتماعی مطلوب (نقطهٔ قوت)","excludeFromTotal":true,"bands":[{"max":5,"label":"نیازمند تقویت — قابل توجه","color":"danger","advice":"مهارت‌های اجتماعی مطلوب پایین است؛ آموزش اجتماعی هدفمند و تمرین خانه توصیه می‌شود."},{"max":7,"label":"مرزی","color":"warn"},{"max":9999,"label":"در محدودهٔ مطلوب","color":"ok"}]}
]',
fields = '[
  {"key":"i01","label":"نسبت به دیگران مهربان و با ملاحظه است","type":"scale","scaleMax":2,"required":true,"subscaleId":"prosocial"},
  {"key":"i02","label":"بی‌قرار و بیش‌فعال است و طولانی نمی‌تواند سر جایش بماند","type":"scale","scaleMax":2,"required":true,"subscaleId":"hyper"},
  {"key":"i03","label":"اغلب سردرد یا دل‌درد دارد یا حالت عصبی نشان می‌دهد","type":"scale","scaleMax":2,"required":true,"subscaleId":"emotional"},
  {"key":"i04","label":"با بزرگ‌سالان به‌خوبی حرف می‌زند و وسایلش را به اشتراک می‌گذارد","type":"scale","scaleMax":2,"required":true,"subscaleId":"prosocial"},
  {"key":"i05","label":"گاهی عصبانیت یا خشم شدید نشان می‌دهد","type":"scale","scaleMax":2,"required":true,"subscaleId":"conduct"},
  {"key":"i06","label":"در تنهایی می‌ماند و معمولاً تنها بازی می‌کند","type":"scale","scaleMax":2,"required":true,"subscaleId":"peer"},
  {"key":"i07","label":"معمولاً اطاعت می‌کند و کارهایش را خوب انجام می‌دهد","type":"scale","scaleMax":2,"required":true,"subscaleId":"conduct","reverse":true},
  {"key":"i08","label":"نگرانی زیاد دارد و گاهی نگرانی‌اش او را ناتوان می‌کند","type":"scale","scaleMax":2,"required":true,"subscaleId":"emotional"},
  {"key":"i09","label":"اگر کسی آسیب‌ببیند یا ناراحت باشد، دلش می‌خواهد کمکش کند","type":"scale","scaleMax":2,"required":true,"subscaleId":"prosocial"},
  {"key":"i10","label":"پیوسته دست‌وپا می‌زند و آرام نمی‌نشیند","type":"scale","scaleMax":2,"required":true,"subscaleId":"hyper"},
  {"key":"i11","label":"حداقل یک دوست صمیمی دارد","type":"scale","scaleMax":2,"required":true,"subscaleId":"peer","reverse":true},
  {"key":"i12","label":"با بقیه دعوا می‌کند یا بقیه را اذیت می‌کند","type":"scale","scaleMax":2,"required":true,"subscaleId":"conduct"},
  {"key":"i13","label":"غمگین و بی‌حال به نظر می‌رسد","type":"scale","scaleMax":2,"required":true,"subscaleId":"emotional"},
  {"key":"i14","label":"عموماً مورد پسند دیگران است","type":"scale","scaleMax":2,"required":true,"subscaleId":"peer","reverse":true},
  {"key":"i15","label":"حواسش به‌راحتی پرت می‌شود","type":"scale","scaleMax":2,"required":true,"subscaleId":"hyper"},
  {"key":"i16","label":"عصبی و چسبنده به بزرگ‌سالان است","type":"scale","scaleMax":2,"required":true,"subscaleId":"emotional"},
  {"key":"i17","label":"با دیگران مهربان و سخاوتمند است","type":"scale","scaleMax":2,"required":true,"subscaleId":"prosocial"},
  {"key":"i18","label":"بیشتر از هم‌سن‌هایش دروغ می‌گوید یا تقلب می‌کند","type":"scale","scaleMax":2,"required":true,"subscaleId":"conduct"},
  {"key":"i19","label":"از بچه‌های ضعیف‌تر یا تازه‌واردان می‌ترسد و تحت فشارشان است","type":"scale","scaleMax":2,"required":true,"subscaleId":"peer"},
  {"key":"i20","label":"برای کمک به دیگران بدون چشمداشت پیش‌قدم می‌شود","type":"scale","scaleMax":2,"required":true,"subscaleId":"prosocial"},
  {"key":"i21","label":"پیش از فکر کردن کار می‌کند","type":"scale","scaleMax":2,"required":true,"subscaleId":"hyper"},
  {"key":"i22","label":"کارهایی می‌کند که برای خودش یا دیگران دردسرساز است","type":"scale","scaleMax":2,"required":true,"subscaleId":"conduct"},
  {"key":"i23","label":"با هم‌سالانش رابطهٔ خوبی دارد","type":"scale","scaleMax":2,"required":true,"subscaleId":"peer","reverse":true},
  {"key":"i24","label":"خوب تمرکز می‌کند و به‌راحتی از کارش منصرف نمی‌شود","type":"scale","scaleMax":2,"required":true,"subscaleId":"hyper","reverse":true},
  {"key":"i25","label":"در رفتارش با بزرگ‌سالان مؤدب و مودب است","type":"scale","scaleMax":2,"required":true,"subscaleId":"prosocial"}]',
bands = '[
  {"max":13,"label":"در محدودهٔ عادی","color":"ok","advice":"نمرهٔ کل دشواری‌ها عادی است — پایش دوره‌ای و تقویت نقاط قوت کافی است."},
  {"max":16,"label":"مرزی — نیاز به توجه","color":"warn","advice":"نمرهٔ کل مرزی است؛ بازپرسانی چک‌لیست پس از ۴ تا ۶ هفته مداخله و هماهنگی با معلم توصیه می‌شود."},
  {"max":9999,"label":"قابل توجه — نیاز به ارزیابی تخصصی","color":"danger","advice":"نمرهٔ کل بالاست؛ ارزیابی تخصصی چندمرجعی (والد + معلم + مشاهدهٔ بالینی) و جلسهٔ کمیسیون پیشنهاد می‌شود."}]',
updated_at = updated_at
WHERE key = 'sdq-parent' AND deleted_at IS NULL;

UPDATE case_event_types SET
bands = '[
  {"max":14,"label":"در محدودهٔ عادی","color":"ok","advice":"نشانه‌های بیش‌فعالی/کم‌توجهی عادی است — پایش دوره‌ای کافی است."},
  {"max":19,"label":"مرزی — نیاز به توجه","color":"warn","advice":"نمرهٔ مرزی؛ تکمیل هم‌زمان چک‌لیست معلم و مشاهدهٔ کلاس توصیه می‌شود."},
  {"max":9999,"label":"قابل توجه — نیاز به ارزیابی تخصصی","color":"danger","advice":"نشانه‌ها بالاست؛ ارزیابی چندمرجعی ADHD و برنامهٔ مداخلهٔ ساخت‌یافته لازم است."}]'
WHERE key = 'conners-short' AND deleted_at IS NULL;

UPDATE case_event_types SET
subscales = '[
  {"id":"emo","name":"هیجانی و اضطرابی","bands":[{"max":7,"label":"در محدودهٔ عادی","color":"ok"},{"max":11,"label":"مرزی — نیاز به توجه","color":"warn","advice":"نشانه‌های هیجانی مرزی؛ پایش ماهانه توصیه می‌شود."},{"max":9999,"label":"قابل توجه — نیاز به ارزیابی تخصصی","color":"danger","advice":"نشانه‌های هیجانی/اضطرابی بالا؛ مداخلهٔ بالینی لازم است."}]},
  {"id":"beh","name":"رفتار و قاعده‌شکنی","bands":[{"max":4,"label":"در محدودهٔ عادی","color":"ok"},{"max":7,"label":"مرزی — نیاز به توجه","color":"warn"},{"max":9999,"label":"قابل توجه — نیاز به ارزیابی تخصصی","color":"danger"}]},
  {"id":"att","name":"توجه و بیش‌فعالی","bands":[{"max":2,"label":"در محدودهٔ عادی","color":"ok"},{"max":3,"label":"مرزی — نیاز به توجه","color":"warn"},{"max":9999,"label":"قابل توجه — نیاز به ارزیابی تخصصی","color":"danger"}]},
  {"id":"soc","name":"تعامل اجتماعی","bands":[{"max":2,"label":"در محدودهٔ عادی","color":"ok"},{"max":4,"label":"مرزی — نیاز به توجه","color":"warn"},{"max":9999,"label":"قابل توجه — نیاز به ارزیابی تخصصی","color":"danger"}]}
]',
fields = '[
  {"key":"a01","label":"از جدا شدن از والدین ناراحت و مضطرب می‌شود","type":"scale","scaleMax":2,"required":true,"subscaleId":"emo"},
  {"key":"a02","label":"شب‌ها خواب راحتی ندارد یا کابوس می‌بیند","type":"scale","scaleMax":2,"required":true,"subscaleId":"emo"},
  {"key":"a03","label":"به‌راحتی از حرف‌های دیگران رنجیده می‌شود","type":"scale","scaleMax":2,"required":true,"subscaleId":"soc"},
  {"key":"a04","label":"بیشتر از بچه‌های دیگر گریه یا جیغ می‌زند","type":"scale","scaleMax":2,"required":true,"subscaleId":"emo"},
  {"key":"a05","label":"از جمع و مدرسه فرار می‌کند","type":"scale","scaleMax":2,"required":true,"subscaleId":"soc"},
  {"key":"a06","label":"کارها را تکرار یا مرتب می‌کند (به شکل وسواسی)","type":"scale","scaleMax":2,"required":true,"subscaleId":"emo"},
  {"key":"a07","label":"ناخن می‌جود یا عادت‌های عصبی دارد","type":"scale","scaleMax":2,"required":true,"subscaleId":"emo"},
  {"key":"a08","label":"با خواهر/برادر یا هم‌سالان درگیری فیزیکی دارد","type":"scale","scaleMax":2,"required":true,"subscaleId":"beh"},
  {"key":"a09","label":"وسایل دیگران را بدون اجازه برمی‌دارد","type":"scale","scaleMax":2,"required":true,"subscaleId":"beh"},
  {"key":"a10","label":"دروغ می‌گوید تا از تنبیه فرار کند","type":"scale","scaleMax":2,"required":true,"subscaleId":"beh"},
  {"key":"a11","label":"اعتمادبه‌نفس پایینی دارد و خودش را ضعیف نشان می‌دهد","type":"scale","scaleMax":2,"required":true,"subscaleId":"emo"},
  {"key":"a12","label":"غمگین است و از بازی‌های موردعلاقه‌اش لذت نمی‌برد","type":"scale","scaleMax":2,"required":true,"subscaleId":"emo"},
  {"key":"a13","label":"بدون فکر کردن رفتار خطرناک می‌کند","type":"scale","scaleMax":2,"required":true,"subscaleId":"beh","critical":true,"criticalMin":2},
  {"key":"a14","label":"توجه‌اش سریع پرت می‌شود و در تمرکز ضعیف است","type":"scale","scaleMax":2,"required":true,"subscaleId":"att"},
  {"key":"a15","label":"بی‌قراری حرکتی مداوم دارد","type":"scale","scaleMax":2,"required":true,"subscaleId":"att"},
  {"key":"a16","label":"با بزرگ‌ترها لجبازی و سرکشی می‌کند","type":"scale","scaleMax":2,"required":true,"subscaleId":"beh"},
  {"key":"a17","label":"در برقراری ارتباط و حرف زدن با دیگران سخت می‌گیرد","type":"scale","scaleMax":2,"required":true,"subscaleId":"soc"},
  {"key":"a18","label":"به قوانین بازی‌ها پایبند نیست","type":"scale","scaleMax":2,"required":true,"subscaleId":"beh"},
  {"key":"a19","label":"از تغییر روتین روزانه ناراحت می‌شود","type":"scale","scaleMax":2,"required":true,"subscaleId":"emo"},
  {"key":"a20","label":"ترس‌های بیش از اندازه از چیزهای خاص دارد","type":"scale","scaleMax":2,"required":true,"subscaleId":"emo"}]',
bands = '[
  {"max":12,"label":"در محدودهٔ عادی","color":"ok","advice":"جمع نشانه‌ها عادی است — پایش دوره‌ای و تقویت نقاط قوت کافی است."},
  {"max":20,"label":"مرزی — نیاز به توجه","color":"warn","advice":"نشانه‌های مرزی؛ به زیرمقیاس‌ها دقت کنید و پس از مداخله، بازپرسانی کنید."},
  {"max":9999,"label":"قابل توجه — نیاز به ارزیابی تخصصی","color":"danger","advice":"نشانه‌ها بالاست؛ ارزیابی تخصصی و جلسهٔ کمیسیون پرونده پیشنهاد می‌شود."}]'
WHERE key = 'achenbach-practical' AND deleted_at IS NULL;

UPDATE case_event_types SET
subscales = '[
  {"id":"competence","name":"شایستگی کلاسی (نقطهٔ قوت)","excludeFromTotal":true,"bands":[{"max":8,"label":"ضعیف — نیازمند پیگیری","color":"danger","advice":"شایستگی کلاسی پایین است؛ هماهنگی معلم-مرکز و تمرین مهارتی لازم است."},{"max":12,"label":"متوسط","color":"warn"},{"max":9999,"label":"مطلوب","color":"ok"}]},
  {"id":"symptoms","name":"نشان‌های اختلال در کلاس","bands":[{"max":6,"label":"در محدودهٔ عادی","color":"ok"},{"max":10,"label":"مرزی — نیاز به توجه","color":"warn","advice":"نشان‌های کلاسی مرزی؛ بازپرسانی پس از مداخلهٔ چهار هفته‌ای توصیه می‌شود."},{"max":9999,"label":"قابل توجه — نیاز به ارزیابی تخصصی","color":"danger","advice":"نشان‌ها بالاست؛ نتایج چک‌لیست والدین را برای مقایسهٔ چندمرجعی ببینید."}]}
]',
fields = '[
  {"key":"t01","label":"تکالیف کلاس را سر وقت و کامل انجام می‌دهد","type":"scale","scaleMax":3,"required":true,"subscaleId":"competence","reverse":true},
  {"key":"t02","label":"در فعالیت‌های گروهی همکاری می‌کند","type":"scale","scaleMax":3,"required":true,"subscaleId":"competence","reverse":true},
  {"key":"t03","label":"قوانین کلاس را رعایت می‌کند","type":"scale","scaleMax":3,"required":true,"subscaleId":"competence","reverse":true},
  {"key":"t04","label":"در مهارت‌های خواندن/نوشتن/ریاضی به هم‌سن‌هایش می‌رسد","type":"scale","scaleMax":3,"required":true,"subscaleId":"competence","reverse":true},
  {"key":"t05","label":"رابطهٔ مناسب با هم‌کلاسی‌ها دارد","type":"scale","scaleMax":3,"required":true,"subscaleId":"competence","reverse":true},
  {"key":"t06","label":"در طول کلاس تمرکز و توجه کافی دارد","type":"scale","scaleMax":3,"required":true,"subscaleId":"competence","reverse":true},
  {"key":"t07","label":"بی‌قراری و بلند شدن مکرر از جا دارد","type":"scale","scaleMax":3,"required":true,"subscaleId":"symptoms"},
  {"key":"t08","label":"با هم‌کلاسی‌ها درگیری یا اذیت‌گری می‌کند","type":"scale","scaleMax":3,"required":true,"subscaleId":"symptoms"},
  {"key":"t09","label":"در ابراز احساسات مناسب مشکل دارد","type":"scale","scaleMax":3,"required":true,"subscaleId":"symptoms"},
  {"key":"t10","label":"از حضور در مدرسه ناراضی است یا غیبت زیاد دارد","type":"scale","scaleMax":3,"required":true,"subscaleId":"symptoms"},
  {"key":"t11","label":"در مهارت‌های حرکتی درسی (نوشتن/بریدن/نقاشی) ضعف دارد","type":"scale","scaleMax":3,"required":true,"subscaleId":"symptoms"},
  {"key":"t12","label":"به تذکر واکنش‌های شدید نشان می‌دهد","type":"scale","scaleMax":3,"required":true,"subscaleId":"symptoms"}]',
bands = '[
  {"max":6,"label":"در محدودهٔ عادی","color":"ok","advice":"نشان‌های کلاسی عادی است — نمرهٔ شایستگی کلاسی را هم ببینید."},
  {"max":10,"label":"مرزی — نیاز به توجه","color":"warn","advice":"نشان‌های مرزی؛ هماهنگی با خانواده و بازپرسانی چهار هفته بعد توصیه می‌شود."},
  {"max":9999,"label":"قابل توجه — نیاز به ارزیابی تخصصی","color":"danger","advice":"نشان‌ها بالاست؛ ارزیابی چندمرجعی و مداخلهٔ کلاسی ساخت‌یافته لازم است."}]'
WHERE key = 'teacher-classroom' AND deleted_at IS NULL;

INSERT OR IGNORE INTO case_event_types (id, key, title, category, icon, family_fillable, fields, bands, tags, audience, active, created_by, subscales)
VALUES (
  'bbbbbbbb-7600-4000-8000-000000000005',
  'quick-multi-v1',
  'غربال سریع چندگزینه‌ای (والدین)',
  'checklist', '🧭', 1,
  '[
    {"key":"q1","label":"در جمع‌ها و موقعیت‌های جدید رفتار او بیشتر به کدام توصیف نزدیک است؟","type":"single","required":true,"subscaleId":"soc",
     "scoredOptions":[{"label":"راحت است و سریع سازگار می‌شود","score":0},{"label":"ابتدا مضطرب اما به‌مرور راحت می‌شود","score":1},{"label":"اجتناب می‌کند یا می‌چسبد","score":2},{"label":"اصولاً قادر به حضور نیست","score":3}]},
    {"key":"q2","label":"حین انجام تکلیف، توجه او چقدر حفظ می‌شود؟","type":"single","required":true,"subscaleId":"att",
     "scoredOptions":[{"label":"تا آخر کامل","score":0},{"label":"گاهی پرت می‌شود","score":1},{"label":"بیشتر وقت‌ها پرت است","score":2},{"label":"تقریباً هیچ‌وقت","score":3}]},
    {"key":"q3","label":"در نشستن طولانی بی‌قراری حرکتی دارد","type":"scale","scaleMax":3,"required":true,"subscaleId":"att"},
    {"key":"q4","label":"بیشترین نگرانی او در روز چیست؟","type":"single","required":true,"subscaleId":"emo",
     "scoredOptions":[{"label":"نگرانی خاصی ندارد","score":0},{"label":"مدرسه یا درس","score":1},{"label":"جدا شدن از والد","score":2},{"label":"چند موضوع هم‌زمان و شدید","score":3}]},
    {"key":"q5","label":"با هم‌سالانش همکاری و بازی گروهی دارد","type":"scale","scaleMax":2,"required":true,"subscaleId":"soc","reverse":true},
    {"key":"q6","label":"آیا رفتاری که به خود یا دیگران آسیب می‌زند دیده‌اید؟","type":"single","required":true,"subscaleId":"beh",
     "scoredOptions":[{"label":"هرگز","score":0},{"label":"لفظی و گاه‌به‌گاه","score":1},{"label":"لفظی و مکرر","score":2},{"label":"جسمی — به خود یا دیگری","score":3}],
     "critical":true,"criticalMin":3}
  ]',
  '[
    {"max":8,"label":"در محدودهٔ عادی","color":"ok","advice":"نمرهٔ غربال عادی است — در صورت نگرانی خاص، چک‌لیست تخصصی را بفرستید."},
    {"max":13,"label":"مرزی — نیاز به توجه","color":"warn","advice":"نمرهٔ مرزی؛ چک‌لیست کامل SDQ یا کانرز برای تکمیل ارزیابی پیشنهاد می‌شود."},
    {"max":9999,"label":"قابل توجه — نیاز به ارزیابی تخصصی","color":"danger","advice":"نمرهٔ غربال بالاست؛ ارزیابی تخصصی و مصاحبهٔ والدین لازم است."}
  ]',
  '["aaaaaaaa-0000-4000-8000-000000000004","aaaaaaaa-0000-4000-8000-000000000001"]',
  'family', 1, 'seed-m78',
  '[
    {"id":"emo","name":"هیجانی"},
    {"id":"att","name":"توجه و بیش‌فعالی"},
    {"id":"soc","name":"تعامل اجتماعی"},
    {"id":"beh","name":"رفتار"}
  ]'
);

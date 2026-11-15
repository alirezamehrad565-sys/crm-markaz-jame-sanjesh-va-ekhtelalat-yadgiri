-- 1.25.60 — «نظرسنجی خانواده‌ها» ماژول مستقل فقط-مدیر: دو فرم نظرسنجی سیستمی ساخت‌یافته
-- الف) نظرسنجی پایان دوره — ترخیص/اتمام جلسه‌ها (ce-survey-discharge-v1): مرکز ×۳ + درمانگر ×۴ + پیشرفت ×۳ + NPS + نظر آزاد
-- ب)  نظرسنجی حین درمان (ce-survey-progress-v1): مرکز ×۲ + درمانگر ×۳ + پیشرفت ×۲ + NPS + نظر آزاد — کوتاه‌تر برای نرخ پاسخ بالاتر
-- ج)  ce-center-survey-v1 از ساخت تازه بازنشسته می‌شود (نرم — داده‌های تاریخی سالم می‌مانند و در فهرست/KPI با کلیدهای خانوادهٔ نظرسنجی تجمیع می‌شوند)
-- هر دو is_system و family_fillable؛ کلید نظر آزاد در هر دو «sv_note» می‌ماند تا surveyItemOf بدون تغییر بخواند.

INSERT OR IGNORE INTO case_event_types (id, key, title, description, category, icon, family_fillable, fields, bands, tags, audience, active, created_by, subscales, is_system)
VALUES (
  'bbbbbbbb-8260-4000-8000-000000000001',
  'ce-survey-discharge-v1',
  'نظرسنجی پایان دوره — ترخیص و اتمام جلسه‌ها',
  'جمله‌های کوتاهی دربارهٔ کل دورهٔ درمانی فرزندتان — از پذیرش و نوبت‌ها تا کیفیت جلسه‌ها و پیشرفتی که دیده‌اید. این نظرسنجی معمولاً هنگام ترخیص یا جلسهٔ آخر دوره برایتان ارسال می‌شود. پاسخ شما بی‌نام در «شاخص‌های عملکردی مرکز» تجمیع می‌شود؛ فقط پیشنهاد نوشتاری‌تان با نام خودتان به مدیر می‌رسد. حدود ۴ دقیقه وقت می‌برد.',
  'checklist',
  '📋',
  1,
  '[{"key":"sv_cen1","label":"برخورد پذیرش و هماهنگی نوبت‌ها در طول دوره","type":"scale","scaleMax":4,"scaleLabels":["خیلی ضعیف","ضعیف","متوسط","خوب","عالی"],"required":true,"subscaleId":"center"},{"key":"sv_cen2","label":"اطلاع‌رسانی و پاسخ‌گویی مرکز به تماس‌ها و پیام‌ها","type":"scale","scaleMax":4,"scaleLabels":["خیلی ضعیف","ضعیف","متوسط","خوب","عالی"],"required":true,"subscaleId":"center"},{"key":"sv_cen3","label":"نظافت، آرامش و کودک‌پسند بودن فضای مرکز","type":"scale","scaleMax":4,"scaleLabels":["خیلی ضعیف","ضعیف","متوسط","خوب","عالی"],"required":true,"subscaleId":"center"},{"key":"sv_thr1","label":"ایجاد ارتباط و اعتماد درمانگر با فرزند شما","type":"scale","scaleMax":4,"scaleLabels":["خیلی ضعیف","ضعیف","متوسط","خوب","عالی"],"required":true,"subscaleId":"therapist"},{"key":"sv_thr2","label":"آموزش‌های درمانگر به شما (تمرین خانگی، راهنمایی والد)","type":"scale","scaleMax":4,"scaleLabels":["خیلی ضعیف","ضعیف","متوسط","خوب","عالی"],"required":true,"subscaleId":"therapist"},{"key":"sv_thr3","label":"گزارش شفاف پیشرفت فرزند و گفت‌وگوی بازخورد","type":"scale","scaleMax":4,"scaleLabels":["خیلی ضعیف","ضعیف","متوسط","خوب","عالی"],"required":true,"subscaleId":"therapist"},{"key":"sv_thr4","label":"وقت‌شناسی و تعهد درمانگر به برنامهٔ جلسه‌ها","type":"scale","scaleMax":4,"scaleLabels":["خیلی ضعیف","ضعیف","متوسط","خوب","عالی"],"required":true,"subscaleId":"therapist"},{"key":"sv_prg1","label":"پیشرفت فرزند در هدف‌هایی که برایش تعیین شده بود","type":"scale","scaleMax":4,"scaleLabels":["خیلی کم","کم","متوسط","خوب","خیلی زیاد"],"required":true,"subscaleId":"progress"},{"key":"sv_prg2","label":"تفاوت محسوس رفتار یا مهارت فرزند در خانه و مدرسه","type":"scale","scaleMax":4,"scaleLabels":["خیلی کم","کم","متوسط","خوب","خیلی زیاد"],"required":true,"subscaleId":"progress"},{"key":"sv_prg3","label":"اعتماد شما به ادامهٔ مسیر در خانه پس از ترخیص","type":"scale","scaleMax":4,"scaleLabels":["خیلی کم","کم","متوسط","خوب","خیلی زیاد"],"required":true,"subscaleId":"progress"},{"key":"sv_nps","label":"چقدر احتمال دارد مرکز ما را به آشنایانتان پیشنهاد کنید؟","type":"scale","scaleMax":10,"required":true,"subscaleId":"nps"},{"key":"sv_note","label":"نظر یا پیشنهاد شما برای بهتر شدن کار مرکز (اختیاری)","type":"longtext","required":false}]',
  '[{"max":16,"label":"نیازمند توجه جدی","color":"danger","advice":"رضایت کلی پایین گزارش شده — تجربهٔ خانواده در اولویت بازبینی باشد."},{"max":28,"label":"متوسط — نقاط قابل بهبود","color":"warn","advice":"رضایت متوسط است؛ گویه‌های پایین‌تر نقطهٔ شروع را نشان می‌دهند."},{"max":9999,"label":"رضایت خوب","color":"ok","advice":"تجربهٔ پایان دورهٔ خانواده‌ها در وضعیت خوبی است."}]',
  '[]',
  'family',
  1,
  'seed-m260',
  '[{"id":"center","name":"عملکرد مرکز","bands":[{"max":6,"label":"نیازمند توجه","color":"danger","advice":"رضایت از مرکز پایین گزارش شده است."},{"max":9,"label":"متوسط","color":"warn"},{"max":9999,"label":"خوب","color":"ok"}]},{"id":"therapist","name":"عملکرد درمانگر","bands":[{"max":8,"label":"نیازمند توجه","color":"danger","advice":"رضایت از درمانگر پایین گزارش شده است."},{"max":12,"label":"متوسط","color":"warn"},{"max":9999,"label":"خوب","color":"ok"}]},{"id":"progress","name":"پیشرفت مشاهده‌شده","bands":[{"max":6,"label":"کم","color":"danger","advice":"پیشرفت مشاهده‌شده از نگاه خانواده کم است."},{"max":9,"label":"متوسط","color":"warn"},{"max":9999,"label":"خوب","color":"ok"}]},{"id":"nps","name":"توصیه به آشنایان","excludeFromTotal":true}]',
  1
);

INSERT OR IGNORE INTO case_event_types (id, key, title, description, category, icon, family_fillable, fields, bands, tags, audience, active, created_by, subscales, is_system)
VALUES (
  'bbbbbbbb-8260-4000-8000-000000000002',
  'ce-survey-progress-v1',
  'نظرسنجی حین درمان',
  'هفت جملهٔ کوتاه دربارهٔ تجربهٔ همین هفته‌های درمان — نظم نوبت‌ها، کیفیت جلسه‌ها و تغییرهایی که تا امروز در فرزندتان دیده‌اید. این نظرسنجی کوتاه‌تر است تا وسط دوره هم راحت پر شود؛ مشکلات زودتر دیده شوند و همان‌جا حل شوند. پاسخ شما بی‌نام در «شاخص‌های عملکردی مرکز» تجمیع می‌شود؛ فقط پیشنهاد نوشتاری‌تان با نام خودتان به مدیر می‌رسد. حدود ۲ دقیقه وقت می‌برد.',
  'checklist',
  '📋',
  1,
  '[{"key":"sv_cen1","label":"نظم نوبت‌ها و زمان انتظار در مرکز","type":"scale","scaleMax":4,"scaleLabels":["خیلی ضعیف","ضعیف","متوسط","خوب","عالی"],"required":true,"subscaleId":"center"},{"key":"sv_cen2","label":"پاسخ‌گویی تلفن و پیام‌ها و پیگیری کارها","type":"scale","scaleMax":4,"scaleLabels":["خیلی ضعیف","ضعیف","متوسط","خوب","عالی"],"required":true,"subscaleId":"center"},{"key":"sv_thr1","label":"کیفیت جلسه‌ها و توجه درمانگر به فرزند شما","type":"scale","scaleMax":4,"scaleLabels":["خیلی ضعیف","ضعیف","متوسط","خوب","عالی"],"required":true,"subscaleId":"therapist"},{"key":"sv_thr2","label":"آموزش تمرین خانگی و پیگیری آن توسط درمانگر","type":"scale","scaleMax":4,"scaleLabels":["خیلی ضعیف","ضعیف","متوسط","خوب","عالی"],"required":true,"subscaleId":"therapist"},{"key":"sv_thr3","label":"گفت‌وگوی درمانگر با شما دربارهٔ پیشرفت فرزند","type":"scale","scaleMax":4,"scaleLabels":["خیلی ضعیف","ضعیف","متوسط","خوب","عالی"],"required":true,"subscaleId":"therapist"},{"key":"sv_prg1","label":"تغییر محسوس فرزند از شروع دوره تا امروز","type":"scale","scaleMax":4,"scaleLabels":["خیلی کم","کم","متوسط","خوب","خیلی زیاد"],"required":true,"subscaleId":"progress"},{"key":"sv_prg2","label":"رغبت و اشتیاق فرزند به آمدن جلسه‌ها","type":"scale","scaleMax":4,"scaleLabels":["خیلی کم","کم","متوسط","خوب","خیلی زیاد"],"required":true,"subscaleId":"progress"},{"key":"sv_nps","label":"چقدر احتمال دارد همین حالا مرکز ما را به آشنایانتان پیشنهاد کنید؟","type":"scale","scaleMax":10,"required":true,"subscaleId":"nps"},{"key":"sv_note","label":"نگرانی یا پیشنهاد فوری شما (اختیاری)","type":"longtext","required":false}]',
  '[{"max":11,"label":"نیازمند توجه جدی","color":"danger","advice":"رضایت حین درمان پایین است — پیگیری سریع با خانواده توصیه می‌شود."},{"max":20,"label":"متوسط — نقاط قابل بهبود","color":"warn","advice":"رضایت متوسط است؛ گویه‌های پایین‌تر نقطهٔ شروع را نشان می‌دهند."},{"max":9999,"label":"رضایت خوب","color":"ok","advice":"تجربهٔ حین درمان خانواده‌ها در وضعیت خوبی است."}]',
  '[]',
  'family',
  1,
  'seed-m260',
  '[{"id":"center","name":"عملکرد مرکز","bands":[{"max":4,"label":"نیازمند توجه","color":"danger","advice":"رضایت از مرکز پایین گزارش شده است."},{"max":6,"label":"متوسط","color":"warn"},{"max":9999,"label":"خوب","color":"ok"}]},{"id":"therapist","name":"عملکرد درمانگر","bands":[{"max":6,"label":"نیازمند توجه","color":"danger","advice":"رضایت از درمانگر پایین گزارش شده است."},{"max":9,"label":"متوسط","color":"warn"},{"max":9999,"label":"خوب","color":"ok"}]},{"id":"progress","name":"پیشرفت مشاهده‌شده","bands":[{"max":4,"label":"کم","color":"danger","advice":"پیشرفت مشاهده‌شده از نگاه خانواده کم است."},{"max":6,"label":"متوسط","color":"warn"},{"max":9999,"label":"خوب","color":"ok"}]},{"id":"nps","name":"توصیه به آشنایان","excludeFromTotal":true}]',
  1
);

-- ج) بازنشستگی نرم نظرسنجی عمومی قبلی — از ساخت تازه کنار می‌رود؛ پاسخ‌های ثبت‌شده سالم می‌مانند
UPDATE case_event_types SET active = 0, updated_at = updated_at
WHERE key = 'ce-center-survey-v1' AND active = 1;

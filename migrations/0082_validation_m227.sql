-- m227 — اعتبارسنجی بیرونی: حسابرسی موردی دو-ارزیاب + فرم پیگیری ۳–۶ماهه (شاهد پیامد واقعی)
-- KPIها جدول نمی‌خواهند (از دادهٔ موجود محاسبه می‌شوند)؛ فقط حسابرسی و فرم پیگیری افزوده می‌شود.

CREATE TABLE IF NOT EXISTS case_audits (
  id            TEXT PRIMARY KEY,
  student_id    TEXT NOT NULL REFERENCES students(id),
  reviewer_a    TEXT NOT NULL,              -- نام ارزیاب اول (ساده — بدون حساب)
  reviewer_b    TEXT NOT NULL,              -- نام ارزیاب دوم
  target_key    TEXT,                       -- هدف مورد مرور (اختیاری)
  agreed        INTEGER NOT NULL,           -- توافق دو ارزیاب (۱/۰)
  note          TEXT,                       -- یادداشت کوتاه توافق/اختلاف
  created_by    TEXT NOT NULL REFERENCES staff(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO case_event_types (id, key, title, category, icon, family_fillable, fields, bands, tags, audience, active, created_by, subscales, is_system)
VALUES (
  'bbbbbbbb-8231-4000-8000-000000000001',
  'ce-followup-3m-v1',
  'فرم پیگیری سه‌تا-شش‌ماهه (خانواده)',
  'checklist',
  '🧭',
  1,
  '[{"key":"f1","label":"تمرین‌های پیشنهادی در این سه ماه چطور اجرا شد؟","type":"select","options":["به‌طور کامل و منظم","نیمه‌کاره و با وقفه","تقریباً اجرا نشد"],"required":true},{"key":"f2","label":"پیشرفت در خواندن را چطور می‌بینید؟","type":"select","options":["بهبود روشن","بهبود کم","بدون تغییر","بدتر شده"],"required":true},{"key":"f3","label":"پیشرفت در نوشتن و املا را چطور می‌بینید؟","type":"select","options":["بهبود روشن","بهبود کم","بدون تغییر","بدتر شده"],"required":true},{"key":"f4","label":"پیشرفت در حساب را چطور می‌بینید؟","type":"select","options":["بهبود روشن","بهبود کم","بدون تغییر","بدتر شده"],"required":true},{"key":"f5","label":"انگیزه و حال عمومی کودک در این دوره چطور بود؟","type":"select","options":["خوب و امیدوار","نوسان داشت","کم‌انگیزه و خسته"],"required":true},{"key":"f6","label":"مدرسه چه تغییری گزارش می‌کند؟","type":"select","options":["بهبود گزارش می‌کند","بدون تغییر","افت گزارش می‌کند","ارتباط با معلم نداشتم"],"required":true},{"key":"f7","label":"در این سه ماه چند هفته غیبت مدرسه داشت؟","type":"select","options":["تقریباً هیچ","تا دو هفته","بیش از دو هفته"],"required":true},{"key":"f8","label":"خدمات مرکز (جلسات مداخله) در این دوره ادامه داشت؟","type":"select","options":["بله — طبق برنامه","با وقفه/کاهش","قطع شد"],"required":true},{"key":"f9","label":"توضیح آزاد خانواده (اختیاری)","type":"longtext","required":false}]',
  NULL,
  '["پیگیری","خانواده"]',
  'family',
  1,
  'seed-m227',
  NULL,
  1
);

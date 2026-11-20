-- ۰۱۲۰ — فرم‌ساز تعاملی عمومی (v1.27.34 — M4/M8 سند REFERRAL-DESIGN §A)
-- دو جدول تازهٔ دامنهٔ form-builder:
--   forms           — تعریف فرم: بلوک‌ها به‌صورت JSON (kind/label/required/options/note) + اسلاگ عمومی + انتشار
--   form_responses  — پاسخ‌های بدون‌لاگین به‌ازای هر فرم؛ آرایهٔ پاسخ با اندیس بلوک + مشخصات پاسخ‌دهنده
-- الگوی D7: بدون CHECK در SQL — kind/وضعیت‌ها در constants+Zod (FORM_BLOCK_KINDS و …) اعمال می‌شوند.
-- اسلاگ فقط یکتا میان ردیف‌های زنده (ایندکس یکتای جزئی روی حذف‌نرم‌شده‌ها) — تغییر اسلاگ فرم منتشرشده
-- لینک قبلی را ۴۰۴ می‌کند؛ در UI هشدار داده می‌شود.
-- blocks/form_responses.answers به‌صورت JSON ذخیره می‌شوند: فرم‌ساز یک محصول در حال تحول است و
-- شمای بلوک‌ها ستون‌بندی سخت را نمی‌پذیرد؛ اعتبارسنجی کامل در سرویس (validateAnswers در pure.ts).

CREATE TABLE IF NOT EXISTS forms (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  blocks        TEXT NOT NULL DEFAULT '[]',
  published     INTEGER NOT NULL DEFAULT 0,
  academic_year TEXT,
  created_by    TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at    TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_forms_slug_active ON forms(slug) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS form_responses (
  id               TEXT PRIMARY KEY,
  form_id          TEXT NOT NULL REFERENCES forms(id),
  answers          TEXT NOT NULL,
  respondent_name  TEXT NOT NULL,
  respondent_phone TEXT,
  channel          TEXT NOT NULL DEFAULT 'web',
  token            TEXT,
  academic_year    TEXT,
  status           TEXT NOT NULL DEFAULT 'new',
  created_by       TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_form_responses_form ON form_responses(form_id, created_at);
CREATE INDEX IF NOT EXISTS idx_form_responses_status ON form_responses(status);

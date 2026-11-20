-- ۰۱۱۸ — ثبت نتیجهٔ ارزیابی تخصصی «اظهارنظر و پیشنهاد» (v1.27.33 — خواست کارفرما)
-- یک ردیف فعال به‌ازای هر ورودی سنجش — ثبت دوباره = ویرایش همان ردیف (upsert با ایندکس یکتای جزئی روی حذف‌نرم‌شده‌ها).
-- چهار دادهٔ مستقل در چهار گروه ستون: نتیجهٔ ۷گزینه‌ای (result_option)، ارجاع اتیسم (autism_referral)،
-- نمرات سه آزمون اختیاری (لی‌تر/وکسلر ۲ کلامی/گودیناف) و مشاهدات بالینی — منطق ثبت هیچ‌یک به دیگری وابسته نیست.
-- الگوی D7: بدون CHECK — رنج result_option در IqEvaluationCreateSchema (src/core/shared/schemas.ts) اعمال می‌شود.
-- iq_referral_handled_at روی screening_entries: لحظهٔ ثبت نتیجه — ردیف از کارت «نیازمند پیگیری (ارجاع هوش)»
-- فعال خارج و به بخش فقط‌خواندنی «نتایج ثبت‌شده» می‌رود.
-- academic_year روی screening_entries: سال تحصیلی مهر-محور؛ در سرویس هنگام نوشتن از day محاسبه می‌شود
-- (schoolYearOfYmd در core/shared/time.ts) — ردیف‌های قدیمی NULL می‌مانند و در نمای پیش‌فرض کنار سال جاری دیده می‌شوند.

CREATE TABLE IF NOT EXISTS iq_evaluations (
  id                      TEXT PRIMARY KEY,
  screening_entry_id      TEXT NOT NULL REFERENCES screening_entries(id),
  result_option           INTEGER NOT NULL,
  autism_referral         INTEGER NOT NULL DEFAULT 0,
  leiter_score            REAL,
  wechsler_verbal_score   REAL,
  goodenough_score        REAL,
  clinical_observations   TEXT,
  academic_year           TEXT,
  created_by              TEXT NOT NULL,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at              TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_iq_eval_entry_active ON iq_evaluations(screening_entry_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_iq_eval_year ON iq_evaluations(academic_year);

ALTER TABLE screening_entries ADD COLUMN iq_referral_handled_at TEXT;
ALTER TABLE screening_entries ADD COLUMN academic_year TEXT;

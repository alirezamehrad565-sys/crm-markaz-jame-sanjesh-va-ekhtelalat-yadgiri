-- 0119 — معرفی به مرکز از فرم عمومی خانواده/معلم (v1.27.33 — طراحی REFERRAL-DESIGN.md)
-- جدول waitlist_referrals متعلق به دامنهٔ موجود waitlist (ریورک ماژول — نه ماژول تازه):
-- معرفی هرگز مستقیم دانش‌آموز نمی‌شود؛ پذیرش از مسیر create اتمیک لیست انتظار می‌گذرد.
-- نقش/کانال/دسته/وضعیت enum در constants+Zod (الگوی D7 — بدون CHECK در SQL).
-- school_text/grade_text/class_text اسنپ‌شات متنِ لحظهٔ ثبت‌اند (تغییر نام مدرسه بعداً رکوردهای قبلی را نمی‌شکند).
-- submission_group: ردیف‌های ثبتِ دسته‌ای یک معلم را به هم می‌بندد.
-- academic_year: سال تحصیلی مهر-محور هنگام نوشتن در سرویس (schoolYearOfYmd)؛ ردیف‌های قدیمی نداریم — جدول تازه است.
-- referral_id روی waitlist: پیوند پذیرش به معرفی مبدأ؛ academic_year روی waitlist برای جداسازی سال تحصیلی جریان پذیرش.

CREATE TABLE IF NOT EXISTS waitlist_referrals (
  id                TEXT PRIMARY KEY,
  ref_role          TEXT NOT NULL,               -- family | teacher
  referrer_name     TEXT NOT NULL,
  referrer_phone    TEXT NOT NULL,
  first_name        TEXT NOT NULL,
  birth_date        TEXT,
  guardian_phone    TEXT,          -- تلفن ولیّ هر کودک (ثبت دسته‌ای معلم: به‌ازای هر ردیف؛ خانواده: خود معرف)
  school_text       TEXT,
  grade_text        TEXT,
  class_text        TEXT,
  concern_category  TEXT,                        -- delayed | learning_disorder | intellectual | autism | other
  concern_tags      TEXT NOT NULL DEFAULT '[]',  -- آرایهٔ JSON چیپ‌های دغدغه
  concern_text      TEXT,
  prior_eval        INTEGER,                     -- 0/1 — ارزیابی یا تشخیص قبلی
  prior_eval_note   TEXT,
  channel           TEXT NOT NULL,               -- web | bot | manual
  chat_id           TEXT,
  token             TEXT,
  submission_group  TEXT,
  status            TEXT NOT NULL DEFAULT 'new', -- new | accepted | rejected
  reject_reason     TEXT,
  waitlist_id       TEXT REFERENCES waitlist(id),
  academic_year     TEXT,
  created_by        TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at        TEXT
);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON waitlist_referrals(status, created_at);
CREATE INDEX IF NOT EXISTS idx_referrals_phone ON waitlist_referrals(referrer_phone);
CREATE INDEX IF NOT EXISTS idx_referrals_year ON waitlist_referrals(academic_year);

ALTER TABLE waitlist ADD COLUMN referral_id TEXT;
ALTER TABLE waitlist ADD COLUMN academic_year TEXT;

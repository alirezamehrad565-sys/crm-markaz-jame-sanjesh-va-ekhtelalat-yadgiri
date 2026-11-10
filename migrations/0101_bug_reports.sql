-- 0101 — گزارش باگ سامانه به پشتیبانی CP (بازاعمال ۱.۲۵.۵۱ روی درخت ۱.۲۵.۵۳)
-- هم‌قرارداد گیرندهٔ CP m7 (POST /api/node/feedback): گزارش در همین جدول مادی می‌شود،
-- سپس در چرخهٔ ارسال (کرون/فرصت‌طلب) به کنترل‌پلین می‌رود؛ status open→sent.
-- این فایل در تولید با همین نام اعمال شده است (d1_migrations ردیف 108) — بازاعمال فقط
-- برای نصب‌های تازه/سلف‌هاست؛ روی تولید wrangler آن را رد می‌کند و جدول دست‌نخورده می‌ماند.
-- قانون قرارداد: حذف فیزیکی ممنوع — گزارش فقط وضعیت عوض می‌کند.

CREATE TABLE IF NOT EXISTS bug_reports (
  id            TEXT PRIMARY KEY,
  staff_id      TEXT REFERENCES staff(id),
  staff_name    TEXT,
  areas         TEXT NOT NULL,           -- JSON array از شناسهٔ ماژول‌ها (BUG_REPORT_AREAS)
  severity      TEXT NOT NULL CHECK (severity IN ('minor', 'major', 'critical')),
  description   TEXT,
  page          TEXT,                    -- hash صفحهٔ موقع گزارش، مثل #/appointments
  app_version   TEXT,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'sent')),
  forward_error TEXT,
  created_at    TEXT NOT NULL,
  forwarded_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_bug_reports_created ON bug_reports(created_at);
CREATE INDEX IF NOT EXISTS idx_bug_reports_staff ON bug_reports(staff_id, created_at);

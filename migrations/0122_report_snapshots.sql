-- ۰۱۲۲ — موج ۳ طرح ارتقای پرونده (طرح C «پروندهٔ ناشر» — PROFILE-UPGRADE-DESIGN §۵):
-- اسناد خروجی نسخه‌دار پرونده: snapshot-first. هر خروجی، سند قطعی با شمارهٔ سالانهٔ مرکزی،
-- هش SHA-256 محتوا و امضاکنندهٔ لحظهٔ قطعی‌سازی است؛ چاپ/بازخوانی فقط از snapshot انجام می‌شود
-- و «چاپ دیروز» قابل بازتولید و استناد می‌ماند. ارسال/توکن‌ها مال موج بعدی است (report_sends).
-- شمارهٔ گزارش: `سال جلالی-ترتیب` (مثل 1405-0047) — UNIQUE برای انسداد رقابت دو صدور هم‌زمان.
-- امضا در این موج = ثبت نام/نقش امضاکننده در لحظهٔ قطعی‌سازی؛ امضای دیجیتالِ فردا بدهی ثبت‌شده است.

CREATE TABLE IF NOT EXISTS report_snapshots (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  template_key TEXT NOT NULL,          -- فعلاً 'pathway_report' (گزارش دورهٔ مداخلهٔ طرح درمان)
  path_id TEXT,                        -- مسیر مداخلهٔ مبنای سند (وقتی قالب مسیر-محور باشد)
  period_from TEXT,
  period_to TEXT,
  sections_json TEXT NOT NULL,         -- سند قطعی (JSON) — رندر هرگز از دادهٔ زنده نیست
  content_hash TEXT NOT NULL,          -- SHA-256 متن sections_json
  report_no TEXT NOT NULL UNIQUE,      -- سال جلالی-ترتیب، صادرشده از شمارندهٔ سالانهٔ مرکز
  signed_by TEXT,                      -- staff_id امضاکنندهٔ قطعی‌سازی
  signed_name TEXT,                    -- نام امضاکننده در لحظهٔ قطعی‌سازی (snapshot از خود رکورد)
  signed_role TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_report_snapshots_student ON report_snapshots(student_id, created_at DESC);

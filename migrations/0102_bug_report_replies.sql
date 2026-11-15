-- 0102 — پاسخ پشتیبانی روی گزارش باگ (۱.۲۵.۵۷ — خواست کارفرما: «تیکت بشینه و جواب بشه داد»)
-- سه ستون additive روی bug_reports — ردیف‌های موجود دست‌نخورده می‌مانند.
-- منبع پاسخ = کنترل‌پلین (CP m8): در چرخهٔ دوطرفهٔ @app/bug-report-forward،
-- پاسخ‌ها با GET /api/node/feedback/replies?since= pull و با کلید خودِ گزارش
-- (bug_reports.id همان node_report_id سمت CP) UPSERT می‌شوند.
-- قانون قرارداد: پاسخ فقط-خواندنی روی نود است — هیچ مسیر نوشتنی محلی ندارد.

ALTER TABLE bug_reports ADD COLUMN reply_text TEXT;   -- متن پاسخ پشتیبانی شبکه
ALTER TABLE bug_reports ADD COLUMN reply_by TEXT;     -- نام پاسخ‌دهنده در پنل CP
ALTER TABLE bug_reports ADD COLUMN reply_at TEXT;     -- ISO زمان پاسخ — مبنای freshness در UPSERT

CREATE INDEX IF NOT EXISTS idx_bug_reports_reply_at ON bug_reports(reply_at);

-- مایگریشن اسکیما D1 — گزارش خطاهای سمت کاربر (m138)
-- مانیتورینگ خطاهای مرورگر بدون اکانت خارجی (گام «مانیتور خطا» طرح ارتقا — EXPERT-AUDIT Gap-3)
-- سبک نگه داشته شده: بدون FK، فقط اندیس زمان؛ مسیر POST /api/client-errors سقف ۵۰۰ ردیف/شبانه‌روز دارد
CREATE TABLE IF NOT EXISTS client_errors (
  id          TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
  message     TEXT NOT NULL,
  source      TEXT,
  line_no     INTEGER,
  col_no      INTEGER,
  stack       TEXT,
  url         TEXT,
  user_agent  TEXT
);
CREATE INDEX IF NOT EXISTS idx_client_errors_time ON client_errors(occurred_at);

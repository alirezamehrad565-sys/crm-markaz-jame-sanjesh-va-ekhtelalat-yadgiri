-- 0107 — گزارش رشد جدول‌ها (ف۴ طرح ارتقا — بهداشت داده): شمارش روزانهٔ ردیف‌ها در یک جدول فقط-افزودنی
-- زمینه: طرح §۵-۳ — «دیتابیس بی‌سیاستِ نگه‌داری، بمب ساعتی است»؛ تا امروز هیچ دید تاریخی از رشد
-- جدول‌ها وجود نداشت (فقط COUNT لحظه‌ای). این جدول هر شب (سوار بر کرون digest — بدون کرون تازه،
-- سقف پلن Free ۵ کرون) یک ردیف به‌ازای هر جدول کاربری می‌گیرد و خواندن آن فقط‌مدیر از
-- GET /api/growth/report رخ می‌دهد؛ شمارش COUNT(*) هرگز در مسیر درخواست نیست.
-- idempotency: کلید مرکب (snapshot_date, table_name) + UPSERT — اجرای دوباره در همان روز فقط بازنویسی می‌کند.

CREATE TABLE IF NOT EXISTS table_growth_snapshots (
  snapshot_date TEXT NOT NULL,           -- 'YYYY-MM-DD' (UTC — تاریخ چرخهٔ شبانه)
  table_name    TEXT NOT NULL,           -- نام جدول کاربری از sqlite_master
  row_count     INTEGER NOT NULL,        -- COUNT(*) لحظهٔ شمارش
  captured_at   TEXT NOT NULL,           -- مُهر ISO کامل شمارش (UTC)
  PRIMARY KEY (snapshot_date, table_name)
);

CREATE INDEX IF NOT EXISTS idx_growth_table_date ON table_growth_snapshots (table_name, snapshot_date DESC);

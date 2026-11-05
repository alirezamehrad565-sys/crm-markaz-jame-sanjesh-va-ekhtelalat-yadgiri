-- m244 — جدول رویدادهای پایش کارایی (RUM) — additive و idempotent
-- تله‌متری بی‌نام کارایی: بدون IP، بدون User-Agent، بدون شناسهٔ کاربر (قانون PII design.md §۶)
CREATE TABLE IF NOT EXISTS rum_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ts            TEXT    NOT NULL,            -- ISO UTC لحظهٔ ثبت
  metric        TEXT    NOT NULL,            -- LCP | CLS | INP | FCP | TTFB
  value         REAL    NOT NULL,            -- میلی‌ثانیه (CLS بدون واحد)
  rating        TEXT    NOT NULL,            -- good | needs-improvement | poor
  nav_id        TEXT    NOT NULL,            -- شناسهٔ بارگذاری صفحه (گروه‌بندی رویدادهای یک ناوبری)
  path          TEXT    NOT NULL,            -- مسیر SPA (شامل hash) — بریده‌شده به ۳۰۰ نویسه
  viewport_w    INTEGER NOT NULL,
  viewport_h    INTEGER NOT NULL,
  conn          TEXT,                        -- effectiveType مرورگر (4g/3g/…) — می‌تواند NULL باشد
  device_memory INTEGER,                     -- حافظهٔ تقریبی دستگاه به GB — می‌تواند NULL باشد
  prm           INTEGER NOT NULL DEFAULT 0,  -- prefers-reduced-motion فعال؟ 0/1
  theme         TEXT    NOT NULL DEFAULT 'light' -- تم لحظهٔ اندازه‌گیری (روشن/تاریک)
);

CREATE INDEX IF NOT EXISTS idx_rum_ts ON rum_events (ts);
CREATE INDEX IF NOT EXISTS idx_rum_metric_ts ON rum_events (metric, ts);

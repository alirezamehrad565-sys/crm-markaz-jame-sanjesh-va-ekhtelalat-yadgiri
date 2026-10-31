-- m215 — پایش پیشروی SLD: سری زمانی پراپ‌های جلسه‌ای مسیر مداخله (معیار: ۸۰٪ در دو جلسهٔ پیاپی)
-- اتصال به تقویم طبق تصمیم کاربر به فازهای آخر موکول شده — هیچ ستون نوبتی این‌جا نیست.
CREATE TABLE IF NOT EXISTS pathway_probes (
  id          TEXT PRIMARY KEY,
  pathway_id  TEXT NOT NULL REFERENCES intervention_paths(id) ON DELETE CASCADE,
  session_id  TEXT REFERENCES pathway_sessions(id) ON DELETE SET NULL, -- حذف جلسهٔ برنامه، اندازه‌گیری را زنده نگه می‌دارد
  target_key  TEXT NOT NULL,               -- اسنپ‌شات هدف مسیر در لحظهٔ ثبت
  metric      TEXT NOT NULL,               -- برچسب سنجه (مثلاً «واژهٔ درست در دقیقه») — رشتهٔ اعتبارسنجی‌شده
  value       REAL NOT NULL,               -- اندازهٔ خام پراپ (۰ تا ۱۰۰۰۰)
  unit        TEXT,
  taken_at    TEXT NOT NULL,               -- ISO UTC لحظهٔ اجرای پراپ
  taken_by    TEXT NOT NULL REFERENCES staff(id),
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pathway_probes_series ON pathway_probes(pathway_id, metric, taken_at);

-- m236 — پیوند درخت هدف با پروفایل دانش‌آموز («فاز جدا» نقشهٔ m231 — حالا اجرا می‌شود)
-- دانش‌آموز همان زبان طبقه‌بندی کارت را می‌گیرد: پیوند چندبه‌چند با کلیدهای درخت هدف
-- (پردازش اطلاعات + کارکردهای اجرایی) در کد تعریف می‌شود: src/domain/exercise-bank/focus.ts
-- برچسب‌های اختلال/پایهٔ دانش‌آموز همان student_tags می‌مانند — این جدول فقط نیمهٔ علمی درخت را اضافه می‌کند.
-- additive: هیچ جدول یا ستون موجودی تغییر نمی‌کند؛ CHECK و student_tags دست‌نخورده.
CREATE TABLE IF NOT EXISTS student_focus_links (
  student_id  TEXT NOT NULL REFERENCES students(id),
  focus_key   TEXT NOT NULL,              -- کلید در درخت کد (ستون/حوزه/مهارت)
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (student_id, focus_key)
);
CREATE INDEX IF NOT EXISTS idx_student_focus_key ON student_focus_links(focus_key);

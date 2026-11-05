-- m229 — درخت هدف‌های کتابخانهٔ کارت آماده: پیوند کارت ↔ مهارت هدف
-- درخت علمی (پردازش اطلاعات + کارکردهای اجرایی) در کد تعریف می‌شود: src/domain/exercise-bank/focus.ts
-- اینجا فقط جدول پیوند چندبه‌چند ذخیره می‌شود؛ کلیدهای ناشناخته در سرویس رد می‌شوند (اعتبارسنجی کد).
CREATE TABLE IF NOT EXISTS exercise_focus_links (
  exercise_id TEXT NOT NULL REFERENCES exercises(id),
  focus_key   TEXT NOT NULL,              -- کلید در درخت کد (ستون/حوزه/مهارت)
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (exercise_id, focus_key)
);
CREATE INDEX IF NOT EXISTS idx_exercise_focus_key ON exercise_focus_links(focus_key);

-- backfill — کارت‌های موجود بر پایهٔ برچسب‌های فعلی به مهارت هدف متصل می‌شوند (نگاشت: FOCUS_BACKFILL_BY_TAG_NAME)
INSERT OR IGNORE INTO exercise_focus_links (exercise_id, focus_key)
  SELECT et.exercise_id, 'memory_working' FROM exercise_tags et JOIN tags t ON t.id = et.tag_id WHERE t.name = 'حافظهٔ فعال';
INSERT OR IGNORE INTO exercise_focus_links (exercise_id, focus_key)
  SELECT et.exercise_id, 'memory_working' FROM exercise_tags et JOIN tags t ON t.id = et.tag_id WHERE t.name = 'حافظهٔ کاری';
INSERT OR IGNORE INTO exercise_focus_links (exercise_id, focus_key)
  SELECT et.exercise_id, 'attention_sustained' FROM exercise_tags et JOIN tags t ON t.id = et.tag_id WHERE t.name = 'دقت و تمرکز';
INSERT OR IGNORE INTO exercise_focus_links (exercise_id, focus_key)
  SELECT et.exercise_id, 'perception_visomotor' FROM exercise_tags et JOIN tags t ON t.id = et.tag_id WHERE t.name = 'هماهنگی حرکتی';
INSERT OR IGNORE INTO exercise_focus_links (exercise_id, focus_key)
  SELECT et.exercise_id, 'ef_inhibition' FROM exercise_tags et JOIN tags t ON t.id = et.tag_id WHERE t.name = 'تنظیم رفتار';
INSERT OR IGNORE INTO exercise_focus_links (exercise_id, focus_key)
  SELECT et.exercise_id, 'fluency_auto' FROM exercise_tags et JOIN tags t ON t.id = et.tag_id WHERE t.name = 'روخوانی';
INSERT OR IGNORE INTO exercise_focus_links (exercise_id, focus_key)
  SELECT et.exercise_id, 'lang_comprehension' FROM exercise_tags et JOIN tags t ON t.id = et.tag_id WHERE t.name = 'درک مطلب';
INSERT OR IGNORE INTO exercise_focus_links (exercise_id, focus_key)
  SELECT et.exercise_id, 'attention_sustained' FROM exercise_tags et JOIN tags t ON t.id = et.tag_id WHERE t.name = 'توجه';

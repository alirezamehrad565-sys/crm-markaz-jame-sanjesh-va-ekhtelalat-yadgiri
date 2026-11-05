-- m251-الف — M1 (۱.۲۵.۰۷) بستر بک‌اند بازی: رجیستری سنجه و هدف + بستهٔ محتوای نسخه‌دار
-- قرارداد §۳ و §۴ نقشهٔ راه «سامانهٔ محتوای درمانی مرکز»:
--   · سنجه و هدف واژه‌نامهٔ ثابت‌اند؛ محتوا فقط با نسخه وارد می‌شود (تغییرناپذیری نسخهٔ منتشرشده در کد).
--   · سدهٔ پایه از پیوست سند محتوا: سنجه‌های بسته‌های ۱ تا ۱۰ یک‌جا ثبت می‌شوند
--     (سنجهٔ انسانی با source='human' از روز اول از سنجهٔ خودکار جدا می‌ماند — شرط همگرایی پیلوت).

CREATE TABLE IF NOT EXISTS game_metrics (
  id               TEXT PRIMARY KEY,              -- مثل pct_error_numline
  title_fa         TEXT NOT NULL,
  unit             TEXT NOT NULL CHECK (unit IN ('percent','count','ms','score')),
  higher_is_better INTEGER NOT NULL CHECK (higher_is_better IN (0,1)),
  source           TEXT NOT NULL CHECK (source IN ('auto','human')),
  formula          TEXT NOT NULL CHECK (formula IN ('accuracy','numline_error','median_rt','commission','omission','none'))
  -- formula: فرمول محاسبهٔ سمت سرور از پاسخ‌های پروب (§۸)؛ none = سنجهٔ فراتر از Attempt (انسانی/پایبندی)
);

CREATE TABLE IF NOT EXISTS game_goals (
  id          TEXT PRIMARY KEY,                   -- مثل numline
  title_fa    TEXT NOT NULL,
  package_id  TEXT NOT NULL,
  metric_id   TEXT NOT NULL REFERENCES game_metrics(id),
  age_min     INTEGER,
  age_max     INTEGER
);
CREATE INDEX IF NOT EXISTS idx_game_goals_pkg ON game_goals(package_id);

CREATE TABLE IF NOT EXISTS game_packages (
  id             TEXT NOT NULL,
  version        TEXT NOT NULL,
  title_fa       TEXT NOT NULL,
  evidence_level TEXT NOT NULL CHECK (evidence_level IN ('A','B','C')),
  dose_json      TEXT NOT NULL,                   -- {days_per_week, minutes, max_missions_per_day, min_weeks}
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','published','retired')),
  body_json      TEXT NOT NULL,                   -- قرارداد §۴: missions/items/probe/mastery/parent_copy
  reviewed_by    TEXT REFERENCES staff(id),
  reviewed_at    TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (id, version)
);

-- ─── سدهٔ پایه: سنجه‌های پیوست سند محتوا (بسته‌های ۱ تا ۱۰) ───
INSERT OR IGNORE INTO game_metrics (id, title_fa, unit, higher_is_better, source, formula) VALUES
  ('accuracy_pa_reading',        'دقت آگاهی واج‌شناختی',            'percent', 1, 'auto',   'accuracy'),
  ('accuracy_phonics_reading',   'دقت نگاشت حرف-صدا',               'percent', 1, 'auto',   'accuracy'),
  ('wpm_fluency_reading',        'واژه در دقیقه (ثبت انسانی)',      'score',   1, 'human',  'none'),
  ('accuracy_oral_reading',      'دقت خواندن بلند متن ثابت',        'percent', 1, 'human',  'none'),
  ('pct_error_numline',          'میانگین خطای جای عدد',            'percent', 0, 'auto',   'numline_error'),
  ('accuracy_numcompare',        'دقت مقایسهٔ کمیتی',               'percent', 1, 'auto',   'accuracy'),
  ('accuracy_facts_math',        'دقت واقعیت‌های حسابی',            'percent', 1, 'auto',   'accuracy'),
  ('accuracy_gonogo',            'دقت کلی گو/نوگو',                 'percent', 1, 'auto',   'accuracy'),
  ('median_rt_gonogo',           'میانهٔ زمان واکنش درست',          'ms',      0, 'auto',   'median_rt'),
  ('commission_gonogo',          'پاسخ به غیرهدف',                  'count',   0, 'auto',   'commission'),
  ('omission_gonogo',            'از دست‌دادن هدف',                 'count',   0, 'auto',   'omission'),
  ('adherence_homework',         'پایبندی برنامهٔ خانه',            'percent', 1, 'auto',   'none'),
  ('writing_strategy_score',     'امتیاز چک‌لیست نگارش راهبردی',    'score',   1, 'human',  'none'),
  ('accuracy_comprehension',     'دقت پاسخ به سؤال‌های درک مطلب',   'percent', 1, 'auto',   'accuracy'),
  ('accuracy_spelling_choice',   'دقت انتخاب املای درست',           'percent', 1, 'auto',   'accuracy'),
  ('score_dictation',            'امتیاز دیکتهٔ هفتگی',             'score',   1, 'human',  'none');

-- ─── سدهٔ پایه: هدف‌های بسته‌های مسیر بحرانی (بقیه با API پرسنلی پیش از انتشار هر بسته ثبت می‌شود) ───
INSERT OR IGNORE INTO game_goals (id, title_fa, package_id, metric_id, age_min, age_max) VALUES
  ('numline',      'جای عدد روی خط',            'numsense', 'pct_error_numline',     6, 8),
  ('numcompare',   'مقایسهٔ کمیتی',             'numsense', 'accuracy_numcompare',   6, 8),
  ('math_facts',   'بازیابی واقعیت‌های حسابی',  'numsense', 'accuracy_facts_math',   6, 8),
  ('inhibition',   'بازداری پاسخ',              'attention','accuracy_gonogo',       6, 10),
  ('pa',           'آگاهی واجی',                'reading',  'accuracy_pa_reading',   6, 9),
  ('letter_sound', 'نگاشت حرف-صدا',             'reading',  'accuracy_phonics_reading', 6, 9),
  ('adherence',    'پایبندی برنامهٔ خانه',      'parent',   'adherence_homework',    NULL, NULL);

-- مایگریشن اسکیما D1 — رویدادساز
-- سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
-- ============================================================
-- — سیستم تایم‌لاین و گزارش‌نویسی جلسات/ایونت‌ها — فقط اضافه‌ای
-- جداول:
-- case_event_types کاتالوگ انواع رویداد + تعریف فیلدهای فرم (فرم‌ساز پنل)
-- case_events هر رویداد/گزارش ثبت‌شده روی پروندهٔ دانش‌آموز — منبع تایم‌لاین
-- ستون‌های additive:
-- students.owner_staff_id «مسئول پرونده» — سپردن رسمی پرونده به درمانگر
-- exercise_assignments.feedback/graded_by/graded_at تصحیح تکلیف
-- قراردادها: بدون CHECK در SQL (الگوی D7 — enum در @core/shared/constants.ts + Zod)؛
-- حذف فقط نرم (deleted_at)؛ رویداد append-only (لغو با status نه DELETE)؛
-- snapshot فیلدها نیست — payload با تعریف نوعِ لحظهٔ ثبت تفسیر می‌شود و
-- رویدادهای قدیمی با label ذخیره‌شده در payload هم‌زمان خوانا می‌مانند.
-- ============================================================

CREATE TABLE IF NOT EXISTS case_event_types (
  id              TEXT PRIMARY KEY,
  key             TEXT NOT NULL,                 -- کلید یکتای منطقی (برای seed و شناسایی)
  title           TEXT NOT NULL,                 -- عنوان فارسی (سقف ۱۲۰ نویسه — Zod)
  category        TEXT NOT NULL,                 -- session | checklist | note — ماتریس در کد
  icon            TEXT,                          -- ایموجی نمایشی (اختیاری)
  family_fillable INTEGER NOT NULL DEFAULT 0,    -- چک‌لیست قابل پر کردن توسط خانواده
  fields          TEXT NOT NULL DEFAULT '[]',    -- JSON: [{key,label,type,options?,required?,scaleMax?}]
  bands           TEXT,                          -- JSON چک‌لیست: [{max,label}] صعودی
  active          INTEGER NOT NULL DEFAULT 1,    -- soft-state
  deleted_at      TEXT,
  created_by      TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_case_event_types_key
  ON case_event_types(key) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_case_event_types_active ON case_event_types(active, deleted_at);

CREATE TABLE IF NOT EXISTS case_events (
  id               TEXT PRIMARY KEY,
  event_type_id    TEXT NOT NULL REFERENCES case_event_types(id),
  student_id       TEXT NOT NULL REFERENCES students(id),
  staff_id         TEXT REFERENCES staff(id),    -- ثبت‌کننده (پر کردن خانواده → NULL)
  appointment_id   TEXT REFERENCES appointments(id), -- لینک اختیاری به نوبت (+)
  occurred_at      TEXT NOT NULL,                -- ISO UTC — زمان وقوع (پیش‌فرض: لحظهٔ ثبت)
  status           TEXT NOT NULL DEFAULT 'completed', -- completed | pending_family | cancelled — ماتریس در کد
  payload          TEXT,                         -- JSON پاسخ‌های فرم {key: {value,label}}
  analysis         TEXT,                         -- JSON چک‌لیست: {score,band,answered,total}
  summary          TEXT,                         -- خط خلاصهٔ تایم‌لاین (سقف ۳۰۰ — سرور تولید می‌کند)
  assigned_chat_id TEXT,                         -- چت ولیّ هدف چک‌لیست در انتظار (اطلاعی)
  fill_token       TEXT,                         -- توکن وب‌فرم خانواده (چک‌لیست بلند)
  fill_expires_at  TEXT,                         -- انقضای توکن (۷ روز)
  filled_by_chat_id TEXT,                        -- چت پرکننده (یا 'web:<ts>' برای وب‌فرم)
  created_by       TEXT NOT NULL,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_case_events_student ON case_events(student_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_case_events_type    ON case_events(event_type_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_case_events_status  ON case_events(status);

-- ─── -c — مسئول پرونده (سپردن رسمی پرونده به درمانگر) ───
ALTER TABLE students ADD COLUMN owner_staff_id TEXT REFERENCES staff(id);

-- ─── -c — تصحیح تکلیف (وضعیت + بازخورد متنی) ───
ALTER TABLE exercise_assignments ADD COLUMN feedback  TEXT;
ALTER TABLE exercise_assignments ADD COLUMN graded_by TEXT;
ALTER TABLE exercise_assignments ADD COLUMN graded_at TEXT;

-- ============================================================
-- seed روز اول — سه نوع پایه (تصمیم ۷ طراحی): شرح حال، گزارش جلسهٔ مداخله،
-- چک‌لیست مشاهدهٔ رفتار در خانه. با id ثابت و ON CONFLICT بدون کاری (idempotent).
-- ============================================================

INSERT INTO case_event_types (id, key, title, category, icon, family_fillable, fields, bands, created_by)
VALUES (
  'seed-anamnesis-0001', 'anamnesis', 'شرح حال', 'session', '📋', 0,
  '[{"key":"source","label":"منبع اطلاعات","type":"select","options":["مادر","پدر","هر دو والد","سایر اعضای خانواده"],"required":true},{"key":"chief_complaint","label":"شکایت اصلی و سیر مشکل","type":"longtext","required":true},{"key":"pregnancy_birth","label":"سابقهٔ بارداری و تولد","type":"longtext"},{"key":"development","label":"سابقهٔ رشدی (راه‌رفتن، تکلم، …)","type":"longtext"},{"key":"medical","label":"سابقهٔ پزشکی و دارویی","type":"longtext"},{"key":"family","label":"سابقهٔ خانوادگی","type":"longtext"},{"key":"school","label":"وضعیت تحصیلی / مهد","type":"longtext"},{"key":"strengths","label":"نقاط قوت کودک","type":"longtext"},{"key":"notes","label":"توضیحات تکمیلی","type":"longtext"}]',
  NULL, 'system'
) ON CONFLICT(id) DO NOTHING;

INSERT INTO case_event_types (id, key, title, category, icon, family_fillable, fields, bands, created_by)
VALUES (
  'seed-intervention-0001', 'intervention', 'گزارش جلسهٔ مداخله', 'session', '🧩', 0,
  '[{"key":"goal","label":"هدف جلسه","type":"text","required":true},{"key":"activities","label":"فعالیت‌های انجام‌شده","type":"longtext","required":true},{"key":"performance","label":"عملکرد کودک","type":"longtext"},{"key":"participation","label":"میزان مشارکت","type":"scale","scaleMax":5},{"key":"home_task","label":"تکلیف خانه","type":"text"},{"key":"recommendations","label":"توصیه به خانواده","type":"longtext"}]',
  NULL, 'system'
) ON CONFLICT(id) DO NOTHING;

INSERT INTO case_event_types (id, key, title, category, icon, family_fillable, fields, bands, created_by)
VALUES (
  'seed-home-behavior-0001', 'home_behavior', 'چک‌لیست مشاهدهٔ رفتار در خانه', 'checklist', '🏠', 1,
  '[{"key":"i1","label":"بی‌قراری و ناآرامی در طول روز","type":"scale","scaleMax":3},{"key":"i2","label":"پرخاشگری یا لجبازی با اعضای خانواده","type":"scale","scaleMax":3},{"key":"i3","label":"ناتوانی در پیگیری دستور تا پایان","type":"scale","scaleMax":3},{"key":"i4","label":"مشکل در خواب و آرامش شبانه","type":"scale","scaleMax":3},{"key":"i5","label":"اجتناب از تکالیف و فعالیت‌های ساخت‌یافته","type":"scale","scaleMax":3},{"key":"i6","label":"دعوا بر سر موبایل یا تلویزیون","type":"scale","scaleMax":3},{"key":"i7","label":"گفتار تند یا رفتار بی‌احترامی","type":"scale","scaleMax":3},{"key":"i8","label":"نگرانی و ترس‌های شبانه","type":"scale","scaleMax":3}]',
  '[{"max":8,"label":"در محدودهٔ مطلوب"},{"max":16,"label":"نیاز به توجه و پیگیری"},{"max":24,"label":"نیاز به مداخلهٔ جدی"}]',
  'system'
) ON CONFLICT(id) DO NOTHING;

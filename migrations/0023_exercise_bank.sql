-- مایگریشن اسکیما D1 — بانک تمرین
-- سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
-- ============================================================
-- — بانک تمرین و کاربرگ (S3 پلن AI-MODULE §۷) — فقط اضافه‌ای
-- جدول‌ها:
-- exercises تمرین/کاربرگ (یک فایل برای هر تمرین — قابل تعویض)
-- exercise_tags برچسب‌گذاری با تاکسونومی مشترک tags (پایه/اختلال/سفارشی)
-- exercise_assignments تکلیف ارسال‌شده به خانواده (از بات یا پنل)
-- exercise_files ذخیرهٔ فایل داخل D1 (الگوی assessments؛ پیش‌فرض بدون R2 —
-- با فعال‌شدن binding ریدهٔ R2 این جدول استفاده نمی‌شود)
-- bot_menu_state وضعیت منوی تو‌در‌توی بات برای هر chat (شناسه‌ها UUID هستند و
-- callback_data بیش از ۶۴ بایت نمی‌پذیرد — اندیس به‌جای شناسه)
-- قراردادها: بدون CHECK در SQL (الگوی D7 — enum در کد)، حذف فقط نرم،
-- assigned_by بدون FK به staff (معلم مدرسه ردیف staff ندارد؛ شکل: staff id یا class:<id>)
-- ============================================================

CREATE TABLE IF NOT EXISTS exercises (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  format TEXT NOT NULL DEFAULT 'worksheet',     -- worksheet | game | instruction — ماتریس در کد
  published INTEGER NOT NULL DEFAULT 1,         -- فقط منتشرشده‌ها در بات/برچسب دیده می‌شوند
  file_name TEXT,
  file_mime TEXT,
  file_size INTEGER,
  file_key TEXT,                                -- کلید در ObjectStore (داخل D1 یا R2)
  created_by TEXT NOT NULL REFERENCES staff(id),
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_exercises_published ON exercises(published, deleted_at, created_at);

-- برچسب‌ها از تاکسونومی مشترک tags — دسته‌های disorder/grade/custom
CREATE TABLE IF NOT EXISTS exercise_tags (
  exercise_id TEXT NOT NULL REFERENCES exercises(id),
  tag_id TEXT NOT NULL REFERENCES tags(id),
  PRIMARY KEY (exercise_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_exercise_tags_tag ON exercise_tags(tag_id);

CREATE TABLE IF NOT EXISTS exercise_assignments (
  id TEXT PRIMARY KEY,
  exercise_id TEXT NOT NULL REFERENCES exercises(id),
  student_id TEXT NOT NULL REFERENCES students(id),
  assigned_by TEXT NOT NULL,                    -- staff id یا class:<classId> (معلم مدرسه)
  assigned_via TEXT NOT NULL DEFAULT 'bot',     -- bot | panel
  note TEXT,
  status TEXT NOT NULL DEFAULT 'assigned',      -- assigned | done | cancelled — ماتریس در کد
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_exercise_assignments_student ON exercise_assignments(student_id, created_at);
CREATE INDEX IF NOT EXISTS idx_exercise_assignments_exercise ON exercise_assignments(exercise_id, created_at);

-- ObjectStore پیش‌فرض (D1) — محتوا base64؛ متادیتا جدا از محتوا خوانده می‌شود
CREATE TABLE IF NOT EXISTS exercise_files (
  key TEXT PRIMARY KEY,
  mime TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  content_b64 TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- وضعیت منوی تو‌در‌توی بات — فقط برای جریان بانک تمرین (exb)
CREATE TABLE IF NOT EXISTS bot_menu_state (
  chat_id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,                        -- JSON: {v, cats?, filter?, ex?, stu?, sent?}
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

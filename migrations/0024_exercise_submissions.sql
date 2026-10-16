-- مایگریشن اسکیما D1 — بازگشت تمرین
-- سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
-- ============================================================
-- — حلقهٔ بازگشت فایل تکلیف (S3 زیرفاز ۲ — AI-MODULE §۷) — فقط اضافه‌ای
-- جریان: خانواده عکس/فایل نتیجه را در بله می‌فرستد → webhook رسانه‌ای →
-- دانلود با Bot API (getFile) → ObjectStore → رکورد بازگشت →
-- وضعیت تکلیف «done» → اعلان به معلم/درمانگر → تایم‌لاین دانش‌آموز
-- exercise_submissions نتیجهٔ بازگشتی خانواده — هر پیام یک ردیف (چند عکس مجاز)؛
-- متادیتا جدا از محتوا؛ فایل در ObjectStore (کلید submission/<id>)
-- قراردادها: بدون CHECK (الگوی D7)، حذف نرم ندارد (رویداد پیوست‌شدنی است)،
-- FK به exercise_assignments/students مطابق 0023.
-- ============================================================

CREATE TABLE IF NOT EXISTS exercise_submissions (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES exercise_assignments(id),
  student_id TEXT NOT NULL REFERENCES students(id),
  file_name TEXT,
  file_mime TEXT,
  file_size INTEGER,
  file_key TEXT,                                -- کلید در ObjectStore (داخل D1 یا R2)
  source_chat_id TEXT,                          -- چت بله فرستنده (ولیّ) — برای ردیابی
  note TEXT,                                    -- کپشن پیام خانواده
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_exercise_submissions_assignment ON exercise_submissions(assignment_id, created_at);
CREATE INDEX IF NOT EXISTS idx_exercise_submissions_student ON exercise_submissions(student_id, created_at);

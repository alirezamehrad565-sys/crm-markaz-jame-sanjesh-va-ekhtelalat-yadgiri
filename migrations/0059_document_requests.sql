-- مایگریشن اسکیمای D1 — درخواست مدارک از خانواده با بله (m151 — T2)
-- سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
-- ============================================================
-- — فاز ۱ طرح واحد ارتقا: «درخواست مدارک» → بله → عکس/فایل خانواده → پرونده
-- جریان: درمانگر روی پروندهٔ دانش‌آموز درخواست می‌سازد → پیام بله به چت‌های
-- خانوادهٔ متصل (bot_links + prefs — همان الگوی اعلان‌های موجود) → خانواده
-- عکس/فایل می‌فرستد → webhook رسانه → دانلود با MediaFetcher → ObjectStore
-- (همان انبار بانک تمرین: D1 تکه‌تکه / R2) → رکورد student_received_docs
-- قراردادها: بدون CHECK (الگوی D7)، حذف نرم ندارد، status: sent/received/closed؛
-- رکورد مدارک مستقل از درخواست هم ممکن نیست — فقط با درخواست باز ضبط می‌شود.
-- ============================================================

CREATE TABLE IF NOT EXISTS document_requests (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id),
  templates TEXT NOT NULL,                      -- JSON آرایهٔ قالب‌ها (dictation/report_card/teacher_report/prev_eval)
  custom_note TEXT,                             -- یادداشت آزاد درمانگر در پیام خانواده
  status TEXT NOT NULL DEFAULT 'sent',          -- sent → received (اولین مدرک) → closed
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT,
  due_hint TEXT,                                -- مهلت پیشنهادی (اختیاری)
  requested_by TEXT,                            -- کارمند ثبت‌کننده
  delivered_chats INTEGER NOT NULL DEFAULT 0,   -- چند گفتگوی خانواده پیام گرفت
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_document_requests_student ON document_requests(student_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_document_requests_status ON document_requests(status);

-- مدارک دریافتی از بله — هر پیام رسانه‌ای خانواده یک ردیف (چند عکس مجاز)
CREATE TABLE IF NOT EXISTS student_received_docs (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id),
  request_id TEXT REFERENCES document_requests(id),
  media_kind TEXT NOT NULL,                     -- photo | document
  file_name TEXT NOT NULL,
  file_mime TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  file_key TEXT NOT NULL,                       -- کلید در ObjectStore (داخل D1 یا R2)
  caption TEXT,                                 -- کپشن پیام خانواده
  chat_id TEXT,                                 -- چت بله فرستنده — برای ردیابی
  stored_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_student_received_docs_student ON student_received_docs(student_id, stored_at);
CREATE INDEX IF NOT EXISTS idx_student_received_docs_request ON student_received_docs(request_id);

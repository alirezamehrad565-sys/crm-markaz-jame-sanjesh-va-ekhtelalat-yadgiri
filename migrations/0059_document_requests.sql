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

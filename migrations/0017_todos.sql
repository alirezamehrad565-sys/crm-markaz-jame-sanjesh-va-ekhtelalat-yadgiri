CREATE TABLE IF NOT EXISTS todos (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  note         TEXT,                                 -- توضیح اختیاری (سقف در Zod)
  assigner_id  TEXT NOT NULL REFERENCES staff(id),   -- ثبت‌کننده (مالک ویرایش/حذف)
  assignee_id  TEXT NOT NULL REFERENCES staff(id),   -- مسئول انجام (مالک complete)
  due_at       TEXT,                                 -- ISO UTC نرمال‌شده؛ NULL = بدون مهلت
  priority     TEXT NOT NULL DEFAULT 'normal'
               CHECK (priority IN ('normal', 'urgent')),
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'done')),
  completed_at TEXT,                                 -- لحظهٔ رسیدن به done
  deleted_at   TEXT,                                 -- soft delete (§28)
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_todos_assignee ON todos(assignee_id, status, deleted_at);
CREATE INDEX IF NOT EXISTS idx_todos_assigner ON todos(assigner_id, status, deleted_at);
CREATE INDEX IF NOT EXISTS idx_todos_status_due ON todos(status, due_at);

-- مایگریشن اسکیما D1 — کارهای داخلی
-- سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
-- ─────────────────────────────────────────────────────────────
-- فاز ۴: ماژول Todo — هماهنگی داخلی منشی↔مدیر
-- طبق REMAKE-PLAN.md فاز ۴ و Master Spec v2.0 §9/§9.5:
-- * Todo متمایز از follow-up است: اقدام بعدیِ بالینی نیست، هماهنگی
-- داخلی مرکز است (فقط جفت‌های secretary↔manager — قاعده در سرویس)
-- * status فقط از endpoint اختصاصی complete تغییر می‌کند؛ ماتریس در pure.ts
-- * حذف فقط نرم است (deleted_at) — هیچ حذف فیزیکی (§28)
-- * badge (urgent/overdue) ستون denormalized ندارد — computed است
-- ─────────────────────────────────────────────────────────────

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

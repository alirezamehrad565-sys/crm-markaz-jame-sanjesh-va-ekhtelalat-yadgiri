-- مایگریشن اسکیما D1 — پیگیری‌ها
-- سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
-- ─────────────────────────────────────────────────────────────
-- فاز ۳: بنیاد پیگیری — Follow-up Foundation
-- طبق REMAKE-PLAN.md فاز ۳ و Master Spec v2.0 §13/§37:
-- * هر پیگیری یک اقدام بعدیِ ساختاریافته است که به یک موجودیت وصل می‌شود
-- (entity_type/entity_id — نوبت، دانش‌آموز، لیست انتظار؛ بدون CHECK تا
-- فازهای بعد مثل درخواست نوبت بدون migration اضافه شوند — الگوی D7)
-- * status فقط از endpoint اختصاصی (PATCH) با ماتریس pure.ts تغییر می‌کند؛
-- CHECK سطح DB فقط دامنهٔ مجاز را نگه می‌دارد
-- * overdue ستون denormalized ندارد — computed است: open ∧ due_at<now
-- * هیچ حذف فیزیکی نیست — بستن پیگیری با status done/cancelled انجام می‌شود
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS followups (
  id           TEXT PRIMARY KEY,
  entity_type  TEXT NOT NULL,                    -- appointment | student | waitlist |... (enum در @core/shared)
  entity_id    TEXT NOT NULL,                    -- id موجودیتِ مقصد
  student_id   TEXT REFERENCES students(id),     -- اختیاری — وقتی پیگیری متعلق به یک پرونده است
  title        TEXT NOT NULL,                    -- عنوان اقدام (در audit مجاز است — PII نیست)
  assignee_id  TEXT NOT NULL REFERENCES staff(id), -- مسئول پیگیری
  created_by   TEXT NOT NULL REFERENCES staff(id),
  due_at       TEXT,                             -- ISO UTC نرمال‌شده؛ NULL = بدون مهلت
  status       TEXT NOT NULL DEFAULT 'open'
               CHECK (status IN ('open', 'in_progress', 'done', 'cancelled')),
  completed_at TEXT,                             -- لحظهٔ رسیدن به done
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_followups_status   ON followups(status, due_at);
CREATE INDEX IF NOT EXISTS idx_followups_assignee ON followups(assignee_id, status);
CREATE INDEX IF NOT EXISTS idx_followups_entity   ON followups(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_followups_student  ON followups(student_id);

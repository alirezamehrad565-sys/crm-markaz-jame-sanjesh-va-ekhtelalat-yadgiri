-- مایگریشن اسکیما D1 — کمیسیون
-- سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
-- ─────────────────────────────────────────────────────────────
--: کمیسیون — جلسات و مصوبات کمیسیون روی پروندهٔ ارزیابی
-- نقشهٔ راه §۱۲.۶ ردیف ۲۰ (committee):
-- * committee_meetings: جلسهٔ کمیسیون مرکز — planned/held/cancelled
-- * committee_items: مصوبه/مورد طرح‌شده برای هر دانش‌آموز + تصمیم
-- * هر دو بدون CHECK در SQL (الگوی D7) — enum در constants + Zod
-- * حذف فقط نرم (deleted_at — §28)؛ هیچ حذف فیزیکی نیست
-- * اتصال تایم‌لاین دانش‌آموز از مسیر audit_log می‌خواند (Projection — §4)
-- و مالک جدول تازه‌ای نمی‌سازد
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS committee_meetings (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,                        -- عنوان جلسه (مثلاً «کمیسیون مهر ۱۴۰۵»)
  meeting_date TEXT NOT NULL,                        -- YYYY-MM-DD میلادی (نرمال همان performed_at ارزیابی)
  status       TEXT NOT NULL DEFAULT 'planned',      -- planned/held/cancelled — ماتریس در pure.ts
  summary      TEXT,                                 -- خلاصهٔ جلسه (اختیاری — بعد از برگزاری)
  created_by   TEXT NOT NULL REFERENCES staff(id),
  deleted_at   TEXT,                                 -- soft delete (§28)
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_committee_meetings_date ON committee_meetings(meeting_date, deleted_at);
CREATE INDEX IF NOT EXISTS idx_committee_meetings_status ON committee_meetings(status, deleted_at);

CREATE TABLE IF NOT EXISTS committee_items (
  id              TEXT PRIMARY KEY,
  meeting_id      TEXT NOT NULL REFERENCES committee_meetings(id),
  student_id      TEXT NOT NULL REFERENCES students(id),
  assessment_id   TEXT REFERENCES assessments(id),   -- پروندهٔ ارزیابی مرتبط (اختیاری)
  topic           TEXT NOT NULL,                     -- موضوع طرح‌شده (مثلاً «تعیین تکلیف ادامهٔ جلسات»)
  decision        TEXT,                              -- متن تصمیم (اختیاری تا لحظهٔ مصوبه)
  decision_status TEXT NOT NULL DEFAULT 'pending',   -- pending/approved/rejected/deferred — ماتریس در pure.ts
  created_by      TEXT NOT NULL REFERENCES staff(id),
  deleted_at      TEXT,                              -- soft delete (§28)
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_committee_items_meeting ON committee_items(meeting_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_committee_items_student ON committee_items(student_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_committee_items_decision ON committee_items(decision_status, deleted_at);

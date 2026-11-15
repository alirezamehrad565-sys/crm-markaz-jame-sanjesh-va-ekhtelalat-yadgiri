-- 0114 — فاز B: هستهٔ هم‌گامی دوسویه instance-sync (docs/rust/server-cloud-update-design.md §۲-۴)
-- قرار مأموریت SB2 (D1-clean): مایگریشن فقط-افزودنی با سه جزء — بدون هیچ trigger و بدون تراکنش
-- دستی (قاعدهٔ مخزن: گیت scripts/check-d1-compat.mjs ①/⑬ — D1 هر /query را batch اجرا می‌کند و
-- بدنهٔ چنددستوری trigger با جداکنندهٔ «;» در قطعه‌بندی همان‌جا می‌شکند):
--   ① سه جدول bookkeeping سینک: _sync_deleted (تومب‌استون حذف‌ها با pk کانونی '|') · _sync_conflicts
--      (دفتر داوری — «هیچ ردیفی بی‌سروصدا نمی‌افتد»: هر رقابت بازنده با payload کامل ثبت می‌شود) ·
--      _sync_state (cursor هر جدول به‌ازای هر نمونه؛ pull_cursor/push_cursor = JSON {rows, deleted}).
--   ② ستون updated_at برای جداول دامنهٔ فاقد + پسافت COALESCE(created_at, '2026-11-15T00:00:00.000Z').
--   ③ بذر cursor اپوک برای همهٔ جداول دامنه (پیش‌فرض نقطهٔ شروع pull/push هر نمونه؛ فهرست دامنه =
--      خروجی همین مولد — هم‌منبع با SYNC_TABLES در src/application/instance-sync/tables.ts).
-- انحراف مستند از §۲-۴ (SB2): triggerهای مُهر/تومب‌استون (۶۰ جدول × ۳) از مایگریشن خارج شدند —
-- ابر بدون trigger کار می‌کند: سرویس‌ها مُهر را خودشان در SQL می‌نویسند (updated_at = datetime('now')
-- و حذف نرم = deleted_at + updated_at — الگوی src/domain/finance/service.ts)؛ حذف نرمِ دارای
-- deleted_at خودش از pull بیرون می‌آید و helper تومب‌استون فقط برای DELETEهای سخت است.
-- نسخهٔ فقط-میزِ همان triggerها در scripts/engine/local-triggers.sql است؛ بوت موتور محلی
-- (scripts/engine/engine.mjs) پس از مایگریشن‌ها آن را best-effort اعمال می‌کند — باندل ورکر و
-- استقرار ابری (schema.sql/cf_deploy که فقط migrations/ را می‌بلعد) هرگز آن را نمی‌بینند.
-- دود رفتاری هر دو حالت (با و بدون trigger): scripts/smoke-instance-sync.mjs.
-- قاعدهٔ داوری (تصمیم کارفرما ۱۴۰۴/۰۸/۲۴): first-write-wins با داور زمانی — پیاده‌سازی در
-- src/application/instance-sync/winner.ts؛ این مایگریشن فقط زیرساخت bookkeeping است.
-- فقط-افزودنی (additive-only)؛ بدون CHECK (الگوی D7)؛ باز-اجرای کل فایل در ALTER TABLE متوقف
-- می‌شود (SQLite شکل IF NOT EXISTS برای ADD COLUMN ندارد) — دود آن در scripts/smoke-instance-sync.mjs.
-- مُهرها ISO با میلی‌ثانیه (strftime %f + Z) تا مقایسهٔ رشته‌ای = مقایسهٔ زمانی باشد.

CREATE TABLE IF NOT EXISTS _sync_deleted (
  table_name TEXT NOT NULL,             -- جدول دامنهٔ مبدأ
  pk         TEXT NOT NULL,             -- pk کانونی: مقادیر pk (چندستونی با '|')
  deleted_at TEXT NOT NULL,             -- مُهر حذف — مبنای داوری تومب‌استون↔ردیف
  device_id  TEXT,                      -- نمونهٔ حذف‌کننده (NULL = خود این نمونه با helper/حذف نرم)
  PRIMARY KEY (table_name, pk)
);

CREATE TABLE IF NOT EXISTS _sync_conflicts (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name         TEXT NOT NULL,
  pk                 TEXT NOT NULL,
  winner_side        TEXT NOT NULL,     -- local | remote | tombstone | row
  winner_updated_at  TEXT,
  loser_updated_at   TEXT,
  resolved_at        TEXT NOT NULL,     -- مُهر لحظهٔ داوری سمت گیرنده
  detail             TEXT,              -- JSON زمینهٔ داوری (rule و دلیل)
  loser_payload      TEXT,              -- JSON کامل ردیف بازنده (سقف ۶۴KB با نشان برش در سرویس)
  device_id          TEXT               -- نمونهٔ فرستندهٔ payload
);

CREATE TABLE IF NOT EXISTS _sync_state (
  table_name  TEXT PRIMARY KEY,
  pull_cursor TEXT NOT NULL,            -- JSON {rows, deleted} — آخرین مُهرِ تحویل‌شده به نمونهٔ همتا
  push_cursor TEXT NOT NULL             -- JSON {rows, deleted} — آخرین مُهرِ فرستاده‌شده از این نمونه
);

ALTER TABLE appointment_students ADD COLUMN updated_at TEXT; -- فاز B: مُهر هم‌گامی دوسویه
UPDATE appointment_students SET updated_at = '2026-11-15T00:00:00.000Z' WHERE updated_at IS NULL; -- جدول created_at ندارد
ALTER TABLE bug_reports ADD COLUMN updated_at TEXT; -- فاز B: مُهر هم‌گامی دوسویه
UPDATE bug_reports SET updated_at = COALESCE(created_at, '2026-11-15T00:00:00.000Z') WHERE updated_at IS NULL;
ALTER TABLE classes ADD COLUMN updated_at TEXT; -- فاز B: مُهر هم‌گامی دوسویه
UPDATE classes SET updated_at = COALESCE(created_at, '2026-11-15T00:00:00.000Z') WHERE updated_at IS NULL;
ALTER TABLE clearbook_entry_tags ADD COLUMN updated_at TEXT; -- فاز B: مُهر هم‌گامی دوسویه
UPDATE clearbook_entry_tags SET updated_at = '2026-11-15T00:00:00.000Z' WHERE updated_at IS NULL; -- جدول created_at ندارد
ALTER TABLE day_notes ADD COLUMN updated_at TEXT; -- فاز B: مُهر هم‌گامی دوسویه
UPDATE day_notes SET updated_at = COALESCE(created_at, '2026-11-15T00:00:00.000Z') WHERE updated_at IS NULL;
ALTER TABLE document_requests ADD COLUMN updated_at TEXT; -- فاز B: مُهر هم‌گامی دوسویه
UPDATE document_requests SET updated_at = COALESCE(created_at, '2026-11-15T00:00:00.000Z') WHERE updated_at IS NULL;
ALTER TABLE exercise_assignments ADD COLUMN updated_at TEXT; -- فاز B: مُهر هم‌گامی دوسویه
UPDATE exercise_assignments SET updated_at = COALESCE(created_at, '2026-11-15T00:00:00.000Z') WHERE updated_at IS NULL;
ALTER TABLE exercise_batches ADD COLUMN updated_at TEXT; -- فاز B: مُهر هم‌گامی دوسویه
UPDATE exercise_batches SET updated_at = COALESCE(created_at, '2026-11-15T00:00:00.000Z') WHERE updated_at IS NULL;
ALTER TABLE exercise_focus_links ADD COLUMN updated_at TEXT; -- فاز B: مُهر هم‌گامی دوسویه
UPDATE exercise_focus_links SET updated_at = COALESCE(created_at, '2026-11-15T00:00:00.000Z') WHERE updated_at IS NULL;
ALTER TABLE exercise_package_items ADD COLUMN updated_at TEXT; -- فاز B: مُهر هم‌گامی دوسویه
UPDATE exercise_package_items SET updated_at = '2026-11-15T00:00:00.000Z' WHERE updated_at IS NULL; -- جدول created_at ندارد
ALTER TABLE exercise_package_tags ADD COLUMN updated_at TEXT; -- فاز B: مُهر هم‌گامی دوسویه
UPDATE exercise_package_tags SET updated_at = '2026-11-15T00:00:00.000Z' WHERE updated_at IS NULL; -- جدول created_at ندارد
ALTER TABLE exercise_submissions ADD COLUMN updated_at TEXT; -- فاز B: مُهر هم‌گامی دوسویه
UPDATE exercise_submissions SET updated_at = COALESCE(created_at, '2026-11-15T00:00:00.000Z') WHERE updated_at IS NULL;
ALTER TABLE exercise_tags ADD COLUMN updated_at TEXT; -- فاز B: مُهر هم‌گامی دوسویه
UPDATE exercise_tags SET updated_at = '2026-11-15T00:00:00.000Z' WHERE updated_at IS NULL; -- جدول created_at ندارد
ALTER TABLE game_adherence ADD COLUMN updated_at TEXT; -- فاز B: مُهر هم‌گامی دوسویه
UPDATE game_adherence SET updated_at = '2026-11-15T00:00:00.000Z' WHERE updated_at IS NULL; -- جدول created_at ندارد
ALTER TABLE game_attempts ADD COLUMN updated_at TEXT; -- فاز B: مُهر هم‌گامی دوسویه
UPDATE game_attempts SET updated_at = COALESCE(created_at, '2026-11-15T00:00:00.000Z') WHERE updated_at IS NULL;
ALTER TABLE game_goals ADD COLUMN updated_at TEXT; -- فاز B: مُهر هم‌گامی دوسویه
UPDATE game_goals SET updated_at = '2026-11-15T00:00:00.000Z' WHERE updated_at IS NULL; -- جدول created_at ندارد
ALTER TABLE game_links ADD COLUMN updated_at TEXT; -- فاز B: مُهر هم‌گامی دوسویه
UPDATE game_links SET updated_at = COALESCE(created_at, '2026-11-15T00:00:00.000Z') WHERE updated_at IS NULL;
ALTER TABLE game_metrics ADD COLUMN updated_at TEXT; -- فاز B: مُهر هم‌گامی دوسویه
UPDATE game_metrics SET updated_at = '2026-11-15T00:00:00.000Z' WHERE updated_at IS NULL; -- جدول created_at ندارد
ALTER TABLE game_missions ADD COLUMN updated_at TEXT; -- فاز B: مُهر هم‌گامی دوسویه
UPDATE game_missions SET updated_at = COALESCE(created_at, '2026-11-15T00:00:00.000Z') WHERE updated_at IS NULL;
ALTER TABLE ot_progress ADD COLUMN updated_at TEXT; -- فاز B: مُهر هم‌گامی دوسویه
UPDATE ot_progress SET updated_at = COALESCE(created_at, '2026-11-15T00:00:00.000Z') WHERE updated_at IS NULL;
ALTER TABLE ot_skills ADD COLUMN updated_at TEXT; -- فاز B: مُهر هم‌گامی دوسویه
UPDATE ot_skills SET updated_at = '2026-11-15T00:00:00.000Z' WHERE updated_at IS NULL; -- جدول created_at ندارد
ALTER TABLE schools ADD COLUMN updated_at TEXT; -- فاز B: مُهر هم‌گامی دوسویه
UPDATE schools SET updated_at = '2026-11-15T00:00:00.000Z' WHERE updated_at IS NULL; -- جدول created_at ندارد
ALTER TABLE staff ADD COLUMN updated_at TEXT; -- فاز B: مُهر هم‌گامی دوسویه
UPDATE staff SET updated_at = COALESCE(created_at, '2026-11-15T00:00:00.000Z') WHERE updated_at IS NULL;
ALTER TABLE student_education_history ADD COLUMN updated_at TEXT; -- فاز B: مُهر هم‌گامی دوسویه
UPDATE student_education_history SET updated_at = COALESCE(created_at, '2026-11-15T00:00:00.000Z') WHERE updated_at IS NULL;
ALTER TABLE student_focus_links ADD COLUMN updated_at TEXT; -- فاز B: مُهر هم‌گامی دوسویه
UPDATE student_focus_links SET updated_at = COALESCE(created_at, '2026-11-15T00:00:00.000Z') WHERE updated_at IS NULL;
ALTER TABLE student_tags ADD COLUMN updated_at TEXT; -- فاز B: مُهر هم‌گامی دوسویه
UPDATE student_tags SET updated_at = COALESCE(created_at, '2026-11-15T00:00:00.000Z') WHERE updated_at IS NULL;
ALTER TABLE student_teachers ADD COLUMN updated_at TEXT; -- فاز B: مُهر هم‌گامی دوسویه
UPDATE student_teachers SET updated_at = COALESCE(created_at, '2026-11-15T00:00:00.000Z') WHERE updated_at IS NULL;
ALTER TABLE students ADD COLUMN updated_at TEXT; -- فاز B: مُهر هم‌گامی دوسویه
UPDATE students SET updated_at = COALESCE(created_at, '2026-11-15T00:00:00.000Z') WHERE updated_at IS NULL;
ALTER TABLE tags ADD COLUMN updated_at TEXT; -- فاز B: مُهر هم‌گامی دوسویه
UPDATE tags SET updated_at = COALESCE(created_at, '2026-11-15T00:00:00.000Z') WHERE updated_at IS NULL;

-- بذر cursor اپوک برای همهٔ جداول دامنه (پیش‌فرض نقطهٔ شروع pull/push هر نمونه)
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('announcements', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('appointment_students', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('appointments', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('assessments', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('bug_reports', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('case_event_types', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('case_events', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('classes', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('clearbook_entries', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('clearbook_entry_tags', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('clearbook_plans', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('committee_items', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('committee_meetings', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('content_score_report', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('day_notes', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('docs', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('document_requests', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('exercise_assignments', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('exercise_batches', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('exercise_focus_links', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('exercise_package_items', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('exercise_package_tags', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('exercise_packages', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('exercise_submissions', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('exercise_tags', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('exercises', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('finance_budgets', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('finance_donations', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('finance_invoices', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('followups', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('game_adherence', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('game_attempts', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('game_goals', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('game_links', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('game_metrics', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('game_missions', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('game_packages', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('game_prescriptions', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('intervention_paths', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('knowledge_items', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('network_content', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('notification_prefs', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('ot_progress', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('ot_skills', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('pathway_probes', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('pathway_sessions', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('pathway_templates', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('schools', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('screening_entries', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('staff', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('staff_attendance', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('student_education_history', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('student_focus_links', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('student_tags', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('student_teachers', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('students', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('tags', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('todos', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('waitlist', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');
INSERT OR IGNORE INTO _sync_state (table_name, pull_cursor, push_cursor) VALUES ('working_hours', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}', '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}');

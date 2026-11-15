-- 0114 — فاز B: هستهٔ هم‌گامی دوسویه instance-sync (docs/rust/server-cloud-update-design.md §۲-۴)
-- قرار مأموریت SB (هم‌گامی دو نمونهٔ هم‌schema: ابر D1 ↔ موتور محلی میز). سه جزء:
--   ① سه جدول bookkeeping سینک: _sync_deleted (تومب‌استون حذف‌ها) · _sync_conflicts (دفتر داوری —
--      «هیچ ردیفی بی‌سروصدا نمی‌افتد»: هر رقابت بازنده در این جدول با payload کامل ثبت می‌شود) ·
--      _sync_state (cursor هر جدول به‌ازای هر نمونه؛ pull_cursor/push_cursor = JSON {rows, deleted}).
--   ② ستون updated_at برای جداول دامنهٔ فاقد + پسافت COALESCE(created_at, '2026-11-15T00:00:00.000Z').
--   ③ سه trigger برای همهٔ جداول دامنه (فهرست دامنه = خروجی مولد scripts/gen-instance-sync-migration.mjs؛
--      هم‌منبع با SYNC_TABLES در src/application/instance-sync/tables.ts):
--        INSERT  WHEN NEW.updated_at IS NULL → مُهر اکنون (نویسندهٔ سینک که مُهر می‌آورد دست‌نخورده)؛
--        UPDATE  WHEN NEW.updated_at IS OLD.updated_at → مُهر اکنون (نویسندهٔ دستیِ بدون مُهر مُهر می‌گیرد؛
--                نویسنده‌ای که updated_at را صریح می‌فرستد — یعنی مسیر سینک — حفظ می‌شود)؛
--        DELETE  → تومب‌استون با pk کانونی (مقادیر pk چندستونی با '|').
-- قاعدهٔ داوری (تصمیم کارفرما ۱۴۰۴/۰۸/۲۴): first-write-wins با داور زمانی — پیاده‌سازی در
-- src/application/instance-sync/winner.ts؛ این مایگریشن فقط زیرساخت مُهر/تومب‌استون است.
-- فقط-افزودنی (additive-only)؛ بدون CHECK (الگوی D7)؛ باز-اجرای کل فایل در ALTER TABLE متوقف
-- می‌شود (SQLite شکل IF NOT EXISTS برای ADD COLUMN ندارد) — دود آن در scripts/smoke-instance-sync.mjs.
-- مُهرها ISO با میلی‌ثانیه (strftime %f + Z) تا مقایسهٔ رشته‌ای = مقایسهٔ زمانی باشد.

CREATE TABLE IF NOT EXISTS _sync_deleted (
  table_name TEXT NOT NULL,             -- جدول دامنهٔ مبدأ
  pk         TEXT NOT NULL,             -- pk کانونی: مقادیر pk (چندستونی با '|')
  deleted_at TEXT NOT NULL,             -- مُهر حذف — مبنای داوری تومب‌استون↔ردیف
  device_id  TEXT,                      -- نمونهٔ حذف‌کننده (trigger خود DB مقدار نمی‌داند → NULL)
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

CREATE TRIGGER IF NOT EXISTS trg_is_announcements_ins AFTER INSERT ON announcements
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE announcements SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_announcements_upd AFTER UPDATE ON announcements
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE announcements SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_announcements_del AFTER DELETE ON announcements
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('announcements', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_appointment_students_ins AFTER INSERT ON appointment_students
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE appointment_students SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_appointment_students_upd AFTER UPDATE ON appointment_students
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE appointment_students SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_appointment_students_del AFTER DELETE ON appointment_students
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('appointment_students', CAST(OLD.appointment_id AS TEXT) || '|' || CAST(OLD.student_id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_appointments_ins AFTER INSERT ON appointments
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE appointments SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_appointments_upd AFTER UPDATE ON appointments
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE appointments SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_appointments_del AFTER DELETE ON appointments
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('appointments', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_assessments_ins AFTER INSERT ON assessments
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE assessments SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_assessments_upd AFTER UPDATE ON assessments
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE assessments SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_assessments_del AFTER DELETE ON assessments
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('assessments', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_bug_reports_ins AFTER INSERT ON bug_reports
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE bug_reports SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_bug_reports_upd AFTER UPDATE ON bug_reports
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE bug_reports SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_bug_reports_del AFTER DELETE ON bug_reports
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('bug_reports', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_case_event_types_ins AFTER INSERT ON case_event_types
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE case_event_types SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_case_event_types_upd AFTER UPDATE ON case_event_types
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE case_event_types SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_case_event_types_del AFTER DELETE ON case_event_types
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('case_event_types', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_case_events_ins AFTER INSERT ON case_events
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE case_events SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_case_events_upd AFTER UPDATE ON case_events
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE case_events SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_case_events_del AFTER DELETE ON case_events
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('case_events', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_classes_ins AFTER INSERT ON classes
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE classes SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_classes_upd AFTER UPDATE ON classes
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE classes SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_classes_del AFTER DELETE ON classes
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('classes', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_clearbook_entries_ins AFTER INSERT ON clearbook_entries
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE clearbook_entries SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_clearbook_entries_upd AFTER UPDATE ON clearbook_entries
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE clearbook_entries SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_clearbook_entries_del AFTER DELETE ON clearbook_entries
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('clearbook_entries', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_clearbook_entry_tags_ins AFTER INSERT ON clearbook_entry_tags
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE clearbook_entry_tags SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_clearbook_entry_tags_upd AFTER UPDATE ON clearbook_entry_tags
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE clearbook_entry_tags SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_clearbook_entry_tags_del AFTER DELETE ON clearbook_entry_tags
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('clearbook_entry_tags', CAST(OLD.entry_id AS TEXT) || '|' || CAST(OLD.tag AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_clearbook_plans_ins AFTER INSERT ON clearbook_plans
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE clearbook_plans SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_clearbook_plans_upd AFTER UPDATE ON clearbook_plans
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE clearbook_plans SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_clearbook_plans_del AFTER DELETE ON clearbook_plans
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('clearbook_plans', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_committee_items_ins AFTER INSERT ON committee_items
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE committee_items SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_committee_items_upd AFTER UPDATE ON committee_items
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE committee_items SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_committee_items_del AFTER DELETE ON committee_items
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('committee_items', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_committee_meetings_ins AFTER INSERT ON committee_meetings
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE committee_meetings SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_committee_meetings_upd AFTER UPDATE ON committee_meetings
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE committee_meetings SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_committee_meetings_del AFTER DELETE ON committee_meetings
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('committee_meetings', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_content_score_report_ins AFTER INSERT ON content_score_report
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE content_score_report SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_content_score_report_upd AFTER UPDATE ON content_score_report
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE content_score_report SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_content_score_report_del AFTER DELETE ON content_score_report
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('content_score_report', CAST(OLD.source_table AS TEXT) || '|' || CAST(OLD.source_id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_day_notes_ins AFTER INSERT ON day_notes
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE day_notes SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_day_notes_upd AFTER UPDATE ON day_notes
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE day_notes SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_day_notes_del AFTER DELETE ON day_notes
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('day_notes', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_docs_ins AFTER INSERT ON docs
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE docs SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_docs_upd AFTER UPDATE ON docs
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE docs SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_docs_del AFTER DELETE ON docs
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('docs', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_document_requests_ins AFTER INSERT ON document_requests
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE document_requests SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_document_requests_upd AFTER UPDATE ON document_requests
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE document_requests SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_document_requests_del AFTER DELETE ON document_requests
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('document_requests', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_exercise_assignments_ins AFTER INSERT ON exercise_assignments
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE exercise_assignments SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_exercise_assignments_upd AFTER UPDATE ON exercise_assignments
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE exercise_assignments SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_exercise_assignments_del AFTER DELETE ON exercise_assignments
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('exercise_assignments', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_exercise_batches_ins AFTER INSERT ON exercise_batches
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE exercise_batches SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_exercise_batches_upd AFTER UPDATE ON exercise_batches
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE exercise_batches SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_exercise_batches_del AFTER DELETE ON exercise_batches
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('exercise_batches', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_exercise_focus_links_ins AFTER INSERT ON exercise_focus_links
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE exercise_focus_links SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_exercise_focus_links_upd AFTER UPDATE ON exercise_focus_links
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE exercise_focus_links SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_exercise_focus_links_del AFTER DELETE ON exercise_focus_links
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('exercise_focus_links', CAST(OLD.exercise_id AS TEXT) || '|' || CAST(OLD.focus_key AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_exercise_package_items_ins AFTER INSERT ON exercise_package_items
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE exercise_package_items SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_exercise_package_items_upd AFTER UPDATE ON exercise_package_items
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE exercise_package_items SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_exercise_package_items_del AFTER DELETE ON exercise_package_items
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('exercise_package_items', CAST(OLD.package_id AS TEXT) || '|' || CAST(OLD.exercise_id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_exercise_package_tags_ins AFTER INSERT ON exercise_package_tags
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE exercise_package_tags SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_exercise_package_tags_upd AFTER UPDATE ON exercise_package_tags
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE exercise_package_tags SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_exercise_package_tags_del AFTER DELETE ON exercise_package_tags
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('exercise_package_tags', CAST(OLD.package_id AS TEXT) || '|' || CAST(OLD.tag_id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_exercise_packages_ins AFTER INSERT ON exercise_packages
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE exercise_packages SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_exercise_packages_upd AFTER UPDATE ON exercise_packages
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE exercise_packages SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_exercise_packages_del AFTER DELETE ON exercise_packages
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('exercise_packages', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_exercise_submissions_ins AFTER INSERT ON exercise_submissions
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE exercise_submissions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_exercise_submissions_upd AFTER UPDATE ON exercise_submissions
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE exercise_submissions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_exercise_submissions_del AFTER DELETE ON exercise_submissions
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('exercise_submissions', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_exercise_tags_ins AFTER INSERT ON exercise_tags
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE exercise_tags SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_exercise_tags_upd AFTER UPDATE ON exercise_tags
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE exercise_tags SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_exercise_tags_del AFTER DELETE ON exercise_tags
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('exercise_tags', CAST(OLD.exercise_id AS TEXT) || '|' || CAST(OLD.tag_id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_exercises_ins AFTER INSERT ON exercises
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE exercises SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_exercises_upd AFTER UPDATE ON exercises
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE exercises SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_exercises_del AFTER DELETE ON exercises
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('exercises', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_finance_budgets_ins AFTER INSERT ON finance_budgets
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE finance_budgets SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_finance_budgets_upd AFTER UPDATE ON finance_budgets
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE finance_budgets SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_finance_budgets_del AFTER DELETE ON finance_budgets
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('finance_budgets', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_finance_donations_ins AFTER INSERT ON finance_donations
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE finance_donations SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_finance_donations_upd AFTER UPDATE ON finance_donations
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE finance_donations SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_finance_donations_del AFTER DELETE ON finance_donations
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('finance_donations', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_finance_invoices_ins AFTER INSERT ON finance_invoices
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE finance_invoices SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_finance_invoices_upd AFTER UPDATE ON finance_invoices
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE finance_invoices SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_finance_invoices_del AFTER DELETE ON finance_invoices
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('finance_invoices', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_followups_ins AFTER INSERT ON followups
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE followups SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_followups_upd AFTER UPDATE ON followups
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE followups SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_followups_del AFTER DELETE ON followups
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('followups', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_game_adherence_ins AFTER INSERT ON game_adherence
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE game_adherence SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_game_adherence_upd AFTER UPDATE ON game_adherence
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE game_adherence SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_game_adherence_del AFTER DELETE ON game_adherence
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('game_adherence', CAST(OLD.mission_id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_game_attempts_ins AFTER INSERT ON game_attempts
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE game_attempts SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_game_attempts_upd AFTER UPDATE ON game_attempts
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE game_attempts SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_game_attempts_del AFTER DELETE ON game_attempts
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('game_attempts', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_game_goals_ins AFTER INSERT ON game_goals
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE game_goals SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_game_goals_upd AFTER UPDATE ON game_goals
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE game_goals SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_game_goals_del AFTER DELETE ON game_goals
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('game_goals', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_game_links_ins AFTER INSERT ON game_links
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE game_links SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_game_links_upd AFTER UPDATE ON game_links
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE game_links SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_game_links_del AFTER DELETE ON game_links
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('game_links', CAST(OLD.jti AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_game_metrics_ins AFTER INSERT ON game_metrics
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE game_metrics SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_game_metrics_upd AFTER UPDATE ON game_metrics
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE game_metrics SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_game_metrics_del AFTER DELETE ON game_metrics
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('game_metrics', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_game_missions_ins AFTER INSERT ON game_missions
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE game_missions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_game_missions_upd AFTER UPDATE ON game_missions
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE game_missions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_game_missions_del AFTER DELETE ON game_missions
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('game_missions', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_game_packages_ins AFTER INSERT ON game_packages
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE game_packages SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_game_packages_upd AFTER UPDATE ON game_packages
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE game_packages SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_game_packages_del AFTER DELETE ON game_packages
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('game_packages', CAST(OLD.id AS TEXT) || '|' || CAST(OLD.version AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_game_prescriptions_ins AFTER INSERT ON game_prescriptions
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE game_prescriptions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_game_prescriptions_upd AFTER UPDATE ON game_prescriptions
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE game_prescriptions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_game_prescriptions_del AFTER DELETE ON game_prescriptions
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('game_prescriptions', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_intervention_paths_ins AFTER INSERT ON intervention_paths
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE intervention_paths SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_intervention_paths_upd AFTER UPDATE ON intervention_paths
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE intervention_paths SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_intervention_paths_del AFTER DELETE ON intervention_paths
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('intervention_paths', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_knowledge_items_ins AFTER INSERT ON knowledge_items
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE knowledge_items SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_knowledge_items_upd AFTER UPDATE ON knowledge_items
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE knowledge_items SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_knowledge_items_del AFTER DELETE ON knowledge_items
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('knowledge_items', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_network_content_ins AFTER INSERT ON network_content
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE network_content SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_network_content_upd AFTER UPDATE ON network_content
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE network_content SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_network_content_del AFTER DELETE ON network_content
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('network_content', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_notification_prefs_ins AFTER INSERT ON notification_prefs
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE notification_prefs SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_notification_prefs_upd AFTER UPDATE ON notification_prefs
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE notification_prefs SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_notification_prefs_del AFTER DELETE ON notification_prefs
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('notification_prefs', CAST(OLD.student_id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_ot_progress_ins AFTER INSERT ON ot_progress
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE ot_progress SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_ot_progress_upd AFTER UPDATE ON ot_progress
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE ot_progress SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_ot_progress_del AFTER DELETE ON ot_progress
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('ot_progress', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_ot_skills_ins AFTER INSERT ON ot_skills
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE ot_skills SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_ot_skills_upd AFTER UPDATE ON ot_skills
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE ot_skills SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_ot_skills_del AFTER DELETE ON ot_skills
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('ot_skills', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_pathway_probes_ins AFTER INSERT ON pathway_probes
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE pathway_probes SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_pathway_probes_upd AFTER UPDATE ON pathway_probes
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE pathway_probes SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_pathway_probes_del AFTER DELETE ON pathway_probes
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('pathway_probes', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_pathway_sessions_ins AFTER INSERT ON pathway_sessions
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE pathway_sessions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_pathway_sessions_upd AFTER UPDATE ON pathway_sessions
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE pathway_sessions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_pathway_sessions_del AFTER DELETE ON pathway_sessions
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('pathway_sessions', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_pathway_templates_ins AFTER INSERT ON pathway_templates
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE pathway_templates SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_pathway_templates_upd AFTER UPDATE ON pathway_templates
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE pathway_templates SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_pathway_templates_del AFTER DELETE ON pathway_templates
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('pathway_templates', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_schools_ins AFTER INSERT ON schools
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE schools SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_schools_upd AFTER UPDATE ON schools
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE schools SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_schools_del AFTER DELETE ON schools
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('schools', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_screening_entries_ins AFTER INSERT ON screening_entries
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE screening_entries SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_screening_entries_upd AFTER UPDATE ON screening_entries
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE screening_entries SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_screening_entries_del AFTER DELETE ON screening_entries
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('screening_entries', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_staff_ins AFTER INSERT ON staff
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE staff SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_staff_upd AFTER UPDATE ON staff
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE staff SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_staff_del AFTER DELETE ON staff
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('staff', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_staff_attendance_ins AFTER INSERT ON staff_attendance
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE staff_attendance SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_staff_attendance_upd AFTER UPDATE ON staff_attendance
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE staff_attendance SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_staff_attendance_del AFTER DELETE ON staff_attendance
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('staff_attendance', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_student_education_history_ins AFTER INSERT ON student_education_history
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE student_education_history SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_student_education_history_upd AFTER UPDATE ON student_education_history
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE student_education_history SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_student_education_history_del AFTER DELETE ON student_education_history
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('student_education_history', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_student_focus_links_ins AFTER INSERT ON student_focus_links
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE student_focus_links SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_student_focus_links_upd AFTER UPDATE ON student_focus_links
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE student_focus_links SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_student_focus_links_del AFTER DELETE ON student_focus_links
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('student_focus_links', CAST(OLD.student_id AS TEXT) || '|' || CAST(OLD.focus_key AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_student_tags_ins AFTER INSERT ON student_tags
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE student_tags SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_student_tags_upd AFTER UPDATE ON student_tags
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE student_tags SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_student_tags_del AFTER DELETE ON student_tags
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('student_tags', CAST(OLD.student_id AS TEXT) || '|' || CAST(OLD.tag_id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_student_teachers_ins AFTER INSERT ON student_teachers
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE student_teachers SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_student_teachers_upd AFTER UPDATE ON student_teachers
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE student_teachers SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_student_teachers_del AFTER DELETE ON student_teachers
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('student_teachers', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_students_ins AFTER INSERT ON students
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE students SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_students_upd AFTER UPDATE ON students
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE students SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_students_del AFTER DELETE ON students
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('students', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_tags_ins AFTER INSERT ON tags
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE tags SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_tags_upd AFTER UPDATE ON tags
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE tags SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_tags_del AFTER DELETE ON tags
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('tags', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_todos_ins AFTER INSERT ON todos
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE todos SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_todos_upd AFTER UPDATE ON todos
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE todos SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_todos_del AFTER DELETE ON todos
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('todos', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_waitlist_ins AFTER INSERT ON waitlist
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE waitlist SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_waitlist_upd AFTER UPDATE ON waitlist
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE waitlist SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_waitlist_del AFTER DELETE ON waitlist
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('waitlist', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_is_working_hours_ins AFTER INSERT ON working_hours
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE working_hours SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_working_hours_upd AFTER UPDATE ON working_hours
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE working_hours SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER IF NOT EXISTS trg_is_working_hours_del AFTER DELETE ON working_hours
BEGIN
  INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id)
  VALUES ('working_hours', CAST(OLD.id AS TEXT), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at;
END;

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

-- مایگریشن اسکیما D1 — تنظیمات و اتصال همکاران
-- سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
-- migrations/0004_settings_staff_links.sql
-- — ماژول تنظیمات + اتصال بات کارکنان + اعلان چرخه حیات نوبت
-- قوانین:
-- * settings = key/value با مقدار JSON — مالکیت: application/settings
-- * staff_bot_links همان الگوی bot_links ولی برای کارکنان (معلم‌ها)
-- * staff.notify_enabled = کلید اصلی دریافت اعلان چرخه حیات برای کارمند
-- ────────────────────────────────────────────────────────────

-- ───────────── settings (key/value) ─────────────
-- کلیدهای شناخته‌شده (مقدار JSON):
-- center_hours → [{"weekday":0,"startMinute":540,"endMinute":1020}, …]
-- clinic_name → "مرکز جامع"
-- default_reminder_hours → 2
-- notify_on_create → true
-- notify_on_move → true
-- notify_on_cancel → true
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,              -- JSON
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ───────────── staff_bot_links (اتصال بات کارمند) ─────────────
CREATE TABLE IF NOT EXISTS staff_bot_links (
  id         TEXT PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,
  staff_id   TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  chat_id    TEXT,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'linked')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_staff_bot_links_staff ON staff_bot_links(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_bot_links_chat ON staff_bot_links(chat_id);

-- ───────────── staff.notify_enabled ─────────────
ALTER TABLE staff ADD COLUMN notify_enabled INTEGER NOT NULL DEFAULT 1
  CHECK (notify_enabled IN (0, 1));

CREATE TABLE IF NOT EXISTS notifications (
  id             TEXT PRIMARY KEY,
  channel        TEXT NOT NULL CHECK (channel IN ('bale', 'internal')),
  template       TEXT NOT NULL,
  recipient      TEXT,                       -- chat_id مقصد (denormalized برای ارسال)
  student_id     TEXT REFERENCES students(id) ON DELETE SET NULL,
  appointment_id TEXT REFERENCES appointments(id) ON DELETE SET NULL,
  staff_id       TEXT REFERENCES staff(id) ON DELETE SET NULL,
  payload        TEXT NOT NULL DEFAULT '{}', -- JSON: متغیرهای template
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  attempts       INTEGER NOT NULL DEFAULT 0,
  last_error     TEXT,
  dedup_key      TEXT,                       -- idempotency (مثلاً reminder:appt:student)
  sent_at        TEXT,                       -- ISO UTC
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedup
  ON notifications(dedup_key) WHERE dedup_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_student ON notifications(student_id);

CREATE TABLE IF NOT EXISTS notification_prefs (
  student_id            TEXT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  channel               TEXT NOT NULL DEFAULT 'bale' CHECK (channel IN ('bale', 'internal')),
  chat_id               TEXT,               -- مقصد پیام (chat id بله)
  reminders_enabled     INTEGER NOT NULL DEFAULT 1 CHECK (reminders_enabled IN (0, 1)),
  reminder_hours_before INTEGER NOT NULL DEFAULT 2 CHECK (reminder_hours_before BETWEEN 1 AND 48),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bot_links (
  id         TEXT PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  chat_id    TEXT,                           -- پس از لینک شدن پر می‌شود
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'linked')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bot_links_student ON bot_links(student_id);
CREATE INDEX IF NOT EXISTS idx_bot_links_status ON bot_links(status);

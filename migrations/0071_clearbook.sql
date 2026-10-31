-- m188 — کلر بوک مرکز: خط زمانی فعالیت‌ها (عکس/مستند) + تقویم اجرایی سالانه
-- دسترسی: فقط مدیر و منشی (خواندن و نوشتن) — کنترل در لایهٔ routes
-- فایل‌ها با همان ObjectStore پیوست‌های موجود ذخیره می‌شوند (کلید: clearbook/{entryId}/{attId})

-- ─── فازهای تقویم اجرایی (برنامهٔ سالانه مرکز) ───
CREATE TABLE IF NOT EXISTS clearbook_plans (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,                          -- خطیه اجرایی
  admin_actions TEXT NOT NULL DEFAULT '',       -- اقدامات اداری و جلسات (بخشنامه‌ها، توجیهی‌ها)
  center_actions TEXT NOT NULL DEFAULT '',      -- خروجی / اقدام عملیاتی مرکز
  from_date TEXT NOT NULL,                      -- بازهٔ اجرا از (Gregorian YMD)
  to_date TEXT,                                 -- بازهٔ اجرا تا (Gregorian YMD؛ NULL = یک‌روزه)
  status TEXT NOT NULL DEFAULT 'planned',       -- planned | active | done
  tag TEXT,                                     -- برچسب پیشنهادی فعالیت‌های این فاز
  sort_order INTEGER NOT NULL DEFAULT 0,        -- ترتیب دستی در نمای جدول تقویم
  created_by TEXT NOT NULL REFERENCES staff(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_clearbook_plans_from ON clearbook_plans(from_date);

-- ─── رویدادهای خط زمانی (فعالیت‌های انجام‌شده) ───
CREATE TABLE IF NOT EXISTS clearbook_entries (
  id TEXT PRIMARY KEY,
  plan_id TEXT REFERENCES clearbook_plans(id) ON DELETE SET NULL, -- اتصال اختیاری به فاز برنامه
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  event_date TEXT NOT NULL,                     -- تاریخ خودِ رویداد (Gregorian YMD) — جدا از تاریخ ثبت
  created_by TEXT NOT NULL REFERENCES staff(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_clearbook_entries_date ON clearbook_entries(event_date);
CREATE INDEX IF NOT EXISTS idx_clearbook_entries_plan ON clearbook_entries(plan_id);

-- ─── برچسب‌های آزاد رویداد (فیلتر خط زمانی) ───
CREATE TABLE IF NOT EXISTS clearbook_entry_tags (
  entry_id TEXT NOT NULL REFERENCES clearbook_entries(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (entry_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_clearbook_entry_tags_tag ON clearbook_entry_tags(tag);

-- ─── پیوست‌های رویداد (عکس با کپشن اختیاری + سند) ───
CREATE TABLE IF NOT EXISTS clearbook_attachments (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES clearbook_entries(id) ON DELETE CASCADE,
  file_key TEXT NOT NULL,                       -- کلید در ObjectStore
  file_name TEXT NOT NULL,
  file_mime TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  kind TEXT NOT NULL,                           -- image | doc
  caption TEXT,                                 -- کپشن اختیاری عکس
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_clearbook_attachments_entry ON clearbook_attachments(entry_id, created_at);

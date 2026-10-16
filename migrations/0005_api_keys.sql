-- مایگریشن اسکیما D1 — کلیدهای API
-- سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
-- 0005_api_keys.sql — کلیدهای API برای اتصال سرویس‌های خارجی و اتوماسیون
-- امنیت:
-- * مقدار واقعی کلید هرگز ذخیره نمی‌شود — فقط SHA-256 hex (key_hash)
-- * prefix برای نمایش امن و جستجو نگه داشته می‌شود (مثل ck_a1b2c3d4…)
-- * ابطال = active=0 + revoked_at (کلیدهای باطل‌شده هرگز حذف نمی‌شوند — audit trail)

CREATE TABLE IF NOT EXISTS api_keys (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  prefix       TEXT NOT NULL UNIQUE,
  key_hash     TEXT NOT NULL UNIQUE,
  role         TEXT NOT NULL CHECK (role IN ('manager', 'therapist', 'secretary')),
  active       INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  last_used_at TEXT,
  created_by   TEXT NOT NULL REFERENCES staff(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(active);

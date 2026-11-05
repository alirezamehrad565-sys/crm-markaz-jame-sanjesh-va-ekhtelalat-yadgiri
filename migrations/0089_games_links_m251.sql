-- m251-پ — M1 (۱.۲۵.۰۷) بستر بک‌اند بازی: لینک امضاشده و پایبندی
-- امنیت لینک (§۱۱): توکن تصادفی ≥۱۲۸ بیت؛ فقط هش SHA-256 ذخیره می‌شود؛
-- jti برای ابطال فوری؛ انقضا = پایان همان روز و حداکثر ۱۲ ساعت پس از صدور (هر کدام زودتر).

CREATE TABLE IF NOT EXISTS game_links (
  jti        TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES game_missions(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,               -- SHA-256 هگز از بخش رمز توکن؛ رشتهٔ خام هرگز ذخیره نمی‌شود
  issued_by  TEXT NOT NULL REFERENCES staff(id),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_game_links_mission ON game_links(mission_id);

-- تأیید دومضربهٔ پایبندی (§۲): نخستین ضربه confirm1، دومین ضربه confirm2 → بسته‌شدن روز
CREATE TABLE IF NOT EXISTS game_adherence (
  mission_id  TEXT PRIMARY KEY REFERENCES game_missions(id) ON DELETE CASCADE,
  confirm1_at TEXT,
  confirm2_at  TEXT
);

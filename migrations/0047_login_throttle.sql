CREATE TABLE IF NOT EXISTS login_throttle (
  identity     TEXT PRIMARY KEY,          -- username یا کد ملی (lowercase)
  fail_count   INTEGER NOT NULL DEFAULT 0,
  window_start TEXT NOT NULL              -- شروع پنجرهٔ خطا (UTC)
);

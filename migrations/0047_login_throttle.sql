-- مایگریشن اسکیما D1 — تلاش‌محدود ورود
-- سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
-- 0047_login_throttle.sql — بازسازی‌شده از اسکیمای زندهٔ تولید
-- محدودکنندهٔ تلاش ناموفق ورود (per-identity شمارندهٔ پنجره‌ای).
-- اعمال‌شده روی تولید — این نسخه برای محیط‌های تازه است.

CREATE TABLE IF NOT EXISTS login_throttle (
  identity     TEXT PRIMARY KEY,          -- username یا کد ملی (lowercase)
  fail_count   INTEGER NOT NULL DEFAULT 0,
  window_start TEXT NOT NULL              -- شروع پنجرهٔ خطا (UTC)
);

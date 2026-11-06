-- m267 — پیش‌نمایش فقط-پرسنلی (۱.۲۵.۲۰): توکن کوتاه‌عمر برای اجرای آزمایشی بستهٔ منتشرشده
-- ممیزی فاز ۰ §۳.۱۰/U4: پیش‌نمایش هرگز روی صفحهٔ عمومی با کلید پاسخ نیست —
-- توکن جدا از game_links، بدون مأموریت/تجویز/کودک، بدون هیچ نوشتنی در جریان بالینی.
CREATE TABLE IF NOT EXISTS game_preview_tokens (
  jti             TEXT PRIMARY KEY,
  package_id      TEXT NOT NULL,
  package_version TEXT NOT NULL,
  token_hash      TEXT NOT NULL UNIQUE,
  issued_by       TEXT NOT NULL,
  expires_at      TEXT NOT NULL,
  revoked_at      TEXT,
  created_at      TEXT NOT NULL,
  FOREIGN KEY (package_id, package_version) REFERENCES game_packages(id, version)
);

CREATE INDEX IF NOT EXISTS idx_game_preview_tokens_pkg
  ON game_preview_tokens (package_id, package_version);

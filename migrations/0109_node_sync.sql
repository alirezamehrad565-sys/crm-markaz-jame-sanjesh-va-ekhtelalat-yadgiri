-- 0109 — rust-f4: سینک ترکیبی نودهای دسکتاپ (docs/rust/design.md §۵ · docs/rust/phases.md فاز ۴)
-- دسکتاپ میز، یک «نود» در شبکه است با هویت node_code = DESKTOP:<install-id> + node_key
-- (همان اعتماد پیوند دستی CP↔نود؛ ثبت فقط-مدیر). دو جدول فقط-افزودنی:
--   sync_nodes       — رجیستری نودها؛ کلید فقط به شکل هش SHA-256 نگه داشته می‌شود
--                      (همان مکانیزم cp-link: docs/cp-link-key-rotation.md §۱) و plaintext
--                      فقط یک‌بار در پاسخ register/rotate-key برمی‌گردد.
--   node_push_events — رویدادهای push نود (usage_summary / client_errors / health_ping)؛
--                      idempotency با PRIMARY KEY (node_code, id) — همان قرارداد m1.5.
-- بدون CHECK در SQL (الگوی D7 — enum در کد با zod)؛ بدون FK تازه بین جدول‌های تازه؛
-- مالک منطق: src/node-sync/ — سند قرارداد: docs/rust/node-sync.md
-- ممنوعیت ساختاری: دادهٔ بالینی (مراجعان/جلسات/تجویزها/فعالیت بازی فردی) هرگز در این
-- جدول‌ها نمی‌نشیند — فهرست سفید دامنه‌ها هم سمت ورکر و هم سمت کلاینت در کد اعمال می‌شود.

CREATE TABLE IF NOT EXISTS sync_nodes (
  node_code            TEXT PRIMARY KEY,        -- مثل DESKTOP:1a2b3c4d
  label                TEXT,                    -- برچسب فارسی اختیاری برای پنل مدیر
  key_hash             TEXT NOT NULL,           -- SHA-256 hex کلید نود — plaintext هرگز ذخیره نمی‌شود
  key_fingerprint      TEXT NOT NULL,           -- ۱۲ کاراکتر اول هش — تنها چیزی که در لاگ/audit مجاز است
  key_rotated_at       TEXT NOT NULL,           -- زمان آخرین چرخش کلید (ISO UTC)
  active               INTEGER NOT NULL DEFAULT 1,
  last_pull_at         TEXT,                    -- مُهر اطلاعاتی آخرین pull (ISO UTC)
  last_push_attempt_at TEXT,                    -- مُهر تلاش push — گات ۱۵دقیقه‌ای (هم‌الگوی م۱.۵)
  last_push_ok_at      TEXT,                    -- مُهر آخرین push موفق (ISO UTC)
  created_by           TEXT NOT NULL REFERENCES staff(id),
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sync_nodes_active ON sync_nodes(active);

CREATE TABLE IF NOT EXISTS node_push_events (
  node_code   TEXT NOT NULL,
  id          TEXT NOT NULL,                     -- شناسهٔ سمت نود — idempotency با جفت (node_code, id)
  domain      TEXT NOT NULL,                     -- usage_summary | client_errors | health_ping (فهرست سفید در کد)
  payload     TEXT NOT NULL,                     -- JSON اعتبارسنجی‌شده بر حسب دامنه
  occurred_at TEXT,                              -- زمان سمت نود (اختیاری؛ ساعت نود قابل‌اعتماد نیست)
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (node_code, id)
);
CREATE INDEX IF NOT EXISTS idx_node_push_events_received ON node_push_events(domain, received_at);
CREATE INDEX IF NOT EXISTS idx_node_push_events_node ON node_push_events(node_code, received_at);

-- 0110 — rust-f9: صندوق ورودی سینک نود دسکتاپ (docs/rust/design.md §۵ · docs/rust/node-sync.md)
-- آینهٔ node_push_events سمت ابر (0109) در جهت مخالف: آیتم‌هایی که میز از ابر pull می‌کند
-- اینجا (در D1 موتور محلی) انبار می‌شوند تا مصرف‌کننده‌های محلی بعداً از آن بخوانند.
-- payload = projection کاهش‌یافتهٔ سمت ابر (PULL_SOURCES) است نه ردیف کامل جدول — بنابراین
-- استقرار مستقیم در جدول‌های اصلی (announcements/...) ممنوع است؛ نگاشت بعدی تصمیم جدا دارد.
-- ممنوعیت ساختاری همان 0109: دادهٔ بالینی هرگز وارد این جدول نمی‌شود — فهرست سفید دامنه‌ها
-- هم سمت ابر (pull)، هم سمت کلاینت (client.ts) و هم سمت سرور میز (internal-sync) اعمال می‌شود.
-- idempotency با PRIMARY KEY (domain, id) — همان قرارداد m1.5/0109.

CREATE TABLE IF NOT EXISTS node_sync_inbox (
  domain      TEXT NOT NULL,                     -- announcements | packages | library (فهرست سفید در کد)
  id          TEXT NOT NULL,                     -- شناسهٔ سمت ابر (بسته‌ها: «pkg@نسخه»)
  updated_at  TEXT NOT NULL,                     -- مُهر سمت ابر — مبنای مقایسهٔ تازگی
  payload     TEXT NOT NULL,                     -- JSON projection اعتبارسنجی‌شده
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (domain, id)
);
CREATE INDEX IF NOT EXISTS idx_node_sync_inbox_received ON node_sync_inbox(domain, received_at);

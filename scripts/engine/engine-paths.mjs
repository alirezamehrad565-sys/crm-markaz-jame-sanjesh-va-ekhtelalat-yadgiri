// scripts/engine/engine-paths.mjs — مسیرهای مشترک موتور محلی (فاز ۲ خط rust)
//
// پشتهٔ D1 موتور محلی چیدمان عین miniflare دارد: DO با uniqueKey ثابت
// `miniflare-D1DatabaseObject` و نام دیتابیس `main` → مسیر فایل SQLite قطعی است
// (ما همان مسیر را با node:sqlite مستقیم مایگریت/سید می‌کنیم).
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const D1_OBJECT_CLASS = 'D1DatabaseObject';
export const D1_UNIQUE_KEY = `miniflare-${D1_OBJECT_CLASS}`;

/** پوشهٔ دیسک سرویس D1 (بلاف‌ها + فایل‌های DO) */
export function d1DiskPath(dataDir) {
  return path.join(dataDir, 'd1');
}

/**
 * مسیر قطعی فایل SQLite دیتابیس «main» زیر دیسک DO.
 * workerd برای هر DO فایل را با هش شناسهٔ آبجکت می‌سازد؛ چون uniqueKey
 * (`miniflare-D1DatabaseObject`) و نام دیتابیس («main») ثابت‌اند، نام فایل قطعی است —
 * با پروب واقعی کشف و تثبیت شد (docs/rust/engine.md). حالت WAL دارد (-shm/-wal کنارش).
 */
export function d1SqlitePath(dataDir) {
  return path.join(
    d1DiskPath(dataDir),
    D1_UNIQUE_KEY,
    '1ef2f391686e9f4a0ebc89b6b39d804aa83ca44ebdd90d82e5b605c183c4fa6c.sqlite'
  );
}

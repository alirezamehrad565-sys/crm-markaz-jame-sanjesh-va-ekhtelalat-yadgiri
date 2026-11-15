// scripts/engine/db-snapshot.mjs — پشتیبان فایل‌سطح پایگاه موتور محلی + بازسازی خودکار بی‌صدا
// (باقی‌ماندهٔ موج ۳ / DB-1 طرح ارتقا + لایهٔ محلی بکاپ سه‌لایه)
//
// چرا فایل‌سطح؟ هنگامی که quick_check سرخ می‌شود، موتور SQLite قابل اعتماد نیست و بازیابی از
// پاکت JSON ماژول src/application/backup (که خودش به کوئری زنده تکیه دارد) ممکن نیست؛ تنها
// منبع قابل‌اتکا در آن لحظه، «تصویر تأییدشدهٔ» فایل پایگاه است. این ماژول همان نویسندهٔ
// پشتیبانِ مسیر بوت/شبانهٔ میز است و هم توسط engine.mjs و هم توسط گیت ارتقای میز (VER-2)
// مصرف می‌شود.
//
// قراردادها:
//  - پشتیبان‌ها در <dataDir>/backups/backup-<UTCts>.db نگه‌داری می‌شوند؛ هر پشتیبان پیش از
//    پذیرش با quick_check تأیید می‌شود («بکاپِ تست‌نشده = بکاپِ نیست»).
//  - چرخش: آخرین ۷ فایل پشتیبان حفظ، قدیمی‌ترها حذف می‌شوند (فقط فایل‌های خودمان).
//  - فایل آسیب‌دیده هرگز حذف یا بازنویسی نمی‌شود — ابتدا کپی نشانه‌دار
//    <name>.corrupt-<UTCts>.bak گرفته می‌شود (داده مقدس است).
//  - بازسازی فقط در همین حالتِ «quick_check سرخ در بوت» انجام می‌شود؛ هیچ‌_CASE_ دیگری
//    اصلاح خودکار ندارد.
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, unlinkSync } from 'node:fs';
import { basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
// node:sqlite با createRequire بارگذاری می‌شود (هم‌الگوی src/test/mock-d1.ts) تا ماژول
// هم زیر node خام و هم زیر لودر vitest/vite قابل بارگذاری باشد
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

/** مُهر UTC برای نام فایل — رقم لاتین برای نام فایل امن (پیام‌ها فارسی رقم می‌شوند) */
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const faNum = (n) => String(n).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);

export function utcStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
  );
}

/** پوشهٔ پشتیبان‌های فایل‌سطح موتور */
export function backupsDirOf(dataDir) {
  return join(dataDir, 'backups');
}

/** quick_check روی یک فایل پایگاه — true فقط با پاسخ دقیق «ok» */
export function verifyDbFile(dbPath) {
  let db = null;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    const row = db.prepare('PRAGMA quick_check').get();
    const status = row ? String(Object.values(row)[0]) : '';
    return status === 'ok';
  } catch {
    return false;
  } finally {
    try { db?.close(); } catch { /* بستن بی‌اثر */ }
  }
}

/** چک‌پوینت WAL روی پایگاه زنده — تا فایل اصلی همهٔ نوشته‌ها را داشته باشد (best-effort) */
function checkpointLiveWal(dbPath) {
  let db = null;
  try {
    db = new DatabaseSync(dbPath);
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  } catch {
    // شکست چک‌پوینت مانع پشتیبان نیست — کپی همچنان سازگارِ لحظهٔ کپی است
  } finally {
    try { db?.close(); } catch { /* بستن بی‌اثر */ }
  }
}

/** چرخش پشتیبان‌ها — آخرین «keep» فایل backup-*.db تأییدشده می‌ماند؛ بقیهٔ فایل‌های خودمان حذف */
export function rotateSnapshots(backupsDir, keep = 7) {
  let files = [];
  try {
    // مُهر دوم‌دقت + پسوند شمارنده → الفبایی کافی نیست؛ مرتب‌سازی واقعی با mtime
    files = readdirSync(backupsDir)
      .filter((f) => /^backup-\d{8}-\d{6}(-\d+)?\.db$/.test(f))
      .map((f) => ({ f, m: statSync(join(backupsDir, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m) // تازه‌ترین اول
      .map((x) => x.f);
  } catch {
    return [];
  }
  const removed = [];
  for (const f of files.slice(keep)) {
    try {
      unlinkSync(join(backupsDir, f));
      removed.push(f);
    } catch {
      // حذف ناموفق — فایل بعدی؛ مانع جریان نیست
    }
  }
  return removed;
}

/**
 * گرفتن یک پشتیبان فایل‌سطح تأییدشده از پایگاه زنده.
 * برگشت: { ok, path, bytes, verified, name } — ok=false یعنی کپی/تأیید نشد (پیام در log).
 */
export function takeSnapshot(dbPath, dataDir, opts = {}) {
  const log = opts.log ?? ((msg) => console.log(`[engine] ${msg}`));
  const backupsDir = backupsDirOf(dataDir);
  const stamp = utcStamp();
  let name = `backup-${stamp}.db`;
  let outPath = join(backupsDir, name);
  let dup = 2;
  // دو پشتیبان در یک ثانیه (شبانه + دستی) — پسوند شمارنده، نه بازنویسی
  while (existsSync(outPath)) {
    name = `backup-${stamp}-${dup}.db`;
    outPath = join(backupsDir, name);
    dup += 1;
  }
  try {
    mkdirSync(backupsDir, { recursive: true });
    checkpointLiveWal(dbPath);
    copyFileSync(dbPath, outPath);
    const verified = verifyDbFile(outPath);
    if (!verified) {
      // پشتیبان تأییدنشده سطل زباله نیست ولی «پشتیبان» هم نیست — حذف و گزارش
      try { unlinkSync(outPath); } catch { /* حذف بی‌اثر */ }
      log(`پشتیبان فایل‌سطح تأیید نشد و کنار گذاشته شد (${name}) — پایگاه زنده دست‌نخورده ماند`);
      return { ok: false, path: null, bytes: 0, verified: false, name: null };
    }
    const removed = rotateSnapshots(backupsDir, opts.keep ?? 7);
    const bytes = statSync(outPath).size;
    log(`پشتیبان فایل‌سطح گرفته شد: ${name} (${Math.floor(bytes / 1024)} کیلوبایت)${removed.length ? ` — ${removed.length} پشتیبان قدیمی حذف شد` : ''}`);
    return { ok: true, path: outPath, bytes, verified: true, name };
  } catch (err) {
    log(`پشتیبان فایل‌سطح ناموفق بود — بی‌خطر رد شد: ${err?.message ?? err}`);
    return { ok: false, path: null, bytes: 0, verified: false, name: null };
  }
}

/** تازه‌ترین پشتیبان تأییدشدهٔ موجود — یا null */
export function newestVerifiedSnapshot(backupsDir) {
  let files = [];
  try {
    files = readdirSync(backupsDir)
      .filter((f) => /^backup-\d{8}-\d{6}(-\d+)?\.db$/.test(f))
      .map((f) => ({ f, m: statSync(join(backupsDir, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m) // تازه‌ترین اول — بر اساس mtime
      .map((x) => x.f);
  } catch {
    return null;
  }
  for (const f of files) {
    const p = join(backupsDir, f);
    if (verifyDbFile(p)) return { path: p, name: f };
  }
  return null;
}

/**
 * نشانه‌گذاری فایل آسیب‌دیده — کپی به <name>.corrupt-<UTCts>.bak (همراه -wal اگر بود).
 * هرگز چیزی حذف یا بازنویسی نمی‌شود؛ اگر مقصد موجود بود پسوند عددی می‌گیرد.
 * برگشت: نام فایل نشانه یا null.
 */
export function snapshotCorruptFile(dbPath) {
  const dir = join(dbPath, '..');
  const base = basename(dbPath);
  const stamp = utcStamp();
  const snap = (src, suffix) => {
    if (!existsSync(src)) return null;
    let dest = join(dir, `${base}.corrupt-${stamp}${suffix}`);
    let n = 1;
    while (existsSync(dest)) {
      dest = join(dir, `${base}.corrupt-${stamp}-${n}${suffix}`);
      n += 1;
    }
    try {
      copyFileSync(src, dest);
      return dest;
    } catch {
      return null;
    }
  };
  const main = snap(dbPath, '.bak');
  snap(`${dbPath}-wal`, '-wal.bak');
  snap(`${dbPath}-shm`, '-shm.bak');
  return main;
}

/** جایگزینی فایل زنده با پشتیبان — فایل‌های WAL/SHM کهنهٔ پایگاهِ آسیب‌دیده باید بروند */
export function restoreSnapshotOver(livePath, snapshotPath) {
  for (const side of [`${livePath}-wal`, `${livePath}-shm`]) {
    try { rmSync(side, { force: true }); } catch { /* حذف بی‌اثر */ }
  }
  copyFileSync(snapshotPath, livePath);
}

/** ثبت رویداد audit مستقیم با node:sqlite — هم‌شکل audit_log مایگریشن 0001 (actor = system) */
export function writeAuditRow(db, action, resourceType, resourceId, changes) {
  db.prepare(
    `INSERT INTO audit_log (id, actor_id, action, resource_type, resource_id, changes, created_at)
     VALUES (?, 'system', ?, ?, ?, ?, datetime('now'))`
  ).run(randomUUID(), action, resourceType, resourceId, JSON.stringify(changes ?? null));
}

/**
 * مسیر بوت — بررسی یکپارچگی و در صورت خرابی، بازسازی خودکار بی‌صدا از پشتیبان تأییدشده.
 * ترتیب صریح (طرح موج ۳ / DB-1):
 *   ① quick_check → ok: بدون کاری برگشت می‌دهیم
 *   ② خراب: فایل آسیب‌دیده به نشانهٔ <name>.corrupt-<UTCts>.bak کپی می‌شود (هرگز حذف/بازنویسی نمی‌شود)
 *   ③ تازه‌ترین پشتیبان تأییدشده → جایگزینی فایل زنده (بدون WAL/SHM کهنه)
 *   ④ quick_check دوباره → گذر: ادامهٔ بوت با پیام فارسی + ردیف audit
 *                        → سرخ: بوت متوقف با پیام فارسی (هیچ‌چیز دیگری امتحان نمی‌شود)
 * opts.fatal برای تست جایگزین خروج process می‌شود (پیش‌فرض: پیام + exit(1)).
 */
export function ensureDbIntegrityOrRestore(dbPath, dataDir, opts = {}) {
  const log = opts.log ?? ((msg) => console.log(`[engine] ${msg}`));
  const fatal =
    opts.fatal ??
    ((msg) => {
      console.error(msg);
      process.exit(1);
    });

  // ⓪ بوت اول: اگر فایل پایگاه هنوز وجود ندارد (یا صفر-بایت است) بررسی بی‌معناست؛
  // مایگریشن بعدی آن را می‌سازد — «نبودن» خرابی نیست و نباید مسیر بازسازی برود.
  if (!existsSync(dbPath) || statSync(dbPath).size === 0) {
    return { db: null, restored: null, fresh: true };
  }

  // ① باز کردن + quick_check
  let db = null;
  let firstError = '';
  try {
    db = new DatabaseSync(dbPath);
    const row = db.prepare('PRAGMA quick_check').get();
    const status = row ? String(Object.values(row)[0]) : '';
    if (status === 'ok') return { db, restored: null };
    firstError = `quick_check: ${status || 'بدون پاسخ'}`;
  } catch (err) {
    firstError = `باز کردن ممکن نشد: ${err?.message ?? err}`;
  }
  try { db?.close(); } catch { /* بستن بی‌اثر */ }

  // ② نشانهٔ فایل آسیب‌دیده — داده مقدس است؛ فقط کپی
  const corruptSnap = snapshotCorruptFile(dbPath);
  log(`پایگاه داده بررسی یکپارچگی را نگذراند (${firstError})`);
  log(corruptSnap ? `نسخهٔ آسیب‌دیده به «${basename(corruptSnap)}» کپی شد — هیچ داده‌ای حذف نشد` : 'کپی نشانهٔ فایل آسیب‌دیده ممکن نشد');

  // ③ تازه‌ترین پشتیبان تأییدشده
  const snap = newestVerifiedSnapshot(backupsDirOf(dataDir));
  if (!snap) {
    fatal('[engine] هیچ پشتیبان تأییدشده‌ای موجود نیست — بوت متوقف شد؛ لطفاً با پشتیبانی تماس بگیرید');
    return null; // برای تست‌ها با fatal تزریقی این خط اجرا نمی‌شود
  }

  let restoredOk = false;
  try {
    restoreSnapshotOver(dbPath, snap.path);
    restoredOk = verifyDbFile(dbPath); // ④ quick_check دوباره
  } catch (err) {
    log(`بازسازی از پشتیبان ناموفق بود: ${err?.message ?? err}`);
  }

  if (!restoredOk) {
    fatal('[engine] بازسازی از پشتیبان هم بررسی یکپارچگی را نگذراند — بوت متوقف شد تا پایگاه خراب‌تر نشود؛ لطفاً با پشتیبانی تماس بگیرید');
    return null;
  }

  // پیام انسانی فارسی + ردیف audit در همان پایگاهِ بازسازی‌شده — «ساعت X» از نام پشتیبان
  const m = snap.name.match(/^backup-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.db$/);
  const when = m
    ? `${faNum(m[1])}/${faNum(m[2])}/${faNum(m[3])} ساعت ${faNum(m[4])}:${faNum(m[5])}:${faNum(m[6])} (UTC)`
    : faNum(snap.name);
  const message = `پایگاه داده آسیب دیده بود؛ از پشتیبان ${when} بازسازی شد`;
  log(message);
  try {
    const restored = new DatabaseSync(dbPath);
    writeAuditRow(restored, 'db.restore_from_backup', 'database', snap.name, {
      corrupt_snapshot: corruptSnap ? basename(corruptSnap) : null,
      restored_from: snap.name,
      integrity_error: firstError
    });
    restored.close();
  } catch {
    // ثبت audit نباید بوت را نگه دارد — پیام فارسی در لاگ هست
  }
  db = new DatabaseSync(dbPath);
  return { db, restored: { message, from: snap.name, corrupt_snapshot: corruptSnap ? basename(corruptSnap) : null } };
}

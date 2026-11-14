// scripts/engine/human-log.mjs — لاگ گردش‌پذیرِ رویدادهای انسانی فارسی (۴-۳ طرح ارتقا)
//
// دو نیمه:
//  ① «صفٔ رویداد» در جدول settings (کلید sys_human_events — آرایهٔ JSON با سقف ۲۰۰) —
//    هم نویسندهٔ node (بوت/بازسازی/واچ‌داگ) و هم خودِ اپ (مسیرهای نجات) روی آن می‌نویسند تا
//    «حالت مخفی نداریم» و بستهٔ خطا (۴-۲) دمِ همین صف را حمل کند.
//  ② «فایل رویدادهای انسانی» <dataDir>/events-fa.log — چرخش در ~۵ مگابایت با نگه‌داری ۷ فایل؛
//    ناظر engine.mjs صف را با نشانهٔ «آخرین رویداد نوشته‌شده» در فایل می‌ریزد.
// متن پیام‌ها از همان نگاشت «ماژول پیام انسانی فارسی» (۱.۲۶.۱ — src/core/errors/human-messages.ts)
// الهام می‌گیرد و پوشش رویدادهای تازه (بازسازی/پشتیبان/واچ‌داگ/بازی‌ها) همان‌جا گسترش یافته است؛
// این ماژول فقط زیرساخت چرخش/صف است — ماژول دومی برای نگاشت پیام ساخته نمی‌شود.
import { existsSync, openSync, renameSync, statSync, unlinkSync, appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** سقف چرخش فایل لاگ — ~۵ مگابایت */
export const LOG_ROTATE_BYTES = 5 * 1024 * 1024;
/** چند فایل لاگ نگه داشته شود (فایل جاری + ۶ چرخیده) */
export const LOG_KEEP_FILES = 7;
/** کلید صفٔ رویدادهای انسانی در جدول settings (هم‌قرارداد TS سمت اپ) */
export const HUMAN_EVENTS_QUEUE_KEY = 'sys_human_events';
/** سقف صف — قدیمی‌ترها بی‌صدا بیرون می‌ریزند */
export const HUMAN_EVENTS_MAX = 200;

/* ─── ① صفٔ رویداد در settings ─── */

/** افزودن یک رویداد انسانی به صف (db = node:sqlite DatabaseSync) — best-effort، هرگز پرتاب نمی‌کند */
export function pushHumanEventDb(db, message, source = 'engine') {
  if (!db) return;
  try {
    let list = [];
    const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(HUMAN_EVENTS_QUEUE_KEY);
    if (row?.value) {
      const parsed = JSON.parse(row.value);
      if (Array.isArray(parsed)) list = parsed;
    }
    list.push({ ts: new Date().toISOString(), source, msg: String(message) });
    while (list.length > HUMAN_EVENTS_MAX) list.shift();
    db.prepare(
      `INSERT INTO settings (key, value, updated_by) VALUES (?, ?, 'system')
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = 'system', updated_at = datetime('now')`
    ).run(HUMAN_EVENTS_QUEUE_KEY, JSON.stringify(list));
  } catch {
    // ثبت رویداد هیچ‌وقت نباید جریان اصلی را بشکند
  }
}

/** خواندن صف رویدادها (تازه‌ترین آخر) — خرابی = آرایهٔ خالی */
export function readHumanEventsDb(db, limit = HUMAN_EVENTS_MAX) {
  if (!db) return [];
  try {
    const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(HUMAN_EVENTS_QUEUE_KEY);
    if (!row?.value) return [];
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) ? parsed.slice(-limit) : [];
  } catch {
    return [];
  }
}

/* ─── ② چرخش و فایل لاگ ─── */

/**
 * چرخش یک فایل لاگ بزرگ — اگر از سقف گذشت: events-fa.log → .1 → .2 … (آخرین ۷ فایل).
 * برای workerd.log و events-fa.log یکی است. برگشت: true اگر چرخش شد.
 */
export function rotateFileIfNeeded(logPath, opts = {}) {
  const maxBytes = opts.maxBytes ?? LOG_ROTATE_BYTES;
  const keep = opts.keep ?? LOG_KEEP_FILES;
  let size = 0;
  try {
    size = statSync(logPath).size;
  } catch {
    return false; // هنوز وجود ندارد
  }
  if (size < maxBytes) return false;
  try {
    const oldest = `${logPath}.${keep - 1}`;
    if (existsSync(oldest)) unlinkSync(oldest);
    for (let i = keep - 2; i >= 1; i -= 1) {
      const from = `${logPath}.${i}`;
      if (existsSync(from)) renameSync(from, `${logPath}.${i + 1}`);
    }
    renameSync(logPath, `${logPath}.1`);
    return true;
  } catch {
    return false; // چرخش ناموفق — فایل فعلی بزرگ می‌ماند ولی جریان نمی‌شکند
  }
}

/** افزودن سطر رویداد به فایل با چرخش خودکار — سطر: [<ISO>] پیام */
export function appendHumanEventLine(logPath, message, ts = new Date().toISOString()) {
  try {
    rotateFileIfNeeded(logPath);
    appendFileSync(logPath, `[${ts}] ${String(message)}\n`, 'utf8');
  } catch {
    // فایل‌سیستم ناهم‌کاری کرد — لاگ فایل بی‌صدا رد می‌شود
  }
}

/** نشانهٔ «آخرین رویداد ریخته‌شده» کنار فایل لاگ — تا ری‌بوت رویدادها را دوباره نریزد */
function posFileOf(logPath) {
  return `${logPath}.pos`;
}

/**
 * ریختن تفاوت صف در فایل — رویدادهایی با ts تازه‌تر از نشانهٔ قبلی.
 * برگشت: ts آخرین رویداد نوشته‌شده (برای ذخیره در نشانه).
 */
export function drainQueueToLog(db, logPath, opts = {}) {
  const events = readHumanEventsDb(db, HUMAN_EVENTS_MAX);
  if (events.length === 0) return null;
  let lastPos = null;
  try {
    lastPos = readFileSync(posFileOf(logPath), 'utf8').trim() || null;
  } catch {
    lastPos = null;
  }
  const pending = lastPos ? events.filter((e) => e?.ts > lastPos) : events;
  for (const e of pending) appendHumanEventLine(logPath, `${e.msg} [منبع: ${e.source}]`, e.ts);
  const lastTs = events[events.length - 1]?.ts ?? null;
  if (lastTs && pending.length > 0) {
    try {
      writeFileSync(posFileOf(logPath), lastTs, 'utf8');
    } catch { /* نشانهٔ موقعیت بی‌اثر */ }
  }
  return lastTs;
}

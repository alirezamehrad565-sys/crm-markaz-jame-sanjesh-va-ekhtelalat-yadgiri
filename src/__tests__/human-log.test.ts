// ۱.۲۶.۴ — ۴-۳: لاگ گردش‌پذیر انسانی (فایل ۵MB×۷ + صفٔ settings) — سمت node ناظر
import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
// @ts-expect-error — ماژول plain mjs موتور (بدون declaration)
import { pushHumanEventDb, readHumanEventsDb, rotateFileIfNeeded, appendHumanEventLine, drainQueueToLog, LOG_ROTATE_BYTES, LOG_KEEP_FILES, HUMAN_EVENTS_MAX, HUMAN_EVENTS_QUEUE_KEY } from '../../scripts/engine/human-log.mjs';

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function freshDb(): { db: InstanceType<typeof DatabaseSync>; dir: string } {
  const dir = mkdtempSync(path.join(tmpdir(), 'human-log-'));
  dirs.push(dir);
  const db = new DatabaseSync(path.join(dir, 't.sqlite'));
  db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_by TEXT, updated_at TEXT)');
  return { db, dir };
}

describe('صفٔ رویدادهای انسانی در settings', () => {
  it('رویداد اضافه می‌کند و سقف ۲۰۰ را نگه می‌دارد', () => {
    const { db } = freshDb();
    for (let i = 0; i < HUMAN_EVENTS_MAX + 30; i += 1) pushHumanEventDb(db, `رویداد ${i}`, 'engine');
    const list = readHumanEventsDb(db);
    expect(list.length).toBe(HUMAN_EVENTS_MAX);
    expect(list[list.length - 1].msg).toBe(`رویداد ${HUMAN_EVENTS_MAX + 29}`);
    expect(list[0].msg).toBe('رویداد 30'); // قدیمی‌ترها بیرون ریخته شدند
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(HUMAN_EVENTS_QUEUE_KEY) as { value: string };
    expect(JSON.parse(row.value).length).toBe(HUMAN_EVENTS_MAX);
    db.close();
  });

  it('خرابی db/جدول → آرایهٔ خالی، بدون پرتاب', () => {
    expect(readHumanEventsDb(null as unknown as InstanceType<typeof DatabaseSync>)).toEqual([]);
    const dir = mkdtempSync(path.join(tmpdir(), 'human-log-empty-'));
    dirs.push(dir);
    const db = new DatabaseSync(path.join(dir, 'empty.sqlite')); // جدول settings ندارد
    expect(readHumanEventsDb(db)).toEqual([]);
    expect(() => pushHumanEventDb(db, 'بی‌اثر', 'engine')).not.toThrow();
    db.close();
  });
});

describe('چرخش فایل لاگ — ~۵ مگابایت، نگه‌داری ۷ فایل', () => {
  it('فایل زیر سقف چرخش نمی‌شود', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'human-log-rot-'));
    dirs.push(dir);
    const p = path.join(dir, 'log.txt');
    writeFileSync(p, Buffer.alloc(1024, 97));
    expect(rotateFileIfNeeded(p)).toBe(false);
    expect(existsSync(`${p}.1`)).toBe(false);
  });

  it('فایل بزرگ چرخش می‌کند و قدیمی‌ترها تا ۷ فایل حذف می‌شوند', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'human-log-rot2-'));
    dirs.push(dir);
    const p = path.join(dir, 'log.txt');
    // هفت چرخش متوالی: log.txt → .1 → .2 ... — هر بار با فایل بزرگ تازه
    for (let i = 0; i < LOG_KEEP_FILES + 2; i += 1) {
      writeFileSync(p, Buffer.alloc(LOG_ROTATE_BYTES + 1024, 97));
      expect(rotateFileIfNeeded(p)).toBe(true);
      appendHumanEventLine(p, `چرخهٔ ${i}`);
    }
    const rotated = readdirSync(dir).filter((f) => f.startsWith('log.txt.'));
    expect(rotated.length).toBeLessThanOrEqual(LOG_KEEP_FILES - 1); // فایل جاری + ۶ چرخیده
    expect(existsSync(`${p}.${LOG_KEEP_FILES}`)).toBe(false); // .7 هرگز نمی‌ماند
  });
});

describe('ریختن صف در فایل رویدادها', () => {
  it('رویدادها یک‌بار نوشته می‌شوند — نشانهٔ موقعیت دوباره‌نویسی را می‌بندد', () => {
    const { db, dir } = freshDb();
    const logPath = path.join(dir, 'events-fa.log');
    pushHumanEventDb(db, 'پشتیبان فایل‌سطح پایگاه گرفته شد', 'engine');
    pushHumanEventDb(db, 'پایگاه داده آسیب دیده بود؛ از پشتیبان بازسازی شد', 'engine');
    const last = drainQueueToLog(db, logPath);
    expect(last).not.toBeNull();
    const text = readFileSync(logPath, 'utf8');
    expect(text).toContain('پشتیبان فایل‌سطح');
    expect(text).toContain('بازسازی شد');
    expect(text).toContain('[منبع: engine]');
    // درین دوم — چیزی تازه نیست، فایل تغییر نمی‌کند
    const sizeBefore = readFileSync(logPath, 'utf8').length;
    drainQueueToLog(db, logPath);
    expect(readFileSync(logPath, 'utf8').length).toBe(sizeBefore);
    db.close();
  });
});

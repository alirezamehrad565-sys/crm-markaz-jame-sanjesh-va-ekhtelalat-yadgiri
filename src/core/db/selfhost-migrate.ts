/**
 * اجراکنندهٔ مهاجرت‌ها برای بستر سلف‌هاست — جایگزین `wrangler d1 migrations apply`
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 *
 * رفتار:
 *   ۱) جدول رهگیری `_selfhost_migrations` ساخته می‌شود (idempotent).
 *   ۲) فایل‌های `migrations/*.sql` به‌ترتیب الفبایی (مثل wrangler) اعمال می‌شوند.
 *   ۳) اگر دیتابیس از یک dump کامل D1 (d1 export) پر شده باشد ولی رهگیری خالی باشد،
 *      اسکیما موجود فرض می‌شود و همهٔ مهاجرت‌ها «اعمال‌شده» ثبت می‌شوند تا اجرای دوباره
 *      (مثلاً ALTER TABLE تکراری) خراب نشود.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { DatabaseSyncInstance } from './node-d1';

const TRACKING_TABLE = '_selfhost_migrations';
/** جدول مرجع برای تشخیص «اسکما از قبل موجود است» (dump کامل D1) */
const SCHEMA_SENTINEL_TABLE = 'staff';

export interface MigrationOutcome {
  /** فایل‌هایی که این بار واقعاً اجرا شدند */
  applied: string[];
  /** فایل‌هایی که از قبل ثبت بودند و رد شدند */
  skipped: number;
  /** true یعنی اسکیما از dump موجود بود و فقط ثبت شدند */
  assumedFromSchema: boolean;
}

export function applySelfhostMigrations(
  store: DatabaseSyncInstance,
  migrationsDir: string,
  log: (msg: string) => void = () => undefined
): MigrationOutcome {
  store.exec(
    `CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`
  );

  const appliedRows = store.prepare(`SELECT name FROM ${TRACKING_TABLE}`).all() as { name: string }[];
  const applied = new Set(appliedRows.map((r) => r.name));

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  if (files.length === 0) throw new Error(`هیچ فایل مهاجرتی در ${migrationsDir} یافت نشد`);

  // — حالت dump کامل: جدول‌ها موجودند ولی رهگیری خالی است —
  if (applied.size === 0) {
    const sentinel = store
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
      .get(SCHEMA_SENTINEL_TABLE);
    if (sentinel !== undefined) {
      const insert = store.prepare(
        `INSERT INTO ${TRACKING_TABLE} (name, applied_at) VALUES (?, ?)`
      );
      const now = new Date().toISOString();
      store.exec('BEGIN IMMEDIATE');
      try {
        for (const f of files) insert.run(f, now);
        store.exec('COMMIT');
      } catch (err) {
        store.exec('ROLLBACK');
        throw err;
      }
      log(`اسکمای موجود (dump) شناسایی شد — ${files.length} مهاجرت بدون اجرا ثبت شد`);
      return { applied: [], skipped: 0, assumedFromSchema: true };
    }
  }

  const newlyApplied: string[] = [];
  for (const f of files) {
    if (applied.has(f)) continue;
    const sql = readFileSync(path.join(migrationsDir, f), 'utf8');
    try {
      store.exec(sql);
      store
        .prepare(`INSERT INTO ${TRACKING_TABLE} (name, applied_at) VALUES (?, ?)`)
        .run(f, new Date().toISOString());
      newlyApplied.push(f);
      log(`✓ مهاجرت اعمال شد: ${f}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`مهاجرت ${f} شکست خورد: ${msg}`);
    }
  }

  return { applied: newlyApplied, skipped: files.length - newlyApplied.length, assumedFromSchema: false };
}

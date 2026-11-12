// scripts/engine/apply-migrations.mjs — مایگریشن فایل SQLite موتور محلی (فاز ۲ خط rust)
//
// طراحی: docs/rust/design.md §۴ — مایگریشن خودکار در اولین اجرا با همان `migrations/` رسمی
// (ترتیب عددی، ۱۱۱ فایل). idempotent: جدول `_migrations(version, applied_at)` ثبت می‌کند.
// دیتابیس همان فایل SQLite پشتهٔ D1 موتور محلی است (چیدمان عین miniflare).
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { REPO_ROOT, d1SqlitePath } from './engine-paths.mjs';

export function applyMigrations(dbPath) {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    version TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  const applied = new Set(db.prepare('SELECT version FROM _migrations').all().map((r) => r.version));
  const dir = path.join(REPO_ROOT, 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  let appliedCount = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    db.exec(readFileSync(path.join(dir, file), 'utf8'));
    db.prepare('INSERT INTO _migrations (version) VALUES (?)').run(file);
    appliedCount++;
  }
  db.close();
  return { total: files.length, appliedCount };
}

// اجرای مستقیم: node scripts/engine/apply-migrations.mjs --data-dir <مسیر>
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--data-dir');
  const dataDir = i >= 0 ? args[i + 1] : path.join(REPO_ROOT, 'engine-data');
  const result = applyMigrations(d1SqlitePath(dataDir));
  console.log(`[engine] مایگریشن‌ها: ${result.appliedCount} اعمال شد از ${result.total} (idempotent) — ${d1SqlitePath(dataDir)}`);
}

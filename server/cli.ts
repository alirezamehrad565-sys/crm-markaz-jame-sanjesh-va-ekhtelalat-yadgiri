/**
 * CLI نگهداری بستر سلف‌هاست — جایگزین `wrangler d1 …` روی نصب Docker/محلی
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 *
 * استفاده (داخل کانتینر):
 *   node dist/cli.js migrate                 اعمال مهاجرت‌های در انتظار
 *   node dist/cli.js sql <file.sql>          اجرای فایل SQL (bootstrap یا بازیابی dump)
 *   node dist/cli.js status                  وضعیت مهاجرت‌ها + شمارش جدول‌ها
 */
import { readFileSync, statSync } from 'node:fs';
import { NodeD1 } from '@core/db/node-d1';
import { applySelfhostMigrations } from '@core/db/selfhost-migrate';
import { loadSelfhostConfig } from './env';

const cfg = loadSelfhostConfig();
const [, , cmd, arg] = process.argv;

function usage(): never {
  console.log('استفاده:');
  console.log('  node dist/cli.js migrate            اعمال مهاجرت‌های در انتظار');
  console.log('  node dist/cli.js sql <file.sql>     اجرای فایل SQL (bootstrap یا بازیابی dump)');
  console.log('  node dist/cli.js status             وضعیت مهاجرت‌ها + شمارش جدول‌ها');
  process.exit(1);
}

function open(): NodeD1 {
  const d1 = NodeD1.open(cfg.dbPath);
  console.log(`دیتابیس: ${cfg.dbPath}`);
  return d1;
}

function status(d1: NodeD1): void {
  const store = d1.rawStore;
  const mig = (store.prepare('SELECT COUNT(*) AS n FROM _selfhost_migrations').get() as { n: number }).n;
  console.log(`مهاجرت‌های ثبت‌شده: ${mig}`);
  const tables = store
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_selfhost_migrations' ORDER BY name`
    )
    .all() as { name: string }[];
  console.log(`جدول‌ها: ${tables.length}`);
  for (const t of tables) {
    try {
      const row = store.prepare(`SELECT COUNT(*) AS n FROM "${t.name.replace(/"/g, '""')}"`).get() as { n: number };
      console.log(`  ${t.name.padEnd(34)} ${row.n}`);
    } catch {
      console.log(`  ${t.name.padEnd(34)} (خطا در شمارش)`);
    }
  }
  console.log(`حجم فایل دیتابیس: ${(statSync(cfg.dbPath).size / 1024 / 1024).toFixed(1)}MB`);
}

switch (cmd) {
  case 'migrate': {
    const d1 = open();
    const out = applySelfhostMigrations(d1.rawStore, cfg.migrationsDir, (m) => console.log(m));
    console.log(
      out.assumedFromSchema
        ? 'اسکما از dump موجود بود — همهٔ مهاجرت‌ها ثبت شدند (بدون اجرا).'
        : `اعمال‌شده: ${out.applied.length} · از قبل موجود: ${out.skipped}`
    );
    break;
  }
  case 'sql': {
    if (!arg) usage();
    const d1 = open();
    const sql = readFileSync(arg, 'utf8');
    const store = d1.rawStore;
    const t0 = Date.now();
    // ترتیب insertهای dump ممکن است به FK وابسته باشد — موقتاً خاموش، مثل دستورالعمل docs/DOCKERIZE.md §۵
    store.exec('PRAGMA foreign_keys = OFF;');
    try {
      store.exec(sql);
    } finally {
      store.exec('PRAGMA foreign_keys = ON;');
    }
    console.log(`✓ فایل اجرا شد: ${arg} (${(sql.length / 1024).toFixed(0)}KB، ${Date.now() - t0}ms)`);
    break;
  }
  case 'status': {
    const d1 = open();
    status(d1);
    break;
  }
  default:
    usage();
}

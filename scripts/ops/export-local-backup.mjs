#!/usr/bin/env node
/**
 * تولید فایل پشتیبان واقعی از D1 محلی برای drill بازیابی ماهانه (ف۴ — P1-7).
 *
 * بستر drill باید «همان مسیر تولیدِ فایل پشتیبان» باشد — پس این اسکریپت سرویس واقعی
 * export سامانه (createBackupService.buildExportStream — قالب gh-backup v1) را با esbuild
 * ترنسپایل و روی پایگاه محلی wrangler اجرا می‌کند؛ دست‌ساز و تقلبی نیست.
 *
 * پیش‌نیاز (به ترتیب):
 *   npm run migrate:local   — مایگریشن‌ها روی D1 محلی
 *   npm run seed:local      — دادهٔ نمونه
 * اجرا:
 *   node scripts/ops/export-local-backup.mjs [--out backups/local-backup.json] [--note «...»]
 * سپس:
 *   npm run restore:drill -- --file backups/local-backup.json --note «D1 محلی + seed»
 *
 * هیچ مایگریشنی اجرا نمی‌کند و هیچ جدولی نمی‌نویسد — فقط خواندن، و نوشتن فایل JSON خروجی.
 */
import { readdirSync, statSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
const LOCAL_D1_DIR = join(ROOT, '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject');
const TOOL_TMP = join(ROOT, 'tool-results'); // gitignored — محل فایل‌های موقت باندل

const args = process.argv.slice(2);
function argOf(name) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}
const note = argOf('--note') ?? null;

// ۱) یافتن پایگاه محلی wrangler — تازه‌ترین فایل sqlite
function findLocalDb() {
  if (argOf('--db')) return resolve(argOf('--db'));
  let files = [];
  try {
    files = readdirSync(LOCAL_D1_DIR).filter((f) => f.endsWith('.sqlite'));
  } catch {
    breakError(`پایگاه محلی پیدا نشد — اول «npm run migrate:local» و «npm run seed:local» را اجرا کنید (${LOCAL_D1_DIR})`);
  }
  if (files.length === 0) breakError(`هیچ فایل .sqlite در ${LOCAL_D1_DIR} نیست — اول migrate:local/seed:local`);
  const newest = files
    .map((f) => ({ f, m: statSync(join(LOCAL_D1_DIR, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m)[0];
  return join(LOCAL_D1_DIR, newest.f);
}
function breakError(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

const dbPath = findLocalDb();
const outPath = resolve(argOf('--out') ?? join(ROOT, 'backups', `local-backup-${new Date().toISOString().slice(0, 10)}.json`));

// ۲) ورودی TS موقت — سرویس واقعی export با درایور node:sqlite (NodeD1 — هم‌شکل D1Database)
mkdirSync(TOOL_TMP, { recursive: true });
const entryTs = join(TOOL_TMP, 'export-local-backup.entry.ts');
const outfileJs = join(TOOL_TMP, 'export-local-backup.entry.mjs');
writeFileSync(entryTs, `// فایل موقتِ تولید پشتیبان محلی — از scripts/ops/export-local-backup.mjs ساخته می‌شود
import { writeFileSync, mkdirSync } from 'node:fs';
import { NodeD1 } from '@core/db/node-d1';
import { createDb } from '@core/db';
import { createAuditWriter } from '@core/audit';
import { createBackupService } from '@app/backup/service';
import type { Logger } from '@core/logger';

const silentLogger = (): Logger => ({
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => silentLogger()
} as unknown as Logger);

const d1 = NodeD1.open(${JSON.stringify(dbPath)}) as unknown as D1Database;
const db = createDb(d1);
const service = createBackupService({ db, audit: createAuditWriter(db), logger: silentLogger(), baleToken: null, sender: null });
const buf = await new Response(service.buildExportStream(false)).arrayBuffer();
mkdirSync(${JSON.stringify(dirname(outPath))}, { recursive: true });
writeFileSync(${JSON.stringify(outPath)}, Buffer.from(buf));
console.log(JSON.stringify({ tables: Object.keys(JSON.parse(Buffer.from(buf).toString('utf8')).tables).length, bytes: buf.byteLength }));
`, 'utf8');

// ۳) باندل با esbuild — هم‌الگوی scripts/build-worker-bundle.mjs (وابستگی تازه اضافه نمی‌شود)
const esbuild = await import('esbuild');
await esbuild.build({
  entryPoints: [entryTs],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  packages: 'external', // hono/zod از node_modules هم‌نسخهٔ مخزن حل می‌شوند
  alias: {
    '@core': join(ROOT, 'src', 'core'),
    '@app': join(ROOT, 'src', 'application'),
    '@domain': join(ROOT, 'src', 'domain'),
    '@': join(ROOT, 'src')
  },
  outfile: outfileJs,
  logLevel: 'silent'
});

const mod = await import(pathToFileURL(outfileJs).href);
void mod; // خروجی واقعی فایل JSON است — خلاصهٔ زیر مستقیم از پاکت خوانده می‌شود

// گزارش کنسول با محتوای واقعی پاکت
const env = JSON.parse(readFileSync(outPath, 'utf8'));
const tableNames = Object.keys(env.tables);
const totalRows = tableNames.reduce((s, t) => s + (env.tables[t].rows?.length ?? 0), 0);
console.log('═'.repeat(64));
console.log(' تولید پشتیبان محلی برای drill — قالب gh-backup v1 (سرویس واقعی export)');
console.log('═'.repeat(64));
console.log(` پایگاه محلی: ${dbPath}`);
console.log(` فایل خروجی: ${outPath} (${(statSync(outPath).size / 1024).toFixed(1)} KB)`);
console.log(` app_version پاکت: ${env.app_version} · created_at: ${env.created_at}`);
console.log(` جدول‌ها: ${tableNames.length} · مجموع ردیف‌ها: ${totalRows}${note ? ` · منشأ: ${note}` : ''}`);
console.log(` گام بعدی: npm run restore:drill -- --file "${outPath}"${note ? ` --note ${JSON.stringify(note)}` : ''}`);
console.log('═'.repeat(64));

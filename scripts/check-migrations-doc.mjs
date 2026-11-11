#!/usr/bin/env node
/**
 * گیت همگامی MIGRATIONS.md — هر فایل migrations/*.sql باید سطری در docs/MIGRATIONS.md داشته باشد.
 * (ف۲ — طرح ارتقا §۷: «همگامی MIGRATIONS.md»؛ بدهی ردیف‌های جامانده دقیقاً کاری است که این گیت می‌گرفت.)
 * اجرا: node scripts/check-migrations-doc.mjs  — خروج ۰ = سبز، ۱ = قرمز با فهرست ردیف‌های جامانده.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = join(ROOT, 'migrations');
const DOC = join(ROOT, 'docs', 'MIGRATIONS.md');

const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
const doc = readFileSync(DOC, 'utf8');

const missing = files.filter((f) => !doc.includes(f));
if (missing.length > 0) {
  console.error(`✗ گیت همگامی MIGRATIONS.md قرمز شد — ${missing.length} فایل بی‌سطر:`);
  for (const f of missing) console.error(`   • ${f}`);
  console.error('   رفع: سطر هر فایل را در docs/MIGRATIONS.md بنویسید (نام فایل هرگز تغییر نمی‌کند).');
  process.exit(1);
}
console.log(`✓ گیت همگامی MIGRATIONS.md سبز شد — هر ${files.length} فایل مایگریشن در سند ثبت است.`);

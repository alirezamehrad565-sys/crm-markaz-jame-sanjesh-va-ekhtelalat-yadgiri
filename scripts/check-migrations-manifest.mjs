#!/usr/bin/env node
/**
 * گیت مانیفست محتوای مایگریشن‌ها (sdt156 — بستن data-001 رجیستری ممیزی، 1.27.79-B1):
 * d1_migrations پروداکشن فقط *نام فایل* را ردگیری می‌کند؛ پس ویرایشِ بی‌صدای محتوای یک فایل
 * اعمال‌شده، نصب تازه را از پروداکشن جدا می‌کند بدون هیچ ردی. این گیت SHA-256 هر فایل
 * migrations/*.sql را با docs/migrations-manifest.json مقایسه می‌کند:
 *   • فایل تازه بدون ردیف مانیفست = قرمز (ثبت: ابتدا ردیف سند MIGRATIONS.md، سپس --update)
 *   • فایل حذف‌شده با ردیف مانیفست = قرمز (حذف فایل اعمال‌شده ممنوع — سیاست MIGRATIONS.md)
 *   • ویرایش محتوای فایل اعمال‌شده = قرمز (مطلقاً ممنوع — فقط مایگریشن انتهایی تازه)
 * اجرا: node scripts/check-migrations-manifest.mjs        (سبز/قرمز)
 *       node scripts/check-migrations-manifest.mjs --update  (بازنویسی مانیفست پس از افزودن فایل تازه)
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'migrations');
const MANIFEST = join(ROOT, 'docs', 'migrations-manifest.json');

const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
const hash = (f) => createHash('sha256').update(readFileSync(join(DIR, f))).digest('hex');
const actual = Object.fromEntries(files.map((f) => [f, hash(f)]));

if (process.argv.includes('--update')) {
  writeFileSync(MANIFEST, JSON.stringify(actual, null, 2) + '\n');
  console.log(`✓ مانیفست مایگریشن‌ها بازنویسی شد — ${files.length} فایل در docs/migrations-manifest.json`);
  process.exit(0);
}

const expected = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const missing = files.filter((f) => !(f in expected));
const removed = Object.keys(expected).filter((f) => !files.includes(f));
const drifted = files.filter((f) => f in expected && expected[f] !== actual[f]);
if (missing.length || removed.length || drifted.length) {
  console.error(`✗ گیت مانیفست مایگریشن‌ها قرمز شد — بی‌ردیف ${missing.length} · حذف‌شده ${removed.length} · ویرایش‌شده ${drifted.length}:`);
  for (const f of missing) console.error(`   • بی‌ردیف: ${f} — ردیف سند را بنویسید سپس با --update مانیفست را به‌روز کنید`);
  for (const f of removed) console.error(`   • حذف‌شده با ردیف: ${f} — حذف فایل اعمال‌شده ممنوع است (docs/MIGRATIONS.md ⛔)`);
  for (const f of drifted) console.error(`   • ویرایش محتوا: ${f} — فایل اعمال‌شده هرگز ویرایش نمی‌شود؛ اصلاح با مایگریشن انتهایی تازه`);
  process.exit(1);
}
console.log(`✓ گیت مانیفست مایگریشن‌ها سبز شد — ${files.length} فایل بی‌انحراف با docs/migrations-manifest.json`);

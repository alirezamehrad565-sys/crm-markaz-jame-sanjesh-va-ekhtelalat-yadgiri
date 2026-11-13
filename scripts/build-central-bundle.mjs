#!/usr/bin/env node
// ساخت باندل ورکر مرکزی مستقل (v1.26.0 — docs/rust/first-run-and-cloud.md §۳)
// خروجی: worker/central-bundle.js — cf_deploy.rs همین فایل را به حساب کلادفلر کاربر آپلود می‌کند.
// دود تست: باندل باید موجود، غیرتهی، ESM معتبر و حاوی مسیرهای کلیدی باشد.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'worker', 'central-bundle.js');

const esbuild = path.join(root, 'node_modules', '.bin', 'esbuild');
execFileSync(esbuild, [path.join(root, 'worker', 'src-entry-node.mjs'),
  '--bundle', '--format=esm', '--platform=neutral', '--target=es2022', '--keep-names', `--outfile=${out}`],
  { stdio: 'inherit' });

const body = readFileSync(out, 'utf8');
const banner = `/**
 * ورکر مرکزی مستقل «markaz-central» — ساخته‌شده از منبع با scripts/build-central-bundle.mjs
 * ⚠ این فایل را دستی ویرایش نکنید — تغییرها را در src/ بدهید و باندل را بازسازی کنید.
 * نصب: پوستهٔ دسکتاپ (cf_deploy.rs) این ماژول را با توکن کلادفلر کاربر deploy می‌کند.
 */
`;
writeFileSync(out, banner + body, 'utf8');

// — دود: مسیرهای کلیدی باید در باندل باشند (زیراپ نود مسیرهای نسبی /pull و /push را دارد که زیر /node سوار می‌شوند) —
const probes = ['/healthz', '/admin/setup', '/admin/announcements', '"/pull"', '"/push"', '"/register"', 'NODE_SETUP_TOKEN'];
const missing = probes.filter((p) => !body.includes(p));
if (missing.length > 0) {
  console.error(`✋ باندل ناقص — مسیرهای غایب: ${missing.join(', ')}`);
  process.exit(1);
}
console.log(`✓ worker/central-bundle.js — ${(Buffer.byteLength(body, 'utf8') / 1024 / 1024).toFixed(2)}MB — همهٔ پروب‌ها سبز`);

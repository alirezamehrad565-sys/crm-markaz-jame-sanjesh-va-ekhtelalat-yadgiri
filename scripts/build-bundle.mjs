#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// build-bundle.mjs — ساخت باندل انتشار zip از سورس پروژه
//   node scripts/build-bundle.mjs <برچسب>
// خروجی: center-system-<برچسب>.zip در پوشهٔ جاری
// محدودیت Workers: هر asset حداکثر ۲۵MiB؛ خودِ zip باندل داخل public/downloads
// کپی نمی‌شود (55MB > سقف) — پرتال زنده فقط بایگانی‌های کوچک را سرو می‌کند.
// شامل: src، public، migrations، scripts، wrangler.toml، tsconfig،
//        package*.json، vitest.config.ts و سندها — بدون node_modules/backups/.dev.vars
// ─────────────────────────────────────────────────────────────────────────────
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const ms = process.argv[2];
if (!ms || !/^m\d+$/.test(ms)) {
  console.error('استفاده: node scripts/build-bundle.mjs mNN');
  process.exit(1);
}
// محدودیت Workers: هر asset حداکثر ۲۵MiB است؛ خودِ فایل zip باندل (چند ده MB)
// دیگر داخل public/downloads کپی نمی‌شود و فقط در فایل‌های گفتگو/میزبان تحویل داده می‌شود.
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const zipName = `center-system-${ms}.zip`;
const outDownload = `/home/z/my-project/download/${zipName}`;

const includes = [
  'wrangler.toml', 'package.json', 'package-lock.json', 'tsconfig.json', 'vitest.config.ts', '.gitignore',
  'README.md', 'CHANGELOG.md',
  'docs',
  'src', 'migrations', 'scripts', 'public'
];

// پاک‌سازی باندل قبلی + نسخهٔ stale داخل public (اگر از قبل مانده باشد)
if (existsSync(outDownload)) rmSync(outDownload);
const stalePublic = path.join(root, 'public', 'downloads', zipName);
if (existsSync(stalePublic)) rmSync(stalePublic);
mkdirSync(path.dirname(outDownload), { recursive: true });

// zip از پوشهٔ scaffold با فهرست include — فقط خودِ باندل و موارد محلی/موقت حذف می‌شوند
// کل public/downloads خارج است (مرکز دانلود با تصاویر گرفته‌شده از دادهٔ سامانه؛
//  مخزن/باندل فقط کد — خواست کاربر برای انتشار عمومی)
const excludes = `-x "node_modules/*" "node_modules" "backups/*" "backups" "public/downloads/*" "public/downloads" "*.dev.vars" ".wrangler/*" ".wrangler" "dist/*" "dist"`;
const argList = includes.join(' ');
execSync(`cd "${root}" && zip -r -q "${outDownload}" ${argList} ${excludes}`, { stdio: 'inherit', shell: '/bin/bash' });

// حذف zipهای قدیمی داخل باندل (اگر لغزیده باشند)
execSync(`cd /tmp && mkdir -p bchk && cd bchk && unzip -o -q "${outDownload}" "public/downloads/*" 2>/dev/null; true`, { shell: '/bin/bash' });
const size = execSync(`stat -c %s "${outDownload}"`).toString().trim();
const count = execSync(`unzip -l "${outDownload}" | tail -1 | awk '{print $2}'`).toString().trim();
console.log(`✓ ${zipName} ساخته شد — ${(size / 1024 / 1024).toFixed(1)}MB، ${count} فایل`);
console.log(`  → ${outDownload}  (تحویل از فایل‌های گفتگو — داخل پرتال سرو نمی‌شود: سقف asset ۲۵MiB)`);

#!/usr/bin/env node
// بامپ هشت‌نقطه‌ای نسخه — مصرف: node scripts/bump-version.mjs <نسخهٔ هدف مثل 1.27.8>
// نسخهٔ فعلی از src/core/version.ts خوانده می‌شود و در همهٔ مکان‌های پین‌شده جایگزین می‌گردد.
// ⚠️ پس از اجرا: باندل مرکزی را بازساز (node scripts/build-central-bundle.mjs) تا APP_VERSION تازه بگیرد.
import { readFileSync, writeFileSync } from 'node:fs';

const target = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(target ?? '')) {
  console.error('مصرف: node scripts/bump-version.mjs <نسخهٔ هدف مثل 1.27.8>');
  process.exit(1);
}

const versionTs = readFileSync('src/core/version.ts', 'utf8');
const current = versionTs.match(/APP_VERSION = '([^']+)'/)?.[1];
if (!current) {
  console.error('نسخهٔ فعلی از src/core/version.ts خوانده نشد');
  process.exit(1);
}
if (current === target) {
  console.error(`نسخهٔ فعلی همان ${target} است — چیزی برای بامپ نیست`);
  process.exit(1);
}

const files = [
  'src/core/version.ts',
  'src/__tests__/front-12561.test.ts',
  'src/__tests__/front-supervisor-readonly.test.ts',
  'src/__tests__/front-ux-pro-max.test.ts',
  'package.json',
  'package-lock.json',
  'public/sw.js', // سوورکر ریشه — گیت «هم‌نسخه‌ای انتشار» (۱.۲۵.۰۱) نسخهٔ نسخهٔ آن را پین کرده
  'desktop/src-tauri/tauri.conf.json',
  'desktop/src-tauri/Cargo.toml',
  'desktop/src-tauri/resources/engine/public/sw.js',
  'desktop/src-tauri/resources/engine/public/index.html',
  'public/index.html',
];

let total = 0;
for (const f of files) {
  const before = readFileSync(f, 'utf8');
  const n = before.split(current).length - 1;
  if (n > 0) writeFileSync(f, before.split(current).join(target));
  total += n;
  console.log(`${f}: ${n} جایگزینی`);
}
console.log(`جمع: ${total} جایگزینی — ${current} → ${target}`);
if (total === 0) {
  console.error('هیچ جایگزینی رخ نداد — شمار مکان‌ها را وارسی کن');
  process.exit(1);
}

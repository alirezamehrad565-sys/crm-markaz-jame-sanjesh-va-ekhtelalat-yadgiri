#!/usr/bin/env node
// بامپ هشت‌نقطه‌ای نسخه — مصرف: node scripts/bump-version.mjs <نسخهٔ هدف مثل 1.27.8>
// نسخهٔ فعلی از src/core/version.ts خوانده می‌شود و در همهٔ مکان‌های پین‌شده جایگزین می‌گردد.
// ⚠️ پس از اجرا: باندل مرکزی را بازساز (node scripts/build-central-bundle.mjs) تا APP_VERSION تازه بگیرد.
import { readFileSync, writeFileSync } from 'node:fs';

const target = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(target ?? '')) {
  console.error('مصرف: node scripts/bump-version.mjs <نسخهٔ هدف مثل 1.27.8> [--from 1.27.18]');
  process.exit(1);
}
// --from: نسخهٔ مبدأ را صریح می‌دهد (وقتی version.ts از قبل دستی بامپ شده یا اجرای دوباره لازم است)
const fromArg = process.argv.includes('--from') ? process.argv[process.argv.indexOf('--from') + 1] : null;
if (process.argv.includes('--from') && !/^\d+\.\d+\.\d+$/.test(fromArg ?? '')) {
  console.error('--from باید نسخهٔ سه‌نقطه‌ای باشد');
  process.exit(1);
}

const versionTs = readFileSync('src/core/version.ts', 'utf8');
const current = versionTs.match(/APP_VERSION = '([^']+)'/)?.[1];
if (!current) {
  console.error('نسخهٔ فعلی از src/core/version.ts خوانده نشد');
  process.exit(1);
}
const old = fromArg ?? current;
if (!fromArg && current === target) {
  console.error(`نسخهٔ فعلی همان ${target} است — چیزی برای بامپ نیست`);
  process.exit(1);
}

const files = [
  'src/core/version.ts',
  'src/__tests__/front-12561.test.ts',
  'src/__tests__/front-supervisor-readonly.test.ts',
  'src/__tests__/front-ux-pro-max.test.ts',
  'src/__tests__/front-12581.test.ts', // v1.27.20 — پین APP_VERSION گیت پیش‌نمایش خانواده (با بامپ خودکار مُهر شود)
  'package.json',
  'package-lock.json',
  'public/sw.js', // سوورکر ریشه — گیت «هم‌نسخه‌ای انتشار» (۱.۲۵.۰۱) نسخهٔ نسخهٔ آن را پین کرده
  // (tauri.conf.json و Cargo.toml از فهرست جایگزینی رشته‌ای بیرون آمدند — v1.27.۱۹:
  //  این دو با «مقدارگذاری» به‌روزشده می‌شوند، بلوک بعد از حلقه)
  'desktop/src-tauri/resources/engine/public/sw.js',
  'desktop/src-tauri/resources/engine/public/index.html',
  'public/index.html',
];

let total = 0;
for (const f of files) {
  let before;
  try {
    before = readFileSync(f, 'utf8');
  } catch {
    // v1.27.۱۹ — کپی‌های resources فقط پس از build-installer-runtime موجودند؛ غایب = بیلد بعدی خودش می‌گیرد
    console.warn(`${f}: غایب — رد شد (بیلد نصاب مقدار تازه را می‌نویسد)`);
    continue;
  }
  const n = before.split(old).length - 1;
  // پین‌های regex با نقطهٔ escape‌شده (مثل '1\.27\.19' در front-12561 — درس ۱.۲۵.۸۰:
  // نقطهٔ بدون escape در regex هر نویسه‌ای را می‌پذیرد) — وگرنه پین escape-شده با بامپ
  // جامانده می‌ماند و گیت vitest در انتشار بعدی سرخ می‌شود
  const escOld = old.split('.').join('\\.');
  const escTarget = target.split('.').join('\\.');
  const escN = escOld !== old ? before.split(escOld).length - 1 : 0;
  if (n + escN > 0) writeFileSync(f, before.split(escOld).join(escTarget).split(old).join(target));
  total += n + escN;
  console.log(`${f}: ${n + escN} جایگزینی`);
}

// v1.27.۱۹ — مهرهای دسکتاپ: جایگزینی رشتهٔ «نسخهٔ فعلی» اگر مهر قبلاً جامانده بود هیچ‌چیز
// پیدا نمی‌کرد و بامپ بی‌صدا رد می‌شد (کلاس گزارش کارفرمای ۱.۲۷.۱۸ — CARGO_PKG_VERSION که
// روی ۱.۲۷.۱۴ ماند و گیت خودآزمایی بوت پوسته «نصب ارتقا ناقص» داد). حالا مقدارگذاری مستقیم
// + هشدار رانش، و گیت scripts/check-versions.mjs (در CI) هم هر ناهم‌مهر می‌گیرد.
const desktopStamps = [
  ['desktop/src-tauri/tauri.conf.json', /"version": "[^"]+"/, /"version": "([^"]+)"/, `"version": "${target}"`, 'tauri.conf.json'],
  ['desktop/src-tauri/Cargo.toml', /(\[package\][\s\S]*?\bversion = ")[^"]+(")/, /\[package\][\s\S]*?\bversion = "([^"]+)"/, `$1${target}$2`, 'Cargo.toml (CARGO_PKG_VERSION)'],
];
for (const [f, reSet, reGet, to, label] of desktopStamps) {
  const before = readFileSync(f, 'utf8');
  const oldVal = before.match(reGet)?.[1];
  if (oldVal && oldVal !== current) {
    console.warn(`⚠ رانش مهر: ${label} روی ${oldVal} بود (نه ${current}) — مقدارگذاری به ${target} (کلاس گزارش کارفرمای ۱.۲۷.۱۸)`);
  }
  if (!reSet.test(before)) {
    console.error(`✗ مهر ${label} یافت نشد — وارسی دستی`);
    process.exit(1);
  }
  writeFileSync(f, before.replace(reSet, to));
  console.log(`${f}: مقدارگذاری ${oldVal ?? '?'} → ${target}`);
  total += 1;
}

console.log(`جمع: ${total} جایگزینی — ${current} → ${target}`);
if (total === 0) {
  console.error('هیچ جایگزینی رخ نداد — شمار مکان‌ها را وارسی کن');
  process.exit(1);
}

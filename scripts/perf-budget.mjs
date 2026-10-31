#!/usr/bin/env node
// گات بودجهٔ کارایی (پیش‌پرواز دیپلوی)
// پیل بوت (گراف استاتیک app.js) و CSS بحرانی و فونت‌ها را با سقف‌های scripts/perf-budget.json می‌سنجد.
// الگوی ratchet: سقف‌ها از خط پایه شروع می‌شوند و فقط سفت‌تر می‌شوند.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const JS_DIR = resolve(ROOT, 'public/assets/js');
const PUB = resolve(ROOT, 'public');
const BUDGETS = JSON.parse(readFileSync(resolve(ROOT, 'scripts/perf-budget.json'), 'utf8'));

function fail(msg) {
  console.error(`✋ بودجهٔ کارایی: ${msg}`);
  process.exit(1);
}

function importsOf(file) {
  const src = readFileSync(file, 'utf8');
  const out = [];
  const reStatic = /^\s*import\s[^'"()]*?from\s*['"](\.[^'"]+)['"]/gm;
  let m;
  while ((m = reStatic.exec(src))) out.push(m[1]);
  return out;
}

// — گراف بوت: از app.js فقط ایمپورت‌های استاتیک (dynamic import یعنی chunk تنبل — خارج از بوت)
const eager = new Set();
const q = [resolve(JS_DIR, 'app.js')];
while (q.length) {
  const file = q.shift();
  if (eager.has(file)) continue;
  eager.add(file);
  for (const spec of importsOf(file)) q.push(resolve(dirname(file), spec));
}

// — : اگر باندل کلاینت ساخته شده، سنجهٔ واقعی بوت = خروجی dist (باندل + چانک‌های لحظهٔ بوت)
//   وگرنه (dev/نخستین build) همان گراف منبع بالا معیار است.
const MANIFEST = resolve(PUB, 'assets/dist/build-manifest.json');
let distBoot = null;
if (existsSync(MANIFEST)) {
  try {
    const mf = JSON.parse(readFileSync(MANIFEST, 'utf8'));
    const names = [mf.boot, ...(mf.bootImports ?? [])];
    const missing = names.filter((n) => !existsSync(resolve(PUB, 'assets/dist', n)));
    if (missing.length) fail(`مانیفست باندل با dist هم‌خوان نیست — فایل نیست: ${missing.join(', ')} (build-client را دوباره اجرا کنید)`);
    // تازگی: index.html باید به boot همین مانیفست ارجاع دهد
    const htmlRef = readFileSync(resolve(PUB, 'index.html'), 'utf8');
    if (!htmlRef.includes(`/assets/dist/${mf.boot}`)) fail(`index.html به boot فعلی (${mf.boot}) ارجاع نمی‌دهد — build-client را دوباره اجرا کنید`);
    distBoot = { names, boot: mf.boot };
  } catch (e) {
    if (String(e).includes('بودجهٔ کارایی')) throw e;
    fail(`مانیفست باندل خوانده نشد: ${e.message ?? e}`);
  }
}

let bootRaw = 0;
let bootGz = 0;
let bootCount = 0;
let vendorInBoot = false;
if (distBoot) {
  for (const n of distBoot.names) {
    const buf = readFileSync(resolve(PUB, 'assets/dist', n));
    bootRaw += buf.length;
    bootGz += gzipSync(buf, { level: 9 }).length;
    bootCount += 1;
    if (/xlsx/i.test(n)) vendorInBoot = true;
  }
} else {
  bootCount = eager.size;
  for (const f of eager) {
    const buf = readFileSync(f);
    bootRaw += buf.length;
    bootGz += gzipSync(buf, { level: 9 }).length;
    vendorInBoot = vendorInBoot || /xlsx/i.test(f);
  }
}
// — CSS بحرانی: همان‌هایی که index.html در head می‌بندد
const html = readFileSync(resolve(PUB, 'index.html'), 'utf8');
const cssFiles = [...html.matchAll(/href="(\/assets\/css\/[^?"]+)/g)].map((m) => resolve(PUB, `.${m[1]}`));
let cssGz = 0;
for (const f of cssFiles) cssGz += gzipSync(readFileSync(f), { level: 9 }).length;

// — فونت‌ها (woff2 خودش فشرده است؛ بایت خام می‌شماریم)
const fontDir = resolve(PUB, 'assets/fonts');
let fontsRaw = 0;
for (const f of readdirSync(fontDir)) if (f.endsWith('.woff2')) fontsRaw += readFileSync(resolve(fontDir, f)).length;

// — جداسازی وندور سنگین: xlsx هرگز نباید در گراف بوت باشد (vendorInBoot بالا در هر دو شاخه پر می‌شود)

const rows = [
  ['boot_js_gz', bootGz, BUDGETS.boot_js_gz, 'بایت gzip'],
  ['eager_modules', bootCount, BUDGETS.eager_modules, 'ماژول'],
  ['critical_css_gz', cssGz, BUDGETS.critical_css_gz, 'بایت gzip'],
  ['fonts_raw', fontsRaw, BUDGETS.fonts_raw, 'بایت خام']
];

let red = false;
for (const [key, value, cap, unit] of rows) {
  const okFlag = value <= cap;
  if (!okFlag) red = true;
  console.log(`   ${okFlag ? '✓' : '✗'} ${key}: ${value.toLocaleString('en-US')} / سقف ${cap.toLocaleString('en-US')} ${unit}`);
}
if (vendorInBoot) {
  red = true;
  console.log('   ✗ vendor سنگین (xlsx) در گراف بوت است — باید on-demand بماند');
} else {
  console.log('   ✓ vendor سنگین (xlsx) بیرون از گراف بوت است');
}
console.log(`   (بوت: ${bootCount} فایل · ${(bootRaw / 1024).toFixed(0)}KB خام → ${(bootGz / 1024).toFixed(0)}KB gzip · CSS ${(cssGz / 1024).toFixed(0)}KB gzip · فونت ${(fontsRaw / 1024).toFixed(0)}KB${distBoot ? ` · مبنای اندازه‌گیری: باندل dist (${distBoot.boot})` : ' · مبنای اندازه‌گیری: گراف منبع (dist ساخته نشده)'})`);

if (red) {
  console.error('✋ بودجهٔ کارایی: سقف شکسته شد — سقف‌ها در scripts/perf-budget.json (فرار اضطراری در دیپلوی: --skip-perf).');
  process.exitCode = 1; // خروج نرم تا stdout کامل بریزد
} else {
  console.log('   بودجهٔ کارایی: ✓');
}

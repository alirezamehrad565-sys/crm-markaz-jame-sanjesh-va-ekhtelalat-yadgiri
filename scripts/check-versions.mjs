// scripts/check-versions.mjs — گیت هم‌خوانی مهرهای نسخه (v1.27.۱۹)
//
// منشأ: گزارش واقعی کارفرمای ۱.۲۷.۱۸ — نصاب تازه با موتور ۱.۲۷.۱۸ اما پوستهٔ
// CARGO_PKG_VERSION=۱.۲۷.۱۴ → گیت خودآزمایی بوت (engine.rs — «نصب ارتقا ناقص») بوت را
// نمی‌گذرد. چرخهٔ بامپ شش‌نقطه‌ای تا آن روز فقط package.json/version.ts/index.html/sw.js
// را جابه‌جا می‌کرد و مهرهای دسکتاپ (Cargo.toml + tauri.conf.json) جامانده بود.
// این گیت در CI (ci.yml + desktop-build.yml) مانع انتشار هر ناهم‌مهر می‌شود:
// همهٔ مهرها باید با منبع یگانه (src/core/version.ts APP_VERSION که manifest نصاب و
// باندل ورکر از آن می‌خوانند) برابر باشند.
//
//   node scripts/check-versions.mjs            → بررسی
//   node scripts/check-versions.mjs --quiet    → فقط نتیجه
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const quiet = process.argv.includes('--quiet');
let bad = 0;

const ok = (m) => { if (!quiet) console.log(`✓ ${m}`); };
const fail = (m) => { console.error(`✗ ${m}`); bad += 1; };

/** منبع یگانه — manifest نصاب و باندل ورکر هر دو از همین می‌خوانند */
const src = readFileSync(path.join(ROOT, 'src/core/version.ts'), 'utf8');
const APP_VERSION = src.match(/APP_VERSION = '([^']+)'/)?.[1];
if (!APP_VERSION) {
  console.error('✗ APP_VERSION از src/core/version.ts خوانده نشد');
  process.exit(1);
}
ok(`منبع یگانه — APP_VERSION: ${APP_VERSION}`);

const packageJson = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
packageJson.version === APP_VERSION
  ? ok(`package.json: ${packageJson.version}`)
  : fail(`package.json: ${packageJson.version} ≠ ${APP_VERSION}`);

const tauri = JSON.parse(readFileSync(path.join(ROOT, 'desktop/src-tauri/tauri.conf.json'), 'utf8'));
tauri.version === APP_VERSION
  ? ok(`tauri.conf.json: ${tauri.version}`)
  : fail(`tauri.conf.json: ${tauri.version} ≠ ${APP_VERSION} — مهر دسکتاپ جامانده (کلاس گزارش کارفرمای ۱.۲۷.۱۸)`);

const cargo = readFileSync(path.join(ROOT, 'desktop/src-tauri/Cargo.toml'), 'utf8');
const cargoVer = cargo.match(/\[package\][\s\S]*?\bversion = "([^"]+)"/)?.[1];
cargoVer === APP_VERSION
  ? ok(`Cargo.toml: ${cargoVer}`)
  : fail(`Cargo.toml: ${cargoVer ?? 'یافت نشد'} ≠ ${APP_VERSION} — CARGO_PKG_VERSION پوسته جامانده`);

const sw = readFileSync(path.join(ROOT, 'public/sw.js'), 'utf8');
const swVer = sw.match(/const VERSION = 'v([^']+)'/)?.[1];
swVer === APP_VERSION
  ? ok(`public/sw.js: v${swVer}`)
  : fail(`public/sw.js: v${swVer ?? 'یافت نشد'} ≠ v${APP_VERSION}`);

const index = readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
const pins = [...index.matchAll(/\?v=([\w.-]+)/g)].map((m) => m[1]);
const stale = pins.filter((v) => v !== APP_VERSION);
if (pins.length === 0) fail('public/index.html: هیچ پین ?v= یافت نشد');
else if (stale.length === 0) ok(`public/index.html: ${pins.length} پین همه @${APP_VERSION}`);
else fail(`public/index.html: ${stale.length} پین کهنه (${[...new Set(stale)].join(', ')}) ≠ ${APP_VERSION}`);

if (bad > 0) {
  console.error(`✗ گیت نسخه‌ها: ${bad} ناهم‌مهر — بامپ با scripts/bump-version.mjs <نسخه> انجام شود`);
  process.exit(1);
}
console.log(`✓ گیت نسخه‌ها سبز شد — همهٔ مهرها @${APP_VERSION}`);

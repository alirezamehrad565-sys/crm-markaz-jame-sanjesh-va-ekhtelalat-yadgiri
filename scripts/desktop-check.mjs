#!/usr/bin/env node
// گیت ساختار دسکتاپ (فاز ۱) — سلامت scaffold خط rust بدون نیاز به toolchain Rust
// استفاده: node scripts/desktop-check.mjs   (npm run desktop:check)
// بررسی‌ها: فایل‌های الزامی، پارس JSON/Cargo، هم‌گامی نسخه با APP_VERSION،
// آیکن واقعی (سربرگ ICO)، capabilities، اسکریپت‌های npm، gitignore بیلد.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const T = path.join(ROOT, 'desktop', 'src-tauri');
const lines = [];
let failed = false;
const ok = (msg) => lines.push(`✓ ${msg}`);
const bad = (msg) => { failed = true; lines.push(`✗ ${msg}`); };
const mustExist = (p, label) => existsSync(p) ? ok(`${label} موجود است`) : bad(`${label} یافت نشد: ${p}`);

// ① فایل‌های الزامی اسکلت
for (const rel of [
  'desktop/src-tauri/tauri.conf.json', 'desktop/src-tauri/Cargo.toml', 'desktop/src-tauri/build.rs',
  'desktop/src-tauri/src/main.rs', 'desktop/src-tauri/src/lib.rs',
  'desktop/src-tauri/capabilities/default.json', 'desktop/src-tauri/icons/icon.ico',
  'desktop/src-tauri/icons/icon.png', 'desktop/README.md', 'docs/rust/design.md', 'docs/rust/phases.md'
]) mustExist(path.join(ROOT, rel), rel);

// ② هم‌گامی نسخه — یک شماره، یک حقیقت (D7 design.md)
const appVersion = readFileSync(path.join(ROOT, 'src', 'core', 'version.ts'), 'utf8')
  .match(/APP_VERSION = '([^']+)'/)?.[1];
let conf = null;
try {
  conf = JSON.parse(readFileSync(path.join(T, 'tauri.conf.json'), 'utf8'));
  conf.version === appVersion
    ? ok(`نسخهٔ tauri.conf.json هم‌گام است (${appVersion})`)
    : bad(`نسخهٔ tauri.conf.json (${conf.version}) با APP_VERSION (${appVersion}) هم‌گام نیست`);
} catch { bad('tauri.conf.json پارس نشد'); }
const cargo = readFileSync(path.join(T, 'Cargo.toml'), 'utf8');
const cargoVer = cargo.match(/^version = "([^"]+)"/m)?.[1];
cargoVer === appVersion
  ? ok('نسخهٔ Cargo.toml هم‌گام است')
  : bad(`نسخهٔ Cargo.toml (${cargoVer}) با APP_VERSION (${appVersion}) هم‌گام نیست`);

// ③ قراردادهای فاز ۲ — frontendDist و loopback
if (conf) {
  conf.build?.frontendDist === '../../public'
    ? ok('frontendDist = ../../public (خروجی build:client در ریشه)')
    : bad('frontendDist باید ../../public باشد (خروجی build:client ریشه است، نه desktop/public)');
  conf.build?.devUrl === 'http://127.0.0.1:8787'
    ? ok('devUrl = loopback:8787')
    : bad('devUrl باید http://127.0.0.1:8787 باشد');
  conf.bundle?.targets?.includes('nsis')
    ? ok('هدف بسته‌بندی NSIS فعال است')
    : bad('NSIS در bundle.targets نیست');
}
existsSync(path.join(ROOT, 'public', 'index.html'))
  ? ok('خروجی کلاینت (public/index.html) حاضر است')
  : bad('public/index.html نیست — build:client را اجرا کنید');

// ④ آیکن واقعی (سربرگ ICO: 00 00 01 00) و حجم معنادار
try {
  const ico = readFileSync(path.join(T, 'icons', 'icon.ico'));
  const magic = ico[0] === 0 && ico[1] === 0 && ico[2] === 1 && ico[3] === 0;
  magic && ico.length > 500
    ? ok(`icon.ico معتبر است (${ico.length}B)`)
    : bad(`icon.ico نامعتبر — magic=${magic} size=${ico.length}`);
} catch { bad('icon.ico خوانده نشد'); }

// ⑤ capabilities — پنجرهٔ main + هستهٔ مجوزها
try {
  const cap = JSON.parse(readFileSync(path.join(T, 'capabilities', 'default.json'), 'utf8'));
  cap.windows?.includes('main') && cap.permissions?.includes('core:default')
    ? ok('capabilities پیش‌فرض درست است')
    : bad('capabilities: پنجرهٔ main یا core:default غایب است');
} catch { bad('capabilities/default.json پارس نشد'); }

// ⑥ اسکریپت‌های npm + gitignore بیلد Rust
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
pkg.scripts?.['desktop:check']
  ? ok('npm run desktop:check سیم‌کشی شده است')
  : bad('اسکریپت desktop:check در package.json نیست');
const gitignore = readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
gitignore.includes('desktop/src-tauri/target/')
  ? ok('gitignore بیلد Rust را پوشش می‌دهد')
  : bad('.gitignore شامل desktop/src-tauri/target/ نیست');

lines.push(failed ? '❌ گیت ساختار دسکتاپ قرمز است' : '✅ گیت ساختار دسکتاپ سبز است');
writeFileSync('/tmp/desktop-check-report.txt', lines.join('\n') + '\n');
console.log(lines.join('\n'));
process.exit(failed ? 1 : 0);

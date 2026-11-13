#!/usr/bin/env node
// گیت ساختار دسکتاپ (فاز ۱) — سلامت scaffold خط rust بدون نیاز به toolchain Rust
// استفاده: node scripts/desktop-check.mjs   (npm run desktop:check)
// بررسی‌ها: فایل‌های الزامی، پارس JSON/Cargo، هم‌گامی نسخه با APP_VERSION،
// آیکن واقعی (سربرگ ICO)، capabilities، اسکریپت‌های npm، gitignore بیلد.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  PINNED_WORKERD_VERSION, TARGET_NPM_PACKAGE, sidecarFileName,
} from './desktop/config.mjs';
import { DATA_DIR_TOKEN, PUBLIC_DIR_TOKEN, AUTH_SECRET_TOKEN } from './engine/config.mjs';

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

// ③ قراردادهای فاز ۲ + v1.26.0 — صفحهٔ بوت و productName ASCII
if (conf) {
  conf.build?.frontendDist === 'boot-dist'
    ? ok('frontendDist = boot-dist (صفحهٔ بوت — v1.26.0)')
    : bad('frontendDist باید boot-dist باشد (صفحهٔ بوت؛ سایت از resources سرو می‌شود)');
  const prod = typeof conf.productName === 'string' ? conf.productName : '';
  /^[\x20-\x7E]+$/.test(prod) && prod.length > 0
    ? ok(`productName ASCII است (${prod}) — مسیر نصب یونیکد workerd را می‌کشد`)
    : bad(`productName باید ASCII باشد — فعلی: «${prod}»`);
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
mustExist(path.join(ROOT, 'desktop/src-tauri/boot-dist/index.html'), 'صفحهٔ بوت boot-dist/index.html');
try {
  const boot = readFileSync(path.join(ROOT, 'desktop', 'src-tauri', 'boot-dist', 'index.html'), 'utf8');
  boot.includes('desktop_status') && boot.includes('engine_retry')
    ? ok('صفحهٔ بوت: قرارداد desktop_status/engine_retry سیم است')
    : bad('صفحهٔ بوت: فرمان‌های desktop_status/engine_retry در آن نیست');
  boot.includes('پیام به سازنده')
    ? ok('صفحهٔ بوت: کنش «پیام به سازنده» هست')
    : bad('صفحهٔ بوت: کنش «پیام به سازنده» غایب است');
} catch { bad('صفحهٔ بوت خوانده نشد'); }

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

// ⑦ rust-f13 — رانتایم نصاب: سایدکار workerd پین‌شده + قالب capnp توکن‌دار + بوت lib.rs
try {
  const installedW = JSON.parse(readFileSync(path.join(ROOT, 'node_modules', 'workerd', 'package.json'), 'utf8')).version;
  installedW === PINNED_WORKERD_VERSION
    ? ok(`pin سایدکار هم‌گام با workerd مخزن (${PINNED_WORKERD_VERSION})`)
    : bad(`pin سایدکار (${PINNED_WORKERD_VERSION}) با workerd مخزن (${installedW}) ناهم‌گام است`);
  sidecarFileName('x86_64-pc-windows-msvc') === 'workerd-x86_64-pc-windows-msvc.exe'
    ? ok('قرارداد نام سایدکار externalBin درست است')
    : bad('قرارداد نام سایدکار نادرست است');
  TARGET_NPM_PACKAGE['x86_64-pc-windows-msvc']
    ? ok('نگاشت هدف ویندوز به بستهٔ npm رسمی workerd ثبت است')
    : bad('نگاشت هدف ویندوز به بستهٔ npm نیست');
  mustExist(path.join(ROOT, 'scripts', 'desktop', 'build-installer-runtime.mjs'), 'build-installer-runtime.mjs');
  const libSrc = readFileSync(path.join(T, 'src', 'lib.rs'), 'utf8');
  for (const t of [DATA_DIR_TOKEN, PUBLIC_DIR_TOKEN, AUTH_SECRET_TOKEN]) {
    libSrc.includes(t) ? ok(`توکن ${t} در lib.rs جایگزین می‌شود`) : bad(`توکن ${t} در lib.rs نیست`);
  }
  libSrc.includes('d1-seed') && libSrc.includes('auth-secret.txt')
    ? ok('بوت نخست: کپی d1-seed + راز per-install در lib.rs سیم است')
    : bad('بوت نخست (d1-seed/راز per-install) در lib.rs کامل نیست');
  // v1.26.0 — وضعیت صریح بوت + فرمان‌های صفحهٔ بوت
  for (const t of ['desktop_status', 'engine_retry', 'open_data_dir']) {
    libSrc.includes(t) ? ok(`فرمان ${t} در lib.rs سیم است`) : bad(`فرمان ${t} در lib.rs نیست`);
  }
  libSrc.includes('EnginePhase::Failed')
    ? ok('وضعیت صریح Failed{message, log_tail} در lib.rs هست')
    : bad('وضعیت صریح بوت (EnginePhase::Failed) در lib.rs نیست');
  existsSync(path.join(T, 'src', 'cf_deploy.rs'))
    ? ok('cf_deploy.rs (ماژول کلادفلر) موجود است')
    : bad('cf_deploy.rs نیست — ماژول کلادفلر v1.26.0 غایب است');
  const engineSrc = readFileSync(path.join(T, 'src', 'engine.rs'), 'utf8');
  engineSrc.includes('binaries') && engineSrc.includes('workerd.log')
    ? ok('engine.rs: کاندیداهای سایدکار + لاگ stderr سایدکار سیم است')
    : bad('engine.rs: کاندیداهای سایدکار یا لاگ سایدکار کامل نیست');
  conf?.bundle?.externalBin?.includes('binaries/workerd')
    ? ok('externalBin = binaries/workerd در tauri.conf')
    : bad('externalBin = binaries/workerd در tauri.conf نیست');
  conf?.bundle?.resources?.includes('resources/engine/**/*')
    ? ok('resources = resources/engine/**/* در tauri.conf')
    : bad('resources = resources/engine/**/* در tauri.conf نیست');
  const wf = readFileSync(path.join(ROOT, '.github', 'workflows', 'desktop-build.yml'), 'utf8');
  wf.includes('build-installer-runtime.mjs')
    ? ok('گردش‌کار CI گام مونتاژ رانتایم نصاب را دارد')
    : bad('گردش‌کار CI گام مونتاژ رانتایم نصاب را ندارد');
  gitignore.includes('desktop/src-tauri/binaries/') && gitignore.includes('desktop/src-tauri/resources/')
    ? ok('gitignore خروجی‌های رانتایم نصاب را پوشش می‌دهد')
    : bad('.gitignore خروجی‌های رانتایم نصاب را پوشش نمی‌دهد');
} catch (e) {
  bad(`بخش rust-f13 خطا داد: ${e instanceof Error ? e.message : String(e)}`);
}

lines.push(failed ? '❌ گیت ساختار دسکتاپ قرمز است' : '✅ گیت ساختار دسکتاپ سبز است');
writeFileSync('/tmp/desktop-check-report.txt', lines.join('\n') + '\n');
console.log(lines.join('\n'));
process.exit(failed ? 1 : 0);

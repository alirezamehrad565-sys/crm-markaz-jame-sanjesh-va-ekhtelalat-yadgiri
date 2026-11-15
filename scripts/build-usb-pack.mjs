#!/usr/bin/env node
// مونتاژ پک توزیع USB (فاز ۵ خط rust) — هم‌الگوی desktop-check.mjs
// استفاده: node scripts/build-usb-pack.mjs   (npm run usb:pack)
//
// رفتار:
//   ① پاک‌سازی و بازسازی کامل dist/usb-pack — اجرای مکرر همان نتیجه (idempotent)
//   ② کپی autorun.inf و README-نصب.txt از desktop/installer/ — قالب متن در مخزن
//      UTF-8 است؛ نسخهٔ داخل پک با CRLF و کدگذاری ویندوزی نوشته می‌شود:
//      autorun.inf → UTF-16 LE با BOM (قالبی که ویندوز ۱۰/۱۱ برای label/action
//      فارسی می‌خواند)، README و VERSION → UTF-8 با BOM (تشخیص قطعی در Notepad)
//   ③ ساخت VERSION.txt از APP_VERSION (src/core/version.ts — «یک شماره، یک حقیقت») + تاریخ شمسی امروز
//   ④ کپی Setup.exe از خروجی NSIS اگر موجود بود؛ وگرنه ردِ صادقانه و ادامه —
//      ساخت نصاب به toolchain Rust روی ویندوز/CI نیاز دارد (docs/rust/installer.md §۳)
//   ⑤ اعتبارسنجی ساختاری چیدمان (فایل‌های الزامی، نام‌های مجاز، محتوای اتوران، سربرگ PE) + گزارش فارسی
import { readFileSync, writeFileSync, existsSync, readdirSync, rmSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const PACK = path.join(ROOT, 'dist', 'usb-pack');
const SRC = path.join(ROOT, 'desktop', 'installer');
const NSIS_DIR = path.join(ROOT, 'desktop', 'src-tauri', 'target', 'release', 'bundle', 'nsis');

const lines = [];
let failed = false;
let warnings = 0;
const ok = (msg) => lines.push(`✓ ${msg}`);
const bad = (msg) => { failed = true; lines.push(`✗ ${msg}`); };
const warn = (msg) => { warnings += 1; lines.push(`⚠ ${msg}`); };
const toCRLF = (t) => t.replace(/\r?\n/g, '\r\n');
const sizeOf = (p) => statSync(p).size;
const fmtB = (n) => `${n.toLocaleString('fa-IR')}B`;

// ① نسخه از منبع — همان قاعدهٔ گیت desktop:check
const appVersion = readFileSync(path.join(ROOT, 'src', 'core', 'version.ts'), 'utf8')
  .match(/APP_VERSION = '([^']+)'/)?.[1];
if (appVersion) ok(`نسخهٔ منبع (APP_VERSION): ${appVersion}`);
else { bad('APP_VERSION در src/core/version.ts خوانده نشد'); }

// تاریخ شمسی امروز (ساعت تهران) — فقط تاریخ، بدون زمان، تا خروجی هم‌روز تکرارپذیر بماند
const now = new Date();
const jalali = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: 'Asia/Tehran', year: 'numeric', month: 'long', day: 'numeric' }).format(now);
const gregorian = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

// ② پاک‌سازی و بازسازی — تضمین idempotent بودن
rmSync(PACK, { recursive: true, force: true });
mkdirSync(PACK, { recursive: true });

// ③ قالب اتوران و راهنما — از منبع مخزن، با کدگذاری ویندوزی
try {
  const autorunSrc = readFileSync(path.join(SRC, 'autorun.inf'), 'utf8');
  writeFileSync(path.join(PACK, 'autorun.inf'), '\ufeff' + toCRLF(autorunSrc), { encoding: 'utf16le' });
  ok('autorun.inf کپی شد (UTF-16 LE با BOM — قالب یونیکد ویندوز ۱۰/۱۱)');
} catch { bad('desktop/installer/autorun.inf خوانده نشد — قالب اتوران الزامی است'); }
try {
  const readmeSrc = readFileSync(path.join(SRC, 'README-نصب.txt'), 'utf8');
  writeFileSync(path.join(PACK, 'README-نصب.txt'), '\ufeff' + toCRLF(readmeSrc), { encoding: 'utf8' });
  ok('README-نصب.txt کپی شد (UTF-8 با BOM + CRLF)');
} catch { bad('desktop/installer/README-نصب.txt خوانده نشد — راهنمای نصب الزامی است'); }

// ④ VERSION.txt — شماره از APP_VERSION + تاریخ شمسی
const versionTxt = [
  'مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام — نسخهٔ میز',
  `نسخه: ${appVersion ?? 'نامشخص'}`,
  `تاریخ ساخت (شمسی): ${jalali}`,
  `تاریخ ساخت (میلادی): ${gregorian}`,
  'منبع نسخه: src/core/version.ts (APP_VERSION) — ساخت با npm run usb:pack',
  ''
].join('\n');
writeFileSync(path.join(PACK, 'VERSION.txt'), '\ufeff' + toCRLF(versionTxt), { encoding: 'utf8' });
ok(`VERSION.txt ساخته شد — ${appVersion ?? '?'} — ${jalali}`);

// ⑤ Setup.exe — از خروجی NSIS اگر موجود بود؛ وگرنه ردِ صادقانه و ادامه (چیدمان کافی است)
let setupCopied = false;
if (existsSync(NSIS_DIR)) {
  const exes = readdirSync(NSIS_DIR).filter((f) => f.toLowerCase().endsWith('.exe')).sort();
  if (exes.length > 0) {
    const pick = exes.find((f) => f.toLowerCase().includes('setup')) ?? exes[exes.length - 1];
    copyFileSync(path.join(NSIS_DIR, pick), path.join(PACK, 'Setup.exe'));
    setupCopied = true;
    ok(`Setup.exe از خروجی NSIS کپی شد (${pick} — ${fmtB(sizeOf(path.join(PACK, 'Setup.exe')))})`);
  } else {
    warn('خروجی NSIS موجود است اما فایل .exe ندارد — Setup.exe به پک اضافه نشد');
  }
} else {
  warn('Setup.exe یافت نشد — خروجی بیلد NSIS در این محیط ساخته نمی‌شود (ساخت نصاب به toolchain Rust روی ویندوز/CI نیاز دارد؛ docs/rust/installer.md §۳). چیدمان بدون نصاب کافی است و پس از نخستین بیلد CI با همان دستور کامل می‌شود.');
}

// ⑥ اعتبارسنجی ساختاری چیدمان
// نام‌های مجاز در ریشهٔ پک — «app» جایگاه آیندهٔ باینری‌های موتور محلی است (design.md §۶؛ از CI)
const ALLOWED = new Set(['autorun.inf', 'VERSION.txt', 'README-نصب.txt', 'Setup.exe', 'app']);
const REQUIRED = ['autorun.inf', 'VERSION.txt', 'README-نصب.txt'];
const entries = readdirSync(PACK);
for (const name of REQUIRED) {
  const p = path.join(PACK, name);
  existsSync(p) && sizeOf(p) > 0
    ? ok(`فایل الزامی حاضر است: ${name} (${fmtB(sizeOf(p))})`)
    : bad(`فایل الزامی غایب یا خالی است: ${name}`);
}
const strays = entries.filter((f) => !ALLOWED.has(f));
strays.length === 0
  ? ok('هیچ فایل ناشناسی در ریشهٔ پک نیست')
  : bad(`فایل نامجاز در چیدمان: ${strays.join('، ')}`);

// محتوای اتوران — چهار سطر الزامی قالب استاندارد ویندوز
try {
  const deployed = readFileSync(path.join(PACK, 'autorun.inf'), 'utf16le').replace(/^\ufeff/, '');
  const need = ['[autorun]', 'open=Setup.exe', 'icon=Setup.exe,0', 'label=مرکز جامع — نسخهٔ میز', 'action=نصب نسخهٔ میز'];
  const missing = need.filter((l) => !deployed.split(/\r?\n/).map((s) => s.trim().replace(/^;\s*/, '')).includes(l));
  missing.length === 0
    ? ok('محتوای autorun.inf کامل است (open/icon/label/action)')
    : bad(`سطرهای الزامی autorun.inf غایب‌اند: ${missing.join(' | ')}`);
} catch { bad('autorun.inf داخل پک خوانده نشد'); }

// VERSION.txt — همگامی با APP_VERSION
try {
  const vt = readFileSync(path.join(PACK, 'VERSION.txt'), 'utf8');
  appVersion && vt.includes(`نسخه: ${appVersion}`)
    ? ok('VERSION.txt با APP_VERSION هم‌گام است')
    : bad('VERSION.txt شمارهٔ APP_VERSION را ندارد');
  /\(شمسی\): \S/.test(vt) ? ok('VERSION.txt تاریخ شمسی دارد') : bad('VERSION.txt تاریخ شمسی ندارد');
} catch { bad('VERSION.txt خوانده نشد'); }

// راهنما — سرفصل‌های الزامی راهنمای نصب
try {
  const rd = readFileSync(path.join(PACK, 'README-نصب.txt'), 'utf8');
  const needHead = ['پیش‌نیاز', 'نصب', 'AppData', 'بروزرسانی', 'حذف', 'پشتیبان', 'عیب‌یابی'];
  const missHead = needHead.filter((h) => !rd.includes(h));
  missHead.length === 0
    ? ok('README-نصب.txt همهٔ سرفصل‌های الزامی را دارد')
    : bad(`README-نصب.txt فاقد سرفصل: ${missHead.join('، ')}`);
} catch { bad('README-نصب.txt داخل پک خوانده نشد'); }

// Setup.exe — سربرگ PE (MZ) اگر کپی شده باشد
if (setupCopied) {
  const mz = readFileSync(path.join(PACK, 'Setup.exe')).subarray(0, 2).toString('latin1') === 'MZ';
  mz ? ok('Setup.exe سربرگ PE معتبر دارد (MZ)') : bad('Setup.exe سربرگ PE ندارد — کپی خراب است');
}

// ⑦ گزارش نهایی
const layout = entries.length > 0
  ? entries.map((f) => `  • ${f}  (${fmtB(sizeOf(path.join(PACK, f)))})`).join('\n')
  : '  (خالی)';
console.log(lines.join('\n'));
console.log('');
console.log(`چیدمان نهایی dist/usb-pack — نسخهٔ ${appVersion ?? '?'} — ${jalali}:`);
console.log(layout);
console.log('');
if (failed) {
  console.log('✗ پک USB رد شد — خطاهای بالا را برطرف کنید.');
  process.exit(1);
}
console.log(warnings > 0
  ? `✓ پک USB با ${warnings.toLocaleString('fa-IR')} هشدار ساخته شد — چیدمان معتبر؛ بخش‌های هشدارداده‌شده پس از بیلد CI تکمیل می‌شوند.`
  : '✓ پک USB کامل و معتبر است.');

#!/usr/bin/env node
// گیت «زبان کاربر» — بازسازی گیت ماشینی واژگان رشته‌های رندرشوندهٔ UI (که در هم‌گامی گم شده بود)
//
// اجرا: node scripts/ui-voice-check.mjs   (npm run ui-voice-check — به انتهای scripts/desktop-check.mjs سیم شده)
// دامنهٔ پویش: همهٔ public/assets/js/**/*.js (شامل پوشهٔ views).
//   toast فقط در public/assets/js/ui.js تعریف می‌شود و مصرف آن (۶۰۰+ نقطه) فقط در همین درخت است؛
//   پس هر رشته‌ای که به کاربر می‌رسد در همین درخت است و پویش src/ لازم نیست.
//
// روش: اسکنر کاراکتری سبک — بدون پارس AST — با حالت‌های code / ' / " / template / expr.
//   • فقط متن داخل نقل‌قول‌ها سنجیده می‌شود؛ محتوای // و /* */ هرگز.
//   • کد ${...} از متن قالب جدا می‌شود (پشتهٔ expr) ولی رشته‌های داخلش هم جمع می‌شوند.
//   • regex literal با تشخیص «regex یا تقسیم» از روی توکن قبلی درست پرش می‌شود
//     (نمونه‌های واقعی: views/finance.js «/[",\n\r]/»، excel-import.js «/[\\/:*?"<>|]/»، format.js «/^https?:\/\//i»).
//   • دفاعی: فایل‌های health-panel/finance/center-kpi هم‌زمان توسط دیگران ویرایش می‌شوند؛
//     نیم‌رشته یا نحو شکسته هرگز اسکنر را نمی‌کشد (bail در سرخطِ رشتهٔ شکسته و انتهای فایل).
//
// لیست سفید دولایه:
//   ① خطی که به کامنت `// ui-voice: ok` ختم شود رد می‌شود؛
//   ② آرایهٔ ALLOW در پایین — رشتهٔ دقیق + دلیل، تطبیق «شامل بودن» (دوطرفه).
//
// خروجی: file:line + تکهٔ کوتاه رشته + توکن + دلیل؛ جمع در انتها.
// کد خروج: ۰ = بدون یافتهٔ خارج از لیست سفید؛ ۱ = یافتهٔ قرمز؛ ۲ = خطای پیکربندی (پوشهٔ ناموجود).
//
// هوک‌های آزمون (متغیر محیطی):
//   UI_VOICE_DIR     → پوشهٔ پویش را جایگزین می‌کند (مطلق، یا نسبی به cwd) — برای آزمون با فیکسچر.
//   UI_VOICE_NO_MAIN → اجرای خودکار main() خاموش می‌شود؛ آزمون‌ها runScan/collectStrings را
//                      import می‌کنند و بدون process.exit نتیجهٔ ساختاریافته می‌گیرند.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const ZWNJ = '\u200c'; // نیم‌فاصلهٔ برنامه‌نویسی‌شده — تا نویسهٔ نامرئی در خودِ این فایل جامانده نباشد

// توکن‌های ممنوعه — هر یک با دلیل (چرا در رشتهٔ رندرشوندهٔ UI ممنوع است). لاتین‌ها بی‌حس به بزرگ/کوچکی.
const TOKENS = [
  { tok: 'جایگزین ' + '\u00ab', reason: 'روایت بازآرایی با الگوی «جایگزینِ «X»» (نام مؤلفه در گیومه) — جای این روایت CHANGELOG و پیام کامیت است، نه رشتهٔ UI؛ واژهٔ «جایگزین» در جملهٔ عادی فارسی مجاز است' },
  { tok: 'حذف' + ZWNJ + 'شده', reason: 'روایت بازآرایی و تاریخچهٔ نسخه — جایش CHANGELOG است، نه رشتهٔ UI' },
  { tok: 'درگاه', reason: 'واژهٔ فنی پیاده‌سازی (مسیر/پورت) — معادل سادهٔ فارسی می‌گیرد یا حذف می‌شود' },
  { tok: 'پاکت', reason: 'واژهٔ فنی پیاده‌سازی (packet/رسپانس سرور) — معادل سادهٔ فارسی می‌گیرد یا حذف می‌شود' },
  { tok: 'بایندینگ', reason: 'ژاژخان فنی — معادل سادهٔ فارسی می‌گیرد یا حذف می‌شود' },
  { tok: 'adapter', ci: true, reason: 'واژهٔ فنی پیاده‌سازی (لاتین) — معادل ساده می‌گیرد یا حذف می‌شود' },
  { tok: 'workerd', ci: true, reason: 'نام باینری داخلی — هرگز نباید به کاربر برسد' },
  { tok: 'سایدکار', reason: 'واژهٔ فنی پیاده‌سازی (sidecar) — معادل سادهٔ فارسی می‌گیرد یا حذف می‌شود' },
  { tok: 'پاریتی', reason: 'ژاژخان فنی (parity) — معادل سادهٔ فارسی می‌گیرد یا حذف می‌شود' },
  /* ۱.۲۷.۵۵ — ممیزی واژگانی پروندهٔ دانش‌آموز (درخواست کارفرما: هیچ واژهٔ ساخته‌شدهٔ طراحی به کاربر نرسد).
     این پنج واژه در UI پرونده اصلاح شدند و از این‌جا به بعد ممنوع‌اند — قرارداد در docs/PROFILE-GLOSSARY.md */
  { tok: 'روایت پرونده', reason: 'واژهٔ طراحی (narrative) — واژهٔ روزمرهٔ «تاریخچهٔ پرونده» جایگزین شد؛ تب هم «تاریخچه» است و باید یکی بماند' },
  { tok: 'نسخه' + ZWNJ + 'دار', reason: 'واژهٔ طراحی (versioned) — «گزارش قطعی» جایگزین شد؛ شماره/تاریخ قطعی خودش گویاست' },
  { tok: 'نسخهٔ قطعی', reason: 'هم‌خانوادهٔ «نسخه‌دار» — «گزارش قطعی» جایگزین شد' },
  { tok: 'سررسیده' + ZWNJ + 'گذشته', reason: 'ترکیب سنگین و نامأنوس — «عقب‌افتاده» جایگزین شد (سررسید به‌عنوان ستون تاریخ می‌ماند)' },
  { tok: 'مطابقت محتوا', reason: 'ترجمهٔ خام hash match — «اصالت سند» جایگزین شد؛ جزئیات کد کنترل در tooltip است' },
  { tok: 'قطعی' + ZWNJ + 'سازی', reason: 'اسم مصدر فنی — در UI «صدور گزارش قطعی» جایگزین می‌شود؛ فقط در مستندات مجاز است' },
];

// لایهٔ دوم لیست سفید — رشتهٔ دقیق + دلیل؛ تطبیق «شامل بودن» دوطرفه (اگر یکی شامل دیگری باشد).
// نمونهٔ ثبت‌شده:
//   { str: 'متن دقیق رشتهٔ مجاز، یا تکه‌ای از آن', reason: 'چرا این استثنا تأیید شده است' },
const ALLOW = [
  { str: 'درگاه‌های CP فقط در کنترل‌پلین', reason: 'واژهٔ «درگاه» در بخش کنترل‌پلین = واژهٔ محصول CP (حکم م۲۱۰ «هشدار فقط-CP»)، نه ژاژخان پیاده‌سازی' },
  { str: 'همهٔ درگاه‌ها و شمارنده‌ها زیر آستانه‌اند', reason: 'واژهٔ محصول CP — جدول درگاه‌های کنترل‌پلین' },
  { str: 'درگاه سالم', reason: 'واژهٔ محصول CP — بج سلامت درگاه‌های کنترل‌پلین' },
  { str: 'لینک کنترل‌پلین — شش درگاه', reason: 'واژهٔ محصول CP — سربرگ بخش لینک کنترل‌پلین' },
  { str: 'هر درگاه «آخرین موفقیت» خودش را', reason: 'واژهٔ محصول CP — توضیح مُهر سلامت درگاه‌های کنترل‌پلین' },
];

// کلمات کلیدی — پیش از آن‌ها «/» آغاز regex است نه تقسیم
const REGEX_KEYWORDS = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
  'do', 'else', 'case', 'yield', 'await', 'throw',
]);

// تصمیم regex/تقسیم از روی توکن قبلی: شناسهٔ کلیدواژه یا عملگر/واژه‌ساز → regex؛
// پس از مقدار پایانی ( ')' و ']' و شناسهٔ معمولی و رشته ) → تقسیم. «}» واژه‌ساز فرض می‌شود.
function isRegexStart(tok) {
  if (!tok) return true; // ابتدای فایل یا بلافاصله پس از ${ — regex مجاز
  if (tok.kind === 'ident') return REGEX_KEYWORDS.has(tok.word);
  return !')]'.includes(tok.ch);
}

// اسکنر کاراکتری: فقط متن نقل‌قول‌ها را جمع می‌کند؛ کامنت/regex/کدِ ${...} را می‌پرد.
// خروجی: [{ line: شمارهٔ خط آغاز رشته, text: متن رشته }]
export function collectStrings(src) {
  const out = [];
  const n = src.length;
  let i = 0;
  let line = 1;
  let mode = 'code'; // code | single | double | template | regex | line | block
  let strLine = 0; // خط آغاز رشتهٔ جاری
  let cur = ''; // متن جمع‌شدهٔ رشتهٔ جاری
  let tok = null; // آخرین توکن معنادار — { kind:'ident', word } یا { kind:'other', ch }
  let inClass = false; // داخل کلاس کاراکتر regex (داخل []، «/» پایان‌دهنده نیست)
  const expr = []; // پشتهٔ ${...} — هر عضو: عمق آکولاد بازِ همان expr
  const push = () => { if (cur !== '') out.push({ line: strLine, text: cur }); cur = ''; };
  while (i < n) {
    const c = src[i];
    if (c === '\n') line++;
    // ---- رشته‌های یک‌نقل‌قلی ----
    if (mode === 'single' || mode === 'double') {
      if (c === '\\') { if (src[i + 1] === '\n') line++; i += 2; continue; } // گریز — هر دو نویسه می‌پرد
      if (c === '\n') { push(); mode = 'code'; continue; } // رشتهٔ شکسته — دفاعی؛ همگامی حفظ می‌شود
      if (c === (mode === 'single' ? "'" : '"')) { push(); mode = 'code'; tok = { kind: 'other', ch: ')' }; i++; continue; }
      cur += c; i++; continue;
    }
    // ---- متن قالب template ----
    if (mode === 'template') {
      if (c === '\\') { if (src[i + 1] === '\n') line++; i += 2; continue; }
      if (c === '`') { push(); mode = 'code'; tok = { kind: 'other', ch: ')' }; i++; continue; }
      if (c === '$' && src[i + 1] === '{') { push(); mode = 'code'; expr.push(0); tok = null; i += 2; continue; }
      cur += c; i++; continue;
    }
    // ---- regex literal — محتوایش هرگز جمع نمی‌شود ----
    if (mode === 'regex') {
      if (c === '\\') { if (src[i + 1] === '\n') line++; i += 2; continue; }
      if (c === '\n') { mode = 'code'; inClass = false; continue; } // regex چندخطی نیست — دفاعی
      if (c === '[') { inClass = true; i++; continue; }
      if (c === ']') { inClass = false; i++; continue; }
      if (c === '/' && !inClass) { mode = 'code'; tok = { kind: 'other', ch: ')' }; i++; continue; } // پس از regex، «/» بعدی تقسیم است
      i++; continue;
    }
    // ---- کامنت‌ها — محتوایشان هرگز ----
    if (mode === 'line') { if (c === '\n') mode = 'code'; i++; continue; } // کامنت خطی با سرخط بسته می‌شود
    if (mode === 'block') {
      if (c === '*' && src[i + 1] === '/') { mode = 'code'; i += 2; continue; }
      i++; continue;
    }
    // ---- حالت کد (هم ریشهٔ فایل، هم داخل ${...}) ----
    if (/[A-Za-z0-9_$]/.test(c)) {
      tok = tok && tok.kind === 'ident' ? { kind: 'ident', word: tok.word + c } : { kind: 'ident', word: c };
      i++; continue;
    }
    if (/[\s\u200b-\u200f]/.test(c)) { i++; continue; } // نویسه‌های بی‌اثر (فاصله و علائم جهت‌دهی) — توکن قبلی حفظ می‌شود
    if (c === '/' && src[i + 1] === '/') { mode = 'line'; i += 2; continue; } // کامنت بدون به‌هم‌زدن توکن قبلی
    if (c === '/' && src[i + 1] === '*') { mode = 'block'; i += 2; continue; }
    if (c === '/' && isRegexStart(tok)) { mode = 'regex'; inClass = false; i++; continue; }
    if (c === "'" || c === '"') { mode = c === "'" ? 'single' : 'double'; strLine = line; cur = ''; i++; continue; }
    if (c === '`') { mode = 'template'; strLine = line; cur = ''; i++; continue; }
    if (c === '{' && expr.length) { expr[expr.length - 1]++; tok = { kind: 'other', ch: c }; i++; continue; }
    if (c === '}' && expr.length) {
      if (expr[expr.length - 1] === 0) { expr.pop(); mode = 'template'; tok = null; i++; continue; } // بازگشت به متن قالب
      expr[expr.length - 1]--; tok = { kind: 'other', ch: c }; i++; continue;
    }
    tok = { kind: 'other', ch: c };
    i++;
  }
  push(); // رشتهٔ ناتمامِ انتهای فایل هم ثبت شود (فایل نیم‌نوشته — دفاعی)
  return out;
}

// تکهٔ کوتاه حول نخستین جای‌گیری توکن — برای خوانایی گزارش
function snippet(text, idx, len) {
  const start = Math.max(0, idx - 24);
  const end = Math.min(text.length, idx + len + 24);
  return (start > 0 ? '…' : '') + text.slice(start, end).replace(/\s+/g, ' ') + (end < text.length ? '…' : '');
}

// جستجوی بی‌حس به بزرگی حرف؛ اگر lowercase طول را عوض کرد (یونیکد نادر) به جستجوی دقیق برمی‌گردیم
function indexOfToken(text, tok, ci) {
  if (!ci) return text.indexOf(tok);
  const hay = text.toLowerCase();
  if (hay.length !== text.length) return text.indexOf(tok);
  return hay.indexOf(tok.toLowerCase());
}

// گام پویش یک فایل → ردیف‌های گزارش این فایل
function scanFile(file, dir) {
  const rel = path.relative(dir, file);
  let src;
  try {
    src = readFileSync(file, 'utf8');
  } catch (e) {
    return { lines: [`✗ ${rel}:0 — فایل خوانده نشد: ${e instanceof Error ? e.message : String(e)}`], red: 1, strings: 0 };
  }
  let strings;
  try {
    strings = collectStrings(src);
  } catch (e) {
    return { lines: [`✗ ${rel}:0 — اسکن کرش کرد: ${e instanceof Error ? e.message : String(e)}`], red: 1, strings: 0 };
  }
  const srcLines = src.split('\n');
  const rows = [];
  let red = 0;
  for (const s of strings) {
    for (const t of TOKENS) {
      const idx = indexOfToken(s.text, t.tok, t.ci);
      if (idx === -1) continue;
      const phys = s.line + (s.text.slice(0, idx).split('\n').length - 1); // خط واقعی جای‌گیری توکن
      const snip = snippet(s.text, idx, t.tok.length);
      // لایهٔ ① — خطی که به کامنت `// ui-voice: ok` ختم شود رد می‌شود
      if ((srcLines[phys - 1] ?? '').trimEnd().endsWith('// ui-voice: ok')) {
        rows.push(`… ${rel}:${phys} «${snip}» ← توکن «${t.tok}» — لیست سفید لایهٔ ① (ui-voice: ok)`);
        continue;
      }
      // لایهٔ ② — ALLOW با تطبیق شامل بودن دوطرفه
      const allow = ALLOW.find((a) => s.text.includes(a.str) || a.str.includes(s.text));
      if (allow) {
        rows.push(`… ${rel}:${phys} «${snip}» ← توکن «${t.tok}» — لیست سفید لایهٔ ② (ALLOW: ${allow.reason})`);
        continue;
      }
      rows.push(`✗ ${rel}:${phys} «${snip}» ← توکن «${t.tok}» — ${t.reason}`);
      red++;
    }
  }
  return { lines: rows, red, strings: strings.length };
}

// پیمایش بازگشتی *.js زیر یک پوشه (مرتب، برای خروجی پایدار)
function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile() && e.name.endsWith('.js')) out.push(p);
  }
  return out.sort();
}

// پویش کامل یک پوشه — بدون process.exit؛ برای آزمون (هوک UI_VOICE_NO_MAIN) هم ساختار کامل برمی‌گرداند
export function runScan(dir = process.env.UI_VOICE_DIR
  ? path.resolve(process.env.UI_VOICE_DIR)
  : path.join(ROOT, 'public', 'assets', 'js')) {
  const files = walk(dir);
  const out = [];
  let red = 0;
  let strings = 0;
  for (const f of files) {
    const r = scanFile(f, dir);
    out.push(...r.lines);
    red += r.red;
    strings += r.strings;
  }
  const head = red === 0
    ? `✓ گیت زبان کاربر سبز است — ${files.length} فایل، ${strings} رشتهٔ رندرشونده، یافتهٔ قرمز: ۰`
    : `✗ گیت زبان کاربر قرمز است — ${files.length} فایل، ${strings} رشتهٔ رندرشونده، ${red} یافتهٔ قرمز`;
  return { lines: [...out, head], red, files: files.length, strings, dir };
}

export function main() {
  const dir = process.env.UI_VOICE_DIR ? path.resolve(process.env.UI_VOICE_DIR) : path.join(ROOT, 'public', 'assets', 'js');
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
    console.error(`✗ پوشهٔ پویش یافت نشد: ${dir}`);
    process.exit(2);
  }
  const r = runScan(dir);
  for (const l of r.lines) console.log(l);
  process.exit(r.red === 0 ? 0 : 1);
}

// هوک آزمون: با UI_VOICE_NO_MAIN=1 اسکریپت اجرای خودکار را خاموش می‌کند (برای import در آزمون‌ها)
if (!process.env.UI_VOICE_NO_MAIN) main();

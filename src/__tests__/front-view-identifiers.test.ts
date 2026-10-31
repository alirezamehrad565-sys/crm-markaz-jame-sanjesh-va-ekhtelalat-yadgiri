/**
 * تست‌های رگرسیون لایهٔ فرانت (فاز ۰ ممیزی کیفیت UI):
 * ۱) «شناسه‌های تعریف‌شده در نماها» — یاریگر مشترک استفاده‌شده ولی import نشده
 *    (کلاس باگ S1-01: toast/toastError بدون import در داشبورد — مسیر ذخیره بی‌بازخورد می‌افتاد)
 * ۲) «متن خطا» — errorStateMessage باید پیام واقعی را نگه دارد، نه «خطای غیرمنتظره»
 *    (کلاس باگ S1-32/S9-01: رشته به errorState می‌رسید و دور ریخته می‌شد)
 * ۳) escapeHtml — تک‌کاراکترهای < > & " باید فرار شوند
 *    (کلاس باگ S7-13: regex فقط جفت‌دوتایی می‌گرفت و به سند چاپی تزریق می‌شد)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// @ts-ignore — فایل.js فرانت، خارج از include تایپ‌اسکریپت است
import { errorStateMessage } from '../../public/assets/js/ui.js';
// @ts-ignore
import { escapeHtml } from '../../public/assets/js/format.js';

const FRONT = join(__dirname, '../../public/assets/js');

// ─── ابزار: جمع‌آوری همهٔ فایل‌های js فرانت ───
function walkJsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkJsFiles(p));
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

/** حذف رشته‌ها، کامنت‌ها و regex literalها — تا محتوای متنی (مثل lang="fa") یافتهٔ کاذب نسازد */
function stripStringsAndComments(src: string): string {
  let out = '';
  let i = 0;
  let mode: 'code' | 'line' | 'block' | 'single' | 'double' | 'template' | 'regex' = 'code';
  const lastCodeChar = () => out.replace(/\s+/g, ' ').trim().slice(-1);
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (mode === 'code') {
      if (c === '/' && next === '/') { mode = 'line'; i += 2; continue; }
      if (c === '/' && next === '*') { mode = 'block'; i += 2; continue; }
      if (c === "'") { mode = 'single'; i += 1; continue; }
      if (c === '"') { mode = 'double'; i += 1; continue; }
      if (c === '`') { mode = 'template'; i += 1; continue; }
      // regex literal — بعد از ( , = : [ ! & | ? { ; یا آغاز فایل (هیوریستیک استاندارد جداکنندهٔ تقسیم/regex)
      if (c === '/' && '([=,:![&|?{;'.includes(lastCodeChar() || ';')) {
        mode = 'regex'; i += 1; continue;
      }
      out += c; i += 1; continue;
    }
    if (mode === 'line') { if (c === '\n') { mode = 'code'; out += '\n'; } i += 1; continue; }
    if (mode === 'block') { if (c === '*' && next === '/') { mode = 'code'; i += 2; } else { if (c === '\n') out += '\n'; i += 1; } continue; }
    if (mode === 'single') { if (c === '\\') { i += 2; continue; } if (c === "'") { mode = 'code'; out += ' '; } i += 1; continue; }
    if (mode === 'double') { if (c === '\\') { i += 2; continue; } if (c === '"') { mode = 'code'; out += ' '; } i += 1; continue; }
    if (mode === 'regex') {
      if (c === '\\') { i += 2; continue; }
      if (c === '[') { // کلاس نویسه — داخلش / بسته نمی‌کند
        i += 1;
        while (i < src.length && src[i] !== ']') { if (src[i] === '\\') i += 1; i += 1; }
        i += 1; continue;
      }
      if (c === '/') { mode = 'code'; out += ' '; } // پرچم‌ها (g, i, ...) حرفی‌اند و بی‌خطر
      i += 1; continue;
    }
    // template — backtick تو در تو را ساده نگه می‌داریم (در این کدبیس template تودرتو نداریم)
    if (mode === 'template') { if (c === '\\') { i += 2; continue; } if (c === '`') { mode = 'code'; out += ' '; } i += 1; continue; }
  }
  return out;
}

// ─── استخراج صادرات ماژول‌های مشترک (تنظیم «قواعد شناخته‌شده») ───
const SHARED_MODULES = ['ui.js', 'format.js', 'api.js', 'state.js', 'charts.js', 'session-type.js', 'staff-hue.js'];
function exportsOfModule(filePath: string): string[] {
  const src = stripStringsAndComments(readFileSync(filePath, 'utf8'));
  const names = new Set<string>();
  for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s+const\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s+let\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s+\{([^}]+)\}/g)) {
    for (const part of m[1].split(',')) {
      const n = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (n && /^[A-Za-z_$][\w$]*$/.test(n)) names.add(n);
    }
  }
  return [...names];
}

const SHARED_EXPORTS: Record<string, string[]> = {};
for (const mod of SHARED_MODULES) {
  SHARED_EXPORTS[mod] = exportsOfModule(join(FRONT, mod));
}

// ─── برای هر فایل: نام‌های import‌شده + نام‌های محلی ───
function importedNames(src: string): Set<string> {
  const names = new Set<string>();
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from/g)) {
    for (const part of m[1].split(',')) {
      const n = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (n) names.add(n);
    }
  }
  for (const m of src.matchAll(/import\s+(?:\*\s+as\s+)?([A-Za-z_$][\w$]*)\s+from/g)) names.add(m[1]);
  return names;
}

function localNames(src: string): Set<string> {
  const names = new Set<string>();
  for (const m of src.matchAll(/(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/(?:const|let|var)\s*\{([^}]+)\}\s*=/g)) {
    for (const part of m[1].split(',')) {
      const n = part.trim().split(':').pop()?.trim();
      if (n && /^[A-Za-z_$][\w$]*$/.test(n)) names.add(n);
    }
  }
  for (const m of src.matchAll(/class\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  return names;
}

describe('شناسه‌های تعریف‌شده در نماها (کلاس باگ toast-بدون-import)', () => {
  it('هیچ فایل فرانتی یاریگر مشترک شناخته‌شده را بدون import استفاده نمی‌کند', () => {
    const files = walkJsFiles(FRONT).filter((f) => !SHARED_MODULES.some((m) => f.endsWith(`/${m}`)));
    const violations: string[] = [];

    for (const file of files) {
      const raw = readFileSync(file, 'utf8');
      const src = stripStringsAndComments(raw);
      const imported = importedNames(src);
      const local = localNames(src);
      const rel = file.replace(FRONT + '/', '');

      for (const [mod, helpers] of Object.entries(SHARED_EXPORTS)) {
        if (file.endsWith(mod)) continue; // خود ماژول صاحبِ نام است
        for (const h of helpers) {
          if (imported.has(h) || local.has(h)) continue;
          // ارجاع واقعی: مرز کلمه، نه عضویت (بدون نقطهٔ قبل) و نه کلید شیء (name:)
          const refRe = new RegExp(`(?<![\\w$.'"\`])${h}\\s*(?![\\w$:])(?!\\s*:)`);
          if (refRe.test(src)) violations.push(`${rel}: «${h}» از ${mod} استفاده شده ولی import نشده است`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

describe('متن خطا (تابلوی پیشرفت S1-32/S9-01)', () => {
  it('رشتهٔ صریحِ فراخوانی قدیمی دور ریخته نمی‌شود', () => {
    expect(errorStateMessage('خطا در دریافت تابلو')).toBe('خطا در دریافت تابلو');
  });
  it('AppError سرور ({message}) به پیام واقعی نگاشت می‌شود', () => {
    expect(errorStateMessage({ message: 'خطا در دریافت تابلو' })).toBe('خطا در دریافت تابلو');
    expect(errorStateMessage(new Error('پاسخ سرور'))).toBe('پاسخ سرور');
  });
  it('نبودِ پیام → پیش‌فرض «خطای غیرمنتظره» (یا fallback فراخوان)', () => {
    expect(errorStateMessage(undefined)).toBe('خطای غیرمنتظره');
    expect(errorStateMessage({})).toBe('خطای غیرمنتظره');
    expect(errorStateMessage({}, 'پیام جانشین')).toBe('پیام جانشین');
  });
});

describe('escapeHtml (فرار چاپ S7-13)', () => {
  it('تک‌کاراکترهای خطرناک فرار می‌شوند — حتی وقتی تنها می‌آیند', () => {
    expect(escapeHtml('<b>')).toBe('&lt;b&gt;');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
    expect(escapeHtml('他说"سلام"')).toBe('他说&quot;سلام&quot;');
    expect(escapeHtml('<script>&"')).toBe('&lt;script&gt;&amp;&quot;');
  });
  it('null/undefined → رشتهٔ خالی؛ متن سالم دست‌نخورده', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml('گزارش پیشرفت — ۱۴۰۴')).toBe('گزارش پیشرفت — ۱۴۰۴');
  });
  it('نسخهٔ format.js همان رفتار را دارد (تک‌منبع)', () => {
    expect(escapeHtml('<&"')).toBe('&lt;&amp;&quot;');
  });
});

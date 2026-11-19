#!/usr/bin/env node
// گیت کنتراست AA توکن‌های پالت — هر دو تم (روشن/تیره)، فقط دامنهٔ صفحه
//
// اجرا: node scripts/contrast-check.mjs   (npm run contrast-check — به scripts/desktop-check.mjs بلوک ⑬ سیم شده)
// منبع: public/assets/css/base.css — توکن‌ها از بلاک‌های :root پارس می‌شوند؛ هر قاعدهٔ at-level
//   (@media print / prefers-reduced-motion / @font-face) با توازن آکولاد «کلاً» نادیده گرفته می‌شود
//   (بلاک چاپِ views.css هم بیرون دامنهٔ این گیت است — گیت آینهٔ چاپ: front-print-tokens.test.ts).
//
// تقسیم کار با گیت‌های موجود (هم‌پوشانی عمدی ندارد):
//   • جفت‌های view-سطح (هیت‌مپ، login__error، لینک‌های خاص) در src/__tests__/front-contrast.test.ts پین‌اند؛
//   • این گیت پوشش «توکنیِ» هر دو تم را می‌دهد: جفت‌های واقعاً مصرف‌شدهٔ اپ —
//     پس‌زمینهٔ صفحه، سطح کارت، سطح ۲/۳، مرزها، دکمهٔ اصلی/ثانویه/تونل، بج‌های توکنی، لینک و حلقهٔ فوکوس.
//
// آستانه‌ها (WCAG 2.x — AA): متن عادی ≥۴٫۵ · متن‌درشت/مؤلفهٔ UI و مرز ≥۳٫۰
//   (متن بدنه روی کارت: هدف مأموریت ≥۷ — سخت‌گیرانه‌تر از AA پین شده است.)
//
// خروجی: جدول «جفت × تم × نسبت × وضعیت» + جمع؛ وضعیت‌ها: ✓ سبز · ✗ قرمز · … مجازِ ثبت‌شده
//   (تخلفِ تمی که در allow جفت با دلیل ثبت شده — الگوی ALLOW در ui-voice-check و front-print-tokens).
// کد خروج: ۰ = همه سبز/مجاز · ۱ = حداقل یک تخلف واقعی · ۲ = خطای پیکربندی (توکن/رنگ ناپارس).
//
// هوک آزمون: CONTRAST_NO_MAIN=1 اجرای خودکار را خاموش می‌کند (import در آزمون‌ها).
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const BASE_CSS = path.join(ROOT, 'public', 'assets', 'css', 'base.css');

/* ── نقش‌ها و آستانهٔ AA هر نقش ── */
const ROLES = {
  body: 4.5,      // متن بدنه
  secondary: 4.5, // متن ثانویه
  hint: 4.5,      // متن راهنما/زیرنویس
  border: 3.0,    // مرز — مؤلفهٔ UI (WCAG 1.4.11)
  button: 4.5,    // متن روی کنترل پر (دکمه/سگمنت)
  badge: 4.5,     // متن بج/چیپ
  link: 4.5,      // متن لینک
  ui: 3.0,        // مؤلفهٔ UI غیرمتنی (حلقهٔ فوکوس)
};

/* ── جفت‌های داوری: نام توکن متن × نام توکن پس‌زمینه + نقش ──
   فقط جفت‌هایی که واقعاً در اپ مصرف می‌شوند (کارت، صفحه، سطح ۲/۳، دکمه‌ها، بج‌ها).
   fg می‌تواند عبارت color-mix توکنی باشد (بج neutral). backing برای ترکیب روی transparent.
   allow.<تم> = تخلفِ ثبت‌شدهٔ آن تم با دلیل — قرمز حساب نمی‌شود اما در جدول با «…» پیداست. */
const PAIRS = [
  // بدنه / ثانویه / راهنما روی سطوح صفحه و کارت
  { role: 'body', fg: '--text', bg: '--bg', label: 'متن بدنه روی پس‌زمینهٔ صفحه' },
  { role: 'body', fg: '--text', bg: '--surface', min: 7, label: 'متن بدنه روی کارت (هدف مأموریت ≥۷)' },
  { role: 'secondary', fg: '--text-2', bg: '--surface', label: 'ثانویه روی کارت (page-head__desc، btn--ghost)' },
  { role: 'secondary', fg: '--text-2', bg: '--bg', label: 'ثانویه روی صفحه' },
  { role: 'secondary', fg: '--text-2', bg: '--surface-2', label: 'ثانویه روی سطح ۲ (چیپ کاربر تاپ‌بار)',
    allow: { light: 'وضع موجود تم روشن زیر ۴٫۵ — تم روشن در این مأموریت قفل است (فقط بلاک تیره بازطراحی می‌شود)' } },
  { role: 'hint', fg: '--text-3', bg: '--surface', label: 'راهنما روی کارت (brand__sub، crumb)' },
  { role: 'hint', fg: '--text-3', bg: '--bg', label: 'راهنما روی صفحه' },
  { role: 'hint', fg: '--text-3', bg: '--surface-2', label: 'راهنما روی سطح ۲ (thead، side-search)' },
  // مرزها — مؤلفهٔ UI (WCAG 1.4.11)
  { role: 'border', fg: '--border', bg: '--surface', label: 'مرز کارت روی کارت',
    allow: { light: 'مرز روشن تزئینی است؛ مرز معنایی کنترل‌ها --border-strong است (آن جفت سبز) — بازطراحی تم روشن خارج از دامنه' } },
  { role: 'border', fg: '--border', bg: '--bg', label: 'مرز روی پس‌زمینهٔ صفحه',
    allow: { light: 'همان استثنای مرز تزئینی تم روشن' } },
  { role: 'border', fg: '--border', bg: '--surface-2', label: 'مرز کنترل روی سطح ۲ (side-search، topbar__user، ver-chip)',
    allow: { light: 'همان استثنای مرز تزئینی تم روشن' } },
  { role: 'border', fg: '--border-strong', bg: '--surface', label: 'مرز قوی کنترل تعاملی روی کارت' },
  { role: 'border', fg: '--border-strong', bg: '--bg', label: 'مرز قوی کنترل تعاملی روی صفحه' },
  // دکمه‌ها — متن روی fill (اصلی/هاور/تونل) و کنترل خط‌دار
  { role: 'button', fg: '--on-primary', bg: '--primary', label: 'btn--primary (fill برند)' },
  { role: 'button', fg: '--on-primary', bg: '--primary-hover', label: 'btn--primary هاور' },
  { role: 'button', fg: '--on-accent', bg: '--accent', label: 'btn--accent' },
  { role: 'button', fg: '--on-success', bg: '--success', label: 'سگمنت حضور فعال' },
  { role: 'button', fg: '--on-error', bg: '--error', label: 'دکمهٔ توپُر خطر' },
  { role: 'button', fg: '--on-warning', bg: '--warning', label: 'سگمنت تأخیر فعال' },
  { role: 'button', fg: '--on-info', bg: '--info', label: 'سگمنت مرخصی فعال' },
  { role: 'button', fg: '--on-sick', bg: '--sick', label: 'سگمنت مرخصی استعلاجی فعال' },
  { role: 'button', fg: '--on-primary-soft', bg: '--primary-soft', label: 'btn--soft / nav__item فعال' },
  { role: 'button', fg: '--on-error-soft', bg: '--surface', label: 'btn--danger خط‌دار — متن روی کارت' },
  // بج‌های توکنی (خانوادهٔ soft) + بج neutral
  { role: 'badge', fg: '--on-success-soft', bg: '--success-soft', label: 'badge--success' },
  { role: 'badge', fg: '--on-error-soft', bg: '--error-soft', label: 'badge--error' },
  { role: 'badge', fg: '--on-warning-soft', bg: '--warning-soft', label: 'badge--warning' },
  { role: 'badge', fg: '--on-accent-soft', bg: '--accent-soft', label: 'badge--accent' },
  { role: 'badge', fg: '--on-info-soft', bg: '--info-soft', label: 'badge--info' },
  { role: 'badge', fg: '--on-sick-soft', bg: '--sick-soft', label: 'badge--sick' },
  { role: 'badge', fg: 'color-mix(in srgb, var(--text-2) 55%, var(--text))', bg: '--surface-3', label: 'badge--neutral' },
  // لینک و حلقهٔ فوکوس
  { role: 'link', fg: '--primary', bg: '--bg', label: 'لینک روی صفحه' },
  { role: 'link', fg: '--primary', bg: '--surface', label: 'لینک روی کارت' },
  { role: 'ui', fg: '--focus', bg: '--surface', label: 'حلقهٔ فوکوس (غیرمتنی — §2.4.11)' },
];

/* ── پارس توکن‌ها از base.css — هر دو تم، فقط دامنهٔ صفحه ──
   حذف کامنت‌ها → پیمایش قواعد سطح‌بالا با توازن آکولاد؛ هر قاعدهٔ @ (از جمله @media print)
   «کلاً» می‌پرد. ترتیب فایل = آبشار: تعریفِ بعدی برنده است. :root خالی به هر دو تم می‌ریزد. */
export function parseTokens(css) {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const maps = { light: {}, dark: {} };
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf('{', i);
    if (open === -1) break;
    const sel = src.slice(i, open).trim();
    let depth = 1, j = open + 1;
    while (j < src.length && depth > 0) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') depth--;
      j++;
    }
    const body = src.slice(open + 1, j - 1);
    if (sel.startsWith('@')) { i = j; continue; } // @media print و امثالش — بیرون دامنهٔ صفحه
    const targets = /data-theme='dark'/.test(sel) ? ['dark']
      : /data-theme='light'/.test(sel) ? ['light']
      : /:root/.test(sel) ? ['light', 'dark']
      : [];
    if (targets.length) {
      for (const m of body.matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g)) {
        for (const t of targets) maps[t][m[1]] = m[2].trim();
      }
    }
    i = j;
  }
  return maps;
}

/* ── حل زنجیرهٔ var() با نقشهٔ همان تم ── */
function resolve(raw, map) {
  let v = raw.trim();
  const varRe = /var\((--[\w-]+)(?:\s*,\s*([^()]+))?\)/;
  while (varRe.test(v)) {
    v = v.replace(varRe, (_all, name, fb) => map[name] ?? (fb ?? '').trim());
  }
  return v;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  if (![3, 6].includes(h.length) || /[^0-9a-fA-F]/.test(h)) throw new Error(`رنگ شانزده‌شدهٔ نامعتبر: ${hex}`);
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
}

/* sRGB → خطی (آستانهٔ WCAG 2.x) */
function srgbLin(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function contrastRatio(a, b) {
  const la = 0.2126 * srgbLin(a[0]) + 0.7152 * srgbLin(a[1]) + 0.0722 * srgbLin(a[2]);
  const lb = 0.2126 * srgbLin(b[0]) + 0.7152 * srgbLin(b[1]) + 0.0722 * srgbLin(b[2]);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/* رنگ → RGB؛ color-mix روی transparent به backing نیاز دارد، rgba آلفادار هم روی backing ترکیب می‌شود */
function toRgb(raw, map, backing) {
  let v = raw.trim();
  if (v.startsWith('--')) {
    /* ورودی نام توکن است — ابتدا در نقشهٔ همان تم جستجو شود (تعریف‌نشده = خطای پیکربندی) */
    if (!(v in map)) throw new Error(`توکن تعریف‌نشده در تم: ${raw}`);
    v = map[v];
  }
  v = resolve(v, map);
  const mix = v.match(/color-mix\(\s*in\s+srgb\s*,\s*([^,]+?)\s+([\d.]+)%\s*,\s*([^)]+)\)/);
  if (mix) {
    const [, part, pct, rest] = mix;
    const p = Number(pct) / 100;
    const r = rest.trim();
    if (r === 'transparent') {
      if (!backing) throw new Error(`color-mix روی transparent بدون backing: ${raw}`);
      const base = toRgb(backing, map);
      const top = toRgb(part, map);
      return base.map((c, k) => Math.round(c * (1 - p) + top[k] * p));
    }
    const a = toRgb(part, map);
    const b = toRgb(r, map);
    return a.map((c, k) => Math.round(c * p + b[k] * (1 - p)));
  }
  const rgba = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (rgba) {
    const [, r, g, b, a] = rgba;
    const alpha = a === undefined ? 1 : Number(a);
    const rgb = [Number(r), Number(g), Number(b)];
    if (alpha < 1) {
      if (!backing) throw new Error(`rgba آلفادار بدون backing: ${raw}`);
      const base = toRgb(backing, map);
      return base.map((c, k) => Math.round(c * (1 - alpha) + rgb[k] * alpha));
    }
    return rgb;
  }
  if (v.startsWith('#')) return hexToRgb(v);
  throw new Error(`رنگ ناپارس: ${raw} → «${v}»`);
}

/* ── سنجش یک جفت در یک تم ── */
function judge(theme, pair, maps) {
  const min = pair.min ?? ROLES[pair.role];
  let ratio, err = null;
  try {
    const fg = toRgb(pair.fg, maps[theme], pair.backing);
    const bg = toRgb(pair.bg, maps[theme], pair.backing);
    ratio = contrastRatio(fg, bg);
  } catch (e) {
    throw new Error(`جفت «${pair.label}» در تم ${theme}: ${e instanceof Error ? e.message : String(e)}`);
  }
  const ok = ratio >= min - 1e-9;
  const allowReason = !ok ? pair.allow?.[theme] : undefined;
  return { ratio, min, ok, allowed: !ok && !!allowReason, allowReason };
}

/* ── اجرای گیت — بدون process.exit؛ برای آزمون ساختار کامل برمی‌گردد ── */
export function runGate(baseCssPath = BASE_CSS) {
  const maps = parseTokens(readFileSync(baseCssPath, 'utf8'));
  const lines = [];
  const totals = { green: 0, red: 0, allowed: 0 };
  for (const theme of ['light', 'dark']) {
    lines.push(`· ── تم ${theme === 'light' ? 'روشن' : 'تیره'} (${theme}) ──`);
    for (const p of PAIRS) {
      const r = judge(theme, p, maps);
      const sym = r.ok ? '✓' : r.allowed ? '…' : '✗';
      const minTxt = r.min === Math.floor(r.min) ? r.min.toFixed(1) : r.min.toFixed(2);
      let row = `${sym} ${theme === 'light' ? 'روشن' : 'تیره'} │ ${p.role.padEnd(9)} │ ${p.label} │ ${p.fg} × ${p.bg} │ ${r.ratio.toFixed(2)} ≥ ${minTxt}`;
      if (r.allowed) row += ` — مجازِ ثبت‌شده: ${r.allowReason}`;
      lines.push(row);
      totals[r.ok ? 'green' : r.allowed ? 'allowed' : 'red']++;
    }
  }
  const total = PAIRS.length * 2;
  const head = totals.red === 0
    ? `✓ گیت کنتراست AA سبز است — ${PAIRS.length} جفت × ۲ تم = ${total} سنجش · سبز ${totals.green} · مجازِ ثبت‌شده ${totals.allowed} · تخلف ۰`
    : `✗ گیت کنتراست AA قرمز است — ${totals.red} تخلف از ${total} سنجش (فهرست بالا) · رفع: کالیبرهٔ توکن تیره در base.css`;
  return { lines: [...lines, head], ...totals, total, pairs: PAIRS.length };
}

export function main() {
  let r;
  try {
    r = runGate();
  } catch (e) {
    console.error(`✗ خطای پیکربندی گیت کنتراست: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(2);
  }
  for (const l of r.lines) console.log(l);
  process.exit(r.red === 0 ? 0 : 1);
}

// هوک آزمون: با CONTRAST_NO_MAIN=1 اجرای خودکار خاموش می‌شود
if (!process.env.CONTRAST_NO_MAIN) main();

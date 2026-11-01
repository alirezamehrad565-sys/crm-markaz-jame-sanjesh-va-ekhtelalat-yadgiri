/**
 * گیت ممیزی UX با skill «UI/UX Pro Max» (uupm.cc) — نسخهٔ ۱.۰۹.۰
 * چهار یافتهٔ تأییدشدهٔ ممیزی رفتاری (playwright لوکال) + سه یافتهٔ استاتیک را پین می‌کند:
 *   ۱) scroll-padding-top روی html — WCAG 2.4.11 «فوکوس پوشیده نشود» با topbar چسبان 60px
 *   ۲) کف 16px ورودی‌ها روی دستگاه‌های لمسی — Safari iOS هنگام فوکوس زوم می‌کند
 *      (پوشش تبلت هم لازم است؛ قاعدهٔ قدیمی فقط ≤640px بود)
 *   ۳) کف اهداف لمسی 24px (WCAG 2.5.8 AA) روی pointer:coarse — wgrid__cell و exb-dom__chev
 *   ۴) دراور موبایل با dvh — نوار آدرس پویای iOS ارتفاع واقعی viewport را می‌دهد
 *   ۵) خاموشی tap-highlight بومی — زبان فشار A21 جایگزین بازخورد لمسی است
 * الگو: front-font-floor.test.ts ()
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CSS = join(__dirname, '../../public/assets/css');
const read = (f: string) => readFileSync(join(CSS, f), 'utf8');

const base = read('base.css');
const components = read('components.css');
const views = read('views.css');

describe('گیت ممیزی UI/UX Pro Max (uupm.cc) — 1.09.0', () => {
  test('html: scroll-padding-top ≥ topbar+12 (WCAG 2.4.11 — فوکوس زیر topbar پنهان نشود)', () => {
    const m = base.match(/html\s*\{[^}]*\}/);
    expect(m).toBeTruthy();
    const rule = m![0];
    expect(rule).toMatch(/scroll-padding-top\s*:\s*calc\(\s*var\(--topbar-h/);
    expect(rule).toMatch(/scroll-padding-bottom/);
  });

  test('html: tap-highlight خاموش (بازخورد لمسی = زبان فشار A21، نه فلش خاکستری iOS)', () => {
    const m = base.match(/html\s*\{[^}]*\}/);
    expect(m![0]).toMatch(/-webkit-tap-highlight-color\s*:\s*transparent/);
  });

  test('لمس: ورودی‌ها کف 16px — نه فقط زیر 640px، بلکه همهٔ pointer:coarse (زوم iOS)', () => {
    /* قاعدهٔ قدیمی فقط max-width:640px بود — تبلت‌ها را نمی‌پوشاند */
    expect(components).not.toMatch(/@media\s*\(max-width:\s*640px\)\s*\{[^}]*\.input[^}]*font-size/);
    const coarse = components.match(/@media\s*\(pointer:\s*coarse\)\s*\{[^@]*\.input,\s*\.select,\s*\.textarea\s*\{\s*font-size:\s*16px/);
    expect(coarse).toBeTruthy();
  });

  test('لمس: کنترل‌های فونت‌ریز scoped (sess-note/ot-skill) هم 16px روی لمس', () => {
    const tail = views.slice(-1600); /* بلوک پایانی ممیزی ۱.۰۹.۰ */
    expect(tail).toMatch(/\.sess-note__actions \.select[^}]*font-size:\s*16px/);
    expect(tail).toMatch(/\.ot-skill__prompt \.select[^}]*font-size:\s*16px/);
  });

  test('لمس: wgrid__cell ≥24px (WCAG 2.5.8 AA — موبایل قبلاً 14px بود)', () => {
    const tail = views.slice(-1600);
    expect(tail).toMatch(/\.wgrid__cell\s*\{\s*height:\s*2[4-9]px/);
  });

  test('لمس: exb-dom__chev ≥24px (موبایل قبلاً 18px بود)', () => {
    const tail = views.slice(-1600);
    expect(tail).toMatch(/\.exb-dom__chev\s*\{\s*width:\s*(2[4-9]|3\d)px[^}]*height:\s*(2[4-9]|3\d)px/);
  });

  test('دراور موبایل: 100dvh روی 100vh (نوار آدرس پویای iOS)', () => {
    const vh = base.indexOf('height: 100vh; /* دراپر موبایل تمام‌قد');
    expect(vh).toBeGreaterThan(-1);
    const after = base.slice(vh, vh + 120);
    expect(after).toMatch(/height:\s*100dvh/);
  });

  test('نسخه: سو 1.10.0 — قفل هم‌نسخه‌ای bump با انتشار (برچسب نسخهٔ سایدبار + کلاژ آلبوم)', () => {
    expect(readFileSync(join(__dirname, '../core/version.ts'), 'utf8')).toMatch(/APP_VERSION = '1\.10\.0'/);
  });
});

/**
 * گیت ۱.۲۷.۷۴ (sdt152) — بازبینی صفحهٔ ورود با اسکیل UI/UX (خواست کارفرما):
 * ① ریشهٔ خرابی دکمهٔ روشن/تاریک: ترمیم sdt151 سه خط wiring تم را حذف کرده بود —
 *    منطق تم اکنون در ui.js (یک مسیر مشترک) و boot آن را bind می‌کند؛ این گیت جلوی
 *    حذف مجدد wiring را می‌گیرد.
 * ② دکمهٔ روشن/تاریک شناور در صفحهٔ ورود — append پس از replaceChildren.
 * ③ تایپوگرافی (اسکیل): عنوان مقیاس شناور ۱۸–۲۲px (نه 16px≈بدنه)؛ ورودی 16px؛
 *    حذف هک margin-top منفی؛ ریتم فرم با توکن sp؛ هدف لمس ≥۴۴px.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('صفحهٔ ورود و تم — ۱.۲۷.۷۴', () => {
  const ui = read('public/assets/js/ui.js');
  const app = read('public/assets/js/app.js');
  const login = read('public/assets/js/login.js');
  const css = read('public/assets/css/views.css');
  const html = read('public/index.html');

  it('① منطق تم مشترک در ui.js + wiring boot در app.js (محافظ حذف مجدد)', () => {
    expect(ui).toContain('export function initTheme()');
    expect(ui).toContain('export function toggleTheme()');
    expect(ui).toContain('export function bindThemeBtn(btn)');
    expect(ui).toContain("document.querySelectorAll('.theme-toggle').forEach(paintThemeBtn);");
    expect(app).toContain('initTheme();');
    expect(app).toContain("bindThemeBtn(document.getElementById('theme-btn'));");
    expect(app).not.toMatch(/function initTheme\(\)/); // نسخهٔ تکراری در app.js نباشد
    expect(html).toContain('class="btn btn--ghost btn--icon theme-toggle"');
  });

  it('② دکمهٔ تم صفحهٔ ورود: append پس از replaceChildren', () => {
    expect(login).toContain("class: 'btn btn--ghost btn--icon login__theme theme-toggle'");
    const appendIdx = login.indexOf('root.append(loginThemeBtn);');
    const replaceIdx = login.indexOf('root.replaceChildren(');
    expect(appendIdx).toBeGreaterThan(replaceIdx);
    expect(login).toContain('bindThemeBtn(loginThemeBtn);');
  });

  it('③ تایپوگرافی: عنوان شناور، ورودی 16px، بدون هک منفی، هدف لمس ۴۴px', () => {
    expect(css).toContain('.login__title { text-align: center; font-size: clamp(1.125rem, 1rem + 0.55vw, 1.375rem)');
    expect(css).toContain('.login__form .input { width: 100%; font-size: var(--fs-lg); }');
    expect(css).not.toContain('.login__sub { text-align: center; font-size: var(--fs-sm); line-height: var(--lh-snug, 1.6); color: var(--text-3); margin-top: -6px; }');
    expect(css).toContain('.login__theme { position: fixed; top: var(--sp-4); inset-inline-start: var(--sp-4); z-index: var(--z-row-menu); width: 44px; height: 44px; } /* ۱.۲۷.۷۷ — z توکن‌شد */');
    // توکن‌های صفحهٔ ورود همه در مقیاس پایه تعریف‌شده‌اند
    const base = read('public/assets/css/base.css');
    for (const tok of ['--fs-lg', '--fs-sm', '--sp-1', '--sp-2', '--sp-4', '--lh-heading', '--lh-snug']) {
      expect(base).toContain(`${tok}:`);
    }
  });
});

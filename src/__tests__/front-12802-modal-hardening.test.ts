/**
 * گیت ۱.۲۸.۰۲ (sdt155) — موج B2 «سخت‌سازی مودال/تقویم» از ممیزی UX:
 * ① ui: بستن با backdrop فقط با click و فقط وقتی هدف خودِ overlay است — درگِ انتخابِ متن
 *    که روی overlay تمام می‌شد مودال را با mousedown می‌بست.
 * ② ui: قفل اسکرول با رزرو عرض اسکرول‌بار (padding-inline-end) — ناپدیدشدن اسکرول‌بار
 *    شیفت چیدمان نمی‌دهد؛ عرض صفر (اسکرول‌بار موبایل) رزرو ندارد و با آخرین مودال آزاد می‌شود.
 * ③ ui: فوکوس اولیه اگر مودال پیش از تایمر بسته شده باشد شلیک نمی‌شود؛ re-focus پس از لودِ
 *    داده در populateModalShell فقط وقتی است که کاربر فوکوس را جابه‌جا نکرده (overlay/body).
 * ④ jalali-picker: بستن با کلیک بیرون (همان سبک رویدادِ ESC)، قفل اسکرول بدنه هنگام باز بودن
 *    پاپ، و بازگرداندن فوکوس به کادر تاریخ؛ رفتار ESC عیناً حفظ شده (preventDefault/stopPropagation/focus).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('سخت‌سازی مودال/تقویم — ۱.۲۸.۰۲', () => {
  const ui = read('public/assets/js/ui.js');
  const jp = read('public/assets/js/jalali-picker.js');
  const populate = ui.slice(ui.indexOf('export function populateModalShell'), ui.indexOf('export function ddOpen'));

  it('① بستن با backdrop: فقط click روی خودِ overlay — نه mousedown و نه فرزند', () => {
    expect(ui).toMatch(/overlay\.addEventListener\('click', \(e\) => \{\s*if \(e\.target === overlay\) close\(\);\s*\}\);/);
    expect(ui).not.toContain("overlay.addEventListener('mousedown'");
    expect(ui).toContain('e.target === overlay'); /* قرارداد ۱.۲۷.۷۷ پابرجا */
  });

  it('② قفل اسکرول با رزرو عرض اسکرول‌بار + آزادسازی با آخرین مودال', () => {
    expect(ui).toContain('window.innerWidth - document.documentElement.clientWidth');
    expect(ui).toMatch(/if \(scrollbarW > 0\) document\.body\.style\.paddingInlineEnd = `\$\{scrollbarW\}px`;/);
    expect(ui).toContain("document.body.style.paddingInlineEnd = '';");
    expect(ui).toContain("body.style.overflow = 'hidden'"); /* S11-03 پابرجا */
  });

  it('③ فوکوس اولیه اگر مودال بسته شده باشد شلیک نمی‌شود', () => {
    expect(ui).toContain(".map((sel) => focusablesOf().find((n) => n.matches(sel)))"); /* ui-004 پابرجا */
    expect(ui).toMatch(/if \(!overlay\.isConnected \|\| modalStack\.indexOf\(overlay\) < 0\) return;\s*first\.focus\(\);/);
  });

  it('④ populateModalShell: re-focus فقط وقتی فوکوس کاربر جابه‌جا نشده (overlay/body)', () => {
    expect(populate).toMatch(/const overlayEl = shell\.root\.closest\('\.modal-overlay'\);/);
    expect(populate).toMatch(/const ae = document\.activeElement;\s*if \(ae !== document\.body && ae !== overlayEl\) return;\s*first\.focus\(\);/);
  });

  it('⑤ jalali-picker: کلیک بیرون پاپ می‌بندد (همان سبک capture) + قفل اسکرول بدنه', () => {
    expect(jp).toContain("document.addEventListener('mousedown', outside, true)");
    expect(jp).toContain("document.removeEventListener('mousedown', outside, true)");
    expect(jp).toMatch(/function outside\(e\) \{\s*if \(root\.contains\(e\.target\)\) return;\s*closePop\(\);\s*\}/);
    expect(jp).toMatch(/document\.body\.style\.overflow = 'hidden';/);
    expect(jp).toMatch(/document\.body\.style\.paddingInlineEnd = `\$\{sw\}px`;/);
    expect(jp).toMatch(/function unlockScroll\(\)/);
    expect(jp).toContain('lockScroll();');
    expect(jp).toContain('unlockScroll();');
  });

  it('⑥ jalali-picker: رفتار ESC عیناً حفظ شده + بازگرداندن فوکوس به کادر تاریخ', () => {
    expect(jp).toMatch(/function popEsc\(e\) \{\s*if \(e\.key !== 'Escape'\) return;\s*e\.preventDefault\(\);\s*e\.stopPropagation\(\);\s*closePop\(\);\s*field\.focus\(\);\s*\}/);
    expect(jp).toMatch(/if \(hadFocus && hadFocus !== document\.body && !hadFocus\.isConnected\) field\.focus\(\);/);
    expect(jp).toContain("calBtn.setAttribute('aria-expanded', 'false')");
  });
});

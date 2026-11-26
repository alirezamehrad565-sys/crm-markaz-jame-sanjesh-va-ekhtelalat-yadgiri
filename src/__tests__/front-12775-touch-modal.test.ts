/**
 * گیت ۱.۲۷.۷۵ (sdt153) — موج تعمیر مودال/لمس از ممیزی project-context (Waves C) + امنیت:
 * ① ui-004: فوکوس اولیهٔ openModal فقط روی عنصر واقعاً رندرشده (صافی getClientRects مشترک
 *    با تلهٔ فوکوس) — querySelector خام می‌توانست input مخفی را فوکوس کند.
 * ② ui-001: قاعدهٔ coarse مردهٔ tag-chip__x — specificity بالاتر (.tag-chip .tag-chip__x)
 *    تا اندازهٔ دیدنی 22px واقعاً اعمال شود + گسترش ناحیهٔ ضربه با ::after.
 * ③ ui-002: کف لمسی ۴۲px اپ روی pointer:coarse برای کنترل‌های مستقل + hit-area ≥۴۲px
 *    برای کنترل‌های درون‌خطی (tag-del/combo__clear/toast__close).
 * ④ security-001: safeJson در games/page.ts — توکن URL هرگز خام در <script> نمی‌نشیند.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('مودال/لمس/امنیت — ۱.۲۷.۷۵', () => {
  const ui = read('public/assets/js/ui.js');
  const css = read('public/assets/css/components.css');
  const page = read('src/domain/games/page.ts');
  const cspSrc = read('src/core/shared/csp.ts');

  it('① فوکوس اولیهٔ مودال از همان صافی تلهٔ فوکوس می‌گذرد', () => {
    expect(ui).toContain(".map((sel) => focusablesOf().find((n) => n.matches(sel)))");
    expect(ui).not.toContain("modal.querySelector('input, select, textarea, button.btn--primary')");
  });

  it('② قاعدهٔ tag-chip__x با specificity زنده است + hit-area شفاف', () => {
    /* testing-002: قالب دقیق اعلان CSS پین نمی‌شود — اندازه‌های قراردادی a11y با regex شل‌تر گرفته می‌شوند */
    expect(css).toMatch(/\.tag-chip\s+\.tag-chip__x\s*\{[^}]*width:\s*22px[^}]*height:\s*22px/);
    expect(css).toMatch(/\.tag-chip\s+\.tag-chip__x::after\s*\{[^}]*inset:\s*-10px/);
  });

  it('③ کف لمسی ۴۲px روی coarse + hit-area کنترل‌های درون‌خطی', () => {
    expect(css).toMatch(/\.row-menu__btn\s*\{[^}]*width:\s*42px[^}]*height:\s*42px/);
    expect(css).toMatch(/\.call-badge\s*\{[^}]*width:\s*42px[^}]*height:\s*42px/);
    expect(css).toMatch(/\.row-menu__item\s*\{[^}]*min-height:\s*42px/);
    expect(css).toMatch(/\.att-seg__btn\s*\{[^}]*min-height:\s*42px[^}]*min-width:\s*44px/);
    expect(css).toMatch(/\.tag-del::after\s*\{[^}]*inset:\s*-9px/);
    expect(css).toMatch(/\.combo__clear::after\s*\{[^}]*inset:\s*-8px/);
    expect(css).toMatch(/\.toast__close::after\s*\{[^}]*inset:\s*-6px/);
  });

  it('④ embed توکن صفحهٔ بازی: بلاک دادهٔ JSON + بوت بیرونی — بدون unsafe-inline (ADR-004، ۱.۲۷.۸۲)', () => {
    expect(page).toContain('<script type="application/json" id="page-boot">${safeJsonEmbed(token)}</script>');
    expect(page).not.toMatch(/<script>\s*\(function/); // هیچ اسکریپت اجرایی درون‌خطی در صفحه
    expect(page).not.toContain('JSON.stringify(token)'); // توکن هرگز خام جاسازی نمی‌شود
    expect(cspSrc).toContain('export function safeJsonEmbed'); // helper امن مشترک
    const boot = read('public/assets/play/page-boot.js');
    expect(boot).toContain("getElementById('page-boot')");
    expect(boot).toContain('JSON.parse');
    expect(boot).not.toMatch(/TOKEN\s*=\s*['"]/); // توکن در کد اجرایی نیست — از بلاک داده می‌آید
  });
});

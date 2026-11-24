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

  it('① فوکوس اولیهٔ مودال از همان صافی تلهٔ فوکوس می‌گذرد', () => {
    expect(ui).toContain(".map((sel) => focusablesOf().find((n) => n.matches(sel)))");
    expect(ui).not.toContain("modal.querySelector('input, select, textarea, button.btn--primary')");
  });

  it('② قاعدهٔ tag-chip__x با specificity زنده است + hit-area شفاف', () => {
    expect(css).toContain('.tag-chip .tag-chip__x { width: 22px; height: 22px; position: relative; }');
    expect(css).toContain('.tag-chip .tag-chip__x::after { content: \'\'; position: absolute; inset: -10px; }');
  });

  it('③ کف لمسی ۴۲px روی coarse + hit-area کنترل‌های درون‌خطی', () => {
    expect(css).toContain('.row-menu__btn { width: 42px; height: 42px; }');
    expect(css).toContain('.call-badge { width: 42px; height: 42px; }');
    expect(css).toContain('.row-menu__item { min-height: 42px; }');
    expect(css).toContain('.att-seg__btn { min-height: 42px; min-width: 44px; }');
    expect(css).toContain('.tag-del::after { content: \'\'; position: absolute; inset: -9px; }');
    expect(css).toContain('.combo__clear::after { content: \'\'; position: absolute; inset: -8px; }');
    expect(css).toContain('.toast__close::after { content: \'\'; position: absolute; inset: -6px; }');
  });

  it('④ embed توکن صفحهٔ بازی از safeJson می‌گذرد (نه JSON.stringify خام)', () => {
    expect(page).toContain('function safeJson(v: unknown): string {');
    expect(page).toContain('var TOKEN = ${safeJson(token)};');
    expect(page).not.toContain('var TOKEN = ${JSON.stringify(token)}');
  });
});

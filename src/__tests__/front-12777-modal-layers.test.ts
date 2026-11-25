/**
 * گیت ۱.۲۷.۷۷ (sdt154) — موج B2 «مودال‌ها/لایه‌ها» از بازخورد کارفرما (پیام ۱۵):
 * ممیزی A1/A2 نشان داد سیستم مودال سالم است (پورتال به body، position:fixed، focus trap،
 * ARIA) — این گیت «قرارداد مودال» را پین می‌کند و باقی‌ماندهٔ لایه‌بندی را می‌بندد:
 * ① مقیاس z معنایی با حلقهٔ تازهٔ --z-drawer-backdrop، ② حذف literalهای خارج مقیاس
 * (سایدبار/تاپ‌بار/اسکریم کشویی/fin-sp/ورود)، ③ z خام JS (9999/30/20) به توکن،
 * ④ backdrop کشویی هم‌رنگ اسکریم مودال، ⑤ RTL: صفر text-align فیزیکی در views.css.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('گیت B2 — قرارداد مودال و مقیاس لایه‌ها ۱.۲۷.۷۷', () => {
  const base = read('public/assets/css/base.css');
  const components = read('public/assets/css/components.css');
  const views = read('public/assets/css/views.css');
  const ui = read('public/assets/js/ui.js');
  const index = read('public/index.html');

  it('① سیستم مودال: پورتال به body + fixed + مقیاس z + بستن با backdrop/Esc + قفل اسکرول', () => {
    expect(components).toMatch(/\.modal-overlay \{[^}]*position: fixed;[^}]*z-index: var\(--z-modal\)/);
    expect(ui).toContain('document.body.appendChild(overlay)');
    expect(ui).toContain('e.target === overlay');
    expect(ui).toContain("body.style.overflow = 'hidden'");
    expect(ui).toContain("role: 'dialog'");
    expect(ui).toContain('aria-modal');
  });

  it('② مقیاس z کامل با حلقهٔ drawer-backdrop است', () => {
    expect(base).toContain('--z-sticky: 30; --z-drawer-backdrop: 35; --z-sidebar: 40; --z-backdrop: 45; --z-dropdown: 60;');
    expect(base).toContain('--z-popover: 80; --z-row-menu: 90;');
    expect(base).toContain('--z-modal: 100; --z-toast: 200; --z-drag: 300;');
  });

  it('③ literalهای لایه به توکن رفتند', () => {
    expect(base).toMatch(/\.sidebar \{[^}]*z-index: var\(--z-sidebar\)/);
    expect(base).toMatch(/\.topbar \{[^}]*z-index: var\(--z-sticky\)/);
    expect(views).toMatch(/\.fin-sp__dd \{[^}]*z-index: var\(--z-sticky\)/);
    expect(read('public/assets/js/views/health-panel.js')).toContain("zIndex: 'var(--z-toast)'");
    expect(read('public/assets/js/games-console.js')).toContain("zIndex: 'var(--z-dropdown)'");
    expect(read('public/assets/js/views/form-builder.js')).toContain('z-index:var(--z-sticky)');
  });

  it('④ اسکریم کشویی هم‌رنگ اسکریم مودال است', () => {
    expect(base).toMatch(/\.sidebar-backdrop \{[^}]*background: var\(--backdrop\)/);
    expect(base).toMatch(/\.sidebar-backdrop \{[^}]*z-index: var\(--z-drawer-backdrop\)/);
    expect(base).not.toContain('background: rgba(0, 0, 0, 0.4);\n    z-index: 35;');
  });

  it('⑤ RTL: views.css صفر text-align فیزیکی + ریشهٔ سند rtl', () => {
    expect(views).not.toContain('text-align: right');
    expect(views).toContain('.fin-report th, .fin-report td { border: 1px solid var(--border-strong); padding: var(--sp-1) 7px; text-align: start; }');
    expect(index).toContain('dir="rtl"');
  });
});

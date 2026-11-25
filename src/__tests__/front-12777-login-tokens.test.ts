/**
 * گیت ۱.۲۷.۷۷ (sdt154) — موج B1 «صفحهٔ ورود» از بازخورد کارفرما (پیام ۱۷): توکن‌سازی
 * CSS ورود + دسترس‌پذیری خطا. سنجش متنی روی منبع واقعی assets (الگوی front-*):
 * ① پدینگ کارت ورود توکن‌شد (قبلاً 28px/26px خام)، ② شعاع لوگو var(--radius-lg) و نوار
 * تزئینی var(--radius-full)، ③ z-index لایهٔ ورود و دکمهٔ تم از مقیاس معنایی base.css
 * (--z-popover / --z-row-menu) نه literal، ④ خطای ورود role="alert" برای اسکرین‌ریدر.
 * تایپوگرافی ورود از ۱.۲۷.۷۴ روی اسکیل شناور است (front-12774-login-theme پین دارد).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('گیت B1 — صفحهٔ ورود ۱.۲۷.۷۷', () => {
  const views = read('public/assets/css/views.css');
  const login = read('public/assets/js/login.js');
  const base = read('public/assets/css/base.css');

  it('① پدینگ کارت ورود با توکن‌های فاصله است', () => {
    expect(views).toContain('padding: var(--sp-8) var(--sp-6) var(--sp-6);');
    expect(views).not.toContain('28px 26px');
  });

  it('② شعاع‌های ورود توکن‌اند (لوگو radius-lg، نوار radius-full)', () => {
    expect(views).toContain('width: 80px; height: 80px; border-radius: var(--radius-lg);');
    expect(views).toContain('border-radius: var(--radius-full); /* ۱.۲۷.۷۷ — توکن‌شد */');
    expect(views).not.toContain('border-radius: 999px;\n  background: var(--grad-primary');
  });

  it('③ لایهٔ ورود و دکمهٔ تم روی مقیاس z معنایی‌اند', () => {
    expect(views).toContain('z-index: var(--z-popover); /* ۱.۲۷.۷۷ — از literal ۸۰ به مقیاس معنایی */');
    expect(views).toMatch(/\.login__theme \{[^}]*z-index: var\(--z-row-menu\)/);
    expect(base).toContain('--z-popover: 80; --z-row-menu: 90;');
  });

  it('④ خطای ورود برای اسکرین‌ریدر اعلام می‌شود', () => {
    expect(login).toContain("role: 'alert'");
  });
});

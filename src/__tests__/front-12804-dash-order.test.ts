/**
 * گیت ۱.۲۷.۸۵ — چیدمان داشبورد مدیر:
 * ① ترتیب بخش‌ها با ثابت ماژول‌سطحی DASH_CARDS اعلام می‌شود (به‌جای pushهای پراکنده).
 * ② هر بخش هنگام رندر data-card می‌گیرد — نشانه‌گذاری پایدار برای آزمون/دیباگ.
 * ③ کارهای اقدامی (پیگیری‌های سررسیده، پیرشدن لیست انتظار) بلافاصله پس از «کارهای من» و
 *    پیش از دانش‌افزایی و شاخص‌ها می‌آیند — اقدامِ امروز اول، تحلیل منفعل بعد.
 *    (ترتیب صریحی از کارفرما داده نشده بود؛ این پیش‌فرض انتخاب شد.)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const dash = readFileSync(join(ROOT, 'public/assets/js/views/dashboard.js'), 'utf8');

// آرایهٔ DASH_CARDS از متن ماژول استخراج می‌شود
const m = dash.match(/const DASH_CARDS = \[([\s\S]*?)\];/);
const ids = (m?.[1] ?? '').match(/'([a-z-]+)'/g)?.map((s) => s.slice(1, -1)) ?? [];

describe('چیدمان داشبورد مدیر — ۱.۲۷.۸۵', () => {
  it('① ثابت DASH_CARDS در سر ماژول، با همهٔ بخش‌ها به‌ترتیب اعلام', () => {
    expect(ids).toEqual([
      'next-appointment',
      'dash-duo',
      'followups-due',
      'waitlist-aging',
      'knowledge',
      'kpi-grid',
      'leaderboard',
      'validation',
      'week-trend',
      'screening-goal'
    ]);
  });

  it('② اقدامِ امروز پیش از تحلیل منفعل: پیگیری‌ها/پیرشدن پیش از دانش‌افزایی و شاخص‌ها', () => {
    const fu = ids.indexOf('followups-due');
    const aging = ids.indexOf('waitlist-aging');
    const kn = ids.indexOf('knowledge');
    const kpi = ids.indexOf('kpi-grid');
    expect(fu).toBeGreaterThan(-1);
    expect(aging).toBeGreaterThan(-1);
    expect(ids.indexOf('dash-duo')).toBeLessThan(fu); // پس از ردیف «کارهای من»
    expect(fu).toBeLessThan(kn);
    expect(fu).toBeLessThan(kpi);
    expect(aging).toBeLessThan(kn);
    expect(aging).toBeLessThan(kpi);
  });

  it('③ هر بخش data-card می‌گیرد و چیدمان از DASH_CARDS می‌گذرد', () => {
    expect(dash).toContain('for (const id of DASH_CARDS) {');
    expect(dash).toContain("node.setAttribute('data-card', id);");
    // هر شناسهٔ اعلام‌شده در مونتاژ cards[…'] ساخته می‌شود
    for (const id of ids) {
      expect(dash).toContain(`cards['${id}']`);
    }
  });
});

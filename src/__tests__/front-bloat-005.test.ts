/**
 * گیت bloat-005 (۱.۲۷.۸۳، sdt160) — ۵۵ کلاس مردهٔ views.css حذف شدند (بازسازی ممیزی:
 * کاندیدهای بی-ارجاع در ناحیه‌های نام‌بردهٔ یافته + تک‌کلاس‌ها). قراردادهای گیت:
 * ① هیچ قاعدهٔ مستقلی با این انتخابگرها در views.css نیست (حضور در انتخابگر ترکیبی با
 *    کلاس زنده مجاز است — قاعده بدون رفتار تغییری نمی‌کند)؛
 * ② این نام‌ها در منابع کلاینت (JS/HTML) نیز صفر ارجاع‌اند — بازگشت CSS بدون مصرف را می‌گیرد؛
 * ③ کلاس‌های زندهٔ همسایه سرِ جایشان‌اند — حذف اشتباه نمی‌شود (grid-day/grid-cell با ساخت
 *    پویای `grid-day${…}` در appointments.js:579/611 زنده‌اند و در تصحیح همین موج برگردانده شدند).
 * بودجهٔ کارایی: وزن مردهٔ views.css از critical_css_gz خارج شد (perf-budget پاس).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const views = readFileSync(join(ROOT, 'public/assets/css/views.css'), 'utf8');

/** کلاس‌های حذف‌شده — قاعدهٔ مستقل هرکدام باید غایب باشد */
const REMOVED = [
  'appt-card', 'appt-card__bar',
  'att-chip', 'att-chip--absent', 'att-chip--late', 'att-chip--leave', 'att-chip--present', 'att-chip--sick', 'att-chip--unmarked',
  'att-day', 'att-day__label', 'att-month__cap', 'att-row__month', 'att-summary',
  'btn--warn-ghost', 'chip--btn', 'docs-file__spacer',
  'grid-inner--day',
  'help-bot', 'help-bot__flows', 'help-bot__grid', 'help-flow', 'help-hero', 'help-hero__chips', 'help-hero__logo', 'help-hero__sub', 'help-hero__title',
  'help-points', 'help-shot', 'help-step', 'help-step__cap', 'help-step__head', 'help-step__num', 'help-step__num--bot', 'help-step__route', 'help-step__title',
  'help-steps', 'help-table', 'help-tablewrap', 'help-tip', 'help-toc', 'help-toc__item', 'help-toc__item--bot',
  'phone__btn', 'phone__btns', 'phone__head', 'phone__note', 'phone__sub', 'phone__who',
  'pr-domain-row', 'staff-mini__nums', 'staff-mini__total', 'staff-score-card', 'tpl-list-row', 'wl-board-card__title',
];

/** کلاس‌های زندهٔ همسایه که نباید در موج حذف اشتباهی از دست بروند */
const LIVE = ['grid-day', 'grid-cell', 'grid-inner', 'att-seg__btn', 'help-toc__n', 'help-points__n', 'exb-pillar__count', 'wd-appt', 'grid-appt'];

describe('گیت bloat-005 — حذف ۵۵ کلاس مردهٔ views.css (۱.۲۷.۸۳)', () => {
  it('هیچ قاعدهٔ مستقلی با انتخابگر کلاس‌های حذف‌شده در views.css نیست', () => {
    const offenders: string[] = [];
    for (const name of REMOVED) {
      const re = new RegExp(`^\\.${name}\\s*[,\\{]`, 'm');
      if (re.test(views)) offenders.push(name);
    }
    expect(offenders, `قاعدهٔ مستقل این کلاس‌ها باید حذف شده باشد: ${offenders.join(', ')}`).toEqual([]);
  });

  it('این نام‌ها در منابع کلاینت (JS) صفر ارجاع‌اند — CSS بی‌مصرف بازنگردد', () => {
    const JS = join(ROOT, 'public/assets/js');
    let blob = '';
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) { walk(p); continue; }
        if (p.endsWith('.js')) blob += readFileSync(p, 'utf8');
      }
    };
    walk(JS);
    const used = REMOVED.filter((n) => new RegExp(`['"\`\`( ]${n}['"\`\`) ,]`).test(blob));
    expect(used, `کلاس حذف‌شده دوباره در JS مصرف شده: ${used.join(', ')}`).toEqual([]);
  });

  it('کلاس‌های زندهٔ همسایه سرِ جایشان‌اند — حذف اشتباه رخ نداده', () => {
    const missing = LIVE.filter((n) => !views.includes(n));
    expect(missing, `کلاس زنده باید در views.css باشد: ${missing.join(', ')}`).toEqual([]);
  });

  it('سه قاعدهٔ زندهٔ grid روز/سلول — بازگردانی‌شده در تصحیح bloat-005', () => {
    expect(views).toMatch(/^\.grid-day \{[\s\S]*?border-inline-end/m);
    expect(views).toMatch(/^\.grid-cell \{[\s\S]*?border-bottom/m);
    expect(views).toMatch(/^\.grid-day:hover \.grid-cell:hover \{/m);
  });
});

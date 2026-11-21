/**
 * گیت فرانت ۱.۲۷.۴۰ — سه خواست کارفرما:
 * ① فرم‌ساز تعاملی داخل «فرم‌ها و پرسش‌نامه‌ها» (تب سوم) — آیتم مستقل منو حذف، ریدایرکت سازگاری
 * ② قالب‌های غیرفعال در کتابخانهٔ فرم‌ها اصلاً رندر نمی‌شوند
 * ③ زبان بصری گرادینتی روی سه صفحهٔ عمومی (فرم معرفی / فایل راهنما / فرم خانواده + پیش‌نمایش هم‌قاعده)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('گیت فرانت ۱.۲۷.۴۰ — فرم‌ساز داخل فرم‌ها و پرسش‌نامه‌ها', () => {
  const app = read('public/assets/js/app.js');
  const view = read('public/assets/js/views/case-event-types.js');

  it('تب سوم فرم‌ساز در نما + lazy import با گارد بارگذاری یک‌باره', () => {
    expect(view).toContain("builder: tabBtn('builder', 'فرم‌ساز تعاملی')");
    expect(view).toContain("import('./form-builder.js')");
    expect(view).toContain('builderStarted');
    expect(view).toContain('const TAB_INDEX = { library: 0, pending: 1, builder: 2 }');
    expect(app).not.toContain("{ hash: '#/form-builder', label:"); // آیتم منو حذف شد
    expect(app).toContain("register('#/form-builder'"); // ریدایرکت سازگاری باقی است
    expect(app).toContain("location.hash = '#/case-event-types'");
  });

  it('قالب‌های غیرفعال هیچ‌جا رندر نمی‌شوند — بخش «غیرفعال» و data-zone=inactive حذف', () => {
    expect(view).not.toContain("'غیرفعال'");
    expect(view).not.toContain("data-zone: 'inactive'");
    expect(view).not.toContain("state.types.filter((t) => !t.active)");
    expect(view).toContain('matchesTypeFilter'); // فیلتر فعال برقرار است
  });
});

describe('گیت فرانت ۱.۲۷.۴۰ — زبان بصری گرادینتی صفحات عمومی', () => {
  const referral = read('src/domain/waitlist/referral-page.ts');
  const guide = read('src/domain/waitlist/guide-page.ts');
  const fill = read('src/domain/case-events/public-form.ts');
  const preview = read('src/domain/case-events/preview-form.ts');

  it('فرم معرفی — پس‌زمینهٔ گرادینتی سه‌لایه + هاله‌ها + دکمهٔ گرادینتی (۱.۲۷.۴۶: هماهنگ با پالت سایت)', () => {
    /* ۱.۲۷.۴۶ — خواست کارفرما: زبان رنگی و گوشه‌های گرد خود سایت؛ آینهٔ توکن‌های base.css
       (کرم گرم + آبی #0D72A8 + کهربایی) جایگرین پالت قبلی ایندیگو شد — ساختار سه‌لایه پابرجاست */
    expect(referral).toContain('radial-gradient(640px 340px at 88% -6%'); // ساختار هاله‌ها حفظ شد
    expect(referral).toContain('linear-gradient(168deg,#F7F3EA 0%,#FBF7EE 46%,#F7F3EA 100%)'); // کرم سایت
    expect(referral).toContain(':root{--bg:#F7F3EA'); // آینهٔ توکن‌های base.css
    expect(referral).toContain('background-attachment:fixed');
    expect(referral).toContain('background:linear-gradient(135deg,#0D72A8 0%,#0A5D8A 100%)'); // آبی سایت
    expect(referral).toContain('background:linear-gradient(90deg,#0D72A8,#3E9BC9)'); // نوار پیشرفت
    expect(referral).toMatch(/\.btn\{[^}]*border-radius:999px/); // دکمهٔ قرصی — زبان واحد سایت
    expect(referral).toContain('prefers-reduced-motion'); // رعایت کاهش-حرکت حفظ شده
  });

  it('فایل راهنما — هم‌زبان گرادینتی + سایهٔ کارت', () => {
    expect(guide).toContain('linear-gradient(170deg,#eef6fb 0%,#f7f3ea 52%,#fdf2f8 100%)');
    expect(guide).toContain('background:linear-gradient(135deg,#0e7490 0%,#2563eb 100%)');
  });

  it('فرم خانواده و پیش‌نمایش فرم‌ساز — قاعدهٔ «پیش‌نمایش = عین فرم» برقرار ماند', () => {
    for (const [name, src] of [['فرم', fill], ['پیش‌نمایش', preview]] as const) {
      expect(src, name).toContain('linear-gradient(168deg,#eef6fb 0%,#f7f3ea 52%,#fdf2f8 100%)');
      expect(src, name).toContain('linear-gradient(135deg,#12384f 0%,#1c5d80 55%,#229ED9 130%)');
      expect(src, name).toContain('background: linear-gradient(135deg,#1c5d80 0%,#229ED9 100%)');
      expect(src, name).toContain('linear-gradient(135deg,#D9EDF7,#E7E4FA)');
    }
  });
});

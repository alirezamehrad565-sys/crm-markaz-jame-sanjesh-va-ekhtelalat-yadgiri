/**
 * گیت ۱.۲۷.۶۹ — پوستهٔ «میز پرونده» با تب کلاسیک سایت (sdt147).
 * قراردادها:
 *  ① کارگاه درمان/هاب/ریل/کشو دیگر وجود ندارند — پوستهٔ واحد: pageHead + نوار هویت + تب‌ها + tabMount.
 *  ② تب‌ها = ui.tabs() کلاسیک؛ بالینی هم تب است (بدون فلش/اسکرول اجباری).
 *  ③ «امروز» برای نقش‌های غیربالینی: فقط برگهٔ جلسه (پنل ایستگاه با فلو حذف‌شده معنا ندارد).
 *  ④ dispatchTab مقصد صریح دارد و landing تابع خالص همان منبع است.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('پوستهٔ «میز پرونده» — ۱.۲۷.۶۹ (بررسی منبع، الگوی گیت ۱۲۷۵۸)', () => {
  const view = read('public/assets/js/views/student-profile.js');
  const css = read('public/assets/css/views.css');

  it('پوستهٔ کلاسیک — هیچ فلگ برگشت و ابزارک کارگاهی باقی نیست (۱.۲۷.۷۱)', () => {
    expect(view).not.toContain("localStorage.getItem('cs.profile.shell')");
    expect(view).not.toContain("const isWorkshop = shellMode === 'workshop';");
    expect(view).toContain('function buildStatusCard()');
    for (const sym of ['buildHubSticky', 'hubStickyEl', 'hub__sticky', 'hub-today', 'hub-flash', 'workbar'])
      expect(view).not.toContain(sym);
  });

  it('تب کلاسیک ui.tabs: بالینی هم تب است — setActive در selectTab صریح است (۱.۲۷.۷۱)', () => {
    expect(view).toContain("let tabBar = tabs(tabItems(), 'info');");
    expect(view).toContain("{ key: 'info', label: 'اطلاعات پایه', icon: 'user', onSelect: selectTab },");
    expect(view).not.toContain("key === 'clinical') {"); // شاخهٔ اسکرول/فلش وجود ندارد
    expect(view).not.toContain('hub-flash');
    expect(view).toMatch(/selectTab\(key[^)]*\)\s*\{[\s\S]*?tabBar\.setActive\(key\);/);
  });

  it('برگهٔ جلسه در قرارداد کلاسیک داخل کارت اطلاعات پایه است (بدون تب «امروز»)', () => {
    expect(view).not.toContain('renderTodayHub');
    expect(view).not.toContain('buildStationPanel');
    expect(view).toContain('function buildSessionSheet()');
  });

  it('کلاسیک — بدون ریل لبه و کشو؛ دیپ‌لینک ?tab= از نشانی (۱.۲۷.۷۱)', () => {
    expect(view).toContain('const requestedTab = ctx.query?.tab;');
    expect(view).not.toContain('refdrawer'); // کشوی کناری وجود ندارد
    expect(view).not.toContain("class: 'edge");
    expect(css).not.toMatch(/\.refdrawer|\.edge__btn|\.infopanel|\.ptabs/);
    expect(css).not.toMatch(/\.workshop/);
    expect(css).toMatch(/\.tabmount \{/);
    expect(css).toMatch(/\.tabs \{/); // قرارداد مشترک سایت
  });

  it('selectTab مقصد صریح دارد — ظرف مشترک content با fallback کامل (۱.۲۷.۷۱)', () => {
    expect(view).toContain('const desc = profileTabs.resolve(key, ctx);');
    expect(view).toContain('if (desc) { desc.mount(content, ctx); return; }');
    expect(view).toContain('(renderer ?? renderInfoTab)(content);');
    expect(view).not.toContain('const refRoot =');
    expect(view).not.toContain('resolveWorkshopLanding'); // لندینگ کلاسیک درون‌نماست
  });
});

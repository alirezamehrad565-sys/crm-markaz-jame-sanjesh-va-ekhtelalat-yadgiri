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

  it('پوستهٔ واحد — فلگ برگشت و پوستهٔ کلاسیک از قبل حذف؛ هیچ ابزارک کارگاهی باقی نیست', () => {
    expect(view).not.toContain("localStorage.getItem('cs.profile.shell')");
    expect(view).not.toContain("const isWorkshop = shellMode === 'workshop';");
    expect(view).toContain('تنها پوستهٔ پروفایل است');
    for (const sym of ['buildHubSticky', 'hubStickyEl', 'hub__sticky', 'hub-today', 'hub-flash', 'workbar'])
      expect(view).not.toContain(sym);
  });

  it('تب کلاسیک ui.tabs: بالینی هم تب است — بدون شاخهٔ فلش؛ setActive با openRef همگام است', () => {
    expect(view).toMatch(/function buildTabBar\(\)/);
    expect(view).toMatch(/\{ key: 'info', label: RAIL_SHORT_LABEL\.info, icon: 'user' \}/);
    expect(view).not.toContain("key === 'clinical') {"); // شاخهٔ اسکرول/فلش حذف شد
    expect(view).not.toContain('hub-flash');
    expect(view).toMatch(/dispatchTab\(key, tabMount\);\s*\n\s*tabBar\.setActive\(key\);/);
  });

  it('«امروز» برای نقش‌های غیربالینی = فقط برگهٔ جلسه', () => {
    expect(view).toMatch(/function renderTodayHub\(box\)/);
    expect(view).toMatch(/today: renderTodayHub/);
    const todayIdx = view.indexOf('function renderTodayHub(box)');
    const body = view.slice(todayIdx, todayIdx + 400);
    expect(body).toContain('buildSessionSheet()');
    expect(body).not.toContain('buildStationPanel');
    expect(view).not.toContain("dispatchTab('today', tabMount); // امروز به ایستگاه فعال وابسته است");
  });

  it('۱.۲۷.۶۹ — نماها بدون ریل لبه و کشو — کارت اول «اطلاعات پایه»، mount در tabMount، ?section= از نشانی', () => {
    expect(view).toMatch(/openRef\(landing\.drawer\s*\?\? \(\(ctx\.query\?\.tab \?\? ctx\.query\?\.section\) === 'clinical'/);
    expect(view).toMatch(/activeSectionKey = key;\s*syncSectionUrl\(key\);/);
    expect(view).not.toContain('refdrawer'); // کشوی کناری حذف شد — بدون لیست کشویی
    expect(view).not.toContain("class: 'edge");
    expect(css).not.toMatch(/\.refdrawer|\.edge__btn|\.infopanel|\.ptabs/);
    expect(css).not.toMatch(/\.workshop/);
    expect(css).toMatch(/\.tabmount \{/);
    expect(css).toMatch(/\.tabs \{/); // قرارداد مشترک سایت
  });

  it('dispatchTab مقصد صریح دارد — ظرف پیش‌فرض tabMount', () => {
    expect(view).toContain('function dispatchTab(key, box = tabMount)');
    expect(view).toContain('if (desc) { desc.mount(box, ctx); return; }');
    expect(view).toContain('dispatchTab(activeSectionKey, tabMount)');
    expect(view).not.toContain('const refRoot ='); // آکاردئون کلاسیک حذف شد
    expect(view).toContain("import { resolveWorkshopLanding } from '../profile/landing.js'");
    expect(view).toContain('resolveWorkshopLanding({ canSeeClinical: Boolean(canSeeClinical), canSeeGames: Boolean(canSeeGames), query: ctx.query ?? {} })');
  });
});

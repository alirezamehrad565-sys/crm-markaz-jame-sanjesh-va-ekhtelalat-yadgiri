/**
 * گیت موج ۲ (۱.۲۷.۶۳) — پوستهٔ «کارگاه درمان»: هاب درمان + ریل لبه + کشوی مرجع، پشت فلگ برگشت.
 * قرارداد برنامهٔ بازطراحی (docs/PROFILE-REDESIGN-PROGRAM.md §۵ و §۹):
 *  ① پیش‌فرض پوسته = کارگاه؛ فلگ برگشت localStorage 'cs.profile.shell'='desk' و ?shell=desk.
 *  ② هاب: نوار sticky (خط درمان از فصل‌های تاریخچه + جلسهٔ بعدی) + بدنهٔ همیشه‌نما (تفسیر بالینی
 *     برای نقش بالینی، هاب امروز برای بقیه) — فقط یک‌بار mount؛ repaint دوباره mount نمی‌کند.
 *  ③ ریل لبه = همان ۹ بخش refSections با برچسب کوتاه؛ کلیک = کشوی لغزنده با Esc/بک‌دراپ/فوکوس‌برگشت.
 *  ④ موج ۴: پوستهٔ کلاسیک حذف شد — کارگاه تنها پوسته است؛ dispatchTab مقصد صریح دارد (هاب/کشو).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('پوستهٔ «کارگاه درمان» — ۱.۲۷.۶۳ (بررسی منبع، الگوی گیت ۱۲۷۵۸)', () => {
  const view = read('public/assets/js/views/student-profile.js');
  const css = read('public/assets/css/views.css');

  it('کارگاه درمان تنها پوسته است — فلگ برگشت و پوستهٔ کلاسیک حذف شدند (موج ۴)', () => {
    expect(view).not.toContain("localStorage.getItem('cs.profile.shell')");
    expect(view).not.toContain("const isWorkshop = shellMode === 'workshop';");
    expect(view).not.toContain('پوستهٔ کلاسیک میز جلسه — برگشت به چیدمان قبلی');
    expect(view).toContain('تنها پوستهٔ پروفایل است');
  });

  it('۱.۲۷.۶۸ موج ۲ — sticky بدون هاب: گام‌ها/فصل‌ها سر جایش و کلیکش تعویض تب؛ بالینی/امروز تب‌اند', () => {
    expect(view).toMatch(/function buildHubSticky\(\)/);
    expect(view).toMatch(/hubStickyEl\.replaceChildren\(\.\.\.buildHubSticky\(\)\)/);
    expect(view).toMatch(/onclick: \(\) => openRef\('clinical'\)/); // چیپ گام → تب بالینی
    expect(view).toMatch(/function renderTodayHub\(box\)/);
    expect(view).toMatch(/today: renderTodayHub/);
    expect(view).not.toContain('hubMountedKey'); // گارد یک‌بار-mount هاب حذف شد — تب‌ها هر بار mount تنبل
    expect(view).toMatch(/if \(activeSectionKey === 'today'\) dispatchTab\('today', tabMount\);/);
  });

  it('خط درمان از فصل‌های واقعی تاریخچه می‌آید (بدون placeholder) و کلیکش تاریخچه را باز می‌کند', () => {
    /* ۱.۲۷.۶۴ — موج ۳: sticky دو گروه دارد — «گام‌های درمان» (از onTherapyLine) و «فصل‌ها» */
    expect(view).toMatch(/chips\.push\(el\('span', \{ class: 'hub__stitle' \}, 'گام‌های درمان:'\)\)/);
    expect(view).toMatch(/chips\.push\(el\('span', \{ class: 'hub__stitle' \}, 'فصل‌ها:'\)\)/);
    expect(view).toMatch(/onclick: \(\) => openRef\('timeline'\)/);
    expect(css).toMatch(/\.hub__sticky:empty \{ display: none; \}/);
  });

  it('۱.۲۷.۶۸ — نوار تب نماها: بدون ریل لبه و کشو — کارت اول «اطلاعات پایه»، mount در tabMount، ?section= از نشانی', () => {
    expect(view).toMatch(/function buildProfileTabs\(\)/);
    expect(view).toMatch(/\{ key: 'info', label: 'اطلاعات پایه', icon: 'user', when: \(\) => true \}/);
    expect(view).toMatch(/openRef\(landing\.drawer\s*\?\? \(\(ctx\.query\?\.tab \?\? ctx\.query\?\.section\) === 'clinical'/);
    expect(view).toMatch(/activeSectionKey = key;\s*syncSectionUrl\(key\);/);
    expect(view).not.toContain('refdrawer'); // کشوی کناری حذف شد — بدون لیست کشویی
    expect(view).not.toContain("class: 'edge");
    expect(css).not.toMatch(/\.refdrawer|\.edge__btn|\.infopanel/);
    expect(css).toMatch(/\.ptabs \{/);
    expect(css).not.toMatch(/\.workshop/); // هاب از جریان صفحه حذف شد
    expect(css).toMatch(/\.tabmount \{/);
  });

  it('dispatchTab مقصد صریح دارد — ظرف پیش‌فرض tabMount (موج ۴ + ری‌ورک ۱.۲۷.۶۸)', () => {
    expect(view).toContain('function dispatchTab(key, box = tabMount)');
    expect(view).toContain('if (desc) { desc.mount(box, ctx); return; }');
    expect(view).toContain('dispatchTab(activeSectionKey, tabMount)');
    expect(view).not.toContain('const refRoot ='); // آکاردئون کلاسیک حذف شد
    expect(view).toContain("import { resolveWorkshopLanding } from '../profile/landing.js'");
    expect(view).toContain('resolveWorkshopLanding({ canSeeClinical: Boolean(canSeeClinical), canSeeGames: Boolean(canSeeGames), query: ctx.query ?? {} })');
  });

  it('نوار کار پیش‌فرض جمع است — تفسیر بالینی قهرمان فولد اول', () => {
    expect(view).toMatch(/let workbarCollapsed = true;/);
  });
});

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

  it('هاب درمان: sticky + mount همیشه‌نما با گارد یک‌بار-mount و واریانت هاب امروز', () => {
    expect(view).toMatch(/function buildHubSticky\(\)/);
    expect(view).toMatch(/hubStickyEl\.replaceChildren\(\.\.\.buildHubSticky\(\)\)/);
    expect(view).toMatch(/if \(!hubMountedKey\) \{/);
    expect(view).toMatch(/function renderTodayHub\(box\)/);
    expect(view).toMatch(/today: renderTodayHub/);
    expect(view).toMatch(/hubMountedKey = hubDefaultKey \?\? \(canSeeClinical \? 'clinical' : 'today'\);/);
  });

  it('خط درمان از فصل‌های واقعی تاریخچه می‌آید (بدون placeholder) و کلیکش تاریخچه را باز می‌کند', () => {
    /* ۱.۲۷.۶۴ — موج ۳: sticky دو گروه دارد — «گام‌های درمان» (از onTherapyLine) و «فصل‌ها» */
    expect(view).toMatch(/chips\.push\(el\('span', \{ class: 'hub__stitle' \}, 'گام‌های درمان:'\)\)/);
    expect(view).toMatch(/chips\.push\(el\('span', \{ class: 'hub__stitle' \}, 'فصل‌ها:'\)\)/);
    expect(view).toMatch(/onclick: \(\) => openRef\('timeline'\)/);
    expect(css).toMatch(/\.hub__sticky:empty \{ display: none; \}/);
  });

  it('ریل لبه + کشو: Esc، بک‌دراپ، فوکوس‌برگشت، ?section= از نشانی', () => {
    expect(view).toMatch(/function buildEdgeRail\(\)/);
    expect(view).toMatch(/const drawerEsc = \(e\) => \{ if \(e\.key === 'Escape' && activeSectionKey\) closeRef\(activeSectionKey\); \};/);
    expect(view).toMatch(/drawerBackdrop\.addEventListener\('click'/);
    expect(view).toMatch(/if \(railBtn\) railBtn\.focus\(\);/);
    expect(view).toMatch(/drawer\.classList\.add\('is-open'\)/);
    expect(css).toMatch(/\.refdrawer\.is-open \{ transform: none; \}/);
    expect(css).toMatch(/\.workshop \{/);
    expect(css).toMatch(/@media \(max-width: 1080px\)/);
  });

  it('dispatchTab مقصد صریح دارد — هاب mount پیش‌فرض و کشو ظرف اختصاصی (موج ۴)', () => {
    expect(view).toContain('function dispatchTab(key, box = hubMount)');
    expect(view).toContain('if (desc) { desc.mount(box, ctx); return; }');
    expect(view).toContain('dispatchTab(activeSectionKey, drawerMount)');
    expect(view).not.toContain('const refRoot ='); // آکاردئون کلاسیک حذف شد
    expect(view).toContain("import { resolveWorkshopLanding } from '../profile/landing.js'");
    expect(view).toContain('resolveWorkshopLanding({ canSeeClinical: Boolean(canSeeClinical), canSeeGames: Boolean(canSeeGames), query: ctx.query ?? {} })');
  });

  it('نوار کار پیش‌فرض جمع است — تفسیر بالینی قهرمان فولد اول', () => {
    expect(view).toMatch(/let workbarCollapsed = true;/);
  });
});

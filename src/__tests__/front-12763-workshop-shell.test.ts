/**
 * گیت موج ۲ (۱.۲۷.۶۳) — پوستهٔ «کارگاه درمان»: هاب درمان + ریل لبه + کشوی مرجع، پشت فلگ برگشت.
 * قرارداد برنامهٔ بازطراحی (docs/PROFILE-REDESIGN-PROGRAM.md §۵ و §۹):
 *  ① پیش‌فرض پوسته = کارگاه؛ فلگ برگشت localStorage 'cs.profile.shell'='desk' و ?shell=desk.
 *  ② هاب: نوار sticky (خط درمان از فصل‌های تاریخچه + جلسهٔ بعدی) + بدنهٔ همیشه‌نما (تفسیر بالینی
 *     برای نقش بالینی، هاب امروز برای بقیه) — فقط یک‌بار mount؛ repaint دوباره mount نمی‌کند.
 *  ③ ریل لبه = همان ۹ بخش refSections با برچسب کوتاه؛ کلیک = کشوی لغزنده با Esc/بک‌دراپ/فوکوس‌برگشت.
 *  ④ پوستهٔ کلاسیک دست‌نخورده: desk دوستونه + آکاردئون + ظرف مشترک content — dispatchTab مقصد صریح دارد.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('پوستهٔ «کارگاه درمان» — ۱.۲۷.۶۳ (بررسی منبع، الگوی گیت ۱۲۷۵۸)', () => {
  const view = read('public/assets/js/views/student-profile.js');
  const css = read('public/assets/css/views.css');

  it('فلگ پوسته: پیش‌فرض کارگاه، برگشت با ?shell=desk یا localStorage', () => {
    expect(view).toContain("localStorage.getItem('cs.profile.shell') === 'desk'");
    expect(view).toMatch(/if \(q === 'desk' \|\| q === 'workshop'\) return q;/);
    expect(view).toMatch(/return 'workshop';/);
    expect(view).toMatch(/const isWorkshop = shellMode === 'workshop';/);
    expect(view).toContain("'پوستهٔ کلاسیک میز جلسه — برگشت به چیدمان قبلی'");
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
    expect(view).toMatch(/chips\.push\(el\('span', \{ class: 'hub__stitle' \}, 'خط درمان:'\)\)/);
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

  it('dispatchTab مقصد صریح دارد و پوستهٔ کلاسیک با همان ظرف content می‌ماند', () => {
    expect(view).toMatch(/function dispatchTab\(key, box = content\)/);
    expect(view).toMatch(/dispatchTab\(activeSectionKey, isWorkshop \? drawerMount : content\)/);
    expect(view).toMatch(/const refRoot = isWorkshop \? null : buildReference\(\);/);
    expect(view).toMatch(/deskMain\.replaceChildren\(buildWorkbar\(activeStation\)\)/);
    expect(view).toMatch(/deskRef\.replaceChildren\(buildNextApptCard\(\), refRoot\)/);
    expect(view).toMatch(/import \{ resolveWorkshopLanding \} from '\.\.\/profile\/landing\.js'/);
    expect(view).toMatch(/resolveWorkshopLanding\(\{ canSeeClinical: Boolean\(canSeeClinical\), canSeeGames: Boolean\(canSeeGames\), query: ctx\.query \?\? \{\} \}\)/);
  });

  it('نوار کار در کارگاه پیش‌فرض جمع است — تفسیر بالینی قهرمان فولد اول', () => {
    expect(view).toMatch(/let workbarCollapsed = isWorkshop;/);
  });
});

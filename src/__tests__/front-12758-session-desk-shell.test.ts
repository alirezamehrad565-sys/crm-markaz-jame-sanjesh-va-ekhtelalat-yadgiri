/**
 * گیت پوستهٔ کلاسیک پروفایل — ۱.۲۷.۷۱ (sdt149 — خواست کارفرما: «سیستم قدیمی بهتر بود»).
 * کل نمای پروفایل از کامیت ۱.۲۷.۵۷ (آخرین پوستهٔ کلاسیک پیش از «میز جلسه») بازگردانده شد:
 *  ① page-head + کارت وضعیت (ردیف اقدام) + کارت مدارک + نوار تب کلاسیک ui.tabs.
 *  ② برچسب تب‌ها کوتاه (اطلاعات پایه/تفسیر بالینی/روایت بالینی/تاریخچه/جلسات/تمرین‌ها/بازی‌ها/ارتباطات).
 *  ③ dispatch رجیستری‌اول با fallback کامل قدیمی؛ دیپ‌لینک ?tab=/?filter= محترم؛ followups فیلتر تاریخچه.
 *  ④ هیچ ردی از idbar/ptabs/هاب/ایستگاه/کشو نیست — ابزارک مرده نمی‌ماند.
 *  ⑤ CSS: خانوادهٔ کلاسیک (next-action/profile-actions) + تب مشترک سایت + پولیش ۱.۲۷.۷۰.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('پوستهٔ کلاسیک پروفایل — بازگشت به ۱.۲۷.۵۷ (۱.۲۷.۷۱)', () => {
  const view = read('public/assets/js/views/student-profile.js');
  const viewsCss = read('public/assets/css/views.css');

  it('① اسکلت کلاسیک: page-head + کارت وضعیت + مدارک + تب کلاسیک — بدون نوار هویت', () => {
    expect(view).toContain('function buildStatusCard()');
    expect(view).toContain('function renderInfoTab(');
    expect(view).toContain('statusCard,\n    docsMount,');
    expect(view).not.toContain('function buildIdentityBar()');
    expect(view).not.toContain("class: 'idbar'");
    expect(view).toContain("'بازگشت به فهرست'");
  });

  it('② برچسب تب‌ها کوتاه است — قرارداد مشترک ui.tabs', () => {
    expect(view).toContain("{ key: 'info', label: 'اطلاعات پایه', icon: 'user', onSelect: selectTab },");
    expect(view).toContain("{ key: 'clinical', label: 'تفسیر بالینی', icon: 'brain', onSelect: selectTab }");
    expect(view).toContain("{ key: 'timeline', label: 'تاریخچه', icon: 'clock', onSelect: selectTab },");
    expect(view).toContain("{ key: 'sessions', label: auxDone ? `جلسات (${fa(appointments.length)})` : 'جلسات', icon: 'calendar', onSelect: selectTab },");
    expect(view).toContain("{ key: 'comms', label: 'ارتباطات', icon: 'bot', onSelect: selectTab }");
    expect(view).toContain("let tabBar = tabs(tabItems(), 'info');");
    expect(view).not.toContain('RAIL_SHORT_LABEL');
  });

  it('③ dispatch رجیستری‌اول + fallback کامل قدیمی — بدون ماژول ایستگاه', () => {
    expect(view).toContain('const desc = profileTabs.resolve(key, ctx);');
    expect(view).toContain('if (desc) { desc.mount(content, ctx); return; }');
    for (const k of ['info: renderInfoTab', 'clinical: renderClinicalTabContent', 'timeline: renderTimelineTab',
      'sessions: renderSessionsTab', 'comms: renderCommsTab', 'exercises: renderExercisesTabContent',
      'games: renderGamesTabContent', 'narrative: renderNarrativeTabContent'])
      expect(view).toContain(k);
    expect(view).toContain('(renderer ?? renderInfoTab)(content);');
    for (const sym of ['STATION_ORDER', 'STATION_LABEL', 'buildFlowBar', 'buildHubSticky', 'renderDesk',
      'setStation', 'computeDeskState', 'buildIdentityMenu', 'dispatchTab', 'buildFollowupsCard', 'openRef'])
      expect(view).not.toContain(sym);
  });

  it('④ دیپ‌لینک کلاسیک ?tab=/?filter= — followups فیلتر تاریخچه می‌شود؛ برگهٔ جلسه خانهٔ خودش را دارد', () => {
    expect(view).toContain('const requestedTab = ctx.query?.tab;');
    expect(view).toContain('const timelineDeepFilter = ctx.query?.filter ?? (requestedTab === \'followups\' ? \'followups\' : null);');
    expect(view).toContain("selectTab(requestedTab === 'followups' ? 'timeline' : (knownTabs.includes(requestedTab) ? requestedTab : 'info'));");
    expect(view).toContain('function buildSessionSheet()');
    expect(view).toContain("el('div', { class: 'card__body' },\n          buildSessionSheet(),");
  });

  it('⑤ CSS: خانوادهٔ کلاسیک هست و خانواده‌های میانی پاک‌اند + پولیش ۱.۲۷.۷۰ حفظ', () => {
    expect(viewsCss).toContain('.tabs {');
    expect(viewsCss).toContain('.next-action {');
    expect(viewsCss).toContain('.profile-actions {');
    expect(viewsCss).toContain('font-weight: 700; /* سلسله‌مراتب: فعال از غیرفعال سبک‌تر دیده نمی‌شود */');
    for (const sym of ['.flowbar', '.flowstep', '.stbadge', '.workbar', '.hub__', '.flow-cta', '.ptabs', '.ptab'])
      expect(viewsCss).not.toContain(sym);
    expect(viewsCss).not.toMatch(/\.refdrawer|\.edge__btn|\.infopanel/);
  });
});

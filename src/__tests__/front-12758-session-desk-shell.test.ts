/**
 * گیت ۱.۲۷.۶۹ — پوستهٔ «میز پرونده» (sdt147 — خواست کارفرما: هماهنگی زبان طراحی با بقیهٔ سایت + حذف فلوی آماده‌سازی/برگزاری).
 * قراردادها:
 *  ① نوار هویت فشرده با ردیف facts — قرارداد ۱.۲۷.۶۷ حفظ است.
 *  ② فلوی آماده‌سازی←برگزاری←ثبت←پیگیری، نوار کار تاشو، هاب sticky و CTA چسبان موبایل حذف شدند — ابزارکِ بی‌فایده نیست، نماها هست.
 *  ③ تب نماها = ui.tabs() کلاسیک (همان کامپوننت مالی/بازی‌ها/غربالگری) — role=tab، پیمایش RTL با کلیدهای جهت، تب فعال در دید.
 *  ④ کارت فعال inline در tabMount؛ دیپ‌لینک ?tab=/?section= محترم؛ ?station= قدیمی دیگر ناوبری ایستگاهی ندارد.
 *  ⑤ CSS: خانوادهٔ فلو/هاب/ptabs پاک — فقط tabmount/tabowner از خانوادهٔ میز مانده.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('پوستهٔ «میز پرونده» — ۱.۲۷.۶۹', () => {
  const view = read('public/assets/js/views/student-profile.js');
  const viewsCss = read('public/assets/css/views.css');

  it('① نوار هویت فشرده + facts (قرارداد ۱.۲۷.۶۷ حفظ)', () => {
    expect(view).not.toContain('function buildStatusCard()'); // کارت سربرگ قدیمی حذف است
    expect(view).toContain('function buildIdentityBar()');
    expect(view).toContain("el('div', { class: 'idbar' }");
    expect(view).toContain('فصل جاری: ${chapterLabelOf(timeline.meta.chapters.at(-1))}');
    expect(view).toContain('onclick: () => openRef(\'timeline\')');
    expect(view).toContain('مسئول پرونده: ${student.ownerName}');
    expect(view).toContain("class: 'idbar__facts'");
  });

  it('② ماژول فلوی آماده‌سازی/برگزاری حذف شد — هیچ ابزارک ایستگاهی باقی نیست', () => {
    for (const sym of ['STATION_ORDER', 'STATION_LABEL', 'STATION_ICON', 'stationRemLine', 'buildFlowBar', 'buildFlowCta',
      'buildWorkbar', 'buildStationPanel', 'buildHubSticky', 'renderDesk', 'setStation', 'continueFromPrevious',
      'activeStation', 'workbarHolder', 'hubStickyEl', 'flowHolder', 'flowCtaHolder', 'stationBadge', 'computeDeskState'])
      expect(view).not.toContain(sym);
    /* خانهٔ واقعی همان قابلیت‌ها: بایگانی جلسات (تب) و صدور گزارش قطعی (دکمهٔ نوار هویت) */
    expect(view).toContain("{ key: 'sessions', label: 'بایگانی جلسات، حضور و نوبت‌ها', icon: 'calendar', when: () => true }");
    expect(view).not.toContain('buildNextApptCard');
    expect(view).not.toContain("const desk = el('div', { class: 'desk' }");
  });

  it('③ تب کلاسیک ui.tabs() — قرارداد مشترک سایت؛ کارت اول «اطلاعات پایه»', () => {
    expect(view).toContain('function buildTabBar()');
    expect(view).toContain("{ key: 'info', label: RAIL_SHORT_LABEL.info, icon: 'user' }");
    expect(view).toContain("const bar = tabs(views.map((s) => ({ key: s.key, label: s.label, icon: s.icon, onSelect: (k) => openRef(k) })), activeSectionKey ?? 'info');"); // ۱.۲۷.۷۰ — کلاس profile-tabs برای فاصلهٔ استاندارد
    expect(view).toContain("bar.root.classList.add('profile-tabs')");
    expect(view).toContain('const tabBar = buildTabBar();');
    expect(view).toContain('idbarHolder,\n    tabBar.root,\n    tabMount');
    expect(view).not.toContain('function buildProfileTabs()');
    expect(view).not.toContain("class: 'ptabs'");
    /* بالینی هم مثل بقیه تب است — بدون شاخهٔ فلش و کلاس hub-flash */
    expect(view).not.toContain('hub-flash');
    expect(view).not.toContain("key === 'clinical') {");
    expect(view).toContain('tabBar.setActive(key);');
  });

  it('④ دیپ‌لینک ?tab=/?section= محترم؛ ?station= دیگر ناوبری ایستگاهی ندارد', () => {
    const landing = read('public/assets/js/profile/landing.js');
    expect(landing).toContain("sessions: 'station'"); // نگاشت قدیمی در تابع خالص می‌ماند
    expect(view).toContain('openRef(landing.drawer');
    expect(view).not.toContain('if (landing.station)');
    expect(view).not.toContain('STATION_ORDER.includes');
    expect(view).toContain('dispatchTab(key, tabMount)');
    expect(view).toContain('snapshot: renderSnapshotSection');
    expect(view).toContain('openSnapshotModal(String(e.ref.id))');
  });

  it('⑤ CSS: خانوادهٔ فلو/هاب پاک؛ tabmount/tabowner مانده؛ تب کلاسیک سایت از قبل هست', () => {
    for (const sym of ['.flowbar', '.flowstep', '.stbadge', '.workbar', '.hub__', '.hub-today', '.hub-flash', '.flow-cta', '.ptabs', '.ptab'])
      expect(viewsCss).not.toContain(sym);
    expect(viewsCss).toContain('.tabmount {');
    expect(viewsCss).toContain('.tabowner {');
    expect(viewsCss).toContain('.tabs {'); // قرارداد مشترک ui.tabs
    expect(viewsCss).not.toMatch(/\.workshop/);
    expect(viewsCss).not.toMatch(/^\.desk \{/m);
    expect(viewsCss).not.toMatch(/^\.refitem \{/m);
    expect(viewsCss).not.toMatch(/^\.nextappt \{/m);
  });

  it('⑥ callbackهای mutation پیش از mount تعریف می‌شوند (TDZ-safe) و جریان پیوستهٔ ۱.۲۰.۰ حفظ است', () => {
    const mountIdx = view.indexOf('idbarHolder.replaceChildren(buildIdentityBar())');
    const ownerIdx = view.indexOf('const onOwnerSaved =');
    expect(ownerIdx).toBeGreaterThan(-1);
    expect(mountIdx).toBeGreaterThan(ownerIdx); // نوار هویت هنگام ساخت به onOwnerSaved ارجاع دارد
    expect(view).toContain('function repaintChrome()');
    expect(view).toContain('idbarHolder.replaceChildren(buildIdentityBar())');
  });
});

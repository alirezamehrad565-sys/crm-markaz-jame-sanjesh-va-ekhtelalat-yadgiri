/**
 * گیت ۱.۲۷.۵۸ — پوستهٔ «میز جلسه + پروندهٔ مرجع» (برندهٔ مسابقهٔ بازطراحی اساسی پروندهٔ دانش‌آموز — طرح ۴).
 * منبع طرح: docs/PROFILE-UI-TOURNAMENT.md (داوری ۶ ساب‌ایجنت روی ۹ اسکرین‌شات واقعی؛ برنده ۹٫۶/۱۰).
 * قراردادها:
 *  ① نوار هویت فشرده جایگزین کارت سربرگ نیم‌صفحه‌ای — «حذف» از مسیر ناوبری به منوی برچسب‌دار رفت.
 *  ② نوار فلو چهار ایستگاهی با «مانده‌های واقعی» — یک منبع با معلق‌های موج A (missingReportAppts/حضور/پیگیری).
 *  ③ میز جلسه فقط ایستگاه فعال را رندر می‌کند؛ بایگانی جلسات در مرجع (آ-۶) با همان رندرر قدیمی.
 *  ④ پروندهٔ مرجع آکاردئون ۹‌بخشی با mount تنبل — ظرف مشترک content جابه‌جا می‌شود (جریان پیوستهٔ ۱.۲۰.۰ حفظ).
 *  ⑤ دیپ‌لینک‌های ?tab= قدیمی محترم‌اند؛ «گزارش قطعی» خانهٔ دائمی آ-۵ گرفت؛ CTA چسبان موبایل زیر قوس شست.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('پوستهٔ «میز جلسه + پروندهٔ مرجع» — ۱.۲۷.۵۸', () => {
  const view = read('public/assets/js/views/student-profile.js');
  const viewsCss = read('public/assets/css/views.css');

  it('نوار هویت فشرده: بدون کارت وضعیت قدیمی، با منوی برچسب‌دار و فصلِ کلیک‌پذیر', () => {
    expect(view).not.toContain('function buildStatusCard()'); // پوستهٔ قدیمی حذف شد
    expect(view).toContain('function buildIdentityBar()');
    expect(view).toContain("el('div', { class: 'idbar' }");
    expect(view).toContain('فصل جاری: ${chapterLabelOf(timeline.meta.chapters.at(-1))}'); // قرارداد ۱.۲۷.۵۷ حفظ
    expect(view).toContain('onclick: () => openRef(\'timeline\')'); // فصل جاری کلیک‌پذیر شد
    expect(view).toContain('مسئول پرونده: ${student.ownerName}'); // بج مسئول
  });

  it('نوار فلو: چهار ایستگاه با مانده‌های واقعی و CTA اصلی «ادامه از جلسهٔ قبل»', () => {
    expect(view).toContain("const STATION_ORDER = ['ready', 'hold', 'log', 'follow']");
    expect(view).toContain("ready: 'آماده‌سازی', hold: 'برگزاری', log: 'ثبت گزارش', follow: 'پیگیری'");
    /* ۱.۲۷.۶۴ — خط ایستگاه به ماژول خالص station-state منتقل شد (تک‌منبع با بج نوار ابزار) */
    const stationStateSrc = read('public/assets/js/profile/station-state.js');
    expect(stationStateSrc).toContain('حضور ثبت‌نشده');
    expect(view).toContain('ادامه از جلسهٔ قبل'); // CTA نوار فلو + پنل آماده‌سازی + CTA موبایل
    expect(view).toContain("const target = missingReportAppts()[0] ?? upcomingAppt();"); // یک منبع با موج A
  });

  it('نوار ابزار + نوار کار تاشو: ایستگاه فعال در نوار کار؛ بایگانی جلسات در کشوی مرجع (موج ۴)', () => {
    expect(view).toContain('function buildStationPanel(key)');
    expect(view).toContain('workbarHolder.replaceChildren(buildWorkbar(activeStation))');
    /* ۱.۲۷.۶۶ — کارت مردهٔ «جلسهٔ بعدی و نوبت‌ها» حذف شد؛ بایگانی جلسات خانهٔ ریلش را دارد */
    expect(view).toContain("{ key: 'sessions', label: 'بایگانی جلسات، حضور و نوبت‌ها', icon: 'calendar', when: () => true }");
    expect(view).not.toContain('buildNextApptCard');
    expect(view).not.toContain("const desk = el('div', { class: 'desk' }"); // گرید دوستونهٔ کلاسیک حذف شد
  });

  it('پروندهٔ مرجع: ریل لبهٔ ۹بخشی + کشوی لغزنده با mount تنبل (آکاردئون کلاسیک حذف شد — موج ۴)', () => {
    expect(view).toContain('function refSections()');
    expect(view).toContain("{ key: 'snapshot', label: 'گزارش‌های قطعی — واریانت متخصص/خانواده/مدرسه + چاپ A4', icon: 'file', when: () => true }");
    expect(view).toContain('function buildEdgeRail()');
    expect(view).toContain('dispatchTab(key, drawerMount)'); // ظرف اختصاصی کشو — هاب دست‌نخورده
    expect(view).not.toContain('function buildReference()'); // آکاردئون کلاسیک حذف شد
    expect(view).not.toContain('body.replaceChildren(content)'); // ظرف مشترک قدیمی حذف شد
    expect(view).toContain('snapshot: renderSnapshotSection'); // آ-۵ در dispatch
    expect(view).toContain('openSnapshotModal(String(e.ref.id))'); // آرشیو نسخه‌ها از همان قرارداد موج ۳
  });

  it('دیپ‌لینک ?tab=/?section= محترم: نگاشت یک‌منبع در landing.js — بدون مسیر کلاسیک (موج ۴)', () => {
    const landing = read('public/assets/js/profile/landing.js');
    expect(landing).toContain("sessions: 'station'");
    expect(landing).toContain("rawTab === 'followups' ? 'timeline' : rawTab");
    expect(view).toContain('resolveWorkshopLanding({ canSeeClinical: Boolean(canSeeClinical), canSeeGames: Boolean(canSeeGames), query: ctx.query ?? {} })');
    expect(view).not.toContain('REF_OF_TAB'); // نگاشت دوگانه حذف شد
    expect(view).toContain('if (landing.station) activeStation = landing.station;');
  });

  it('لندینگ از قاعدهٔ واحد «وضعیت میز» (جدول ۵ نقد، ۱.۲۷.۶۰) — جلسهٔ نزدیک → آماده‌سازی نه برگزاری', () => {
    expect(view).toContain('activeStation = computeDeskState({');
    expect(view).toContain('!STATION_ORDER.includes(ctx.query?.station)');
    expect(view).toContain("import { computeDeskState } from '../profile/desk-state.js'");
  });

  it('CSS کارگاه با رسپانسیو موبایل؛ بلوک‌های مردهٔ پوستهٔ کلاسیک پاک شده‌اند (موج ۴)', () => {
    expect(viewsCss).toMatch(/\.workshop \{/);
    expect(viewsCss).toMatch(/\.flow-cta-mobile \{/);
    expect(viewsCss).not.toMatch(/^\.desk \{/m);
    expect(viewsCss).not.toMatch(/^\.refitem \{/m);
    expect(viewsCss).not.toMatch(/^\.nextappt \{/m);
    expect(viewsCss).not.toContain('.refitem__body');
  });

  it('callbackهای mutation پیش از mount تعریف می‌شوند (TDZ-safe) و جریان پیوستهٔ ۱.۲۰.۰ حفظ است', () => {
    const mountIdx = view.indexOf('idbarHolder.replaceChildren(buildIdentityBar())');
    const ownerIdx = view.indexOf('const onOwnerSaved =');
    expect(ownerIdx).toBeGreaterThan(-1);
    expect(mountIdx).toBeGreaterThan(ownerIdx); // نوار هویت هنگام ساخت به onOwnerSaved ارجاع دارد
    expect(view).toContain('function repaintChrome()');
    expect(view).toContain('idbarHolder.replaceChildren(buildIdentityBar())');
  });
});

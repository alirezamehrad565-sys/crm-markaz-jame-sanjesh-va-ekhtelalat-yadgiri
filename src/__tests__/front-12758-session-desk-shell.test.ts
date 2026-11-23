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
    expect(view).toContain('حضور ثبت‌نشده`');
    expect(view).toContain('ادامه از جلسهٔ قبل'); // CTA نوار فلو + پنل آماده‌سازی + CTA موبایل
    expect(view).toContain("const target = missingReportAppts()[0] ?? upcomingAppt();"); // یک منبع با موج A
  });

  it('میز جلسه: فقط ایستگاه فعال؛ حضور با چهار وضعیت؛ بایگانی جلسات در مرجع', () => {
    expect(view).toContain('function buildStationPanel(key)');
    expect(view).toContain("const desk = el('div', { class: 'desk' }, deskMain, deskRef);");
    expect(view).toContain("deskRef.replaceChildren(buildNextApptCard(), refRoot)");
    expect(view).toContain("openRef('sessions')"); // لینک بایگانی از کارت نوبت
  });

  it('پروندهٔ مرجع: آکاردئون ۹‌بخشی با mount تنبل و ظرف مشترک content', () => {
    expect(view).toContain('function refSections()');
    expect(view).toContain("{ key: 'snapshot', label: 'گزارش‌های قطعی — واریانت متخصص/خانواده/مدرسه + چاپ A4', icon: 'file', when: () => true }");
    expect(view).toContain("addEventListener('toggle'");
    expect(view).toContain('body.replaceChildren(content)'); // ظرف مشترک ۱.۲۰.۰ جابه‌جا می‌شود
    expect(view).toContain('snapshot: renderSnapshotSection'); // آ-۵ در dispatch
    expect(view).toContain('openSnapshotModal(String(e.ref.id))'); // آرشیو نسخه‌ها از همان قرارداد موج ۳
  });

  it('دیپ‌لینک ?tab= محترم: نقشهٔ REF_OF_TAB + جلسهٔ قدیمی → ایستگاه ثبت + followups → تاریخچه', () => {
    expect(view).toContain("const REF_OF_TAB = { info: 'info', timeline: 'timeline', clinical: 'clinical', narrative: 'narrative', exercises: 'exercises', games: 'games', comms: 'comms' }");
    expect(view).toContain("if (requestedTab === 'sessions') activeStation = 'log'");
    expect(view).toContain("requestedTab === 'followups' ? 'timeline' : requestedTab");
    expect(view).toContain('if (requestedRef) pendingTab = requestedRef'); // بافر دادهٔ موازی حفظ
  });

  it('لندینگ از قاعدهٔ واحد «وضعیت میز» (جدول ۵ نقد، ۱.۲۷.۶۰) — جلسهٔ نزدیک → آماده‌سازی نه برگزاری', () => {
    expect(view).toContain('activeStation = computeDeskState({');
    expect(view).toContain('!STATION_ORDER.includes(ctx.query?.station)');
    expect(view).toContain("import { computeDeskState } from '../profile/desk-state.js'");
  });

  it('CTA چسبان موبایل + گرید دوستونه: CSS پوسته با رسپانسیو ≤980px', () => {
    expect(viewsCss).toMatch(/\.idbar\s*\{/);
    expect(viewsCss).toMatch(/\.flowstep\.is-active/);
    expect(viewsCss).toMatch(/\.desk\s*\{\s*[^}]*grid-template-columns:\s*minmax\(0,\s*1\.6fr\)\s*minmax\(0,\s*1fr\)/);
    expect(viewsCss).toMatch(/\.flow-cta-mobile\s*\{\s*display:\s*none/); // دسکتاپ مخفی
    expect(viewsCss).toMatch(/@media \(max-width: 980px\)\s*\{[^@]*\.flow-cta-mobile\s*\{[^}]*position:\s*sticky/);
    expect(viewsCss).toMatch(/\.refitem\s*\{/);
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

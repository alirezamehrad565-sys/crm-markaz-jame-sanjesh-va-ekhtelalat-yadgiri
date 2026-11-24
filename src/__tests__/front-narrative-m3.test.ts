/**
 * POLISH-3 M3 — گیت روایت بالینی پرونده (۱.۲۷.۲۶)
 *
 * نقد داستان‌محور (سفر ۲): فرضیهٔ موتور، مصوبهٔ کمیته، مسیر مداخله و نتیجهٔ پراپ پراکنده بودند
 * و «روایت پیوستهٔ پرونده» وجود نداشت. این گیت قفل می‌کند:
 * ۱) endpoint فقط‌خواندنی /api/students/:id/clinical-narrative با نقش‌های هم‌تراز case-formulation
 * ۲) سرویس getClinicalNarrative در رجیستری متدهای clinical-engine ثبت شده است
 * ۳) تب «روایت بالینی» در پروفایل: فقط هم‌تراز تفسیر بالینی (canSeeClinical)، دیپ‌لینک ?tab=narrative،
 *    chunk تنبل (الگوی games-console)، حالت خالی راهنما
 * ۴) داشبورد: چیپ‌های حسابرسی موردی به روایت همان پرونده حفر می‌شوند
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('POLISH-3 M3 — روایت بالینی', () => {
  test('endpoint فقط‌خواندنی با نقش‌های هم‌تراز case-formulation ثبت شده', () => {
    const routes = read('src/domain/clinical-engine/routes.ts');
    expect(routes).toMatch(/app\.get\('\/api\/students\/:id\/clinical-narrative', requireRole\('manager', 'secretary', 'therapist'\)/);
    expect(routes).toContain('service.getClinicalNarrative');
  });

  test('سرویس: getClinicalNarrative در رجیستری متدها و پشت assertCanView', () => {
    const service = read('src/domain/clinical-engine/service.ts');
    expect(service).toContain('async function getClinicalNarrative(studentId: string, actor: AuthContext)');
    expect(service).toContain('getClinicalNarrative, getFamilyProgressSheet, mintProgressSheetLink }');
    // دسترسی: اول loadStudent + assertCanView، بعد listPaths با همان دسترسی
    expect(service).toMatch(/async function getClinicalNarrative[\s\S]*?assertCanView\(student, actor\);[\s\S]*?await listPaths\(studentId, actor\);/);
    // کمیته و پراپ: بدون N+1 — IN تکه‌بندی‌شده
    expect(service).toMatch(/FROM committee_items ci[\s\S]*?JOIN committee_meetings m[\s\S]*?WHERE ci\.student_id = \? AND ci\.deleted_at IS NULL/);
    expect(service).toMatch(/inParamChunks\(pathIds\)/);
  });

  test('تایپ‌های روایت در types.ts ثبت شده‌اند', () => {
    const types = read('src/domain/clinical-engine/types.ts');
    expect(types).toContain('export interface ClinicalNarrative');
    expect(types).toContain('export interface NarrativePathBlock');
    expect(types).toContain('export interface NarrativeCommitteeBlock');
    expect(types).toContain('export interface NarrativeProbeTrend');
  });

  test('پروفایل: بخش روایت هم‌تراز تفسیر بالینی در مرجع + دیپ‌لینک + chunk تنبل (۱.۲۷.۵۸)', () => {
    const profile = read('public/assets/js/views/student-profile.js');
    /* ۱.۲۷.۷۱ — قرارداد کلاسیک: روایت تب هم‌تراز تفسیر (tabItems + رجیستری)؛ دیپ‌لینک ?tab=narrative */
    expect(profile).toContain("{ key: 'narrative', label: 'روایت بالینی', icon: 'book', onSelect: selectTab }");
    expect(profile).toContain("{ key: 'narrative', when: () => canSeeClinical");
    expect(profile).toContain("selectTab(requestedTab === 'followups' ? 'timeline' : (knownTabs.includes(requestedTab) ? requestedTab : 'info'));");
    expect(profile).toContain('narrative: renderNarrativeTabContent');
    expect(profile).toContain("import('../student-narrative.js')");
  });

  test('ماژول روایت: حالت خالی راهنما + خط زمان tl-* + بج‌های وضعیت', () => {
    const nar = read('public/assets/js/student-narrative.js');
    expect(nar).toContain("'روایت بالینی — از فرضیه تا نتیجه'");
    expect(nar).toContain('iconName: \'book\'');
    expect(nar).toContain('هنوز روایتی برای این پرونده ثبت نشده است');
    expect(nar).toContain("class: 'tl-list'");
    expect(nar).toContain("class: 'tl-item'");
    expect(nar).toContain('PATH_STATUS_BADGE');
    expect(nar).toContain('DECISION_STATUS_BADGE');
    // نتیجهٔ پراپ: روند + ملاک تسلط
    expect(nar).toContain('نتیجهٔ پراپ');
    expect(nar).toContain('ملاک تسلط');
    // فقط‌خواندنی: هیچ فرم/modal/پست در روایت نیست
    expect(nar).not.toMatch(/openModal|api\.post|api\.patch|formModal/);
  });

  test('داشبورد: چیپ‌های حسابرسی به روایت بالینی حفر شده‌اند', () => {
    const dash = read('public/assets/js/views/dashboard.js');
    expect(dash).toContain("#/students/${a.studentId}?tab=narrative");
    // دو مسیر: کلیک + کیبورد (الگوی مشترک حفر)
    expect(dash.match(/location\.hash = `#\/students\/\$\{a\.studentId\}\?tab=narrative`;/g)?.length).toBe(2);
  });
});

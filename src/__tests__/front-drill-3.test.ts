/**
 * POLISH-3 M2 — گیت «هر نمودار یا حفر دارد یا می‌رود»
 *
 * نقد داستان‌محور (docs/PRODUCT-STORY-CRITIQUE.fa.md §۴): از ۳۷ کارت/شاخص داشبورد و آمار دوره
 * فقط ۹ مورد هدف‌دار بودند — بقیه پوستر بودند: عددِ بدون مقصد. این گیت حفرِ تازه‌ها را قفل می‌کند:
 * ۱) kpi() مشترک پارامتر href دارد و کلیک/کیبورد (Enter/Space) را می‌بَرد
 * ۲) داشبورد: گرید KPI، آلرت نوبت بعدی، تابلوی پیشرفت، پیگیری‌های سررسیده، پیرشدن لیست انتظار،
 *    اطلاع‌رسانی، روند ۷روز، امتیاز کل درمانگر — همه حفر دارند
 * ۳) گزارش دوره: گرید ۹KPI + دونات حضور + بار کاری + مدارس مبدأ + برچسب‌های پرتکرار + قیف — همه حفر دارند
 * ۴) students مقصد حفرهاست: tag_id (از قبل) + school_id (تازه)
 * ۵) شاخص‌های مرکز: چهار بخش پیوند حفر دارند
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FRONT = join(__dirname, '../../public/assets/js');
const read = (p: string) => readFileSync(join(FRONT, p), 'utf8');

describe('POLISH-3 M2 — حفر نمودارها', () => {
  test('kpi مشترک: پارامتر href + کلاس kpi--link + کیبورد', () => {
    const ui = read('ui.js');
    expect(ui).toMatch(/export function kpi\(label, value, sub, tone = 'primary', fmt, href\)/);
    expect(ui).toContain('kpi--link');
    expect(ui).toContain('onkeydown');
  });

  test('داشبورد: گرید KPI مدیر حفر دارد', () => {
    const dash = read('views/dashboard.js');
    expect(dash).toContain("'primary', null, '#/appointments')"); // نوبت‌های امروز
    expect(dash).toContain("null, '#/working-day')"); // در انتظار حضور و غیاب + نرخ غیبت
    expect(dash).toContain("null, '#/waitlist')"); // لیست انتظار — tone سه‌حالته است (accent/neutral)
    expect(dash).toContain("'primary', null, '#/students')"); // دانش‌آموزان فعال
  });

  test('داشبورد: آلرت نوبت بعدی (مدیر و درمانگر) به تقویم می‌رود', () => {
    const dash = read('views/dashboard.js');
    expect(dash).toMatch(/title: 'مشاهده در تقویم نوبت‌ها', onclick: \(\) => \{ location\.hash = '#\/appointments'; \}/g);
    // دو بار: یک بار درمانگر، یک بار مدیر
    expect(dash.match(/title: 'مشاهده در تقویم نوبت‌ها'/g)?.length).toBe(2);
  });

  test('داشبورد: تابلو/پیگیری‌ها/پیرشدن/اطلاع‌رسانی/روند/امتیاز کل حفر دارند', () => {
    const dash = read('views/dashboard.js');
    expect(dash).toContain("scoring?.since, '#/staff')"); // تابلوی پیشرفت مدیر → کارکنان
    // نمای درمانگر بدون لینک می‌ماند (#/staff فقط مدیر است)
    expect(dash).toContain("'تابلوی پیشرفت', session.user?.staffId, scoring?.since));");
    expect(dash).toContain("'پیگیری‌های معوق در نیازهای ویژه'");
    expect(dash).toContain("#/special-needs");
    expect(dash).toContain("'لیست انتظار'"); // دکمهٔ حفر کارت پیرشدن
    expect(dash).toContain("#/settings?tab=announce"); // مدیریت اعلان‌ها
    expect(dash).toContain("'گزارش دوره'"); // حفر روند ۷ روز
    expect(dash).toContain("title: 'جزئیات در گزارش دوره'"); // حفر امتیاز کل درمانگر
  });

  test('گزارش دوره: گرید ۹KPI حفر دارد', () => {
    const rep = read('views/reports.js');
    expect(rep).toContain("'primary', null, '#/appointments')"); // نوبت‌های بازه
    expect(rep).toContain("null, '#/working-day')"); // نرخ غیبت دانش‌آموز
    expect(rep).toContain("(v) => \`${fa1(v)} روز\`, '#/waitlist')"); // میانگین انتظار
    expect(rep).toContain("'success', null, '#/exercises')"); // تولید محتوا
    expect(rep).toContain("'primary', null, '#/students')"); // دانش‌آموزان جدید
    expect(rep).toContain("'neutral', null, '#/staff')"); // حضور همکاران
  });

  test('گزارش دوره: دونات/بار کاری/مدارس/برچسب‌ها/قیف حفر دارند', () => {
    const rep = read('views/reports.js');
    expect(rep).toContain("'بورد جلسات روز'"); // حفر دونات حضور
    expect(rep).toContain("'مدیریت کارکنان'"); // حفر بار کاری همکاران
    expect(rep).toContain('#/students?school_id='); // حفر مدارس مبدأ
    expect(rep).toContain('#/students?tag_id='); // حفر برچسب‌های پرتکرار
    expect(rep).toContain("'قیف لیست انتظار — کل تاریخ'");
    expect(rep).toMatch(/لیست انتظار', icon\('chevL', 13\)\)\s*\n\s*\)\s*\n\s*\);/); // دکمهٔ حفر قیف
  });

  test('students: مقصد حفرها — tag_id و school_id از query می‌آیند', () => {
    const stu = read('views/students.js');
    expect(stu).toContain("'tag_id' in ctx.query");
    expect(stu).toContain("'school_id' in ctx.query");
  });

  test('شاخص‌های مرکز: چهار بخش پیوند حفر دارند', () => {
    const ck = read('views/center-kpi.js');
    expect(ck).toContain('sectionTitle(iconName, text, linkTo = null)');
    expect(ck).toContain("'#/working-day'");
    expect(ck).toContain("'#/treatment-plans'");
    expect(ck).toContain("'#/case-event-types'");
    expect(ck).toContain("'#/family-surveys'");
  });
});

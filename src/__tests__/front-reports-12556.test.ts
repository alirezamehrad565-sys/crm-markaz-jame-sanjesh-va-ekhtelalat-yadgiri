/**
 * گیت فرانت ۱.۲۵.۵۶ — چهار خواستهٔ کارفرما روی پایهٔ ریورت‌شده به ۱۸۴cf68 (1.25.52):
 *   ۱) تب «حضور و غیاب همکاران» در #/reports با خروجی CSV دفتر روزبه‌روز
 *   ۲) تلفیق «شاخص‌های مرکز» در تب «گزارش دوره» + حذف نمای مستقل #/center-kpi
 *   ۳) قطع «کتابخانهٔ شبکه» (#/network-library) — UI حذف، سینک سرور نامرئی می‌ماند
 *   ۴) جای «کنترل‌پلین شبکه» → «گزارش باگ» (#/bug-report) برای همهٔ همکاران
 * الگو: front-ux-pro-max.test.ts — ادعاهای ساختاری روی سورس کلاینت.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const JS = join(__dirname, '../../public/assets/js');
const read = (f: string) => readFileSync(join(JS, f), 'utf8');

const app = read('app.js');
const reports = read('views/reports.js');
const centerKpi = read('views/center-kpi.js');

describe('گیت فرانت ۱.۲۵.۵۶ — خواسته‌های چهارگانهٔ کارفرما', () => {
  test('تب سوم «حضور و غیاب همکاران» در #/reports + مسیر در mountMode', () => {
    expect(reports).toMatch(/'data-mode':\s*'attendance'[^)]*«?[\s\S]{0,80}/);
    expect(reports).toContain("'حضور و غیاب همکاران'");
    expect(reports).toMatch(/local\.mode === 'attendance' \? buildAttendanceView\(zone\)/);
    expect(reports).toMatch(/function buildAttendanceView\(zone\)/);
  });

  test('خروجی CSV حضور: BOM + دفتر روزبه‌روز + نام فایل staff-attendance + نمادهای وضعیت', () => {
    expect(reports).toMatch(/function exportAttendanceCsv\(model\)/);
    expect(reports).toContain("new Blob(['\\uFEFF' + lines.join('\\r\\n')]");
    expect(reports).toContain('`staff-attendance-${model.from}_${model.to}.csv`');
    expect(reports).toMatch(/# دفتر حضور و غیاب همکاران/);
    /* هم‌واژگان ماژول حضور همکاران (working-day) */
    expect(reports).toMatch(/present:\s*'حاضر',\s*absent:\s*'غایب',\s*late:\s*'تأخیر',\s*leave:\s*'مرخصی',\s*sick:\s*'بیماری'/);
    /* داده از همان APIهای ماژول حضور می‌آید */
    expect(reports).toMatch(/\/api\/staff-attendance\$\{qs\(\{ from: local\.from, to: local\.to \}\)\}/);
    expect(reports).toMatch(/api\.get\('\/api\/staff'\)/);
  });

  test('تلفیق «شاخص‌های مرکز» در گزارش دوره + حذف کامل نمای مستقل #/center-kpi', () => {
    expect(reports).toMatch(/renderCenterKpi\(centerKpiMount,\s*\{\s*embedded:\s*true\s*\}\)/);
    expect(reports).toMatch(/شاخص‌های مرکز/);
    /* NAV و روت مستقل حذف شده باشند */
    expect(app).not.toMatch(/\{ hash: '#\/center-kpi'/);
    expect(app).not.toMatch(/register\('#\/center-kpi'/);
    /* حالت جاسازی‌شده: دکمهٔ چاپ تکراری ندارد */
    expect(centerKpi).toMatch(/opts\.embedded !== true/);
  });

  test('قطع «کتابخانهٔ شبکه»: NAV/روت/چانک حذف — بدون دست‌زدگی به سینک سرور', () => {
    expect(app).not.toMatch(/\{ hash: '#\/network-library'/);
    expect(app).not.toMatch(/register\('#\/network-library'/);
    expect(existsSync(join(JS, 'views/network-library.js'))).toBe(false);
    expect(existsSync(join(JS, 'views/network-library-meta.js'))).toBe(false);
    /* سینک محتوا سمت سرور سرِ جای خودش است (نامرئی/خودکار) — ماژول‌های سینک CP */
    expect(existsSync(join(__dirname, '../domain/network-content'))).toBe(true);
    expect(existsSync(join(__dirname, '../domain/content-score'))).toBe(true);
  });

  test('جای «کنترل‌پلین» → «گزارش باگ»: لینک #/cp حذف، #/bug-report برای همهٔ همکاران', () => {
    expect(app).not.toMatch(/\{ hash: '#\/cp'/);
    /* ۱.۲۵.۵۷ — نام روایی «گزارش به پشتیبانی» + آیکن عنکبوت (خواست کارفرما) */
    expect(app).toMatch(/\{ hash: '#\/bug-report', label: 'گزارش به پشتیبانی', icon: 'bug', group: 'مرکز' \}/);
    expect(app).toMatch(/register\('#\/bug-report'/);
    expect(existsSync(join(JS, 'views/bug-report.js'))).toBe(true);
  });

  test('پایهٔ ریورت: simon زنده، دو ماژول قطع‌شدهٔ ۱.۲۵.۵۳ در NAV نیستند', () => {
    /* simon روی پایهٔ ۱.۲۵.۵۲ سرِ جای خودش است (چیدمان play/ این دوره) */
    expect(existsSync(join(JS, '../play/kinds/simon.js'))).toBe(true);
    expect(existsSync(join(JS, '../play/skins/simon.css'))).toBe(true);
  });
});

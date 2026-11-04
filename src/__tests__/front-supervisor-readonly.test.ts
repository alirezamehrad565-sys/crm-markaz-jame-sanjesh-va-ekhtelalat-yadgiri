/**
 * گیت ۱.۲۵.۰۱ — ناظر فقط-خواندن: منو و مسیرها هم‌پیمان‌اند
 *
 * کلاس باگ: منوی «مشاهدهٔ مرکز» ناظر ۷ صفحه وعده می‌داد ولی گیت نقشِ سه مسیر
 * (تقویم نوبت‌ها / لیست انتظار / آرشیو) قدیمی بود — ناظر روی ۳ آیتم منوی خودش
 * «دسترسی مجاز نیست» می‌دید. علاوه بر آن، چند اکشن نوشتنی داخل نماهای مجاز
 * (کلیک روی سلول تقویم، درگ کارت، ثبت متقاضی، اکشن‌های آرشیو، حسابرسی موردی)
 * گارد نقش نداشتند و ناظر را تا ۴۰۳ سرور همراهی می‌کردند.
 *
 * این گیت رفتار قراردادی را قفل می‌کند:
 * ۱) هر hash در منوی ناظر باید در گیت مسیرش هم «supervisor» داشته باشد
 * ۲) نماهای مجاز نباید برای ناظر اکشن نوشتنی رندر کنند
 * ۳) هم‌نسخه‌ای version.ts با ?v= و sw.js
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FRONT = join(__dirname, '../../public/assets/js');
const read = (p: string) => readFileSync(join(FRONT, p), 'utf8');

const app = read('app.js');

describe('گیت ۱.۲۵.۰۱ — مسیرهای منوی ناظر', () => {
  test('هر سه مسیر وعده‌داده‌شدهٔ ناظر، supervisor را در گیت دارند', () => {
    // تقویم نوبت‌ها — گیت نقش‌دار
    const apptGate = app.match(/register\('#\/appointments'[\s\S]*?roleOnly\(\s*\[([^\]]*)\]/)?.[1] ?? '';
    expect(apptGate).toContain("'supervisor'");
    // لیست انتظار
    const waitGate = app.match(/register\('#\/waitlist'[\s\S]*?roleOnly\(\[([^\]]*)\]/)?.[1] ?? '';
    expect(waitGate).toContain("'supervisor'");
    // آرشیو
    const archGate = app.match(/register\('#\/archive'[\s\S]*?roleOnly\(\[([^\]]*)\]/)?.[1] ?? '';
    expect(archGate).toContain("'supervisor'");
  });

  test('منوی ناظر دقیقاً همان صفحاتی است که گیت می‌دهد (readHashes هم‌پوشان با گیت‌ها)', () => {
    // منوی ناظر همچنان ۷ صفحهٔ فقط-مشاهده است
    expect(app).toMatch(/readHashes = \['#\/dashboard', '#\/appointments', '#\/students', '#\/waitlist', '#\/archive', '#\/reports', '#\/exercises'\]/);
    // مسیرهای بدون roleOnly از این فهرست (داشبورد/دانش‌آموزان/گزارش‌ها/کارت‌های آماده) بی‌گیت ثبت شده‌اند
    expect(app).toMatch(/register\('#\/dashboard', \{ title: 'داشبورد', render: renderDashboard \}\)/);
    expect(app).toMatch(/register\('#\/students', \{ title: 'دانش‌آموزان', render: lazyView/);
    expect(app).toMatch(/register\('#\/exercises', \{ title: 'کارت‌های آماده', render: lazyView/);
  });
});

describe('گیت ۱.۲۵.۰۱ — نماها برای ناظر اکشن نوشتنی رندر نمی‌کنند', () => {
  test('تقویم نوبت‌ها: کلیک سلول و درگ کارت برای ناظر خاموش', () => {
    const appt = read('views/appointments.js');
    expect(appt).toMatch(/function isSupervisorRole\(\)/);
    // کلیک روی سلول → ساخت نوبت؛ برای ناظر no-op
    expect(appt).toMatch(/cell\.addEventListener\('click', \(\) => \{ if \(!isSupervisorRole\(\)\) openQuickCreate/);
    // درگ کارت: attribute و شنونده‌ها شرطی
    expect(appt).toMatch(/draggable: isSupervisorRole\(\) \? null : 'true'/);
    expect(appt).toMatch(/if \(!isSupervisorRole\(\)\) \{[\s\S]*?card\.addEventListener\('dragstart'/);
  });

  test('لیست انتظار: ثبت متقاضی و اکشن حالت خالی برای ناظر پنهان', () => {
    const wl = read('waitlist.js');
    expect(wl).toMatch(/const canAddApplicant = !isSupervisor;/);
    expect(wl).toMatch(/const addBtn = canAddApplicant/);
    expect(wl).toMatch(/canAddApplicant \? \{ actionLabel: 'ثبت اولین متقاضی'/);
    // یادداشت نقش: ناظر «فقط مشاهده» می‌بیند، نه «فقط ثبت»
    expect(wl).toMatch(/isSupervisor \? 'دسترسی شما: فقط مشاهدهٔ لیست انتظار\.' : 'دسترسی شما: فقط ثبت متقاضی جدید\.'/);
  });

  test('آرشیو: اکشن‌های نوشتنی ردیف و «دانش‌آموز جدید» برای ناظر پنهان', () => {
    const arch = read('views/archive.js');
    expect(arch).toMatch(/const isSupervisor = session\.user\?\.role === 'supervisor';/);
    // سه دکمهٔ نوشتنی (برچسب/ویرایش/فعال‌سازی/حذف) داخل spread شرطی
    expect(arch).toMatch(/\.\.\.\(isSupervisor \? \[\] : \[/);
    // دکمهٔ نوار ابزار و اکشن حالت خالی
    expect(arch).toMatch(/\.\.\.\(isSupervisor \? \[\] : \[el\('button', \{ class: 'btn btn--primary btn--sm', onclick: openNewArchiveStudent \}/);
    expect(arch).toMatch(/onAction: hasFilter \|\| isSupervisor \? undefined : openNewArchiveStudent/);
    // مشاهده‌ها (پروفایل/تاریخچهٔ تحصیلی) بیرون spread می‌مانند
    expect(arch).toMatch(/title: 'پروفایل'/);
    expect(arch).toMatch(/title: 'تاریخچهٔ تحصیلی'/);
  });

  test('داشبورد: دکمهٔ حسابرسی موردی فقط برای دفتر مرکز', () => {
    const dash = read('views/dashboard.js');
    expect(dash).toMatch(/const canAudit = \['manager', 'secretary'\]\.includes\(session\.user\?\.role\);/);
    expect(dash).toMatch(/canAudit\s*\?\s*el\('button', \{ class: 'btn btn--soft btn--sm', onclick: \(\) => openCaseAuditModal\(\) \}/);
  });
});

describe('گیت ۱.۲۵.۰۱ — هم‌نسخه‌ای انتشار', () => {
  const APP_VERSION = '1.25.03';

  test('version.ts = ?v=های index.html = VERSION سوورکر', () => {
    expect(readFileSync(join(__dirname, '../core/version.ts'), 'utf8')).toContain(`APP_VERSION = '${APP_VERSION}'`);
    const html = readFileSync(join(__dirname, '../../public/index.html'), 'utf8');
    expect(html).not.toMatch(/\?v=1\.25\.0"/); // نسخهٔ کهنه نباید بماند
    expect(html).toContain(`?v=${APP_VERSION}"`);
    expect(readFileSync(join(__dirname, '../../public/sw.js'), 'utf8')).toContain(`const VERSION = 'v${APP_VERSION}';`);
  });
});

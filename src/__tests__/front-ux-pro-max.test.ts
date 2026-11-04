/**
 * گیت ممیزی UX با skill «UI/UX Pro Max» (uupm.cc) — نسخهٔ ۱.۰۹.۰
 * چهار یافتهٔ تأییدشدهٔ ممیزی رفتاری (playwright لوکال) + سه یافتهٔ استاتیک را پین می‌کند:
 *   ۱) scroll-padding-top روی html — WCAG 2.4.11 «فوکوس پوشیده نشود» با topbar چسبان 60px
 *   ۲) کف 16px ورودی‌ها روی دستگاه‌های لمسی — Safari iOS هنگام فوکوس زوم می‌کند
 *      (پوشش تبلت هم لازم است؛ قاعدهٔ قدیمی فقط ≤640px بود)
 *   ۳) کف اهداف لمسی 24px (WCAG 2.5.8 AA) روی pointer:coarse — wgrid__cell و exb-dom__chev
 *   ۴) دراور موبایل با dvh — نوار آدرس پویای iOS ارتفاع واقعی viewport را می‌دهد
 *   ۵) خاموشی tap-highlight بومی — زبان فشار A21 جایگزین بازخورد لمسی است
 * الگو: front-font-floor.test.ts ()
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CSS = join(__dirname, '../../public/assets/css');
const read = (f: string) => readFileSync(join(CSS, f), 'utf8');

const base = read('base.css');
const components = read('components.css');
const views = read('views.css');

describe('گیت ممیزی UI/UX Pro Max (uupm.cc) — 1.09.0', () => {
  test('html: scroll-padding-top ≥ topbar+12 (WCAG 2.4.11 — فوکوس زیر topbar پنهان نشود)', () => {
    const m = base.match(/html\s*\{[^}]*\}/);
    expect(m).toBeTruthy();
    const rule = m![0];
    expect(rule).toMatch(/scroll-padding-top\s*:\s*calc\(\s*var\(--topbar-h/);
    expect(rule).toMatch(/scroll-padding-bottom/);
  });

  test('html: tap-highlight خاموش (بازخورد لمسی = زبان فشار A21، نه فلش خاکستری iOS)', () => {
    const m = base.match(/html\s*\{[^}]*\}/);
    expect(m![0]).toMatch(/-webkit-tap-highlight-color\s*:\s*transparent/);
  });

  test('لمس: ورودی‌ها کف 16px — نه فقط زیر 640px، بلکه همهٔ pointer:coarse (زوم iOS)', () => {
    /* قاعدهٔ قدیمی فقط max-width:640px بود — تبلت‌ها را نمی‌پوشاند */
    expect(components).not.toMatch(/@media\s*\(max-width:\s*640px\)\s*\{[^}]*\.input[^}]*font-size/);
    const coarse = components.match(/@media\s*\(pointer:\s*coarse\)\s*\{[^@]*\.input,\s*\.select,\s*\.textarea\s*\{\s*font-size:\s*16px/);
    expect(coarse).toBeTruthy();
  });

  test('لمس: کنترل‌های فونت‌ریز scoped (sess-note/ot-skill) هم 16px روی لمس', () => {
    const tail = views.slice(-1600); /* بلوک پایانی ممیزی ۱.۰۹.۰ */
    expect(tail).toMatch(/\.sess-note__actions \.select[^}]*font-size:\s*16px/);
    expect(tail).toMatch(/\.ot-skill__prompt \.select[^}]*font-size:\s*16px/);
  });

  test('لمس: wgrid__cell ≥24px (WCAG 2.5.8 AA — موبایل قبلاً 14px بود)', () => {
    const tail = views.slice(-1600);
    expect(tail).toMatch(/\.wgrid__cell\s*\{\s*height:\s*2[4-9]px/);
  });

  test('لمس: exb-dom__chev ≥24px (موبایل قبلاً 18px بود)', () => {
    const tail = views.slice(-1600);
    expect(tail).toMatch(/\.exb-dom__chev\s*\{\s*width:\s*(2[4-9]|3\d)px[^}]*height:\s*(2[4-9]|3\d)px/);
  });

  test('دراور موبایل: 100dvh روی 100vh (نوار آدرس پویای iOS)', () => {
    const vh = base.indexOf('height: 100vh; /* دراپر موبایل تمام‌قد');
    expect(vh).toBeGreaterThan(-1);
    const after = base.slice(vh, vh + 120);
    expect(after).toMatch(/height:\s*100dvh/);
  });

  test('نسخه: سو 1.19.0 — قفل هم‌نسخه‌ای bump با انتشار (برچسب نسخهٔ سایدبار)', () => {
    expect(readFileSync(join(__dirname, '../core/version.ts'), 'utf8')).toMatch(/APP_VERSION = '1\.25\.03'/);
  });

  test('۱.۱۹.۰ — روز کاری: جریان پیوسته (هیچ اکشنی کل نما را re-render نمی‌کند)', () => {
    const wd = readFileSync(join(__dirname, '../../public/assets/js/views/working-day.js'), 'utf8');
    // هستهٔ جریان پیوسته: وصلهٔ جراحی به‌جای rerender
    expect(wd).toMatch(/function applyStudentStatusInBoard\(/);
    expect(wd).toMatch(/import \{[^}]*collapseRemove[^}]*\} from '\.\.\/ui\.js'/); /* ۱.۲۵.۰۲ — تک‌منبع در ui.js */
    expect(wd).toMatch(/function refreshApptChips\(/);
    expect(wd).toMatch(/function markStaffAttendance\(/);
    expect(wd).toMatch(/function syncAssessmentsLight\(/);
    // اکشن‌های پرتکرار دیگر rerender کامل ندارند — فقط ناوبری تاریخ اجازه دارد
    const fn = (name: string) => wd.match(new RegExp(`(async )?function ${name}\\([\\s\\S]*?\\n\\}`))?.[0] ?? '';
    expect(fn('markStudent')).not.toMatch(/rerender\(\)/);
    expect(fn('markStaffAttendance')).not.toMatch(/rerender\(\)/);
    expect(fn('markOverdue')).not.toMatch(/rerender\(\)/);
    expect(fn('notesCard')).not.toMatch(/rerender\(\)/);
    // لنگرهای DOM برای وصلهٔ جراحی (apptId/studentId)
    expect(wd).toMatch(/dataset: \{ apptId/);
    expect(wd).toMatch(/dataset: \{ studentId/);
    // بازخورد فوری CSS + قفل مشغولی ردیف
    expect(views).toMatch(/\.wd-flash/);
    expect(views).toMatch(/\.is-resolving/);
    expect(views).toMatch(/\.wd-appt__sbtn--ok\.is-active/);
    expect(views).toMatch(/\.att-row\.is-busy/);
    expect(views).toMatch(/prefers-reduced-motion/);
  });

  test('۱.۲۵.۰ — بازطراحی کارت‌های نوبت روز کاری (فقط UI؛ بدون تغییر منطق)', () => {
    const wd = readFileSync(join(__dirname, '../../public/assets/js/views/working-day.js'), 'utf8');
    const views = readFileSync(join(__dirname, '../../public/assets/css/views.css'), 'utf8');
    // رفع باگ واقعی: لنگر data-appt-id روی خود کارت نوبت — بدون آن دو وصلهٔ جراحی
    // (نشان حضور دانش‌آموز + پیش‌نمایش توضیح) انتخابگر مرده داشتند و درجا اعمال نمی‌شدند
    expect(wd).toMatch(/class: `wd-appt\$\{cancelled[\s\S]*?dataset: \{ apptId: a\.id \}/);
    // کالبدشناسی تازهٔ کارت: دانش‌آموز خط اول، ردیف فرودی meta (جای wd-appt__time)
    expect(wd).toMatch(/wd-appt__meta/);
    expect(wd).not.toMatch(/wd-appt__time/);
    expect(wd).not.toMatch(/wd-appt__savatar/); // آواتار حرفی دانش‌آموز حذف شد
    expect(wd).toMatch(/el\('b', \{\}, fa\(tehranTimeOfIso\(a\.startAt\)\)\)/); // شروع برجسته در تایم‌لاین
    expect(wd).toMatch(/wd-block__count/); // بج شمارش هم‌رنگ درمانگر
    expect(wd).toMatch(/'aria-pressed': !cancelled && s\.attendance === status \? 'true' : 'false'/); // وضعیت فعال سگمنت در رندر
    // CSS: سگمنت یکپارچه + ردیف فرودی + گرید واید + نبض «الان»
    expect(views).toMatch(/\.wd-appt__sactions \{[\s\S]*?border-radius: var\(--radius-full\)/);
    expect(views).toMatch(/\.wd-appt__meta \.btn--icon \{ width: 26px/);
    expect(views).toMatch(/@media \(min-width: 1100px\) \{\n  \.wd-flow \{ display: grid/);
    expect(views).toMatch(/@keyframes wdNowRing/);
    expect(views).not.toMatch(/\.wd-appt__savatar/); // قانون CSS آواتار حرفی هم پاک شد
  });

  test('۱.۱۸.۰ — حذف سیستم موازی «وضعیت عملیاتی» (آمد/نیامد/شروع و اتمام جلسه): فقط حضور و غیاب', () => {
    const wd = readFileSync(join(__dirname, '../../public/assets/js/views/working-day.js'), 'utf8');
    // دکمه‌ها/مودال‌محور وضعیت عملیاتی دیگر در بورد روز کاری نیست
    expect(wd).not.toMatch(/OPS_ACTIONS|setOps\(|ops-status|absenceFollowUpDone|createAbsenceFollowUp|promptSessionReport/);
    // وضعیت برگزاری از حضور واقعی دانش‌آموزان می‌آید
    expect(wd).toMatch(/function attStateOf\(/);
    expect(wd).toMatch(/ATT_DOT/);
    const appts = readFileSync(join(__dirname, '../../public/assets/js/views/appointments.js'), 'utf8');
    expect(appts).not.toMatch(/opsStatus/);
    expect(appts).toMatch(/attStateOf\(/);
    // endpoint حذف‌شده در بک‌اند
    const routes = readFileSync(join(__dirname, '../../src/domain/appointment-core/routes.ts'), 'utf8');
    expect(routes).not.toMatch(/ops-status|SetOpsStatusSchema/);
  });

  test('۱.۱۶.۰ — فهرست دانش‌آموزان: منوی ⋯ مودال‌محور حذف، دایره‌های اقدام سرِ ردیف + جدایی حذف از CTA', () => {
    const students = readFileSync(join(__dirname, '../../public/assets/js/views/students.js'), 'utf8');
    // منوی سه‌نقطه در نمای دانش‌آموزان نیست — دکمه‌ها مستقیم روی ردیف‌اند (درخواست کاربر)
    expect(students).not.toMatch(/rowMenu\(/);
    expect(students).toMatch(/class: 'cell-actions row-circles'/);
    expect(students).toMatch(/icon-circle--danger/);
    // هر دکمه با قفل مشغولی واحد (ضد اسپم) باز می‌شود
    expect(students).toMatch(/lockBtn\(e\.currentTarget, onclick\)/);
    // همهٔ اقداماتِ منوی سابق، مستقیم روی ردیف در دسترس‌اند (پروفایل = کلیک روی ردیف)
    expect(students).toMatch(/openStudentForm\(\{ student: s/);
    expect(students).toMatch(/openRowTagEditor\(s, ctl\)/); // — ۱.۲۳.۰: پچ درجای همان ردیف
    expect(students).toMatch(/openRowFocusEditor\(s\)/);
    expect(students).toMatch(/openStudentDelete\(s, \{ onDeleted/);
    // کارت پروفایل: خوشهٔ دایره‌ها هرگز از درون نمی‌شکند — دایرهٔ قرمز حذف کنار CTA «ثبت رویداد» نمی‌افتد
    expect(views).toMatch(/\.card-circles\s*\{[^}]*flex-wrap:\s*nowrap/);
    expect(views).toMatch(/\.card-circles\s*\{[^}]*flex:\s*none/);
    // دایره‌های ردیف: مقیاس ۳۰px (لمس ۳۸px)، تک‌خطی روی جدول دسکتاپ، چیدمان از پایان ردیف
    expect(views).toMatch(/\.row-circles\s*\{[^}]*flex-wrap:\s*nowrap/);
    expect(views).toMatch(/\.row-circles\s*\{[^}]*justify-content:\s*flex-end/);
    expect(views).toMatch(/\.row-circles\s+\.icon-circle\s*\{[^}]*width:\s*30px/);
    expect(views).toMatch(/@media\s*\(pointer:\s*coarse\)\s*\{\s*\.row-circles\s+\.icon-circle\s*\{[^}]*width:\s*38px/);
    // دکمهٔ مخرب همیشه با فاصلهٔ ایمن اضافه از دکمه‌های امن
    expect(views).toMatch(/\.card-circles \.icon-circle--danger, \.row-circles \.icon-circle--danger\s*\{[^}]*margin-inline-start/);
  });

  test('۱.۱۷.۰ — مدارس: منوی ⋯ مودال‌محور حذف (مدرسه و کلاس)، دایره‌های اقدام سرِ ردیف + ریل دایره‌های کارت پرونده', () => {
    const schools = readFileSync(join(__dirname, '../../public/assets/js/views/schools.js'), 'utf8');
    // منوی سه‌نقطه در مدارس هم نیست — همان قرارداد فهرست دانش‌آموزان (درخواست کاربر)
    expect(schools).not.toMatch(/rowMenu\(/);
    expect((schools.match(/class: 'cell-actions row-circles', role: 'group'/g) ?? []).length).toBeGreaterThanOrEqual(2); // ردیف مدرسه + ردیف کلاس
    // هر دکمه با قفل مشغولی واحد (ضد اسپم) باز می‌شود
    expect(schools).toMatch(/lockBtn\(e\.currentTarget, onclick\)/);
    // همهٔ اقدامات منوی سابق، مستقیم روی ردیف در دسترس‌اند
    expect(schools).toMatch(/actionCircle\('student', 'کلاس‌ها و معلم‌ها'/);
    expect(schools).toMatch(/actionCircle\('zap', 'وضعیت همکاری'/);
    expect(schools).toMatch(/actionCircle\('edit', 'ویرایش'/);
    expect(schools).toMatch(/actionCircle\('pause', 'غیرفعال‌سازی/);
    expect(schools).toMatch(/actionCircle\('bot', 'کد اتصال معلم/);
    // حذفِ مخرب = دایرهٔ قرمز آخری (با آرگومان danger)
    expect((schools.match(/actionCircle\('trash'/g) ?? []).length).toBe(2); // مدرسه + کلاس
    // تأیید مخرب‌ها با مودال تأیید شفاف باقی می‌ماند
    expect(schools).toMatch(/confirmModal\(\{ title: 'غیرفعال‌سازی مدرسه'/);
    expect(schools).toMatch(/confirmModal\(\{ title: 'حذف کامل مدرسه'/);
    // ریل دایره‌های کارت پرونده: خط‌چین جداساز + لایی — دیگر شناور در فضای خالی نیست
    expect(views).toMatch(/\.card-circles\s*\{[^}]*border-inline-start:\s*1px dashed var\(--border\)/);
    expect(views).toMatch(/\.card-circles\s*\{[^}]*padding-inline-start:\s*var\(--sp-3\)/);
    const mobileCircles = views.match(/@media \(max-width: 720px\) \{\s*\.card-circles \{[^}]*\}/);
    expect(mobileCircles![0]).toMatch(/border-inline-start:\s*0/);
    expect(mobileCircles![0]).toMatch(/padding-inline-start:\s*0/);
  });

  test('۱.۱۵.۰ — پروفایل: دکمه‌های دایره‌ای اقدام روی کارت پرونده (جای مودال/منوی پنهان)', () => {
    const profile = readFileSync(join(__dirname, '../../public/assets/js/views/student-profile.js'), 'utf8');
    // نوار دایره‌ها روی خود کارت ساخته می‌شود و شش اقدام کلیدی را پوشش می‌دهد
    expect(profile).toMatch(/buildCardCircles/);
    expect(profile).toMatch(/class: 'card-circles'/);
    expect(profile).toMatch(/icon-circle--danger/);
    // هر دکمه با قفل مشغولی واحد (ضد اسپم) باز می‌شود
    expect(profile).toMatch(/lockBtn\(e\.currentTarget, onclick\)/);
    // API حذف و API معلم (POST/DELETE) مستقیماً سیم‌کشی شده‌اند
    expect(profile).toMatch(/openStudentDelete\(student/);
    expect(profile).toMatch(/openTeacherManager\(student/);
    const sharedDelete = readFileSync(join(__dirname, '../../public/assets/js/student-delete.js'), 'utf8');
    expect(sharedDelete).toMatch(/delete-check/);
    expect(sharedDelete).toMatch(/force=true/);
    const sharedTeachers = readFileSync(join(__dirname, '../../public/assets/js/student-teachers.js'), 'utf8');
    expect(sharedTeachers).toMatch(/\/teachers`, \{/); // POST
    expect(sharedTeachers).toMatch(/\/teachers\/\$\{t\.id\}/); // DELETE
    // استایل دایره: گردی کامل + هدف لمسی ≥38px و 42px روی لمس
    expect(views).toMatch(/\.icon-circle\s*\{[^}]*border-radius:\s*var\(--radius-full\)/);
    expect(views).toMatch(/\.icon-circle\s*\{[^}]*width:\s*38px/);
    expect(views).toMatch(/@media\s*\(pointer:\s*coarse\)\s*\{[^@]*\.icon-circle\s*\{\s*width:\s*42px/);
  });

  test('۱.۱۲.۰ — UX روانی ناوبری: گود اسکرول پایدار + ارتفاع ثابت اوتلت + قفل مشغولی دکمه', () => {
    // سایدبار دیگر با ظاهر/محو شدن نوار اسکرول بدنه تکان نمی‌خورد
    const htmlRule = base.match(/html\s*\{[^}]*overflow-y:\s*scroll[^}]*\}/);
    expect(htmlRule).toBeTruthy();
    expect(htmlRule![0]).toMatch(/scrollbar-gutter:\s*stable/);
    // اوتلت در فاصلهٔ تعویض نما فرو نمی‌ریزد (پرش ارتفاع صفحه = حس رفرش)
    expect(base).toMatch(/\.content\s*\{[^}]*min-height:\s*58vh/);
    // دکمهٔ مشغول: چرخ‌نده روی .btn.is-busy (ضدِ اسپم دکمه)
    expect(components).toMatch(/\.btn\.is-busy[^{]*\{/);
    expect(components).toMatch(/@keyframes btn-spin/);
  });

  test('۱.۱۱.۰ — داشبورد مدیر: ردیف قهرمان «کارهای من» + «اطلاع‌رسانی» هم‌قد و هم‌تراز', () => {
    // دو کارت باید stretch شوند و بدنهٔ هر دو کش بیاید — وگرنه کارت کوتاه زیرش حفرهٔ خالی می‌گذارد
    expect(views).toMatch(/\.dash-duo\s*\{[^}]*align-items:\s*stretch/);
    expect(views).toMatch(/\.dash-duo\s*>\s*\.card\s*\{[^}]*flex-direction:\s*column[^}]*height:\s*100%/);
    expect(views).toMatch(/\.dash-duo\s+\.card__body\s*\{[^}]*flex:\s*1/);
    // سقف فهرست کارها (جلوی رشد بی‌رویهٔ ردیف)
    expect(views).toMatch(/\.dash-duo\s+\.todo-list\s*\{[^}]*max-height/);
    // نسبت قهرمان: کارهای من دوسوم، اطلاع‌رسانی یک‌سوم (درخواست مدیر — ۱.۱۱.۰)
    expect(views).toMatch(/@media\s*\(min-width:\s*1080px\)\s*\{\s*\.dash-duo\s*\{[^}]*minmax\(0,\s*2fr\)\s+minmax\(300px,\s*1fr\)/);
  });

  test('۱.۱۱.۰ — داشبورد مدیر: «خط زمانی امروز» حذف شده و «دانش‌افزایی» بالای صفحه است', () => {
    const dash = readFileSync(join(__dirname, '../../public/assets/js/views/dashboard.js'), 'utf8');
    // خط زمانی دیگر ساخته نمی‌شود
    expect(dash).not.toMatch(/todayTimelineCard/);
    expect(dash).not.toMatch(/'خط زمانی امروز'/);
    // ردیف قهرمان = کارهای من + اطلاع‌رسانی؛ دانش‌افزایی بلافاصله زیر آن
    const office = dash.match(/function officeDashboard[\s\S]*?\n\}/)?.[0] ?? '';
    expect(office).toMatch(/dash-duo/);
    expect(office).toMatch(/announcementsCard\(announcements\)/);
    expect(office).toMatch(/knowledgeCard\(knowledge\)/);
    const duoIdx = office.indexOf('dash-duo');
    const knIdx = office.indexOf('knowledgeCard(knowledge)');
    const kpiIdx = office.indexOf("class: `kpi-grid");
    expect(duoIdx).toBeGreaterThan(-1);
    expect(knIdx).toBeGreaterThan(duoIdx);
    expect(kpiIdx).toBeGreaterThan(knIdx);
    // درمانگر: اعلان و دانش‌افزایی زیر سربرگ، پیش از کارنامهٔ امتیاز
    const ther = dash.match(/function therapistDashboard[\s\S]*?\n\}/)?.[0] ?? '';
    const infoIdx = ther.indexOf('infoGrid(knowledge, announcements)');
    const heroIdx = ther.indexOf('heroScore(');
    expect(infoIdx).toBeGreaterThan(-1);
    expect(heroIdx).toBeGreaterThan(infoIdx);
  });

  test('۱.۲۳.۰ — فاز ۴ جریان پیوسته: سنجش روزانه (ثبت زنجیره‌ای بدون شکستن فوکوس) + فهرست دانش‌آموزان (ترکیبی)', () => {
    const screening = readFileSync(join(__dirname, '../../public/assets/js/views/screening.js'), 'utf8');
    // ثبت روزانه: شِل یک‌بار؛ POST = درج بالای لیست از بدنهٔ پاسخ سرور (ORDER BY جدیدترین)
    expect(screening).toMatch(/entries = \[res\.data, \.\.\.entries\]/);
    // PATCH = پچ همان ردیف + فلش توجه؛ DELETE = جمع‌شدن نرم
    expect(screening).toMatch(/old\.replaceWith\(fresh\);\s*\n\s*flashNode\(fresh\)/);
    expect(screening).toMatch(/collapseRemove\(old\)/);
    // ریتم ثبت زنجیره‌ای: بعد از هر ثبت/ویرایش فوکوس باکس حفظ می‌شود
    expect(screening).toMatch(/input\.focus\(\)/);
    // گزارش/KPI: کارت فیلتر یک‌بار مونت، فقط ناحیهٔ نتایج عوض می‌شود؛ هک refocus حذف شد
    expect(screening).toMatch(/resultsZone\.replaceChildren\(kpis, chartCard, breakdownCard, followCard, listCard\)/);
    expect(screening).not.toMatch(/searchRefocus/);

    const students = readFileSync(join(__dirname, '../../public/assets/js/views/students.js'), 'utf8');
    // فهرست دانش‌آموزان فعال+غیرفعال: آرشیو/فعال‌سازی = پچ بج وضعیت از پاسخ سرور، نه rebuild
    expect(students).toMatch(/ctl\.patch\(res\.data\)/);
    expect(students).toMatch(/ctl\.patch\(student\)/); // برچسب‌ها از آبجکت محلی
    // حذف = جمع‌شدن نرم + کش صفحهٔ جاری به‌روز (رفع شبح ensureNonEmptyPaint)
    expect(students).toMatch(/collapseRemove\(old\)/);
    expect(students).toMatch(/meta: \{ \.\.\.\(result\.meta \?\? \{\}\), total/);
    // ایجاد/ویرایش = همگام‌سازی بی‌صدای فقط-tbody — هیچ مسیری کل نما را از صفر نمی‌سازد
    expect(students).toMatch(/quietSync: refreshRows/);
    expect(students).not.toMatch(/renderStudents\(container\)/);
    expect(students).not.toMatch(/skeletonState\('table', 4\)/); // اسکلت از مسیر post-mutation حذف شد
  });

  test('۱.۲۴.۰ — بازخوانی سراسری: رفع‌های ممیزی رفتاری روی ۲۴ نما', () => {
    /* settings: قرارداد tabs() رعایت شود — هر آیتم onSelect رسمی دارد؛ بایند دستی querySelectorAll
       (که با هر کلیک TypeError «onSelect is not a function» در کنسول می‌پاشاند) ممنوع است */
    const settings = readFileSync(join(__dirname, '../../public/assets/js/views/settings.js'), 'utf8');
    expect(settings).toMatch(/onSelect: selectTab/);
    expect(settings).not.toMatch(/tabBar\.root\.querySelectorAll\('\.tab'\)/);

    /* staff: بازترسیم پس از حذف/پچ‌جمع‌شدن همیشه با فیلتر فعلی — ریشه‌کنی ردیف شبح */
    const staff = readFileSync(join(__dirname, '../../public/assets/js/views/staff.js'), 'utf8');
    expect(staff).toMatch(/renderTbody\(rows\.filter\(matchesFilter\)\)|list\.filter\(matchesFilter\)/);
    expect(staff).toMatch(/function updateCountBadge\(/);

    /* schools: برگشت از غیرفعال مسیر دارد — دایرهٔ فعال‌سازی + روت activate (قبلاً deactivate یک‌طرفه بود) */
    const schools = readFileSync(join(__dirname, '../../public/assets/js/views/schools.js'), 'utf8');
    expect(schools).toMatch(/actionCircle\('check', 'فعال‌سازی'/);
    expect(schools).toMatch(/\/activate`/);

    /* working-day: دکمهٔ «افزودن توضیح» بعد از موفقیت هم زنده می‌ماند (ثبت زنجیره‌ای) */
    const wd = readFileSync(join(__dirname, '../../public/assets/js/views/working-day.js'), 'utf8');
    expect(wd).toMatch(/finally \{\s*\n\s*btn\.disabled = false/);

    /* finance: هر سه مودال پولی قفل دوبارکلیک دارند (فاکتور/کمک/بودجه تکراری ساخته نشود) */
    const finance = readFileSync(join(__dirname, '../../public/assets/js/views/finance.js'), 'utf8');
    expect((finance.match(/lockBtn\(btn/g) ?? []).length).toBeGreaterThanOrEqual(3);

    /* student-profile: دکمهٔ «بیشتر» خط زمانی بعد از اولین کلیک نمی‌میرد — currentTarget قبل از async قفل می‌شود */
    const profile = readFileSync(join(__dirname, '../../public/assets/js/views/student-profile.js'), 'utf8');
    expect(profile).toMatch(/const btn = e\.currentTarget/);

    /* screening: شمارنده‌های سربرگ بعد از ویرایش هم به‌روز می‌شوند */
    const screening = readFileSync(join(__dirname, '../../public/assets/js/views/screening.js'), 'utf8');
    expect(screening).toMatch(/paintCounts\(\)/);
  });

  test('۱.۲۵.۰۳ — گزارش‌ها: جریان پیوسته (تغییر بازه کل نما را با اسکلت بازسازی نمی‌کند)', () => {
    const rp = readFileSync(join(__dirname, '../../public/assets/js/views/reports.js'), 'utf8');
    // شِل: بدنهٔ داده ناحیهٔ مجزا با کلاس report-content — نوار ابزار بیرون آن است
    expect(rp).toMatch(/class: 'report-content'/);
    // پالس نرم به‌جای اسکلت برای تغییر بازه/پریست/به‌روزرسانی
    expect(rp).toMatch(/content\.classList\.add\('is-loading'\)/);
    expect(rp).toMatch(/content\.classList\.remove\('is-loading'\)/);
    // اکشن‌های نوار ابزار دیگر کل نما را renderReports نمی‌کنند — load() ناحیهٔ داده را تازه می‌کند
    expect(rp).not.toMatch(/onclick: \(\) => renderReports\(container\)/);
    expect(rp).not.toMatch(/renderReports\(container\);\s*\n\s*\}/); // هیچ applyRange/preset داخلی بازگشت به رندر کامل ندارد
    expect(rp).toMatch(/onclick: \(\) => load\(\)/);
    // تعویض تب همچنان اسکلت کامل دارد (ناوبری) و گارد نسل F9 سرجایش است
    expect(rp).toMatch(/skeletonState\('table', 6\)/);
    expect((rp.match(/myGen !== renderGen/g) ?? []).length).toBeGreaterThanOrEqual(4);
    // CSS پالس نرم ثبت شده و زیر reduced-motion خاموش می‌شود
    const css = readFileSync(join(__dirname, '../../public/assets/css/views.css'), 'utf8');
    expect(css).toMatch(/\.report-content\.is-loading \{ opacity: \.55/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\n\s*\.report-content \{ transition: none; \}/);
  });
});

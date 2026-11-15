/**
 * rust-f3 — گام‌های تور نقش‌محور «راهنمای شروع» (طراحی docs/rust/design.md §۷)
 *
 * - مدیر ۱۰ گام / منشی ۱۱ گام / درمانگر ۱۰ گام — همهٔ متن‌ها فارسی.
 * - شناسهٔ گام‌ها در کل سه نقش یکتاست (آزمون tutorial-steps).
 * - هر گام: مسیر hash (تور با روتر می‌رود، هرگز مستقیم DOM دستکاری نمی‌شود) +
 *   سلکتور هایلایت — آیتم سایدبار با data-nav="#/…" (الگوی buildSidebar در app.js).
 * - قاعدهٔ طلایی: «هرگز مسیر قفل نشود» — تور هیچ‌وقت ناوبری را مسدود نمی‌کند؛
 *   هر لحظه با «رد کردن» یا Escape بسته می‌شود و هیچ مسیری از کاربر گرفته نمی‌شود.
 * - مسیر هر گام برای نقشِ همان گام مجاز است (roleOnly/managerOnly روتر وب را دور نمی‌زنیم).
 * - «پنل سلامت» از ۱.۲۵.۷۱ در UI قطع شده است → نقش مدیر به‌جایش گام «آمار دوره» (#/reports) دارد.
 */

export type TutorialRole = 'manager' | 'secretary' | 'therapist';

export interface TutorialStep {
  /** شناسهٔ یکتا در کل سه نقش — برای آزمون‌پذیری و ردیابی */
  id: string;
  role: TutorialRole;
  /** عنوان کوتاه گام */
  title: string;
  /** متن توضیح فارسی */
  text: string;
  /** مسیر hash که تور به آن می‌رود — همیشه از روتر (location.hash) */
  path: string;
  /** سلکتور هایلایت؛ null یعنی حباب وسط صفحه بدون هایلایت (گام خوش‌آمد/پایان) */
  selector: string | null;
}

/** سلکتور آیتم سایدبار برای مسیر داده‌شده — تنها الگوی هایلایت این تور */
function nav(hash: string): string {
  return `[data-nav="${hash}"]`;
}

function step(
  id: string,
  role: TutorialRole,
  title: string,
  text: string,
  path: string,
  selector: string | null
): TutorialStep {
  return { id, role, title, text, path, selector };
}

/** تور نقش مدیر — ۱۰ گام */
export const MANAGER_STEPS: TutorialStep[] = [
  step('mgr-01-welcome', 'manager', 'به «مرکز جامع» خوش آمدید',
    'این تور کوتاه، صفحه‌های اصلی مرکز را از دید مدیر نشان می‌دهد. هر لحظه می‌توانید با «رد کردن» خارج شوید — تور هیچ مسیری را قفل نمی‌کند.',
    '#/dashboard', null),
  step('mgr-02-appointments', 'manager', 'تقویم نوبت‌ها',
    'برنامهٔ نوبت‌های مرکز اینجاست: ثبت، جابه‌جایی و مرور نوبت‌های روز و هفته. منشی هم به همین صفحه دسترسی دارد.',
    '#/appointments', nav('#/appointments')),
  step('mgr-03-screening', 'manager', 'سنجش روزانه',
    'چک‌لیست سنجش روزانهٔ نوآموزان؛ کارهای امروزِ سنجش را همین‌جا دنبال می‌کنید.',
    '#/screening', nav('#/screening')),
  step('mgr-04-students', 'manager', 'دانش‌آموزان',
    'پروندهٔ هر دانش‌آموز از همین فهرست باز می‌شود: ارزیابی‌ها، گزارش پیشرفت و روند درمان.',
    '#/students', nav('#/students')),
  step('mgr-05-treatment-plans', 'manager', 'طرح درمان',
    'طرح‌های درمان و مداخلات؛ برنامهٔ هر کودک و وضعیت اجرای آن را این‌جا می‌بینید.',
    '#/treatment-plans', nav('#/treatment-plans')),
  step('mgr-06-games', 'manager', 'بازی‌ها',
    'بسته‌های بازی شناختی و پیش‌نمایش آن‌ها؛ درمانگر از همین‌جا بازی را برای کودک تجویز می‌کند.',
    '#/games', nav('#/games')),
  step('mgr-07-reports', 'manager', 'آمار دوره',
    'گزارش آماری دوره و شاخص‌های مرکز — جمع‌بندی فعالیت‌ها در یک بازهٔ زمانی.',
    '#/reports', nav('#/reports')),
  step('mgr-08-staff', 'manager', 'کارکنان',
    'مدیریت همکاران مرکز: پروندهٔ شغلی، دسترسی‌ها و وضعیت هر درمانگر و منشی.',
    '#/staff', nav('#/staff')),
  step('mgr-09-backup', 'manager', 'پشتیبان‌گیری',
    'تهیهٔ نسخهٔ پشتیبان از داده‌های مرکز. توصیه می‌شود بازهٔ منظم پشتیبان‌گیری را فراموش نکنید.',
    '#/backup', nav('#/backup')),
  step('mgr-10-end', 'manager', 'تنظیمات و پایان تور',
    'بازهٔ کاری مرکز، اعلان‌ها و «اجرای دوبارهٔ راهنمای شروع» در تنظیمات است. تور تمام شد — موفق باشید!',
    '#/settings', nav('#/settings')),
];

/** تور نقش منشی — ۱۱ گام */
export const SECRETARY_STEPS: TutorialStep[] = [
  step('sec-01-welcome', 'secretary', 'به «مرکز جامع» خوش آمدید',
    'این تور کوتاه، صفحه‌های روزمرهٔ منشی را نشان می‌دهد. هر لحظه می‌توانید با «رد کردن» خارج شوید — تور هیچ مسیری را قفل نمی‌کند.',
    '#/dashboard', null),
  step('sec-02-appointments', 'secretary', 'تقویم نوبت‌ها',
    'قلب کار روزانهٔ شما: ثبت نوبت تازه، جابه‌جایی و مرور برنامهٔ درمانگرها در تقویم مرکز.',
    '#/appointments', nav('#/appointments')),
  step('sec-03-working-day', 'secretary', 'روز کاری (تابلوی امروز)',
    'تابلوی امروز مرکز: حضور و غیاب، جلسات جاری و وضعیت لحظه‌ای روز کاری.',
    '#/working-day', nav('#/working-day')),
  step('sec-04-waitlist', 'secretary', 'لیست انتظار',
    'متقاضیان خدمات جدید این‌جا ثبت و دنبال می‌شوند؛ از همین فهرست به نوبت تبدیلشان می‌کنید.',
    '#/waitlist', nav('#/waitlist')),
  step('sec-05-screening', 'secretary', 'سنجش روزانه',
    'چک‌لیست سنجش روزانهٔ نوآموزان — کارهای امروز را تیک بزنید تا از قلم نیفتد.',
    '#/screening', nav('#/screening')),
  step('sec-06-students', 'secretary', 'دانش‌آموزان',
    'فهرست دانش‌آموزان مرکز؛ پروندهٔ هر کودک، ارزیابی‌ها و گزارش‌هایش از همین‌جا باز می‌شود.',
    '#/students', nav('#/students')),
  step('sec-07-schools', 'secretary', 'مدارس',
    'فهرست مدارس همکار و اطلاعات تماس آن‌ها برای هماهنگی‌های مراجعه و غربالگری.',
    '#/schools', nav('#/schools')),
  step('sec-08-archive', 'secretary', 'آرشیو',
    'بایگانی پرونده‌های بسته‌شده؛ هر زمان لازم شد از همین‌جا بازیابی می‌شوند.',
    '#/archive', nav('#/archive')),
  step('sec-09-outbox', 'secretary', 'صندوق اعلان‌ها',
    'اعلان‌ها و یادآوری‌های ارسالی به خانواده‌ها و همکاران از این صندوق مدیریت می‌شود.',
    '#/outbox', nav('#/outbox')),
  step('sec-10-reports', 'secretary', 'آمار دوره',
    'گزارش آماری دوره؛ خروجی فعالیت‌های مرکز را برای مدیر از همین صفحه آماده می‌کنید.',
    '#/reports', nav('#/reports')),
  step('sec-11-end', 'secretary', 'تنظیمات و پایان تور',
    'بازهٔ کاری مرکز و «اجرای دوبارهٔ راهنمای شروع» در تنظیمات است. تور تمام شد — موفق باشید!',
    '#/settings', nav('#/settings')),
];

/** تور نقش درمانگر — ۱۰ گام */
export const THERAPIST_STEPS: TutorialStep[] = [
  step('thr-01-welcome', 'therapist', 'به «مرکز جامع» خوش آمدید',
    'این تور کوتاه، ابزارهای درمانگری را نشان می‌دهد. هر لحظه می‌توانید با «رد کردن» خارج شوید — تور هیچ مسیری را قفل نمی‌کند.',
    '#/dashboard', null),
  step('thr-02-appointments', 'therapist', 'تقویم من',
    'برنامهٔ شخصی شما: نوبت‌های امروز و هفتهٔ پیشِ رو در تقویم خودتان.',
    '#/appointments', nav('#/appointments')),
  step('thr-03-working-day', 'therapist', 'روز کاری',
    'تابلوی روز کاری شما: جلسات، حضور مراجعان و ثبت رویدادهای امروز.',
    '#/working-day', nav('#/working-day')),
  step('thr-04-waitlist', 'therapist', 'لیست انتظار',
    'متقاضیان جدید را می‌بینید و می‌توانید برایشان ثبت‌نام اولیه انجام دهید.',
    '#/waitlist', nav('#/waitlist')),
  step('thr-05-students', 'therapist', 'دانش‌آموزان و گزارش پیشرفت',
    'پروندهٔ هر کودک این‌جاست؛ «گزارش پیشرفت» از داخل پروفایل همان دانش‌آموز ساخته می‌شود.',
    '#/students', nav('#/students')),
  step('thr-06-treatment-plans', 'therapist', 'طرح درمان',
    'طرح درمان هر کودک و مداخلات تعیین‌شده — مبنای کار هفتگی شما.',
    '#/treatment-plans', nav('#/treatment-plans')),
  step('thr-07-games', 'therapist', 'تجویز بازی',
    'بسته‌های بازی شناختی را همین‌جا برای کودک تجویز می‌کنید؛ نتیجهٔ هر جلسه در گزارش می‌نشیند.',
    '#/games', nav('#/games')),
  step('thr-08-exercises', 'therapist', 'کارت‌های آماده',
    'بانک تمرین‌های آماده برای ارسال به خانواده — به‌جای نوشتن از صفر، کارت مناسب را بفرستید.',
    '#/exercises', nav('#/exercises')),
  step('thr-09-case-event-types', 'therapist', 'فرم‌ها و پرسش‌نامه‌ها',
    'فرم‌ها و پرسش‌نامه‌های استانداردِ پرونده؛ تکمیل آن‌ها روند ارزیابی را یکدست می‌کند.',
    '#/case-event-types', nav('#/case-event-types')),
  step('thr-10-end', 'therapist', 'پایان تور',
    'همه چیز آماده است: از «تقویم من» شروع کنید. تور تمام شد — موفق باشید!',
    '#/dashboard', null),
];

/** گام‌های یک نقش */
export function stepsForRole(role: TutorialRole): TutorialStep[] {
  if (role === 'manager') return MANAGER_STEPS;
  if (role === 'secretary') return SECRETARY_STEPS;
  return THERAPIST_STEPS;
}

/** همهٔ گام‌ها — برای آزمون یکتایی شناسه‌ها */
export function allTutorialSteps(): TutorialStep[] {
  return [...MANAGER_STEPS, ...SECRETARY_STEPS, ...THERAPIST_STEPS];
}

/** نقش پشتیبانی‌شده یا null (ناظر و نقش‌های ناشناخته تور نمی‌بینند) */
export function supportedRole(role: string | null | undefined): TutorialRole | null {
  if (role === 'manager' || role === 'secretary' || role === 'therapist') return role;
  return null;
}

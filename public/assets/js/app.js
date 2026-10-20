/**
 * بوت‌استرپ اپلیکیشن: منو، badge ها و اتصال نماها
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// app.js — bootstrap: theme, shell, current user, router wiring

import { api, clearSession } from './api.js';
import { el, icon, confirmModal, toast, toastError } from './ui.js';
import { register, start, render } from './router.js';
import { renderLoginPage, showApp } from './login.js';

import { renderDashboard } from './views/dashboard.js';
import { renderAppointments } from './views/appointments.js';
// views/my-scheduling.js در «تقویم من» (نمای نقش درمانگر appointments.js) ادغام شد
import { renderStaff } from './views/staff.js';
import { renderSettings } from './views/settings.js';
import { renderSchools } from './views/schools.js';
import { renderStudents } from './views/students.js';
import { renderStudentProfile } from './views/student-profile.js';
// ماژول مستقل «لیست انتظار» + «آرشیو مرکز» (جدا شدن فلو از ماژول دانش‌آموزان)
import { renderWaitlistModule } from './waitlist.js';
import { renderArchive } from './views/archive.js';
import { renderSpecialNeeds } from './views/special-needs.js'; // فاز ۷ — نیازهای ویژه
import { renderWorkingDay } from './views/working-day.js';
import { renderScreening } from './views/screening.js';
// ماژول «داده‌های مرکزی» برای استقرار روز صفر حذف شد
import { renderReports } from './views/reports.js';
// ماژول‌های «کمیسیون» و «ممیزی فعالیت» به دستور کاربر از کد قطع شدند (نما، مسیر، API)
import { renderExercises } from './views/exercises.js'; // — بانک تمرین
import { renderTemplates } from './views/templates.js'; // — مدیریت قالب‌ها (تب مستقل)
// import تابلوی پیشرفت حذف شد (تب مستقل ندارد؛ staff.js مؤلفه را مستقیم مصرف می‌کند)
import { renderOutbox } from './views/outbox.js'; // — صندوق اعلان‌ها (مدیر/منشی)
import { renderCaseEventTypes } from './views/case-event-types.js'; // — فرم‌ساز انواع رویداد (مدیر + درمانگر)
// نمای «راهنمای گام‌به‌گام» (views/help.js + تصاویر /assets/help) حذف شد (m134 — کد مرده پارک‌شده)؛
// نسخهٔ PDF «راهنمای تصویری سامانه» جایگزین شده است. اگر روزی فعال شد: register('#/help', …)
import { emptyState } from './ui.js';
import { initGlobalSearch } from './global-search.js';
import { initAnnouncementBanners } from './announcements.js';
import { fa } from './format.js'; // فاز W — badge لیست انتظار

// ─────────────── وضعیت سراسری سبک ───────────────
// session به state.js منتقل شد؛ این فایل (ورودی اپ) هرگز نباید export داشته باشد
// وگرنه ایمپورتِ نسبی آن، ماژول را با URL دوم دوباره اجرا می‌کند (باگ دکمهٔ تم)
import { session } from './state.js';

// ─────────────── Theme ───────────────

const THEME_KEY = 'cs.theme';
/** رنگ نوار مرورگر در هر تم (هم‌گام با --bg در tokens.css) */
const THEME_COLORS = { light: '#F7F3EA', dark: '#191C22' }; // — دارک نرم‌شده

function currentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

/** خواندن تم ذخیره‌شده یا ترجیح سیستم — خطا هرگز بوت را نمی‌شکند */
function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch { /* حالت خصوصی مرورگر */ }
  const system = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light';
  applyTheme(saved === 'dark' || saved === 'light' ? saved : system, false);
}

/** اعمال تم روی ریشهٔ سند + هم‌گام‌سازی رنگ نوار مرورگر و همهٔ دکمه‌ها */
function applyTheme(next, persist = true) {
  const theme = next === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLORS[theme]);
  if (persist) { try { localStorage.setItem(THEME_KEY, theme); } catch { /* noop */ } }
  updateThemeBtn();
}

function toggleTheme() {
  applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
}

// یک دکمهٔ تم در نوار بالای پنل (حالت پیشین)
let themeBtn;

function updateThemeBtn() {
  const dark = currentTheme() === 'dark';
  const label = dark ? 'حالت روشن' : 'حالت تاریک';
  if (!themeBtn) return;
  themeBtn.replaceChildren(icon(dark ? 'sun' : 'moon', 18));
  themeBtn.title = label;
  themeBtn.setAttribute('aria-label', label);
}

// ─────────────── ناوبری ───────────────

// منوی گروهی: همان آیتم‌ها و فیلتر نقش v1، فقط دسته‌بندی نمایشی تازه
const NAV = [
  // گروه «امروز»
  { hash: '#/dashboard', label: 'داشبورد', icon: 'dashboard', group: 'امروز' },
  // بازگردانی به دستور کاربر: تقویم نوبت‌دهی برای دفتر هم فعال است (همهٔ ماژول‌ها برای
  // مدیر/منشی)؛ درمانگر هم فقط برنامهٔ خودش (سرور هم GET نوبت‌ها را برای درمانگر scope می‌کند)
  { hash: '#/appointments', label: 'تقویم نوبت‌ها', icon: 'calendar', group: 'برنامه‌ریزی', roles: ['manager', 'secretary'] },
  { hash: '#/appointments', label: 'تقویم من', icon: 'calendar', group: 'برنامه‌ریزی', roles: ['therapist'] },
  // بورد روز کاری ابزار دفتر بود؛ — به دستور کاربر: درمانگر هم «کپی روز کاری»
  // با کارت خودش می‌بیند (همان طراحی؛ سرور هم بورد را نسبت به خودش scope می‌کند)
  { hash: '#/working-day', label: 'روز کاری', icon: 'board', group: 'امروز', roles: ['manager', 'secretary', 'therapist'] },
  // تابلوی پیشرفت: از منوی مستقل ندارد — فقط در «کارکنان» (مدیر) + کارت داشبورد
  // سنجش روزانه: غربال نوآموزان — ابزار دفتر (منشی/مدیر)
  { hash: '#/screening', label: 'سنجش روزانه', icon: 'checklist', group: 'امروز', roles: ['manager', 'secretary'] },
  // «داده‌های مرکزی» حذف شد (استقرار روز صفر) — نام شفاف شد (ابهام «گزارش» رفع)
  { hash: '#/reports', label: 'آمار دوره', icon: 'trendingUp', group: 'ارزیابی و درمان', roles: ['manager', 'secretary'] },
  // تنظیم کارکنان فقط مدیر؛ — مدارس برای منشی هم باز است (تکمیل اطلاعات مدرسه)
  { hash: '#/staff', label: 'کارکنان', icon: 'users', group: 'مرکز', roles: ['manager'] },
  { hash: '#/schools', label: 'مدارس', icon: 'school', group: 'دانش‌آموزان', roles: ['manager', 'secretary'] },
  { hash: '#/students', label: 'دانش‌آموزان', icon: 'student', group: 'دانش‌آموزان' },
  // لیست انتظار ماژول مستقل شد (لیست پشت‌نوبتی‌ها؛ پیش از ورود به چرخه)
  // درمانگر هم فقط «افزودن متقاضی» دارد (بدون تماس/نوبت‌دهی/ویرایش — سرور هم ۴۰۳ می‌دهد)
  { hash: '#/waitlist', label: 'لیست انتظار', icon: 'waitlist', group: 'برنامه‌ریزی', roles: ['manager', 'secretary', 'therapist'] },
  // آرشیو مرکز: دیتابیس دانش‌آموزان نیاز ویژهٔ شهر + پرونده‌های خارج‌شده از چرخه
  { hash: '#/archive', label: 'آرشیو', icon: 'archive', group: 'دانش‌آموزان', roles: ['manager', 'secretary'] },
  // بانک تمرین: بانک فایل کاربرگ‌ها + حلقهٔ تکلیف بات (هر سه نقش)
  { hash: '#/exercises', label: 'بانک تمرین', icon: 'board', group: 'ارزیابی و درمان' },
  // مدیریت قالب‌های مسیر: تب مستقل در سایدبار (خواست کاربر) — مدیر + درمانگر
  { hash: '#/templates', label: 'مدیریت قالب‌ها', icon: 'grid', group: 'ارزیابی و درمان', roles: ['manager', 'therapist'] },
  // «کمیسیون» از منو حذف شد (ماژول قطع شد)
  // صندوق اعلان‌ها: پیش‌نویس‌های ساعت ارسال + ناموفق‌ها؛ فقط دفتر
  { hash: '#/outbox', label: 'صندوق اعلان‌ها', icon: 'bell', group: 'مرکز', roles: ['manager', 'secretary'] },
  // فرم‌ساز انواع رویداد — درمانگر — دستور کاربر «دسترسی فرم‌ساز همگانی» → منشی هم
  { hash: '#/case-event-types', label: 'فرم‌ها و پرسش‌نامه‌ها', icon: 'timeline', group: 'ارزیابی و درمان', roles: ['manager', 'secretary', 'therapist'] }, // — نام روایی
  // «ممیزی فعالیت» از منو حذف شد (ماژول قطع شد)
  // فاز ۷ — نیازهای ویژه: لایهٔ مدیریتی؛ درمانگر در nav نیست و سرور هم 403 می‌دهد
  { hash: '#/special-needs', label: 'نیازهای ویژه', icon: 'clip', group: 'مرکز', roles: ['manager', 'secretary'] },
  // تنظیمات فقط دفتر: درمانگر از منو و روت هر دو قطع شد (سرور هم GET تنظیمات را ۴۰۳ می‌کند)
  { hash: '#/settings', label: 'تنظیمات', icon: 'settings', group: 'مرکز', roles: ['manager', 'secretary'] }
  // آیتم منوی «راهنما» فعلاً غیرفعال است؛ نسخهٔ PDF جایگزین شده است
];

/** — ترتیب گروه‌های منو */
const GROUP_ORDER = ['امروز', 'برنامه‌ریزی', 'دانش‌آموزان', 'ارزیابی و درمان', 'مرکز']; // — نام روایی

/** — فیلتر منو بر اساس نقش (بدون نشست = همه برای صفحهٔ ورود) — گروه‌بندی‌شده */
function navGroupsFor(role) {
  // ناظر اداره: فقط داشبورد تجمیعی (سرور هم deny-by-default است)
  if (role === 'supervisor') {
    return [{ label: '', items: NAV.filter((item) => item.hash === '#/dashboard') }];
  }
  const items = NAV.filter((item) => !item.roles || (role && item.roles.includes(role)));
  return GROUP_ORDER.map((label) => ({ label, items: items.filter((i) => i.group === label) })).filter((g) => g.items.length > 0);
}

/** — فهرست تخت (برای syncNav و عنوان صفحه) */
function navItemsFor(role) {
  return navGroupsFor(role).flatMap((g) => g.items);
}

function buildSidebar() {
  const sidebar = document.getElementById('sidebar');
  const nav = sidebar.querySelector('.nav');
  const role = session.user?.role ?? null;
  nav.replaceChildren(
    ...navGroupsFor(role).flatMap((group) => [
      el('div', { class: 'nav__label' }, group.label || ''),
      ...group.items.map((item) => {
        const btn = el(
          'button',
          { class: 'nav__item', dataset: { nav: item.hash }, onclick: () => { location.hash = item.hash; closeSidebar(); } },
          icon(item.icon),
          el('span', {}, item.label)
        );
        // badge سررسید لیست انتظار روی «لیست انتظار» (ماژول مستقل شد)
        if (item.hash === '#/waitlist') btn.appendChild(el('span', { class: 'nav__badge nav__badge--waitlist', hidden: true }));
        // فاز ۴ — badge کارهای داخلی نیازمند توجه روی «داشبورد»
        if (item.hash === '#/dashboard') btn.appendChild(el('span', { class: 'nav__badge nav__badge--todos', hidden: true }));
        return btn;
      })
    ])
  );
}

// فاز W — شمارندهٔ ورودی‌های waiting که از آستانهٔ هشدار (۷ روز) گذشته‌اند
async function updateWaitlistBadge() {
  const badge = document.querySelector('.nav__badge--waitlist');
  if (!badge) return;
  try {
    const res = await api.get('/api/waitlist/badge');
    const overdue = res.data?.overdue ?? 0;
    if (overdue > 0) {
      badge.textContent = fa(overdue);
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  } catch {
    badge.hidden = true;
  }
}
window.addEventListener('waitlist:changed', updateWaitlistBadge);

// فاز ۴ — شمارندهٔ کارهای داخلی نیازمند توجه (فوری یا عقب‌افتادهٔ من) روی «داشبورد»
async function updateTodosBadge() {
  const badge = document.querySelector('.nav__badge--todos');
  if (!badge || !session.user || (session.user.role !== 'manager' && session.user.role !== 'secretary')) return;
  try {
    const res = await api.get('/api/todos?box=inbox');
    const attention = res.badge?.attention ?? 0;
    if (attention > 0) {
      badge.textContent = fa(attention);
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  } catch {
    badge.hidden = true;
  }
}
window.addEventListener('todos:changed', updateTodosBadge);

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.querySelector('.sidebar-backdrop');
  sidebar.classList.remove('is-open');
  backdrop?.remove();
}

function syncNav(path) {
  document.querySelectorAll('.nav__item').forEach((btn) => {
    const target = btn.dataset.nav.replace('#/', '');
    btn.classList.toggle('is-active', path.startsWith(target));
  });
  // جستجوی عنوان از منوی نقش جاری (دو ورودی «تقویم» با یک hash دارند)
  // topbar فقط «مسیر راهنما» (گروه / صفحه) نشان می‌دهد؛ عنوان بزرگ فقط در page-headِ نما
  // تا عنوان دوبار تکرار نشود. عنوان مرورگر هم همراه مسیر به‌روز می‌شود.
  const active = navItemsFor(session.user?.role).find((n) => path.startsWith(n.hash.replace('#/', '')));
  const titleEl = document.getElementById('page-title');
  const crumbEl = document.getElementById('topbar-crumb');
  if (active) {
    const group = active.group || 'پنل مدیریت';
    if (crumbEl) {
      const parts = [el('span', { class: 'topbar__crumb-group' }, group)];
      if (group !== active.label) {
        parts.push(el('span', { class: 'topbar__crumb-sep', 'aria-hidden': 'true' }, '/'));
        parts.push(el('span', { class: 'topbar__crumb-page' }, active.label));
      }
      crumbEl.replaceChildren(...parts);
    }
    titleEl.textContent = active.label;
    document.title = `${active.label} · ${document.title.split('·').pop()?.trim() || 'مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام'}`;
  } else {
    if (crumbEl) crumbEl.textContent = 'پنل مدیریت';
    titleEl.textContent = 'پنل مدیریت';
  }
}

// ─────────────── کاربر جاری ───────────────

function renderUserChip() {
  const chip = document.getElementById('user-chip');
  if (session.user) {
    // آواتار حرف اول نام + نشان نقش
    chip.replaceChildren(
      el('span', { class: 'avatar', 'aria-hidden': 'true' }, (session.user.displayName || '؟').trim().charAt(0)),
      el('b', {}, session.user.displayName),
      el('span', { class: 'badge badge--neutral' }, roleLabel(session.user.role))
    );
  } else {
    chip.replaceChildren(el('span', {}, 'کاربر نامشخص'));
  }
}

function roleLabel(role) {
  return { manager: 'مدیر', therapist: 'درمانگر', secretary: 'منشی', supervisor: 'ناظر اداره' }[role] ?? role;
}

/** — بازسازی منو پس از شناختن/تغییر نقش */
function rebuildNavForRole() {
  buildSidebar();
  syncNav(location.hash.replace(/^#\//, '') || 'dashboard');
  updateWaitlistBadge();
}

/** — بوت: اگر نشست معتبر بود اپ بالا می‌آید؛ وگرنه صفحه ورود با رمز */
async function loadCurrentUser() {
  try {
    const res = await api.get('/api/me');
    session.user = res.data;
    renderUserChip();
    rebuildNavForRole();
    showApp();
    return true;
  } catch (err) {
    if (err.status === 401 || err.status === 403) {
      session.user = null;
      renderUserChip();
      renderLoginPage((staff) => {
        session.user = { staffId: staff.id, displayName: staff.fullName, role: staff.role, email: staff.email };
        renderUserChip();
        rebuildNavForRole();
        toast(`خوش آمدید، ${staff.fullName}`, 'success');
      });
      return false;
    }
    toastError(err);
    return false;
  }
}

/** — خروج از حساب (توکن و هویت پاک می‌شود) */
async function logout() {
  const ok = await confirmModal({
    title: 'خروج از حساب',
    message: `از حساب «${session.user?.displayName ?? ''}» خارج می‌شوید. برای ورود دوباره، نام کاربری و رمز لازم است.`,
    confirmLabel: 'خروج',
    danger: true
  });
  if (!ok) return;
  try { await api.post('/api/auth/logout'); } catch { /* بی‌اهمیت */ }
  clearSession();
  session.user = null;
  location.reload();
}

/** — گارد نقش مدیر برای مسیرهای مدیریتی (لایهٔ دوم؛ سرور هم 403 می‌دهد) */
function managerOnly(render) {
  return roleOnly(['manager'], render);
}

/** فاز ۷ — گارد نقش‌های چندگانه (لایهٔ دوم RBAC؛ سرور هم 403 می‌دهد) — پیام اختیاری */
function roleOnly(roles, render, hint = 'این بخش فقط برای منشی و مدیر مرکز فعال است.') {
  return (container, ctx) => {
    if (!roles.includes(session.user?.role)) {
      container.replaceChildren(
        emptyState({ iconName: 'alert', title: 'دسترسی مجاز نیست', hint })
      );
      return;
    }
    return render(container, ctx);
  };
}

// ─────────────── راه‌اندازی ───────────────

register('#/dashboard', { title: 'داشبورد', render: renderDashboard });
// تب مستقل «تابلوی پیشرفت» حذف شد (به دستور کاربر: «این منوی جدید اضافه کاریه») —
// تابلو فقط در بخش کارکنان (مدیر) + کارت خلاصهٔ داشبورد نمایش داده می‌شود
// «تقویم» یک ماژول با دو نما است: دفتر (کل مرکز) و درمانگر (فقط برنامهٔ خودش —
// نمای خود در views/appointments.js فیلتر کارمند را روی خودش قفل می‌کند؛ سرور هم scope می‌خورد)
register('#/appointments', {
  title: 'تقویم نوبت‌ها',
  render: roleOnly(
    ['manager', 'secretary', 'therapist'],
    renderAppointments,
    'این بخش برای دفتر (کل مرکز) و درمانگر (فقط برنامهٔ خودش) فعال است.'
  )
});
// «نوبت‌دهی من» در «تقویم من» ادغام شد؛ مسیر قدیمی ریدایرکت می‌شود
register('#/my-scheduling', { title: 'تقویم من', render: (c) => { location.hash = '#/appointments'; } });
// روز کاری؛ — درمانگر هم وارد می‌شود (بورد سمت سرور به خودش scope می‌شود)
register('#/working-day', {
  title: 'روز کاری',
  render: roleOnly(
    ['manager', 'secretary', 'therapist'],
    renderWorkingDay,
    'این بخش برای دفتر (کل مرکز) و درمانگر (فقط کارت جلسات خودش) فعال است.'
  )
});
// ماژول‌های مجزای «حضور و غیاب جلسات من» و «گزارش جلسات من» حذف شدند —
// همهٔ کارها از همان بورد «روز کاری» (کارت خودِ درمانگر) انجام می‌شود
register('#/my-attendance', { title: 'روز کاری', render: (c) => { location.hash = '#/working-day'; } });
register('#/my-reports', { title: 'روز کاری', render: (c) => { location.hash = '#/working-day'; } });
register('#/screening', { title: 'سنجش روزانه', render: roleOnly(['manager', 'secretary'], renderScreening) }); // — غربال نوآموزان
// روت «داده‌های مرکزی» با حذف ماژول حذف شد
register('#/attendance', { title: 'روز کاری', render: (c) => { location.hash = '#/working-day'; } }); // — مسیر قدیمی
// گزارش‌های دوره‌ای: ابزار دفتر؛ درمانگر به «روز کاری» هدایت می‌شود
register('#/reports', {
  title: 'گزارش‌ها',
  render: (c) => {
    if (session.user?.role === 'therapist') { location.hash = '#/working-day'; return; }
    renderReports(c);
  }
});
register('#/staff', { title: 'کارکنان', render: managerOnly(renderStaff) });
// گارد نقش: تنظیمات ابزار دفتر است؛ درمانگر اجازهٔ ورود ندارد
register('#/settings', { title: 'تنظیمات', render: roleOnly(['manager', 'secretary'], renderSettings, 'تنظیمات فقط برای دفتر مرکز (مدیر و منشی) فعال است.') });
register('#/working-hours', { title: 'تنظیمات', render: renderSettings }); // — مسیر قدیمی → تنظیمات
register('#/schools', { title: 'مدارس', render: roleOnly(['manager', 'secretary'], renderSchools) }); // — منشی مجاز
register('#/students', { title: 'دانش‌آموزان', render: renderStudents });
register('#/students/:id', { title: 'پروفایل دانش‌آموز', render: renderStudentProfile });
// ماژول مستقل لیست انتظار (تب قدیمی «#/students?tab=waitlist» در students.js ریدایرکت می‌شود)
// درمانگر هم وارد می‌شود؛ نمای فقط-افزودن (waitlist.js خودش نقش را می‌سنجد؛ سرور هم ۴۰۳)
register('#/waitlist', { title: 'لیست انتظار', render: roleOnly(['manager', 'secretary', 'therapist'], renderWaitlistModule, 'این بخش برای دفتر و ثبت متقاضی توسط درمانگر فعال است.') });
// آرشیو مرکز (دیتابیس شهر) — فقط دفتر
register('#/archive', { title: 'آرشیو', render: roleOnly(['manager', 'secretary'], renderArchive) });
// روت‌های «کمیسیون» و «ممیزی فعالیت» حذف شدند (ماژول قطع شد)
register('#/exercises', { title: 'بانک تمرین', render: renderExercises }); //
// تب مستقل «مدیریت قالب‌ها» — مدیر + درمانگر (سرور هم RBAC دارد)
register('#/templates', { title: 'مدیریت قالب‌ها', render: roleOnly(['manager', 'therapist'], renderTemplates, 'این بخش برای مدیر و درمانگر فعال است.') });
register('#/outbox', { title: 'صندوق اعلان‌ها', render: roleOnly(['manager', 'secretary'], renderOutbox) }); //
// فرم‌ساز انواع رویداد — مدیر + درمانگر — + منشی (همگانی)
register('#/case-event-types', { title: 'فرم‌ها و پرسش‌نامه‌ها', render: roleOnly(['manager', 'secretary', 'therapist'], renderCaseEventTypes, 'این بخش برای همکاران مرکز فعال است.') }); // //
register('#/special-needs', { title: 'نیازهای ویژه', render: roleOnly(['manager', 'secretary'], renderSpecialNeeds) }); // فاز ۷ — لایهٔ دوم RBAC
// روت «راهنما» فعلاً غیرفعال است؛ فایل PDF «راهنمای تصویری سامانه» در پرتال دانلود جایگزین آن است
// برای فعال‌سازی مجدد: import بالای فایل + register('#/help', { title: 'راهنمای سامانه', render: renderHelp });

document.addEventListener('routechange', (e) => syncNav(e.detail.path));

// تنها دکمهٔ تم: نوار بالای پنل (حالت پیشین)
themeBtn = document.getElementById('theme-btn');
themeBtn?.addEventListener('click', toggleTheme);

initTheme();
buildSidebar();

// جستجوی سراسری (دکمه topbar + Ctrl+K)
initGlobalSearch();

document.getElementById('menu-btn').addEventListener('click', () => {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.add('is-open');
  const backdrop = el('button', { class: 'sidebar-backdrop', 'aria-label': 'بستن منو', onclick: closeSidebar });
  document.body.appendChild(backdrop);
});

const outlet = document.getElementById('outlet');
initAnnouncementBanners(); // — بنر اعلان‌ها (صفحه ورود + پنل)
// فقط با نشست معتبر اپ بالا می‌آید؛ وگرنه صفحه ورود (بدون رندر پشت‌صحنه)
loadCurrentUser().then((ok) => { if (ok) { start(outlet); updateWaitlistBadge(); updateTodosBadge(); } });

// دکمه «کاربر» → خروج از حساب
document.getElementById('user-chip').addEventListener('click', () => {
  if (session.user) logout();
});

import { api, clearSession } from './api.js';
import { el, icon, confirmModal, toast, toastError } from './ui.js';
import { register, start, render } from './router.js';
import { renderLoginPage, showApp } from './login.js';

import { renderDashboard } from './views/dashboard.js';
import { renderAppointments } from './views/appointments.js';
import { renderStaff } from './views/staff.js';
import { renderSettings } from './views/settings.js';
import { renderBackup } from './views/backup.js';
import { renderSchools } from './views/schools.js';
import { renderStudents } from './views/students.js';
import { renderStudentProfile } from './views/student-profile.js';
import { renderProgressReport } from './views/progress-report.js'; // m164 — گزارش پیشرفت چک‌لیست‌محور (چاپ/PDF)
import { renderWaitlistModule } from './waitlist.js';
import { renderArchive } from './views/archive.js';
import { renderSpecialNeeds } from './views/special-needs.js'; // فاز ۷ — نیازهای ویژه
import { renderWorkingDay } from './views/working-day.js';
import { renderScreening } from './views/screening.js';
import { renderReports } from './views/reports.js';
import { renderExercises } from './views/exercises.js'; // — بانک تمرین
import { renderTemplates } from './views/templates.js'; // — مدیریت قالب‌ها (تب مستقل)
import { renderClearbook } from './views/clearbook.js'; // m188 — کلر بوک مرکز
import { renderOutbox } from './views/outbox.js'; // — صندوق اعلان‌ها (مدیر/منشی)
import { renderCaseEventTypes } from './views/case-event-types.js'; // — فرم‌ساز انواع رویداد (مدیر + درمانگر)
import { emptyState } from './ui.js';
import { initGlobalSearch } from './global-search.js';
import { initAnnouncementBanners } from './announcements.js';
import { fa } from './format.js'; // فاز W — badge لیست انتظار

(() => {
  const href = document.querySelector('link[rel="stylesheet"][href*="tokens.css"]')?.href ?? '';
  const v = href ? new URL(href).searchParams.get('v') : null;
  const elVer = document.getElementById('shell-version');
  if (v && elVer) elVer.textContent = `نسخه ${fa(v)}`;
})();

let __clientErrCount = 0;
function reportClientError(message, source, line, col, stack) {
  if (__clientErrCount >= 10) return;
  __clientErrCount += 1;
  try {
    fetch('/api/client-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ message, source, line, col, stack, url: location.href })
    }).catch(() => {});
  } catch { /* گزارش خطا هرگز نباید خودش خطا تولید کند */ }
}
window.addEventListener('error', (e) => {
  reportClientError(String(e.message ?? 'script error'), e.filename ?? null, e.lineno ?? null, e.colno ?? null, e.error?.stack ?? null);
});
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason;
  reportClientError(String(r?.message ?? r ?? 'unhandledrejection'), null, null, null, r?.stack ?? null);
});

import { session } from './state.js';

const THEME_KEY = 'cs.theme';
const THEME_COLORS = { light: '#F7F3EA', dark: '#191C22' }; // — دارک نرم‌شده

function currentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch { /* حالت خصوصی مرورگر */ }
  const system = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light';
  applyTheme(saved === 'dark' || saved === 'light' ? saved : system, false);
}

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

let themeBtn;

function updateThemeBtn() {
  const dark = currentTheme() === 'dark';
  const label = dark ? 'حالت روشن' : 'حالت تاریک';
  if (!themeBtn) return;
  themeBtn.replaceChildren(icon(dark ? 'sun' : 'moon', 18));
  themeBtn.title = label;
  themeBtn.setAttribute('aria-label', label);
}

const NAV = [
  { hash: '#/dashboard', label: 'داشبورد', icon: 'dashboard', group: 'امروز' },
  { hash: '#/appointments', label: 'تقویم نوبت‌ها', icon: 'calendar', group: 'برنامه‌ریزی', roles: ['manager', 'secretary'] },
  { hash: '#/appointments', label: 'تقویم من', icon: 'calendar', group: 'برنامه‌ریزی', roles: ['therapist'] },
  { hash: '#/working-day', label: 'روز کاری', icon: 'board', group: 'امروز', roles: ['manager', 'secretary', 'therapist'] },
  { hash: '#/screening', label: 'سنجش روزانه', icon: 'checklist', group: 'امروز', roles: ['manager', 'secretary'] },
  { hash: '#/reports', label: 'آمار دوره', icon: 'trendingUp', group: 'ارزیابی و درمان', roles: ['manager', 'secretary'] },
  { hash: '#/staff', label: 'کارکنان', icon: 'users', group: 'مرکز', roles: ['manager'] },
  { hash: '#/schools', label: 'مدارس', icon: 'school', group: 'دانش‌آموزان', roles: ['manager', 'secretary'] },
  { hash: '#/students', label: 'دانش‌آموزان', icon: 'student', group: 'دانش‌آموزان' },
  { hash: '#/waitlist', label: 'لیست انتظار', icon: 'waitlist', group: 'برنامه‌ریزی', roles: ['manager', 'secretary', 'therapist'] },
  { hash: '#/archive', label: 'آرشیو', icon: 'archive', group: 'دانش‌آموزان', roles: ['manager', 'secretary'] },
  { hash: '#/exercises', label: 'بانک تمرین', icon: 'board', group: 'ارزیابی و درمان' },
  { hash: '#/templates', label: 'مدیریت قالب‌ها', icon: 'grid', group: 'ارزیابی و درمان', roles: ['manager', 'therapist'] },
  { hash: '#/outbox', label: 'صندوق اعلان‌ها', icon: 'bell', group: 'مرکز', roles: ['manager', 'secretary'] },
  { hash: '#/clearbook', label: 'کلر بوک مرکز', icon: 'book', group: 'مرکز', roles: ['manager', 'secretary'] }, // m188
  { hash: '#/case-event-types', label: 'فرم‌ها و پرسش‌نامه‌ها', icon: 'timeline', group: 'ارزیابی و درمان', roles: ['manager', 'secretary', 'therapist'] }, // — نام روایی
  { hash: '#/special-needs', label: 'نیازهای ویژه', icon: 'clip', group: 'مرکز', roles: ['manager', 'secretary'] },
  { hash: '#/settings', label: 'تنظیمات', icon: 'settings', group: 'مرکز', roles: ['manager', 'secretary'] },
  { hash: '#/backup', label: 'پشتیبان‌گیری', icon: 'save', group: 'مرکز', roles: ['manager'] }
];

const GROUP_ORDER = ['امروز', 'برنامه‌ریزی', 'دانش‌آموزان', 'ارزیابی و درمان', 'مرکز']; // — نام روایی

function navGroupsFor(role) {
  if (role === 'supervisor') {
    return [{ label: '', items: NAV.filter((item) => item.hash === '#/dashboard') }];
  }
  const items = NAV.filter((item) => !item.roles || (role && item.roles.includes(role)));
  return GROUP_ORDER.map((label) => ({ label, items: items.filter((i) => i.group === label) })).filter((g) => g.items.length > 0);
}

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
        if (item.hash === '#/waitlist') btn.appendChild(el('span', { class: 'nav__badge nav__badge--waitlist', hidden: true }));
        if (item.hash === '#/dashboard') btn.appendChild(el('span', { class: 'nav__badge nav__badge--todos', hidden: true }));
        return btn;
      })
    ])
  );
}

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

function renderUserChip() {
  const chip = document.getElementById('user-chip');
  if (session.user) {
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

function rebuildNavForRole() {
  buildSidebar();
  syncNav(location.hash.replace(/^#\//, '') || 'dashboard');
  updateWaitlistBadge();
}

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

function managerOnly(render) {
  return roleOnly(['manager'], render);
}

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

register('#/dashboard', { title: 'داشبورد', render: renderDashboard });
register('#/appointments', {
  title: 'تقویم نوبت‌ها',
  render: roleOnly(
    ['manager', 'secretary', 'therapist'],
    renderAppointments,
    'این بخش برای دفتر (کل مرکز) و درمانگر (فقط برنامهٔ خودش) فعال است.'
  )
});
register('#/my-scheduling', { title: 'تقویم من', render: (c) => { location.hash = '#/appointments'; } });
register('#/working-day', {
  title: 'روز کاری',
  render: roleOnly(
    ['manager', 'secretary', 'therapist'],
    renderWorkingDay,
    'این بخش برای دفتر (کل مرکز) و درمانگر (فقط کارت جلسات خودش) فعال است.'
  )
});
register('#/my-attendance', { title: 'روز کاری', render: (c) => { location.hash = '#/working-day'; } });
register('#/my-reports', { title: 'روز کاری', render: (c) => { location.hash = '#/working-day'; } });
register('#/screening', { title: 'سنجش روزانه', render: roleOnly(['manager', 'secretary'], renderScreening) }); // — غربال نوآموزان
register('#/attendance', { title: 'روز کاری', render: (c) => { location.hash = '#/working-day'; } }); // — مسیر قدیمی
register('#/reports', {
  title: 'گزارش‌ها',
  render: (c) => {
    if (session.user?.role === 'therapist') { location.hash = '#/working-day'; return; }
    renderReports(c);
  }
});
register('#/staff', { title: 'کارکنان', render: managerOnly(renderStaff) });
register('#/settings', { title: 'تنظیمات', render: roleOnly(['manager', 'secretary'], renderSettings, 'تنظیمات فقط برای دفتر مرکز (مدیر و منشی) فعال است.') });
register('#/backup', { title: 'پشتیبان‌گیری و بازیابی', render: managerOnly(renderBackup) }); // m179 — فقط مدیر
register('#/working-hours', { title: 'تنظیمات', render: renderSettings }); // — مسیر قدیمی → تنظیمات
register('#/schools', { title: 'مدارس', render: roleOnly(['manager', 'secretary'], renderSchools) }); // — منشی مجاز
register('#/students', { title: 'دانش‌آموزان', render: renderStudents });
register('#/students/:id', { title: 'پروفایل دانش‌آموز', render: renderStudentProfile });
register('#/students/:id/progress-report', { title: 'گزارش پیشرفت', render: renderProgressReport }); // m164 — نقش‌ها در سرور کنترل می‌شوند (مثل ot/progress)
register('#/waitlist', { title: 'لیست انتظار', render: roleOnly(['manager', 'secretary', 'therapist'], renderWaitlistModule, 'این بخش برای دفتر و ثبت متقاضی توسط درمانگر فعال است.') });
register('#/archive', { title: 'آرشیو', render: roleOnly(['manager', 'secretary'], renderArchive) });
register('#/exercises', { title: 'بانک تمرین', render: renderExercises }); //
register('#/templates', { title: 'مدیریت قالب‌ها', render: roleOnly(['manager', 'therapist'], renderTemplates, 'این بخش برای مدیر و درمانگر فعال است.') });
register('#/outbox', { title: 'صندوق اعلان‌ها', render: roleOnly(['manager', 'secretary'], renderOutbox) }); //
register('#/clearbook', { title: 'کلر بوک مرکز', render: roleOnly(['manager', 'secretary'], renderClearbook, 'کلر بوک فقط برای دفتر مرکز (مدیر و منشی) فعال است.') }); // m188
register('#/case-event-types', { title: 'فرم‌ها و پرسش‌نامه‌ها', render: roleOnly(['manager', 'secretary', 'therapist'], renderCaseEventTypes, 'این بخش برای همکاران مرکز فعال است.') }); // //
register('#/special-needs', { title: 'نیازهای ویژه', render: roleOnly(['manager', 'secretary'], renderSpecialNeeds) }); // فاز ۷ — لایهٔ دوم RBAC

document.addEventListener('routechange', (e) => syncNav(e.detail.path));

themeBtn = document.getElementById('theme-btn');
themeBtn?.addEventListener('click', toggleTheme);

initTheme();
buildSidebar();

initGlobalSearch();

document.getElementById('menu-btn').addEventListener('click', () => {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.add('is-open');
  const backdrop = el('button', { class: 'sidebar-backdrop', 'aria-label': 'بستن منو', onclick: closeSidebar });
  document.body.appendChild(backdrop);
});

const outlet = document.getElementById('outlet');
initAnnouncementBanners(); // — بنر اعلان‌ها (صفحه ورود + پنل)
loadCurrentUser().then((ok) => { if (ok) { start(outlet); updateWaitlistBadge(); updateTodosBadge(); } });

document.getElementById('user-chip').addEventListener('click', () => {
  if (session.user) logout();
});

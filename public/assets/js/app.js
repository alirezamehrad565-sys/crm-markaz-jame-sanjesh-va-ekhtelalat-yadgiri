import { api, clearSession } from './api.js';
import { el, icon, confirmModal, toast, toastError, emptyState, skeletonState } from './ui.js';
import { register, start, render, registerNotFound } from './router.js';
import { renderLoginPage, showApp } from './login.js';

// فقط داشبورد و ۴۰۴ eager می‌مانند؛
// بقیهٔ نماها با ورود به مسیر بار می‌شوند (lazyView پایین) — الگوی موجود «روز کاری → سنجش»
import { renderDashboard } from './views/dashboard.js';
import { renderNotFound } from './views/not-found.js'; // نمای ۴۰۴ برای مسیرهای ناشناخته
import { initGlobalSearch } from './global-search.js';
import { initAnnouncementBanners } from './announcements.js';
import { fa } from './format.js'; // badge لیست انتظار

(() => {
  // tokens.css در base.css ادغام شد؛ نسخه از لینک base.css خوانده می‌شود
  const href = document.querySelector('link[rel="stylesheet"][href*="base.css"]')?.href ?? '';
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
import { initRum } from './rum.js'; // تله‌متری بی‌نام کارایی (بدون IP/UA — قانون PII design.md)

// ثبت ناظرهای CWV در نخستین فرصت؛ گزارشگرها buffered هستند و رویدادهای پیش از این هم می‌گیرند
initRum();

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
  const set = () => {
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME_COLORS[theme]);
  };
  // A15: گذار تم یکدست با View Transitions — قبلاً body fade می‌شد و بقیهٔ سطوح snap (دو سرعته)
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  if (!reduce && typeof document.startViewTransition === 'function') {
    document.startViewTransition(set);
  } else {
    set();
  }
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
  { hash: '#/treatment-plans', label: 'طرح درمان', icon: 'clipboard', group: 'ارزیابی و درمان', roles: ['manager', 'therapist'] }, // 
  { hash: '#/exercises', label: 'کارت‌های آماده', icon: 'grid', group: 'ارزیابی و درمان' }, // ریبرند بانک تمرین
  { hash: '#/outbox', label: 'صندوق اعلان‌ها', icon: 'bell', group: 'مرکز', roles: ['manager', 'secretary'] },
  { hash: '#/clearbook', label: 'کلر بوک مرکز', icon: 'book', group: 'مرکز', roles: ['manager', 'secretary'] }, // 
  { hash: '#/docs', label: 'نمون‌برگ‌ها و اسناد خام', icon: 'file', group: 'مرکز', roles: ['manager', 'secretary'] }, // 
  { hash: '#/finance', label: 'بودجه و مالی', icon: 'calculator', group: 'مرکز', roles: ['manager'] }, // 
  { hash: '#/case-event-types', label: 'فرم‌ها و پرسش‌نامه‌ها', icon: 'timeline', group: 'ارزیابی و درمان', roles: ['manager', 'secretary', 'therapist'] }, // — نام روایی
  { hash: '#/special-needs', label: 'نیازهای ویژه', icon: 'clip', group: 'مرکز', roles: ['manager', 'secretary'] },
  { hash: '#/settings', label: 'تنظیمات', icon: 'settings', group: 'مرکز', roles: ['manager', 'secretary'] },
  { hash: '#/backup', label: 'پشتیبان‌گیری', icon: 'save', group: 'مرکز', roles: ['manager'] }
];

const GROUP_ORDER = ['امروز', 'برنامه‌ریزی', 'دانش‌آموزان', 'ارزیابی و درمان', 'مرکز']; // — نام روایی

function navGroupsFor(role) {
  if (role === 'supervisor') {
    // ناظر فقط-خواندن: فقط صفحات مشاهده‌ای که گیت/روت‌هایش GET را به او می‌دهند
    const readHashes = ['#/dashboard', '#/appointments', '#/students', '#/waitlist', '#/archive', '#/reports', '#/exercises'];
    const seen = new Set();
    const items = NAV.filter((item) => {
      if (!readHashes.includes(item.hash) || seen.has(item.hash)) return false;
      seen.add(item.hash); // «تقویم نوبت‌ها» و «تقویم من» یک hash دارند — فقط اولی
      return true;
    });
    return [{ label: 'مشاهدهٔ مرکز', items }];
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
        /* پیش‌بارگذاری chunk نما هنگام اشاره/فوکوس/لمس — کلیک بعدی فوری است */
        btn.addEventListener('pointerenter', () => prefetchView(item.hash));
        btn.addEventListener('focus', () => prefetchView(item.hash));
        btn.addEventListener('touchstart', () => prefetchView(item.hash), { passive: true });
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
    const res = await api.getDetached('/api/waitlist/badge'); // پوسته‌محور: با ناوبری لغو نشود
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
    const res = await api.getDetached('/api/todos?box=inbox'); // پوسته‌محور
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
  document.removeEventListener('keydown', sidebarEsc); /* S11-20 */
  const opener = document.getElementById('menu-btn');
  if (opener && sidebar.dataset.focusFromDrawer !== '1') opener.focus(); /* فوکوس به فراخوان */
  delete sidebar.dataset.focusFromDrawer;
}

/* S11-20: Esc دراور را می‌بندد (الگوی مودال) */
function sidebarEsc(e) {
  if (e.key === 'Escape') closeSidebar();
}

function syncNav(path, notFound = false) {
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
  } else if (notFound) { // فقط مسیر ناشناخته (۴۰۴)؛ دیپ‌لینک‌های شناخته‌شده مثل #/students/:id رفتار قبلی را دارند
    if (crumbEl) crumbEl.textContent = 'صفحه پیدا نشد';
    titleEl.textContent = 'صفحه پیدا نشد';
    document.title = `صفحه پیدا نشد · ${document.title.split('·').pop()?.trim() || 'مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام'}`;
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
  return { manager: 'مدیر', therapist: 'درمانگر', secretary: 'منشی', supervisor: 'ناظر (فقط مشاهده)' }[role] ?? role;
}

function rebuildNavForRole() {
  buildSidebar();
  syncNav(location.hash.replace(/^#\//, '') || 'dashboard');
  updateWaitlistBadge();
}

async function loadCurrentUser() {
  try {
    const res = await api.getDetached('/api/me'); // بیرون از عمر نما
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
  return roleOnly(['manager'], render, 'این بخش فقط برای مدیر مرکز فعال است.'); /* S11-19 */
}

/* /بارگذار تنبل نماها.
   • chunk فقط با ورود به مسیر fetch می‌شود (import داینامیک literal در thunk — esbuild چانک جدا می‌سازد)
   • گیت نقش بیرونِ lazyView می‌ماند (roleOnly) تا کاربر بی‌مجاز هرگز chunk را fetch نکند
   • اسکلتِ حین بارگذاری: همان skeletonState موجود؛ با تأخیر ۱۵۰ms تا بار گرم بدون فلاش بماند
   • خطای شبکه: یک تلاش دوبارهٔ خودکار، سپس خطا به روتر می‌رود که errorState با «تلاش دوباره» دارد
   • پیش‌بارگذاری: pointerenter/focus/touchstart آیتم منو chunk را زودتر می‌گیرد (روانی جابه‌جایی) */
const viewChunks = {}; /* hash مسیر → { preload } */
function lazyView(load, exportName, hash) {
  let cached = null;
  const ensure = () => (cached ? Promise.resolve(cached) : load().then((m) => (cached = m)));
  if (hash) viewChunks[hash] = { preload: () => { ensure().catch(() => {}); } };
  return async (container, ctx) => {
    const skel = setTimeout(() => { if (!cached) container.replaceChildren(skeletonState('table', 5)); }, 150);
    try {
      let m;
      try { m = await ensure(); }
      catch { m = await ensure(); } /* retry یک‌باره: chunk در شبکهٔ ضعیف */
      clearTimeout(skel);
      return m[exportName](container, ctx);
    } catch (err) {
      clearTimeout(skel);
      cached = null; /* تلاش بعدی از صفر — کش منفی احتمالی دور زده شود */
      throw err; /* روتر: errorState + دکمهٔ «تلاش دوباره» */
    }
  };
}

function prefetchView(hash) {
  viewChunks[hash]?.preload();
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
    lazyView(() => import('./views/appointments.js'), 'renderAppointments', '#/appointments'),
    'این بخش برای دفتر (کل مرکز) و درمانگر (فقط برنامهٔ خودش) فعال است.'
  )
});
register('#/my-scheduling', { title: 'تقویم من', render: (c) => { location.hash = '#/appointments'; } });
register('#/working-day', {
  title: 'روز کاری',
  render: roleOnly(
    ['manager', 'secretary', 'therapist'],
    lazyView(() => import('./views/working-day.js'), 'renderWorkingDay', '#/working-day'),
    'این بخش برای دفتر (کل مرکز) و درمانگر (فقط کارت جلسات خودش) فعال است.'
  )
});
register('#/my-attendance', { title: 'روز کاری', render: (c) => { location.hash = '#/working-day'; } });
register('#/my-reports', { title: 'روز کاری', render: (c) => { location.hash = '#/working-day'; } });
register('#/screening', { title: 'سنجش روزانه', render: roleOnly(['manager', 'secretary'], lazyView(() => import('./views/screening.js'), 'renderScreening', '#/screening')) }); // — غربال نوآموزان
register('#/attendance', { title: 'روز کاری', render: (c) => { location.hash = '#/working-day'; } }); // — مسیر قدیمی
register('#/reports', {
  title: 'گزارش‌ها',
  render: (c) => {
    if (session.user?.role === 'therapist') { location.hash = '#/working-day'; return; }
    return reportsView(c);
  }
});
/* lazyView در سطح ماژول (نه داخل render) تا viewChunks['#/reports'] از لحظهٔ ثبت
   پر باشد و هاور/فوکوس chunk آمار دوره را پیش‌بارگذاری کند — یافتهٔ (پیش‌بارگذاری هاور ۱۷/۱۹) */
const reportsView = lazyView(() => import('./views/reports.js'), 'renderReports', '#/reports');
register('#/staff', { title: 'کارکنان', render: managerOnly(lazyView(() => import('./views/staff.js'), 'renderStaff', '#/staff')) });
register('#/settings', { title: 'تنظیمات', render: roleOnly(['manager', 'secretary'], lazyView(() => import('./views/settings.js'), 'renderSettings', '#/settings'), 'تنظیمات فقط برای دفتر مرکز (مدیر و منشی) فعال است.') });
register('#/backup', { title: 'پشتیبان‌گیری و بازیابی', render: managerOnly(lazyView(() => import('./views/backup.js'), 'renderBackup', '#/backup')) }); // فقط مدیر
register('#/working-hours', { title: 'تنظیمات', render: lazyView(() => import('./views/settings.js'), 'renderSettings', '#/working-hours') }); // — مسیر قدیمی → تنظیمات
register('#/schools', { title: 'مدارس', render: roleOnly(['manager', 'secretary'], lazyView(() => import('./views/schools.js'), 'renderSchools', '#/schools')) }); // — منشی مجاز
register('#/students', { title: 'دانش‌آموزان', render: lazyView(() => import('./views/students.js'), 'renderStudents', '#/students') });
register('#/students/:id', { title: 'پروفایل دانش‌آموز', render: lazyView(() => import('./views/student-profile.js'), 'renderStudentProfile', '#/students/') });
register('#/students/:id/progress-report', { title: 'گزارش پیشرفت', render: lazyView(() => import('./views/progress-report.js'), 'renderProgressReport', '#/students/') }); // نقش‌ها در سرور کنترل می‌شوند (مثل ot/progress)
register('#/waitlist', { title: 'لیست انتظار', render: roleOnly(['manager', 'secretary', 'therapist'], lazyView(() => import('./waitlist.js'), 'renderWaitlistModule', '#/waitlist'), 'این بخش برای دفتر و ثبت متقاضی توسط درمانگر فعال است.') });
register('#/archive', { title: 'آرشیو', render: roleOnly(['manager', 'secretary'], lazyView(() => import('./views/archive.js'), 'renderArchive', '#/archive')) });
register('#/exercises', { title: 'کارت‌های آماده', render: lazyView(() => import('./views/exercises.js'), 'renderExercises', '#/exercises') }); //
register('#/treatment-plans', { title: 'طرح درمان', render: roleOnly(['manager', 'therapist'], lazyView(() => import('./views/treatment-plans.js'), 'renderTreatmentPlans', '#/treatment-plans'), 'این بخش برای مدیر و درمانگر (معلم LD) فعال است.') }); // 
register('#/outbox', { title: 'صندوق اعلان‌ها', render: roleOnly(['manager', 'secretary'], lazyView(() => import('./views/outbox.js'), 'renderOutbox', '#/outbox')) }); //
register('#/clearbook', { title: 'کلر بوک مرکز', render: roleOnly(['manager', 'secretary'], lazyView(() => import('./views/clearbook.js'), 'renderClearbook', '#/clearbook'), 'کلر بوک فقط برای دفتر مرکز (مدیر و منشی) فعال است.') }); // 
register('#/docs', { title: 'نمون‌برگ‌ها و اسناد خام', render: roleOnly(['manager', 'secretary'], lazyView(() => import('./views/docs.js'), 'renderDocsList', '#/docs'), 'اسناد خام فقط برای دفتر مرکز (مدیر و منشی) فعال است.') }); // 
register('#/docs/:id', { title: 'سند', render: roleOnly(['manager', 'secretary'], lazyView(() => import('./views/docs.js'), 'renderDocsDetail', '#/docs/'), 'اسناد خام فقط برای دفتر مرکز (مدیر و منشی) فعال است.') }); // RBAC دوم در بک‌اند
register('#/finance', { title: 'بودجه و مالی', render: managerOnly(lazyView(() => import('./views/finance.js'), 'renderFinance', '#/finance')) }); // فقط مدیر
register('#/case-event-types', { title: 'فرم‌ها و پرسش‌نامه‌ها', render: roleOnly(['manager', 'secretary', 'therapist'], lazyView(() => import('./views/case-event-types.js'), 'renderCaseEventTypes', '#/case-event-types'), 'این بخش برای همکاران مرکز فعال است.') }); // //
register('#/special-needs', { title: 'نیازهای ویژه', render: roleOnly(['manager', 'secretary'], lazyView(() => import('./views/special-needs.js'), 'renderSpecialNeeds', '#/special-needs')) }); // لایهٔ دوم RBAC

// مسیر ناشناخته به‌جای ریدایرکت بی‌صدا، نمای ۴۰۴ را رندر می‌کند (hash دست‌نخورده می‌ماند)
registerNotFound({ title: 'صفحه پیدا نشد', render: renderNotFound });

document.addEventListener('routechange', (e) => syncNav(e.detail.path, e.detail.notFound === true));

/* بازخورد فوری ناوبری: هایلایت منو و عنوان/نخود‌نان پیش از بارگذاری chunk و داده عوض شود
   (قبلاً تا کامل شدن render صبر می‌شد — روی نمای سنگین/شبکهٔ کند حس تأخیر می‌ساخت) */
window.addEventListener('hashchange', () => {
  syncNav(location.hash.replace(/^#\//, '') || 'dashboard');
});

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
  /* S11-20: فوکوس به اولین کنترل دراور + Escape */
  const first = sidebar.querySelector('button, a[href], input');
  if (first) {
    sidebar.dataset.focusFromDrawer = '1'; /* بسته‌شدن با کلیک آیتم منو، فوکوس را به menu-btn برنمی‌گرداند — پیمایش ادامه دارد */
    first.focus();
  }
  document.addEventListener('keydown', sidebarEsc);
});

const outlet = document.getElementById('outlet');
initAnnouncementBanners(); // — بنر اعلان‌ها (صفحه ورود + پنل)
loadCurrentUser().then((ok) => { if (ok) { start(outlet); updateWaitlistBadge(); updateTodosBadge(); } });

document.getElementById('user-chip').addEventListener('click', () => {
  if (session.user) logout();
});

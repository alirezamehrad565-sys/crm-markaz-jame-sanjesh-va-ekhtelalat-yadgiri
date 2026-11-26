import { api, clearSession } from './api.js';
import { bindThemeBtn, confirmModal, el, emptyState, icon, initTheme, skeletonState, toast, toastError } from './ui.js';
import { register, start, render, registerNotFound } from './router.js';
import { renderLoginPage, showApp } from './login.js';

// فقط داشبورد و ۴۰۴ eager می‌مانند؛
// بقیهٔ نماها با ورود به مسیر بار می‌شوند (lazyView پایین) — الگوی موجود «روز کاری → سنجش»
import { renderDashboard } from './views/dashboard.js';
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
/* ۱.۲۵.۶۶ — لولهٔ خطا وصل شد: تا امروز به /api/client-errors (مسیرِ موجود نبود → میدل‌ور احراز ۴۰۱)
   پست می‌شد و هیچ خطای مرورگری به سرور نمی‌رسید؛ اکنون هم‌الگوی /public/rum روی POST /public/client-errors
   بی‌احراز می‌رود (خطاهای صفحهٔ ورود هم گزارش می‌شوند) با برش هم‌قرارداد با ستون‌های جدول 0106 */
function reportClientError(message, source, line, col, stack) {
  if (__clientErrCount >= 10) return;
  __clientErrCount += 1;
  try {
    const v = document.querySelector('link[rel="stylesheet"][href*="base.css"]')?.href ?? '';
    const ver = v ? new URL(v).searchParams.get('v') : null;
    fetch('/public/client-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        message: String(message ?? '').slice(0, 500),
        source: source ? String(source).slice(0, 300) : null,
        line: Number.isFinite(line) ? Math.trunc(line) : null,
        col: Number.isFinite(col) ? Math.trunc(col) : null,
        stack: stack ? String(stack).slice(0, 6000) : null,
        url: String(location.href).slice(0, 300),
        app_version: ver ? String(ver).slice(0, 20) : null
      })
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

import { session } from './api.js';
import { initRum } from './rum.js'; // تله‌متری بی‌نام کارایی (بدون IP/UA — قانون PII design.md)
// فاز A — نشانگر سربرگ «سرور محلی» از feed مشترک پوسته (engine:status + poll ۳۰ثانیه‌ای) تغذیه می‌شود؛
// تابع نگاشت حالت→رنگ/برچسب همان خالصِ پنل سلامت است (serverStateView — یک منبع، دو لایه).
// (۱.۲۷.۰۸) منبع = views/server-pill.js — ماژول کوچک بوت؛ کل پنل سلامت با import پویای مسیر
// روت (#/health-panel) lazy می‌ماند (گیت بودجهٔ کارایی: boot_js_gz/eager_modules).
import { serverStateView, installServerStatusFeed, subscribeServerStatus } from './views/server-pill.js';

// ثبت ناظرهای CWV در نخستین فرصت؛ گزارشگرها buffered هستند و رویدادهای پیش از این هم می‌گیرند
initRum();

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
  { hash: '#/waitlist', label: 'لیست انتظار', icon: 'waitlist', group: 'برنامه‌ریزی', roles: ['manager', 'secretary', 'therapist'] }, // ۱.۲۷.۳۸ — صندوق ورودی داخل همین نما (تب دوم)؛ آیتم مستقل حذف شد
  { hash: '#/archive', label: 'آرشیو', icon: 'archive', group: 'دانش‌آموزان', roles: ['manager', 'secretary'] },
  { hash: '#/treatment-plans', label: 'طرح درمان', icon: 'clipboard', group: 'ارزیابی و درمان', roles: ['manager', 'therapist'] }, // 
  { hash: '#/exercises', label: 'کارت‌های آماده', icon: 'grid', group: 'ارزیابی و درمان' }, // ریبرند بانک تمرین
  { hash: '#/games', label: 'بازی‌ها', icon: 'gamepad', group: 'ارزیابی و درمان', roles: ['manager', 'therapist'] }, // ۱.۲۵.۲۰ — پیش‌نمایش درمانگر
  { hash: '#/outbox', label: 'صندوق اعلان‌ها', icon: 'bell', group: 'مرکز', roles: ['manager', 'secretary'] },
  { hash: '#/clearbook', label: 'کلر بوک مرکز', icon: 'book', group: 'مرکز', roles: ['manager', 'secretary'] }, // 
  { hash: '#/docs', label: 'نمون‌برگ‌ها و اسناد خام', icon: 'file', group: 'مرکز', roles: ['manager', 'secretary'] }, // 
  { hash: '#/finance', label: 'بودجه و مالی', icon: 'calculator', group: 'مرکز', roles: ['manager'] }, // 
  { hash: '#/case-event-types', label: 'فرم‌ها و پرسش‌نامه‌ها', icon: 'timeline', group: 'ارزیابی و درمان', roles: ['manager', 'secretary', 'therapist'] }, // — نام روایی؛ ۱.۲۷.۴۰ — فرم‌ساز تعاملی تب سوم همین نما شد و آیتم مستقل حذف شد
  { hash: '#/family-surveys', label: 'نظرسنجی خانواده‌ها', icon: 'heart', group: 'مرکز', roles: ['manager'] }, // ۱.۲۵.۶۰ — ماژول مستقل فقط-مدیر + دو فرم ساخت‌یافته (پایان دوره/حین درمان)
  // ۱.۲۵.۵۶ — «شاخص‌های مرکز» از منو قطع و در تب «گزارش دوره» همین نمای #/reports تلفیق شد (خواست کارفرما)
  // ۱.۲۵.۵۳ — «کتابخانهٔ شبکه» از منو قطع شد؛ شارژ محتوا CP↔سامانه کاملاً نامرئی و خودکار سمت سرور می‌ماند (خواست کارفرما)
  { hash: '#/special-needs', label: 'نیازهای ویژه', icon: 'clip', group: 'مرکز', roles: ['manager', 'secretary'] },
  { hash: '#/settings', label: 'تنظیمات', icon: 'settings', group: 'مرکز', roles: ['manager', 'secretary'] },
  { hash: '#/backup', label: 'پشتیبان‌گیری', icon: 'save', group: 'مرکز', roles: ['manager'] },
  /* ۱.۲۵.۷۱ — «پنل سلامت» و «خطاهای مرورگر» از سایدبار و روتر قطع شدند (خواست کارفرما: کد حذف نشود، فقط از UI قطع شود).
     دست‌نخورده‌ها: سورس نماها در views/health-panel.js و views/client-errors.js، ماژول سرور health/client-errors،
     مسیرهای GET /api/health/panel و GET /api/client-errors، گزارشگر خطای مرورگر روی /public/client-errors،
     و هشدارهای شبانه. بازگشت: دو خط NAV و دو register هم‌نام نما از کامیت ۱.۲۵.۷۰ (b17747a) برگردانده شود. */
  // ۱.۲۵.۵۳ — لینک بیرونی «شبکهٔ مراکز شبکه» از منو قطع شد (خواست کارفرما)؛ سمت CP بی‌تغییر می‌ماند
  // بازاعمال ۱.۲۵.۵۱ — جای شبکهٔ مراکز: گزارش باگ سامانه به پشتیبانی CP (همهٔ همکاران)
  { hash: '#/bug-report', label: 'گزارش به پشتیبانی', icon: 'bug', group: 'مرکز' } // ۱.۲۵.۶۳ — آیکن bug واقعی جای عنکبوت (خواست کارفرما)
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
  /* UX-ممیزی گلایهٔ ۵: ۲۰ آیتم تخت = منوی خیلی طولانی؛ گروه‌ها آکاردئون شدند (پیش‌فرض باز، قابل جمع‌کردن) */
  nav.replaceChildren(
    ...navGroupsFor(role).map((group) => {
      const items = group.items.map((item) => {
        const btn = el(
          'button',
          { class: 'nav__item', dataset: { nav: item.hash }, onclick: () => { if (item.external) { window.open(item.external, '_blank', 'noopener'); closeSidebar(); return; } location.hash = item.hash; } },
          icon(item.icon),
          el('span', {}, item.label)
        );
        /* لینک بیرونی (شبکهٔ مراکز) چانک نمای محلی ندارد — پیش‌بارگذاری فقط برای ناوبری داخلی */
        if (!item.external) {
          btn.addEventListener('pointerenter', () => prefetchView(item.hash));
          btn.addEventListener('focus', () => prefetchView(item.hash));
          btn.addEventListener('touchstart', () => prefetchView(item.hash), { passive: true });
        }
        if (item.hash === '#/waitlist') btn.appendChild(el('span', { class: 'nav__badge nav__badge--waitlist', hidden: true }));
        if (item.hash === '#/dashboard') btn.appendChild(el('span', { class: 'nav__badge nav__badge--todos', hidden: true }));
        return btn;
      });
      return el(
        'details',
        { class: 'nav__group', open: true },
        el(
          'summary',
          { class: 'nav__label' },
          el('span', {}, group.label || ''),
          el('span', { class: 'nav__group-chev', 'aria-hidden': 'true' }, icon('chevD', 13))
        ),
        ...items
      );
    })
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

/* ── فاز A — pill همیشه‌نمایان «سرور محلی» در سربرگ (طرح docs/rust/server-cloud-update-design.md §۱-۳) ──
   نقطهٔ رنگ + برچسب کوتاه؛ تازه‌سازی با feed مشترک پوسته (رویداد engine:status + poll ۳۰ثانیه‌ای
   engine_status — نصب یک‌بارِ installServerStatusFeed در health-panel.js). کلیک → پنل سلامت.
   فقط در پوستهٔ میز (window.__TAURI__ — باGlobalTauri) نمایان است؛ حالت وب/آزمون هیچ عنصری
   اضافه نمی‌کند و هر خطای غیرمنتظره هم فقط همین نشانگر را بی‌اثر می‌کند — بوت اپ هرگز نمی‌شکند. */
function installServerStatusPill() {
  try {
    const tauri = globalThis.__TAURI__;
    const topbar = document.querySelector('.topbar');
    if (!tauri || !topbar || document.getElementById('server-status-pill')) return;
    installServerStatusFeed();
    const pill = el('button', {
      id: 'server-status-pill',
      class: 'badge badge--neutral',
      type: 'button',
      title: 'وضعیت سرور محلی — کلیک: پنل سلامت',
      onclick: () => { location.hash = '#/health-panel'; },
      style: { cursor: 'pointer', border: 'none', maxWidth: '260px', flex: 'none' }
    },
      el('span', { class: 'dot dot--neutral', 'aria-hidden': 'true' }),
      el('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, '…')
    );
    const themeBtnEl = document.getElementById('theme-btn');
    if (themeBtnEl) topbar.insertBefore(pill, themeBtnEl); else topbar.appendChild(pill);
    const paint = (status) => {
      const view = serverStateView(status?.state, status?.degradedReason);
      pill.setAttribute('role', 'status'); /* ui-005 ۱.۲۷.۸۳ — تغییر وضعیت سرور اعلام می‌شود */
      pill.setAttribute('aria-live', 'polite');
      pill.className = `badge ${view.badge}`;
      const dotEl = pill.querySelector('.dot');
      if (dotEl) dotEl.className = `dot ${view.dot}`;
      const labelEl = pill.lastElementChild;
      if (labelEl) labelEl.textContent = view.label;
      pill.title = `${view.label} — کلیک: پنل سلامت`;
    };
    paint(null); // نخستین رنگ: خنثی «وضعیت نامشخص» تا نخستین پاکت پوسته برسد
    subscribeServerStatus(paint);
  } catch { /* نشانگر سربرگ هرگز بوت اپ را نمی‌شکند */ }
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

/* M2 POLISH-4 (۱.۲۷.۳۱) — قطع پلتفرمی: پنل سلامت و ویزارد پیکربندی ابری ابزار پوستهٔ میز هستند
   (window.__TAURI__ — همان گارد server-pill)؛ روی نسخهٔ وب/کلادفلر این مسیرها با یادداشت نرم
   جایگزین می‌شوند و بنر/هدایت اولین‌اجرای ابری هرگز نمی‌آید — سورس و chunk دست‌نخورده می‌ماند. */
function isDesktopShell() {
  return Boolean(globalThis.__TAURI__);
}
function desktopOnly(render) {
  return (container, ctx) => {
    if (isDesktopShell()) return render(container, ctx);
    container.replaceChildren(
      emptyState({ iconName: 'settings', title: 'این بخش در نسخهٔ میز مرکز است', hint: 'پنل سلامت و ویزارد پیکربندی ابری روی نسخهٔ وب/کلادفلر از رابط قطع شده‌اند؛ برای این بخش، نسخهٔ میز (دسکتاپ) مرکز را باز کنید.' })
    );
  };
}

/* ── فاز C — ورودی‌های سبک «پیکربندی اولیه اتصال ابری» (سند §۲-۵) ─────────────────
   دو فلگ سشن‌محلی/نصب‌محلی و دو ورودی بنر/هدایت اولین اجرا — هر دو post-login و بی‌await
   سنگین: بوت و نخستین رندر هرگز منتظر fetch وضعیت نمی‌مانند؛ خطای درگاه = بی‌بنر/بی‌هدایت
   (الگوی نرم feedهای status). کلیدها: cloudSetupSeen (localStorage — فقط یک‌بار در طول عمر
   نصب) و cs.cloudSetupSkipped/cs.cloudSetupBannerDismissed (sessionStorage — ردکردن سشن‌محلی؛
   کلیدها با views/cloud-setup.js مشترک‌اند — این فایل lazy است و از app.js import نمی‌شود). */
const CLOUD_SETUP_SEEN_KEY = 'cloudSetupSeen';
const CLOUD_SETUP_BANNER_KEY = 'cs.cloudSetupBannerDismissed';
const CLOUD_SETUP_SKIP_KEY = 'cs.cloudSetupSkipped';

function cloudSetupRouteActive() {
  return ['', 'dashboard'].includes(location.hash.replace(/^#\//, '').split('?')[0]);
}

/* بنر یک‌خطی بالای داشبورد — فقط مدیر + status.configured=false + ردنشده در این سشن.
   الگوی بنرهای alert داشبورد (alert alert--info + alert__body/alert__actions) — بدون CSS تازه. */
function withCloudSetupBanner(dashboardRender) {
  return async (container, ctx) => {
    await dashboardRender(container, ctx);
    try {
      if (session.user?.role !== 'manager') return;
      if (!isDesktopShell()) return; /* M2 POLISH-4 (۱.۲۷.۳۱) — بنر ابری فقط پوستهٔ میز */
      try {
        if (sessionStorage.getItem(CLOUD_SETUP_BANNER_KEY) === '1' || sessionStorage.getItem(CLOUD_SETUP_SKIP_KEY) === '1') return;
      } catch { /* حالت خصوصی — بنر می‌آید */ }
      if (!cloudSetupRouteActive()) return;
      const res = await api.getDetached('/api/instance-sync/status'); // نرم — خطا = بی‌بنر
      const st = res?.data && typeof res.data === 'object' ? res.data : null;
      if (!st || st.configured !== false) return;
      if (!cloudSetupRouteActive()) return; // کاربر در فاصلهٔ fetch جابه‌جا شد — مزاحم نشویم
      const banner = el('div', { class: 'alert alert--info', style: { marginBottom: 'var(--sp-4)' } },
        icon('link', 18),
        el('div', { class: 'alert__body' },
          el('span', {}, 'این نصب هنوز به ابر وصل نیست — هم‌گامی دوسویه و پشتیبان ابری فعال نیست. پیکربندی یک‌بار با ویزارد انجام می‌شود.'),
          el('div', { class: 'alert__actions' },
            // فاز D2 — خواست کارفرما: جریان پیکربندی ابری حالا داخل کارت «اتصال ابری» پنل سلامت است —
            // دکمه به همان کارت می‌رود (#/health-panel؛ مسیر #/cloud-setup فقط دیپ‌لینک می‌ماند)
            el('button', { class: 'btn btn--soft btn--sm', onclick: () => { location.hash = '#/health-panel'; } }, icon('settings', 14), 'شروع پیکربندی ابری'),
            el('button', {
              class: 'btn btn--ghost btn--sm',
              onclick: (e) => {
                try { sessionStorage.setItem(CLOUD_SETUP_BANNER_KEY, '1'); } catch { /* نرم */ }
                e.currentTarget.closest('.alert')?.remove();
              }
            }, 'بعداً')
          )
        )
      );
      container.prepend(banner);
    } catch { /* خطای وضعیت = بی‌بنر — داشبورد هرگز نمی‌شکند */ }
  };
}

/* تشخیص اولین اجرا — مدیرِ نصبِ تازهٔ بی‌اتصال یک‌بار خودکار به ویزارد می‌رود.
   فلگ cloudSetupSeen فقط پس از تأیید configured=false نوشته می‌شود تا fetch ناموفق
   (موتور هنوز نیامده) «فرصت یک‌بار» را نسوزاند؛ خودِ هدایت fire-and-forget است. */
function armFirstRunCloudSetup() {
  try {
    if (session.user?.role !== 'manager') return;
    if (!isDesktopShell()) return; /* M2 POLISH-4 (۱.۲۷.۳۱) — هدایت اولین‌اجرای ابری فقط پوستهٔ میز */
    if (localStorage.getItem(CLOUD_SETUP_SEEN_KEY) === '1') return;
    if (!cloudSetupRouteActive()) return; // دیپ‌لینک کاربر را نمی‌رباییم
    api.getDetached('/api/instance-sync/status')
      .then((res) => {
        const st = res?.data && typeof res.data === 'object' ? res.data : null;
        if (!st || st.configured !== false) return;
        try { localStorage.setItem(CLOUD_SETUP_SEEN_KEY, '1'); } catch { /* حالت خصوصی — نرم */ }
        if (cloudSetupRouteActive()) location.hash = '#/cloud-setup';
      })
      .catch(() => { /* موتور/شبکه حاضر نیست — فلگ مصرف نمی‌شود؛ بوت بعدی دوباره می‌کشد */ });
  } catch { /* حالت خصوصی مرورگر — بوت هرگز نمی‌شکند */ }
}

/* /بارگذار تنبل نماها.
   • chunk فقط با ورود به مسیر fetch می‌شود (import داینامیک literal در thunk — esbuild چانک جدا می‌سازد)
   • گیت نقش بیرونِ lazyView می‌ماند (roleOnly) تا کاربر بی‌مجاز هرگز chunk را fetch نکند
   • اسکلتِ حین بارگذاری: همان skeletonState موجود؛ با تأخیر ۱۵۰ms تا بار گرم بدون فلاش بماند
   • خطای شبکه: یک تلاش دوبارهٔ خودکار، سپس خطا به روتر می‌رود که errorState با «تلاش دوباره» دارد
   • پیش‌بارگذاری: pointerenter/focus/touchstart آیتم منو chunk را زودتر می‌گیرد (روانی جابه‌جایی) */
const viewChunks = {}; /* hash مسیر → { preload } */

/* ۱.۲۵.۲۷ — ترمیم خودکار «تبِ باز از قبل از انتشار».
   بیلد هر انتشار پوشهٔ dist را از نو می‌سازد و hashهای قبلی از سرور حذف می‌شوند؛
   بنابراین tabی که از قبل از دیپلوی باز مانده، با ورود به هر نمای جدید chunkِ نسخهٔ
   قبل را می‌خواهد که دیگر وجود ندارد (رگبار 404 روی /assets/dist/*.js).
   ترمیم: یک‌بار reload خودکار تا پوستهٔ تازه با گراف باندل نسخهٔ زنده هم‌گام شود.
   گارد نشست جلوی حلقهٔ reload را می‌گیرد و پس از نخستین بارگذاری موفق chunk پاک
   می‌شود تا انتشار بعدی هم دوباره کار کند؛ خطای واقعی شبکه/سرور بعد از همان یک
   reload به errorStateِ روتر می‌رسد (دکمهٔ «تلاش دوباره» سر جایش است). */
function reloadIfStaleChunk() {
  const key = 'cs.stale-chunk-reload';
  try {
    if (sessionStorage.getItem(key) === '1') return;
    sessionStorage.setItem(key, '1');
  } catch { return; } /* بدون sessionStorage (حریم خصوصی سخت‌گیرانه) — رفتار قدیمی */
  setTimeout(() => location.reload(), 50);
}

function lazyView(load, exportName, hash) {
  let cached = null;
  const ensure = () => (cached ? Promise.resolve(cached) : load().then((m) => (cached = m)));
  if (hash) viewChunks[hash] = { preload: () => { ensure().catch(() => {}); } };
  return async (container, ctx) => {
    const skel = setTimeout(() => { if (!cached) container.replaceChildren(skeletonState('table', 5)); }, 150);
    let m;
    try {
      try { m = await ensure(); }
      catch { m = await ensure(); } /* retry یک‌باره: chunk در شبکهٔ ضعیف */
    } catch (err) {
      clearTimeout(skel);
      cached = null; /* تلاش بعدی از صفر — کش منفی احتمالی دور زده شود */
      reloadIfStaleChunk(); /* chunkِ نسخهٔ قبل دیگر روی سرور نیست → هم‌گام‌سازی یک‌باره */
      throw err; /* روتر: errorState + دکمهٔ «تلاش دوباره» */
    }
    clearTimeout(skel);
    try { sessionStorage.removeItem('cs.stale-chunk-reload'); } catch { /* بی‌اهمیت */ }
    return m[exportName](container, ctx);
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

/* فاز C — داشبورد با پوششِ بنر «پیکربندی ابری»: پس از رندر کامل داشبورد، اگر مدیر + بی‌اتصال +
   ردنشده در این سشن، بنر یک‌خطی بالای نما می‌نشیند (وضعیت نرم گرفته می‌شود — خطا = بی‌بنر) */
register('#/dashboard', { title: 'داشبورد', render: withCloudSetupBanner(renderDashboard) });
register('#/appointments', {
  title: 'تقویم نوبت‌ها',
  render: roleOnly(
    ['manager', 'secretary', 'therapist', 'supervisor'], /* ۱.۲۵.۰۱ — ناظر: منوی «مشاهدهٔ مرکز» تقویم را وعده می‌داد ولی گیت مسیر قدیمی بود — سگمنت فقط-خواندنی داخل نما خودش دکمه‌های نوشتنی را حذف می‌کند */
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
/* ۱.۲۵.۷۱ — دو ثبت مسیر «پنل سلامت» و «خطاهای مرورگر» از روتر قطع شد (خواست کارفرما؛ سورس نماها و API زنده —
   بازگشت = دو خط register از کامیت ۱.۲۵.۷۰ برگردانده شود؛ هش مستقیم اکنون ۴۰۴ می‌دهد) */
/* فاز A — روت «پنل سلامت» دوباره وصل شد (فقط روت؛ آیتم سایدبار به حکم ۱.۲۵.۷۱ همچنان قطع است):
   pill سربرگ «سرور محلی» کلیک → همین مسیر — الگوی register از هم‌نمایان کامیت ۱.۲۵.۷۰. */
register('#/health-panel', { title: 'پنل سلامت', render: managerOnly(desktopOnly(lazyView(() => import('./views/health-panel.js'), 'renderHealthPanel', '#/health-panel'))) }); /* M2 POLISH-4: روی وب یادداشت نرم */
/* فاز C — ویزارد «پیکربندی اولیه اتصال ابری» (سند server-cloud-update-design §۲-۵/§۶ فاز C):
   جریان پیکربندی نخست پس از نصب تازه — فقط مدیر؛ کل ویزارد (مدل خالص + جریان‌های B1/A1 +
   گام secret یک‌بارمصرف) در views/cloud-setup.js است و chunk فقط با ورود به مسیر می‌آید
   (import داینامیک literal در thunk — گیت بودجهٔ کارایی: boot_js_gz/eager_modules دست نمی‌خورد).
   آدرس کامل مسیر در نصب میز: http://127.0.0.1:8787/#/cloud-setup — از لینک پانویس boot-dist هم. */
register('#/cloud-setup', { title: 'پیکربندی اتصال ابری', render: managerOnly(desktopOnly(lazyView(() => import('./views/cloud-setup.js'), 'renderCloudSetup', '#/cloud-setup'))) }); /* M2 POLISH-4: روی وب یادداشت نرم */
register('#/working-hours', { title: 'تنظیمات', render: lazyView(() => import('./views/settings.js'), 'renderSettings', '#/working-hours') }); // — مسیر قدیمی → تنظیمات
register('#/schools', { title: 'مدارس', render: roleOnly(['manager', 'secretary'], lazyView(() => import('./views/schools.js'), 'renderSchools', '#/schools')) }); // — منشی مجاز
register('#/students', { title: 'دانش‌آموزان', render: lazyView(() => import('./views/students.js'), 'renderStudents', '#/students') });
register('#/students/:id', { title: 'پروندهٔ دانش‌آموز', render: lazyView(() => import('./views/student-profile.js'), 'renderStudentProfile', '#/students/') });
register('#/students/:id/progress-report', { title: 'گزارش پیشرفت', render: lazyView(() => import('./views/progress-report.js'), 'renderProgressReport', '#/students/') }); // نقش‌ها در سرور کنترل می‌شوند (مثل ot/progress)
register('#/waitlist', { title: 'لیست انتظار', render: roleOnly(['manager', 'secretary', 'therapist', 'supervisor'], lazyView(() => import('./waitlist.js'), 'renderWaitlistModule', '#/waitlist'), 'این بخش برای دفتر و ثبت متقاضی توسط درمانگر فعال است.') }); /* ۱.۲۵.۰۱ — ناظر: آیتم منو بدون گیت می‌افتاد روی «دسترسی مجاز نیست»؛ ۱.۲۷.۳۸ — صندوق ورودی تبِ دوم همین نما */
register('#/archive', { title: 'آرشیو', render: roleOnly(['manager', 'secretary', 'supervisor'], lazyView(() => import('./views/archive.js'), 'renderArchive', '#/archive')) }); /* ۱.۲۵.۰۱ — ناظر: فقط مشاهده؛ اکشن‌های ردیف در خود نما پنهان می‌شوند */
register('#/exercises', { title: 'کارت‌های آماده', render: lazyView(() => import('./views/exercises.js'), 'renderExercises', '#/exercises') }); //
register('#/games', { title: 'بازی‌ها', render: roleOnly(['manager', 'therapist'], lazyView(() => import('./views/games.js'), 'renderGames', '#/games'), 'بخش بازی‌ها برای مدیر و درمانگر فعال است.') }); // ۱.۲۵.۲۰ — نخستین گرهٔ UI حلقهٔ درمانگر بازی‌ها
register('#/treatment-plans', { title: 'طرح درمان', render: roleOnly(['manager', 'therapist'], lazyView(() => import('./views/treatment-plans.js'), 'renderTreatmentPlans', '#/treatment-plans'), 'این بخش برای مدیر و درمانگر (معلم LD) فعال است.') }); // 
register('#/outbox', { title: 'صندوق اعلان‌ها', render: roleOnly(['manager', 'secretary'], lazyView(() => import('./views/outbox.js'), 'renderOutbox', '#/outbox')) }); //
register('#/clearbook', { title: 'کلر بوک مرکز', render: roleOnly(['manager', 'secretary'], lazyView(() => import('./views/clearbook.js'), 'renderClearbook', '#/clearbook'), 'کلر بوک فقط برای دفتر مرکز (مدیر و منشی) فعال است.') }); // 
register('#/docs', { title: 'نمون‌برگ‌ها و اسناد خام', render: roleOnly(['manager', 'secretary'], lazyView(() => import('./views/docs.js'), 'renderDocsList', '#/docs'), 'اسناد خام فقط برای دفتر مرکز (مدیر و منشی) فعال است.') }); // 
register('#/docs/:id', { title: 'سند', render: roleOnly(['manager', 'secretary'], lazyView(() => import('./views/docs.js'), 'renderDocsDetail', '#/docs/'), 'اسناد خام فقط برای دفتر مرکز (مدیر و منشی) فعال است.') }); // RBAC دوم در بک‌اند
register('#/finance', { title: 'بودجه و مالی', render: managerOnly(lazyView(() => import('./views/finance.js'), 'renderFinance', '#/finance')) }); // فقط مدیر
register('#/case-event-types', { title: 'فرم‌ها و پرسش‌نامه‌ها', render: roleOnly(['manager', 'secretary', 'therapist'], lazyView(() => import('./views/case-event-types.js'), 'renderCaseEventTypes', '#/case-event-types'), 'این بخش برای همکاران مرکز فعال است.') }); // //
/* ۱.۲۷.۴۰ — فرم‌ساز تعاملی داخل «فرم‌ها و پرسش‌نامه‌ها» (تب سوم) میزبانش است؛
   لینک‌های قدیمی #/form-builder به همان نما هدایت می‌شوند — آیتم منو و ثبت مستقل حذف شد */
register('#/form-builder', { title: 'فرم‌ها و پرسش‌نامه‌ها', render: roleOnly(['manager', 'secretary', 'therapist'], (container) => {
  container.replaceChildren();
  location.hash = '#/case-event-types';
}) }); // ۱.۲۷.۳۴→۱.۲۷.۴۰ — ریدایرکت سازگاری
register('#/family-surveys', { title: 'نظرسنجی خانواده‌ها', render: managerOnly(lazyView(() => import('./views/family-surveys.js'), 'renderFamilySurveys', '#/family-surveys')) }); // ۱.۲۵.۶۰ — ماژول مستقل فقط-مدیر
register('#/special-needs', { title: 'نیازهای ویژه', render: roleOnly(['manager', 'secretary'], lazyView(() => import('./views/special-needs.js'), 'renderSpecialNeeds', '#/special-needs')) }); // لایهٔ دوم RBAC
// ۱.۲۵.۵۶ — روت مستقل «#/center-kpi» حذف شد؛ همان بلوک در انتهای تب «گزارش دوره» (#/reports) رندر می‌شود
// ۱.۲۵.۵۳ — روت «#/network-library» حذف شد؛ درخواست مستقیم این هش به نمای ۴۰۴ می‌رود
register('#/bug-report', { title: 'گزارش به پشتیبانی', render: lazyView(() => import('./views/bug-report.js'), 'renderBugReport', '#/bug-report') }); // ۱.۲۵.۵۷ — همهٔ همکاران؛ نام تازه

// مسیر ناشناخته به‌جای ریدایرکت بی‌صدا، نمای ۴۰۴ را رندر می‌کند (hash دست‌نخورده می‌ماند)
registerNotFound({ title: 'صفحه پیدا نشد', render: lazyView(() => import('./views/not-found.js'), 'renderNotFound', '#/404') }); /* ۱.۲۷.۷۳ — تنبل: global-search از بوت خارج ماند */

document.addEventListener('routechange', (e) => syncNav(e.detail.path, e.detail.notFound === true));

/* بازخورد فوری ناوبری: هایلایت منو و عنوان/نخود‌نان پیش از بارگذاری chunk و داده عوض شود
   (قبلاً تا کامل شدن render صبر می‌شد — روی نمای سنگین/شبکهٔ کند حس تأخیر می‌ساخت) */
window.addEventListener('hashchange', () => {
  syncNav(location.hash.replace(/^#\//, '') || 'dashboard');
});

/* ۱.۲۷.۷۳ — پالت سرچ تنبل: global-search از بوت خارج شد (سقف boot)؛ اولین ⌘K/کلیک/«/»
   ماژول را همان لحظه می‌آورد و پالت را باز می‌کند — دفعات بعد همان ماژول کش‌شده باز می‌کند. */
let gsPromise = null;
const lazySearch = () => {
  gsPromise = gsPromise ?? import('./global-search.js').then((m) => { m.initGlobalSearch(); return m; });
  return gsPromise.then((m) => m.openPalette());
};
document.getElementById('global-search-btn')?.addEventListener('click', lazySearch);
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'k') { e.preventDefault(); lazySearch(); return; }
  if (e.key === '/') {
    const t = e.target;
    const tag = t && t.tagName ? t.tagName.toLowerCase() : '';
    if (tag !== 'input' && tag !== 'select' && tag !== 'textarea' && !(t && t.isContentEditable)) { e.preventDefault(); lazySearch(); }
  }
});

installServerStatusPill(); // فاز A — نشانگر سربرگ «سرور محلی» (فقط پوستهٔ میز؛ حالت وب مخفی)

/* ۱.۲۷.۷۴ — wiring تم بازگشت (در sdt151 ناخواسته حذف شده بود — دکمهٔ روشن/تاریک مرده بود):
   تم اولیه + اتصال دکمهٔ سربرگ با paint آیکون */
initTheme();
bindThemeBtn(document.getElementById('theme-btn'));

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
  /* UX-ممیزی گلایهٔ ۵: آیتم فعال در دراور بلند دیده نمی‌شد — گروهش باز و به دید اسکرول می‌شود */
  const activeItem = sidebar.querySelector('.nav__item.is-active');
  if (activeItem) {
    activeItem.closest('details.nav__group')?.setAttribute('open', '');
    activeItem.scrollIntoView({ block: 'nearest' });
  }
  document.addEventListener('keydown', sidebarEsc);
});

document.getElementById('sidebar-close')?.addEventListener('click', closeSidebar); /* UX-ممیزی: دکمهٔ ✕ دراور موبایل */

const outlet = document.getElementById('outlet');
/* rust-f3 — توتوریال اولیه: هوک شروع فقط در پوستهٔ دسکتاپ (فلگ استاتیک ماژول تور هم پیش‌فرض خاموش است).
   در وب تولیدی گارد زیر هرگز true نمی‌شود → نه DOM، نه fetch، نه تغییر مسیر؛ حتی چانک تور fetch نمی‌شود.
   login.js پس از ورود location.reload() می‌زند → این فراخوانی روی بوتِ پس از نشست معتبر = «ورود نخست». */
loadCurrentUser().then((ok) => {
  if (!ok) return;
  /* ۱.۲۷.۸۶ — بنر اعلان‌ها فقط در پوستهٔ لاگین‌شده: بوتِ بی‌احراز دوبار ۴۰۱ می‌گرفت و بنرش هرگز
     دیده نمی‌شد (#ann-banner-root داخل shell پنهان است)؛ صفحهٔ ورود بنر public خودش را دارد */
  initAnnouncementBanners();
  start(outlet);
  updateWaitlistBadge();
  updateTodosBadge();
  armFirstRunCloudSetup(); // فاز C — هدایت یک‌بارهٔ اولین اجرا به ویزارد ابری (نرم و post-login؛ بوت را مسدود نمی‌کند)
  /* __CLOUD_SETUP_HOOK__ */
  /* rust-f7 — ویزار راه‌اندازی نخست فقط در پوستهٔ دسکتاپ؛ در وب چانک هرگز fetch نمی‌شود.
     توالی: ویزار اگر باز شد، توتوریال پس از «پایانِ» ویزار از داخل ماژول راه می‌افتد؛
     اگر ویزار باز نشد (تمام/رد شده)، توتوریال مستقیم ادامه می‌یابد. */
  if (globalThis.__DESKTOP_SHELL__ === true && session.user) {
    import('../../../src/cloud-setup/index.ts')
      .then((s) => s.maybeRunSetup(session.user))
      .catch(() => false)
      .then((setupRan) =>
        import('../../../src/tutorial/index.ts').then((m) => {
          if (setupRan !== true) void m.maybeStartTutorial(session.user);
        })
      )
      .catch(() => {});
  }
  /* __TUTORIAL_HOOK__ */
});

document.getElementById('user-chip').addEventListener('click', () => {
  if (session.user) logout();
});

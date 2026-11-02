import { el, errorState } from './ui.js';
import { setViewSignal } from './api.js';

const routes = [];

// نمای ۴۰۴ برای مسیرهای ناشناخته (پوسته/app.js آن را ثبت می‌کند؛ روتر از ماژول نماها بی‌خبر می‌ماند)
let notFoundRoute = null;

export function registerNotFound(route) {
  notFoundRoute = route;
}

export function register(pattern, view) {
  const keys = [];
  const regexStr = pattern
    .replace(/^#\//, '')
    .split('/')
    .map((seg) => {
      if (seg.startsWith(':')) {
        keys.push(seg.slice(1));
        return '([^/]+)';
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  routes.push({ regex: new RegExp(`^${regexStr}$`), keys, view });
}

export function navigate(hash) {
  if (location.hash === hash) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = hash;
  }
}

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart] = raw.split('?');
  const path = pathPart ?? '';
  const query = {};
  if (queryPart) {
    for (const pair of queryPart.split('&')) {
      const [k, v] = pair.split('=');
      if (k) query[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
    }
  }
  return { path, query };
}

/* هر رندر یک AbortController دارد؛ رندر بعدی قبلی را لغو می‌کند
   تا GETهای نمای مرده (ناوبری وسط لود) هدر رفت‌وبرگشت و پردازش نروند.
   renderSeq گارد نسل: رندر قدیمی‌تر اجازه ندارد اوتلتِ نمای جدید را پاک کند
   (خطای دیرهنگام نما قبلی → errorState روی نمای جدید نمی‌نشیند). */
let renderSeq = 0;
let viewAbort = null;

/* ۱.۱۳.۰ — تعویض نرم نماها (View Transitions API):
   قبلاً نمای قدیمی همان لحظهٔ کلیک قطع می‌شد و اسکلت/نمای جدید «می‌پرید» — حس بریدگی.
   اکنون اگر مرورگر پشتیبانی کند، کل تعویض داخل document.startViewTransition انجام می‌شود:
   · نمای قدیمی تا آماده‌شدن نمای جدید روی صفحه می‌ماند (بدون چشمکِ خالی)
   · فقط #outlet نام‌گذاری شده تا کراس‌فید شود؛ ریشه بی‌انیمیشن است → سایدبار/تاپ‌بار
     هیچ‌گاه در گذار نرمِ تعویض نلقک نمی‌زنند (تکمیل کار تثبیت ۱.۱۲.۰)
   · سقف VT_MAX_WAIT: در شبکهٔ کند تعویض رها می‌شود تا اسکلت به‌موقع دیده شود
   · مرورگر بدون پشتیبانی یا prefers-reduced-motion → همان مسیر قبلی (اسکلت + view-enter) */
const VT_MAX_WAIT = 1500;

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* نمایش یک نما در اوتلت: mount داخل VT صفحهٔ قدیمی را نگه می‌دارد و DOM را عوض می‌کند.
   خروجیِ mount هرگز خطا پرت نمی‌کند (خطا → errorState) تا updateCallbackDone نشکند. */
function mountView(outlet, seq, viewFn, ctx) {
  return async () => {
    const host = document.createElement('div');
    host.className = 'view-host';
    outlet.replaceChildren(host);
    const useVT = typeof document.startViewTransition === 'function' && !prefersReducedMotion();
    const renderP = Promise.resolve()
      .then(() => viewFn(host, ctx))
      .catch((err) => {
        if (seq !== renderSeq) return;
        outlet.replaceChildren(errorState(err, () => render(outlet)));
      })
      .then(() => {
        if (seq !== renderSeq) return;
        // با VT ورود نرم را خودِ کراس‌فید انجام می‌دهد؛ view-enter فقط برای مسیر fallback
        if (!useVT) host.classList.add('view-enter');
      });
    await Promise.race([renderP, sleepMs(VT_MAX_WAIT)]);
  };
}

export async function render(outlet) {
  const seq = ++renderSeq;
  viewAbort?.abort();
  viewAbort = new AbortController();
  setViewSignal(viewAbort.signal);

  const { path, query } = parseHash();
  for (const route of routes) {
    const match = path.match(route.regex);
    if (match) {
      const params = {};
      route.keys.forEach((k, i) => {
        params[k] = decodeURIComponent(match[i + 1]);
      });
      const ctx = { params, query, path };
      const mount = mountView(outlet, seq, route.view.render, ctx);
      if (typeof document.startViewTransition === 'function' && !prefersReducedMotion()) {
        const vt = document.startViewTransition(mount);
        await vt.updateCallbackDone.catch(() => {}); // خطاها داخل mount مدیریت شده‌اند
      } else {
        await mount();
      }
      if (seq !== renderSeq) return route.view;
      document.dispatchEvent(new CustomEvent('routechange', { detail: { path, view: route.view } }));
      return route.view;
    }
  }
  // مسیر خالی یعنی خانهٔ پنل: مثل قبل به داشبورد می‌رود
  if (!path) {
    navigate('#/dashboard');
    return null;
  }
  // هیچ مسیری match نشد → ۴۰۴ (بدون تغییر hash؛ لینک خراب در نوار آدرس می‌ماند)
  // همان چرخهٔ عمر نماها: replaceChildren → render → errorState → routechange
  if (!notFoundRoute) {
    navigate('#/dashboard'); // محافظ: اگر پوسته نمای ۴۰۴ را ثبت نکرده باشد (رفتار قدیمی)
    return null;
  }
  const ctx = { params: {}, query, path };
  const mount = mountView(outlet, seq, notFoundRoute.render, ctx);
  if (typeof document.startViewTransition === 'function' && !prefersReducedMotion()) {
    const vt = document.startViewTransition(mount);
    await vt.updateCallbackDone.catch(() => {});
  } else {
    await mount();
  }
  if (seq !== renderSeq) return notFoundRoute;
  document.dispatchEvent(new CustomEvent('routechange', { detail: { path, view: notFoundRoute, notFound: true } }));
  return notFoundRoute;
}

export function start(outlet) {
  window.addEventListener('hashchange', () => render(outlet));
  render(outlet);
}

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
      /* هر رندر host خودش را دارد؛ نمای مرده‌ای که دیر کامل شود در hostِ
         جدا‌شدهٔ خودش می‌نشیند و هرگز نمای زنده را بازنویسی نمی‌کند */
      const host = document.createElement('div');
      host.className = 'view-host';
      outlet.replaceChildren(host);
      const ctx = { params, query, path };
      try {
        await route.view.render(host, ctx);
      } catch (err) {
        if (seq !== renderSeq) return route.view;
        outlet.replaceChildren(errorState(err, () => render(outlet)));
      }
      if (seq !== renderSeq) return route.view;
      // A8 → : انیمیشن ورود روی پوستهٔ نمای جاری (همان زبان opacity+translateY)
      host.classList.add('view-enter');
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
  // همان چرخهٔ عمر نماها: replaceChildren → render → errorState → view-enter → routechange
  if (!notFoundRoute) {
    navigate('#/dashboard'); // محافظ: اگر پوسته نمای ۴۰۴ را ثبت نکرده باشد (رفتار قدیمی)
    return null;
  }
  const host = document.createElement('div');
  host.className = 'view-host';
  outlet.replaceChildren(host);
  const ctx = { params: {}, query, path };
  try {
    await notFoundRoute.render(host, ctx);
  } catch (err) {
    if (seq !== renderSeq) return notFoundRoute;
    outlet.replaceChildren(errorState(err, () => render(outlet)));
  }
  if (seq !== renderSeq) return notFoundRoute;
  // A8 → 
  host.classList.add('view-enter');
  document.dispatchEvent(new CustomEvent('routechange', { detail: { path, view: notFoundRoute, notFound: true } }));
  return notFoundRoute;
}

export function start(outlet) {
  window.addEventListener('hashchange', () => render(outlet));
  render(outlet);
}

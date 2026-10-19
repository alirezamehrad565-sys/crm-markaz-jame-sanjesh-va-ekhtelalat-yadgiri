/**
 * روتر hash-based نماها
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// router.js — روتر هشِ مینیمال: #/مسیر/پارامترها?key=value
// هیچ وابستگی‌ای جز ui.js ندارد؛ هر نما با register ثبت و با render رندر می‌شود.

import { el, errorState } from './ui.js';

const routes = [];

/**
 * ثبت یک نما با الگوی مسیر مثل «#/students/:id»
 * — بخش‌های «:پارامتر» به کلیدهای مسیر تبدیل و در ctx.params تحویل داده می‌شوند.
 */
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

/** ناوبری برنامه‌ای به یک هش — اگر همین هش فعال است، رویداد hashchange دستی صدا می‌شود */
export function navigate(hash) {
  if (location.hash === hash) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = hash;
  }
}

/** پارس هش جاری → {path, query} — query با & و = جدا می‌شود */
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

/** رندر ناو فعال در outlet — هنگام خطا، state خطا با دکمهٔ تلاش دوباره نمایش داده می‌شود */
export async function render(outlet) {
  const { path, query } = parseHash();
  for (const route of routes) {
    const match = path.match(route.regex);
    if (match) {
      const params = {};
      route.keys.forEach((k, i) => {
        params[k] = decodeURIComponent(match[i + 1]);
      });
      outlet.replaceChildren();
      const ctx = { params, query, path };
      try {
        await route.view.render(outlet, ctx);
      } catch (err) {
        outlet.replaceChildren(errorState(err, () => render(outlet)));
      }
      // انیمیشن ورود فقط روی ناوبری واقعی؛ رفرش‌های داخلی نما (مثل بورد ۳۰ثانیه‌ای) انیمیشن ندارند
      outlet.firstElementChild?.classList.add('view-enter');
      document.dispatchEvent(new CustomEvent('routechange', { detail: { path, view: route.view } }));
      return route.view;
    }
  }
  // هیچ الگویی نخورد → پیش‌فرض: داشبورد
  navigate('#/dashboard');
  return null;
}

/** شروع روتر — گوش‌دادن به hashchange + رندر اولیه */
export function start(outlet) {
  // m127 — رفتار نیتیو: هر ناوبری از بالای صفحه شروع می‌شود
  // (رفع کلیپ‌شدن سرصفحه/تولبار زیر topbar وقتی نمای قبلی اسکرول‌خورده بود)
  history.scrollRestoration = 'manual';
  window.addEventListener('hashchange', () => {
    document.scrollingElement.scrollTop = 0;
    render(outlet);
  });
  render(outlet);
}

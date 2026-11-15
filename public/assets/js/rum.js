// ═══════════════════════════════════════════════════════════════
// پایش کارایی از سوی کاربر (RUM)
// سنجه‌های Core Web Vitals (LCP · CLS · INP · FCP · TTFB) بی‌نام به
// /public/rum می‌روند — بدون شناسهٔ کاربر، بدون IP، بدون User-Agent
// (قانون PII در design.md §۶). تله‌متری هرگز نباید اپ را بشکند:
// هر خطا بی‌صدا بلعیده می‌شود و سقف سختِ ۸ بیکان در هر بارگذاری داریم.
// ═══════════════════════════════════════════════════════════════
import { onCLS, onFCP, onINP, onLCP, onTTFB } from '../vendor/web-vitals.attribution.js';

const ENDPOINT = '/public/rum';
const MAX_BEACONS = 8; // سقف ترافیک تله‌متری در هر بارگذاری صفحه

let sent = 0;
let navId = '';
try {
  navId = crypto.randomUUID ? crypto.randomUUID() : `nav-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
} catch {
  navId = `nav-${Date.now()}`;
}

function contextOf() {
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  let theme = 'light';
  try { theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'; } catch { /* پیش‌فرض روشن */ }
  let prm = false;
  try { prm = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { /* ناشناخته = false */ }
  return {
    path: (location.pathname + location.hash).slice(0, 300),
    viewport_w: window.innerWidth || 0,
    viewport_h: window.innerHeight || 0,
    conn: conn && conn.effectiveType ? String(conn.effectiveType).slice(0, 20) : null,
    device_memory: typeof navigator.deviceMemory === 'number' ? navigator.deviceMemory : null,
    prm,
    theme
  };
}

function send(metric) {
  if (sent >= MAX_BEACONS) return;
  sent += 1;
  const event = {
    metric: metric.name,
    value: Math.round(metric.value * 1000) / 1000,
    rating: metric.rating,
    nav_id: typeof metric.navigationId === 'string' && metric.navigationId ? metric.navigationId.slice(0, 64) : navId,
    ...contextOf()
  };
  const payload = JSON.stringify({ events: [event] });
  try {
    if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: 'application/json' }))) return;
  } catch { /* به روش جایگزین می‌رویم */ }
  try {
    fetch(ENDPOINT, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: payload }).catch(() => {});
  } catch { /* بی‌صدا — تله‌متری هیچ‌وقت اپ را نمی‌شکند */ }
}

export function initRum() {
  try {
    onTTFB(send);
    onFCP(send);
    onLCP(send);
    onCLS(send);
    onINP(send);
  } catch { /* بدون پایش هم اپ کار می‌کند */ }
}

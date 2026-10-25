/* ═══════════════════════════════════════════════════════════════
   m106 — Service Worker (PWA)
   سیاست کش، هم‌راستا با _headers:
     • /assets/img/* و /assets/fonts/*  → کش-اول (محتوای immutable؛ نسخه‌گذاری با ?v=)
     • /assets/js/* و /assets/css/*     → شبکه-اول (هماهنگی انتشار؛ کش فقط برای آفلاین)
     • ناوبری‌ها                         → شبکه-اول با بازگشت به پوستهٔ کش‌شده
     • /api/*                           → هیچ‌گاه دخالت نمی‌شود (هرگز کش نمی‌شود)
   نسخه‌گذاری: با هر انتشار VERSION را bump کنید تا کش‌های کهنه در activate پاک شوند.
   ═══════════════════════════════════════════════════════════════ */
const VERSION = 'v1.00.64';
const CACHE = `shell-${VERSION}`;
const IMMUTABLE = ['/assets/img/', '/assets/fonts/', '/assets/help/'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(['/manifest.webmanifest']))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function put(cacheName, req, res) {
  if (res && res.ok) {
    const copy = res.clone();
    caches.open(cacheName).then((c) => c.put(req, copy));
  }
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // دادهٔ زنده — هرگز کش
  if (url.pathname.startsWith('/downloads/')) return; // مرکز دانلود — بدون کش

  // ۱) دارایی‌های تغییرناپذیر → کش-اول
  if (IMMUTABLE.some((p) => url.pathname.startsWith(p))) {
    e.respondWith(
      caches.match(req).then((hit) =>
        hit || fetch(req).then((res) => put(CACHE, req, res))
      )
    );
    return;
  }

  // ۲) favicon و مانیفست → شبکه-اول با پشتیبان کش
  if (url.pathname === '/favicon.png' || url.pathname === '/favicon.svg' || url.pathname === '/manifest.webmanifest') {
    e.respondWith(
      fetch(req)
        .then((res) => put(CACHE, req, res))
        .catch(() => caches.match(req))
    );
    return;
  }

  // ۳) JS/CSS → شبکه-اول (پس از انتشار همیشه هماهنگ؛ کش فقط پشتیبان آفلاین)
  if (url.pathname.startsWith('/assets/js/') || url.pathname.startsWith('/assets/css/')) {
    e.respondWith(
      fetch(req)
        .then((res) => put(CACHE, req, res))
        .catch(() => caches.match(req))
    );
    return;
  }

  // ۴) ناوبری‌های SPA → شبکه-اول؛ آفلاین: پوستهٔ کش‌شده
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => put(CACHE, req, res))
        .catch(() =>
          caches.match(req).then((hit) => hit || caches.match('/'))
        )
    );
  }
});

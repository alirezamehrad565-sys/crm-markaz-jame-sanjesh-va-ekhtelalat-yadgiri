/* ═══════════════════════════════════════════════════════════════
   Service Worker (PWA)
   سیاست کش، هم‌راستا با _headers:
     • /assets/img/* و /assets/fonts/* و /assets/help/* → کش-اول (immutable؛ نام یا ?v= ثابت)
     • /assets/dist/* (باندل نام‌دار boot/chunkها) → شبکه-اول با پشتیبان کش (۱.۲۵.۲۷)
       چرا نه کش-اول؟ نام hashدار برای «محتوا» تغییرناپذیر است اما برای «موجودیت» نه —
       بیلد هر انتشار dist را از نو می‌سازد و hashهای قبلی از سرور حذف می‌شوند؛ کش-اول
       اینجا یعنی کلاینتِ عقب‌مانده به chunkهای 404 ارجاع می‌دهد (رگبار 404 پس از انتشار).
     • /assets/js/* و /assets/css/*     → شبکه-اول (منبع خام/dev؛ هماهنگی انتشار)
     • ناوبری‌ها                         → شبکه-اول با بازگشت به پوستهٔ کش‌شده
     • /api/*                           → هیچ‌گاه دخالت نمی‌شود (هرگز کش نمی‌شود)
   نسخه‌گذاری: با هر انتشار VERSION را bump کنید تا کش‌های کهنه در activate پاک شوند.
   ═══════════════════════════════════════════════════════════════ */
const VERSION = 'v1.25.57';
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

  // ۳) JS/CSS و باندل نام‌دار dist → شبکه-اول (هم‌گامی تضمین‌شده با نسخهٔ زنده؛
  //    کش فقط پشتیبان آفلاین — پس از انتشار هرگز chunk کهنه سرو نمی‌شود)
  if (url.pathname.startsWith('/assets/js/') || url.pathname.startsWith('/assets/css/') || url.pathname.startsWith('/assets/dist/')) {
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

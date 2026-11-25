/* page-boot.js — ۱.۲۷.۸۲ (security-007/ADR-004): گذارهای صفحهٔ لینک بازی از صفحهٔ رندر سرور
   به فایل بیرونی رفت تا CSP با script-src بدون unsafe-inline بسته شود. توکن از بلاک دادهٔ
   <script type="application/json" id="page-boot"> خوانده می‌شود (سمت سرور با safeJsonEmbed
   جاسازی امن شده) — توکن هرگز در کد اجرایی نیست. */
(function () {
  var dataEl = document.getElementById('page-boot');
  var TOKEN = dataEl ? JSON.parse(dataEl.textContent || 'null') : null;
  if (!TOKEN) return;
  function post(path, body) {
    return fetch('/api/m/' + TOKEN + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (r) { return r.json(); }).then(function () { location.reload(); })
      .catch(function () { location.reload(); });
  }
  var bind = function (id, path, body) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('click', function () { el.disabled = true; post(path, body); });
  };
  bind('btn-start', '/start');
  bind('btn-gate-open', '/parent-gate', {});
  bind('btn-gate-solve', '/parent-gate', { solve: true });
  var c1 = document.getElementById('btn-confirm1');
  if (c1) c1.addEventListener('click', function () { c1.disabled = true; post('/confirm'); });
})();

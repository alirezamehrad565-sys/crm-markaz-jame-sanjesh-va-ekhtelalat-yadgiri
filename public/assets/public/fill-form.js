/* fill-form.js — ۱.۲۷.۸۲ (security-007/ADR-004): منطق فرم «پرکردن رویداد» از صفحهٔ رندر سرور
   به فایل بیرونی رفت تا CSP با script-src بدون unsafe-inline بسته شود؛ total/token از بلاک
   دادهٔ <script type="application/json" id="fill-boot"> می‌آیند (جاسازی سمت سرور امن است). */
(function () {
  var dataEl = document.getElementById('fill-boot');
  if (!dataEl) return;
  var data = JSON.parse(dataEl.textContent || 'null') || {};
  var f = document.getElementById('f');
  var msg = document.getElementById('msg');
  var progText = document.getElementById('progText');
  var progFill = document.getElementById('progFill');
  var TOTAL = data.total || 0;
  var TOKEN = data.token || '';

  function updateProgress() {
    var answered = {};
    f.querySelectorAll('.item input[type=radio]:checked').forEach(function (r) { answered[r.name] = true; });
    var n = Object.keys(answered).length;
    progText.textContent = 'پاسخ داده‌شده: ' + String(n).replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[Number(d)]; })
      + ' از ' + String(TOTAL).replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[Number(d)]; });
    progFill.style.width = (TOTAL ? Math.round(n * 100 / TOTAL) : 0) + '%';
    return n;
  }
  f.addEventListener('change', function () { updateProgress(); });

  f.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var data = new FormData(f);
    var answers = {};
    document.querySelectorAll('#f .item input[type=radio]').forEach(function (radio) {
      var name = radio.name;
      if (data.get(name)) answers[name] = Number(data.get(name));
    });
    document.querySelectorAll('#f textarea.free').forEach(function (ta) {
      var v = (ta.value || '').trim();
      if (v) answers[ta.name] = v;
    });
    var missing = 0;
    document.querySelectorAll('#f .item').forEach(function (item) {
      if (item.classList.contains('item--free')) return; /* ۱.۲۵.۵۹ — فیلد آزاد اختیاری است */
      var has = item.querySelector('input[type=radio]:checked');
      item.classList.toggle('is-missing', !has);
      if (!has) missing += 1;
    });
    if (missing > 0) {
      var m = String(missing).replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[Number(d)]; });
      msg.className = 'msg err';
      msg.textContent = 'به ' + m + ' سؤال پاسخ نداده‌اید — سؤال‌های جامانده با رنگ سرخ مشخص شده‌اند.';
      var first = document.querySelector('#f .item.is-missing');
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    var btn = f.querySelector('.btn');
    btn.disabled = true;
    fetch(location.pathname, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TOKEN, answers: answers })
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (res.ok) {
          msg.className = 'msg ok';
          msg.textContent = 'پاسخ‌های شما ثبت شد. با تشکر از همراهی شما.';
          f.querySelectorAll('input, button').forEach(function (x) { x.disabled = true; });
          var p = document.getElementById('prog');
          if (p) p.style.display = 'none';
        } else {
          msg.className = 'msg err';
          msg.textContent = (res.j && res.j.error && res.j.error.message) || 'ثبت انجام نشد.';
          btn.disabled = false;
        }
      })
      .catch(function () { msg.className = 'msg err'; msg.textContent = 'خطای شبکه — دوباره تلاش کنید.'; btn.disabled = false; });
  });

  updateProgress();
})();

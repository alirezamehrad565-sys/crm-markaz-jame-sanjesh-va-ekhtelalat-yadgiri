/* preview-form.js — ۱.۲۷.۸۲ (security-007/ADR-004): منطق پیش‌نمایش فرم از دید خانواده از
   صفحهٔ رندر سرور به فایل بیرونی رفت تا CSP با script-src بدون unsafe-inline بسته شود؛
   token/definition/total از بلاک <script type="application/json" id="preview-boot"> می‌آیند. */
(function () {
  var dataEl = document.getElementById('preview-boot');
  if (!dataEl) return;
  var data = JSON.parse(dataEl.textContent || 'null') || {};
  var TOKEN = data.token || '';
  var DEFINITION = JSON.stringify(data.def ?? null); /* قرارداد قبلی: مصرف‌کننده JSON.parse(DEFINITION) */
  var f = document.getElementById('f');
  var msg = document.getElementById('msg');
  var progText = document.getElementById('progText');
  var progFill = document.getElementById('progFill');
  var TOTAL = data.total || 0;
  var FA = '۰۱۲۳۴۵۶۷۸۹';
  function fa(n) { return String(n).replace(/[0-9]/g, function (d) { return FA[Number(d)]; }); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

  function updateProgress() {
    var answered = {};
    f.querySelectorAll('.item input[type=radio]:checked').forEach(function (r) { answered[r.name] = true; });
    var n = Object.keys(answered).length;
    progText.textContent = 'پاسخ داده‌شده: ' + fa(n) + ' از ' + fa(TOTAL);
    progFill.style.width = (TOTAL ? Math.round(n * 100 / TOTAL) : 0) + '%';
  }
  f.addEventListener('change', updateProgress);

  f.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var data = new FormData(f);
    var answers = {};
    document.querySelectorAll('#f .item input[type=radio]').forEach(function (radio) {
      if (data.get(radio.name)) answers[radio.name] = Number(data.get(radio.name));
    });
    document.querySelectorAll('#f textarea.free').forEach(function (ta) {
      var v = (ta.value || '').trim();
      if (v) answers[ta.name] = v;
    });
    var missing = 0;
    document.querySelectorAll('#f .item').forEach(function (item) {
      if (item.classList.contains('item--free')) return;
      var has = item.querySelector('input[type=radio]:checked');
      item.classList.toggle('is-missing', !has);
      if (!has) missing += 1;
    });
    if (missing > 0) {
      msg.className = 'msg err';
      msg.textContent = 'به ' + fa(missing) + ' سؤال پاسخ نداده‌اید — سؤال‌های جامانده با رنگ سرخ مشخص شده‌اند.';
      var first = document.querySelector('#f .item.is-missing');
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    var btn = document.getElementById('submitBtn');
    btn.disabled = true;
    fetch('/public/case-events/preview/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TOKEN, definition: JSON.parse(DEFINITION), answers: answers })
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) {
          msg.className = 'msg err';
          msg.textContent = (res.j && res.j.error && res.j.error.message) || 'تحلیل انجام نشد.';
          btn.disabled = false;
          return;
        }
        showResult(res.j);
      })
      .catch(function () { msg.className = 'msg err'; msg.textContent = 'خطای شبکه — دوباره تلاش کنید.'; btn.disabled = false; });
  });

  function bandChip(band, color) {
    var cls = color === 'ok' || color === 'warn' || color === 'danger' ? color : 'none';
    return band ? '<span class="band ' + cls + '">' + esc(band) + '</span>' : '';
  }

  function showResult(j) {
    var parts = [];
    var a = j.analysis;
    if (a) {
      parts.push('<div class="result__score">نمرهٔ کل: ' + fa(a.score) + ' از ' + fa(a.maxScore ?? (a.total * 3)) + '</div>');
      parts.push('<div style="margin-bottom:12px">' + (bandChip(a.band, null) || '<span class="band none">بدون باند تحلیل</span>') + '</div>');
      if (a.subscaleScores && a.subscaleScores.length > 0) {
        parts.push('<div style="margin-bottom:6px;font-size:13px;font-weight:700">زیرمقیاس‌ها</div>');
        a.subscaleScores.forEach(function (s) {
          parts.push('<div class="sub-row"><span class="name">' + esc(s.name) + '</span><span>' + fa(s.score) + ' از ' + fa(s.max) + '</span>' + bandChip(s.band, s.color) + '</div>');
        });
      }
      if (a.flags && a.flags.length > 0) {
        parts.push('<div style="margin:10px 0 6px;font-size:13px;font-weight:700;color:#A12622">آیتم بحرانی (' + fa(a.flags.length) + ' مورد)</div>');
        a.flags.forEach(function (fl) {
          parts.push('<div style="font-size:13px;padding:3px 0">• ' + esc(fl.label) + '</div>');
        });
      }
      parts.push('<div style="margin-top:12px" class="interp">' + esc(a.interpretation) + '</div>');
      parts.push('<div style="margin-top:8px;font-size:12.5px;color:#5A5347">جمع‌بندی ثبت‌شده در پرونده: ' + esc(j.summary ?? '') + '</div>');
    } else {
      parts.push('<div class="band none">این قالب خانواده‌پرکن نیست — نمرهٔ خودکار فقط برای چک‌لیست خانواده ساخته می‌شود.</div>');
    }
    var pairs = [];
    var payload = j.payload ?? {};
    Object.keys(payload).forEach(function (k) {
      pairs.push('<div class="pair"><b>' + esc(payload[k].label) + ':</b><span>' + esc(payload[k].value) + '</span></div>');
    });
    parts.push('<div class="raw"><details><summary>دیتای خام فرم (' + fa(pairs.length) + ' فیلد)</summary>' + pairs.join('') + '</details></div>');
    document.getElementById('resultBody').innerHTML = parts.join('');
    f.style.display = 'none';
    document.getElementById('prog').style.display = 'none';
    var r = document.getElementById('result');
    r.classList.add('show');
    r.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  document.getElementById('againBtn').addEventListener('click', function () {
    fetch('/public/case-events/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TOKEN, definition: JSON.parse(DEFINITION) })
    }).then(function (r) { return r.text(); })
      .then(function (html) { document.open(); document.write(html); document.close(); });
  });

  var closeBtn = document.getElementById('closeBtn');
  if (closeBtn) closeBtn.addEventListener('click', function () { window.close(); });

  updateProgress();
})();

// page.ts — صفحهٔ سه‌حالتهٔ لینک (M1: اسکلت سرویس‌شدهٔ سمت سرور)
// M2 نمای کودک را با زمان‌اجرای بازی جایگزین می‌کند؛ این صفحه فقط گذارها را می‌راند و هیچ منبع بیرونی ندارد.
import type { PublicStateView } from './types';

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

function faNum(n: number): string {
  return String(n).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function page(model: PublicStateView, token: string, body: string): string {
  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>${esc(model.missionTitle || 'جلسهٔ بازی')}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #F7F3EA; color: #12384f; font-family: Tahoma, "Segoe UI", sans-serif;
         line-height: 1.9; -webkit-tap-highlight-color: transparent; }
  .wrap { max-width: 560px; margin: 0 auto; padding: 20px 14px 48px; }
  .card { background: #fff; border-radius: 16px; padding: 22px 18px; margin-top: 14px;
          box-shadow: 0 1px 3px rgba(18,56,79,.08); text-align: center; }
  .pill { display: inline-block; font-size: 12px; color: #1c5d80; background: #D9EDF7;
          border-radius: 999px; padding: 2px 12px; }
  h1 { font-size: 18px; margin: 10px 0 4px; }
  .muted { color: #8A8377; font-size: 13px; }
  button { display: block; width: 100%; border: 0; background: #229ED9; color: #fff;
           border-radius: 12px; padding: 15px; font-size: 16px; font-weight: 700; cursor: pointer;
           font-family: inherit; margin-top: 12px; min-height: 52px; }
  button:disabled { opacity: .6; }
  .msg { margin-top: 10px; font-size: 13px; min-height: 18px; }
</style>
</head>
<body>
<div class="wrap">${body}</div>
<script>
(function () {
  var TOKEN = ${JSON.stringify(token)};
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
  bind('btn-finish', '/finish');
  bind('btn-gate-open', '/parent-gate', {});
  bind('btn-gate-solve', '/parent-gate', { solve: true });
  var c1 = document.getElementById('btn-confirm1');
  if (c1) c1.addEventListener('click', function () { c1.disabled = true; post('/confirm'); });
})();
</script>
</body>
</html>`;
}

export function renderGamesPage(model: PublicStateView, token: string): string {
  const head = `<span class="pill">${esc(model.packageTitle || 'جلسهٔ درمانی')}</span>
    <h1>${esc(model.missionTitle || 'جلسهٔ بازی')}</h1>`;

  if (model.state === 'expired' || model.state === 'revoked') {
    return page(model, token, `<div class="card"><h1>این پیوند فعال نیست</h1>
      <p class="muted">اعتبار این پیوند به پایان رسیده یا باطل شده است. برای جلسهٔ بعد، پیام تازه دریافت می‌کنید.</p></div>`);
  }

  if (model.state === 'parent_pre') {
    return page(model, token, `<div class="card">${head}
      <p class="muted">درس کوتاه والد همین‌جا نمایش داده می‌شود (زیر ۲ دقیقه).</p>
      <p class="muted">گوشی را به کودک بدهید و کنارش بمانید.</p>
      <button id="btn-start" type="button">آمادهٔ شروع هستیم</button></div>`);
  }

  if (model.state === 'child_active') {
    return page(model, token, `<div class="card">${head}
      <p class="muted">نمایش بازی در این بخش اجرا می‌شود (فاز بعد).</p>
      <button id="btn-finish" type="button">امروز تمام شد!</button>
      <div class="msg muted">پایان جلسه همیشه با تصمیم کودک است.</div></div>`);
  }

  if (model.state === 'child_done') {
    return page(model, token, `<div class="card"><h1>امروز تمام شد!</h1>
      <p class="muted">گوشی را به مامان بده.</p>
      <button id="btn-gate-open" type="button">من مامان هستم</button></div>`);
  }

  if (model.state === 'parent_gate') {
    return page(model, token, `<div class="card"><h1>تأیید والد</h1>
      <p class="muted">برای بازکردن بازخورد، دکمه را تأیید کنید (نسخهٔ کامل: نگه‌داشتن ۲ ثانیه).</p>
      <button id="btn-gate-solve" type="button">تأیید</button></div>`);
  }

  if (model.state === 'parent_post') {
    const conf = model.adherenceConfirmed ? faNum(2) : faNum(1);
    return page(model, token, `<div class="card">${head}
      <p class="muted">بازخورد توصیفی این‌جا نمایش داده می‌شود: روند این هفته و یک جمله برای فردا.</p>
      <button id="btn-confirm1" type="button">تأیید انجام شد (${esc(conf)})</button>
      <div class="msg muted">با دومین تأیید، پایبندی امروز ثبت می‌شود.</div></div>`);
  }

  // closed — فقط خواندنی
  return page(model, token, `<div class="card"><h1>ثبت شد</h1>
    <p class="muted">پایبندی امروز ثبت شد. سپاس از همراهی شما.</p></div>`);
}

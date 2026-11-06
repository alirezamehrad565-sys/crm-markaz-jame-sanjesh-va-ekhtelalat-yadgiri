// page.ts — صفحهٔ سه‌حالتهٔ لینک (M1: گذارها · M2: پخش‌کنندهٔ کودک · فاز ۲ بازطراحی: پنج‌شِمال)
// این صفحه فقط گذارها را می‌راند و هیچ منبع بیرونی ندارد؛ دارایی‌های بازی از همان مبدأ با ?v= نسخه می‌آیند.
import { APP_VERSION } from '@core/version';
import type { PublicStateView, PreviewStateView } from './types';

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
  body { margin: 0; background: #F5F0E5; color: #153E50; font-family: 'Vazirmatn Play', 'Vazirmatn', Tahoma, sans-serif;
         line-height: 1.9; -webkit-tap-highlight-color: transparent; }
  .wrap { max-width: 560px; margin: 0 auto; padding: 20px 14px 48px; }
  .card { background: #fff; border-radius: 16px; padding: 22px 18px; margin-top: 14px;
          box-shadow: 0 1px 3px rgba(21,62,80,.08); text-align: center; }
  .pill { display: inline-block; font-size: 12px; color: #438C89; background: #F5F0E5;
          border: 1px solid #438C89; border-radius: 999px; padding: 2px 12px; }
  h1 { font-size: 18px; margin: 10px 0 4px; }
  .muted { color: #6E7B76; font-size: 13px; }
  button { display: block; width: 100%; border: 0; background: #153E50; color: #fff;
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
    // پخش‌کنندهٔ کودک (فاز ۲ بازطراحی) — حالت فقط در سرور است؛ رفرش = بازسازی همین صفحه از آیتم بعدی
    // پروتکل فقط از سرور می‌آید؛ کلاینت پارامتر را فقط از data-protocol می‌خواند — هاردکد ممنوع
    const hint = JSON.stringify(model.playHint ?? null);
    const protocol = JSON.stringify(model.playProtocol ?? null);
    return page(model, token, `<div id="play-root" class="play-root"
      data-token="${esc(token)}"
      data-kind="${esc(model.playGame ?? '')}"
      data-hint="${esc(hint)}"
      data-protocol="${esc(protocol)}">
      <div class="play-progress" aria-hidden="true"><div class="play-progress__bar" id="play-bar"></div></div>
      <div class="play-stage" id="play-stage"></div>
      <div class="play-bubble" id="play-bubble" hidden></div>
      <div class="play-basket" id="play-basket" aria-hidden="true">
        <svg class="play-basket__star" viewBox="0 0 120 124" aria-hidden="true"><path d="M60 8 L74 46 L115 46 L81 71 L94 112 L60 87 L26 112 L39 71 L5 46 L46 46 Z"/></svg>
        <span id="play-basket-count">۰</span>
      </div>
    </div>
    <link rel="stylesheet" href="/assets/play/play.css?v=${APP_VERSION}" />
    <script type="module" src="/assets/play/play.js?v=${APP_VERSION}"></script>`);
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

/**
 * صفحهٔ پیش‌نمایش فقط-پرسنلی (۱.۲۵.۲۰) — همان پوسته و همان موتور پخش‌کنندهٔ کودک؛
 * توکن کوتاه‌عمر جای احراز، بدون هیچ کلید پاسخی در DOM، صفر نوشتن.
 * توکن خالی/نامعتبر = کارت محترمانهٔ «فعال نیست» — نه خطای خام.
 */
export function renderPreviewPage(state: PreviewStateView | null, token: string): string {
  if (!state || !token) {
    return page(
      { state: 'expired', missionRef: '', missionTitle: 'پیش‌نمایش بازی', packageTitle: '', expiresAt: '' },
      '',
      `<div class="card"><h1>پیش‌نمایش فعال نیست</h1>
      <p class="muted">پیوند پیش‌نمایش منقضی شده یا شناخته نشد. از پنل «بازی‌ها» پیش‌نمایش تازه بگیرید (۳۰ دقیقه اعتبار).</p></div>`
    );
  }
  const hint = JSON.stringify(state.hint ?? null);
  const protocol = JSON.stringify(state.protocol ?? null);
  const body = `<span class="pill">پیش‌نمایش درمانگر · ${esc(state.packageTitle)}</span>
    <h1>${esc(state.missionTitle)}</h1>
    <p class="muted">اجرای آزمایشی برای آشنایی شما — هیچ داده‌ای ثبت نمی‌شود؛ با هر بازگشایی از نو اجرا می‌شود.</p>
    <div id="play-root" class="play-root"
      data-token="${esc(token)}"
      data-kind="${esc(state.game)}"
      data-hint="${esc(hint)}"
      data-protocol="${esc(protocol)}">
      <div class="play-progress" aria-hidden="true"><div class="play-progress__bar" id="play-bar"></div></div>
      <div class="play-stage" id="play-stage"></div>
      <div class="play-bubble" id="play-bubble" hidden></div>
      <div class="play-basket" id="play-basket" aria-hidden="true">
        <svg class="play-basket__star" viewBox="0 0 120 124" aria-hidden="true"><path d="M60 8 L74 46 L115 46 L81 71 L94 112 L60 87 L26 112 L39 71 L5 46 L46 46 Z"/></svg>
        <span id="play-basket-count">۰</span>
      </div>
    </div>
    <link rel="stylesheet" href="/assets/play/play.css?v=${APP_VERSION}" />
    <script type="module" src="/assets/play/preview.js?v=${APP_VERSION}"></script>`;
  // پوستهٔ مشترک صفحه — گذارهای لینک در پیش‌نمایش معنا ندارد و bindهایش بی‌اثر می‌مانند
  return page(
    { state: 'expired', missionRef: '', missionTitle: state.missionTitle, packageTitle: state.packageTitle, expiresAt: '' } as unknown as PublicStateView,
    token,
    body
  );
}

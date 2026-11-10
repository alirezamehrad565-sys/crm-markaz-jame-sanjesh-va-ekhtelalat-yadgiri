// page.ts — صفحهٔ سه‌حالتهٔ لینک (M1: گذارها · M2: پخش‌کنندهٔ کودک · فاز ۲ بازطراحی: پنج‌شِمال)
// این صفحه فقط گذارها را می‌راند و هیچ منبع بیرونی ندارد؛ دارایی‌های بازی از همان مبدأ با ?v= نسخه می‌آیند.
import { APP_VERSION } from '@core/version';
import { GAME_KIND_IDS } from './registry';
import type { PublicStateView, PreviewStateView } from './types';

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

function faNum(n: number): string {
  return String(n).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* پوستهٔ اختصاصی نوع‌بازی (G7/۱.۲۵.۴۳) — هر بازی فایل CSS خودش را می‌گیرد؛
   فقط برای نوع‌های شناخته‌شدهٔ رجیستری سرو می‌شود (نام مسیر از ورودی کاربر ساخته نمی‌شود) */
function skinLink(kind: unknown): string {
  const k = String(kind ?? '');
  return (GAME_KIND_IDS as readonly string[]).includes(k)
    ? `<link rel="stylesheet" href="/assets/play/skins/${k}.css?v=${APP_VERSION}" />`
    : '';
}

/* قهرمان کوچک هر نوع‌بازی برای کارت والد (۱.۲۵.۴۱) — همان وکتورهای درون‌کد پخش‌کننده؛
   هیچ دارایی بیرونی؛ نوع ناشناخته = ماهی کهربایی */
const KIND_FIGS: Record<string, string> = {
  gonogo: '<path d="M14 62 C26 40 52 30 76 40 L84 44 L102 32 L104 44 L98 60 L104 76 L102 88 L84 76 L76 80 C52 90 26 84 14 62 Z M46 40 Q58 20 72 38 Q58 34 50 44 Z M54 84 Q62 94 72 88 Q64 88 58 82 Z" fill="#E4AA46" stroke="#153E50" stroke-width="3" stroke-linejoin="round"/><path d="M80 52 a4.5 4.5 0 1 0 0.01 0 M72 46 Q66 58 72 70 M20 64 Q26 70 34 66" fill="none" stroke="#153E50" stroke-width="3" stroke-linecap="round"/>',
  numline: '<path d="M34 58 a28 22 0 1 0 56 0 a28 22 0 1 0 -56 0 M22 42 a9 9 0 1 0 0.01 0 M102 42 a9 9 0 1 0 0.01 0 M14 36 Q22 30 28 36 M96 36 Q102 30 110 36" fill="#D97C4F" stroke="#153E50" stroke-width="3" stroke-linejoin="round"/><path d="M52 48 a3.5 3.5 0 1 0 0.01 0 M72 48 a3.5 3.5 0 1 0 0.01 0 M52 40 L50 32 M72 40 L74 32 M58 58 Q62 62 66 58 M40 78 L32 90 M50 80 L46 94 M74 80 L78 94 M84 78 L92 90" fill="none" stroke="#153E50" stroke-width="3" stroke-linecap="round"/>',
  scan: '<path d="M14 62 C26 40 52 30 76 40 L84 44 L102 32 L104 44 L98 60 L104 76 L102 88 L84 76 L76 80 C52 90 26 84 14 62 Z" fill="#5E8FB8" stroke="#153E50" stroke-width="3" stroke-linejoin="round"/><path d="M80 52 a4.5 4.5 0 1 0 0.01 0 M72 46 Q66 58 72 70" fill="none" stroke="#153E50" stroke-width="3" stroke-linecap="round"/><path d="M60 8 L74 46 L115 46 L81 71 L94 112 L60 87 L26 112 L39 71 L5 46 L46 46 Z" fill="#E4AA46" stroke="#153E50" stroke-width="3" stroke-linejoin="round"/>',
  stroop: '<path d="M14 62 C26 40 52 30 76 40 L84 44 L102 32 L104 44 L98 60 L104 76 L102 88 L84 76 L76 80 C52 90 26 84 14 62 Z" fill="#9B7EDE" stroke="#153E50" stroke-width="3" stroke-linejoin="round"/><path d="M74 50 Q80 44 86 50 M20 60 Q28 72 40 66" fill="none" stroke="#153E50" stroke-width="3" stroke-linecap="round"/><circle cx="30" cy="18" r="8" fill="#D96C6C" stroke="#153E50" stroke-width="3"/><circle cx="92" cy="14" r="8" fill="#63B37F" stroke="#153E50" stroke-width="3"/>',
  flanker: '<path d="M14 62 C26 40 52 30 76 40 L84 44 L102 32 L104 44 L98 60 L104 76 L102 88 L84 76 L76 80 C52 90 26 84 14 62 Z" fill="#8FA6B8" stroke="#153E50" stroke-width="3" stroke-linejoin="round"/><path d="M80 52 a4.5 4.5 0 1 0 0.01 0" fill="none" stroke="#153E50" stroke-width="3"/><path d="M14 62 C26 40 52 30 76 40 L84 44 L102 32 L104 44 L98 60 L104 76 L102 88 L84 76 L76 80 C52 90 26 84 14 62 Z" transform="translate(-6 -38) scale(.62)" fill="#B9C6D2" stroke="#153E50" stroke-width="4" stroke-linejoin="round"/>',
  nback: '<path d="M34 58 a28 22 0 1 0 56 0 a28 22 0 1 0 -56 0" fill="#438C89" stroke="#153E50" stroke-width="3" stroke-linejoin="round"/><path d="M50 46 Q54 42 58 46 M66 46 Q70 42 74 46 M52 40 L50 32 M72 40 L74 32 M56 56 Q62 64 68 56" fill="none" stroke="#153E50" stroke-width="3" stroke-linecap="round"/><rect x="12" y="12" width="38" height="26" rx="4" fill="#E4AA46" stroke="#153E50" stroke-width="3"/><circle cx="31" cy="25" r="7" fill="#F5F0E5" stroke="#153E50" stroke-width="2.5"/>'
};

function kindFig(kind: unknown): string {
  const body = KIND_FIGS[String(kind ?? '')] ?? KIND_FIGS.gonogo;
  return '<svg class="play-kindfig" viewBox="0 0 120 124" aria-hidden="true">' + body + '</svg>';
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
  .stage-done { margin-top: 12px; }
  .stage-done__badge { display: inline-block; background: #F5F0E5; border: 1px solid #E4AA46;
    color: #153E50; border-radius: 999px; padding: 3px 14px; font-size: 13px; font-weight: 700; }
  .stage-done__stars { display: flex; gap: 10px; justify-content: center; margin: 14px 0 8px; }
  .stage-done__stars svg { width: 44px; height: 46px; }
  .stage-done__stars svg path { fill: #E9E2D0; stroke: #153E50; stroke-width: 2.5; stroke-linejoin: round; }
  .stage-done__stars svg.star--lit path { fill: #E4AA46; }
  @media (prefers-reduced-motion: no-preference) {
    .stage-done__stars svg.star--lit { animation: star-pop .5s cubic-bezier(.34,1.56,.64,1) backwards; }
    .stage-done__stars svg.star--lit:nth-child(2) { animation-delay: .14s; }
    .stage-done__stars svg.star--lit:nth-child(3) { animation-delay: .28s; }
  }
  @keyframes star-pop { from { transform: scale(.4); opacity: 0; } to { transform: scale(1); opacity: 1; } }
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
    // درس کوتاه والد (U8/G3): متن واقعی از parent_copy بستهٔ نسخه‌دار؛ نبود = متن پیش‌فرض ملایم
    const beforeFa = typeof model.parentCopyBefore === 'string' && model.parentCopyBefore.trim() !== ''
      ? model.parentCopyBefore.trim()
      : 'این بازی تمرین تمرکز و مهار است، نه درمان؛ نقش شما کنار ماندن و تشویق آرام است.';
    return page(model, token, `<div class="card">${head}
      ${kindFig(model.playGame)}
      <p class="muted">${esc(beforeFa)}</p>
      <p class="muted">گوشی را به کودک بدهید و کنارش بمانید.</p>
      <button id="btn-start" type="button">آمادهٔ شروع هستیم</button></div>`);
  }

  if (model.state === 'child_active') {
    // پخش‌کنندهٔ کودک (فاز ۲ بازطراحی) — حالت فقط در سرور است؛ رفرش = بازسازی همین صفحه از آیتم بعدی
    // پروتکل فقط از سرور می‌آید؛ کلاینت پارامتر را فقط از data-protocol می‌خواند — هاردکد ممنوع
    // فرادادهٔ مرحلهٔ فقط-تمرین (۱.۲۵.۲۲) — فقط وقتی مرحله واقعاً هست؛ ارزیابی هرگز این ویژگی را ندارد
    const hint = JSON.stringify(model.playHint ?? null);
    const protocol = JSON.stringify(model.playProtocol ?? null);
    const resume = JSON.stringify(model.playResume ?? null);
    const stageAttr = model.playStage
      ? ` data-stage="${esc(JSON.stringify(model.playStage))}"`
      : '';
    return page(model, token, `<div id="play-root" class="play-root"
      data-token="${esc(token)}"
      data-kind="${esc(model.playGame ?? '')}"
      data-title="${esc(model.missionTitle || '')}"
      data-hint="${esc(hint)}" data-resume="${esc(resume)}"${stageAttr}
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
    ${skinLink(model.playGame)}
    <script type="module" src="/assets/play/play.js?v=${APP_VERSION}"></script>`);
  }

  if (model.state === 'child_done') {
    // کارت پایان با ستاره‌های مرحله (۱.۲۵.۲۲) — فقط تمرین؛ لحن §۲: بی‌رقارت، بدون سرزنش، دعوت آرام
    const r = model.playStageResult;
    const STAR_PATH_D = 'M60 8 L74 46 L115 46 L81 71 L94 112 L60 87 L26 112 L39 71 L5 46 L46 46 Z';
    const stageCard = r ? `<div class="stage-done">
      <div class="stage-done__badge">مرحلهٔ ${faNum(r.index)} — ${esc(r.title_fa)}</div>
      <div class="stage-done__stars" role="img" aria-label="${faNum(r.stars)} ستاره از ${faNum(3)}">
        ${[1, 2, 3].map((i) => `<svg class="star${i <= r.stars ? ' star--lit' : ''}" viewBox="0 0 120 124" aria-hidden="true"><path d="${STAR_PATH_D}"/></svg>`).join('')}
      </div>
      <p class="muted">${r.passed ? 'این مرحله را کامل کردی!' : 'تمرین خوبی بود؛ دوباره بهش می‌رسیم.'}</p>
      ${r.passed && r.next_title_fa ? `<p class="muted">مرحلهٔ بعدی: ${esc(r.next_title_fa)} — فردا منتظرت است.</p>` : ''}
      ${r.stars_total > 0 ? `<p class="muted">مجموع ستاره‌های تو: ${faNum(r.stars_total)}</p>` : ''}
    </div>` : '';
    return page(model, token, `<div class="card"><h1>امروز تمام شد!</h1>${stageCard}
      <p class="muted">گوشی را به مامان بده.</p>
      <button id="btn-gate-open" type="button">من مامان هستم</button></div>`);
  }

  if (model.state === 'parent_gate') {
    return page(model, token, `<div class="card"><h1>تأیید والد</h1>
      <p class="muted">برای بازکردن بازخورد، دکمه را تأیید کنید (نسخهٔ کامل: نگه‌داشتن ۲ ثانیه).</p>
      <button id="btn-gate-solve" type="button">تأیید</button></div>`);
  }

  if (model.state === 'parent_post') {
    // پس‌گفت والد با محتوای واقعی (U8/G3): خلاصهٔ توصیفی هفته/امروز + جملهٔ فردا از بسته؛
    // توصیف رفتار است — هیچ عدد قضاوتی روبه‌والد نمی‌آید.
    const conf = model.adherenceConfirmed ? faNum(2) : faNum(1);
    const pp = model.parentPost;
    const postHtml = pp
      ? `<p class="muted">این هفته ${faNum(pp.sessions_week)} جلسه بازی آغاز شده است.</p>
         <p class="muted">امروز ${faNum(pp.attempts_today)} پاسخ ثبت شد؛ همهٔ قدم‌های کودک با همین لینک ادامه پیدا می‌کند.</p>
         <p class="muted">${esc(pp.tomorrow_fa)}</p>`
      : `<p class="muted">جلسهٔ امروز ثبت شد؛ سپاس از همراهی شما.</p>`;
    return page(model, token, `<div class="card">${head}
      ${postHtml}
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
      data-title="${esc(state.missionTitle)}"
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
    ${skinLink(state.game)}
    <script type="module" src="/assets/play/preview.js?v=${APP_VERSION}"></script>`;
  // پوستهٔ مشترک صفحه — گذارهای لینک در پیش‌نمایش معنا ندارد و bindهایش بی‌اثر می‌مانند
  return page(
    { state: 'expired', missionRef: '', missionTitle: state.missionTitle, packageTitle: state.packageTitle, expiresAt: '' } as unknown as PublicStateView,
    token,
    body
  );
}

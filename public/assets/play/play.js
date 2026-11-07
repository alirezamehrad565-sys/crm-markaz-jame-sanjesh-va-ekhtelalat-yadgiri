/* ═══════════════════════════════════════════════════════════════
   play.js — نقطهٔ ورود پخش‌کنندهٔ کودک (فاز ۳ بازطراحی / ۱.۲۵.۱۳)
   حالت فقط در سرور است؛ این ماژول فقط اتصال صفحه به موتور است.
   موتور در engine/: machine (۱۴-حالته) · timing (rAF) · response ·
   trials · session · scoring — دو حالت تمرین/ارزیابی از یک موتور.
   پروتکل فقط از data-protocol سرور می‌آید — هیچ هاردکدی این‌جا نیست.
   ساعت واکنش performance.now + rAF؛ پنهان‌شدن برگه همه‌چیز را مکث می‌کند.
   ═══════════════════════════════════════════════════════════════ */

const root = document.getElementById('play-root');
const stage = document.getElementById('play-stage');
const bubble = document.getElementById('play-bubble');
const bar = document.getElementById('play-bar');
const basketEl = document.getElementById('play-basket');
const countEl = document.getElementById('play-basket-count');

const TOKEN = root ? root.dataset.token : '';
const KIND = root ? (root.dataset.kind || '') : '';
const API = '/api/m/' + encodeURIComponent(TOKEN);

/* ─── لایهٔ شبکه: تک‌نقطهٔ شبکهٔ پخش‌کننده — یک تلاش دوباره، بعد پنل آرام (§۹) ─── */

async function requestJson(path, options) {
  const attempt = () => fetch(API + path, {
    method: options && options.method ? options.method : 'GET',
    headers: options && options.body ? { 'content-type': 'application/json' } : undefined,
    body: options && options.body ? JSON.stringify(options.body) : undefined,
    cache: 'no-store'
  });
  let res;
  try {
    res = await attempt();
  } catch (err) {
    await new Promise((r) => setTimeout(r, 1200));
    try { res = await attempt(); } catch (err2) { throw new Error('network'); }
  }
  if (!res.ok) throw new Error('http-' + res.status);
  const body = await res.json();
  /* پاکت استاندارد سامانه { data } — پخش‌کننده همیشه بارِ خودش را می‌گیرد */
  return body && typeof body === 'object' && 'data' in body ? body.data : body;
}

/* ─── پنل آرام شبکه — سرزنش ندارد؛ ادامه از نقطهٔ سرور ─── */

function calmPanel() {
  stage.className = 'play-stage play-stage--teach';
  stage.innerHTML =
    '<p class="play-line">اتصال قطع شد؛ نتیجهٔ این قسمت ثبت نشد.</p>' +
    '<p class="play-muted">اشکالی نداره؛ هر وقت اینترنت آمد دوباره تلاش می‌کنیم.</p>';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'play-btn';
  btn.textContent = 'تلاش دوباره';
  btn.addEventListener('click', () => {
    btn.disabled = true;
    location.reload(); // حالت از سرور می‌آید — رفرش = ادامهٔ جلسه از آیتم بعدی
  });
  stage.appendChild(btn);
}

/* ─── ماژول نوع‌بازی: بارگیری از kinds/ یا بازگشت به پخش‌کنندهٔ عام ─── */

const GENERIC = {
  previewSteps: () => [],
  stimSvg: () => '<div class="play-svg"></div>'
};

async function loadKind() {
  if (!KIND) return GENERIC;
  try {
    const mod = await import('./kinds/' + KIND + '.js');
    return {
      previewSteps: mod.previewSteps || GENERIC.previewSteps,
      stimSvg: mod.stimSvg || GENERIC.stimSvg,
      // جادهٔ عددها (۱.۲۵.۲۸) — توابع نمایش خط عددی (ماژول‌های دیگر این‌ها ندارند)
      numlineMarkup: mod.numlineMarkup || null,
      numlineValueFromTap: mod.numlineValueFromTap || null,
      numlinePlaceGuess: mod.numlinePlaceGuess || null,
      numlineRevealTruth: mod.numlineRevealTruth || null,
      numlineGuessPoint: mod.numlineGuessPoint || null,
      // حملهٔ جاسوس‌ها (۱.۲۵.۳۰) — توابع نمایش موج اسکن (ماژول‌های دیگر این‌ها ندارند)
      scanMarkup: mod.scanMarkup || null,
      scanRevealTruth: mod.scanRevealTruth || null,
      scanCatchPoint: mod.scanCatchPoint || null
    };
  } catch (err) {
    return GENERIC;
  }
}

/* ─── راه‌اندازی: پروتکل از سرور، موتور از engine/ ─── */

(async function run() {
  if (!root) return;

  /* پروتکل — اسنپ‌شات سرور (data-protocol)؛ خرابی → null و موتور با پیش‌فرض‌های امن */
  let protocol = null;
  try { protocol = JSON.parse(root.dataset.protocol || 'null'); } catch (err) { protocol = null; }

  /* راهنمای آموزشی سرور (فقط از آیتم‌های train ساخته شده؛ پروب هرگز لو نمی‌رود) */
  let hint = null;
  try { hint = JSON.parse(root.dataset.hint || 'null'); } catch (err) { hint = null; }

  /* فرادادهٔ مرحلهٔ فقط-تمرین (۱.۲۵.۲۲) — از سرور؛ ارزیابی هرگز ندارد */
  let stageMeta = null;
  try { stageMeta = JSON.parse(root.dataset.stage || 'null'); } catch (err) { stageMeta = null; }

  const kind = await loadKind();
  const { runSession } = await import('./engine/session.js');

  await runSession({
    root, stage, bubble, bar, basketEl, countEl,
    protocol,
    kind,
    hint,
    stageMeta,
    api: {
      nextItem: () => requestJson('/next-item'),
      submit: (body) => requestJson('/attempts', { method: 'POST', body }),
      finish: (body) => requestJson('/finish', { method: 'POST', body: body ?? {} })
    },
    onNetworkFail: calmPanel
  });
})();

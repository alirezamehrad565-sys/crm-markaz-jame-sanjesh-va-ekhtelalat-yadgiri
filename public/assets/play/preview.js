/* ═══════════════════════════════════════════════════════════════
   preview.js — پیش‌نمایش فقط-پرسنلی (۱.۲۵.۲۰)
   همان موتور و همان پنج‌شِمال پخش‌کنندهٔ کودک؛ تنها فرق: لایهٔ شبکه —
   تک‌نقطهٔ شبکه به /api/play/preview/ با توکن کوتاه‌عمر؛ هیچ نوشتنی
   وجود ندارد؛ کلید پاسخ فقط سمت سرور می‌ماند؛ پایان جلسه محلی است.
   ═══════════════════════════════════════════════════════════════ */

const root = document.getElementById('play-root');
const stage = document.getElementById('play-stage');
const bubble = document.getElementById('play-bubble');
const bar = document.getElementById('play-bar');
const basketEl = document.getElementById('play-basket');
const countEl = document.getElementById('play-basket-count');

const PTOKEN = root ? root.dataset.token : '';
const KIND = root ? (root.dataset.kind || '') : '';
const API = '/api/play/preview/' + encodeURIComponent(PTOKEN);
let cursor = 0; // موقعیت آیتم — کلاینت‌محور؛ دنبالهٔ سرور قطعی است (seed ثابت بسته)

/* ─── لایهٔ شبکه — همان یک‌تلاش‌دوبارهٔ پخش‌کننده (§۹)؛ درخواست /item/:n هم‌جایگاه idempotent است ─── */

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
  return body && typeof body === 'object' && 'data' in body ? body.data : body;
}

/* ─── پنل آرام شبکه — بی‌سرزنش؛ بازگشایی صفحه = اجرای تازه (هیچ چیزی ثبت نشده) ─── */

function calmPanel() {
  stage.className = 'play-stage play-stage--teach';
  stage.innerHTML =
    '<p class="play-line">اتصال قطع شد.</p>' +
    '<p class="play-muted">پیش‌نمایش هیچ داده‌ای ثبت نمی‌کند؛ صفحه را دوباره باز کنید.</p>';
}

/* ─── ماژول نوع‌بازی — همان بارگیری پویای پخش‌کنندهٔ کودک ─── */

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
      numlineGuessPoint: mod.numlineGuessPoint || null
    };
  } catch (err) {
    return GENERIC;
  }
}

/* ─── راه‌اندازی — پروتکل از data-protocol سرور؛ هاردکد ممنوع ─── */

(async function run() {
  if (!root) return;

  let protocol = null;
  try { protocol = JSON.parse(root.dataset.protocol || 'null'); } catch (err) { protocol = null; }
  let hint = null;
  try { hint = JSON.parse(root.dataset.hint || 'null'); } catch (err) { hint = null; }

  const kind = await loadKind();
  const { runSession } = await import('./engine/session.js');

  await runSession({
    root, stage, bubble, bar, basketEl, countEl,
    protocol,
    kind,
    hint,
    api: {
      nextItem: () => requestJson('/item/' + cursor).then((r) => {
        if (r && r.item) cursor += 1; // پایان دنباله (item=null) شمارنده را نمی‌راند
        return r;
      }),
      submit: (body) => requestJson('/feedback', { method: 'POST', body }),
      // پایان پیش‌نمایش محلی است — هیچ finish شبکه‌ای؛ رفرش صفحه = اجرای دوباره
      finish: async () => ({})
    },
    onNetworkFail: calmPanel
  });
})();

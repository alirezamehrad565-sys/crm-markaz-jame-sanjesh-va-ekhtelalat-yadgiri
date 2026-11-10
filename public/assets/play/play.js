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
    '<p class="play-muted">اشکالی نداره؛ هر وقت اینترنت آمد دوباره تلاش می‌کنیم.</p>' +
    '<p class="play-muted">مأموریت همین‌جا برایت مونده است؛ هر وقت برگردی از همین قدم ادامه پیدا می‌کند.</p>';
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

/* ─── ماژول نوع‌بازی: بارگیری از kinds/ یا بازگشت به پخش‌کنندهٔ عام ───
   (۱.۲۵.۴۵) گیت جهت حذف شد — عمودی و افقی هر دو اجرای واقعی‌اند؛ هیچ پوششی
   هیچ‌وقت بازی را نمی‌پوشاند. مکث فقط از پنهان‌شدن برگه (سمت session.js) */

const GENERIC = {
  previewSteps: () => [],
  stimSvg: () => '<div class="play-svg"></div>'
};

/* توابع نمایش عمومی — هر export که پسوند Markup/RevealTruth/ResponsePoint دارد
   برای نوع‌بازی هم‌نامش ثبت می‌شود (استروپ/فلانکر/رد پای دزد بدون شاخهٔ اختصاصی این‌جا) */
function collectKindHooks(mod) {
  const out = { markupFor: {}, revealFor: {}, pointFor: {} };
  for (const name of Object.keys(mod)) {
    const fn = mod[name];
    if (typeof fn !== 'function') continue;
    if (name.endsWith('Markup')) out.markupFor[name.slice(0, -'Markup'.length)] = fn;
    else if (name.endsWith('RevealTruth')) out.revealFor[name.slice(0, -'RevealTruth'.length)] = fn;
    else if (name.endsWith('ResponsePoint')) out.pointFor[name.slice(0, -'ResponsePoint'.length)] = fn;
  }
  return out;
}

async function loadKind() {
  if (!KIND) return GENERIC;
  try {
    const mod = await import('./kinds/' + KIND + '.js');
    const hooks = collectKindHooks(mod);
    return {
      previewSteps: mod.previewSteps || GENERIC.previewSteps,
      stimSvg: mod.stimSvg || GENERIC.stimSvg,
      ...hooks,
      // کارت INTRO — بسته‌بندی معرفی بازی (G3/۱.۲۵.۳۷): نام/قانون/دکمهٔ بزرگ؛ نبود = مدار قدیمی
      intro: mod.intro || null,
      // تمرین تعاملی «تا موفقیت» + خلاصهٔ پایان (۱.۲۵.۳۴ — اقتباس بستهٔ jsPsych go-nogo):
      // فقط ماژول‌هایی که این‌ها را صادر کنند (گونوگو)؛ بقیه undefined → مدار قدیمی موتور
      practiceInteractive: mod.practiceInteractive || null,
      debriefMarkup: mod.debriefMarkup || null,
      // جادهٔ عددها (۱.۲۵.۲۸) — توابع نمایش خط عددی (ماژول‌های دیگر این‌ها ندارند)
      numlineMarkup: mod.numlineMarkup || null,
      numlineValueFromTap: mod.numlineValueFromTap || null,
      numlinePlaceGuess: mod.numlinePlaceGuess || null,
      numlineRevealTruth: mod.numlineRevealTruth || null,
      numlineGuessPoint: mod.numlineGuessPoint || null,
      // حملهٔ جاسوس‌ها (۱.۲۵.۳۰) — توابع نمایش موج اسکن (ماژول‌های دیگر این‌ها ندارند)
      scanMarkup: mod.scanMarkup || null,
      scanRevealTruth: mod.scanRevealTruth || null,
      scanCatchPoint: mod.scanCatchPoint || null,
      // دو بازی حافظهٔ دنباله‌ای (G8/۱.۲۵.۴۸) — صدف‌های جادویی (corsi) و حباب‌های عدد (span)
      corsiMarkup: mod.corsiMarkup || null,
      corsiBeginRecall: mod.corsiBeginRecall || null,
      corsiRevealTruth: mod.corsiRevealTruth || null,
      corsiResponsePoint: mod.corsiResponsePoint || null,
      spanMarkup: mod.spanMarkup || null,
      spanBeginInput: mod.spanBeginInput || null,
      spanRevealTruth: mod.spanRevealTruth || null,
      spanResponsePoint: mod.spanResponsePoint || null
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

  /* فرادادهٔ ادامهٔ نرم جلسهٔ نیمه‌تمام (U7/G3) — از سرور؛ جلسهٔ تازه = null */
  let resume = null;
  try { resume = JSON.parse(root.dataset.resume || 'null'); } catch (err) { resume = null; }

  const kind = await loadKind();
  const { runSession } = await import('./engine/session.js');

  await runSession({
    root, stage, bubble, bar, basketEl, countEl,
    protocol,
    kind,
    hint,
    stageMeta,
    resume,
    api: {
      nextItem: () => requestJson('/next-item'),
      submit: (body) => requestJson('/attempts', { method: 'POST', body }),
      finish: (body) => requestJson('/finish', { method: 'POST', body: body ?? {} })
    },
    onNetworkFail: calmPanel
  });
})();

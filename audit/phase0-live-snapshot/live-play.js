/* ═══════════════════════════════════════════════════════════════
   play.js — پخش‌کنندهٔ کودک (M2/M3 / ۱.۲۵.۰۹)
   حالت فقط در سرور است؛ این ماژول فقط حلقهٔ «آیتم ← پاسخ ← بازخورد»
   را می‌راند. بدون تحلیل‌گر، بدون منبع بیرونی، بدون ارزیابی پویا (§۱۱).
   زمان واکنش با performance.now() از لحظهٔ نمایش تا لمس؛ پنهان‌شدن
   برگه ساعت را متوقف می‌کند و پنجرهٔ پاسخ ادامه می‌یابد (§۷).
   ۱.۲۵.۰۹ — کالیبراسیون بازیِ محسوس‌تر: سبد ستارهٔ مثبت (بدون رتبه و
   بدون شمارش پیاپی — قواعد لحن §۲)، آموزش سه‌گامی با پیشروی لمسی، و
   حالت پیش‌نمایشِ بدون شبکه برای «امتحان بسته» در پنل (M3) — در این
   حالت هیچ درخواستی به سرور نمی‌رود و هیچ رکوردی ثبت نمی‌شود.
   ═══════════════════════════════════════════════════════════════ */

const root = document.getElementById('play-root');
const stage = document.getElementById('play-stage');
const bubble = document.getElementById('play-bubble');
const bar = document.getElementById('play-bar');

const TOKEN = root ? root.dataset.token : '';
const KIND = root ? (root.dataset.kind || '') : '';
const API = '/api/m/' + encodeURIComponent(TOKEN);
/* حالت پیش‌نمایش پنل (M3): آیتم‌های آموزشی فقط-خواندنی؛ صفر درخواست شبکه */
const PREVIEW = root ? root.dataset.preview === '1' : false;

/* ثابت‌های زمانی — فاصلهٔ آیتم‌ها تصادفی ۱ تا ۱٫۵ ثانیه (سند محتوا بستهٔ ۳) */
const ISI_MIN_MS = 1000;
const ISI_MAX_MS = 1500;
const GAP_MS = 600;
const GAP_FEEDBACK_MS = 1600;
const STEP_AUTO_MS = 2600; /* آموزش: پیشروی لمسی؛ اگر لمس نشد، خودکار */
const STEP_TAP_MS = 350;
const REST_EVERY = 20; /* استراحت کوتاه بعد از هر بلوک ۲۰ آیتمی — کاردرمانگر */
const MILESTONE_EVERY = 5; /* هر ۵ ستاره یک تشویق کوچک */
const RETRY_DELAY_MS = 1200;

/* متن‌های بازخورد پیش‌نمایش — هم‌سان با متن‌های سرور؛ بدون سرزنش (§۲) */
const FB_OK = 'گرفتی!';
const FB_WITHHOLD = 'عالی، صبر کردی!';
const FB_RETRY = 'این یکی سخته؛ بیا با هم دوباره نگاهش کنیم.';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (min, max) => Math.floor(min + Math.random() * (max - min + 1));

/* ─── لایهٔ شبکه: یک تلاش دوباره، بعد پنل آرام (§۹: قطع‌شدن شبکه سرزنش ندارد) ─── */

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
    await sleep(RETRY_DELAY_MS);
    try { res = await attempt(); } catch (err2) { throw new Error('network'); }
  }
  if (!res.ok) throw new Error('http-' + res.status);
  const body = await res.json();
  /* پاکت استاندارد سامانه { data } — پخش‌کننده همیشه بارِ خودش را می‌گیرد */
  return body && typeof body === 'object' && 'data' in body ? body.data : body;
}

/* ─── کمک‌های رابط ─── */

function setStage(html, quiet) {
  stage.innerHTML = html;
  stage.classList.toggle('play-stage--quiet', quiet === true);
}

function card(line, muted) {
  return '<p class="play-line">' + line + '</p>' + (muted ? '<p class="play-muted">' + muted + '</p>' : '');
}

function bubbleShow(text, ms) {
  bubble.textContent = text;
  bubble.hidden = false;
  window.setTimeout(() => { bubble.hidden = true; }, ms);
}

function setProgress(done, total) {
  if (!bar || !total) return;
  const pct = Math.max(0, Math.min(100, Math.round((done / total) * 100)));
  bar.style.width = pct + '%';
}

/* ─── سبد ستاره — شمارش مثبت جمع‌آوری؛ نه رتبه، نه مقایسه، نه پیاپی (§۲) ─── */

const STAR_SVG = '<svg class="play-basket__star" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M12 2 L14.9 8.6 L22 9.3 L16.7 14 L18.2 21 L12 17.3 L5.8 21 L7.3 14 L2 9.3 L9.1 8.6 Z" ' +
  'fill="#F2C14E" stroke="#12384F" stroke-width="1.4" stroke-linejoin="round"/></svg>';

let starCount = 0;
let countEl = null;

function ensureTopbar() {
  if (!root || root.querySelector('.play-topbar')) return;
  const top = document.createElement('div');
  top.className = 'play-topbar';
  top.setAttribute('aria-hidden', 'true');
  if (bar) {
    const prog = document.createElement('div');
    prog.className = 'play-progress';
    prog.appendChild(bar);
    top.appendChild(prog);
  }
  const basket = document.createElement('div');
  basket.className = 'play-basket';
  basket.innerHTML = STAR_SVG + '<span class="play-basket__count" id="play-star-count">۰</span>';
  top.appendChild(basket);
  root.insertBefore(top, root.firstChild);
  countEl = top.querySelector('.play-basket__count');
}

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const faNum = (n) => String(n).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);

function starEarn() {
  starCount += 1;
  if (!countEl) return;
  countEl.textContent = faNum(starCount);
  countEl.classList.add('play-basket__count--pop');
  window.setTimeout(() => { if (countEl) countEl.classList.remove('play-basket__count--pop'); }, 320);
}

/* تشویق کوچک هر ۵ ستاره — فقط وقتی حبابِ بازخورد آزاد است؛ هیچ رقم پیاپی نمی‌گوید */
function milestoneMaybe() {
  if (starCount > 0 && starCount % MILESTONE_EVERY === 0 && bubble.hidden) {
    bubbleShow('ستاره‌ها داره جمع می‌شن! ایول!', 1100);
  }
}

/* لرزش بسیار کوتاه موفقیت — لمسی، بی‌صدا؛ روی دستگاه بی‌پشتیبان بی‌اثر */
function buzzOk() {
  try { if (navigator.vibrate) navigator.vibrate(12); } catch (err) { /* پشتیبان نمی‌خواهد */ }
}

function starsRowHtml() {
  let row = '';
  for (let i = 0; i < Math.min(starCount, 12); i += 1) row += STAR_SVG;
  return row ? '<div class="play-stars-row">' + row + '</div>' : '';
}

/* ─── ساعت واکنش با توقف روی پنهان‌شدن برگه ─── */
const clock = {
  acc: 0, last: 0, running: false,
  start() { this.acc = 0; this.last = performance.now(); this.running = true; },
  pause() { if (this.running) { this.acc += performance.now() - this.last; this.running = false; } },
  resume() { if (!this.running) { this.last = performance.now(); this.running = true; } },
  touch() { this.pause(); return Math.round(this.acc); }
};

/* ─── ماژول نوع‌بازی: بارگیری از kinds/ یا بازگشت به پخش‌کنندهٔ عام ─── */

const GENERIC = {
  windowMsOf: () => 1500,
  responseOf: (item, touched) => ({ touched: touched === true }),
  tutorialSteps: () => [],
  welcomeLine: 'وقتی آماده بودی، صفحه را لمس کن.',
  restLine: 'یک نفس عمیق بکش؛ هر وقت آماده بودی لمس کن.'
};

async function loadKind() {
  if (!KIND) return GENERIC;
  try {
    const mod = await import('./kinds/' + KIND + '.js');
    const steps = mod.tutorialSteps || (mod.previewSteps ? (hint) => mod.previewSteps(hint).map((s) => ({ ...s, badge: '' })) : GENERIC.tutorialSteps);
    return {
      windowMsOf: mod.windowMsOf || GENERIC.windowMsOf,
      responseOf: mod.responseOf || GENERIC.responseOf,
      tutorialSteps: steps,
      welcomeLine: mod.welcomeLine || GENERIC.welcomeLine,
      restLine: mod.restLine || GENERIC.restLine,
      stimSvg: mod.stimSvg
    };
  } catch (err) {
    return GENERIC;
  }
}

/* ─── انتظار پاسخ آیتم لمسی: لمس صفحه یا پایان پنجره ─── */

function waitTouchReport(windowMs) {
  return new Promise((resolve) => {
    const state = { timer: 0, remaining: windowMs, startedAt: 0, done: false };
    const finish = (touched) => {
      if (state.done) return;
      state.done = true;
      clearTimeout(state.timer);
      stage.removeEventListener('pointerdown', onTap);
      const rt = touched ? clock.touch() : null; // بدون لمس، زمان واکنش معنا ندارد (§۸)
      resolve({ touched, rt_ms: rt });
    };
    const onTap = () => finish(true);
    state.startedAt = performance.now();
    clock.start();
    stage.addEventListener('pointerdown', onTap);
    const arm = (ms) => { state.timer = setTimeout(() => finish(false), ms); };
    arm(state.remaining);
    currentPause = {
      pause() {
        if (state.done) return;
        clearTimeout(state.timer);
        state.remaining = Math.max(0, state.remaining - (performance.now() - state.startedAt));
        clock.pause();
      },
      resume() {
        if (state.done) return;
        state.startedAt = performance.now();
        clock.resume();
        arm(state.remaining);
      }
    };
  });
}

/* پاسخ گزینه‌ای — بدون پنجرهٔ زمانی؛ زمان واکنش تا لمس اندازه می‌گیرد */
function waitChoice(options) {
  return new Promise((resolve) => {
    clock.start();
    const wrap = document.createElement('div');
    wrap.className = 'play-options';
    options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'play-option';
      btn.textContent = opt.label;
      btn.addEventListener('click', () => {
        clock.touch();
        resolve({ response: { option: i }, rt_ms: Math.round(clock.acc) });
      });
      wrap.appendChild(btn);
    });
    stage.appendChild(wrap);
    currentPause = null;
  });
}

let currentPause = null;

document.addEventListener('visibilitychange', () => {
  if (!currentPause) return;
  if (document.hidden) currentPause.pause();
  else currentPause.resume();
});

/* ─── کارت‌های آرام ─── */

function showCard(html, tapToContinue) {
  return new Promise((resolve) => {
    setStage(html, !tapToContinue);
    if (!tapToContinue) { resolve(); return; }
    const onTap = () => {
      stage.removeEventListener('pointerdown', onTap);
      resolve();
    };
    stage.addEventListener('pointerdown', onTap);
  });
}

/* گام آموزش — پیشروی با لمس کودک؛ اگر لمس نکرد، خودکار ادامه (بدون فشار) */
function waitStepAdvance(html) {
  return new Promise((resolve) => {
    setStage(html, false);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      stage.removeEventListener('pointerdown', onTap);
      resolve();
    };
    const onTap = () => window.setTimeout(finish, STEP_TAP_MS); // لمس: مکث کوتاه تا گام دیده شود
    const timer = window.setTimeout(finish, STEP_AUTO_MS);
    stage.addEventListener('pointerdown', onTap);
    currentPause = {
      pause() { if (!done) clearTimeout(timer); },
      resume() { if (!done) timer && window.setTimeout(finish, STEP_AUTO_MS); }
    };
  });
}

function calmPanel(retry) {
  setStage(
    '<p class="play-line">اتصال قطع شد؛ نتیجهٔ این قسمت ثبت نشد.</p>' +
    '<p class="play-muted">اشکالی نداره؛ هر وقت اینترنت آمد دوباره تلاش می‌کنیم.</p>',
    true
  );
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'play-btn';
  btn.textContent = 'تلاش دوباره';
  btn.addEventListener('click', () => { btn.disabled = true; retry(); });
  stage.appendChild(btn);
}

/* ─── بازخورد ستاره‌دار یک آیتم (مشترک جلسهٔ واقعی و پیش‌نمایش) ───
   بازخورد فقط برای آیتم آموزشی است؛ پروب هیچ بازخوردی نمی‌گیرد (§۵). */

function rewardOf(correct, touched, isTouchItem) {
  if (!correct) return { star: false, line: FB_RETRY };
  if (isTouchItem && !touched) return { star: true, line: FB_WITHHOLD }; // بازداری درست
  return { star: true, line: FB_OK };
}

async function settleReward(correct, touched, isTouchItem, withBubble) {
  const r = rewardOf(correct, touched, isTouchItem);
  if (r.star) {
    starEarn();
    buzzOk();
    milestoneMaybe();
  }
  if (withBubble && r.line) {
    bubbleShow(r.line, GAP_FEEDBACK_MS);
    await sleep(GAP_FEEDBACK_MS);
  } else {
    await sleep(GAP_MS);
  }
}

/* ─── حلقهٔ پیش‌نمایش پنل (M3) — بدون هیچ درخواست شبکه و بدون ثبت ─── */

async function runPreview(kind) {
  let items = [];
  try { items = JSON.parse(root.dataset.items || '[]'); } catch (err) { items = []; }
  if (!Array.isArray(items) || items.length === 0) {
    setStage(card('این بسته آیتم آموزشی برای پیش‌نمایش ندارد'), false);
    return;
  }
  await showCard(card('حالت پیش‌نمایش بسته', 'بدون ثبت نتیجه — فقط برای امتحان'), true);
  for (const step of kind.tutorialSteps(root.dataset.hint ? JSON.parse(root.dataset.hint) : null)) {
    await waitStepAdvance(
      (step.badge ? '<p class="play-badge">' + step.badge + '</p>' : '') +
      (step.svg || '') +
      '<p class="play-line">' + step.line + '</p>'
    );
  }
  for (const item of items) {
    if (item.type !== 'touch_report') continue;
    await sleep(rand(ISI_MIN_MS, ISI_MAX_MS));
    setStage(kind.stimSvg ? kind.stimSvg(item.stim) : '', false);
    const out = await waitTouchReport(kind.windowMsOf(item));
    const correct = out.touched === (item.correct_touch === true);
    await settleReward(correct, out.touched, true, true);
  }
  setStage(
    '<p class="play-line">پیش‌نمایش تمام شد!</p>' +
    starsRowHtml() +
    '<p class="play-muted">این فقط یک نمایش آزمایشی بود؛ نتیجه‌ای ثبت نشد.</p>',
    true
  );
}

/* ─── جریان اصلی جلسهٔ واقعی ─── */

(async function run() {
  const kind = await loadKind();
  ensureTopbar();

  /* حالت پیش‌نمایش پنل: کوتاه، بی‌شبکه، بی‌ثبت — همان بازیِ کودک */
  if (PREVIEW) {
    await runPreview(kind);
    return;
  }

  /* ۱) سلام و شروع با نخستین لمس */
  await showCard(card('سلام!', 'برای شروع، صفحه را لمس کن'), true);

  /* ۲) آموزش سه‌گامی «این هدف است / این نه / آماده‌ای» — فقط از راهنمای آموزشی سرور */
  let hint = null;
  try { hint = JSON.parse(root.dataset.hint || 'null'); } catch (err) { hint = null; }
  for (const step of kind.tutorialSteps(hint)) {
    await waitStepAdvance(
      (step.badge ? '<p class="play-badge">' + step.badge + '</p>' : '') +
      (step.svg || '') +
      '<p class="play-line">' + step.line + '</p>'
    );
  }

  /* ۳) حلقهٔ مأموریت */
  let doneCount = 0;
  for (;;) {
    let next;
    try {
      next = await requestJson('/next-item');
    } catch (err) {
      calmPanel(() => run()); // از همان نقطه ادامه — حالت از سرور می‌آید
      return;
    }
    const item = next.item;
    setProgress(next.progress.done, next.progress.total);
    if (!item) break;

    if (doneCount > 0 && doneCount % REST_EVERY === 0) {
      await showCard(card('استراحت کوچولو', kind.restLine), true);
    }

    await sleep(rand(ISI_MIN_MS, ISI_MAX_MS));

    let outcome;
    const isTouch = item.type === 'touch_report';
    if (isTouch) {
      setStage(kind.stimSvg ? kind.stimSvg(item.stim) : '<div class="play-svg"></div>', false);
      outcome = await waitTouchReport(kind.windowMsOf(item));
      outcome.response = kind.responseOf(item, outcome.touched);
    } else if (item.type === 'choice' && Array.isArray(item.options) && item.options.length > 0) {
      setStage(item.prompt ? '<p class="play-line">' + item.prompt + '</p>' : '', false);
      outcome = await waitChoice(item.options);
    } else {
      /* نوع‌بازی‌های نسخه‌های بعدی (خط عددی و…) — امروز با تمامِ آرام تمام می‌شود */
      await showCard(card('این قسمت امروز آماده نیست', 'از دکمهٔ پایین جلسه را تمام می‌کنیم.'), false);
      break;
    }

    let fb;
    try {
      fb = await requestJson('/attempts', {
        method: 'POST',
        body: {
          item_id: item.id,
          response: outcome.response,
          rt_ms: outcome.rt_ms,
          idem_key: crypto.randomUUID()
        }
      });
    } catch (err) {
      calmPanel(() => run());
      return;
    }
    doneCount += 1;

    if (fb && fb.phase === 'train' && fb.message) {
      if (fb.correct === true) {
        starEarn();
        buzzOk();
        milestoneMaybe();
      }
      bubbleShow(fb.message, GAP_FEEDBACK_MS);
      await sleep(GAP_FEEDBACK_MS);
    } else {
      /* پروب: بدون بازخورد (§۵) — ستارهٔ خاموش برای پاسخ درست هم نمی‌گیریم تا پروب خلل‌ناپذیر بماند */
      await sleep(GAP_MS);
    }
  }

  /* ۴) پایانِ محترمانه — هیچ «یک دور دیگر» وجود ندارد (§۲) */
  setStage(
    '<p class="play-line">مأموریت امروز تمام شد. خسته نباشی!</p>' +
    starsRowHtml() +
    '<p class="play-muted">فردا هم یک مأموریت تازه داری.</p>',
    true
  );
  const finishBtn = document.createElement('button');
  finishBtn.type = 'button';
  finishBtn.className = 'play-btn';
  finishBtn.textContent = 'امروز تمام شد!';
  finishBtn.addEventListener('click', async () => {
    finishBtn.disabled = true;
    try {
      await requestJson('/finish', { method: 'POST', body: {} });
      location.reload(); // سرور حالت child_done را رندر می‌کند
    } catch (err) {
      calmPanel(async () => {
        try {
          await requestJson('/finish', { method: 'POST', body: {} });
          location.reload();
        } catch (err2) { calmPanel(() => {}); }
      });
    }
  });
  stage.appendChild(finishBtn);
})();

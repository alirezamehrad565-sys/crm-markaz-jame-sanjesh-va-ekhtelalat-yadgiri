/* ═══════════════════════════════════════════════════════════════
   play.js — پخش‌کنندهٔ کودک (M2 / ۱.۲۵.۰۸)
   حالت فقط در سرور است؛ این ماژول فقط حلقهٔ «آیتم ← پاسخ ← بازخورد»
   را می‌راند. بدون تحلیل‌گر، بدون منبع بیرونی، بدون ارزیابی پویا (§۱۱).
   زمان واکنش با performance.now() از لحظهٔ نمایش تا لمس؛ پنهان‌شدن
   برگه ساعت را متوقف می‌کند و پنجرهٔ پاسخ ادامه می‌یابد (§۷).
   ═══════════════════════════════════════════════════════════════ */

const root = document.getElementById('play-root');
const stage = document.getElementById('play-stage');
const bubble = document.getElementById('play-bubble');
const bar = document.getElementById('play-bar');

const TOKEN = root ? root.dataset.token : '';
const KIND = root ? (root.dataset.kind || '') : '';
const API = '/api/m/' + encodeURIComponent(TOKEN);

/* ثابت‌های زمانی — فاصلهٔ آیتم‌ها تصادفی ۱ تا ۱٫۵ ثانیه (سند محتوا بستهٔ ۳) */
const ISI_MIN_MS = 1000;
const ISI_MAX_MS = 1500;
const GAP_MS = 600;
const GAP_FEEDBACK_MS = 1600;
const PREVIEW_MS = 2000;
const REST_EVERY = 20; /* استراحت کوتاه بعد از هر بلوک ۲۰ آیتمی — کاردرمانگر */
const RETRY_DELAY_MS = 1200;

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

/* ساعت واکنش با توقف روی پنهان‌شدن برگه */
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
  previewSteps: (hint) => [],
  welcomeLine: 'وقتی آماده بودی، صفحه را لمس کن.',
  restLine: 'یک نفس عمیق بکش؛ هر وقت آماده بودی لمس کن.'
};

async function loadKind() {
  if (!KIND) return GENERIC;
  try {
    const mod = await import('./kinds/' + KIND + '.js');
    return {
      windowMsOf: mod.windowMsOf || GENERIC.windowMsOf,
      responseOf: mod.responseOf || GENERIC.responseOf,
      previewSteps: mod.previewSteps || GENERIC.previewSteps,
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

/* ─── جریان اصلی ─── */

(async function run() {
  const kind = await loadKind();

  /* ۱) سلام و شروع با نخستین لمس */
  await showCard(card('سلام!', 'برای شروع، صفحه را لمس کن'), true);

  /* ۲) پیش‌نمایش «این هدف است / این نه» — فقط از راهنمای آموزشی سرور */
  let hint = null;
  try { hint = JSON.parse(root.dataset.hint || 'null'); } catch (err) { hint = null; }
  for (const step of kind.previewSteps(hint)) {
    setStage(step.svg + '<p class="play-line">' + step.line + '</p>', true);
    await sleep(PREVIEW_MS);
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
    if (item.type === 'touch_report') {
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
      bubbleShow(fb.message, GAP_FEEDBACK_MS);
      await sleep(GAP_FEEDBACK_MS);
    } else {
      await sleep(GAP_MS);
    }
  }

  /* ۴) پایانِ محترمانه — هیچ «یک دور دیگر» وجود ندارد (§۲) */
  setStage(
    '<p class="play-line">مأموریت امروز تمام شد. خسته نباشی!</p>' +
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

/* ═══════════════════════════════════════════════════════════════
   engine/timing.js — لایهٔ زمان‌سنج (فاز ۳/۴ بازطراحی / ۱.۲۵.۱۳–۱۴)
   دفترچهٔ وظیفه §۴: performance.now مونوتنیک + requestAnimationFrame +
   مُهر زمانِ نمایشِ واقعی + شمارش افت فریم + ساعت قابل‌مکث روی visibilitychange.
   هیچ وعدهٔ دقتِ بی‌مبنایی نمی‌دهیم — هر چیزی که اندازه گرفتیم، ثبت می‌شود.
   ═══════════════════════════════════════════════════════════════ */

/** فریم بعدی با rAF — خروجی: مُهر زمان rAF (performance.now مبنای خود مرورگر) */
export function nextFrame() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame((ts) => resolve(ts));
    } else {
      // محیط بدون rAF (آزمون/node): یک tick منطقی — صادقانه با performance.now
      resolve(performance.now());
    }
  });
}

/** دو فریم — اطمینان paint واقعی پیش از شمارش زمان (رندر → کامپوزیت → نمایش) */
export async function afterPaint() {
  const t1 = await nextFrame();
  const t2 = await nextFrame();
  return t2;
}

/** آستانهٔ افت فریم: فریم بلندتر از ۳۴ms (دو فریم ۶۰Hz) = افت */
export const FRAME_DROP_THRESHOLD_MS = 34;

/** طبقه‌بندی خالص فاصلهٔ فریم‌ها — بدون DOM، آزمون طلایی دارد */
export function countFrameDeltas(deltas) {
  let drops = 0;
  let maxDelta = 0;
  for (const d of deltas) {
    if (d > maxDelta) maxDelta = d;
    if (d > FRAME_DROP_THRESHOLD_MS) drops++;
  }
  return { drops, maxDelta: Math.round(maxDelta) };
}

/**
 * پایش فریم‌ها — از start تا stop همهٔ فاصله‌های rAF جمع می‌شود؛
 * خروجی شواهد نمایش واقعی: { presentedAt, deltas, drops, maxDelta }.
 */
export function createFrameMonitor() {
  let last = null;
  const deltas = [];
  let presentedAt = null;
  let running = false;
  let stopped = false;

  function tick(ts) {
    if (!running || stopped) return;
    if (last !== null) {
      const d = ts - last;
      if (d >= 0 && d < 1000) deltas.push(d); // نماهای معلق (>۱ثانیه) به‌عنوان delta حساب نمی‌شود
    }
    last = ts;
    if (presentedAt === null) presentedAt = ts;
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(tick);
    else stopped = true; // محیط بدون rAF: یک نمونه کافی است
  }

  return {
    start() {
      running = true;
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(tick);
      else tick(performance.now());
    },
    /** مُهر واقعی نمایش — اولین فریم پس از start */
    presentedAt() { return presentedAt; },
    stop() {
      stopped = true;
      running = false;
      const { drops, maxDelta } = countFrameDeltas(deltas);
      return { presentedAt, deltas: deltas.length, drops, maxDelta };
    }
  };
}

/** ساعت قابل‌مکث واکنش — performance.now مونوتنیک؛ مکث روی visibilitychange */
export function createPausableClock() {
  let acc = 0;
  let last = 0;
  let running = false;
  return {
    start() { acc = 0; last = performance.now(); running = true; },
    pause() { if (running) { acc += performance.now() - last; running = false; } },
    resume() { if (!running) { last = performance.now(); running = true; } },
    touch() { this.pause(); return Math.round(acc); },
    get running() { return running; }
  };
}

/** خواب قابل‌مکث — برخلاف sleep خام، روی visibilitychange ادامه‌اش منطقی می‌ماند */
export function createSleeper(onPauseChange) {
  let timer = 0;
  let remaining = 0;
  let startedAt = 0;
  let resolveFn = null;
  let paused = false;

  function arm(ms) {
    timer = setTimeout(() => {
      timer = 0;
      if (resolveFn) { const r = resolveFn; resolveFn = null; r(); }
    }, ms);
  }

  return {
    sleep(ms) {
      return new Promise((resolve) => {
        resolveFn = resolve;
        remaining = ms;
        startedAt = performance.now();
        arm(ms);
      });
    },
    /** بی‌اثرکردن خواب در جریان — پس از پاسخ زودهنگام، شمارندهٔ پنجره یتیم نمی‌ماند */
    cancel() {
      if (timer !== 0) { clearTimeout(timer); timer = 0; }
      resolveFn = null;
      remaining = 0;
      paused = false;
    },
    pause() {
      if (paused || timer === 0) return;
      paused = true;
      clearTimeout(timer);
      timer = 0;
      remaining = Math.max(0, remaining - (performance.now() - startedAt));
      if (typeof onPauseChange === 'function') onPauseChange(true);
    },
    resume() {
      if (!paused) return;
      paused = false;
      startedAt = performance.now();
      if (remaining > 0) arm(remaining);
      else if (resolveFn) { const r = resolveFn; resolveFn = null; r(); }
      if (typeof onPauseChange === 'function') onPauseChange(false);
    },
    get paused() { return paused; }
  };
}

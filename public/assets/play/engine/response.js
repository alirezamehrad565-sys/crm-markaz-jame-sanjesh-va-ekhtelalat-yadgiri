/* ═══════════════════════════════════════════════════════════════
   engine/response.js — گردآورندهٔ پاسخ لمسی (فاز ۳ بازطراحی / ۱.۲۵.۱۳)
   دفترچهٔ وظیفه §۳: نخستین لمس = پاسخ اصلی؛ پاسخ زودتر از محرک (premature)
   و لمس‌های چندگانه (multiple) و لمس بیرون صحنه مستقل از UI ثبت می‌شوند.
   ماژول مستقل از بازی — گو/نوگو و بازی‌های آینده از همین می‌خوانند.
   ═══════════════════════════════════════════════════════════════ */

import { classifyTouch } from './machine.js';

/**
 * گردآورندهٔ لمس برای یک آزمون.
 *   getState(): () => حالت فعلی ماشین (STIMULUS/RESPONSE_WINDOW/…)
 *   clock: ساعت قابل‌مکث که در لحظهٔ نمایش محرک start شده (RT از مبنای نمایش)
 *   opts.canAnswer(): گیت پاسخ اصلی — فقط در پنجرهٔ پاسخ باز است
 *   opts.onTouch(kind, ts): مشاهده‌گر لمس‌های غیراصلی (premature/multiple/out_of_surface)
 *
 * خروجی:
 *   promise  → { touched, rt_ms, touch_count, touches }
 *   resolveNoResponse() → بستن پنجرهٔ بدون پاسخ (اُمیشن) — trials خودش هدایت می‌کند
 */
export function collectResponse(stage, getState, clock, opts = {}) {
  const canAnswer = typeof opts.canAnswer === 'function' ? opts.canAnswer : () => true;
  const onTouch = typeof opts.onTouch === 'function' ? opts.onTouch : null;

  let resolved = false;
  let answered = false;
  const touches = [];

  const cleanup = () => {
    stage.removeEventListener('pointerdown', onTapStage, true);
    document.removeEventListener('pointerdown', onTapDoc, true);
  };

  const finish = (result) => {
    if (resolved) return;
    resolved = true;
    cleanup();
    resolvePromise(result);
  };

  let resolvePromise;
  const promise = new Promise((resolve) => { resolvePromise = resolve; });

  const record = (kind, ts) => {
    touches.push({ kind, at: Math.round(ts) });
    if (onTouch && kind !== 'primary') onTouch(kind, Math.round(ts));
  };

  const handlePointer = (insideStage) => {
    if (resolved) return;
    const ts = performance.now();
    const kind = classifyTouch(getState(), { alreadyAnswered: answered, insideStage });
    record(kind, ts);
    if (kind !== 'primary' || answered || !canAnswer()) return;
    answered = true;
    clock.pause();
    const rt = Math.round(clock.acc);
    finish({ touched: true, rt_ms: Number.isFinite(rt) && rt >= 0 ? rt : null, touch_count: touches.length, touches });
  };

  const onTapStage = () => handlePointer(true);
  const onTapDoc = (ev) => {
    // لمس بیرون سطح صحنه — ثبت کیفیت، بی‌اثر برای پاسخ (ev.target داخل stage حباب می‌رسد)
    if (ev && ev.target && stage.contains(ev.target)) return;
    handlePointer(false);
  };

  stage.addEventListener('pointerdown', onTapStage, true);
  document.addEventListener('pointerdown', onTapDoc, true);

  return {
    promise,
    /** بستن پنجرهٔ بدون پاسخ — اُمیشن؛ لمس‌های ثبت‌شده در خروجی می‌مانند */
    resolveNoResponse() {
      if (resolved || answered) return;
      clock.pause();
      finish({ touched: false, rt_ms: null, touch_count: touches.length, touches });
    },
    /** بازبینی عمومی برای مکث ساعت حین visibility (پاسخ نیامده) */
    pauseClock() { if (!resolved) clock.pause(); },
    resumeClock() { if (!resolved && !clock.running) clock.resume(); },
    get resolved() { return resolved; }
  };
}

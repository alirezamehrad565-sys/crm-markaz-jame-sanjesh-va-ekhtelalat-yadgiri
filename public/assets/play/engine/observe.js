/* ═══════════════════════════════════════════════════════════════
   engine/observe.js — لایهٔ مشترک شواهد لمس/نمایش (G1 / ۱.۲۵.۳۵)
   پیش از این ماژول، پنج شاخهٔ خاص موتور (خط عددی · اسکن · انتخاب زمان‌دار ·
   رد · انتخاب) شواهد را صفرِ هاردکد می‌گذاشتند (P1-2 ممیزی M0) — موتور کیفیت
   برای ۵ بازی از ۶ ساختاراً کور بود. اکنون همهٔ شاخه‌ها از یک مشاهده‌گر مشترک
   می‌خوانند: طبقه‌بندی همان classifyTouch ماشین (قرارداد فاز ۳) + پایش فریم
   همان timing.js (قرارداد فاز ۴).
   مرز قرارداد: این لایه هیچ نمره‌ای نمی‌سازد و هیچ تصمیمی نمی‌گیرد —
   شواهد فقط رفتار داده را توصیف می‌کنند (§۷)؛ نمره همیشه سرور است (§۸).
   دفتر لمس خالص و بی‌DOM است (آزمون طلایی دارد)؛ نصب روی صفحه لایهٔ نازک جدا.
   ═══════════════════════════════════════════════════════════════ */

import { classifyTouch } from './machine.js';
import { createFrameMonitor } from './timing.js';

/**
 * دفتر لمس — خالص و بدون DOM.
 *   start()                 → آغاز ثبت (پنجرهٔ آزمون باز است)
 *   record(state, flags)    → یک لمس با وضعیت جاری ماشین طبقه‌بندی و ثبت می‌شود
 *   evidenceCounts()        → شمارنده‌ها در قرارداد فاز ۴ (premature/multiple/oos)
 *   events()                → رویدادهای touch_* با مُهر (همان قرارداد touch_report)
 * دفترِ متوقف، هیچ‌چیز ثبت نمی‌کند — پنجرهٔ آزمون بسته است.
 */
export function createTouchLedger() {
  const counts = { premature: 0, multiple: 0, out_of_surface: 0, primary: 0 };
  const events = [];
  let started = false;
  return {
    start() { started = true; },
    stop() { started = false; },
    record(state, { insideStage = true, alreadyAnswered = false } = {}) {
      if (!started) return null;
      const kind = classifyTouch(state, { alreadyAnswered, insideStage });
      counts[kind] += 1;
      events.push({ name: 'touch_' + kind, at: Math.round(performance.now()) });
      return kind;
    },
    /** صفرِ این‌جا صفرِ واقعی است، نه صفرِ هاردکد — قاعدهٔ «شواهد صفر ممنوع» (G1) */
    evidenceCounts() {
      return {
        premature_count: counts.premature,
        multiple_count: counts.multiple,
        out_of_surface_count: counts.out_of_surface
      };
    },
    touchCount() {
      return counts.premature + counts.multiple + counts.out_of_surface + counts.primary;
    },
    events() { return events.slice(); },
    get started() { return started; }
  };
}

/**
 * نصب مشاهده‌گر لمس روی صحنه + سند — همان الگوی دو-شنوندهٔ کپچر collectResponse؛
 * لمس صحنه و بیرون صحنه یک‌بار و بدون شمارش مضاعف ثبت می‌شود (لمس داخل صحنه
 * به شنوندهٔ سند نمی‌رسد). شنونده‌ها pass-through هستند — هیچ پاسخی را نمی‌بلعند.
 * خروجی: تابع بازپایانی — پایان پنجرهٔ آزمون باید شنونده‌ها را تخریب کند
 * (همان قاعدهٔ «تخریب شنونده» گردانندهٔ پاسخ).
 */
export function attachTouchEvidence(stage, ledger, getState, getAnswered) {
  const state = () => (typeof getState === 'function' ? getState() : null);
  const answered = () => (typeof getAnswered === 'function' ? getAnswered() === true : false);
  const onTapStage = () => {
    ledger.record(state(), { insideStage: true, alreadyAnswered: answered() });
  };
  const onTapDoc = (ev) => {
    if (ev && ev.target && stage.contains(ev.target)) return;
    ledger.record(state(), { insideStage: false, alreadyAnswered: answered() });
  };
  stage.addEventListener('pointerdown', onTapStage, true);
  document.addEventListener('pointerdown', onTapDoc, true);
  return () => {
    stage.removeEventListener('pointerdown', onTapStage, true);
    document.removeEventListener('pointerdown', onTapDoc, true);
  };
}

/**
 * پایش نمایش محرک برای شاخه‌های خاص — افت فریم واقعی به‌جای صفر هاردکد (P1-2).
 * start بلافاصله پس از نشاندن markup صدا می‌شود؛ خروجی تابع بازپایانی است که
 * در پایان آزمون آمار { presentedAt, deltas, drops, maxDelta } می‌دهد
 * (همان قرارداد مُهر نمایش trials).
 */
export function observeDisplayFrames() {
  const monitor = createFrameMonitor();
  monitor.start();
  return () => monitor.stop();
}

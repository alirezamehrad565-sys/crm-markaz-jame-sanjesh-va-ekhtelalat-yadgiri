/* ═══════════════════════════════════════════════════════════════
   engine/machine.js — ماشین حالت اجرای آزمون (فاز ۳ بازطراحی / ۱.۲۵.۱۳)
   دفترچهٔ وظیفه §۳: ماشین ۱۴-حالتهٔ مستقل از UI — IDLE…INVALID.
   گذارها فقط به‌جلو؛ PAUSED/INTERRUPTED مسیر استثنایی؛ INVALID پایان بد.
   هر گذار با meta ثبت می‌شود (مبنای رخدادهای آزمون فاز ۴ و کیفیت جلسه فاز ۷).
   ماژول خالص — بدون DOM و شبکه؛ در vitest هم آزمون می‌شود.
   ═══════════════════════════════════════════════════════════════ */

/** ۱۴ حالت دفترچهٔ وظیفه */
export const STATES = {
  IDLE: 'IDLE',
  INSTRUCTION: 'INSTRUCTION',
  DEMONSTRATION: 'DEMONSTRATION',
  PRACTICE: 'PRACTICE',
  READY: 'READY',
  FIXATION: 'FIXATION',
  STIMULUS: 'STIMULUS',
  RESPONSE_WINDOW: 'RESPONSE_WINDOW',
  INTER_TRIAL_INTERVAL: 'INTER_TRIAL_INTERVAL',
  BREAK: 'BREAK',
  COMPLETED: 'COMPLETED',
  PAUSED: 'PAUSED',
  INTERRUPTED: 'INTERRUPTED',
  INVALID: 'INVALID'
};

/** جدول گذارهای مجاز — هر چیز بیرون این جدول رد می‌شود */
const TRANSITIONS = {
  IDLE: ['INSTRUCTION'],
  INSTRUCTION: ['DEMONSTRATION', 'PRACTICE', 'READY', 'INTERRUPTED'],
  DEMONSTRATION: ['PRACTICE', 'READY', 'INTERRUPTED'],
  PRACTICE: ['FIXATION', 'BREAK', 'INTERRUPTED', 'PAUSED', 'READY', 'COMPLETED'],
  READY: ['FIXATION', 'BREAK', 'INTERRUPTED', 'COMPLETED'],
  FIXATION: ['STIMULUS', 'PAUSED', 'INTERRUPTED'],
  STIMULUS: ['RESPONSE_WINDOW', 'INTER_TRIAL_INTERVAL', 'PAUSED', 'INTERRUPTED'],
  RESPONSE_WINDOW: ['INTER_TRIAL_INTERVAL', 'PAUSED', 'INTERRUPTED'],
  INTER_TRIAL_INTERVAL: ['READY', 'PRACTICE', 'BREAK', 'COMPLETED', 'INTERRUPTED'],
  BREAK: ['READY', 'PRACTICE', 'INTERRUPTED'],
  PAUSED: ['READY', 'PRACTICE', 'FIXATION', 'STIMULUS', 'RESPONSE_WINDOW', 'INTER_TRIAL_INTERVAL', 'INTERRUPTED', 'INVALID'],
  INTERRUPTED: ['READY', 'INVALID'],
  COMPLETED: [],
  INVALID: []
};

export function isTerminalState(s) {
  return s === STATES.COMPLETED || s === STATES.INVALID;
}

/**
 * ماشین حالت — ایجاد، گذار گیت‌دار، تاریخچهٔ کامل.
 * onChange(state, from, meta) — همیشه پس از گذار موفق صدا می‌شود.
 */
export function createMachine(onChange) {
  let current = STATES.IDLE;
  /** @type {Array<{from:string,to:string,at:number,meta:object}>} */
  const history = [];
  const t0 = performance.now();

  function can(to) {
    return (TRANSITIONS[current] ?? []).includes(to);
  }

  function to(next, meta) {
    if (!can(next)) {
      throw new Error('گذار غیرمجاز ماشین حالت: ' + current + ' → ' + next);
    }
    const from = current;
    current = next;
    history.push({ from, to: next, at: Math.round(performance.now() - t0), meta: meta ?? null });
    if (typeof onChange === 'function') onChange(current, from, meta ?? null);
    return current;
  }

  function resumeTo(resumeState, meta) {
    // از PAUSED فقط به حالت‌های ازپیش مجازِ همان جدول برمی‌گردیم — گیت همان to()
    return to(resumeState, meta);
  }

  return {
    get state() { return current; },
    can,
    to,
    resumeTo,
    history: () => history.slice(),
    lastAt: () => (history.length ? history[history.length - 1].at : 0)
  };
}

/* ─── دسته‌بندی خالص رفتار لمس — آزمون‌پذیر بدون DOM ─── */

/**
 * طبقه‌بندی یک لمس نسبت به وضعیت آزمون (فاز ۳: premature/multiple/out-of-surface).
 *  · state در STIMULUS/RESPONSE_WINDOW → پاسخ اصلی
 *  · لمس پیش از STIMULUS (حین ISI/FIXATION) → premature
 *  · لمس پس از ثبت پاسخ اصلی در همان آزمون → multiple
 *  · لمس بیرون سطح صحنه → out_of_surface (بی‌اثر برای پاسخ، ثبت برای کیفیت)
 */
export function classifyTouch(state, { alreadyAnswered = false, insideStage = true } = {}) {
  if (!insideStage) return 'out_of_surface';
  if (alreadyAnswered) return 'multiple';
  if (state === STATES.STIMULUS || state === STATES.RESPONSE_WINDOW) return 'primary';
  return 'premature';
}

/** پنجرهٔ پاسخ آزمون — پروتکل اول؛ override آیتم (سازگاری بسته‌های موجود).
 *  کلید پاسخ (گو بودن) هرگز به کلاینت نمی‌رسد — پنجرهٔ نوگو = پنجرهٔ گو است
 *  (هر دو باند هم‌طول‌اند)؛ اگر روزی تفکیک شد، سرور باید بدون افشای کلید مدیریتش کند. */
export function windowMsFor(item, protocol) {
  const p = protocol && protocol.params ? protocol.params : {};
  const go = typeof p.response_window_go_ms === 'number' ? p.response_window_go_ms : 1500;
  const override = item && item.stim && typeof item.stim.window_ms === 'number'
    ? item.stim.window_ms : null;
  const w = override !== null ? override : go;
  return w > 300 && w < 8000 ? w : go;
}

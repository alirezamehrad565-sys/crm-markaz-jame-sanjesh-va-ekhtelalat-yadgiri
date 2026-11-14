// scripts/engine/games-watchdog.mjs — ماشین وضعیت خالص واچ‌داگ ورکر بازی‌ها (ENG-4 — پورت دوم)
//
// آینهٔ engine_watchdog.rs در سمت node: همان فلسفهٔ بک‌آف ۲/۵/۱۰ ثانیه، کاپ ۳ تلاش در پنجرهٔ
// ۱۰ دقیقه‌ای، بازنشانی پنجره از نخستین خرابیِ رشتهٔ فعلی. تصمیم خالص است (بدون I/O و بدون
// ساعت دیواری — زمان‌ها ورودی‌اند) تا همان پذیرش‌های critique آزمون‌پذیر بماند.
//
// واقعیت معماری (گزارش ENG-4): «ورکر بازی‌ها» یک سرویس جدا در همان پروسهٔ workerd است
// (پورت دوم ۸۷۸۸ — socket «games» در کانفیگ capnp). یعنی مرگ آن به‌صورت پروسه رخ نمی‌دهد؛
// نشانهٔ مرگ آن «ناسالم‌ماندن پایش /health پورت بازی‌ها با سالم‌ماندن پورت اصلی» است و تنها
// مکانیزم ری‌استارت موجود، راه‌اندازی دوبارهٔ کل workerd است (workerd ری‌استارت سرویسی
// تک‌سرویس ندارد). این ماژول فقط «تصمیم» را می‌دهد؛ اجرا با ناظر engine.mjs است.

/** سیاست — همان مقادیر engine_watchdog.rs (WatchdogPolicy::default) */
export const GAMES_WATCHDOG_POLICY = {
  backoffs_ms: [2_000, 5_000, 10_000],
  max_attempts: 3,
  window_ms: 10 * 60_000,
};

/** چند شکست پیاپیِ پایش بازی‌ها پیش از آنکه «مرگ» تلقی شود — پایش هر ۵ ثانیه؛ دوبار = ~۱۰ ثانیه */
export const GAMES_FAIL_THRESHOLD = 2;

/** تصمیم خالص پس از مرگ/خرابی — ترتیب بررسی: بازنشانی پنجره ← سقف تلاش ← انتظار بعدی */
export function nextAction(history, nowMs, failureAtMs) {
  const p = GAMES_WATCHDOG_POLICY;
  const first = history.length > 0 ? Math.min(...history.map((r) => r.at_ms)) : null;
  if (first === null) return { kind: 'restart', delay_ms: p.backoffs_ms[0] };
  if (nowMs - first > p.window_ms || failureAtMs - first > p.window_ms) {
    return { kind: 'reset_window' };
  }
  if (history.length >= p.max_attempts) return { kind: 'give_up' };
  const idx = Math.min(history.length, p.backoffs_ms.length - 1);
  return { kind: 'restart', delay_ms: p.backoffs_ms[idx] };
}

/** آینهٔ WatchdogEvent — بدون تغییر enum سمت Rust (lib.rs همان قرارداد قبلی را می‌خواند) */
export function eventsFor(action, attempt) {
  if (action.kind === 'restart') return { name: 'games:restarting', attempt, delay_ms: action.delay_ms };
  if (action.kind === 'reset_window') return { name: 'games:reset_window' };
  return { name: 'games:down', attempts: attempt };
}

/** پیام انسانی ری‌استارت — «ورکر بازی‌ها ری‌استارت شد (تلاش K)» با رقم فارسی */
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const faNum = (n) => String(n).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);

export function restartMessage(attempt) {
  return `ورکر بازی‌ها ری‌استارت شد (تلاش ${faNum(attempt)})`;
}

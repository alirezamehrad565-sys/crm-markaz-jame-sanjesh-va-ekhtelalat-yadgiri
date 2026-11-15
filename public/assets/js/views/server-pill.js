/**
 * فاز A — لایهٔ بوت نشانگر «سرور محلی»: نگاشت خالص FSM موتور + feed مشترک وضعیت (طرح §۱).
 *
 * چرا جداست؟ (۱.۲۷.۰۸) pill سربرگ باید از لحظهٔ بوت وضعیت را ببیند — اما health-panel.js
 * (کارت سرور + کارت اتصال ابری + کل پنل سلامت) نباید در گراف بوت باشد (گیت بودجهٔ کارایی:
 * boot_js_gz/eager_modules). پس این سه‌تاییِ لازمِ pill با وابستگی‌های خالصش به همین
 * ماژول کوچکِ بی-واردات آمد و app.js فقط همین را استاتیک import می‌کند؛ خود پنل سلامت
 * همان‌طور که قبل‌تر بود با import پویای مسیر روت (#/health-panel) lazy می‌ماند و
 * health-panel.js همین نام‌ها را برای سازگاری آزمون‌ها/پین‌ها re-export می‌کند.
 *
 * قرارداد پوسته ↔ فرانت (دست‌نخورده): رویداد engine:status + فرمان invoke: engine_status /
 * engine_restart / open_data_dir — پاکت JSON: {state, port, gamesPort, startedAtUnix,
 * lastEventAtUnix, degradedReason, appVersion}. حالت‌ها = واژگان واقعی lib.rs:
 * Booting/Ready/Degraded/Failed/Restarting (+ Validating/Starting/Recovering از قرارداد §۱-۱
 * برای آینده). لایهٔ اول در boot-dist/index.html (pill بوت — id: boot-server-pill)؛ لایهٔ دوم
 * کارت «سرور محلی» پنل سلامت است که از health-panel.js با همین feed می‌نشیند.
 * همه‌چیز گاردشده است: بیرون پوستهٔ دسکتاپ (مرورگر/آزمون) feed به «حالت وب» می‌افتد و
 * SPA هرگز نمی‌شکند — الگوی installEngineWatchdogBanner.
 */

const SERVER_STATE_VIEWS = {
  Ready: { badge: 'badge--success', dot: 'dot--success', label: 'سرور محلی در حال اجرا' },
  Degraded: { badge: 'badge--warning', dot: 'dot--warning', label: 'سرور محلی ناتمام' },
  Failed: { badge: 'badge--error', dot: 'dot--error', label: 'سرور بالا نیامد' },
  // «در حال راه‌اندازی…» — زردِ ملایم پالت (بج هشدار)؛ خاکستریِ خنثی فقط برای «وضعیت نامشخص» نگه داشته شده
  Booting: { badge: 'badge--warning', dot: 'dot--warning', label: 'در حال راه‌اندازی…' },
  Validating: { badge: 'badge--warning', dot: 'dot--warning', label: 'در حال راه‌اندازی…' },
  Starting: { badge: 'badge--warning', dot: 'dot--warning', label: 'در حال راه‌اندازی…' },
  // طرح §۱-۳: قرمز Failed/Recovering — موتور هنوز در دسترس نیست تا بازیابی تمام شود
  Recovering: { badge: 'badge--error', dot: 'dot--error', label: 'در حال بازیابی…' },
  // Restarting = حالت واقعی سورسِ امروز (رویداد engine:restarting نگهبان در lib.rs) — زرد
  // «در حال بازیابی…»، هم‌لحن با بنر نگهبان (engine:restarting در EXP-4 بالای همین فایل)
  Restarting: { badge: 'badge--warning', dot: 'dot--warning', label: 'در حال بازیابی…' }
};

const SERVER_STATE_UNKNOWN = { badge: 'badge--neutral', dot: 'dot--neutral', label: 'وضعیت نامشخص' };

const DEGRADED_REASON_VIEWS = {
  games_unhealthy: 'ورکر بازی‌ها ناسالم'
};

/** دلیل Degraded → فارسی؛ دلیل ناشناخته/غایب → «دلیل نامشخص» (تابع خالص جدای خودش) */
export function degradedReasonView(reason) {
  return DEGRADED_REASON_VIEWS[reason] ?? 'دلیل نامشخص';
}

/**
 * فاز A — حالت FSM موتور → برچسب فارسی/کلاس رنگ (تابع خالص — بدون DOM؛ الگوی syncStateView).
 * Ready سبز «سرور محلی در حال اجرا»؛ Degraded زرد با دلیل فارسی؛ Failed قرمز «سرور بالا نیامد»؛
 * Booting/Validating/Starting «در حال راه‌اندازی…» زرد؛ Recovering قرمز و Restarting زرد
 * «در حال بازیابی…»؛ حالت ناشناخته/غایب → خنثی «وضعیت نامشخص» بی‌کرش.
 */
export function serverStateView(state, degradedReason) {
  const base = SERVER_STATE_VIEWS[state] ?? SERVER_STATE_UNKNOWN;
  if (state === 'Degraded') {
    return { ...base, label: `${base.label} — ${degradedReasonView(degradedReason)}` };
  }
  return base;
}

/** پاکت رویداد/فرمان وضعیت → پاک‌سازی‌شده؛ پاکت ناآشنا (هیچ فیلد شناخته) → null (الگوی unwrapQuota) */
export function unwrapEngineStatus(payload) {
  const raw = payload && typeof payload === 'object' ? payload : null;
  if (!raw) return null;
  const known = ['state', 'port', 'gamesPort', 'startedAtUnix', 'lastEventAtUnix', 'degradedReason', 'appVersion']
    .some((k) => k in raw);
  return known ? raw : null;
}

const SERVER_STATUS_POLL_MS = 30_000; // بازخوانی ۳۰ثانیه‌ای — هم‌ریتم دوپینگ نگه‌دارندهٔ پوسته (طرح §۱-۱)
const SERVER_STATUS_EVENT = 'engine:status';
const SERVER_STATUS_COMMAND = 'engine_status';

let serverStatusFeedInstalled = false;
let serverStatusFeedTimer = null;
let lastServerStatusPayload = null;
const serverStatusCallbacks = new Set();

function notifyServerStatus(payload) {
  const clean = unwrapEngineStatus(payload);
  if (!clean) return; // پاکت ناآشنا — وضعیت قبلی دست‌نخورده می‌ماند
  lastServerStatusPayload = clean;
  for (const cb of [...serverStatusCallbacks]) {
    try { cb(clean); } catch { /* شنوندهٔ خراب هرگز feed را نمی‌کشد */ }
  }
}

async function pollEngineStatusOnce(invokeFn) {
  try {
    notifyServerStatus(await invokeFn(SERVER_STATUS_COMMAND));
  } catch { /* فرمان هنوز مستقر نیست یا IPC رد شد — نرم؛ poll ادامه می‌یابد */ }
}

/**
 * فاز A — نصب یک‌بارهٔ feed مشترک وضعیت سرور: شنیدن رویداد engine:status + poll هر ۳۰ثانیه با
 * invoke engine_status. خروجی و گارد عین الگوی installEngineWatchdogBanner — بیرون پوستهٔ
 * دسکتاپ (مرورگر/آزمون) نصب نمی‌شود و هیچ throwی ندارد. کارت پنل سلامت و pill سربرگ هر دو
 * با subscribeServerStatus روی همین feed می‌نشینند (یک poll، چند شنونده).
 */
export function installServerStatusFeed() {
  if (serverStatusFeedInstalled) return { installed: true };
  try {
    const tauri = globalThis.__TAURI__;
    const listen = tauri && tauri.event && typeof tauri.event.listen === 'function' ? tauri.event.listen : null;
    const invoke = tauri && typeof tauri.invoke === 'function' ? tauri.invoke : null;
    if (!listen && !invoke) return { installed: false, reason: 'no-tauri-channel' };
    serverStatusFeedInstalled = true;
    if (listen) {
      void (async () => {
        try { await listen(SERVER_STATUS_EVENT, (ev) => notifyServerStatus(ev?.payload)); }
        catch { /* IPC گوش‌دادن ناموفق — poll تنها کافی است */ }
      })();
    }
    void pollEngineStatusOnce(invoke ?? (async () => null));
    serverStatusFeedTimer = setInterval(() => void pollEngineStatusOnce(invoke ?? (async () => null)), SERVER_STATUS_POLL_MS);
    return { installed: true };
  } catch {
    return { installed: false, reason: 'unexpected' };
  }
}

/** اشتراک شنوندهٔ وضعیت — آخرین وضعیت شناخته‌شده بلافاصله می‌رسد؛ خروجی تابع لغو اشتراک */
export function subscribeServerStatus(cb) {
  if (typeof cb !== 'function') return () => {};
  serverStatusCallbacks.add(cb);
  if (lastServerStatusPayload) {
    try { cb(lastServerStatusPayload); } catch { /* نرم */ }
  }
  return () => serverStatusCallbacks.delete(cb);
}

/** آخرین وضعیت پاک‌سازی‌شدهٔ پاکت engine_status — برای رندر نخست کارت (غایب → null) */
export function lastServerStatus() {
  return lastServerStatusPayload;
}

/** بازنشانی feed — فقط آزمون */
export function resetServerStatusFeedForTests() {
  serverStatusFeedInstalled = false;
  if (serverStatusFeedTimer) { clearInterval(serverStatusFeedTimer); serverStatusFeedTimer = null; }
  serverStatusCallbacks.clear();
  lastServerStatusPayload = null;
}

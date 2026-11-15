// ویزارد «پیکربندی اولیه اتصال ابری» (فاز C — سند docs/rust/server-cloud-update-design.md §۲-۵/§۶ فاز C
// + فاز D1 «انسانی‌سازی»: واژگان رسمی UI — Worker→«مرکز ابری»، توکن CF→«کلید کلادفلر»،
// secret→«رمز اتصال»، D1→«پایگاه‌داده ابری»؛ گام A1 متن وب + گام done پیوند «وب مرکز ابری»
// وقتی webEnabled — هیچ تغییر قرارداد API و هیچ تغییر نام تابع، فقط متن‌ها)
// پس از نصب تازه هیچ مسیر UIای برای اتصال این نود به ابر (یا ساخت مرکز ابری) نبود — این نما همان جریان
// پیکربندی اولیه است: سه گزینهٔ گام انتخاب (choice) → اتصال به مرکز ابری موجود (existing/B1) یا
// ساخت مرکز ابری تازه با کلید کلادفلر (create/A1) → کارت وضعیت (done). ردکردن = «فقط محلی» بی‌قفل
// (قانون سند §۲-۵: هر زمان از پنل سلامت قابل انجام است).
// قرارداد بک‌اند: GET/POST/DELETE /api/instance-sync/config + POST run-now +
// POST provision/verify {token} → {ok, accounts:[{id,name}]} + POST provision {token, accountId?, name}
// → {ok, workerUrl, authSecret, nodeSetupToken, workerName, d1Name, steps[]} — authSecret فقط
// یک‌بار در پاسخ می‌آید و «فقط دسکتاپ» است (حالت وب ۵۰۱ با پیام فارسی). ذخیرهٔ secret فقط Rust:
// invoke('cloud_secret_set') — الگوی desktopSecretChannel پنل سلامت؛ بیرون پوستهٔ میز گارد کامل.
// نگاشت‌ها تابع خالص بی‌DOM (الگوی cloudSyncStateView) تا بی‌ماک سنگین آزمون شوند
// (src/__tests__/front-cloud-setup.test.ts)؛ renderCloudSetup همهٔ وابستگی‌ها را تزریقی می‌گیرد
// {api, invoke, toast, confirmModal, formModal, navigate}. هیچ CSS تازه‌ای ندارد — فقط کلاس‌های
// موجود (card/badge/form-grid/btn/…) — بودجهٔ CSS مرز سقف است. این ماژول فقط از مسیر روتر lazy
// می‌آید (#/cloud-setup در app.js — import داینامیک؛ گیت بودجهٔ کارایی: boot_js_gz/eager_modules).
import { api } from '../api.js';
import { el, icon, confirmModal, formModal, toast, lockBtn } from '../ui.js';
import { fa, formatJalaliDateTime } from '../format.js';

/* ── ثابت‌های ویزارد ─────────────────────────────────────────────────────────── */

export const CLOUD_SETUP_STEPS = ['choice', 'existing', 'create', 'done'];

export const CLOUD_SETUP_HEADINGS = {
  choice: 'پیکربندی اولیه اتصال ابری',
  existing: 'اتصال به مرکز ابری موجود',
  create: 'ساخت مرکز ابری با کلید کلادفلر',
  done: 'اتصال ابری ثبت شد'
};

/** سه گزینهٔ گام انتخاب — متن‌ها واژگان رسمی فاز D1 (مرکز ابری/کلید اتصال/پایگاه‌داده ابری) */
export const CLOUD_SETUP_CHOICES = [
  { key: 'existing', icon: 'link', title: 'اتصال به مرکز ابری موجود', desc: 'مرکز ابری که قبلاً ساخته شده؛ آدرس و رمز اتصال آن را وارد می‌کنید.', button: 'اتصال به مرکز موجود…' },
  { key: 'create', icon: 'upload', title: 'ساخت مرکز ابری با کلید کلادفلر', desc: 'نام دلخواه (فقط انگلیسی) و کلید کلادفلر؛ مرکز ابری و پایگاه‌داده ابری روی حساب خودتان ساخته می‌شود.', button: 'ساخت مرکز ابری تازه…' },
  { key: 'local', icon: 'save', title: 'فقط محلی', desc: 'بدون ابر؛ هر زمان از پنل سلامت می‌توانید اتصال بسازید.', button: 'فقط محلی می‌مانم' }
];

/** پیام skip — قانون سند: ردکردن هرگز قفل نمی‌کند؛ ورود بعدی به ابر باز است (متن فاز D1) */
export const CLOUD_SETUP_SKIP_MESSAGE = 'فقط محلی — هر زمان از پنل سلامت می‌توانید اتصال بسازید.';

/** فلگ skip سشن‌محلی (بدون قفل — قانون سند)؛ بنر داشبورد هم همین کلید را می‌خواند */
export const CLOUD_SETUP_SKIP_KEY = 'cs.cloudSetupSkipped';

const SECRET_MASK = '●●●●●●●●';

/** قرارداد نام ورکر — تصمیم قطعی کارفرما §۵-۶: فقط انگلیسی کوچک، بدون تبدیل اسلاگ فارسی */
const WORKER_NAME_RE = /^[a-z][a-z0-9-]{1,61}$/;

/* ── توابع خالص بی‌DOM (الگوی cloudSyncStateView) ─────────────────────────────── */

/**
 * فاز C — اعتبارسنجی زندهٔ کلاینت نام ورکر: خالی/کوتاه/بلند/غیرمعتبر با پیام فارسی و
 * پیش‌نمایش نام نهایی با پیشوند markaz- (تصمیم §۵-۶: نام غیرمعتبر در فرم رد می‌شود).
 * هر ورودی غایب/خراب بی‌کرش است.
 */
export function cloudWorkerNameView(raw) {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (!name) return { ok: false, code: 'empty', message: 'نام مرکز ابری خالی است — یک نام انگلیسی کوتاه بدهید (مثال: shoba).', preview: null };
  if (name.length < 2) return { ok: false, code: 'short', message: 'نام مرکز ابری کوتاه است — حداقل ۲ نویسه.', preview: null };
  if (name.length > 62) return { ok: false, code: 'long', message: 'نام مرکز ابری بلند است — حداکثر ۶۲ نویسه.', preview: null };
  if (!WORKER_NAME_RE.test(name)) {
    return { ok: false, code: 'invalid', message: 'فقط حروف انگلیسی کوچک، رقم و خط تیره — نام فارسی یا حروف بزرگ پذیرفته نمی‌شود.', preview: null };
  }
  return { ok: true, code: 'ok', message: null, preview: `markaz-${name}` };
}

/**
 * فاز C — نمایش رمز یک‌بارمصرف: فقط یک‌بار آشکار (revealed=true) و بعد ماسک —
 * بی‌رمز/غایب/خراب هم ماسک بی‌کرش.
 */
export function cloudSecretDisplayView(secret, revealed) {
  if (revealed !== true) return SECRET_MASK;
  return typeof secret === 'string' && secret ? secret : SECRET_MASK;
}

/** مُهر ISO یا unix ثانیه → جلالی فارسی؛ ورودی غایب/خراب → null بی‌کرش (الگوی cloudSyncAtView) */
function cloudSetupAtView(at) {
  if (typeof at === 'string') {
    const ms = Date.parse(at);
    if (Number.isFinite(ms)) {
      try { return formatJalaliDateTime(at); } catch { return null; }
    }
    return null;
  }
  const n = Number(at);
  if (Number.isFinite(n) && n > 0) {
    try { return formatJalaliDateTime(new Date(n * 1000).toISOString()); } catch { return null; }
  }
  return null;
}

/** جمع دو جهت آخرین هم‌گامی → «↑۲۳ ↓۴۱»؛ ورودی غایب/خراب → null (الگوی سبک cloudCountsView) */
function cloudSetupCountsDetail(ls) {
  const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n) : 0; };
  const sum = (m) => (m && typeof m === 'object' ? Object.values(m).reduce((a, b) => a + num(b), 0) : 0);
  const push = sum(ls.pushed);
  const pull = sum(ls.pulled);
  return push > 0 || pull > 0 ? `↑${fa(push)} ↓${fa(pull)}` : null;
}

/**
 * فاز C — مُهر سبک وضعیت اتصال ابری برای ویزارد — هم‌قرارداد با cloudSyncStateView پنل سلامت
 * (نگاشت کامل با جزئیات per-table همان‌جاست؛ این نسخهٔ کم‌حجم برای چانک lazy ویزارد است —
 * الگوی pill بوت که نگاشت سربرگ را آینه می‌کند). تقدم: unconfigured → schema → running →
 * نتیجهٔ آخرین هم‌گامی (synced/error/offline) → انتظار اولین هم‌گامی → نامشخص. بی‌کرش.
 */
export function cloudSetupStatusView(status) {
  if (!status || typeof status !== 'object') return { badge: 'badge--neutral', dot: 'dot--neutral', label: 'وضعیت نامشخص', detail: null };
  if (status.configured !== true) return { badge: 'badge--neutral', dot: 'dot--neutral', label: 'اتصال ابری تنظیم نشده', detail: null };
  if (status.schema_match === false) return { badge: 'badge--error', dot: 'dot--error', label: 'نسخهٔ ساختار اطلاعات متفاوت است — به‌روزرسانی لازم است', detail: null };
  if (status.running === true) return { badge: 'badge--warning', dot: 'dot--warning', label: 'هم‌گامی در جریان…', detail: null };
  const ls = status.last_sync && typeof status.last_sync === 'object' ? status.last_sync : null;
  if (!ls) return { badge: 'badge--neutral', dot: 'dot--neutral', label: 'در انتظار اولین هم‌گامی', detail: null };
  if (ls.result === 'synced') {
    const at = cloudSetupAtView(ls.at);
    const counts = cloudSetupCountsDetail(ls);
    const parts = [at ? `آخرین هم‌گامی: ${at}` : null, counts].filter(Boolean);
    return { badge: 'badge--success', dot: 'dot--success', label: 'هم‌گام شد', detail: parts.length > 0 ? parts.join(' · ') : null };
  }
  if (ls.result === 'error') {
    const err = typeof ls.error === 'string' && ls.error.trim() ? ls.error.trim() : null;
    return { badge: 'badge--error', dot: 'dot--error', label: 'خطای هم‌گامی', detail: err && err.length > 120 ? `${err.slice(0, 120)}…` : err };
  }
  if (ls.result === 'offline') return { badge: 'badge--warning', dot: 'dot--warning', label: 'خارج از خط — تلاش دوباره خودکار', detail: null };
  return { badge: 'badge--neutral', dot: 'dot--neutral', label: 'وضعیت نامشخص', detail: null };
}

/**
 * فاز C — هر خطای درگاه/پوسته → پیام فارسی واحد ویزارد: ۵۰۱ = فقط-دسکتاپ (قرارداد provision)،
 * ۴۰۱/۴۰۳ = دسترسی، بی‌status = پیام خودِ خطا (پرتاب‌های داخلی) یا پیام شبکه؛ بقیه = پیام سرور.
 */
export function cloudSetupErrorView(err) {
  const status = Number(err?.status);
  if (Number.isFinite(status) && status > 0) {
    if (status === 501) return 'این کار فقط در نسخهٔ دسکتاپ فعال است — نسخهٔ وب امکان ساخت مرکز ابری ندارد.';
    if (status === 401 || status === 403) return 'دسترسی مجاز نیست — پیکربندی اتصال ابری فقط برای مدیر مرکز فعال است.';
    return typeof err?.message === 'string' && err.message ? err.message : 'خطای نامشخص — دوباره تلاش کنید.';
  }
  const msg = typeof err?.message === 'string' && err.message.trim() ? err.message.trim() : null;
  return msg ?? 'اتصال به موتور محلی برقرار نشد — روشن‌بودن موتور و اینترنت را بررسی و دوباره تلاش کنید.';
}

/**
 * فاز C — مدل خالص ویزارد برای گام فعلی: انتخاب‌ها/فرم B1/زنجیرهٔ A1 (accounts، پیش‌نمایش نام،
 * گام secret یک‌بارمصرف)/کارت done — همه از state نرمال‌شده؛ ورودی غایب/خراب → گام choice بی‌کرش.
 */
export function cloudSetupView(state) {
  const s = state && typeof state === 'object' ? state : {};
  const step = CLOUD_SETUP_STEPS.includes(s.step) ? s.step : 'choice';
  const out = {
    step,
    heading: CLOUD_SETUP_HEADINGS[step] ?? 'پیکربندی اتصال ابری',
    choices: CLOUD_SETUP_CHOICES,
    skipHint: CLOUD_SETUP_SKIP_MESSAGE,
    result: s.result && typeof s.result === 'object' && typeof s.result.text === 'string'
      ? { tone: ['ok', 'warn', 'error', 'info'].includes(s.result.tone) ? s.result.tone : 'info', text: s.result.text }
      : null,
    status: null,
    existing: null,
    create: null
  };
  if (step === 'existing') {
    out.existing = {
      urlPlaceholder: 'https://markaz-….workers.dev',
      defaultMinutes: 10,
      minMinutes: 1,
      desktopSecret: s.desktopSecret === true,
      secretHint: s.desktopSecret === true
        ? 'رمز اتصال — یک‌بار در حافظهٔ امن ویندوز ذخیره می‌شود'
        : 'تنظیم رمز اتصال فقط در نسخهٔ دسکتاپ فعال است'
    };
    out.status = cloudSetupStatusView(s.status);
  } else if (step === 'create') {
    const phase = ['form', 'accounts', 'secret'].includes(s.createPhase) ? s.createPhase : 'form';
    const p = s.provisioned && typeof s.provisioned === 'object' ? s.provisioned : null;
    const revealed = phase === 'secret' && s.secretRevealed === true && s.secretMasked !== true;
    out.create = {
      phase,
      // فاز D1 — متن A1: وب مرکز ابری همان نرم‌افزار در مرورگر است (همین آدرس)
      webNote: 'مرکز ابری ساخته می‌شود و وب آن هم فعال است — همان نرم‌افزار، در مرورگر، با همین آدرس.',
      accounts: Array.isArray(s.accounts)
        ? s.accounts.filter((a) => a && typeof a === 'object' && a.id != null && typeof a.name === 'string' && a.name)
        : [],
      selectedAccountId: s.selectedAccountId ?? null,
      name: cloudWorkerNameView(s.workerName),
      tokenHint: 'مجوزهای کلید کلادفلر: Workers Scripts:Edit + D1:Edit + Account Settings:Read — کلید فقط برای ساخت به api.cloudflare.com می‌رود و هرگز لاگ نمی‌شود.',
      provisioned: p
        ? {
            workerUrl: typeof p.workerUrl === 'string' ? p.workerUrl : null,
            workerName: typeof p.workerName === 'string' ? p.workerName : null,
            d1Name: typeof p.d1Name === 'string' ? p.d1Name : null,
            steps: Array.isArray(p.steps) ? p.steps.filter((x) => typeof x === 'string' && x) : []
          }
        : null,
      authSecretText: cloudSecretDisplayView(p?.authSecret, revealed),
      nodeSetupTokenText: cloudSecretDisplayView(p?.nodeSetupToken, revealed),
      secretWarning: 'این رمز اتصال دوباره نمایش داده نمی‌شود — همین حالا جایی امن نگه دارید.'
    };
  } else if (step === 'done') {
    out.status = cloudSetupStatusView(s.status);
    // فاز D1 — پیوند «وب مرکز ابری» فقط وقتی اتصال با آدرس https ثبت شده است (مدل خالص webEnabled)
    const url = typeof s.status?.url === 'string' ? s.status.url : null;
    out.web = {
      enabled: s.status?.configured === true && url !== null && url.startsWith('https://'),
      url
    };
  }
  return out;
}

/* ── skip «فقط محلی» — فلگ سشن‌محلی، بدون قفل (قانون سند §۲-۵) ─────────────────── */

/** ردکردن ویزارد: فلگ سشن می‌نویسد (بنر داشبورد این سشن خاموش می‌ماند) و پیام فارسی برمی‌گرداند؛
 *  هرگز localStorage قفل نمی‌نویسد — قانون سند: اتصال هر زمان از پنل سلامت باز است. */
export function markCloudSetupSkipped() {
  try { globalThis.sessionStorage?.setItem?.(CLOUD_SETUP_SKIP_KEY, '1'); } catch { /* بی‌قفل — قانون سند */ }
  return CLOUD_SETUP_SKIP_MESSAGE;
}

/** آیا در این سشن skip شده؟ — بی‌storage → false بی‌کرش */
export function cloudSetupSkippedInSession() {
  try { return globalThis.sessionStorage?.getItem?.(CLOUD_SETUP_SKIP_KEY) === '1'; } catch { return false; }
}

/* ── کانال راز پوستهٔ میز — الگوی cloudSecretInvoke پنل سلامت (گارد کامل؛ SPA هرگز نمی‌شکند) ── */

/** کانال __TAURI__ در دسترس است؟ — فعال‌سازی فیلد رمز و دکمه‌های فقط-دسکتاپ */
export function cloudSecretChannelAvailable() {
  const tauri = globalThis.__TAURI__;
  return Boolean(tauri && typeof tauri.invoke === 'function');
}

/** فرمان راز روی پوستهٔ میز (cloud_secret_set/…) با گارد کامل؛ بیرون دسکتاپ → {ok:false, reason} */
export async function defaultCloudSecretInvoke(command, args) {
  try {
    const tauri = globalThis.__TAURI__;
    const invoke = tauri && typeof tauri.invoke === 'function' ? tauri.invoke : null;
    if (!invoke) return { ok: false, reason: 'no-tauri-channel' };
    return { ok: true, value: await invoke(command, args ?? {}) };
  } catch (err) {
    return { ok: false, reason: err?.message != null ? String(err.message) : String(err ?? 'خطای نامشخص') };
  }
}

/* ── جریان‌های قراردادی (ترتیب فراخوانی‌ها عین مأموریت فاز C؛ deps تزریقی برای آزمون بی‌ماک سنگین) ── */

/** پوشش پاکت پاسخ — الگوی unwrap کارت ابری: {data:…} باز می‌شود */
function unwrapPacket(res) {
  return res?.data && typeof res.data === 'object' ? res.data : res;
}

/**
 * جریان B1 — «اتصال به ورکر موجود»: ترتیب قراردادی POST config → invoke cloud_secret_set →
 * POST run-now (الگوی فرم «پیکربندی اتصال» کارت ابری). بدون کانال میز (حالت وب) رمز رد
 * می‌شود (تنظیم آن فقط Rust است) ولی اتصال ذخیره و سینک فرمان می‌گیرد — با پیام صریح.
 * فاصلهٔ سینک: کف ۱ دقیقه؛ کمتر/خراب → بدون interval_ms (پیش‌فرض سرور ۱۰ دقیقه). شکست →
 * Error با پیام فارسی (فرم مودال باز می‌ماند — الگوی errBox).
 */
export async function saveExistingConnection(deps, input) {
  const body = { url: input.url };
  const minutes = Number(input.minutes);
  if (Number.isFinite(minutes) && minutes >= 1) body.interval_ms = Math.round(minutes * 60_000);
  await deps.api.post('/api/instance-sync/config', body);
  if (input.secretChannel !== false && input.secret) {
    const out = await deps.invoke('cloud_secret_set', { secret: input.secret });
    if (!out || out.ok !== true) {
      throw new Error(`پیکربندی اتصال ذخیره شد ولی ذخیرهٔ رمز در پوستهٔ میز ناموفق بود: ${out?.reason ?? 'خطای نامشخص'} — از پنل سلامت «پیکربندی اتصال» را دوباره بگیرید.`);
    }
  }
  await deps.api.post('/api/instance-sync/run-now');
  return input.secretChannel === false
    ? 'اتصال ابری ذخیره شد — تنظیم رمز فقط در نسخهٔ دسکتاپ فعال است؛ تا رمز ثبت نشود هم‌گامی برقرار نمی‌شود.'
    : 'اتصال ابری ذخیره شد — اولین هم‌گامی فرمان گرفت.';
}

/**
 * گام ۱ زنجیرهٔ A1 — وارسی توکن و فهرست حساب‌ها: POST provision/verify {token} →
 * {ok, accounts:[{id,name}]}؛ پاکت غایب/ناقص → accounts خالی بی‌کرش.
 */
export async function verifyProvisionToken(deps, token) {
  const res = await deps.api.post('/api/instance-sync/provision/verify', { token });
  const data = unwrapPacket(res);
  const accounts = Array.isArray(data?.accounts)
    ? data.accounts.filter((a) => a && typeof a === 'object' && a.id != null && typeof a.name === 'string' && a.name)
    : [];
  return { ok: data?.ok === true, accounts };
}

/**
 * گام ۲ زنجیرهٔ A1 — ساخت ورکر: POST provision {token, accountId?, name} → پاکت کامل
 * {ok, workerUrl, authSecret, nodeSetupToken, workerName, d1Name, steps[]}؛ فیلدهای
 * ناآشنا → null/[] بی‌کرش (authSecret فقط یک‌بار در این پاسخ است).
 */
export async function provisionNewWorker(deps, input) {
  const body = { token: input.token, name: input.name };
  if (input.accountId) body.accountId = input.accountId;
  const res = await deps.api.post('/api/instance-sync/provision', body);
  const data = unwrapPacket(res);
  return {
    ok: data?.ok === true,
    workerUrl: typeof data?.workerUrl === 'string' ? data.workerUrl : null,
    authSecret: typeof data?.authSecret === 'string' ? data.authSecret : null,
    nodeSetupToken: typeof data?.nodeSetupToken === 'string' ? data.nodeSetupToken : null,
    workerName: typeof data?.workerName === 'string' ? data.workerName : null,
    d1Name: typeof data?.d1Name === 'string' ? data.d1Name : null,
    steps: Array.isArray(data?.steps) ? data.steps.filter((x) => typeof x === 'string' && x) : []
  };
}

/**
 * گام پایانی زنجیرهٔ A1 — «ذخیره و اتصال»: ترتیب قراردادی invoke cloud_secret_set(authSecret) →
 * POST config {url} → POST run-now. رمز پیش از config ذخیره می‌شود تا اگر اتصال وسط راه شکست،
 * رمز یک‌بارمصرف از دست نرفته باشد (کاربر از پنل سلامت ادامه می‌دهد). شکست → Error فارسی.
 */
export async function connectProvisionedWorker(deps, input) {
  const out = await deps.invoke('cloud_secret_set', { secret: input.authSecret });
  if (!out || out.ok !== true) {
    throw new Error(`ذخیرهٔ رمز در پوستهٔ میز ناموفق بود: ${out?.reason ?? 'خطای نامشخص'} — رمز را جایی امن نگه دارید و بعد از رفع مشکل از پنل سلامت «پیکربندی اتصال» را ادامه دهید.`);
  }
  await deps.api.post('/api/instance-sync/config', { url: input.workerUrl });
  await deps.api.post('/api/instance-sync/run-now');
  return 'مرکز ابری ساخته شد و اتصال ثبت شد — اولین هم‌گامی فرمان گرفت.';
}

/* ── رندر ویزارد (DOM) — همهٔ وابستگی‌ها تزریقی؛ پیش‌فرض‌ها = ماژول‌های واقعی ──────────
   فاز D2 (خواست کارفرما: «کل جریان پیکربندی ابری داخل کارت ابریِ پنل سلامت») — رندر به
   mountCloudSetup(root, deps, opts) منتقل شد: همان state machine و همان بخش‌های
   choice/existing/create/done/clone، داخل هر root دلخواه. دو میزبان، یک پیاده‌سازی:
   • renderCloudSetup (مسیر روتر #/cloud-setup — دیپ‌لینک) = فقط سیم‌کشی به همین تابع؛
   • کارت «اتصال ابری» پنل سلامت (health-panel.js) با opts.compact=true سوار می‌کند —
     بدون عنوان صفحهٔ h2 و پانویسِ آن (برای کارت)، بقیه عیناً همان.
   opts.onDone: پس از رسیدن به گام done (ذخیره و اتصال موفق/کلون) یک‌بار صدا زده می‌شود —
   میزبان با آن ناحیه را می‌بندد و کارت را تازه می‌کند؛ شنوندهٔ خراب هرگز ویزارد را نمی‌کشد.
   خروجی = تابع unmount (الگوی stopTimer پنل): رندرهای بعدی را خنثی می‌کند و root را خالی
   می‌گذارد؛ دو بار صدا زدنش هم بی‌خطر است. هیچ تغییر قرارداد API و هیچ منطق بازنویسی‌شده —
   فقط سیم‌کشی و گارد تخریب. */
export function mountCloudSetup(root, deps = {}, opts = {}) {
  const d = {
    api: deps.api && typeof deps.api === 'object' ? deps.api : api,
    invoke: typeof deps.invoke === 'function' ? deps.invoke : defaultCloudSecretInvoke,
    toast: typeof deps.toast === 'function' ? deps.toast : toast,
    confirmModal: typeof deps.confirmModal === 'function' ? deps.confirmModal : confirmModal,
    formModal: typeof deps.formModal === 'function' ? deps.formModal : formModal,
    navigate: typeof deps.navigate === 'function' ? deps.navigate : (hash) => { location.hash = hash; }
  };
  const compact = opts.compact === true;
  const onDone = typeof opts.onDone === 'function' ? opts.onDone : null;
  const desktopSecret = cloudSecretChannelAvailable();

  // فاز D2 — گارد تخریب: پس از unmount هیچ رندر درجا (paint ناشی از refreshStatus درجای
  // مانده) روی root بی‌میزبان انجام نمی‌شود — الگوی «نما رندر دوباره شده» پنل سلامت
  let disposed = false;

  const state = {
    step: 'choice',
    createPhase: 'form',
    token: '',
    workerName: '',
    accounts: [],
    selectedAccountId: null,
    provisioned: null,
    secretRevealed: false,
    secretMasked: false,
    status: null,
    result: null
  };

  // عنوان صفحه (h2 + پانویس) فقط برای میزبان تمام‌صفحه (مسیر #/cloud-setup) — حالت compact کارت آن را نمی‌خواهد
  const pageHead = compact ? null : el('div', { class: 'page-head' },
    el('h2', {}, 'پیکربندی اتصال ابری'),
    el('p', { class: 'hint-text' }, 'ویزارد پیکربندی اولیه — اتصال این دستگاه به مرکز ابری، ساخت مرکز ابری تازه روی حساب کلادفلر خودتان، یا ادامهٔ فقط-محلی. هر زمان از پنل سلامت هم می‌توانید اتصال را بسازید یا عوض کنید.')
  );

  /** سیم‌کشی میزبان — رسیدن به گام done (ذخیره و اتصال موفق / کلون کامل) را اطلاع می‌دهد */
  function notifyDone() {
    if (!onDone) return;
    try { onDone(); } catch { /* شنوندهٔ خراب میزبان هرگز ویزارد را نمی‌کشد */ }
  }

  const resultLine = el('div', { style: { marginBottom: 'var(--sp-4)' }, hidden: true });

  function setResult(tone, text) {
    state.result = { tone, text };
    resultLine.className = tone === 'error' ? 'alert alert--error' : tone === 'warn' ? 'alert alert--warning' : 'alert alert--info';
    resultLine.replaceChildren(text);
    resultLine.hidden = false;
  }
  function clearResult() {
    state.result = null;
    resultLine.hidden = true;
  }

  /** وضعیت اتصال ابری — نرم: خطا → null → کارت «نامشخص» (بی‌کرش) */
  async function refreshStatus() {
    try {
      const res = await d.api.get('/api/instance-sync/status');
      const data = unwrapPacket(res);
      state.status = data && typeof data === 'object' ? data : null;
    } catch { state.status = null; }
  }

  function statusRows(status) {
    const view = cloudSetupStatusView(status);
    const sub = [];
    if (typeof status?.url === 'string' && status.url) sub.push(status.url);
    if (view.detail) sub.push(view.detail);
    return el('div', { class: 'ob-row' },
      el('div', { class: 'ob-row__main' },
        el('div', { class: 'cell-main' },
          el('span', { class: `dot ${view.dot}`, style: { marginInlineEnd: 'var(--sp-2)' } }),
          view.label),
        el('div', { class: 'cell-sub' }, sub.length > 0 ? sub.join(' · ') : '—')
      )
    );
  }

  /* ── گام انتخاب (choice) — سه کارت ── */
  function choiceAction(key) {
    clearResult();
    if (key === 'local') {
      const msg = markCloudSetupSkipped(); // فلگ سشن‌محلی — بدون قفل (قانون سند)
      setResult('info', msg);
      d.toast(msg, 'info');
      return;
    }
    if (key === 'existing') {
      state.step = 'existing';
      paint();
      void refreshStatus().then(paint);
      return;
    }
    state.step = 'create';
    state.createPhase = 'form';
    paint();
  }

  function choiceSection() {
    return el('div', {},
      el('p', { class: 'hint-text', style: { marginTop: '0' } }, 'یک گزینه را انتخاب کنید — بعداً هم می‌توانید از پنل سلامت تغییرش دهید:'),
      ...CLOUD_SETUP_CHOICES.map((c) => el('div', { class: 'card', style: { marginBottom: 'var(--sp-4)' } },
        el('div', { class: 'card__body' },
          el('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' } },
            icon(c.icon, 18),
            el('h3', { style: { margin: 0 } }, c.title)),
          el('p', { class: 'hint-text', style: { margin: '6px 0 10px' } }, c.desc),
          el('button', {
            class: c.key === 'local' ? 'btn btn--ghost' : 'btn btn--primary',
            type: 'button',
            onclick: () => choiceAction(c.key)
          }, c.button)
        )
      ))
    );
  }

  /* ── کلون از ابر — عین الگوی کارت ابری پنل سلامت: تأیید دوبله → POST clone {confirm:true} ── */
  async function cloneFromCloudAction() {
    const okFirst = await d.confirmModal({
      title: 'کلون از ابر',
      message: 'اطلاعات محلی با اطلاعات ابر جایگزین می‌شود؛ پیش از آن یک پشتیبان خودکار گرفته می‌شود. ادامه می‌دهید؟',
      confirmLabel: 'ادامه',
      danger: true
    });
    if (!okFirst) return;
    const okFinal = await d.confirmModal({
      title: 'تأیید نهایی کلون',
      message: 'کلون برگشت‌پذیر نیست؛ کارهایی که هنوز به ابر نرسیده‌اند از بین می‌روند (پشتیبان خودکار نگه داشته می‌شود). مطمئن هستید؟',
      confirmLabel: 'کلون می‌کنم',
      danger: true
    });
    if (!okFinal) return;
    try {
      const res = await d.api.post('/api/instance-sync/clone', { confirm: true });
      const data = unwrapPacket(res);
      const backup = typeof data?.backup_path === 'string' && data.backup_path ? data.backup_path : null;
      const tables = Array.isArray(data?.tables) ? data.tables.length : null;
      const text = `کلون از ابر کامل شد — ${tables != null ? `${fa(tables)} جدول · ` : ''}پشتیبان: ${backup ?? '—'}`;
      d.toast(text, 'success');
      setResult('ok', text);
      state.step = 'done';
      await refreshStatus();
      paint();
      notifyDone(); // فاز D2 — میزبان (کارت ابری) ناحیه را می‌بندد و کارت را تازه می‌کند
    } catch (err) {
      const msg = cloudSetupErrorView(err);
      d.toast(msg, 'error');
      setResult('error', `کلون از ابر ناموفق بود: ${msg}`);
    }
  }

  /* ── گام B1 (existing) — فرم سه‌فیلدی عین «پیکربندی اتصال» کارت ابری + کلون از ابر ── */
  function openExistingForm() {
    const { form } = d.formModal({
      title: 'اتصال به مرکز ابری موجود',
      fields: [
        { name: 'url', label: 'آدرس مرکز ابری', type: 'text', required: true, ltr: true, placeholder: 'https://markaz-….workers.dev', hint: 'آدرس مرکز ابری کلادفلر — با https شروع می‌شود' },
        { name: 'interval_minutes', label: 'همگام‌سازی خودکار (دقیقه)', type: 'number', min: 1, value: '10', hint: 'پیش‌فرض ۱۰ دقیقه — یعنی هر ۱۰ دقیقه یک‌بار؛ کف ۱ دقیقه' },
        { name: 'secret', label: 'رمز اتصال', type: 'password', ltr: true, hint: desktopSecret ? 'رمز اتصال — یک‌بار در حافظهٔ امن ویندوز ذخیره می‌شود' : 'تنظیم رمز اتصال فقط در نسخهٔ دسکتاپ فعال است' }
      ],
      submitLabel: 'ذخیره و اتصال',
      secondary: { label: 'کلون از ابر…', onClick: () => cloneFromCloudAction() },
      onSubmit: async (values) => {
        // URL با نگاشت مشترک پیکربندی ابر اعتبارسنجی می‌شود؛ خطا → errBox فرم و ماندن مودال باز
        const { normalizeWorkerUrl } = await import('../../../../src/cloud-setup/verify.ts');
        const nm = normalizeWorkerUrl(values.url ?? '');
        if (!nm.ok) throw new Error(nm.message);
        let msg;
        try {
          msg = await saveExistingConnection(d, {
            url: nm.url,
            secret: values.secret ?? '',
            minutes: Number(values.interval_minutes),
            secretChannel: desktopSecret
          });
        } catch (err) {
          throw new Error(cloudSetupErrorView(err)); // errBox فارسی — مودال باز می‌ماند
        }
        d.toast(msg, 'success');
        setResult('ok', msg);
        state.step = 'done';
        await refreshStatus();
        paint();
        await refreshStatus(); // پس از run-now — وضعیت زندهٔ دوم
        paint();
        notifyDone(); // فاز D2 — میزبان (کارت ابری) ناحیه را می‌بندد و کارت را تازه می‌کند
      }
    });
    // حالت وب — فیلد رمز غیرفعال؛ مقدار هرگز خوانده/فرستاده نمی‌شود (گارد کانال)
    if (!desktopSecret) {
      const secretInput = form.querySelector('input[name="secret"]');
      if (secretInput) { secretInput.disabled = true; secretInput.placeholder = '—'; }
    }
  }

  function existingSection() {
    return el('div', {},
      el('div', { class: 'card card__body--flush', style: { marginBottom: 'var(--sp-4)' } },
        el('div', { class: 'ob-section__head' },
          el('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' } },
            el('h3', { style: { margin: 0 } }, 'اتصال به مرکز ابری موجود'),
            el('p', { class: 'hint-text', style: { margin: '4px 0 0' } }, 'مرکز ابری که قبلاً ساخته شده؛ آدرس و رمز اتصال را ثبت می‌کنید و اولین هم‌گامی فرمان می‌گیرد. برای جایگزینی اطلاعات محلی با ابر، «کلون از ابر» را بگیرید (تأیید دوبله + پشتیبان خودکار).')
          )
        ),
        el('div', { class: 'card__body--flush' },
          statusRows(state.status),
          el('div', { class: 'ob-row' },
            el('div', { class: 'ob-row__side' },
              el('button', { class: 'btn btn--primary', type: 'button', onclick: () => openExistingForm() }, 'پیکربندی اتصال…'),
              el('button', { class: 'btn btn--ghost', type: 'button', onclick: () => void cloneFromCloudAction() }, 'کلون از ابر…'),
              el('button', { class: 'btn btn--ghost', type: 'button', onclick: () => void (async () => { await refreshStatus(); paint(); })() }, 'تازه‌سازی وضعیت'),
              el('button', { class: 'btn btn--ghost', type: 'button', onclick: () => { state.step = 'choice'; paint(); } }, 'بازگشت')
            )
          )
        )
      )
    );
  }

  /* ── گام A1 (create) — فرم توکن + نام با اعتبارسنجی زنده → وارسی توکن → انتخاب حساب →
     ساخت ورکر → گام secret یک‌بارمصرف → ذخیره و اتصال ── */
  async function verifyTokenAction(btn) {
    await lockBtn(btn, async () => {
      try {
        const out = await verifyProvisionToken(d, state.token.trim());
        if (!out.ok) throw new Error('کلید تأیید نشد — مقدار کلید را از داشبورد کلادفلر دوباره بررسی کنید.');
        if (out.accounts.length === 0) throw new Error('روی این کلید حسابی یافت نشد — مجوز Account Settings:Read را بررسی کنید.');
        state.accounts = out.accounts;
        state.selectedAccountId = out.accounts[0].id; // تک‌حساب از پیش انتخاب است؛ چندحساب با کلیک عوض می‌شود
        state.createPhase = 'accounts';
        setResult('info', out.accounts.length > 1
          ? `${fa(out.accounts.length)} حساب روی این کلید پیدا شد — حساب مقصد را انتخاب کنید.`
          : `حساب «${out.accounts[0].name}» تأیید شد — ادامهٔ ساخت مرکز ابری.`);
        paint();
      } catch (err) {
        const msg = cloudSetupErrorView(err);
        d.toast(msg, 'error');
        setResult('error', msg);
      }
    });
  }

  async function provisionAction(btn) {
    await lockBtn(btn, async () => {
      try {
        const packet = await provisionNewWorker(d, { token: state.token.trim(), accountId: state.selectedAccountId, name: state.workerName.trim() });
        if (!packet.ok || !packet.workerUrl || !packet.authSecret) {
          throw new Error('ساخت مرکز ابری پاسخ کامل نداد — پیش از تلاش دوباره، وضعیت حساب کلادفلر (مرکزهای ابری و پایگاه‌های داده با پیشوند markaz-) را بررسی کنید.');
        }
        state.provisioned = packet;
        state.createPhase = 'secret';
        state.secretRevealed = true; // فقط همین یک‌بار آشکار — الگوی «به کاربر یک‌بار نشان داده می‌شود»
        state.secretMasked = false;
        d.toast(`مرکز ابری «${packet.workerName ?? 'نام نامشخص'}» ساخته شد`, 'success');
        setResult('ok', `مرکز ابری «${packet.workerName ?? 'نام نامشخص'}» ساخته شد — پایگاه‌داده ابری ${packet.d1Name ?? '—'}؛ رمز اتصال را همین حالا جایی امن نگه دارید.`);
        paint();
      } catch (err) {
        const msg = cloudSetupErrorView(err);
        d.toast(msg, 'error');
        setResult('error', msg);
      }
    });
  }

  async function connectProvisionedAction(btn) {
    await lockBtn(btn, async () => {
      try {
        const msg = await connectProvisionedWorker(d, { workerUrl: state.provisioned?.workerUrl ?? '', authSecret: state.provisioned?.authSecret ?? '' });
        d.toast(msg, 'success');
        setResult('ok', msg);
        state.step = 'done';
        await refreshStatus();
        paint();
        notifyDone(); // فاز D2 — میزبان (کارت ابری) ناحیه را می‌بندد و کارت را تازه می‌کند
      } catch (err) {
        const msg = cloudSetupErrorView(err);
        d.toast(msg, 'error');
        setResult('error', msg);
      }
    });
  }

  function copySecretAction(text, okMsg) {
    return async () => {
      try {
        await navigator.clipboard.writeText(text ?? '');
        d.toast(okMsg, 'success');
      } catch {
        d.toast('کپی ناموفق بود — مقدار را دستی انتخاب و کپی کنید', 'warning');
      }
    };
  }

  function secretRow(label, valueText, copyValue) {
    const input = el('input', { class: 'input', type: 'text', readonly: true, value: valueText, style: { direction: 'ltr', unicodeBidi: 'plaintext', fontFamily: 'monospace' } });
    return el('div', { class: 'ob-row' },
      el('div', { class: 'ob-row__main' },
        el('div', { class: 'cell-main' }, label),
        input
      ),
      el('div', { class: 'ob-row__side' },
        el('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: copySecretAction(copyValue, 'کپی شد') }, 'کپی')
      )
    );
  }

  function createSection() {
    if (state.createPhase === 'secret') {
      const v = cloudSetupView(state);
      const p = v.create.provisioned ?? {};
      return el('div', { class: 'card', style: { marginBottom: 'var(--sp-4)' } },
        el('div', { class: 'card__head' },
          el('h3', { style: { margin: 0 } }, 'رمز اتصال — فقط همین یک‌بار'),
          el('span', { class: 'badge badge--warning' }, 'یک‌بارمصرف')
        ),
        el('div', { class: 'card__body' },
          el('div', { class: 'alert alert--warning', style: { marginBottom: 'var(--sp-3)' } },
            icon('alert', 18),
            el('span', {}, v.create.secretWarning)),
          el('p', { class: 'hint-text', style: { marginTop: '0' } },
            `مرکز ابری «${p.workerName ?? '—'}» روی حساب شما ساخته شد — ${p.workerUrl ? `آدرس: ${p.workerUrl}` : 'آدرس غایب است'} · پایگاه‌داده ابری: ${p.d1Name ?? '—'}`),
          Array.isArray(p.steps) && p.steps.length > 0
            ? el('div', { class: 'hint-text' }, ...p.steps.map((sLine) => el('div', {}, `✓ ${sLine}`)))
            : null,
          secretRow('رمز اتصال مرکز ابری (authSecret)', v.create.authSecretText, state.provisioned?.authSecret),
          secretRow('کلید راه‌اندازی نود (nodeSetupToken)', v.create.nodeSetupTokenText, state.provisioned?.nodeSetupToken),
          el('div', { class: 'ob-row' },
            el('div', { class: 'ob-row__side' },
              el('button', { class: 'btn btn--primary', type: 'button', onclick: (e) => void connectProvisionedAction(e.currentTarget) }, 'ذخیره و اتصال'),
              el('button', { class: 'btn btn--ghost', type: 'button', onclick: () => { state.secretMasked = true; paint(); } }, 'پنهان کردن رمز')
            )
          )
        )
      );
    }
    if (state.createPhase === 'accounts') {
      const v = cloudSetupView(state);
      return el('div', { class: 'card', style: { marginBottom: 'var(--sp-4)' } },
        el('div', { class: 'card__head' },
          el('h3', { style: { margin: 0 } }, 'حساب مقصد'),
          el('span', { class: 'badge badge--neutral' }, `${fa(v.create.accounts.length)} حساب`)
        ),
        el('div', { class: 'card__body' },
          el('p', { class: 'hint-text', style: { marginTop: '0' } }, 'مرکز ابری و پایگاه‌داده ابری روی همین حساب کلادفلر ساخته می‌شود — حساب مقصد را انتخاب کنید:'),
          el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)' } },
            ...v.create.accounts.map((a) => el('button', {
              class: a.id === v.create.selectedAccountId ? 'btn btn--primary' : 'btn btn--ghost',
              type: 'button',
              onclick: () => { state.selectedAccountId = a.id; paint(); }
            }, a.name))),
          el('p', { class: 'hint-text' }, `نام نهایی مرکز ابری: ${v.create.name.preview ?? '—'}`),
          el('div', { class: 'ob-row' },
            el('div', { class: 'ob-row__side' },
              el('button', {
                class: 'btn btn--primary', type: 'button',
                disabled: v.create.selectedAccountId == null,
                onclick: (e) => void provisionAction(e.currentTarget)
              }, 'ساخت مرکز ابری'),
              el('button', { class: 'btn btn--ghost', type: 'button', onclick: () => { state.createPhase = 'form'; paint(); } }, 'بازگشت')
            )
          )
        )
      );
    }
    // فرم — توکن + نام با اعتبارسنجی زندهٔ کلاینت (بدون repaint حین تایپ؛ بدون CSS تازه)
    const tokenInput = el('input', { class: 'input', type: 'password', name: 'cf_token', autocomplete: 'off', style: { direction: 'ltr', unicodeBidi: 'plaintext' } });
    const tokenHint = el('div', { class: 'field__hint' }, cloudSetupView(state).create.tokenHint);
    const nameInput = el('input', { class: 'input', type: 'text', name: 'worker_name', placeholder: 'مثال: shoba', autocomplete: 'off' });
    const nameError = el('div', { class: 'field__error', style: { display: 'none' } });
    const namePreview = el('div', { class: 'field__hint', style: { direction: 'ltr', unicodeBidi: 'plaintext' } }, '—');
    const verifyBtn = el('button', { class: 'btn btn--primary', type: 'button', disabled: true, onclick: (e) => void verifyTokenAction(e.currentTarget) }, 'بررسی کلید و ادامه');

    function syncNameView() {
      const v = cloudWorkerNameView(nameInput.value);
      const touched = nameInput.value.trim() !== '';
      nameInput.classList.toggle('is-invalid', touched && !v.ok);
      if (touched && !v.ok) {
        nameError.textContent = v.message;
        nameError.style.display = 'block';
      } else {
        nameError.style.display = 'none';
      }
      namePreview.textContent = v.ok ? v.preview : '—';
      verifyBtn.disabled = !v.ok || tokenInput.value.trim() === '';
    }
    tokenInput.addEventListener('input', () => { state.token = tokenInput.value; syncNameView(); });
    nameInput.addEventListener('input', () => { state.workerName = nameInput.value; syncNameView(); });
    syncNameView();

    return el('div', { class: 'card', style: { marginBottom: 'var(--sp-4)' } },
      el('div', { class: 'card__head' },
        el('h3', { style: { margin: 0 } }, 'ساخت مرکز ابری با کلید کلادفلر'),
        el('span', { class: 'badge badge--neutral' }, 'A1')
      ),
      el('div', { class: 'card__body' },
        el('p', { class: 'hint-text', style: { margin: '0 0 var(--sp-3)' } }, cloudSetupView(state).create.webNote),
        el('form', { class: 'form-grid', novalidate: true, onsubmit: (e) => { e.preventDefault(); if (!verifyBtn.disabled) verifyBtn.click(); } },
          el('div', { class: 'field span-2' },
            el('label', { class: 'field__label', for: 'cloud-setup-token' }, 'کلید کلادفلر', el('span', { class: 'req' }, ' *')),
            tokenInput,
            tokenHint
          ),
          el('div', { class: 'field span-2' },
            el('label', { class: 'field__label', for: 'cloud-setup-name' }, 'نام دلخواه مرکز ابری (فقط انگلیسی)', el('span', { class: 'req' }, ' *')),
            nameInput,
            nameError,
            namePreview
          )
        ),
        el('div', { class: 'ob-row' },
          el('div', { class: 'ob-row__side' },
            verifyBtn,
            el('button', { class: 'btn btn--ghost', type: 'button', onclick: () => { state.step = 'choice'; paint(); } }, 'بازگشت')
          )
        )
      )
    );
  }

  /* ── گام done — کارت وضعیت (همان پاکت status) + خط «وب مرکز ابری» (فقط وقتی webEnabled)
       با پیوند بازکردنی + «رفتن به پنل سلامت» ── */
  function doneSection() {
    const v = cloudSetupView(state);
    return el('div', { class: 'card card__body--flush', style: { marginBottom: 'var(--sp-4)' } },
      el('div', { class: 'ob-section__head' },
        el('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' } },
          el('h3', { style: { margin: 0 } }, 'اتصال ابری ثبت شد'),
          el('p', { class: 'hint-text', style: { margin: '4px 0 0' } }, 'وضعیت زندهٔ اتصال و هم‌گامی دوسویه — جزئیات کامل و کنش‌ها (دریافت و ارسال اطلاعات، حذف اتصال، کلون از ابر) در پنل سلامت است.')
        )
      ),
      el('div', { class: 'card__body--flush' },
        statusRows(state.status),
        // فاز D1 — خط «وب مرکز ابری: <آدرس>» فقط وقتی webEnabled (اتصال ثبت‌شده با آدرس https)
        v.web.enabled && v.web.url
          ? el('div', { class: 'ob-row' },
              el('div', { class: 'ob-row__main' },
                el('div', { class: 'cell-main' },
                  'وب مرکز ابری: ',
                  el('a', { href: v.web.url, target: '_blank', rel: 'noopener', style: { direction: 'ltr', unicodeBidi: 'plaintext' } }, v.web.url)
                )
              ),
              el('div', { class: 'ob-row__side' },
                el('a', { class: 'btn btn--ghost btn--sm', href: v.web.url, target: '_blank', rel: 'noopener' }, 'بازکردن در مرورگر')
              )
            )
          : null,
        el('div', { class: 'ob-row' },
          el('div', { class: 'ob-row__side' },
            el('button', { class: 'btn btn--primary', type: 'button', onclick: () => d.navigate('#/health-panel') }, 'رفتن به پنل سلامت'),
            el('button', { class: 'btn btn--ghost', type: 'button', onclick: () => void (async () => { await refreshStatus(); paint(); })() }, 'تازه‌سازی وضعیت'),
            el('button', { class: 'btn btn--ghost', type: 'button', onclick: () => { state.step = 'choice'; paint(); } }, 'بازگشت به ابتدای ویزارد')
          )
        )
      )
    );
  }

  function paint() {
    if (disposed) return; // فاز D2 — پس از unmount هیچ رندر درجای مانده انجام نمی‌شود
    const v = cloudSetupView(state);
    const parts = [];
    if (!compact && pageHead) parts.push(pageHead); // compact (کارت ابری) — بدون عنوان صفحهٔ h2 و پانویس
    parts.push(resultLine);
    if (v.step === 'choice') parts.push(choiceSection());
    else if (v.step === 'existing') parts.push(existingSection());
    else if (v.step === 'create') parts.push(createSection());
    else parts.push(doneSection());
    root.replaceChildren(...parts);
  }

  paint();

  /** تخریب سوارشدن — الگوی stopTimer پنل: رندرهای بعدی خنثی و root خالی می‌شود؛ دوبار صدا زدن بی‌خطر است */
  return function unmountCloudSetup() {
    disposed = true;
    root.replaceChildren();
  };
}

/* فاز D2 — میزبان تمام‌صفحه (مسیر روتر #/cloud-setup — دیپ‌لینکِ لینک پانویس boot و بنر)
   فقط سیم‌کشی است: همان root، همان deps، بدون compact؛ منطق ویزارد یک‌جا در mountCloudSetup است.
   خروجی unmount نادیده گرفته می‌شود — تخریب مسیر روتر با replaceChildren روتر انجام می‌شود. */
export function renderCloudSetup(root, _ctx, deps = {}) {
  return mountCloudSetup(root, deps, {});
}

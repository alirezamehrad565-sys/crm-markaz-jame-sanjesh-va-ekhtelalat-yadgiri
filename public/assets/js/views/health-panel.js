// نمای «پنل سلامت» (۱.۲۵.۶۷ — ف۱ طرح ارتقا، CP-2/CP-3): وضعیت سامانه + شش درگاه لینک CP
// همهٔ داده از GET /api/health/panel (فقط‌مدیر) — مُهرهای settings و COUNTهای واقعی، بدون زیرساخت تازه
// ف۴ — بخش «گزارش رشد جدول‌ها» افزوده شد: GET /api/growth/report فقط‌مدیر — شمارش شبانهٔ کرون + سیاست نگه‌داری
// ف۵ — بخش «هشدارهای فعال» افزوده شد: رانش مُهر تلاش/موفقیت + جهش خطاهای مرورگر (P0-3 حداقلی)
// ف۶ — بخش «وضعیت هم‌گامی» افزوده شد: GET /api/node-sync/status فقط‌مدیر — حالت جبرانی/خارج از خط/خطا/انتظار
//       با نگاشت رنگ (syncStateView) + شمارِ رکوردهای محفوظ در انتظار ارسال + توقفِ نسخهٔ ناسازگار؛
//       خرابیِ درگاه فقط همین کارت را degraded می‌کند («وضعیت هم‌گامی نامشخص») و با همان بازخوانی ۶۰ثانیه‌ای پنل تازه می‌شود
// موج ۱ — قرارداد v2: هشدار زرد اختلاف ساعت با مرکز (clock_warning) · خط سبز «هم‌گام شد؛
//       N رکورد رسید» در پنجرهٔ ۱۰دقیقه‌ای پس از جبران (last_catchup) · ردیف قرمز ناسازگاری
//       نسخهٔ یکپارچه با شماره‌های هندشیک (version.compatible=false یا mode=paused_version)
// EXP-1 — قرارداد v3: ردیف آشتی‌ساز از فیلد reconciliation — سبز «همهٔ دامنه‌ها هم‌شمار» در
//       پنجرهٔ ۱۰دقیقه‌ای، زرد «ناهم‌خوانی در K دامنه» با جزئیات دامنه‌ها (فقط-گزارش)
// EXP-2 — کارت «مصرف مرکز (برآوردی)»: GET /api/central/quota فقط-مدیر — سه شاخص رنگی
//       (درخواست‌ها/نوشتن‌ها/خواندن‌ها) + ورود ناموفق ۲۴ ساعت؛ خرابی = خاکستری «دریافت نشد»
// EXP-4 — بنر نگهبان موتور: رویدادهای Tauri (engine:restarting/restored/down) با گارد کامل —
//       بیرون پوستهٔ دسکتاپ (مرورگر/آزمون) کل کانال no-op است و SPA هرگز نمی‌شکند
// موج ۴ — افزوده‌های تجربهٔ ادمین (همه در همین نمای جدا از مسیر؛ بدون هیچ تغییر ناوبری):
//       ۴-۲ نوار نجات سه‌دکمه‌ای (restart/پشتیبان/zip) · ۴-۱ پنج سیگنال §۴ نقد با سه رنگ و
//       دکمهٔ اقدام · EXP-6 ثبت drill عملیاتی (nodesync:ops-drill-v1) · ۴-۵ راهنمای درون‌برنامه‌ای
//       (چکیدهٔ دستی ADMIN-GUIDE — بدون خواندن فایل در زمان اجرا)
// فاز B — کارت «اتصال ابری» (سند §۲-۵ طرح server-cloud-update-design): GET /api/instance-sync/status
//       فقط‌مدیر — وضعیت + آخرین هم‌گامی دوطرفه + تعارض‌ها + پیکربندی/حذف/کلون؛ فرمان‌های راز
//       (cloud_secret_set/get/delete) فقط روی پوستهٔ میز — Credential Manager، هرگز فایل JSON
// فاز D1 — «انسانی‌سازی» (خواست کارفرما): کارت «اتصال ابری» دو-لایه شد — لایهٔ عادی فقط خط وضعیت
//       انسانی + دو دکمهٔ «دریافت اطلاعات»/«ارسال اطلاعات» + «همگام‌سازی خودکار» + بازو/بستنِ
//       «جزئیات پیشرفته» (پیش‌فرض بسته)؛ جزئیات فنی (نسخهٔ ساختار اطلاعات، تعارض، تاریخچهٔ خطاها)
//       فقط در لایهٔ پیشرفته است. واژگان رسمی UI: Worker→«مرکز ابری»، secret→«کلید اتصال»،
//       pull→«دریافت اطلاعات»، push→«ارسال اطلاعات»، schema→«نسخهٔ ساختار اطلاعات».
//       هیچ تغییر قرارداد API و هیچ تغییر نام تابع — فقط متن‌ها، ترتیب نمایش و بازو/بستن.
// فاز D2 — دو خواست کارفرما پس از v1.27.10: (۱) «کل جریان پیکربندی ابری داخل کارت ابری» — کارت
//       بی‌اتصال دیگر به #/cloud-setup ناوبری نمی‌کند؛ دکمهٔ «شروع پیکربندی ابری» ناحیهٔ داخلی را
//       بازو/بسته می‌کند و ویزارد کامل (mountCloudSetup — views/cloud-setup.js) با import پویا
//       فقط هنگام باز شدن lazy سوار می‌شود؛ پس از «ذخیره و اتصال» ناحیه بسته و کارت با poll فوری
//       feed به حالت «متصل» می‌رود (مسیر #/cloud-setup فقط دیپ‌لینک می‌ماند). (۲) «منوی کارت سلامت
//       خیلی طولانیه — ساده شود»: بالای صفحه فقط سه چیز (سلامت یک‌نگاهی + سرور محلی + اتصال ابری)؛
//       بقیهٔ بخش‌ها زیر آکاردئون واحد «جزئیات پیشرفته» با پیش‌فرض بسته — باز/بسته سشن‌محلی با کلید
//       hp.advancedOpen (الگوی cs.cloudSetupSkipped ویزارد)؛ عنوان‌های h3 و محتوای بخش‌ها عین قبل.
// ۱.۲۷.۱۲ — دو اشکال کارفرما از v1.27.11 + خودتوضیحی موتور کهنه: (۱) کارت‌های «سرور محلی»/
//       «اتصال ابری» هنگام ساخت خالی می‌ماندند — paint دو پارامتری شد (status, isInitial)؛ پرِ
//       اولیه با بدنهٔ جدا از DOM هم می‌نشیند و گارد «اشتراک کهنه» فقط برای emitهای feed می‌ماند.
//       (۲) کارت سرور ردیف «آدرس محلی» گرفت (serverAddressView — پورت واقعی یا پیش‌فرض ۸۷۸۷؛
//       حالت وب origin) با دکمهٔ «کپی آدرس». (۳) هشدار زرد ناهم‌نسخه‌ای موتور/برنامه
//       (engineAppVersionGapView — مقایسهٔ عددی نقطه‌ای با نرمال‌سازی رقم فارسی) بالای کارت سرور
//       + متن کوتاهش در ردیف بی‌اتصال کارت ابری و توضیح «وضعیت اتصال ابری از سرور نگرفته شد»
//       به‌جای «—» تا موتور کهنهٔ بدون /api/instance-sync/* خودتوضیح باشد (دکمه‌ها/CTA دست‌نخورده).
import { api } from '../api.js';
import { el, icon, emptyState, skeletonState, confirmModal, formModal, toast, toastError, lockBtn } from '../ui.js';
import { fa, formatJalaliDateTime } from '../format.js';

/** فاصلهٔ خوانا به فارسی — از ثانیه */
function ageHuman(sec) {
  if (sec == null) return '—';
  if (sec < 90) return 'لحظه‌ها پیش';
  if (sec < 3600) return `${fa(Math.round(sec / 60))} دقیقه پیش`;
  if (sec < 86400) return `${fa(Math.round(sec / 3600))} ساعت پیش`;
  return `${fa(Math.round(sec / 86400))} روز پیش`;
}

/** آستانهٔ ok درگاه به فارسی */
function thresholdHuman(sec) {
  if (sec < 3600) return `${fa(Math.round(sec / 60))} دقیقه`;
  if (sec < 86400) return `${fa(Math.round(sec / 3600))} ساعت`;
  return `${fa(Math.round(sec / 86400))} روز`;
}

/** عدد با علامت — مثبت «+۲۰»، منفی «−۵»، صفر «۰»، نبود «—» (جهت عددی ltr در سلول) */
function signedNum(n) {
  if (n == null) return '—';
  if (n === 0) return fa(0);
  return `${n > 0 ? '+' : '−'}${fa(Math.abs(n))}`;
}

/** میانگین روزانه با یک رقم اعشار فارسی */
function avgNum(n) {
  if (n == null) return '—';
  return fa(String(n)).replace('.', '٫');
}

/** سلول عددی جدول رشد — جهت ltr تا علامت و رقم جابه‌جا نشوند */
function numCell(value) {
  return el('td', { style: { direction: 'ltr', textAlign: 'center', whiteSpace: 'nowrap' } }, value);
}

/* ── ف۶ — وضعیت هم‌گامی نود ───────────────────────────────────────────────
   قرائت GET /api/node-sync/status (فقط‌مدیر): موتور هم‌گامیِ همین نود با مرکز.
   نگاشت «حالت → برچسب/رنگ» تابع خالص است (syncStateView — بدون DOM) تا بی‌ماک
   سنگین آزمون شود (src/__tests__/front-sync-status.test.ts). درگاه شاید هنوز مستقر
   نباشد؛ پس همهٔ فیلدها اختیاری فرض می‌شوند و هر خرابی فقط همین کارت را degraded
   می‌کند — «وضعیت هم‌گامی نامشخص» بی‌صدا، بقیهٔ پنل سالم می‌ماند (الگوی بخش رشد). */

const SYNC_STATE_VIEWS = {
  synced: { badge: 'badge--success', dot: 'dot--success', short: 'هم‌گام شد', label: 'هم‌گام شد' },
  catching_up: { badge: 'badge--warning', dot: 'dot--warning', short: 'هم‌گام‌سازی جبرانی…', label: 'هم‌گام‌سازی جبرانی در جریان است…' },
  offline: { badge: 'badge--warning', dot: 'dot--warning', short: 'خارج از خط', label: 'خارج از خط — ثبت‌ها محفوظ است' },
  error: { badge: 'badge--error', dot: 'dot--error', short: 'خطای هم‌گامی', label: 'خطای هم‌گامی — تلاش دوباره خودکار می‌شود' },
  idle: { badge: 'badge--neutral', dot: 'dot--neutral', short: 'در انتظار', label: 'در انتظار اولین هم‌گامی' }
};

const SYNC_STATE_UNKNOWN = { badge: 'badge--neutral', dot: 'dot--neutral', short: 'نامشخص', label: 'وضعیت هم‌گامی نامشخص' };

/** حالت هم‌گامی → (برچسب فارسی، کلاس رنگ). حالت ناشناخته/حذف‌شده هم بی‌کرش به «نامشخص» می‌افتد */
export function syncStateView(state) {
  return SYNC_STATE_VIEWS[state] ?? SYNC_STATE_UNKNOWN;
}

const SYNC_ERROR_KIND_VIEWS = { network: 'مشکل شبکه', quota: 'سقف مصرف', version: 'ناسازگاری نسخه' };

/** گونهٔ آخرین خطای هم‌گامی → فارسی؛ گونهٔ ناشناخته/حذف‌شده → «خطای نامشخص» */
export function syncErrorKindView(kind) {
  return SYNC_ERROR_KIND_VIEWS[kind] ?? 'خطای نامشخص';
}

/* ── موج ۱ — نگاشت‌های تازهٔ قرارداد v2 (همه تابع خالص، بی‌DOM — الگوی syncStateView) ──
   قرارداد GET /api/node-sync/status نسخهٔ ۲: version/clock_drift_minutes/clock_warning/last_catchup */

const CATCHUP_SUMMARY_WINDOW_MS = 10 * 60_000; // پیام «هم‌گام شد؛ N رکورد رسید» فقط ۱۰ دقیقه پس از جبران

/**
 * موج ۱ (۱-۳) — هشدار زرد اختلاف ساعت: فقط وقتی clock_warning صریحاً true است پیام می‌دهد؛
 * X = clock_drift_minutes (قدر مطلق). ورودی غایب/ناشناخته = null (بی‌هشدار، بی‌کرش).
 */
export function clockWarningView(clockWarning, driftMinutes) {
  if (clockWarning !== true) return null;
  const m = driftMinutes == null ? Number.NaN : Number(driftMinutes);
  const shown = Number.isFinite(m) ? Math.abs(Math.round(m)) : null;
  return shown === null
    ? 'ساعت این دستگاه تنظیم نیست — با ساعت مرکز اختلاف دارد'
    : `ساعت این دستگاه تنظیم نیست — با ساعت مرکز ${fa(shown)} دقیقه اختلاف دارد`;
}

/**
 * موج ۱ (بقیهٔ ۱-۱) — خط سبز پس از جبران کامل: state=synced و خلاصهٔ catch-up در
 * پنجرهٔ ۱۰دقیقه‌ای باشد → «هم‌گام شد؛ N رکورد رسید»؛ اگر فقط یک جهت nonzero بوده
 * فعل متناسب می‌آید (ارسال شد/دریافت شد). خارج از پنجره/بی‌خلاصه/دستاورد صفر = null
 * (خط سبز عادی «هم‌گام شد» سر جایش می‌ماند).
 */
export function catchupSummaryView(state, lastCatchup, nowMs = Date.now()) {
  if (state !== 'synced' || !lastCatchup || typeof lastCatchup !== 'object') return null;
  const at = isoMsOf(lastCatchup.at);
  if (at === null) return null;
  const age = nowMs - at;
  if (age > CATCHUP_SUMMARY_WINDOW_MS || age < -60_000) return null; // کج‌ساعت جزئی مُهر آینده پذیرفته است
  const pulled = Number(lastCatchup.pulled) || 0;
  const pushed = Number(lastCatchup.pushed) || 0;
  const n = pulled + pushed;
  if (n <= 0) return null;
  if (pulled > 0 && pushed > 0) return `هم‌گام شد؛ ${fa(n)} رکورد رسید`;
  if (pushed > 0) return `هم‌گام شد؛ ${fa(n)} رکورد ارسال شد`;
  return `هم‌گام شد؛ ${fa(n)} رکورد دریافت شد`;
}

/**
 * موج ۱ (۱-۴) — خط نسخه‌های دیده‌شده از هندشیک: «نسخهٔ نود X · حداقل نسخهٔ مرکز Y»؛
 * هیچ عددی در پاکت نباشد = null.
 */
export function versionNumbersView(version) {
  if (!version || typeof version !== 'object') return null;
  const client = typeof version.client === 'string' && version.client ? version.client : null;
  const center = typeof version.center === 'string' && version.center ? version.center : null;
  if (client === null && center === null) return null;
  return `نسخهٔ نود ${client ?? '—'} · حداقل نسخهٔ مرکز ${center ?? '—'}`;
}

/**
 * موج ۱ (۱-۴) — ردیف قرمز ناسازگاری نسخه: فقط وقتی compatible صریحاً false است؛
 * با ردیف paused_version یکپارچه می‌شود (همان پیام/همان رنگ، بدون دو ردیف دوباره).
 */
export function versionIncompatView(version) {
  if (!version || typeof version !== 'object' || version.compatible !== false) return null;
  return {
    message: 'نسخه ناسازگار — اول مرکز را ارتقا دهید',
    detail: versionNumbersView(version)
  };
}

/* ── EXP-1 — آشتی‌ساز (قرارداد v3) و EXP-2 — مصرف مرکز (برآوردی) ───────────────────
   هر دو تابع خالص و بی‌DOM (الگوی clockWarningView) تا بی‌ماک سنگین آزمون شوند.
   آشتی‌ساز فقط-گزارش است؛ مصرف مرکز شاید اصلاً در دسترس نباشد (پنل روی نود اجرا می‌شود
   و مسیر فقط-مدیر مرکز را ندارد) — خرابی فقط همین کارت را degraded می‌کند. */

const RECONCILE_WINDOW_MS = 10 * 60_000; // پیام آشتی‌ساز فقط ۱۰ دقیقه پس از مقایسه معتبر است

/**
 * EXP-1 — ردیف آشتی‌ساز از فیلد reconciliation وضعیت v3:
 *  • ok=true و differences=0 (در پنجرهٔ ۱۰دقیقه‌ای) → سبز «آشتی‌ساز: همهٔ دامنه‌ها هم‌شمار»؛
 *  • ok=false → زرد «آشتی‌ساز: ناهم‌خوانی در K دامنه — بررسی لازم»؛
 *  • نتیجهٔ کهنه/غایب/خراب → null (ردیف اصلاً رندر نمی‌شود).
 */
export function reconciliationView(recon, nowMs = Date.now()) {
  if (!recon || typeof recon !== 'object') return null;
  const atMs = isoMsOf(recon.at);
  if (atMs === null) return null;
  const age = nowMs - atMs;
  if (age > RECONCILE_WINDOW_MS || age < -60_000) return null; // کج‌ساعت جزئی مُهر آینده پذیرفته است
  const diffs = Number(recon.differences);
  if (recon.ok === true && diffs === 0) return { tone: 'ok', message: 'آشتی‌ساز: همهٔ دامنه‌ها هم‌شمار' };
  if (recon.ok === false) {
    const k = Number.isFinite(diffs) && diffs > 0 ? diffs : null;
    return {
      tone: 'warn',
      message: k !== null ? `آشتی‌ساز: ناهم‌خوانی در ${fa(k)} دامنه — بررسی لازم` : 'آشتی‌ساز: ناهم‌خوانی در دامنه‌ها — بررسی لازم'
    };
  }
  return null;
}

/** EXP-1 — خط جزئیات ردیف‌های ناهم‌خوانی: «library — مرکز ۴۰ · این دستگاه ۳۹» (حداکثر ۳) */
export function reconciliationDetailView(detail) {
  if (!Array.isArray(detail) || detail.length === 0) return null;
  const parts = detail.slice(0, 3).map((d) => {
    if (!d || typeof d !== 'object' || typeof d.domain !== 'string') return null;
    const c = Number(d.center);
    const l = Number(d.local);
    const centerTxt = Number.isFinite(c) ? fa(c) : '—';
    const localTxt = Number.isFinite(l) ? fa(l) : '—';
    return `${d.domain} — مرکز ${centerTxt} · این دستگاه ${localTxt}`;
  }).filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** EXP-2 — سطح مصرف → کلاس رنگ نشان: سبز/زرد/قرمز؛ سطح ناشناخته → خنثی */
export function quotaLevelView(level) {
  if (level === 'ok') return 'badge--success';
  if (level === 'warn') return 'badge--warning';
  if (level === 'danger') return 'badge--error';
  return 'badge--neutral';
}

/** EXP-2 — درصد به رقم فارسی با ممیز فارسی؛ ورودی غایب/خراب → «—» */
function pctNum(n) {
  if (n == null) return '—';
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return fa(String(Math.round(v * 10) / 10)).replace('.', '٫');
}

/** EXP-2 — عدد شمارنده به رقم فارسی؛ ورودی غایب/خراب → «—» */
function countNum(n) {
  const v = Number(n);
  return Number.isFinite(v) && v >= 0 ? fa(Math.round(v)) : '—';
}

/**
 * EXP-2 — ردیف «ورود ناموفق ۲۴ ساعت»: زرد وقتی ≥ ۵؛ ورودی غایب → خنثی با «—».
 */
export function failedLoginsView(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return { cls: 'badge--neutral', text: '—' };
  return { cls: v >= 5 ? 'badge--warning' : 'badge--neutral', text: fa(Math.round(v)) };
}

/** ISO معتبر → مُهر میلی‌ثانیه؛ ورودی خراب/حذف‌شده → null (تا NaN به تاریخ فارسی نشت نکند) */
function isoMsOf(iso) {
  if (typeof iso !== 'string' || !iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** تازه‌ترین ISO معتبر میان چند مُهر — «آخرین هم‌گامی» از جفت push/pull */
function newestIso(...isos) {
  let best = null;
  let bestMs = -1;
  for (const iso of isos) {
    const ms = isoMsOf(iso);
    if (ms !== null && ms > bestMs) { bestMs = ms; best = iso; }
  }
  return best;
}

/** پوشش پاسخ درگاه وضعیت: پاکت {data:…} سرور باز می‌شود؛ پاسخِ بی‌هیچ فیلد شناخته → null */
function unwrapNodeSyncStatus(payload) {
  const raw = payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object'
    ? payload.data
    : payload;
  if (!raw || typeof raw !== 'object') return null;
  const known = ['mode', 'state', 'pending_push', 'last_push_ok_at', 'last_pull_ok_at', 'last_error', 'version']
    .some((k) => k in raw);
  return known ? raw : null;
}

function syncSection(sync, syncError) {
  const view = syncStateView(sync?.state);
  const paused = sync?.mode === 'paused_version';
  const headBadge = !sync
    ? el('span', { class: 'badge badge--neutral' }, 'نامشخص')
    : paused
      ? el('span', { class: 'badge badge--error' }, 'توقف نسخه')
      : el('span', { class: `badge ${view.badge}` }, view.short);

  /* موج ۱ — خط سبز پس از جبران کامل: در پنجرهٔ ۱۰دقیقه‌ای «هم‌گام شد؛ N رکورد رسید» جای برچسب عادی می‌نشیند */
  const summaryLine = catchupSummaryView(sync?.state, sync?.last_catchup);

  /* موج ۱ — هشدار زرد اختلاف ساعت (۱-۳) — فقط-اطلاعاتی؛ رفتار سینک عوض نمی‌کند */
  const clockMessage = clockWarningView(sync?.clock_warning === true, sync?.clock_drift_minutes);

  /* خط‌های جزئیات: آخرین هم‌گامی (وقتی هم‌گام است)، رکوردهای محفوظ در انتظار ارسال، گونهٔ خطا + زمان */
  const sub = [];
  if (sync?.state === 'synced') {
    const lastOk = newestIso(sync?.last_push_ok_at, sync?.last_pull_ok_at);
    const ms = isoMsOf(lastOk);
    if (ms !== null) {
      sub.push(`آخرین هم‌گامی: ${ageHuman(Math.max(0, Math.round((Date.now() - ms) / 1000)))} (${formatJalaliDateTime(lastOk)})`);
    }
  }
  const pending = Number(sync?.pending_push);
  if (Number.isFinite(pending) && pending > 0) {
    sub.push(`${fa(pending)} رکورد در انتظار ارسال — محفوظ است`);
  }
  if (sync?.state === 'error' && sync?.last_error && typeof sync.last_error === 'object') {
    const kindText = syncErrorKindView(sync.last_error?.kind);
    const atText = isoMsOf(sync.last_error?.at) !== null ? formatJalaliDateTime(sync.last_error.at) : null;
    sub.push(atText ? `${kindText} — ${atText}` : kindText);
  }
  if (sub.length === 0) sub.push('—');

  /* موج ۱ (۱-۴) — ردیف نسخهٔ ناسازگار یکپارچه: paused_version یا compatible=false — هر دو یک ردیف قرمز */
  const version = sync?.version && typeof sync.version === 'object' ? sync.version : null;
  const incompat = versionIncompatView(version);
  const versionLine = versionNumbersView(version);
  const showVersionRow = Boolean(paused || incompat);

  /* EXP-1 — ردیف آشتی‌ساز از فیلد reconciliation وضعیت v3 (کهنه/غایب = بدون ردیف) */
  const reconcile = sync?.reconciliation && typeof sync.reconciliation === 'object' ? sync.reconciliation : null;
  const reconcileView = reconciliationView(reconcile);
  const reconcileDetail = reconcileView?.tone === 'warn' ? reconciliationDetailView(reconcile?.detail) : null;

  return el('div', { class: 'card card__body--flush', style: { marginBottom: 'var(--sp-4)' } },
    el('div', { class: 'ob-section__head' },
      el('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' } },
        el('h3', { style: { margin: 0 } }, 'وضعیت هم‌گامی'),
        headBadge
      ),
      el('p', { class: 'hint-text', style: { margin: '4px 0 0' } },
        'موتور هم‌گامیِ همین نود با مرکز — ثبت‌های «در انتظار ارسال» روی خود نود محفوظ‌اند و با بازگشت خط، ارسال خودکار از سر گرفته می‌شود؛ وضعیت با همان بازخوانی ۶۰ثانیه‌ای پنل تازه می‌شود.')
    ),
    el('div', {},
      syncError
        ? el('div', { class: 'card__body' },
            el('p', { class: 'hint-text' },
              `وضعیت هم‌گامی نامشخص — خواندن درگاه وضعیت ناموفق بود: ${syncError?.message ?? 'خطای نامشخص'}؛ بقیهٔ پنل سالم است.`))
        : !sync
          ? el('div', { class: 'card__body' },
              el('p', { class: 'hint-text' },
                'وضعیت هم‌گامی نامشخص — پاسخ درگاه وضعیت خوانا نبود؛ اگر سامانه تازه ارتقا یافته، شاید این درگاه هنوز در آن نسخه مستقر نشده باشد.'))
          : [
              el('div', { class: 'ob-row' },
                el('div', { class: 'ob-row__main' },
                  el('div', { class: 'cell-main' },
                    el('span', { class: `dot ${view.dot}`, style: { marginInlineEnd: 'var(--sp-2)' } }),
                    summaryLine ?? view.label),
                  el('div', { class: 'cell-sub' }, sub.join(' · '))
                )
              ),
              clockMessage
                ? el('div', { class: 'ob-row' },
                    el('div', { class: 'ob-row__main' },
                      el('div', { class: 'cell-main' }, clockMessage),
                      el('div', { class: 'cell-sub' }, 'فقط هشدار نمایشی است — ثبت‌ها با مُهر خودشان مرتب می‌مانند')),
                    el('div', { class: 'ob-row__side' },
                      el('span', { class: 'badge badge--warning' }, 'اختلاف ساعت'))
                  )
                : null,
              reconcileView
                ? el('div', { class: 'ob-row' },
                    el('div', { class: 'ob-row__main' },
                      el('div', { class: 'cell-main' }, reconcileView.message),
                      reconcileDetail ? el('div', { class: 'cell-sub' }, reconcileDetail) : null
                    ),
                    el('div', { class: 'ob-row__side' },
                      el('span', { class: `badge ${reconcileView.tone === 'ok' ? 'badge--success' : 'badge--warning'}` },
                        reconcileView.tone === 'ok' ? 'هم‌شمار' : 'بررسی لازم'))
                  )
                : null,
              showVersionRow
                ? el('div', { class: 'ob-row' },
                    el('div', { class: 'ob-row__main' },
                      el('div', { class: 'cell-main' }, incompat ? incompat.message : 'نسخه ناسازگار — اول مرکز را ارتقا دهید'),
                      versionLine ? el('div', { class: 'cell-sub' }, versionLine) : null
                    ),
                    el('div', { class: 'ob-row__side' },
                      el('span', { class: 'badge badge--error' }, 'توقف نسخه'))
                  )
                : null
            ]
    )
  );
}

const STATE_META = {
  ok: { cls: 'badge badge--success', label: 'سالم' },
  stale: { cls: 'badge badge--warning', label: 'کهنه‌شده' },
  never: { cls: 'badge badge--neutral', label: 'بی‌موفقیت' }
};

function infoRow(label, valueEl) {
  return el('div', { class: 'ob-row' },
    el('div', { class: 'ob-row__main' },
      el('div', { class: 'cell-main' }, label),
      el('div', { class: 'cell-sub' }, valueEl)
    )
  );
}

function channelRow(ch) {
  const meta = STATE_META[ch.state] ?? STATE_META.never;
  const side = [];
  if (ch.success_at) {
    side.push(`آخرین موفقیت: ${ageHuman(ch.age_s)} (${formatJalaliDateTime(ch.success_at)})`);
  } else {
    side.push('هنوز هیچ موفقیتی ثبت نشده');
  }
  if (ch.attempt_at) side.push(`آخرین تلاش: ${formatJalaliDateTime(ch.attempt_at)}`);
  side.push(`آستانهٔ هشدار: ${thresholdHuman(ch.threshold_s)}`);
  return el('div', { class: 'ob-row' },
    el('div', { class: 'ob-row__main' },
      el('div', { class: 'cell-main' }, ch.label),
      el('div', { class: 'cell-sub' }, side.join(' · '))
    ),
    el('div', { class: 'ob-row__side' },
      el('span', { class: meta.cls }, meta.label),
      el('span', { class: 'badge badge--neutral' }, ch.direction === 'pull' ? 'CP→نود' : 'نود→CP')
    )
  );
}

/* ── ف۴ — گزارش رشد جدول‌ها ───────────────────────────────────────────────
   شمارش ردیف‌ها هر شب در کرون دایجست انجام می‌شود (جدول table_growth_snapshots — مایگریشن 0107)؛
   این بخش فقط خواندن snapshotهاست. جدول‌های «بی‌سیاست» بالای فهرست می‌آیند — کارکرد اصلی گزارش
   لو دادن جدول‌های بدون خط‌مشی نگه‌داری است (طرح §۵-۳). */

const POLICY_BADGE = {
  'بی‌سیاست': 'badge--error',
  'فقط-افزودنی': 'badge--success',
  'پاکسازی دوره‌ای': 'badge--success',
  '۱۸۰ روز': 'badge--neutral',
  '۹۰ روز': 'badge--neutral',
  'بازنویسی روزانه (خودپایش)': 'badge--neutral'
};

function growthRow(t) {
  const countMain = t.latest_count != null ? fa(t.latest_count) : '—';
  const countSub = [
    t.latest_date ? `شمارش ${formatJalaliDateTime(t.latest_date)}` : null,
    t.live_count != null && t.latest_count != null && t.live_count !== t.latest_count ? `زندهٔ همین لحظه: ${fa(t.live_count)}` : null
  ].filter(Boolean).join(' · ');
  const badgeCls = POLICY_BADGE[t.policy] ?? 'badge--neutral';
  return el('tr', {},
    el('td', { style: { fontWeight: 500 } }, t.table_name),
    el('td', { style: { direction: 'ltr', textAlign: 'center', whiteSpace: 'nowrap' } },
      el('div', {}, countMain),
      countSub ? el('div', { class: 'hint-text', style: { fontSize: '0.72rem', whiteSpace: 'normal' } }, countSub) : null
    ),
    numCell(signedNum(t.delta_7d)),
    numCell(signedNum(t.delta_30d)),
    numCell(avgNum(t.avg_daily)),
    el('td', { style: { textAlign: 'center', whiteSpace: 'nowrap' } },
      el('span', { class: `badge ${badgeCls}` }, t.policy)
    )
  );
}

/* ── ف۵ (P0-3 حداقلی) — هشدارهای فعال ─────────────────────────────────────────
   همان دادهٔ پنل، با حکم محلی-نودی: جهش خطاهای مرورگر در ۲۴ ساعت. م۲۱۰ (حکم کارفرما:
   «هشدارها سمت نود نیایند، سمت CP بیایند») — رانش مُهر تلاش/موفقیت درگاه‌های CP دیگر در
   نود هشدار نمی‌شود؛ مالکیتش کنترل‌پلین است (CP m9 — channel_alerts با ack/resolve).
   زنگ‌زنِ خودکار هر شب در کرون دایجست همین حکم را می‌گیرد و اگر بات تنظیم باشد پیام
   فارسی برای مدیر(ها) می‌فرستد؛ مُهر آخرین ارزیابی از settings می‌آید. */

const SEVERITY_META = {
  error: { cls: 'badge--error', label: 'فوری' },
  warning: { cls: 'badge--warning', label: 'هشدار' }
};

function alertsSection(alerts, lastEvaluatedAt) {
  const count = (alerts ?? []).length;
  const headBadge = count === 0
    ? el('span', { class: 'badge badge--success' }, 'هیچ هشدار فعالی نیست')
    : el('span', { class: 'badge badge--error' }, `${fa(count)} هشدار فعال`);
  const stamp = lastEvaluatedAt
    ? `آخرین ارزیابی خودکار: ${formatJalaliDateTime(lastEvaluatedAt)}`
    : 'هنوز ارزیابی خودکار شبانه‌ای انجام نشده — با نخستین کرون دایجست مُهر می‌خورد';
  return el('div', { class: 'card card__body--flush', style: { marginBottom: 'var(--sp-4)' } },
    el('div', { class: 'ob-section__head' },
      el('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' } },
        el('h3', { style: { margin: 0 } }, 'هشدارهای فعال'),
        headBadge
      ),
      el('p', { class: 'hint-text', style: { margin: '4px 0 0' } },
        `${stamp} — ارزیابی هر شب در کرون دایجست انجام می‌شود و وقتی هشدار باشد، پیام فارسی برای مدیر روی همان کانال بات می‌آید؛ این بخش همان حکم را زنده نشان می‌دهد. م۲۱۰: تنها قاعدهٔ هشدار این نود جهش خطاهای مرورگر در ۲۴ ساعت است — هشدار رانش مُهر درگاه‌های CP فقط در کنترل‌پلین ساخته می‌شود و اینجا نمی‌آید؛ جدول درگاه‌های CP پایین، همان دادهٔ واقعی را بدون پیام هشدار نشان می‌دهد.`)
    ),
    count === 0
      ? el('div', {}, el('div', { class: 'ob-row' },
          el('div', { class: 'ob-row__main' },
            el('div', { class: 'cell-main' }, 'همهٔ درگاه‌ها و شمارنده‌ها زیر آستانه‌اند'),
            el('div', { class: 'cell-sub' }, 'اگر مشکلی پیش بیاید، همین‌جا و کانال بات خودش را نشان می‌دهد')))
        )
      : el('div', {}, (alerts ?? []).map((alert) => {
          const meta = SEVERITY_META[alert.severity] ?? SEVERITY_META.warning;
          return el('div', { class: 'ob-row' },
            el('div', { class: 'ob-row__main' },
              el('div', { class: 'cell-main' }, alert.message)),
            el('div', { class: 'ob-row__side' },
              el('span', { class: `badge ${meta.cls}` }, meta.label),
              el('span', { class: 'badge badge--neutral' }, alert.code))
          );
        }))
  );
}

function growthSection(growth, growthError) {
  const headBadge = growth
    ? el('span', { class: 'badge badge--neutral' },
        growth.snapshot_days > 0
          ? `تاریخچهٔ ${fa(growth.snapshot_days)} روز شمارش`
          : 'هنوز شمارشی ثبت نشده — با اولین کرون شبانه پُر می‌شود')
    : null;
  const stamp = growth?.last_snapshot_at
    ? `آخرین شمارش شبانه: ${formatJalaliDateTime(growth.last_snapshot_at)}`
    : 'هنوز هیچ شمارش شبانه‌ای انجام نشده است';
  return el('div', { class: 'card', style: { marginBottom: 'var(--sp-4)' } },
    el('div', { class: 'card__head' },
      el('h3', { style: { margin: 0 } }, 'گزارش رشد جدول‌ها'),
      headBadge
    ),
    el('div', { class: 'card__body--flush' },
      growthError
        ? el('div', { class: 'card__body' },
            el('p', { class: 'hint-text' }, `خواندن گزارش رشد ناموفق بود: ${growthError?.message ?? 'خطای نامشخص'} — بقیهٔ پنل سالم است.`))
        : [
            el('p', { class: 'hint-text', style: { padding: '0 var(--sp-4)', margin: 'var(--sp-3) 0 0' } },
              `${stamp} — شمارش ردیف‌ها هر شب در کرون دایجست انجام می‌شود (هرگز در مسیر درخواست). ستون «سیاست» خط‌مشی نگه‌داری هر جدول است؛ «بی‌سیاست» یعنی هیچ سقف حذف/پاکسازی‌ای ندارد و بدون تصمیم، بی‌کران رشد می‌کند — این جدول‌ها عمداً بالای فهرست می‌آیند.`),
            el('div', { class: 'table-wrap' },
              el('table', { class: 'table' },
                el('thead', {}, el('tr', {},
                  el('th', { scope: 'col' }, 'نام جدول'),
                  el('th', { scope: 'col', style: { textAlign: 'center' } }, 'ردیف‌ها'),
                  el('th', { scope: 'col', style: { textAlign: 'center' } }, 'رشد ۷روز'),
                  el('th', { scope: 'col', style: { textAlign: 'center' } }, 'رشد ۳۰روز'),
                  el('th', { scope: 'col', style: { textAlign: 'center' } }, 'میانگین روزانه'),
                  el('th', { scope: 'col', style: { textAlign: 'center' } }, 'سیاست')
                )),
                el('tbody', {}, (growth?.tables ?? []).map(growthRow))
              )
            )
          ]
    )
  );
}

/* ── EXP-2 — کارت «مصرف مرکز (برآوردی)» ──────────────────────────────────────
   قرائت GET /api/central/quota (فقط-مدیر مرکز) در همان بازخوانی ۶۰ثانیه‌ای. پنل شاید روی
   نود اجرا شود و مسیر فقط-مدیر مرکز در دسترس نباشد — خرابی فقط همین کارت را degraded
   می‌کند: خاکستری «دریافت نشد» و بقیهٔ پنل سالم می‌ماند (الگوی بخش رشد).
   سه ردیف درصد با رنگ سطح (ok سبز / warn زرد / danger قرمز) + ردیف «ورود ناموفق ۲۴ ساعت». */

const QUOTA_ROWS = [
  { key: 'requests', label: 'درخواست‌ها' },
  { key: 'rows_written', label: 'نوشتن‌ها' },
  { key: 'rows_read', label: 'خواندن‌ها' }
];

/** پوشش پاسخ درگاه سهمیه: پاکت {data:…} باز می‌شود؛ پاسخ بی‌هیچ فیلد شناخته → null */
function unwrapQuota(payload) {
  const raw = payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object'
    ? payload.data
    : payload;
  if (!raw || typeof raw !== 'object') return null;
  const known = ['day', 'requests', 'rows_written', 'percent', 'level', 'failed_logins_24h'].some((k) => k in raw);
  return known ? raw : null;
}

function quotaRowFa(label, percent, level, used, limit) {
  const meta = quotaLevelView(level);
  const pctText = `${pctNum(percent)}٪`;
  const sub = used != null && limit != null ? `${countNum(used)} از ${countNum(limit)}` : null;
  return el('div', { class: 'ob-row' },
    el('div', { class: 'ob-row__main' },
      el('div', { class: 'cell-main' }, label),
      sub ? el('div', { class: 'cell-sub' }, sub) : null
    ),
    el('div', { class: 'ob-row__side' },
      el('span', { class: `badge ${meta}` }, pctText)
    )
  );
}

function quotaSection(quota, quotaError) {
  const q = quotaError ? null : quota;
  const headBadge = q
    ? el('span', { class: 'badge badge--neutral' }, q.day ? `روز ${q.day}` : 'برآوردی')
    : el('span', { class: 'badge badge--neutral' }, 'دریافت نشد');
  return el('div', { class: 'card card__body--flush', style: { marginBottom: 'var(--sp-4)' } },
    el('div', { class: 'ob-section__head' },
      el('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' } },
        el('h3', { style: { margin: 0 } }, 'مصرف مرکز (برآوردی)'),
        headBadge
      ),
      el('p', { class: 'hint-text', style: { margin: '4px 0 0' } },
        'سهمیهٔ روزانهٔ مرکز ابری با برآوردِ خواندن — سه شاخص با سطح رنگی؛ ورود ناموفق ۲۴ ساعت همان آمار امنیتی مرکز است. این درگاه فقط-مدیر مرکز است؛ اگر پنل روی نود اجرا شود همین کارت «دریافت نشد» می‌گیرد و بقیهٔ پنل سالم می‌ماند.')
    ),
    !q
      ? el('div', {},
          el('div', { class: 'ob-row' },
            el('div', { class: 'ob-row__main' },
              el('div', { class: 'cell-main' }, 'دریافت نشد'),
              el('div', { class: 'cell-sub' },
                quotaError?.message
                  ? `خواندن درگاه سهمیه ناموفق بود: ${quotaError.message}`
                  : 'درگاه سهمیهٔ مرکز از این دستگاه در دسترس نیست — بقیهٔ پنل سالم است.'))
          )
        )
      : [
          ...QUOTA_ROWS.map((row) => {
            const percent = q.percent && typeof q.percent === 'object' ? q.percent[row.key] : null;
            const level = q.level && typeof q.level === 'object' ? q.level[row.key] : null;
            const used = q[row.key];
            const limit = q.limits && typeof q.limits === 'object' ? q.limits[row.key] : null;
            return quotaRowFa(row.label, percent, level, used, limit);
          }),
          (() => {
            const fl = failedLoginsView(q.failed_logins_24h);
            return el('div', { class: 'ob-row' },
              el('div', { class: 'ob-row__main' },
                el('div', { class: 'cell-main' }, 'ورود ناموفق ۲۴ ساعت'),
                el('div', { class: 'cell-sub' }, 'تلاش‌های ورود ردشدهٔ مرکز در یک روز گذشته — پنج یا بیشتر زرد می‌شود')),
              el('div', { class: 'ob-row__side' },
                el('span', { class: `badge ${fl.cls}` }, fl.text))
            );
          })()
        ]
  );
}

/* ── EXP-4 — بنر نگهبان موتور (فقط-دسکتاپ، گارد کامل) ─────────────────────────
   Rust نگهبان موتور رویدادهای engine:restarting {attempt, delay_ms} / engine:restored {port}
   / engine:down {attempts} + M4: engine:degraded {kind, message} / engine:degraded_recovered
   {kind, message} را emit می‌کند (desktop/src-tauri/src/lib.rs). کانال دریافت:
   window.__TAURI__.event.listen — با withGlobalTauri در tauri.conf.json فعال می‌شود.
   همه‌چیز گاردشده است: بیرون پوستهٔ دسکتاپ (مرورگر/آزمون/IPC ردشده) کل تابع no-op می‌ماند
   و SPA هرگز نمی‌شکند. بنر ثابت بالای صفحه: زرد راه‌اندازی دوباره، سبز «دوباره راه افتاد»
   با پنهان‌شدن خودکار ۱۰ثانیه‌ای، قرمز ماندگار «پاسخ نمی‌دهد»؛ M4: زرد ماندگار Degraded
   (فقط ورکر بازی‌ها پایین است — سرویس اصلی سالم و اپ کار می‌کند) و سبز بازگشت آن. */

const ENGINE_BANNER_ID = 'engine-watchdog-banner';
const ENGINE_BANNER_AUTOHIDE_MS = 10_000;
let engineWatchdogInstalled = false;
let engineBannerHideTimer = null;

const ENGINE_BANNER_TONES = {
  warn: { background: '#fef9c3', color: '#854d0e', border: '#fde047' },
  ok: { background: '#dcfce7', color: '#166534', border: '#86efac' },
  danger: { background: '#fee2e2', color: '#991b1b', border: '#fca5a5' }
};

/** گرهٔ بنر — تک‌نمونه روی body؛ در محیط بی‌DOM هرگز ساخته نمی‌شود */
function engineBannerNode() {
  if (typeof document === 'undefined') return null;
  const existing = document.getElementById(ENGINE_BANNER_ID);
  if (existing) return existing;
  const banner = el('div', {
    id: ENGINE_BANNER_ID,
    role: 'status',
    'aria-live': 'polite',
    style: {
      position: 'fixed',
      top: '12px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '9999',
      padding: '8px 18px',
      borderRadius: '10px',
      fontSize: '0.85rem',
      fontWeight: '600',
      boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
      display: 'none',
      maxWidth: 'min(92vw, 560px)',
      textAlign: 'center'
    }
  });
  document.body.appendChild(banner);
  return banner;
}

function showEngineBanner(tone, text, autoHide) {
  const banner = engineBannerNode();
  if (!banner) return;
  if (engineBannerHideTimer) { clearTimeout(engineBannerHideTimer); engineBannerHideTimer = null; }
  const t = ENGINE_BANNER_TONES[tone] ?? ENGINE_BANNER_TONES.warn;
  banner.style.background = t.background;
  banner.style.color = t.color;
  banner.style.border = `1px solid ${t.border}`;
  banner.textContent = text;
  banner.style.display = 'block';
  if (autoHide) {
    engineBannerHideTimer = setTimeout(() => {
      banner.style.display = 'none';
      engineBannerHideTimer = null;
    }, ENGINE_BANNER_AUTOHIDE_MS);
  }
}

/**
 * EXP-4 — نصب یک‌بارهٔ گوش‌دادن‌های نگهبان موتور. خروجی فقط برای آزمون/تشخیص:
 * { installed: false, reason } یعنی کانال Tauri در دسترس نیست (مرورگر/آزمون) و هیچ چیز
 * نصب نشده — SPA در مرورگر و آزمون‌ها بی‌کرش ادامه می‌دهد.
 */
export function installEngineWatchdogBanner() {
  if (engineWatchdogInstalled) return { installed: true };
  try {
    const tauri = globalThis.__TAURI__;
    const listen = tauri && tauri.event && typeof tauri.event.listen === 'function' ? tauri.event.listen : null;
    if (!listen) return { installed: false, reason: 'no-tauri-channel' };
    if (typeof document === 'undefined') return { installed: false, reason: 'no-document' };
    engineWatchdogInstalled = true;
    void (async () => {
      try {
        await listen('engine:restarting', (ev) => {
          const attempt = ev?.payload?.attempt;
          const shown = Number.isFinite(Number(attempt)) && Number(attempt) > 0 ? fa(Math.round(Number(attempt))) : '—';
          showEngineBanner('warn', `موتور در حال راه‌اندازی دوباره… (تلاش ${shown})`, false);
        });
        await listen('engine:restored', () => {
          showEngineBanner('ok', 'موتور دوباره راه افتاد', true); // پنهان‌شدن خودکار ۱۰ثانیه‌ای
        });
        await listen('engine:down', (ev) => {
          const attempts = ev?.payload?.attempts;
          const n = Number.isFinite(Number(attempts)) && Number(attempts) > 0 ? fa(Math.round(Number(attempts))) : null;
          showEngineBanner('danger', `موتور پاسخ نمی‌دهد${n ? ` — پس از ${n} تلاش` : ''} — صفحهٔ بوت را باز کنید`, false); // ماندگار
        });
        // M4 — ناسالمی مستقل ورکر بازی‌ها با سرویس اصلی سالم: زرد ماندگار تا بازگشت سلامت؛
        // پیام فارسی از payload رخداد (lib.rs) می‌آید — پیام غایب/خراب → پیام پیش‌فرض بی‌کرش
        // (متن پیش‌فرض عین واژگان payload سرور می‌ماند — پین front-sync-status.test.ts)
        await listen('engine:degraded', (ev) => {
          const msg = typeof ev?.payload?.message === 'string' && ev.payload.message
            ? ev.payload.message
            : 'ورکر بازی‌ها پاسخ نمی‌دهد — سرویس اصلی سالم است';
          showEngineBanner('warn', msg, false); // ماندگار تا engine:degraded_recovered
        });
        await listen('engine:degraded_recovered', (ev) => {
          const msg = typeof ev?.payload?.message === 'string' && ev.payload.message
            ? ev.payload.message
            : 'ورکر بازی‌ها دوباره پاسخ می‌دهد';
          showEngineBanner('ok', msg, true); // پنهان‌شدن خودکار ۱۰ثانیه‌ای
        });
      } catch {
        // IPC گوش‌دادن ناموفق (مثلاً مجوز رد شد) — نرم؛ بنر هرگز SPA را نمی‌شکند
      }
    })();
    return { installed: true };
  } catch {
    return { installed: false, reason: 'unexpected' };
  }
}

/** بازنشانی گارد بنر — فقط آزمون */
export function resetEngineWatchdogBannerForTests() {
  engineWatchdogInstalled = false;
  if (engineBannerHideTimer) { clearTimeout(engineBannerHideTimer); engineBannerHideTimer = null; }
}

/* ── موج ۴ (۴-۱) — پنج سیگنال §۴ نقد، هرکدام سه رنگ + دکمهٔ اقدام ────────────────
   منبع: docs/FAILURE-CRITIQUE.fa.md §۴ — «این پنج سیگنال، ۹۰٪ سناریوها را پیش از فاجعه
   معلوم می‌کنند». همهٔ نگاشت‌ها تابع خالص بی‌DOM (الگوی syncStateView) تا بی‌ماک سنگین
   آزمون شوند. tone: ok سبز / warn زرد / error قرمز / unknown خاکستری (درگاه ناآشنا). */

const SIGNAL_TONES = {
  ok: { badge: 'badge--success', dot: 'dot--success' },
  warn: { badge: 'badge--warning', dot: 'dot--warning' },
  error: { badge: 'badge--error', dot: 'dot--error' },
  unknown: { badge: 'badge--neutral', dot: 'dot--neutral' }
};

/** tone → کلاس نشان/نقطهٔ رنگی؛ ناشناخته → خنثی */
export function healthToneView(tone) {
  return SIGNAL_TONES[tone] ?? SIGNAL_TONES.unknown;
}

/**
 * ۴-۱ سیگنال ۱ — موتور محلی. ورودی: پاکت GET /api/health/panel (همان `data` reload).
 * db.ok = پایگاه محلی سالم؛ فیلد بازی‌ها افزوده‌ای است و شاید در نسخه‌های قدیمی‌تر غایب باشد —
 * غایب = بی‌اثر؛ حاضر و ok=false = زرد. پاسخ ناآشنا = قرمز «پاسخ نمی‌دهد».
 */
export function engineSignalView(data) {
  if (!data || typeof data !== 'object') {
    return { tone: 'error', label: 'پاسخ نمی‌دهد', detail: 'درگاه سلامت موتور خوانا نبود' };
  }
  const dbOk = data?.db?.ok === true;
  const version = typeof data?.version === 'string' && data.version ? data.version : null;
  // فیلد افزودهٔ games {ok, port} — با گارد کامل؛ نسخهٔ قدیمی‌تر بدون آن سبز عادی می‌ماند
  const games = data?.games && typeof data.games === 'object' ? data.games : null;
  const parts = [];
  if (version) parts.push(`نسخهٔ ${version}`);
  if (games && games.ok === false) parts.push('بخش بازی‌ها در دسترس نیست');
  if (!dbOk) parts.unshift('پایگاه محلی پاسخ نمی‌دهد');
  let tone = dbOk ? 'ok' : 'error';
  let label = dbOk ? 'سالم' : 'پاسخ نمی‌دهد';
  if (dbOk && games && games.ok === false) { tone = 'warn'; label = 'ناتمام — بازی‌ها'; }
  return { tone, label, detail: parts.length > 0 ? parts.join(' · ') : '—' };
}

/**
 * ۴-۱ سیگنال ۲ — مرکز. ورودی: پاکت GET /api/node-sync/status (+nowMs برای آزمون).
 * هندشیک نسخه قرمز می‌دهد؛ خطای هم‌گامی قرمز؛ خارج از خط/در انتظار زرد («داده محفوظ است»)؛
 * هم‌گام با نسخهٔ مرکز سبز. وضعیت آینه غایب/ناآشنا = خاکستری.
 */
export function centerSignalView(sync, nowMs = Date.now()) {
  if (!sync || typeof sync !== 'object') {
    return { tone: 'unknown', label: 'نامشخص', detail: 'وضعیت هم‌گامی برای سنجش مرکز در دسترس نیست' };
  }
  const version = sync.version && typeof sync.version === 'object' ? sync.version : null;
  if (version && version.compatible === false) {
    return { tone: 'error', label: 'ناسازگار نسخه', detail: 'اول مرکز را ارتقا دهید' };
  }
  const centerV = typeof version?.center === 'string' && version.center ? version.center : null;
  if (sync.state === 'synced') {
    const lastOk = newestIso(sync.last_push_ok_at, sync.last_pull_ok_at);
    const ms = isoMsOf(lastOk);
    const age = ms !== null ? ` · آخرین هم‌گامی ${ageHuman(Math.max(0, Math.round((nowMs - ms) / 1000)))}` : '';
    return { tone: 'ok', label: 'در دسترس', detail: `${centerV ? `نسخهٔ مرکز ${centerV}` : 'نسخهٔ مرکز هنوز دیده نشده'}${age}` };
  }
  if (sync.state === 'error') {
    const kindText = syncErrorKindView(sync.last_error?.kind);
    return { tone: 'error', label: 'پاسخ نمی‌دهد', detail: kindText };
  }
  // offline / idle / catching_up — مرکز دیده نشده ولی داده محفوظ است
  return { tone: 'warn', label: 'قطع — داده محفوظ است', detail: 'با بازگشت خط، هم‌گام‌سازی خودش ادامه می‌یابد' };
}

/**
 * ۴-۱ سیگنال ۳ — عقب‌ماندگی سینک. صفر و هم‌گام = سبز؛ رکورد در انتظار/خارج از خط = زرد؛
 * توقف نسخه یا خطای هم‌گامی = قرمز. منبع همان /api/node-sync/status است.
 */
export function syncLagSignalView(sync) {
  if (!sync || typeof sync !== 'object') {
    return { tone: 'unknown', label: 'نامشخص', detail: 'وضعیت هم‌گامی در دسترس نیست' };
  }
  const version = sync.version && typeof sync.version === 'object' ? sync.version : null;
  if (version && version.compatible === false) {
    return { tone: 'error', label: 'متوقف — نسخه', detail: 'اول مرکز را ارتقا دهید' };
  }
  const pending = Number(sync.pending_push);
  const pendingSafe = Number.isFinite(pending) && pending > 0 ? pending : 0;
  if (sync.state === 'error') {
    return { tone: 'error', label: 'خطای هم‌گامی', detail: 'تلاش دوباره خودکار می‌شود — رکوردها محفوظ‌اند' };
  }
  if (pendingSafe > 0) {
    return { tone: 'warn', label: `${fa(pendingSafe)} رکورد در انتظار`, detail: 'محفوظ است — با وصل شدن خط ارسال می‌شود' };
  }
  if (sync.state === 'synced') {
    return { tone: 'ok', label: 'بی‌عقب‌ماندگی', detail: 'همهٔ ثبت‌ها به مرکز رسیده‌اند' };
  }
  return { tone: 'warn', label: 'خارج از خط', detail: 'ثبت‌های محلی صف شده‌اند — هیچ چیز گم نمی‌شود' };
}

/**
 * ۴-۱ سیگنال ۴ — مصرف سهمیهٔ مرکز. بدترین سطح میان سه شاخص (درخواست‌ها/نوشتن/خواندن):
 * danger قرمز، warn زرد، همه ok سبز؛ درگاه ناآشنا (پنل روی نود) = خاکستری.
 */
export function quotaSignalView(quota) {
  if (!quota || typeof quota !== 'object') {
    return { tone: 'unknown', label: 'دریافت نشد', detail: 'درگاه سهمیهٔ مرکز از این دستگاه در دسترس نیست' };
  }
  const levels = ['requests', 'rows_written', 'rows_read']
    .map((k) => (quota.level && typeof quota.level === 'object' ? quota.level[k] : null))
    .filter(Boolean);
  const pct = quota.percent && typeof quota.percent === 'object' ? quota.percent.requests : null;
  const pctText = pct != null ? ` · درخواست‌ها ${pctNum(pct)}٪` : '';
  if (levels.includes('danger')) return { tone: 'error', label: 'سقف رد شده', detail: 'پلن Workers Paid سقف روزانه را عملاً برمی‌دارد' + pctText };
  if (levels.includes('warn')) return { tone: 'warn', label: 'نزدیک سقف', detail: 'مصرف روزانهٔ رایگان کلادفلر نزدیک اتمام است' + pctText };
  return { tone: 'ok', label: 'زیر سقف', detail: 'مصرف روزانه در محدودهٔ امن است' + pctText };
}

/** آستانه‌های رنگ کارت پشتیبان — هفتگی سبز، تا یک ماه زرد، بیشتر قرمز (راهنمای ادمین §۲) */
const BACKUP_OK_DAYS = 7;
const BACKUP_WARN_DAYS = 30;

/**
 * ۴-۱ سیگنال ۵ — پشتیبان. منبع مُهر: کلید موجود cs.lastBackupAt (همان کلید نمای
 * پشتیبان‌گیری می‌نویسد — منبع جدیدی ساخته نمی‌شود). مُهر غایب = قرمز «بی‌پشتیبان».
 */
export function backupSignalView(lastBackupIso, nowMs = Date.now()) {
  const ms = isoMsOf(lastBackupIso);
  if (ms === null) {
    return { tone: 'error', label: 'بی‌پشتیبان', detail: 'در این مرورگر پشتیبانی گرفته نشده — «دریافت پشتیبان فوری» را بزنید' };
  }
  const days = Math.max(0, Math.floor((nowMs - ms) / 86_400_000));
  if (days <= BACKUP_OK_DAYS) {
    return { tone: 'ok', label: 'تازه', detail: `آخرین پشتیبان: ${ageHuman(Math.max(0, Math.round((nowMs - ms) / 1000)))}` };
  }
  if (days <= BACKUP_WARN_DAYS) {
    return { tone: 'warn', label: 'کهنه شده', detail: `آخرین پشتیبان ${fa(days)} روز پیش — همین امروز یکی بگیرید` };
  }
  return { tone: 'error', label: 'بیش از یک ماه', detail: `آخرین پشتیبان ${fa(days)} روز پیش — فوری پشتیبان بگیرید` };
}

/* ── EXP-6 — ثبت drill عملیاتی ماهانه در پنل ─────────────────────────────────────
   چک‌لیست چاپی در ADMIN-GUIDE است (عامل دیگر)؛ اینجا فقط «ثبت نتیجه در پنل» (پیوند ۳-۲):
   localStorage['nodesync:ops-drill-v1'] = {at, result} پس از تأیید فارسی؛ تاریخ با رقم
   فارسی؛ بیش از ۳۱ روز = زرد («وقت drill بعدی است»). */

export const OPS_DRILL_KEY = 'nodesync:ops-drill-v1';
const DRILL_STALE_DAYS = 31;

/** خواندن نرم رکورد drill — JSON خراب/غایب = null */
export function readOpsDrillRecord(storage) {
  try {
    const ls = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    const raw = ls ? ls.getItem(OPS_DRILL_KEY) : null;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || isoMsOf(parsed.at) === null) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * EXP-6 — نمای رکورد drill: بدون رکورد = {tone:'unknown', label:'—'}؛ تا ۳۱ روز سبز با
 * تاریخ فارسی؛ بیشتر = زرد «وقت drill بعدی است».
 */
export function drillRecordView(record, nowMs = Date.now()) {
  const ms = isoMsOf(record?.at);
  if (ms === null) {
    return { tone: 'unknown', label: '—', detail: 'هنوز هیچ drill عملیاتی ثبت نشده است' };
  }
  const days = Math.max(0, Math.floor((nowMs - ms) / 86_400_000));
  const dateFa = formatJalaliDateTime(record.at);
  if (days > DRILL_STALE_DAYS) {
    return { tone: 'warn', label: dateFa, detail: `${fa(days)} روز از آخرین drill گذشته — وقت drill بعدی است` };
  }
  return { tone: 'ok', label: dateFa, detail: `آخرین drill ${fa(days)} روز پیش` };
}

/* ── فاز A — لایه‌های دوگانهٔ نشانگر «سرور محلی» (طرح docs/rust/server-cloud-update-design.md §۱) ──
   (۱.۲۷.۰۸) سه‌تاییِ لازمِ pill — نگاشت خالص serverStateView/degradedReasonView + feed مشترک
   وضعیت — به views/server-pill.js منتقل شد تا کل این فایلِ سنگین از گراف بوت خارج بماند
   (گیت بودجهٔ کارایی: pill باید در بوت باشد، پنل نه). app.js فقط server-pill.js را استاتیک
   import می‌کند و خود پنل سلامت همان‌طور که قبل‌تر بود با import پویای مسیر روت
   (#/health-panel) lazy می‌ماند. نام‌ها این‌جا هم صادر می‌شوند تا آزمون‌ها و پین‌های
   قرارداد بی‌تغییر بمانند؛ کارت «سرور محلی» و کارت «اتصال ابری» با همان feed می‌نشینند. */

import {
  degradedReasonView, serverStateView, unwrapEngineStatus,
  installServerStatusFeed, subscribeServerStatus, lastServerStatus, resetServerStatusFeedForTests
} from './server-pill.js';

export {
  degradedReasonView, serverStateView, unwrapEngineStatus,
  installServerStatusFeed, subscribeServerStatus, lastServerStatus, resetServerStatusFeedForTests
};

/** پاکت وضعیت → خط پورت‌ها با رقم فارسی؛ پورت غایب/خراب → «—» */
export function serverPortsView(status) {
  const port = Number(status?.port);
  const games = Number(status?.gamesPort);
  const p = Number.isFinite(port) && port > 0 ? fa(port) : '—';
  const g = Number.isFinite(games) && games > 0 ? fa(games) : '—';
  return `پورت اصلی ${p} · بازی‌ها ${g}`;
}

/** unix ثانیه → تاریخ جلالی فارسی؛ ورودی غایب/خراب → «—» (نگاشت مُهرهای پاکت) */
export function unixJalaliView(sec) {
  const n = Number(sec);
  if (!Number.isFinite(n) || n <= 0) return '—';
  try { return formatJalaliDateTime(new Date(n * 1000).toISOString()); } catch { return '—'; }
}

/** unix ثانیه → «چند وقت پیش» خوانا؛ ورودی غایب/خراب/مُهر آیندهٔ عجیب → «—» */
export function unixAgeView(sec, nowMs = Date.now()) {
  const n = Number(sec);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const age = Math.round((nowMs - n * 1000) / 1000);
  if (age < 0) return '—';
  return ageHuman(age);
}

/**
 * فاز A — رشتهٔ «کپی اطلاعات عیب‌یابی»: نسخهٔ اپ + وضعیت FSM + دلیل + پورت‌ها + آخرین رویداد
 * (اعداد/نسخه لاتین می‌ماند — برای پیوست در گزارش پشتیبانی). تابع خالص: پاکت غایب هم رشتهٔ
 * «نامشخص» می‌دهد تا دکمهٔ کپی هرگز بی‌اثر نماند.
 */
export function serverDiagnosticsText(status) {
  const s = status && typeof status === 'object' ? status : null;
  const view = serverStateView(s?.state, s?.degradedReason);
  const port = Number(s?.port);
  const games = Number(s?.gamesPort);
  return [
    'اطلاعات عیب‌یابی — سرور محلی مرکز جامع',
    `نسخهٔ اپ: ${typeof s?.appVersion === 'string' && s.appVersion ? s.appVersion : '—'}`,
    `وضعیت FSM: ${typeof s?.state === 'string' && s.state ? s.state : 'نامشخص'} — ${view.label}`,
    `دلیل ناتمامی: ${s?.state === 'Degraded' ? degradedReasonView(s?.degradedReason) : '—'}`,
    `پورت‌ها: اصلی ${Number.isFinite(port) && port > 0 ? port : '—'} · بازی‌ها ${Number.isFinite(games) && games > 0 ? games : '—'}`,
    `زمان آخرین بوت: ${unixJalaliView(s?.startedAtUnix)}`,
    `آخرین رویداد: unix ${s?.lastEventAtUnix ?? '—'} (${unixJalaliView(s?.lastEventAtUnix)})`
  ].join('\n');
}

/** کپی متن در کلیپ‌بورد با fallback — true فقط اگر واقعاً کپی شد؛ بی‌DOM → false بی‌کرش */
export async function copyTextToClipboard(text) {
  try {
    if (typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fallback پایین */ }
  try {
    if (typeof document === 'undefined') return false;
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const okCopy = document.execCommand('copy');
    ta.remove();
    return okCopy;
  } catch { return false; }
}

/* ── ۱.۲۷.۱۲ — آدرس محلی، هشدار ناهم‌نسخه‌ای موتور/برنامه و کارخانه‌های paint دو کارت ─────
   همهٔ نگاشت‌ها تابع خالص بی‌DOM‌اند (الگوی serverPortsView/cloudCardView) تا بی‌ماک سنگین
   آزمون شوند؛ کارخانه‌های paint (الگوی آزمون mountCloudSetup — DOM مصنوعی کمینه) همان بدنهٔ
   پویای قبلی دو کارت را می‌سازند، فقط با گارد دومایه‌ای پرِ اولیه. */

/** fa وارون — رقم فارسی/عربی → لاتین (تابع کمکی محلی؛ نسخه‌ها شاید «۱.۲۷.۴» بیایند) */
function unfaDigits(v) {
  const faD = '۰۱۲۳۴۵۶۷۸۹';
  const arD = '٠١٢٣٤٥٦٧٨٩';
  return String(v).replace(/[۰-۹٠-٩]/g, (ch) => {
    const i = faD.indexOf(ch);
    return String(i >= 0 ? i : arD.indexOf(ch));
  });
}

/** نسخهٔ متنی → آرایهٔ عددی segmentها (برای مقایسهٔ نقطه‌ای — نه رشته‌ای)؛ نامعتبر/تهی → null (نامعلوم) */
function versionSegmentsOf(v) {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const s = unfaDigits(v).trim().replace(/^v/i, '');
  if (!/^\d+(?:\.\d+)*$/.test(s)) return null;
  return s.split('.').map((p) => Number.parseInt(p, 10));
}

/** مقایسهٔ segment به segment با پُرکردن صفر (1.27 == 1.27.0)؛ -1 یعنی a قدیمی‌تر */
function cmpVersionSegments(a, b) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * ۱.۲۷.۱۲ — نمای هشدار ناهم‌نسخه‌ای موتور محلی/برنامهٔ نمایش (تابع خالص): فقط وقتی هر دو
 * نسخه معلوم‌اند و موتور واقعاً قدیمی‌تر است چیزی می‌دهد؛ برابر/موتور تازه‌تر/نامعلوم → null
 * (بی‌هشدار، بی‌کرش). متن دو جمله‌ای ساده برای مدیر غیرفنی: اجرای نصاب + راهِ فایل اشغال.
 */
export function engineAppVersionGapView(engineVersion, appVersion) {
  const eng = versionSegmentsOf(engineVersion);
  const app = versionSegmentsOf(appVersion);
  if (!eng || !app) return null;
  if (cmpVersionSegments(eng, app) !== -1) return null; // برابر یا موتور تازه‌تر — بی‌هشدار
  const ev = unfaDigits(engineVersion).trim().replace(/^v/i, '');
  const av = unfaDigits(appVersion).trim().replace(/^v/i, '');
  return {
    engineVersion: ev,
    appVersion: av,
    text: `موتور محلی (${ev}) قدیمی‌تر از برنامهٔ نمایش (${av}) است — آخرین نصاب را اجرا کنید تا موتور هم به‌روز شود؛ اگر نصب گفت فایل اشغال است، برنامه را کامل ببندید و نصب را دوباره اجرا کنید.`
  };
}

/** متن کوتاه‌شدهٔ هشدار ناهم‌نسخه‌ای (تا پیش از «؛») برای cell-sub ردیف بی‌اتصال کارت ابری؛ gap غایب → null */
export function engineGapShortView(gap) {
  if (!gap || typeof gap.text !== 'string') return null;
  const head = gap.text.split('؛')[0].trim();
  return head || null;
}

/**
 * ۱.۲۷.۱۳ — استخراج نسخه از پاکت /api/engine/capabilities (تابع خالص — P0-1 ممیزی §۱):
 * پاکت معلوم {ok:true, version:string} → رشتهٔ نسخه؛ پاکت ناآشنا/کوتاه/خرابی شبکه → null
 * (بی‌کرش — پنل به منبع قبلی نسخه برمی‌گردد؛ سنت «پنل هرگز نمی‌شکند»).
 */
export function engineCapabilitiesVersionView(caps) {
  if (!caps || caps.ok !== true) return null;
  if (typeof caps.version !== 'string' || !caps.version.trim()) return null;
  return caps.version.trim();
}

/**
 * ۱.۲۷.۱۲ — آدرس سرور محلی برای نمایش در کارت (تابع خالص — خواست کارفرما: «آدرس ۱۲۷.۰.۰.۱
 * نشون نمی‌دهد»): status.port عددی معتبر → http://127.0.0.1:<port> با isDefault=false (پورت با
 * رقم فارسی — هم‌الگوی serverPortsView)؛ وگرنه origin (حالت وب — کانال تائوری نیست) خودش آدرس
 * است با isDefault=false؛ در غیر این دو حالت پورت پیش‌فرض با isDefault=true تا رندر، توضیح
 * «آدرس پس از رسیدن وضعیت پوسته دقیق می‌شود» را نشان دهد.
 */
export function serverAddressView(status, origin) {
  const port = Number(status?.port);
  if (Number.isFinite(port) && port > 0) {
    // copyText با رقم لاتین — آدرسِ چسبانده‌شده باید مستقیم در مرورگر کار کند؛ متن نمایشی رقم فارسی می‌ماند
    return { address: `http://127.0.0.1:${fa(port)}`, copyText: `http://127.0.0.1:${port}`, isDefault: false };
  }
  const org = typeof origin === 'string' && origin.trim() && origin.trim() !== 'null' ? origin.trim() : null;
  if (org) return { address: org, copyText: org, isDefault: false };
  return { address: `http://127.0.0.1:${fa(8787)}`, copyText: 'http://127.0.0.1:8787', isDefault: true };
}

/** ردیف «آدرس محلی» کارت سرور — main برچسب + متن LTR آدرس + دکمهٔ ghost «کپی آدرس» (توست «آدرس کپی شد») */
function serverAddressRow(addr) {
  const copyBtn = el('button', {
    class: 'btn btn--ghost',
    type: 'button',
    onclick: (e) => void lockBtn(e.currentTarget, async () => {
      const copied = await copyTextToClipboard(addr.copyText ?? addr.address);
      toast(copied ? 'آدرس کپی شد' : 'کپی در کلیپ‌بورد ممکن نشد — مرورگر اجازه نداد', copied ? 'success' : 'error');
    })
  }, 'کپی آدرس');
  return el('div', { class: 'ob-row' },
    el('div', { class: 'ob-row__main' },
      el('div', { class: 'cell-main', style: { whiteSpace: 'normal' } },
        'آدرس محلی ',
        el('span', { style: { direction: 'ltr', unicodeBidi: 'plaintext', whiteSpace: 'nowrap' } }, addr.address)),
      addr.isDefault ? el('div', { class: 'cell-sub' }, 'پورت پیش‌فرض — پس از رسیدن وضعیت پوسته، آدرس دقیق می‌شود') : null
    ),
    el('div', { class: 'ob-row__side' }, copyBtn)
  );
}

/**
 * ۱.۲۷.۱۲ — کارخانهٔ paint کارت «سرور محلی» (بدنهٔ پویای قبلی همان کارت؛ بیرون‌کشی شد تا با
 * DOM مصنوعی کمینه — الگوی آزمون mountCloudSetup — بی‌ماک سنگین آزمون شود). خروجی paint(status, isInitial):
 * پرِ اولیه (isInitial=true) همیشه بدنه را پُر می‌کند حتی وقتی بدنه هنوز به DOM وصل نیست — کارت
 * داخل آرایهٔ el در reload ساخته می‌شود و تا root.replaceChildren بعدی وصل نیست؛ با گارد قدیمی
 * پرِ اولیه بی‌صدا رد می‌شد و کارت تا اولین emit feed خالی می‌ماند (اشکال گزارش‌شدهٔ کارفرما).
 * گارد «بستن اشتراک کهنه» فقط برای emitهای feed است — پیام/رفتارش عین قبل.
 * ctx: { resultLine, engineRestartAction, openDataDirAction, copyDiagAction, onStaleSubscription }
 */
export function makeServerCardPaint(body, ctx = {}) {
  return (status, isInitial) => {
    if (!isInitial && !body.isConnected) {
      // نما رندر دوباره شده (بازخوانی ۶۰ثانیه‌ای کل پنل) — اشتراک کهنه بسته شود
      if (typeof ctx.onStaleSubscription === 'function') ctx.onStaleSubscription();
      return;
    }
    const view = serverStateView(status?.state, status?.degradedReason);
    // فاز D1 — توضیح انسانی پورت‌ها (خواست کارفرما: «سرور محلی روشن است روی پورت …»)
    const portLine = status?.state === 'Ready' ? `سرور محلی روشن است — ${serverPortsView(status)}` : serverPortsView(status);
    body.replaceChildren(
      el('div', { class: 'ob-row' },
        el('div', { class: 'ob-row__main' },
          el('div', { class: 'cell-main' },
            el('span', { class: `dot ${view.dot}`, style: { marginInlineEnd: 'var(--sp-2)' } }),
            view.label),
          el('div', { class: 'cell-sub' },
            status
              ? `${portLine} · آخرین رویداد: ${unixAgeView(status?.lastEventAtUnix)}`
              : 'وضعیت هنوز از پوستهٔ برنامه نرسیده — با بازخوانی ۳۰ثانیه‌ای خودکار پُر می‌شود')
        ),
        el('div', { class: 'ob-row__side' },
          el('span', { class: `badge ${view.badge}` }, typeof status?.state === 'string' && status.state ? status.state : '—')
        )
      ),
      // ۱.۲۷.۱۲ — ردیف آدرس محلی، بلافاصله بعد از ردیف وضعیت (خواست کارفرما)
      serverAddressRow(serverAddressView(status, null)),
      el('div', { class: 'ob-row' },
        el('div', { class: 'ob-row__main' },
          el('div', { class: 'cell-main' }, 'نسخهٔ اپ · آخرین بوت'),
          el('div', { class: 'cell-sub' },
            `${typeof status?.appVersion === 'string' && status.appVersion ? status.appVersion : '—'} · ${unixJalaliView(status?.startedAtUnix)}`)
        )
      ),
      el('div', { class: 'ob-row' },
        el('div', { class: 'ob-row__side' },
          el('button', { class: 'btn btn--primary', type: 'button', onclick: (e) => void ctx.engineRestartAction(e.currentTarget) }, 'راه‌اندازی دوباره'),
          el('button', { class: 'btn btn--ghost', type: 'button', onclick: (e) => void ctx.openDataDirAction(e.currentTarget) }, 'بازکردن پوشهٔ داده'),
          el('button', { class: 'btn btn--ghost', type: 'button', onclick: (e) => void ctx.copyDiagAction(e.currentTarget) }, 'کپی اطلاعات عیب‌یابی')
        )
      ),
      ctx.resultLine ?? null
    );
  };
}

/** ۱.۲۷.۱۲ — توضیح cell-sub ردیف وضعیت کارت ابری وقتی status=null (موتور کهنهٔ بدون
   /api/instance-sync/* هم همین‌جا می‌افتد — poll ابر شکست می‌خورد و feed هرگز notify نمی‌شود) */
const CLOUD_STATUS_PENDING_TEXT = 'وضعیت اتصال ابری از سرور نگرفته شد — اگر موتور محلی قدیمی است، با به‌روزرسانی نصب درست می‌شود.';

/**
 * ۱.۲۷.۱۲ — کارخانهٔ paint کارت «اتصال ابری» (بدنهٔ پویای قبلی همان کارت؛ بیرون‌کشی برای آزمون
 * با DOM مصنوعی کمینه). paint(status, isInitial) — پرِ اولیه همیشه می‌نشیند حتی با بدنهٔ جدا از
 * DOM؛ اگر feed هرگز emit نکند (موتور کهنه — poll ابر همیشه شکست می‌خورد) کارت تا ابد خالی
 * می‌ماند؛ همان اشکال کارفرما. گارد «بستن اشتراک کهنه» فقط برای emitهای feed. دو تفاوت متن
 * با قبل (خواست کارفرما): status=null → توضیح «وضعیت اتصال ابری از سرور نگرفته شد» به‌جای «—»؛
 * ردیف بی‌اتصال وقتی status=null و موتور کهنه است، متن کوتاه‌شدهٔ هشدار ناهم‌نسخه‌ای را هم می‌آورد.
 * ctx: { setupToggleBtn, advancedToggleBtn, advancedBody, resultLine, runNowAction,
 *        configureAction, deleteConnectionAction, gapShort, onStaleSubscription }
 */
export function makeCloudCardPaint(body, ctx = {}) {
  const { setupToggleBtn, advancedToggleBtn, advancedBody, resultLine } = ctx;
  return (status, isInitial) => {
    if (!isInitial && !body.isConnected) {
      // نما رندر دوباره شده (بازخوانی ۶۰ثانیه‌ای کل پنل) — اشتراک کهنه بسته شود
      if (typeof ctx.onStaleSubscription === 'function') ctx.onStaleSubscription();
      return;
    }
    const vm = cloudCardView(status);
    const view = cloudSyncStateView(status);
    const human = cloudHumanStatusView(status);
    const humanTone = healthToneView(human.tone);
    const counts = cloudCountsView(status?.last_sync?.pulled, status?.last_sync?.pushed);
    const subParts = [];
    if (view.detail) subParts.push(view.detail);
    if (counts.detail) subParts.push(counts.detail);
    // ۱.۲۷.۱۲ — به‌جای «—» توضیح انسانی «وضعیت نگرفته شد» (دکمه‌ها و CTA دست‌نخورده)
    const statusSub = status == null
      ? CLOUD_STATUS_PENDING_TEXT
      : (subParts.length > 0 ? subParts.join(' · ') : '—');
    /* لایهٔ عادی — خط وضعیت انسانی + همگام‌سازی خودکار + دو دکمهٔ برجستهٔ همان قرارداد run-now */
    const rows = [
      el('div', { class: 'ob-row' },
        el('div', { class: 'ob-row__main' },
          el('div', { class: 'cell-main' },
            el('span', { class: `dot ${humanTone.dot}`, style: { marginInlineEnd: 'var(--sp-2)' } }),
            human.text),
          el('div', { class: 'cell-sub' }, statusSub)
        ),
        el('div', { class: 'ob-row__side' },
          vm.configured ? el('span', { class: `badge ${view.badge}` }, counts.head) : null
        )
      ),
      vm.configured
        ? el('div', { class: 'ob-row' },
            el('div', { class: 'ob-row__main' },
              el('div', { class: 'cell-main' }, `همگام‌سازی خودکار: ${vm.intervalText ?? 'تنظیم نشده'}`),
              el('div', { class: 'cell-sub' }, 'در این فاصله اطلاعات خودکار رد و بدل می‌شود — بدون نیاز به کار شما')
            ),
            el('div', { class: 'ob-row__side' },
              el('button', { class: 'btn btn--ghost', type: 'button', onclick: () => ctx.configureAction() }, 'تغییر')
            )
          )
        : null,
      el('div', { class: 'ob-row' },
        el('div', { class: 'ob-row__side' },
          el('button', { class: 'btn btn--primary', type: 'button', disabled: vm.runNowDisabled, onclick: (e) => void ctx.runNowAction(e.currentTarget) }, 'دریافت اطلاعات'),
          el('button', { class: 'btn btn--primary', type: 'button', disabled: vm.runNowDisabled, onclick: (e) => void ctx.runNowAction(e.currentTarget) }, 'ارسال اطلاعات')
        )
      )
    ];
    if (!vm.configured) {
      // بی‌اتصال — مسیر ساخت اتصال در لایهٔ عادی می‌ماند (مدیر تازه‌کار نباید دنبالش بگردد)؛
      // فاز D2 — دکمه ناوبری نمی‌کند: ناحیهٔ داخلی ویزارد را بازو/بسته می‌کند (جریان کامل داخل کارت).
      // ۱.۲۷.۱۲ — وقتی وضعیت از سرور نگرفته شده و موتور کهنه است، متن کوتاه هشدار ناهم‌نسخه‌ای
      // هم می‌آید تا «شروع پیکربندی ابری» بدون توضیح نماند.
      const ctaText = 'با «پیکربندی اولیه» این دستگاه به مرکز ابری وصل می‌شود — چند دقیقه بیشتر طول نمی‌کشد.';
      rows.push(el('div', { class: 'ob-row' },
        el('div', { class: 'ob-row__main' },
          el('div', { class: 'cell-sub' }, status == null && ctx.gapShort ? `${ctx.gapShort} · ${ctaText}` : ctaText)),
        // فاز C — ورودی ویزارد «پیکربندی اولیه اتصال ابری» (سه‌گامی: existing/create/فقط محلی)
        el('div', { class: 'ob-row__side' },
          setupToggleBtn)
      ));
    }
    /* لایهٔ پیشرفته — جزئیات نشست‌محلی؛ فقط با اتصال رندر می‌شود (الگوی guideSection) */
    const adv = cloudAdvancedView(status);
    advancedBody.replaceChildren(
      ...(vm.configured ? [
        infoRow('نسخهٔ ساختار اطلاعات', adv.schemaText ?? '—'),
        infoRow('تعارض اطلاعات', adv.conflictsText ?? '—'),
        infoRow('تاریخچهٔ خطاها', adv.errorText ?? 'خطایی ثبت نشده است'),
        infoRow('آدرس مرکز ابری · دستگاه', el('span', { style: { direction: 'ltr', unicodeBidi: 'plaintext' } }, `${vm.urlText ?? '—'} · ${vm.deviceIdText ?? '—'}`)),
        infoRow('کلید اتصال', vm.secretPresent ? 'تنظیم شده' : '—')
      ] : []),
      el('div', { class: 'ob-row' },
        el('div', { class: 'ob-row__side' },
          vm.configured ? el('button', { class: 'btn btn--ghost', type: 'button', onclick: () => { location.hash = '#/cloud-setup'; } }, 'پیکربندی اولیه…') : null,
          vm.showDelete ? el('button', { class: 'btn btn--ghost', type: 'button', onclick: (e) => void ctx.deleteConnectionAction(e.currentTarget) }, 'حذف اتصال') : null
        )
      )
    );
    if (vm.configured) {
      rows.push(
        el('div', { class: 'ob-row' },
          el('div', { class: 'ob-row__side' }, advancedToggleBtn)
        ),
        advancedBody
      );
    }
    rows.push(resultLine);
    body.replaceChildren(...rows);
  };
}

/* (۱.۲۷.۰۸) پاکت‌سنج unwrapEngineStatus و feed مشترک وضعیت سرور به views/server-pill.js
   رفت‌اند (خروج از گراف بوت) — همین‌جا از همان ماژول صادر و مصرف می‌شوند. */

/**
 * فاز A — فرمان پوستهٔ میز با گارد کامل (engine_restart / open_data_dir / …):
 * بیرون دسکتاپ یا Err پوسته → {ok:false, reason} با پیام فارسی‌پذیر — SPA هرگز نمی‌شکند.
 */
export async function engineInvoke(command) {
  try {
    const tauri = globalThis.__TAURI__;
    const invoke = tauri && typeof tauri.invoke === 'function' ? tauri.invoke : null;
    if (!invoke) return { ok: false, reason: 'no-tauri-channel' };
    return { ok: true, value: await invoke(command) };
  } catch (err) {
    return { ok: false, reason: err?.message != null ? String(err.message) : String(err ?? 'خطای نامشخص') };
  }
}

/* ── فاز B — قرارداد «اتصال ابری» (سند §۲-۵؛ هم‌گامی دوسویهٔ میز↔ابر instance-sync) ────────
   قرارداد، جدای هم‌گامی نود با CP است (ف۶ بالای همین فایل — دو کارت جدا). درگاه‌ها:
   GET /api/instance-sync/status (فقط‌مدیر) + POST run-now / config + DELETE config +
   POST clone {confirm:true} (۴۰۹=نیاز confirm). نگاشت‌ها همه تابع خالص بی‌DOM
   (الگوی serverStateView/syncStateView) تا بی‌ماک سنگین آزمون شوند
   (src/__tests__/front-cloud-sync.test.ts). فرمان‌های راز فقط روی کانال __TAURI__
   (cloud_secret_set/get/delete — Credential Manager در lib.rs)؛ بیرون پوستهٔ میز
   گارد کامل {ok:false, reason} — SPA هرگز نمی‌شکند (الگوی engineInvoke). feed وضعیت
   HTTP است و برخلاف feed سرور فاز A به کانال پوسته نیاز ندارد: poll هر ۳۰ثانیه +
   poll فوری پس از هر کنش؛ کارت پنل با subscribe/unsubscribe (rebuild و teardown)
   روی همین feed مشترک می‌نشیند. */

const CLOUD_SYNC_POLL_MS = 30_000; // poll ۳۰ثانیه‌ای — هم‌ریتم feed وضعیت سرور (فاز A)
const CLOUD_SYNC_STATUS_PATH = '/api/instance-sync/status';

const CLOUD_SYNC_UNKNOWN = { badge: 'badge--neutral', dot: 'dot--neutral', label: 'وضعیت نامشخص' };

/** مُهر آخرین هم‌گامی → فارسی؛ ISO یا unix ثانیه — ورودی غایب/خراب → null (بی‌کرش) */
function cloudSyncAtView(at) {
  if (typeof at === 'string' && isoMsOf(at) !== null) return formatJalaliDateTime(at);
  const n = Number(at);
  if (Number.isFinite(n) && n > 0) return unixJalaliView(n);
  return null;
}

/** خطای هم‌گامی → متن کوتاه (سقف ۱۲۰ نویسه)؛ غایب/خراب → null */
function cloudSyncErrorShort(err) {
  if (typeof err !== 'string' || !err.trim()) return null;
  const t = err.trim();
  return t.length > 120 ? `${t.slice(0, 120)}…` : t;
}

/**
 * فاز B — وضعیت اتصال ابری → برچسب فارسی/کلاس رنگ (تابع خالص — الگوی serverStateView).
 * تقدم: unconfigured → ناسازگاری schema → در جریان → نتیجهٔ آخرین هم‌گامی (synced/error/
 * offline) → بی‌last_sync → ناشناخته. clock_warning=true → ضمیمهٔ «اختلاف ساعت با مقصد!»
 * (فقط وقتی اتصال هست — بی‌اتصال مقصدی در کار نیست). هر ورودی غایب/ناقص/ناشناخته بی‌کرش است.
 */
export function cloudSyncStateView(status) {
  if (!status || typeof status !== 'object') return CLOUD_SYNC_UNKNOWN;
  let out;
  if (status.configured !== true) {
    out = { badge: 'badge--neutral', dot: 'dot--neutral', label: 'اتصال ابری تنظیم نشده' };
  } else if (status.schema_match === false) {
    out = { badge: 'badge--error', dot: 'dot--error', label: 'نسخهٔ ساختار اطلاعات متفاوت است — به‌روزرسانی لازم است' };
  } else if (status.running === true) {
    out = { badge: 'badge--warning', dot: 'dot--warning', label: 'هم‌گامی در جریان…' };
  } else {
    const ls = status.last_sync && typeof status.last_sync === 'object' ? status.last_sync : null;
    if (!ls) {
      out = { badge: 'badge--neutral', dot: 'dot--neutral', label: 'در انتظار اولین هم‌گامی', detail: null };
    } else if (ls.result === 'synced') {
      const at = cloudSyncAtView(ls.at);
      out = { badge: 'badge--success', dot: 'dot--success', label: 'هم‌گام شد', detail: at ? `آخرین هم‌گامی: ${at}` : null };
    } else if (ls.result === 'error') {
      out = { badge: 'badge--error', dot: 'dot--error', label: 'خطای هم‌گامی', detail: cloudSyncErrorShort(ls.error) };
    } else if (ls.result === 'offline') {
      out = { badge: 'badge--warning', dot: 'dot--warning', label: 'خارج از خط — تلاش دوباره خودکار', detail: null };
    } else {
      out = CLOUD_SYNC_UNKNOWN; // نتیجهٔ ناشناخته — خنثی بی‌کرش
    }
  }
  if (status.configured === true && status.clock_warning === true) {
    out = { ...out, label: `${out.label} — اختلاف ساعت با مقصد!` };
  }
  return out;
}

/**
 * فاز B — شمارنده‌های آخرین هم‌گامی → «↑۲۳ ↓۴۱» (ارسال/دریافت) + جزئیات per-table مرتب
 * بر الفبای نام جدول — فقط جدول‌های غیرصفر (الگوی reconciliationDetailView). ورودی غایب/
 * خراب → «↑۰ ↓۰» بی‌کرش؛ مقدار منفی/غیرعددی همان صفر می‌شود.
 */
export function cloudCountsView(pulled, pushed) {
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  };
  const pullMap = pulled && typeof pulled === 'object' ? pulled : {};
  const pushMap = pushed && typeof pushed === 'object' ? pushed : {};
  const tables = [...new Set([...Object.keys(pullMap), ...Object.keys(pushMap)])].sort();
  let pullTotal = 0;
  let pushTotal = 0;
  const parts = [];
  for (const t of tables) {
    if (typeof t !== 'string' || !t) continue;
    const p = num(pullMap[t]);
    const s = num(pushMap[t]);
    pullTotal += p;
    pushTotal += s;
    if (p === 0 && s === 0) continue;
    const arrows = s > 0 && p > 0 ? `↑${fa(s)} ↓${fa(p)}` : s > 0 ? `↑${fa(s)}` : `↓${fa(p)}`;
    parts.push(`${t} ${arrows}`);
  }
  return { head: `↑${fa(pushTotal)} ↓${fa(pullTotal)}`, detail: parts.length > 0 ? parts.join(' · ') : null };
}

/**
 * فاز B — ماسک secret برای نمایش: رشتهٔ ماسک‌شدهٔ پوسته («●●●●۱۲۳۴» — خروجی cloud_secret_get)
 * → خودش؛ غایب/خراب/تهی → «—» بی‌کرش.
 */
export function cloudSecretMaskView(masked) {
  if (typeof masked !== 'string') return '—';
  const t = masked.trim();
  return t ? t : '—';
}

/**
 * فاز B — گاردهای کارت «اتصال ابری» (تابع خالص): کدام دکمه غیرفعال/پنهان و کدام ردیف
 * نمایش می‌شود. «هم‌گام‌سازی اکنون» بی‌اتصال یا در جریان بودن غیرفعال است؛ «حذف اتصال»
 * فقط با اتصال؛ ردیف‌های url/device/interval/تعارض فقط وقتی configured. پاکت غایب →
 * همهٔ گاردها بسته، بی‌کرش.
 */
export function cloudCardView(status) {
  const s = status && typeof status === 'object' ? status : null;
  const configured = s?.configured === true;
  const running = s?.running === true;
  const intervalMs = Number(s?.interval_ms);
  const minutes = Number.isFinite(intervalMs) && intervalMs > 0 ? Math.round(intervalMs / 60_000) : null;
  const conflicts = Number(s?.conflicts_total);
  const str = (v) => (typeof v === 'string' && v ? v : null);
  return {
    configured,
    running,
    runNowDisabled: !configured || running,
    showDelete: configured,
    urlText: configured ? str(s?.url) : null,
    deviceIdText: configured ? str(s?.device_id) : null,
    intervalText: configured && minutes !== null ? `هر ${fa(minutes)} دقیقه` : null,
    conflictsTotal: configured && Number.isFinite(conflicts) && conflicts >= 0 ? Math.round(conflicts) : null,
    secretPresent: configured && s?.secret_present === true
  };
}

/* ── فاز D1 — «انسانی‌سازی» کارت «اتصال ابری» (خواست کارفرما: UI/UX طبقه‌بندی‌شده و واژگان ساده) ──
   همه تابع خالص بی‌DOM (الگوی cloudSyncStateView) تا بی‌ماک سنگین آزمون شوند. نگاشت گونهٔ خطا
   به واژگان موجود error kindها (network_error/http_error/throttled/auth_error/version_error —
   همان واژگان node-sync-runner/runner.ts) و سه پیام وضعیتِ کارفرما عیناً؛ هیچ تغییر قرارداد API
   و هیچ تغییر نام تابع — فقط متن‌ها و ترتیب نمایش. */

/** گونهٔ خطای آخرین هم‌گامی → واژگان موجود error kindها؛ فقط برای انتخاب جملهٔ انسانی (بی‌کرش) */
export function cloudSyncErrorKindOf(ls) {
  if (!ls || typeof ls !== 'object') return null;
  if (ls.result === 'offline') return 'network_error';
  if (ls.result !== 'error') return null;
  const t = typeof ls.error === 'string' ? ls.error : '';
  if (/۴۰۱|۴۰۳|auth|کلید|اعتبار|Bearer/i.test(t)) return 'auth_error';
  if (/اسکیما|نسخه|schema|version/i.test(t)) return 'version_error';
  if (/۴۲۹|شلوغ|throttl/i.test(t)) return 'throttled';
  return 'http_error';
}

const CLOUD_SYNC_KIND_HISTORY = {
  network_error: 'قطع اینترنت',
  http_error: 'ابر شلوغ بود',
  throttled: 'ابر شلوغ بود',
  auth_error: 'کلید اتصال پذیرفته نشد',
  version_error: 'نیاز به به‌روزرسانی برنامه'
};

/** گونهٔ خطا → جملهٔ کوتاه تاریخچهٔ خطاها؛ گونهٔ ناشناخته/غایب → null (فراخوان پیام خودش را می‌گذارد) */
export function cloudSyncErrorKindView(kind) {
  return CLOUD_SYNC_KIND_HISTORY[kind] ?? null;
}

const CLOUD_SYNC_KIND_MESSAGES = {
  network_error: 'اتصال ابر کند است؛ اطلاعات محلی سالم است و در صف ارسال است',
  http_error: 'مرکز ابری در دسترس نیست؛ کار عادی ادامه دارد و پس از وصل شدن، اطلاعات خودکار رد و بدل می‌شود',
  throttled: 'مرکز ابری در دسترس نیست؛ کار عادی ادامه دارد و پس از وصل شدن، اطلاعات خودکار رد و بدل می‌شود',
  auth_error: 'کلید اتصال پذیرفته نشد — اتصال را ویرایش کنید',
  version_error: 'برنامه نیاز به به‌روزرسانی دارد — اول به‌روزرسانی، بعد هم‌گامی'
};

/** گونهٔ خطا → پیام وضعیت انسانی (سه پیام کارفرما عیناً)؛ گونهٔ ناشناخته → null */
export function cloudSyncStatusMessageView(kind) {
  return CLOUD_SYNC_KIND_MESSAGES[kind] ?? null;
}

/**
 * فاز D1 — خط وضعیت انسانی لایهٔ عادی کارت (یک جملهٔ کوتاه فعل‌محور): بی‌اتصال → «اتصال ابری
 * تنظیم نشده»؛ در جریان؛ سبز «متصل به مرکز ابری — آخرین هم‌گامی: …»؛ خطا/قطع با سه پیام
 * کارفرما عیناً (نگاشت گونهٔ خطا). ورودی غایب/خراب بی‌کرش. tone = همان واژگان healthToneView.
 */
export function cloudHumanStatusView(status, nowMs = Date.now()) {
  const s = status && typeof status === 'object' ? status : null;
  if (!s || s.configured !== true) return { tone: 'unknown', text: 'اتصال ابری تنظیم نشده' };
  if (s.running === true) return { tone: 'warn', text: 'هم‌گامی در جریان است — چند لحظه صبر کنید' };
  const ls = s.last_sync && typeof s.last_sync === 'object' ? s.last_sync : null;
  let text;
  if (!ls) {
    text = 'متصل به مرکز ابری — در انتظار اولین دریافت و ارسال اطلاعات';
  } else if (ls.result === 'synced') {
    const ms = typeof ls.at === 'string'
      ? isoMsOf(ls.at)
      : (Number.isFinite(Number(ls.at)) && Number(ls.at) > 0 ? Number(ls.at) * 1000 : null);
    const age = ms !== null ? ` — آخرین هم‌گامی: ${ageHuman(Math.max(0, Math.round((nowMs - ms) / 1000)))}` : '';
    text = `متصل به مرکز ابری${age}`;
  } else {
    const kind = cloudSyncErrorKindOf(ls);
    const msg = cloudSyncStatusMessageView(kind);
    text = msg ?? 'هم‌گامی این‌بار کامل نشد — اطلاعات محلی سالم است و دوباره تلاش می‌شود';
  }
  // هشدار کج‌ساعت فقط ضمیمه می‌شود — سه پیام کارفرما بدون آن عیناً می‌مانند
  if (s.clock_warning === true) text += ' — اختلاف ساعت با مقصد';
  let tone;
  if (!ls) tone = 'unknown';
  else if (ls.result === 'synced') tone = 'ok';
  else if (ls.result === 'offline') tone = 'warn';
  else {
    const kind = cloudSyncErrorKindOf(ls);
    tone = kind === 'auth_error' || kind === 'version_error' ? 'error' : 'warn';
  }
  return { tone, text };
}

/**
 * فاز D1 — مدل خالص لایهٔ پیشرفتهٔ کارت (جزئیات نشست‌محلی؛ پیش‌فرض بسته): نسخهٔ ساختار اطلاعات
 * با جملهٔ «یکسان است/متفاوت است»، تعارض اطلاعات با جملهٔ امن، تاریخچهٔ خطاها با متن انسانی.
 * بی‌اتصال → هر سه null (لایهٔ پیشرفته اصلاً رندر نمی‌شود). هر ورودی غایب/خراب بی‌کرش.
 */
export function cloudAdvancedView(status) {
  const s = status && typeof status === 'object' ? status : null;
  if (!s || s.configured !== true) return { schemaText: null, conflictsText: null, errorText: null };
  const schemaText = s.schema_match === true
    ? 'نسخهٔ ساختار اطلاعات: یکسان است'
    : s.schema_match === false
      ? 'نسخهٔ ساختار اطلاعات: متفاوت است — با به‌روزرسانی برنامه هم‌خوان می‌شود'
      : null;
  const conflicts = Number(s.conflicts_total);
  const conflictsText = Number.isFinite(conflicts) && conflicts >= 0
    ? (conflicts > 0
        ? `${fa(Math.round(conflicts))} رکورد دو نسخه‌ای شدند — نسخهٔ قدیمی‌تر به‌عنوان مرجع است و نسخهٔ دیگر امن ذخیره شده`
        : 'بدون تعارض — همهٔ رکوردها یک نسخه دارند')
    : null;
  const ls = s.last_sync && typeof s.last_sync === 'object' ? s.last_sync : null;
  let errorText = null;
  if (ls && (ls.result === 'error' || ls.result === 'offline')) {
    const at = cloudSyncAtView(ls.at);
    errorText = `${cloudSyncErrorKindView(cloudSyncErrorKindOf(ls)) ?? 'خطای نامشخص'}${at ? ` — ${at}` : ''}`;
  }
  return { schemaText, conflictsText, errorText };
}

/** فاز D1 — بازو/بستن «جزئیات پیشرفته»: پیش‌فرض بسته (مدیر تازه‌کار فقط لایهٔ عادی را می‌بیند) */
export function cloudAdvancedToggleView(open) {
  if (open === true) return { label: 'بستن جزئیات پیشرفته', hidden: false, expanded: true };
  return { label: 'جزئیات پیشرفته', hidden: true, expanded: false };
}

/* ── فاز D2 — دو خواست کارفرما پس از v1.27.10 (همه تابع خالص بی‌DOM — الگوی cloudAdvancedToggleView) ──
   ۱) «کل جریان پیکربندی ابری داخل کارت ابری»: کارت بی‌اتصال دیگر به صفحهٔ جدا #/cloud-setup نمی‌رود؛
      دکمهٔ «شروع پیکربندی ابری» ناحیهٔ داخلی را بازو/بسته می‌کند و ویزارد کامل (mountCloudSetup —
      views/cloud-setup.js) با import پویا فقط هنگام باز شدن lazy سوار می‌شود. مدل دکمه خالص است
      تا بی‌DOM آزمون شود؛ مسیر #/cloud-setup فقط دیپ‌لینک (لینک پانویس boot/بنر) می‌ماند.
   ۲) «منوی کارت سلامت خیلی طولانیه — ساده شود»: بالای صفحه فقط سه چیز (سلامت یک‌نگاهی + سرور محلی +
      اتصال ابری)؛ بقیهٔ بخش‌ها زیر آکاردئون واحد «جزئیات پیشرفته» با پیش‌فرض بسته — باز/بسته
      سشن‌محلی با کلید hp.advancedOpen (الگوی cs.cloudSetupSkipped ویزارد: sessionStorage، بی‌قفل). */

/** فاز D2 — مدل خالص دکمهٔ ورودی ویزارد در کارت بی‌اتصال: بازو/بستهٔ ناحیهٔ داخلی؛ هیچ ناوبری به
 *  صفحهٔ جدا برای شروع پیکربندی نوشته نمی‌شود — جریان کامل داخل کارت است (خواست کارفرما). */
export function cloudSetupEntryToggleView(open) {
  if (open === true) return { label: 'بستن پیکربندی ابری', hidden: false, expanded: true };
  return { label: 'شروع پیکربندی ابری', hidden: true, expanded: false };
}

/** فاز D2 — کلید سشن‌محلی آکاردئون «جزئیات پیشرفته» پنل سلامت (الگوی CLOUD_SETUP_SKIP_KEY ویزارد) */
export const HEALTH_PANEL_ADVANCED_KEY = 'hp.advancedOpen';

/** نوشتن وضعیت باز آکاردئون در سشن — بی‌storage (حالت خصوصی/node) نرم بی‌قفل می‌ماند */
export function markAdvancedSectionsOpen(open) {
  try {
    if (open === true) globalThis.sessionStorage?.setItem?.(HEALTH_PANEL_ADVANCED_KEY, '1');
    else globalThis.sessionStorage?.removeItem?.(HEALTH_PANEL_ADVANCED_KEY);
  } catch { /* سشن‌محلی — بی‌storage هم بی‌کرش */ }
}

/** خواندن وضعیت باز آکاردئون از سشن — پیش‌فرض بسته (خواست کارفرما: پنل کوتاه) */
export function advancedSectionsOpenInSession() {
  try { return globalThis.sessionStorage?.getItem?.(HEALTH_PANEL_ADVANCED_KEY) === '1'; } catch { return false; }
}

/**
 * فاز D2 — مدل خالص چیدمان کوتاه‌شدهٔ پنل: سه بخش بالای صفحه همیشه رندر می‌شوند؛ بخش‌های ثانویه
 * (به همان ترتیب و محتوای قبل + نوار نجات) فقط وقتی آکاردئون باز است در خروجی می‌آیند.
 * نام‌ها عین عنوان‌های h3/برچسب موجودند — تست‌ها و پین‌ها به بعضی گره خورده‌اند.
 */
export function healthPanelLayoutView(advancedOpen) {
  const open = advancedOpen === true;
  return {
    open,
    toggleLabel: open ? 'بستن جزئیات پیشرفته' : 'جزئیات پیشرفته',
    advancedHidden: !open,
    topSections: ['سلامت یک‌نگاهی — پنج سیگنال', 'سرور محلی', 'اتصال ابری'],
    advancedSections: open
      ? ['نوار نجات', 'سامانه', 'وضعیت هم‌گامی', 'مصرف مرکز (برآوردی)', 'لینک کنترل‌پلین — شش درگاه', 'هشدارهای فعال', 'گزارش رشد جدول‌ها', 'آخرین drill ثبت‌شده', 'راهنما — چکیدهٔ راهنمای ادمین']
      : []
  };
}

/** پوشش پاسخ درگاه وضعیت اتصال ابری: پاکت {data:…} باز می‌شود؛ بی‌هیچ فیلد شناخته → null (الگوی unwrapQuota) */
export function unwrapInstanceSyncStatus(payload) {
  const raw = payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object'
    ? payload.data
    : payload;
  if (!raw || typeof raw !== 'object') return null;
  const known = ['configured', 'url', 'device_id', 'secret_present', 'running', 'interval_ms', 'last_sync', 'conflicts_total', 'clock_warning', 'schema_match']
    .some((k) => k in raw);
  return known ? raw : null;
}

/**
 * فاز B — فرمان راز ابری روی پوستهٔ میز با گارد کامل (cloud_secret_set/get/delete):
 * فقط وقتی کانال __TAURI__ هست اجرا می‌شود؛ بیرون دسکتاپ یا Err پوسته → {ok:false, reason}
 * با پیام فارسی‌پذیر — SPA هرگز نمی‌شکند (الگوی engineInvoke). کانال __TAURI_INTERNALS__
 * به‌تنهایی کافی نیست — معیار، کانال عمومی __TAURI__ است (هم‌الگوی بقیهٔ feedهای این فایل).
 */
export async function cloudSecretInvoke(command, args) {
  try {
    const tauri = globalThis.__TAURI__;
    const invoke = tauri && typeof tauri.invoke === 'function' ? tauri.invoke : null;
    if (!invoke) return { ok: false, reason: 'no-tauri-channel' };
    return { ok: true, value: await invoke(command, args ?? {}) };
  } catch (err) {
    return { ok: false, reason: err?.message != null ? String(err.message) : String(err ?? 'خطای نامشخص') };
  }
}

/** کانال راز دسکتاپ در دسترس است؟ — فعال‌سازی فیلد secret در فرم پیکربندی */
export function cloudSecretChannelAvailable() {
  const tauri = globalThis.__TAURI__;
  return Boolean(tauri && typeof tauri.invoke === 'function');
}

/* ── فاز B — feed مشترک وضعیت اتصال ابری (HTTP) ────────────────────────────────
   برخلاف feed سرور فاز A (رویداد پوسته + poll) این feed صرفاً HTTP است و در حالت وب هم
   کار می‌کند. poll نخست بلافاصله، سپس هر ۳۰ثانیه؛ pollCloudSyncNow برای poll فوری پس از
   هر کنش (ذخیره/حذف/هم‌گام‌سازی اکنون). پاکت ناآشنا نادیده گرفته می‌شود — وضعیت قبلی
   می‌ماند؛ شنوندهٔ خراب هرگز feed را نمی‌کشد (الگوی notifyServerStatus). */

let cloudSyncFeedInstalled = false;
let cloudSyncFeedTimer = null;
let cloudSyncFetcher = null;
let lastCloudSyncPayload = null;
const cloudSyncCallbacks = new Set();

function notifyCloudSyncStatus(payload) {
  const clean = unwrapInstanceSyncStatus(payload);
  if (!clean) return; // پاکت ناآشنا — وضعیت قبلی دست‌نخورده می‌ماند
  lastCloudSyncPayload = clean;
  for (const cb of [...cloudSyncCallbacks]) {
    try { cb(clean); } catch { /* شنوندهٔ خراب هرگز feed را نمی‌کشد */ }
  }
}

function defaultCloudSyncFetcher() {
  return api.get(CLOUD_SYNC_STATUS_PATH);
}

/** poll یک‌بارهٔ وضعیت اتصال ابری — fetcher تزریقی فقط برای آزمون؛ خرابی درگاه نرم است */
export async function pollCloudSyncNow(fetcher) {
  const f = typeof fetcher === 'function' ? fetcher : (cloudSyncFetcher ?? defaultCloudSyncFetcher);
  try {
    notifyCloudSyncStatus(await f());
  } catch { /* درگاه هنوز مستقر نیست یا خط رفت — نرم؛ poll دوره‌ای ادامه می‌یابد */ }
}

/**
 * فاز B — نصب یک‌بارهٔ feed وضعیت اتصال ابری: poll نخست فوری + setInterval هر ۳۰ثانیه.
 * fetcher اختیاری فقط برای آزمون؛ بیرون آن api.get روی درگاه فقط‌مدیر استفاده می‌شود.
 */
export function startCloudSyncFeed(fetcher) {
  if (cloudSyncFeedInstalled) return { installed: true };
  cloudSyncFeedInstalled = true;
  if (typeof fetcher === 'function') cloudSyncFetcher = fetcher;
  void pollCloudSyncNow();
  cloudSyncFeedTimer = setInterval(() => void pollCloudSyncNow(), CLOUD_SYNC_POLL_MS);
  return { installed: true };
}

/** اشتراک شنوندهٔ وضعیت اتصال ابری — آخرین وضعیت شناخته‌شده بلافاصله می‌رسد؛ خروجی لغو اشتراک */
export function subscribeCloudSyncStatus(cb) {
  if (typeof cb !== 'function') return () => {};
  cloudSyncCallbacks.add(cb);
  if (lastCloudSyncPayload) {
    try { cb(lastCloudSyncPayload); } catch { /* نرم */ }
  }
  return () => cloudSyncCallbacks.delete(cb);
}

/** آخرین وضعیت پاک‌سازی‌شدهٔ پاکت instance-sync/status — برای رندر نخست کارت (غایب → null) */
export function lastCloudSyncStatus() {
  return lastCloudSyncPayload;
}

/** بازنشانی feed اتصال ابری — فقط آزمون */
export function resetCloudSyncFeedForTests() {
  cloudSyncFeedInstalled = false;
  if (cloudSyncFeedTimer) { clearInterval(cloudSyncFeedTimer); cloudSyncFeedTimer = null; }
  cloudSyncFetcher = null;
  cloudSyncCallbacks.clear();
  lastCloudSyncPayload = null;
}

/* ── موج ۴ (۴-۵) — راهنمای درون‌برنامه‌ای ─────────────────────────────────────────
   چکیدهٔ دستی و فشردهٔ docs/ADMIN-GUIDE.fa.md (نسخهٔ ساده برای مدیر غیرفنی) — در همین فایل
   تعبیه شده است؛ در زمان اجرا هیچ فایل راهنما خوانده نمی‌شود و هیچ مسیر تازه‌ای به ناوبری
   اضافه نمی‌شود (حکم کارفرما: نمای پنل جدا از ناوبری می‌ماند). هفت بخش = هفت عنوان راهنما. */

const GUIDE_SECTIONS = [
  {
    title: 'روز اول — سه قدم',
    lines: [
      '۱) نصب روی هر رایانهٔ شعبه: فایل نصب را اجرا کنید و «نصب» را بزنید — بقیه‌اش خودکار است.',
      'اگر پیام «آنتی‌ویروس مانع شد» دیدید: «مشاهدهٔ راهنما» را بزنید و همان ۴ قدم تصویری را انجام دهید؛ به آنتی‌ویروس بگویید پوشهٔ نصب «مطمئن» است.',
      '۲) ساختن مرکز مشترک (فقط یک‌بار، روی رایانهٔ ستاد): بخش «مرکز» ← نصب‌و‌راه‌اندازی مرکز؛ حساب رایگان کلادفلر و کلید کلادفلر لازم است. اگر وسطش اینترنت قطع شد، «تلاش دوباره» بی‌خطر است.',
      '۳) دیدن وضعیت: «پنل سلامت» را باز کنید — هدف این است که پنج چراغ سبز باشد: موتور محلی، مرکز، سینک، سهمیه، پشتیبان.'
    ]
  },
  {
    title: 'کارهای روزانه — کمتر از یک دقیقه',
    lines: [
      'صبح یک نگاه به پنل سلامت: همه سبز؟ تمام.',
      'هفته‌ای یک‌بار پشتیبان بگیرید و فایل را روی فلش یا حافظهٔ جدا نگه دارید — نه روی همان رایانه، نه در ایمیل/پیام‌رسان عمومی (داخلش اطلاعات مراجعین است).',
      'ماهی یک‌بار: سطر drill عملیاتی و آزمون بازیابی باید سبز باشد؛ اگر سرخ شد، به پشتیبانی بگویید.',
      'چیزی نصب یا پاک نکنید؛ به‌روزرسانی را فقط از پیام خودِ برنامه انجام دهید — اول ستاد، بعد شعبه‌ها.'
    ]
  },
  {
    title: 'اگر مشکلی پیش آمد — جدول یاری',
    lines: [
      'چراغ «موتور محلی» قرمز ماند؟ چند لحظه صبر کنید؛ بعد از دو دقیقه دکمهٔ «راه‌اندازی دوبارهٔ سامانه» را بزنید.',
      'چراغ «مرکز» قرمز؟ اینترنت را چک کنید؛ اگر اینترنت سالم است مشکل از کلادفلر است — داده‌ها امن‌اند، چند ساعت بعد چک کنید.',
      'بنر «N رکورد در انتظار — محفوظ است»؟ هیچ کاری نکنید؛ با وصل شدن اینترنت خودش می‌فرستد.',
      '«ساعت این دستگاه تنظیم نیست»؟ ساعت ویندوز را روی «تنظیم خودکار زمان» بگذارید.',
      'چراغ «مصرف سهمیه» زرد/قرمز؟ به پشتیبانی بگویید «سهمیه زرد/قرمز شده» — احتمالاً باید پلن ۵ دلاری فعال شود.',
      'پیام «اول مرکز را ارتقا دهید»؟ روی رایانهٔ ستاد اول برنامه را به‌روز کنید، بعد برگردید.',
      'هیچ‌کدام؟ «دریافت گزارش خطا (zip)» را بزنید و فایل را برای پشتیبانی بفرستید.'
    ]
  },
  {
    title: 'کی زنگ بزنید و چه بگویید',
    lines: [
      'زنگ بزنید اگر: چراغی بیش از یک ساعت قرمز ماند · بازیابی سرخ شد · چیزی از دست رفت · پیامی دیدید که در جدول یاری نیست.',
      'چهار چیز را آماده کنید: نسخهٔ برنامه (پایین همین پنل) · عکس از پنل سلامت · فایل گزارش خطا · یک جمله از «چه کاری می‌کردید و چه دیدید».'
    ]
  },
  {
    title: 'این کارها را نکنید',
    lines: [
      'پوشهٔ نصب یا فایل‌های سامانه را جابه‌جا، پاک یا تغییر نام ندهید.',
      'فایل پشتیبان را در ایمیل/پیام‌رسان عمومی نفرستید و روی همان رایانه نگه ندارید.',
      'چند نسخهٔ موازی نصب نکنید؛ آنتی‌ویروس را کامل خاموش نکنید — فقط استثنای پوشهٔ نصب را اضافه کنید.',
      'اطلاعات ورود مدیر را در گروه‌ها نفرستید؛ اگر مشکوک شدید رمز را عوض کنید.'
    ]
  },
  {
    title: 'چند جملهٔ امنیت خاطر',
    lines: [
      'برق رفت؟ ثبت‌های شما با سیستم امن‌نگه‌داری محفوظ‌اند و برنامه در اجرای بعدی خودش را ترمیم می‌کند.',
      'اینترنت یک هفته نیامد؟ شعبه‌ها محلی کامل کار می‌کنند؛ همه‌چیز صف می‌شود و بعد از وصل شدن یک‌جا می‌رود — چیزی گم نمی‌شود و چیزی دوبله ثبت نمی‌شود.',
      'رایانهٔ ستاد سوخت؟ مرکز روی کلادفلر است و تاریخچهٔ خودش را نگه می‌دارد؛ ستاد فقط «کلید کنترل» است و با نصب دوباره برمی‌گردد.'
    ]
  },
  {
    title: 'واژه‌نامهٔ کوتاه',
    lines: [
      'موتور محلی: سرویس پشت‌صحنهٔ همین رایانه · مرکز: دستگاه اشتراک دادهٔ بین شعبه‌ها روی کلادفلر.',
      'سینک: رفت‌وآمد خودکار داده بین شعبه‌ها و مرکز · پشتیبان: عکس لحظه‌ای از همهٔ داده‌ها برای روز نیاز.',
      'سهمیه: سقف رایگان کلادفلر برای مصرف روزانه · کلید کلادفلر: کلید مجوزی که کلادفلر برای نصب مرکز می‌خواهد.',
      'واچ‌داگ: نگهبان خودکار؛ اگر سرویس داخلی بمیرد، دوباره راهش می‌اندازد.'
    ]
  }
];



export async function renderHealthPanel(outlet) {
  const root = el('div', {});
  outlet.replaceChildren(root);

  // EXP-4 — گوش‌دادن‌های نگهبان موتور یک‌بار در هر نشست نصب می‌شوند؛ بیرون دسکتاپ no-op
  installEngineWatchdogBanner();

  let timer = null;
  const stopTimer = () => { if (timer) { clearInterval(timer); timer = null; } };

  /* ── موج ۴ — کنش‌ها و بخش‌های افزوده (۴-۱/۴-۲/۴-۵/EXP-6) ──────────────────────
     همه در همین نمای جدا از مسیر؛ هیچ تغییر ناوبری، هیچ لمسی به app.js. بازخوانی ۶۰ثانیه‌ای
     کل نما را از نو می‌سازد — بخش‌های تازه هم با همان ریتم تازه می‌شوند. */

  // خط نتیجهٔ هر کارت: متن + نقطهٔ رنگی (بازخورد کنش‌ها بدون rebuild کل نما)
  function setResult(line, text, tone) {
    if (!line) return;
    const t = healthToneView(tone);
    line.textContent = '';
    line.appendChild(el('span', { class: `dot ${t.dot}`, style: { marginInlineEnd: 'var(--sp-1)' } }));
    line.appendChild(document.createTextNode(text));
  }

  // ذخیرهٔ blob دانلودشده — الگوی نمای پشتیبان‌گیری (downloadBlob + لینک موقت)
  function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function fallbackBackupName() {
    try {
      return `backup-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.db`;
    } catch {
      return 'backup.db';
    }
  }

  // ۴-۲ — «راه‌اندازی دوبارهٔ سامانه» — POST /api/system/restart با تأیید فارسی
  // قرارداد موتور (موج ۴): {ok:true, scheduled:true} یا {already:true} روی دوباره‌زنی.
  async function restartAction(btn, { title, message, resultLine } = {}) {
    await lockBtn(btn, async () => {
      const okGo = await confirmModal({
        title: title ?? 'راه‌اندازی دوبارهٔ سامانه',
        message: message ?? 'سامانه چند ثانیه در دسترس نیست و بعد خودش بالا می‌آید؛ ثبت‌های باز شما محفوظ می‌ماند. راه‌اندازی دوباره انجام شود؟',
        confirmLabel: 'راه‌اندازی دوباره',
        danger: true
      });
      if (!okGo) return;
      try {
        const res = await api.post('/api/system/restart');
        const already = res?.already === true || res?.data?.already === true;
        const text = already
          ? 'راه‌اندازی دوباره از قبل برنامه‌ریزی شده بود — چند ثانیه صبر کنید'
          : 'راه‌اندازی دوباره برنامه‌ریزی شد — سامانه چند ثانیه بعد خودش بالا می‌آید';
        toast(text, 'success');
        setResult(resultLine, text, 'ok');
      } catch (err) {
        toastError(err);
        setResult(resultLine, `راه‌اندازی دوباره انجام نشد: ${err?.message ?? 'خطای نامشخص'}`, 'error');
      }
    });
  }

  // ۴-۲/۴-۱ — «دریافت پشتیبان فوری» — GET /api/backup/download (پیوست باینری backup-*.db)
  // مُهر cs.lastBackupAt همان کلید نمای پشتیبان‌گیری است — منبع تازه می‌شود.
  async function backupDownloadAction(btn, resultLine) {
    await lockBtn(btn, async () => {
      try {
        const { blob, filename } = await api.downloadBlob('/api/backup/download');
        saveBlob(blob, filename || fallbackBackupName());
        try { localStorage.setItem('cs.lastBackupAt', new Date().toISOString()); } catch { /* نرم */ }
        toast('پشتیبان فوری دریافت شد — فایل را روی حافظهٔ جدا (نه همین رایانه) نگه دارید', 'success');
        setResult(resultLine, 'پشتیبان فوری دریافت شد — روی حافظهٔ جدا نگه دارید', 'ok');
      } catch (err) {
        toastError(err);
        setResult(resultLine, `دریافت پشتیبان ناموفق بود: ${err?.message ?? 'خطای نامشخص'}`, 'error');
      }
    });
  }

  // ۴-۲ — «دریافت گزارش خطا (zip)» — GET /api/support/error-package
  async function errorPackageAction(btn, resultLine) {
    await lockBtn(btn, async () => {
      try {
        const { blob, filename } = await api.downloadBlob('/api/support/error-package');
        saveBlob(blob, filename || `error-package-${Date.now()}.zip`);
        toast('گزارش خطا دریافت شد — فایل zip را برای پشتیبانی بفرستید', 'success');
        setResult(resultLine, 'گزارش خطا دریافت شد — برای پشتیبانی بفرستید', 'ok');
      } catch (err) {
        toastError(err);
        setResult(resultLine, `دریافت گزارش خطا ناموفق بود: ${err?.message ?? 'خطای نامشخص'}`, 'error');
      }
    });
  }

  // ۴-۱ — «آزمایش اتصال» مرکز — پینگ واقعی همین حالا: verifyCloudNode (همان مسیر pull
  // یک‌آیتمی با اعتبار نود) روی worker_url ثبت‌شده در «اتصال ابر». اعتبار ناقص = پیام نرم.
  async function centerPingAction(btn, resultLine) {
    await lockBtn(btn, async () => {
      try {
        const [stateM, verifyM] = await Promise.all([
          import('../../../../src/cloud-setup/state.ts'),
          import('../../../../src/cloud-setup/verify.ts')
        ]);
        const rec = stateM.loadCloudRecord();
        if (!rec.worker_url || !rec.node_code) {
          setResult(resultLine, 'اتصال ابری روی این دستگاه تنظیم نشده است', 'warn');
          return;
        }
        const secureRes = await stateM.resolveSecureStore();
        const key = await stateM.readSecret(secureRes.store, stateM.SECRET_NODE_KEY);
        if (!key) {
          setResult(resultLine, 'کلید نود در دسترس نیست — در تنظیمات «ویرایش اتصال» را کامل کنید', 'warn');
          return;
        }
        const r = await verifyM.verifyCloudNode((input, init) => fetch(input, init), {
          workerUrl: rec.worker_url,
          nodeCode: rec.node_code,
          nodeKey: key
        });
        setResult(resultLine, r.message, r.ok ? 'ok' : 'error');
      } catch (err) {
        setResult(resultLine, `آزمایش اتصال ممکن نشد: ${err?.message ?? 'خطای نامشخص'}`, 'error');
      }
    });
  }

  // ۴-۱ — «جبران دوباره» — نقطهٔ ورود جبرانِ موجود runner: coordinator.runCatchUp()
  // (همان مسیر catch-up بوت rust-f14؛ همیشه مجاز حتی در قرنطینه/گات نسخه). اعتبار نود از
  // «اتصال ابر» + مخزن امن در لحظهٔ کلیک خوانده می‌شود — راز انبار نمی‌شود (قرارداد panel.ts).
  const CATCHUP_STATUS_FA = {
    ok: 'کامل شد',
    unconfigured: 'اتصال ابری کامل نیست',
    auth_error: 'اعتبار نود رد شد',
    version_error: 'نسخه ناسازگار — اول برنامه را به‌روز کنید',
    http_error: 'خطای مرکز',
    network_error: 'قطع شبکه',
    ingest_error: 'خطای استقرار در موتور محلی',
    push_failed: 'ارسال ناموفق — ادامهٔ خودکار'
  };
  async function syncCatchupAction(btn, resultLine) {
    await lockBtn(btn, async () => {
      try {
        const [stateM, runnerM, coordM] = await Promise.all([
          import('../../../../src/cloud-setup/state.ts'),
          import('../../../../src/node-sync-runner/runner.ts'),
          import('../../../../src/node-sync-runner/coordinator.ts')
        ]);
        const rec = stateM.loadCloudRecord();
        const secureRes = await stateM.resolveSecureStore();
        const key = await stateM.readSecret(secureRes.store, stateM.SECRET_NODE_KEY);
        const storage = typeof localStorage !== 'undefined' ? localStorage : undefined;
        const runner = runnerM.createNodeSyncRunner({
          baseUrl: rec.worker_url,
          nodeCode: rec.node_code,
          nodeKey: key,
          progressStorage: storage,
          tokenProvider: () => {
            try { return (typeof localStorage !== 'undefined' ? localStorage.getItem('cs.token') : null) ?? null; }
            catch { return null; }
          }
        });
        const coord = coordM.createSyncCoordinator({ runner, progressStorage: storage });
        setResult(resultLine, 'جبران در جریان است…', 'warn');
        const { catchup } = await coord.runCatchUp();
        const head = CATCHUP_STATUS_FA[catchup?.status] ?? 'ناتمام';
        if (catchup?.status === 'ok') {
          const done = catchup.pull_done && catchup.push_done;
          const text = done
            ? `جبران کامل شد — ${fa(Number(catchup.items_pulled) || 0)} دریافت · ${fa(Number(catchup.items_pushed) || 0)} ارسال`
            : `جبران بخشی رفت — ${fa(Number(catchup.items_pulled) || 0)} دریافت · ${fa(Number(catchup.items_pushed) || 0)} ارسال؛ ادامهٔ خودکار از همان نقطه`;
          setResult(resultLine, text, done ? 'ok' : 'warn');
        } else {
          setResult(resultLine, `جبران ناتمام: ${head} — رکوردها محفوظ‌اند و دورهٔ بعد ادامه می‌دهد`, 'warn');
        }
      } catch (err) {
        setResult(resultLine, `جبران دوباره ممکن نشد: ${err?.message ?? 'خطای نامشخص'}`, 'error');
      }
    });
  }

  // ۴-۱ — «بازخوانی سهمیه» — GET /api/central/quota همان درگاه کارت تفصیلی
  async function quotaRefetchAction(btn, resultLine) {
    await lockBtn(btn, async () => {
      try {
        const fresh = unwrapQuota(await api.get('/api/central/quota'));
        if (!fresh) {
          setResult(resultLine, 'پاکت سهمیه خوانا نبود — بعداً دوباره بزنید', 'warn');
          return;
        }
        const pct = fresh.percent && typeof fresh.percent === 'object' ? fresh.percent.requests : null;
        setResult(resultLine, `سهمیه تازه شد — درخواست‌ها ${pctNum(pct)}٪`, 'ok');
      } catch (err) {
        setResult(resultLine, `بازخوانی سهمیه ناموفق بود: ${err?.message ?? 'خطای نامشخص'}`, 'error');
      }
    });
  }

  // کارت سیگنال — سه رنگ + دکمهٔ اقدام + خط نتیجه (۴-۱)
  function signalCardEl({ title, view, actionLabel, onAction }) {
    const tone = healthToneView(view.tone);
    const resultLine = el('div', { class: 'hint-text', style: { marginTop: 'var(--sp-2)', whiteSpace: 'normal' } });
    return el('div', { class: 'card', style: { flex: '1 1 190px', minWidth: '170px', margin: 0 } },
      el('div', { class: 'card__body', style: { padding: 'var(--sp-3)' } },
        el('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', justifyContent: 'space-between', flexWrap: 'wrap' } },
          el('strong', {}, title),
          el('span', { class: `badge ${tone.badge}` }, view.label)
        ),
        el('div', { class: 'hint-text', style: { marginTop: 'var(--sp-1)', whiteSpace: 'normal' } },
          el('span', { class: `dot ${tone.dot}`, style: { marginInlineEnd: 'var(--sp-1)' } }),
          view.detail || '—'),
        el('button', {
          class: 'btn btn--ghost',
          type: 'button',
          style: { marginTop: 'var(--sp-2)', width: '100%' },
          onclick: (e) => onAction(e.currentTarget, resultLine)
        }, actionLabel),
        resultLine
      )
    );
  }

  // ۴-۲ — نوار نجات همیشه‌در‌دسترس: سه دکمه، بالای پنل
  function rescueBarSection() {
    return el('div', { class: 'card', style: { marginBottom: 'var(--sp-4)' } },
      el('div', { class: 'card__body', style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', flexWrap: 'wrap', padding: 'var(--sp-3) var(--sp-4)' } },
        el('span', { class: 'badge badge--neutral', style: { flexShrink: '0' } }, 'نوار نجات'),
        el('button', { class: 'btn btn--primary', type: 'button', onclick: (e) => void restartAction(e.currentTarget) }, 'راه‌اندازی دوبارهٔ سامانه'),
        el('button', { class: 'btn btn--ghost', type: 'button', onclick: (e) => void backupDownloadAction(e.currentTarget, null) }, 'دریافت پشتیبان فوری'),
        el('button', { class: 'btn btn--ghost', type: 'button', onclick: (e) => void errorPackageAction(e.currentTarget, null) }, 'دریافت گزارش خطا (zip)'),
        el('span', { class: 'hint-text', style: { marginInlineStart: 'auto', whiteSpace: 'normal' } }, 'برای روزهای سخت — با تأیید فارسی و حالت مشغول')
      )
    );
  }

  // ۴-۱ — بخش «سلامت یک‌نگاهی»: پنج سیگنال §۴ نقد، هرکدام کارت با سه رنگ + اقدام
  function oneGlanceSection(data, sync, quota, lastBackupAt) {
    const cards = [
      { title: 'موتور محلی', view: engineSignalView(data), actionLabel: 'راه‌اندازی دوبارهٔ موتور', onAction: (btn, line) => restartAction(btn, {
          title: 'راه‌اندازی دوبارهٔ موتور',
          message: 'موتور محلی چند ثانیه خاموش می‌شود و خودش بالا می‌آید؛ ثبت‌های باز محفوظ می‌ماند. راه‌اندازی دوباره انجام شود؟',
          resultLine: line
        }) },
      { title: 'مرکز', view: centerSignalView(sync), actionLabel: 'آزمایش اتصال', onAction: centerPingAction },
      { title: 'سینک', view: syncLagSignalView(sync), actionLabel: 'جبران دوباره', onAction: syncCatchupAction },
      { title: 'مصرف سهمیه', view: quotaSignalView(quota), actionLabel: 'بازخوانی سهمیه', onAction: quotaRefetchAction },
      { title: 'پشتیبان', view: backupSignalView(lastBackupAt), actionLabel: 'دریافت پشتیبان', onAction: backupDownloadAction }
    ];
    return el('div', { class: 'card', style: { marginBottom: 'var(--sp-4)' } },
      el('div', { class: 'card__head' },
        el('h3', { style: { margin: 0 } }, 'سلامت یک‌نگاهی — پنج سیگنال'),
        el('p', { class: 'hint-text', style: { margin: '4px 0 0' } },
          'پنج سیگنال §۴ نقد (موتور محلی، مرکز، عقب‌ماندگی سینک، مصرف سهمیه، پشتیبان) با سه رنگ سبز/زرد/قرمز — هر کارت دکمهٔ اقدام خودش را دارد؛ نتیجهٔ هر اقدام زیر همان کارت می‌آید.')
      ),
      el('div', { class: 'card__body', style: { display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' } },
        cards.map((c) => signalCardEl(c))
      )
    );
  }

  // EXP-6 — ردیف drill عملیاتی: ثبت نتیجه با تأیید فارسی؛ بیش از ۳۱ روز زرد می‌شود
  function drillSection() {
    const valueBadge = el('span', { class: 'badge badge--neutral' }, '—');
    const sub = el('div', { class: 'cell-sub' }, 'هنوز هیچ drill عملیاتی ثبت نشده است');
    const render = () => {
      const v = drillRecordView(readOpsDrillRecord(), Date.now());
      const t = healthToneView(v.tone);
      valueBadge.className = `badge ${t.badge}`;
      valueBadge.textContent = v.label;
      sub.textContent = v.detail;
    };
    render();
    return el('div', { class: 'card card__body--flush', style: { marginBottom: 'var(--sp-4)' } },
      el('div', { class: 'ob-row' },
        el('div', { class: 'ob-row__main' },
          el('div', { class: 'cell-main', style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' } },
            'آخرین drill ثبت‌شده:',
            valueBadge
          ),
          sub
        ),
        el('div', { class: 'ob-row__side' },
          el('button', {
            class: 'btn btn--ghost',
            type: 'button',
            onclick: (e) => void lockBtn(e.currentTarget, async () => {
              const okGo = await confirmModal({
                title: 'ثبت drill امروز',
                message: 'آخرین drill عملیاتی — بازیابی پشتیبان روی رایانهٔ تمیز + قطع اینترنت واقعی + بستن برنامه از Task Manager — امروز با موفقیت انجام شده است؟ فقط نتیجهٔ واقعی را ثبت کنید.',
                confirmLabel: 'ثبت می‌کنم'
              });
              if (!okGo) return;
              try {
                localStorage.setItem(OPS_DRILL_KEY, JSON.stringify({ at: new Date().toISOString(), result: 'done' }));
                render();
                toast('نتیجهٔ drill امروز ثبت شد — ماه بعد دوباره', 'success');
              } catch {
                toast('ثبت drill ممکن نشد — حافظهٔ مرورگر در دسترس نیست', 'error');
              }
            })
          }, 'ثبت drill امروز')
        )
      )
    );
  }

  // ۴-۵ — راهنمای درون‌برنامه‌ای: بخش تاشو؛ متن تعبیه‌شدهٔ همین فایل (بدون خواندن فایل بیرونی)
  function guideSection() {
    const body = el('div', { style: { display: 'none' } },
      GUIDE_SECTIONS.map((s) => el('div', { style: { marginBottom: 'var(--sp-3)' } },
        el('h4', { style: { margin: '0 0 var(--sp-1)' } }, s.title),
        el('ul', { style: { margin: 0, paddingInlineStart: 'var(--sp-4)' } },
          s.lines.map((ln) => el('li', { style: { margin: '2px 0', whiteSpace: 'normal' } }, ln))
        )
      ))
    );
    const toggleBtn = el('button', {
      class: 'btn btn--ghost',
      type: 'button',
      onclick: () => {
        const open = body.style.display !== 'none';
        body.style.display = open ? 'none' : 'block';
        toggleBtn.textContent = open ? 'باز کردن راهنما' : 'بستن راهنما';
      }
    }, 'باز کردن راهنما');
    return el('div', { class: 'card', style: { marginBottom: 'var(--sp-4)' } },
      el('div', { class: 'card__head', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-2)' } },
        el('h3', { style: { margin: 0 } }, 'راهنما — چکیدهٔ راهنمای ادمین'),
        toggleBtn
      ),
      el('div', { class: 'card__body' },
        el('p', { class: 'hint-text', style: { margin: '0 0 var(--sp-2)', whiteSpace: 'normal' } },
          'همان راهنمای سادهٔ ادمین، داخل خود برنامه — برای روزی که فایل راهنما دسترس نیست. سامانهٔ دسکتاپ بدون اینترنت هم کامل کار می‌کند؛ فقط تبادل بین شعبه‌ها تا وصل شدن صبر می‌کند.'),
        body
      )
    );
  }

  /* ── فاز A — کارت «سرور محلی» (لایهٔ دوم نشانگر؛ طرح §۱-۳) ─────────────────────
     وضعیت/پورت‌ها/نسخهٔ اپ/آخرین بوت از feed مشترک پوسته (رویداد engine:status + poll
     ۳۰ثانیه‌ای engine_status) — رندر کارت درجا با شنونده تازه می‌شود، بدون rebuild کل نما.
     سه کنش: راه‌اندازی دوباره (engine_restart با تأیید فارسی — الگوی restartAction)،
     بازکردن پوشهٔ دیتا (open_data_dir)، کپی اطلاعات عیب‌یابی (کلیپ‌بورد با fallback).
     بیرون پوستهٔ میز (window.__TAURI__ غایب) → کارت خاکستری «حالت وب — سرور خارجی». */
  function serverSection() {
    const tauri = globalThis.__TAURI__;
    const hasChannel = Boolean(tauri && (typeof tauri.invoke === 'function' || (tauri.event && typeof tauri.event.listen === 'function')));
    if (!hasChannel) {
      // ۱.۲۷.۱۲ — حالت وب هم آدرس را نشان می‌دهد (خواست کارفرما) — کانال تائوری نیست: origin خودش آدرس است
      const webAddr = serverAddressView(null, typeof window !== 'undefined' && window?.location?.origin ? window.location.origin : null);
      return el('div', { class: 'card', style: { marginBottom: 'var(--sp-4)' } },
        el('div', { class: 'card__head' },
          el('h3', { style: { margin: 0 } }, 'سرور محلی'),
          el('span', { class: 'badge badge--neutral' }, 'حالت وب')
        ),
        el('div', { class: 'card__body' },
          el('p', { class: 'hint-text', style: { whiteSpace: 'normal' } },
            'حالت وب — سرور خارجی: این نسخه بدون پوستهٔ میز اجرا شده و فرمان‌های موتور محلی (engine_status / engine_restart) در دسترس نیستند؛ سلامت موتور همین‌جا از کارت «موتور محلی» بالای پنل خوانده می‌شود.'),
          serverAddressRow(webAddr)
        )
      );
    }
    installServerStatusFeed();
    const resultLine = el('div', { class: 'hint-text', style: { marginTop: 'var(--sp-2)', whiteSpace: 'normal' } });
    const body = el('div', { class: 'card__body--flush' });
    const card = el('div', { class: 'card card__body--flush', style: { marginBottom: 'var(--sp-4)' } },
      el('div', { class: 'ob-section__head' },
        el('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' } },
          el('h3', { style: { margin: 0 } }, 'سرور محلی'),
          el('p', { class: 'hint-text', style: { margin: '4px 0 0' } },
            'وضعیت زندهٔ سرور محلی — همان نقطهٔ رنگی نشانگر سربرگ؛ هر ۳۰ ثانیه و با هر رویداد پوسته تازه می‌شود.')
        )
      ),
      body
    );

    // «راه‌اندازی دوباره» — invoke engine_restart؛ Err فارسی با الگوی پیام موجود (restartAction)
    async function engineRestartAction(btn) {
      await lockBtn(btn, async () => {
        const okGo = await confirmModal({
          title: 'راه‌اندازی دوبارهٔ موتور محلی',
          message: 'موتور محلی چند ثانیه خاموش می‌شود و خودش بالا می‌آید؛ ثبت‌های باز شما محفوظ می‌ماند. راه‌اندازی دوباره انجام شود؟',
          confirmLabel: 'راه‌اندازی دوباره',
          danger: true
        });
        if (!okGo) return;
        const out = await engineInvoke('engine_restart');
        if (out.ok) {
          const text = 'راه‌اندازی دوباره فرمان گرفت — موتور چند ثانیه بعد خودش بالا می‌آید';
          toast(text, 'success');
          setResult(resultLine, text, 'warn');
        } else if (out.reason === 'no-tauri-channel') {
          setResult(resultLine, 'پوستهٔ میز در دسترس نیست — فرمان راه‌اندازی دوباره اجرا نشد', 'error');
        } else {
          toastError(new Error(out.reason));
          setResult(resultLine, `راه‌اندازی دوباره انجام نشد: ${out.reason ?? 'خطای نامشخص'}`, 'error');
        }
      });
    }

    // «بازکردن پوشهٔ دیتا» — invoke open_data_dir (همان فرمان صفحهٔ بوت)
    async function openDataDirAction(btn) {
      await lockBtn(btn, async () => {
        const out = await engineInvoke('open_data_dir');
        if (out.ok) {
          setResult(resultLine, 'پوشهٔ داده در مدیریت فایل ویندوز باز شد', 'ok');
        } else if (out.reason === 'no-tauri-channel') {
          setResult(resultLine, 'پوستهٔ میز در دسترس نیست — بازکردن پوشهٔ داده اجرا نشد', 'error');
        } else {
          setResult(resultLine, `بازکردن پوشهٔ داده ناموفق بود: ${out.reason ?? 'خطای نامشخص'}`, 'error');
        }
      });
    }

    // «کپی اطلاعات عیب‌یابی» — نسخه + state + reason + پورت‌ها + آخرین رویداد، با fallback
    async function copyDiagAction(btn) {
      await lockBtn(btn, async () => {
        const copied = await copyTextToClipboard(serverDiagnosticsText(lastServerStatus()));
        if (copied) {
          toast('اطلاعات عیب‌یابی کپی شد — در پیام پشتیبانی بچسبانید', 'success');
          setResult(resultLine, 'اطلاعات عیب‌یابی کپی شد', 'ok');
        } else {
          setResult(resultLine, 'کپی در کلیپ‌بورد ممکن نشد — مرورگر اجازه نداد', 'error');
        }
      });
    }

    let unsubscribed = false;
    let unsubscribe = null;
    // ۱.۲۷.۱۲ — paint دومایه‌ای شد (status, isInitial): پرِ اولیه با بدنهٔ جدا از DOM هم می‌نشیند
    // (کارت داخل آرایهٔ el ساخته می‌شود و هنوز به DOM وصل نیست) — گارد «اشتراک کهنه» فقط برای emitهای feed
    const paint = makeServerCardPaint(body, {
      resultLine,
      engineRestartAction,
      openDataDirAction,
      copyDiagAction,
      onStaleSubscription: () => {
        // نما رندر دوباره شده (بازخوانی ۶۰ثانیه‌ای کل پنل) — اشتراک کهنه بسته شود
        if (unsubscribe && !unsubscribed) { unsubscribed = true; unsubscribe(); }
      }
    });
    paint(lastServerStatus(), true);
    unsubscribe = subscribeServerStatus(paint);
    return card;
  }

  /* ── فاز B — کارت «اتصال ابری» (سند §۲-۵) — کنار کارت «سرور محلی» (دو کارت جدا) ─────────
     فاز D1 — چیدمان دو-لایه (خواست کارفرما): لایهٔ عادی فقط خط وضعیت انسانی + دو دکمهٔ برجستهٔ
     «دریافت اطلاعات»/«ارسال اطلاعات» (هر دو = POST run-now، همان قرارداد فعلی) + خط «همگام‌سازی
     خودکار: هر X دقیقه (تغییر)» + دکمهٔ «جزئیات پیشرفته»؛ لایهٔ پیشرفته (بازو/بسته، پیش‌فرض بسته)
     نسخهٔ ساختار اطلاعات/تعارض/تاریخچهٔ خطاها/آدرس/کلید + «پیکربندی اولیه…» و «حذف اتصال».
     وضعیت/آخرین هم‌گامی دوطرفه از feed مشترک HTTP (/api/instance-sync/status + poll ۳۰ثانیه‌ای +
     poll فوری پس از هر کنش) — رندر درجا با شنونده، بدون rebuild کل نما (الگوی paint کارت سرور
     فاز A). کنش‌ها: run-now (در جریان → غیرفعال)، «تغییر» (formModal: URL با normalizeWorkerUrl
     موجود + فاصلهٔ خودکار دقیقه + کلید اتصال فقط در دسکتاپ → POST config + invoke
     cloud_secret_set + poll فوری)، «حذف اتصال» (تأیید دوبله + پیام پشتیبان → DELETE config)،
     «کلون از ابر…» در فرم (تأیید دوبله + هشدار جایگزینی اطلاعات → POST clone {confirm:true} →
     نتیجه + مسیر پشتیبان). بیرون پوستهٔ میز فیلد کلید غیرفعال است — بقیهٔ کارت سالم می‌ماند.
     ⚠ هیچ تغییر قرارداد API و هیچ تغییر نام تابع — فقط متن‌ها، ترتیب نمایش و بازو/بستن. */
  function cloudSyncSection(engineGap) {
    const desktopSecret = cloudSecretChannelAvailable();
    // ۱.۲۷.۱۲ — متن کوتاه هشدار ناهم‌نسخه‌ای برای ردیف بی‌اتصال وقتی status=null (خودتوضیحی موتور کهنه)
    const gapShort = engineGapShortView(engineGap);
    const resultLine = el('div', { class: 'hint-text', style: { marginTop: 'var(--sp-2)', whiteSpace: 'normal' } });
    const body = el('div', { class: 'card__body--flush' });
    // فاز D2 — ناحیهٔ سوارشدن ویزارد داخل کارت: عمداً بیرون از body تا بازخوانی‌های ۳۰ثانیه‌ای feed
    // (paint فقط body را عوض می‌کند) ویزاردِ بازِ نیمه‌کاره را نشویند؛ بسته/خالی → گره تهی بی‌اثر
    const setupHost = el('div', {});
    const card = el('div', { class: 'card card__body--flush', style: { marginBottom: 'var(--sp-4)' } },
      el('div', { class: 'ob-section__head' },
        el('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' } },
          el('h3', { style: { margin: 0 } }, 'اتصال ابری'),
          el('p', { class: 'hint-text', style: { margin: '4px 0 0' } },
            'همین دستگاه با مرکز ابری اطلاعات رد و بدل می‌کند — «دریافت اطلاعات» تازه‌ها را از ابر می‌گیرد و «ارسال اطلاعات» کارهای این دستگاه را می‌فرستد؛ وضعیت هر ۳۰ ثانیه و پس از هر کنش تازه می‌شود.')
        )
      ),
      body,
      setupHost
    );

    // «دریافت اطلاعات»/«ارسال اطلاعات» — POST run-now + poll فوری؛ در جریان بودن → دکمه غیرفعال (گارد paint)
    async function runNowAction(btn) {
      await lockBtn(btn, async () => {
        try {
          await api.post('/api/instance-sync/run-now');
          setResult(resultLine, 'دریافت و ارسال اطلاعات فرمان گرفت — وضعیت درجا تازه می‌شود', 'warn');
          await pollCloudSyncNow();
        } catch (err) {
          toastError(err);
          setResult(resultLine, `دریافت و ارسال اطلاعات انجام نشد: ${err?.message ?? 'خطای نامشخص'}`, 'error');
        }
      });
    }

    // «کلون از ابر…» — دکمهٔ دوم فرم پیکربندی: تأیید دوبله + هشدار جایگزینی اطلاعات → POST clone
    // قرارداد: ۴۰۹=نیاز confirm — پس از تأیید دوبله با {confirm:true} می‌رویم؛ پاسخ {ok, tables, backup_path}
    async function cloneFromCloudAction() {
      const okFirst = await confirmModal({
        title: 'کلون از ابر',
        message: 'اطلاعات محلی با اطلاعات ابر جایگزین می‌شود؛ پیش از آن یک پشتیبان خودکار گرفته می‌شود. ادامه می‌دهید؟',
        confirmLabel: 'ادامه',
        danger: true
      });
      if (!okFirst) return;
      const okFinal = await confirmModal({
        title: 'تأیید نهایی کلون',
        message: 'کلون برگشت‌پذیر نیست؛ کارهایی که هنوز به ابر نرسیده‌اند از بین می‌روند (پشتیبان خودکار نگه داشته می‌شود). مطمئن هستید؟',
        confirmLabel: 'کلون می‌کنم',
        danger: true
      });
      if (!okFinal) return;
      try {
        const res = await api.post('/api/instance-sync/clone', { confirm: true });
        const data = res?.data && typeof res.data === 'object' ? res.data : res;
        const backup = typeof data?.backup_path === 'string' && data.backup_path ? data.backup_path : null;
        const tables = Array.isArray(data?.tables) ? data.tables.length : null;
        const text = `کلون از ابر کامل شد — ${tables != null ? `${fa(tables)} جدول · ` : ''}پشتیبان: ${backup ?? '—'}`;
        toast(text, 'success');
        setResult(resultLine, text, 'ok');
        await pollCloudSyncNow();
      } catch (err) {
        setResult(resultLine, `کلون از ابر ناموفق بود: ${err?.message ?? 'خطای نامشخص'}`, 'error');
        throw err; // errBox فرم — مودال باز می‌ماند تا کاربر پیام را ببیند
      }
    }

    // «تغییر» (ویرایش اتصال) — فرم آدرس مرکز ابری + همگام‌سازی خودکار + کلید اتصال (فقط دسکتاپ)
    function configureAction() {
      let secretHint = 'تنظیم کلید اتصال فقط در نسخهٔ دسکتاپ فعال است';
      const openForm = () => {
        const { form } = formModal({
          title: 'پیکربندی اتصال ابری',
          fields: [
            { name: 'url', label: 'آدرس مرکز ابری', type: 'text', required: true, ltr: true, placeholder: 'https://markaz-….workers.dev', hint: 'آدرس مرکز ابری کلادفلر — با https شروع می‌شود' },
            { name: 'interval_minutes', label: 'همگام‌سازی خودکار (دقیقه)', type: 'number', min: 1, value: '10', hint: 'پیش‌فرض ۱۰ دقیقه — یعنی هر ۱۰ دقیقه یک‌بار؛ خالی بماند پیش‌فرض سرور اعمال می‌شود' },
            { name: 'secret', label: 'کلید اتصال', type: 'password', ltr: true, hint: secretHint }
          ],
          submitLabel: 'ذخیره',
          secondary: { label: 'کلون از ابر…', onClick: () => cloneFromCloudAction() },
          onSubmit: async (values) => {
            // URL با نگاشت موجود اعتبارسنجی می‌شود؛ خطا → errBox فرم و ماندن مودال باز
            const { normalizeWorkerUrl } = await import('../../../../src/cloud-setup/verify.ts');
            const nm = normalizeWorkerUrl(values.url ?? '');
            if (!nm.ok) throw new Error(nm.message);
            const configBody = { url: nm.url };
            const minutes = Number(values.interval_minutes);
            if (Number.isFinite(minutes) && minutes > 0) configBody.interval_ms = Math.round(minutes * 60_000);
            await api.post('/api/instance-sync/config', configBody);
            if (desktopSecret && values.secret) {
              const out = await cloudSecretInvoke('cloud_secret_set', { secret: values.secret });
              if (!out.ok) throw new Error(`پیکربندی ذخیره شد ولی ذخیرهٔ کلید اتصال در پوستهٔ میز ناموفق بود: ${out.reason ?? 'خطای نامشخص'}`);
            }
            toast('پیکربندی اتصال ابری ذخیره شد', 'success');
            setResult(resultLine, 'پیکربندی اتصال ذخیره شد — وضعیت درجا تازه می‌شود', 'ok');
            await pollCloudSyncNow();
          }
        });
        // حالت وب — فیلد کلید اتصال غیرفعال؛ مقدار هرگز خوانده/فرستاده نمی‌شود (گارد کانال)
        if (!desktopSecret) {
          const secretInput = form.querySelector('input[name="secret"]');
          if (secretInput) { secretInput.disabled = true; secretInput.placeholder = '—'; }
        }
      };
      if (!desktopSecret) { openForm(); return; }
      // دسکتاپ — ماسک کلید فعلی از پوسته خوانده می‌شود تا hint فرم واقعی باشد
      void (async () => {
        try {
          const cur = await cloudSecretInvoke('cloud_secret_get');
          const mask = cloudSecretMaskView(cur?.ok && typeof cur.value === 'string' ? cur.value : null);
          secretHint = mask !== '—'
            ? `کلید اتصال فعلی: ${mask} — برای تغییر، مقدار تازه بدهید`
            : 'کلید اتصال — یک‌بار در حافظهٔ امن ویندوز ذخیره می‌شود';
        } catch { /* خواندن ماسک نافرجام ماند — hint پیش‌فرض */ }
        openForm();
      })();
    }

    // «حذف اتصال» — تأیید دوبله + پیام پشتیبان/cursorها → DELETE config (+ پاک‌کردن راز در میز)
    async function deleteConnectionAction(btn) {
      await lockBtn(btn, async () => {
        const okFirst = await confirmModal({
          title: 'حذف اتصال ابری',
          message: 'پیکربندی اتصال ابری این دستگاه حذف می‌شود و هم‌گامی از نو شروع می‌شود — پیش از حذف یک پشتیبان بگیرید. ادامه می‌دهید؟',
          confirmLabel: 'حذف اتصال',
          danger: true
        });
        if (!okFirst) return;
        const okFinal = await confirmModal({
          title: 'تأیید نهایی حذف',
          message: 'حذف اتصال برگشت‌پذیر نیست — برای هم‌گامی دوباره باید پیکربندی از اول انجام شود. مطمئن هستید؟',
          confirmLabel: 'حذف می‌کنم',
          danger: true
        });
        if (!okFinal) return;
        try {
          await api.del('/api/instance-sync/config');
          if (desktopSecret) await cloudSecretInvoke('cloud_secret_delete');
          toast('اتصال ابری حذف شد — پشتیبان‌های محلی سرِ جایشان هستند', 'success');
          setResult(resultLine, 'اتصال ابری حذف شد — هم‌گامی از نو شروع می‌شود', 'ok');
          await pollCloudSyncNow();
        } catch (err) {
          toastError(err);
          setResult(resultLine, `حذف اتصال ناموفق بود: ${err?.message ?? 'خطای نامشخص'}`, 'error');
        }
      });
    }

    let unsubscribed = false;
    let unsubscribe = null;
    // فاز D1 — لایهٔ پیشرفته: بازو/بستهٔ نشست‌محلی با پیش‌فرض بسته (مدیر تازه‌کار فقط لایهٔ عادی را می‌بیند)
    let advancedOpen = false;
    const advancedBody = el('div', { style: { display: 'none' } });
    const advancedToggleBtn = el('button', {
      class: 'btn btn--ghost',
      type: 'button',
      onclick: () => { advancedOpen = !advancedOpen; paintAdvanced(); }
    });
    const paintAdvanced = () => {
      const t = cloudAdvancedToggleView(advancedOpen);
      advancedToggleBtn.textContent = t.label;
      advancedToggleBtn.setAttribute('aria-expanded', String(t.expanded));
      advancedBody.style.display = t.hidden ? 'none' : 'block';
    };
    paintAdvanced();

    /* فاز D2 — جریان کامل پیکربندی ابری داخل کارت (خواست کارفرما: «کل جریان پیکربندی ابری باید
       داخل کارت ابریِ پنل سلامت بیاید»): دکمهٔ «شروع پیکربندی ابری» ناحیهٔ داخلی (setupHost) را
       بازو/بسته می‌کند؛ ویزارد کامل (سه گزینه، فرم‌ها، پیش‌نمایش markaz-، گام رمز یک‌بارمصرف،
       «ذخیره و اتصال» و پیوند «وب مرکز ابری») با import پویا فقط هنگام باز شدن lazy سوار می‌شود
       (mountCloudSetup — views/cloud-setup.js — حالت compact). هیچ ناوبری به #/cloud-setup برای
       شروع نیست — آن مسیر فقط دیپ‌لینک می‌ماند. پس از «ذخیره و اتصال» موفق (done)، ناحیه بسته و
       کارت با poll فوری feed مشترک به حالت «متصل» می‌رود — توست موفقیت خودِ ویزارد است. */
    let setupOpen = false;
    let setupUnmount = null;
    const setupToggleBtn = el('button', {
      class: 'btn btn--primary',
      type: 'button',
      onclick: () => void toggleSetupArea()
    });
    const paintSetupToggle = () => {
      const t = cloudSetupEntryToggleView(setupOpen);
      setupToggleBtn.textContent = t.label;
      setupToggleBtn.setAttribute('aria-expanded', String(t.expanded));
    };
    paintSetupToggle();

    async function toggleSetupArea() {
      if (setupOpen) {
        setupOpen = false;
        if (setupUnmount) { setupUnmount(); setupUnmount = null; } // تخریب ویزارد — الگوی unmount
        paintSetupToggle();
        return;
      }
      setupOpen = true;
      paintSetupToggle();
      try {
        const mod = await import('./cloud-setup.js');
        if (!setupOpen || !body.isConnected) return; // در فاصلهٔ import بسته/تخریب شده — سوار نشود
        // تطبیق‌دهندهٔ کوچک deps — همان قرارداد ویزارد: fetch/api یکسان + کانال راز پوستهٔ میز + مودال‌ها
        setupUnmount = mod.mountCloudSetup(setupHost, {
          api,
          invoke: cloudSecretInvoke,
          toast,
          confirmModal,
          formModal
        }, {
          compact: true,
          onDone: () => {
            setupOpen = false;
            if (setupUnmount) { const unmount = setupUnmount; setupUnmount = null; unmount(); } // ناحیه بسته شود
            paintSetupToggle();
            void pollCloudSyncNow(); // کارت با feed موجود به حالت «متصل» می‌رود
          }
        });
      } catch {
        setupOpen = false;
        paintSetupToggle();
        toast('بارگذاری ویزارد پیکربندی ابری ناموفق بود — دوباره تلاش کنید', 'error');
      }
    }

    // ۱.۲۷.۱۲ — paint دومایه‌ای شد (status, isInitial): پرِ اولیه با بدنهٔ جدا از DOM هم می‌نشیند —
    // اگر feed هرگز emit نکند (موتور کهنهٔ بدون /api/instance-sync/*) کارت تا ابد خالی نمی‌ماند
    const paint = makeCloudCardPaint(body, {
      setupToggleBtn,
      advancedToggleBtn,
      advancedBody,
      resultLine,
      runNowAction,
      configureAction,
      deleteConnectionAction,
      gapShort,
      onStaleSubscription: () => {
        // نما رندر دوباره شده (بازخوانی ۶۰ثانیه‌ای کل پنل) — اشتراک کهنه بسته شود
        if (unsubscribe && !unsubscribed) { unsubscribed = true; unsubscribe(); }
      }
    });
    paint(lastCloudSyncStatus(), true);
    unsubscribe = subscribeCloudSyncStatus(paint);
    startCloudSyncFeed();
    return card;
  }

  async function reload() {
    // ف۶ + EXP-2 — پنل سلامت، گزارش رشد، وضعیت هم‌گامی و سهمیهٔ مرکز هم‌زمان گرفته می‌شوند؛
    // خرابیِ هر بخش فقط کارت خودش را degraded می‌کند
    const [healthOut, growthOut, syncOut, quotaOut, capsOut] = await Promise.allSettled([
      api.get('/api/health/panel'),
      api.get('/api/growth/report'),
      api.get('/api/node-sync/status'),
      api.get('/api/central/quota'),
      // ۱.۲۷.۱۳ — پایانهٔ قابلیت‌های موتور (P0-1 ممیزی §۱): عمومی و بی‌احراز؛ خرابیِ آن
      // فقط کارت نسخه را به منبع قبلی برمی‌گرداند — بقیهٔ پنل هرگز نمی‌شکند
      api.get('/api/engine/capabilities')
    ]);
    if (healthOut.status === 'rejected') {
      const err = healthOut.reason;
      stopTimer();
      root.replaceChildren(emptyState({
        iconName: 'alert',
        title: 'بارگذاری پنل سلامت ناموفق بود',
        hint: err?.message ?? 'خطای نامشخص'
      }));
      return;
    }
    const data = healthOut.value.data;
    const growth = growthOut.status === 'fulfilled' ? growthOut.value.data : null;
    const growthError = growthOut.status === 'rejected' ? growthOut.reason : null;
    // ف۶ — وضعیت هم‌گامی: پاکت {data:…} باز می‌شود؛ پاسخ ناآشنا (درگاه هنوز مستقر نبود؟) → null → کارت «نامشخص»
    const sync = syncOut.status === 'fulfilled' ? unwrapNodeSyncStatus(syncOut.value) : null;
    const syncError = syncOut.status === 'rejected' ? syncOut.reason : null;
    // EXP-2 — سهمیهٔ مرکز: خرابی/پاکت ناآشنا → null → کارت «دریافت نشد»؛ بقیهٔ پنل سالم می‌ماند
    const quota = quotaOut.status === 'fulfilled' ? unwrapQuota(quotaOut.value) : null;
    const quotaError = quotaOut.status === 'rejected' ? quotaOut.reason : null;

    // موج ۴ (۴-۱) — مُهر پشتیبان از کلید موجود نمای پشتیبان‌گیری (cs.lastBackupAt)
    let lastBackupAt = null;
    try { lastBackupAt = localStorage.getItem('cs.lastBackupAt'); } catch { /* نرم */ }

    // ۱.۲۷.۱۳ — هشدار ناهم‌نسخه‌ای موتور/برنامه: نسخهٔ موتور با اولویت از /api/engine/capabilities
    // (پایانهٔ قابلیت‌های موتور P0-1 — مستقیم‌ترین سیگنال نسخهٔ موتور؛ عمومی و بی‌احراز)؛
    // اگر آن در دسترس نبود همان اولویت ۱.۲۷.۱۲ (data.version پنل، سپس appVersion پاکت
    // engine_status). APP_VERSION از «منبع یکتای نسخه» (src/core/version.ts) با import پویا —
    // الگوی importهای نما به src.
    let appVersion = null;
    try { appVersion = (await import('../../../../src/core/version.ts')).APP_VERSION ?? null; } catch { /* نرم — بی‌هشدار نسخه */ }
    const feedAppVersion = lastServerStatus()?.appVersion;
    const caps = capsOut.status === 'fulfilled' ? capsOut.value : null;
    const engineVersionText = engineCapabilitiesVersionView(caps)
      || (typeof data?.version === 'string' && data.version ? data.version : null)
      || (typeof feedAppVersion === 'string' && feedAppVersion ? feedAppVersion : null);
    const engineGap = engineAppVersionGapView(engineVersionText, appVersion);

    const dbOk = data?.db?.ok;
    const counts = data?.counts ?? {};
    const cp = data?.cp_link ?? { configured: false, channels: [] };
    const okCount = cp.channels.filter((c) => c.state === 'ok').length;
    const linkBadge = !cp.configured
      ? el('span', { class: 'badge badge--neutral' }, 'خاموش (کلید نود تنظیم نشده)')
      : okCount === cp.channels.length
        ? el('span', { class: 'badge badge--success' }, `هر ${fa(cp.channels.length)} درگاه سالم`)
        : el('span', { class: 'badge badge--warning' }, `${fa(okCount)} از ${fa(cp.channels.length)} درگاه سالم`);

    // ف۶ — کارت وضعیت هم‌گامی: هر خطای غیرمنتظرهٔ ساخت فقط به «نامشخص» بی‌صدا می‌افتد — پنل هرگز نمی‌شکند
    let syncCard;
    try {
      syncCard = syncSection(sync, syncError);
    } catch {
      syncCard = el('div', { class: 'card', style: { marginBottom: 'var(--sp-4)' } },
        el('div', { class: 'card__head' },
          el('h3', { style: { margin: 0 } }, 'وضعیت هم‌گامی'),
          el('span', { class: 'badge badge--neutral' }, 'نامشخص')
        ),
        el('div', { class: 'card__body' },
          el('p', { class: 'hint-text' }, 'وضعیت هم‌گامی نامشخص — بقیهٔ پنل سالم است.'))
      );
    }

    // EXP-2 — کارت مصرف مرکز: هر خطای غیرمنتظرهٔ ساخت فقط به «دریافت نشد» بی‌صدا می‌افتد — پنل هرگز نمی‌شکند
    let quotaCard;
    try {
      quotaCard = quotaSection(quota, quotaError);
    } catch {
      quotaCard = el('div', { class: 'card', style: { marginBottom: 'var(--sp-4)' } },
        el('div', { class: 'card__head' },
          el('h3', { style: { margin: 0 } }, 'مصرف مرکز (برآوردی)'),
          el('span', { class: 'badge badge--neutral' }, 'دریافت نشد')
        ),
        el('div', { class: 'card__body' },
          el('p', { class: 'hint-text' }, 'سهمیهٔ مرکز دریافت نشد — بقیهٔ پنل سالم است.'))
      );
    }

    /* فاز D2 — کوتاه‌سازی پنل (خواست کارفرما: «منوی کارت سلامت خیلی طولانیه — ساده شود»)؛
       بالای صفحه فقط سه چیز: «سلامت یک‌نگاهی» + کارت «سرور محلی» + کارت «اتصال ابری»؛ بقیهٔ بخش‌ها
       (به همان ترتیب و محتوای قبل) زیر آکاردئون واحد «جزئیات پیشرفته» با پیش‌فرض بسته جمع می‌شوند —
       باز/بسته سشن‌محلی (کلید hp.advancedOpen — الگوی cs.cloudSetupSkipped)؛ عنوان‌های h3 عین قبل.
       نوار نجات هم داخل همین آکاردئون می‌آید تا «فقط سه چیز» در بالای صفحه برقرار بماند (کنش‌هایش
       با یک باز کردن در دسترس‌اند). هر دو مسیر رندر پوشش داده شد: کارت‌های عادی و کارت‌های
       fallback (syncCard/quotaCard ناشی از خطای درگاه) همه داخل همین آکاردئون می‌نشینند. */
    let advancedOpenNow = advancedSectionsOpenInSession();
    const advancedBody = el('div', { style: { display: 'none' } },
      rescueBarSection(), // ۴-۲ — نوار نجات سه‌دکمه‌ای (راه‌اندازی دوباره / پشتیبان فوری / zip)

      el('div', { class: 'card', style: { marginBottom: 'var(--sp-4)' } },
        el('div', { class: 'card__head' },
          el('h3', { style: { margin: 0 } }, 'سامانه'),
          el('span', { class: dbOk ? 'badge badge--success' : 'badge badge--error' }, dbOk ? 'D1 متصل' : 'D1 قطع')
        ),
        el('div', { class: 'card__body--flush' },
          infoRow('نسخهٔ سامانه', el('span', {}, `${data?.version ?? '—'}${data?.env ? ` · محیط ${data.env}` : ''}`)),
          infoRow('مایگریشن‌های اعمال‌شده', data?.migrations?.applied != null ? fa(data.migrations.applied) : '—'),
          infoRow('تأخیر D1', data?.db?.latency_ms != null ? `${fa(data.db.latency_ms)} میلی‌ثانیه` : '—'),
          infoRow('خطاهای مرورگر (۲۴ ساعت)', counts.client_errors_24h != null ? fa(counts.client_errors_24h) : '—'),
          infoRow('تله‌متری RUM (۲۴ ساعت)', counts.rum_events_24h != null ? fa(counts.rum_events_24h) : '—'),
          infoRow('گزارش باگ باز', counts.bug_reports_open != null ? fa(counts.bug_reports_open) : '—')
        )
      ),

      syncCard, // ف۶ — وضعیت هم‌گامی نود (بین «سامانه» و درگاه‌های CP: جبرانی/خارج از خط/خطا با یک نگاه)

      quotaCard, // EXP-2 — مصرف مرکز (برآوردی): سه شاخص رنگی + ورود ناموفق ۲۴ ساعت؛ خرابی = «دریافت نشد»

      el('div', { class: 'card card__body--flush', style: { marginBottom: 'var(--sp-4)' } },
        el('div', { class: 'ob-section__head' },
          el('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' } },
            el('h3', { style: { margin: 0 } }, 'لینک کنترل‌پلین — شش درگاه'),
            linkBadge
          ),
          el('p', { class: 'hint-text', style: { margin: '4px 0 0' } },
            'هر درگاه «آخرین موفقیت» خودش را از زمانِ ثبت‌شدهٔ همگام‌سازی می‌خواند؛ کهنه‌شدن یعنی CP پاسخ نمی‌دهد یا ترافیک زنده برای چرخهٔ فرصت‌طلب نبوده — هیچ مسیر محلی به‌خاطر آن نمی‌شکند.')
        ),
        el('div', {}, cp.channels.map(channelRow))
      ),

      alertsSection(data?.alerts, data?.alerts_last_evaluated_at), // ف۵ (P0-3) — هشدارهای فعال زنده

      growthSection(growth, growthError),

      drillSection(), // EXP-6 — ثبت drill عملیاتی ماهانه (پیوند ۳-۲ و چک‌لیست چاپی ADMIN-GUIDE)

      guideSection() // ۴-۵ — راهنمای درون‌برنامه‌ای (چکیدهٔ ADMIN-GUIDE — بدون خواندن فایل)
    );
    const advancedToggleBtn = el('button', {
      class: 'btn btn--ghost',
      type: 'button',
      onclick: () => {
        advancedOpenNow = !advancedOpenNow;
        markAdvancedSectionsOpen(advancedOpenNow); // سشن‌محلی — الگوی skip ویزارد ابری
        paintAdvancedSections();
      }
    });
    const paintAdvancedSections = () => {
      const layout = healthPanelLayoutView(advancedOpenNow);
      advancedToggleBtn.textContent = layout.toggleLabel;
      advancedToggleBtn.setAttribute('aria-expanded', String(layout.open));
      advancedBody.style.display = layout.advancedHidden ? 'none' : 'block';
    };
    paintAdvancedSections();

    root.replaceChildren(
      el('div', { class: 'page-head' },
        el('h2', {}, 'پنل سلامت'),
        el('p', { class: 'hint-text' }, 'وضعیت زندهٔ سامانه و لینک کنترل‌پلین — از زمانِ واقعی آخرین همگام‌سازی و شمارنده‌های جدول‌ها؛ هر ۶۰ ثانیه خودکار بازخوانی می‌شود.')
      ),

      oneGlanceSection(data, sync, quota, lastBackupAt), // ۴-۱ — پنج سیگنال §۴ نقد با اقدام

      // فاز B — دو کارت جدا کنار هم (دو قرارداد جدا — سند §۲-۵): «سرور محلی» (فاز A) + «اتصال ابری» (فاز B)؛
      // روی نمایشگر باریک خودش می‌شکند (auto-fit) — هیچ تغییری در ساخت کارت سرور فاز A نداریم
      // ۱.۲۷.۱۲ — ردیف هشدار ناهم‌نسخه‌ای (badge زرد موجود — بدون CSS تازه) بالای کارت سرور
      // محلی داخل همان grid (span همهٔ ستون‌ها)؛ gapShort به کارت ابری می‌رود (ردیف بی‌اتصال)
      el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 'var(--sp-3)', alignItems: 'start' } },
        engineGap
          ? el('div', { class: 'card card__body--flush', style: { gridColumn: '1 / -1' } },
              el('div', { class: 'ob-row' },
                el('div', { class: 'ob-row__main' },
                  el('div', { class: 'cell-main', style: { whiteSpace: 'normal' } }, engineGap.text)
                ),
                el('div', { class: 'ob-row__side' },
                  el('span', { class: 'badge badge--warning' }, 'ناهم‌نسخه‌ای')
                )
              ))
          : null,
        serverSection(), cloudSyncSection(engineGap)),

      // فاز D2 — آکاردئون واحد «جزئیات پیشرفته»: بقیهٔ بخش‌ها با همان ترتیب/محتوای قبل، پیش‌فرض بسته
      el('div', { class: 'card card__body--flush', style: { marginBottom: 'var(--sp-4)' } },
        el('div', { class: 'ob-row' },
          el('div', { class: 'ob-row__main' },
            el('div', { class: 'cell-main' }, 'بقیهٔ بخش‌های پنل'),
            el('div', { class: 'cell-sub' }, 'سامانه، وضعیت هم‌گامی، مصرف مرکز، کنترل‌پلین، هشدارها، گزارش رشد جدول‌ها، بازیابی و راهنما — همه سرِ جایشان هستند؛ با «جزئیات پیشرفته» باز می‌شوند.')
          ),
          el('div', { class: 'ob-row__side' }, advancedToggleBtn)
        ),
        advancedBody
      ),

      el('p', { class: 'hint-text' },
        `آخرین بازخوانی: ${formatJalaliDateTime(data?.now)} — مرجع طراحی: طرح ارتقای بک‌اند §۳-۹ (CP-2/CP-3) و §۵-۳ (ف۴ بهداشت داده).`)
    );
  }

  // بازخوانی خودکار ۶۰ثانیه‌ای — وقتی نما از DOM بیرون رفت، تایمر خودش را می‌بندد
  await reload();
  stopTimer();
  timer = setInterval(() => {
    if (!root.isConnected) { stopTimer(); return; }
    reload();
  }, 60_000);
}

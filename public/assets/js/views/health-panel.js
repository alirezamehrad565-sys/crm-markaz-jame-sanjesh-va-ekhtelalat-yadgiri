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
import { api } from '../api.js';
import { el, icon, emptyState, skeletonState } from '../ui.js';
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
        'سهمیهٔ روزانهٔ مرکز (کارگر ابری) با برآوردِ خواندن — سه شاخص با سطح رنگی؛ ورود ناموفق ۲۴ ساعت همان آمار امنیتی مرکز است. این درگاه فقط-مدیر مرکز است؛ اگر پنل روی نود اجرا شود همین کارت «دریافت نشد» می‌گیرد و بقیهٔ پنل سالم می‌ماند.')
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
   / engine:down {attempts} را emit می‌کند (desktop/src-tauri/src/lib.rs). کانال دریافت:
   window.__TAURI__.event.listen — با withGlobalTauri در tauri.conf.json فعال می‌شود.
   همه‌چیز گاردشده است: بیرون پوستهٔ دسکتاپ (مرورگر/آزمون/IPC ردشده) کل تابع no-op می‌ماند
   و SPA هرگز نمی‌شکند. بنر ثابت بالای صفحه: زرد راه‌اندازی دوباره، سبز «دوباره راه افتاد»
   با پنهان‌شدن خودکار ۱۰ثانیه‌ای، قرمز ماندگار «پاسخ نمی‌دهد». */

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

export async function renderHealthPanel(outlet) {
  const root = el('div', {});
  outlet.replaceChildren(root);

  // EXP-4 — گوش‌دادن‌های نگهبان موتور یک‌بار در هر نشست نصب می‌شوند؛ بیرون دسکتاپ no-op
  installEngineWatchdogBanner();

  let timer = null;
  const stopTimer = () => { if (timer) { clearInterval(timer); timer = null; } };

  async function reload() {
    // ف۶ + EXP-2 — پنل سلامت، گزارش رشد، وضعیت هم‌گامی و سهمیهٔ مرکز هم‌زمان گرفته می‌شوند؛
    // خرابیِ هر بخش فقط کارت خودش را degraded می‌کند
    const [healthOut, growthOut, syncOut, quotaOut] = await Promise.allSettled([
      api.get('/api/health/panel'),
      api.get('/api/growth/report'),
      api.get('/api/node-sync/status'),
      api.get('/api/central/quota')
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

    root.replaceChildren(
      el('div', { class: 'page-head' },
        el('h2', {}, 'پنل سلامت'),
        el('p', { class: 'hint-text' }, 'وضعیت زندهٔ سامانه و لینک کنترل‌پلین — از زمانِ واقعی آخرین همگام‌سازی و شمارنده‌های جدول‌ها؛ هر ۶۰ ثانیه خودکار بازخوانی می‌شود.')
      ),

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

/**
 * آزمون کارت «وضعیت هم‌گامی» پنل سلامت (ف۶ + موج ۱):
 * نگاشت حالت موتور هم‌گامی → برچسب فارسی/کلاس رنگ باید پایدار بماند —
 * قرارداد GET /api/node-sync/status نسخهٔ ۲: synced/catching_up/offline/error/idle
 * + version/clock_drift_minutes/clock_warning/last_catchup (موج ۱ — ۱-۱/۱-۳/۱-۴).
 * نگاشت‌ها تابع خالص‌اند (بدون DOM) — الگو: front-view-identifiers.test.ts و format-front.test.ts.
 */
// @ts-ignore — فایل .js فرانت، خارج از include تایپ‌اسکریپت است (import تک‌خطی تا @ts-ignore نشتی را بپوشاند)
import { syncErrorKindView, syncStateView, clockWarningView, catchupSummaryView, versionNumbersView, versionIncompatView, reconciliationView, reconciliationDetailView, quotaLevelView, failedLoginsView, installEngineWatchdogBanner, engineSignalView, centerSignalView, syncLagSignalView, quotaSignalView, backupSignalView, drillRecordView, readOpsDrillRecord, OPS_DRILL_KEY, healthToneView } from '../../public/assets/js/views/health-panel.js';

describe('کارت وضعیت هم‌گامی پنل سلامت — نگاشت حالت به برچسب/رنگ', () => {
  it('پنج حالت شناخته‌شدهٔ قرارداد → برچسب فارسی و کلاس رنگ درست', () => {
    expect(syncStateView('synced')).toMatchObject({ badge: 'badge--success', dot: 'dot--success', label: 'هم‌گام شد' });
    expect(syncStateView('catching_up')).toMatchObject({ badge: 'badge--warning', dot: 'dot--warning', label: 'هم‌گام‌سازی جبرانی در جریان است…' });
    expect(syncStateView('offline')).toMatchObject({ badge: 'badge--warning', dot: 'dot--warning', label: 'خارج از خط — ثبت‌ها محفوظ است' });
    expect(syncStateView('error')).toMatchObject({ badge: 'badge--error', dot: 'dot--error', label: 'خطای هم‌گامی — تلاش دوباره خودکار می‌شود' });
    expect(syncStateView('idle')).toMatchObject({ badge: 'badge--neutral', dot: 'dot--neutral', label: 'در انتظار اولین هم‌گامی' });
  });

  it('حالت/گونهٔ ناشناخته یا حذف‌شده → «نامشخص» بی‌کرش (درگاه شاید هنوز مستقر نباشد)', () => {
    expect(syncStateView('nonsense')).toMatchObject({ badge: 'badge--neutral', label: 'وضعیت هم‌گامی نامشخص' });
    expect(syncStateView(undefined)).toMatchObject({ dot: 'dot--neutral', label: 'وضعیت هم‌گامی نامشخص' });
    expect(syncErrorKindView('network')).toBe('مشکل شبکه');
    expect(syncErrorKindView('quota')).toBe('سقف مصرف');
    expect(syncErrorKindView('version')).toBe('ناسازگاری نسخه');
    expect(syncErrorKindView('other_kind')).toBe('خطای نامشخص');
    expect(syncErrorKindView(undefined)).toBe('خطای نامشخص');
  });
});

describe('موج ۱ (۱-۳) — هشدار زرد اختلاف ساعت با مرکز', () => {
  it('clock_warning=true → پیام زرد با تعداد دقیقه به رقم فارسی', () => {
    expect(clockWarningView(true, 30)).toBe('ساعت این دستگاه تنظیم نیست — با ساعت مرکز ۳۰ دقیقه اختلاف دارد');
    expect(clockWarningView(true, 3)).toBe('ساعت این دستگاه تنظیم نیست — با ساعت مرکز ۳ دقیقه اختلاف دارد');
  });

  it('بی‌هشدار/ورودی ناقص → null (خط زرد اصلاً رندر نمی‌شود) — بی‌کرش', () => {
    expect(clockWarningView(false, 30)).toBeNull();
    expect(clockWarningView(undefined, 30)).toBeNull();
    expect(clockWarningView(null, 30)).toBeNull();
    expect(clockWarningView(true, undefined)).toBe('ساعت این دستگاه تنظیم نیست — با ساعت مرکز اختلاف دارد');
    expect(clockWarningView(true, null)).toBe('ساعت این دستگاه تنظیم نیست — با ساعت مرکز اختلاف دارد');
    expect(clockWarningView('true', 5)).toBeNull(); // فقط true صریحِ boolean هشدار می‌دهد
  });
});

describe('موج ۱ (بقیهٔ ۱-۱) — خط سبز پس از جبران کامل', () => {
  const NOW = Date.parse('2026-11-13T10:00:00Z');

  it('synced با خلاصهٔ تازهٔ دوطرفه → «هم‌گام شد؛ N رکورد رسید» (N = pulled+pushed، رقم فارسی)', () => {
    const fresh = { at: '2026-11-13T09:57:00Z', pulled: 300, pushed: 500 }; // سه دقیقه پیش
    expect(catchupSummaryView('synced', fresh, NOW)).toBe('هم‌گام شد؛ ۸۰۰ رکورد رسید');
  });

  it('فقط یک جهت nonzero → فعل متناسب (ارسال شد/دریافت شد)؛ صفر → null (برچسب عادی می‌ماند)', () => {
    const fresh = { at: '2026-11-13T09:59:00Z', pulled: 0, pushed: 12 };
    expect(catchupSummaryView('synced', fresh, NOW)).toBe('هم‌گام شد؛ ۱۲ رکورد ارسال شد');
    const pullOnly = { at: '2026-11-13T09:59:00Z', pulled: 7, pushed: 0 };
    expect(catchupSummaryView('synced', pullOnly, NOW)).toBe('هم‌گام شد؛ ۷ رکورد دریافت شد');
    const empty = { at: '2026-11-13T09:59:00Z', pulled: 0, pushed: 0 };
    expect(catchupSummaryView('synced', empty, NOW)).toBeNull();
  });

  it('خارج از پنجرهٔ ۱۰دقیقه‌ای / حالت غیر synced / خلاصهٔ غایب یا خراب → null', () => {
    const old = { at: '2026-11-13T09:00:00Z', pulled: 300, pushed: 500 }; // یک ساعت پیش
    expect(catchupSummaryView('synced', old, NOW)).toBeNull();
    const fresh = { at: '2026-11-13T09:59:00Z', pulled: 3, pushed: 4 };
    expect(catchupSummaryView('catching_up', fresh, NOW)).toBeNull();
    expect(catchupSummaryView('error', fresh, NOW)).toBeNull();
    expect(catchupSummaryView('synced', null, NOW)).toBeNull();
    expect(catchupSummaryView('synced', undefined, NOW)).toBeNull();
    expect(catchupSummaryView('synced', { pulled: 3, pushed: 4 }, NOW)).toBeNull(); // بی‌at
    expect(catchupSummaryView('synced', { at: 'خراب', pulled: 3, pushed: 4 }, NOW)).toBeNull();
  });

  it('مرز پنجره: کمی بیش از ۱۰ دقیقه → بیرون؛ دقیقاً ۱۰ دقیقه → هنوز داخل؛ کج‌ساعت جزئی مُهر آینده → داخل', () => {
    const justOver = { at: '2026-11-13T09:49:59Z', pulled: 1, pushed: 1 }; // ۱۰ دقیقه و ۱ ثانیه
    expect(catchupSummaryView('synced', justOver, NOW)).toBeNull();
    const edge = { at: '2026-11-13T09:50:00Z', pulled: 1, pushed: 1 }; // دقیقاً ۱۰ دقیقه
    expect(catchupSummaryView('synced', edge, NOW)).toBe('هم‌گام شد؛ ۲ رکورد رسید');
    const skew = { at: '2026-11-13T10:00:30Z', pulled: 1, pushed: 1 }; // ۳۰ثانیه آینده — ساعت دستگاه کمی عقب
    expect(catchupSummaryView('synced', skew, NOW)).toBe('هم‌گام شد؛ ۲ رکورد رسید');
  });
});

describe('موج ۱ (۱-۴) — ردیف قرمز ناسازگاری نسخه (یکپارچه با paused_version)', () => {
  it('compatible=false → پیام قرمز + شماره‌های هندشیک «نسخهٔ نود X · حداقل نسخهٔ مرکز Y»', () => {
    expect(versionIncompatView({ client: '1.25.0', center: '1.26.2', compatible: false })).toEqual({
      message: 'نسخه ناسازگار — اول مرکز را ارتقا دهید',
      detail: 'نسخهٔ نود 1.25.0 · حداقل نسخهٔ مرکز 1.26.2'
    });
    expect(versionIncompatView({ compatible: false })).toEqual({
      message: 'نسخه ناسازگار — اول مرکز را ارتقا دهید',
      detail: null
    });
  });

  it('سازگار/بی‌نسخه/ورودی خراب → null (ردیف قرمز از راه paused_version همچنان رندر می‌شود)', () => {
    expect(versionIncompatView({ client: '1.26.0', center: '1.26.2', compatible: true })).toBeNull();
    expect(versionIncompatView({ client: '1.26.0', center: '1.26.2' })).toBeNull(); // compatible غایب = قضاوت نمی‌شود
    expect(versionIncompatView(null)).toBeNull();
    expect(versionIncompatView(undefined)).toBeNull();
    expect(versionIncompatView('نسخه')).toBeNull();
  });

  it('خط شماره‌های نسخه برای ردیف paused_version هم «حداقل نسخهٔ مرکز» را می‌دهد؛ بی‌عدد = null', () => {
    expect(versionNumbersView({ client: '1.26.0', center: '1.26.2', compatible: true })).toBe(
      'نسخهٔ نود 1.26.0 · حداقل نسخهٔ مرکز 1.26.2'
    );
    expect(versionNumbersView({ client: '1.26.0' })).toBe('نسخهٔ نود 1.26.0 · حداقل نسخهٔ مرکز —');
    expect(versionNumbersView({ center: '1.26.2' })).toBe('نسخهٔ نود — · حداقل نسخهٔ مرکز 1.26.2');
    expect(versionNumbersView({})).toBeNull();
    expect(versionNumbersView({ compatible: false })).toBeNull();
    expect(versionNumbersView(null)).toBeNull();
  });
});

// ───────────────────────── EXP-1 — ردیف آشتی‌ساز (قرارداد v3) ─────────────────────────

describe('EXP-1 — ردیف آشتی‌ساز از فیلد reconciliation وضعیت v3', () => {
  const NOW = Date.parse('2026-11-13T10:00:00Z');

  it('ok=true و differences=0 در پنجرهٔ ۱۰دقیقه‌ای → سبز «همهٔ دامنه‌ها هم‌شمار»', () => {
    const fresh = { at: '2026-11-13T09:58:00Z', ok: true, differences: 0, detail: null };
    expect(reconciliationView(fresh, NOW)).toEqual({ tone: 'ok', message: 'آشتی‌ساز: همهٔ دامنه‌ها هم‌شمار' });
    // دقیقاً روی مرز ۱۰ دقیقه — هنوز داخل پنجره
    const edge = { at: '2026-11-13T09:50:00Z', ok: true, differences: 0, detail: null };
    expect(reconciliationView(edge, NOW)).toMatchObject({ tone: 'ok' });
  });

  it('ok=false → زرد «ناهم‌خوانی در K دامنه — بررسی لازم» با رقم فارسی', () => {
    const fresh = { at: '2026-11-13T09:59:00Z', ok: false, differences: 2, detail: [{ domain: 'library', center: 40, local: 39 }] };
    expect(reconciliationView(fresh, NOW)).toEqual({ tone: 'warn', message: 'آشتی‌ساز: ناهم‌خوانی در ۲ دامنه — بررسی لازم' });
    expect(reconciliationDetailView(fresh.detail)).toBe('library — مرکز ۴۰ · این دستگاه ۳۹');
    const five = { at: '2026-11-13T09:59:00Z', ok: false, differences: 5, detail: [] };
    expect(reconciliationView(five, NOW)?.message).toBe('آشتی‌ساز: ناهم‌خوانی در ۵ دامنه — بررسی لازم');
  });

  it('خارج از پنجرهٔ ۱۰دقیقه‌ای / ورودی غایب یا خراب → null (ردیف رندر نمی‌شود)', () => {
    const old = { at: '2026-11-13T09:00:00Z', ok: true, differences: 0, detail: null };
    expect(reconciliationView(old, NOW)).toBeNull();
    expect(reconciliationView(null, NOW)).toBeNull();
    expect(reconciliationView(undefined, NOW)).toBeNull();
    expect(reconciliationView('آشتی', NOW)).toBeNull();
    expect(reconciliationView({ ok: true, differences: 0 }, NOW)).toBeNull(); // بی‌at
    expect(reconciliationView({ at: 'خراب', ok: true, differences: 0 }, NOW)).toBeNull();
    const future = { at: '2026-11-13T10:00:30Z', ok: true, differences: 0, detail: null }; // کج‌ساعت جزئی → داخل
    expect(reconciliationView(future, NOW)).toMatchObject({ tone: 'ok' });
  });

  it('ok=true با differences ناهم‌خوان (پاکت عجیب) → null؛ differences غایب با ok=false → زرد بی‌عدد', () => {
    expect(reconciliationView({ at: '2026-11-13T09:59:00Z', ok: true, differences: 3 }, NOW)).toBeNull();
    expect(reconciliationView({ at: '2026-11-13T09:59:00Z', ok: false }, NOW)).toMatchObject({ tone: 'warn', message: 'آشتی‌ساز: ناهم‌خوانی در دامنه‌ها — بررسی لازم' });
    expect(reconciliationDetailView(undefined)).toBeNull();
    expect(reconciliationDetailView([{ domain: 'packages' }])).toBe('packages — مرکز — · این دستگاه —');
  });
});

// ───────────────────────── EXP-2 — کارت مصرف مرکز (برآوردی) ─────────────────────────

describe('EXP-2 — نگاشت‌های کارت مصرف مرکز', () => {
  it('سطح مصرف → کلاس نشان: ok سبز / warn زرد / danger قرمز / ناشناخته خنثی', () => {
    expect(quotaLevelView('ok')).toBe('badge--success');
    expect(quotaLevelView('warn')).toBe('badge--warning');
    expect(quotaLevelView('danger')).toBe('badge--error');
    expect(quotaLevelView('other')).toBe('badge--neutral');
    expect(quotaLevelView(undefined)).toBe('badge--neutral');
  });

  it('ورود ناموفق ۲۴ ساعت: پنج یا بیشتر → زرد؛ کمتر → خنثی؛ ورودی غایب/منفی → خنثی با «—»', () => {
    expect(failedLoginsView(5)).toEqual({ cls: 'badge--warning', text: '۵' });
    expect(failedLoginsView(12)).toEqual({ cls: 'badge--warning', text: '۱۲' });
    expect(failedLoginsView(4)).toEqual({ cls: 'badge--neutral', text: '۴' });
    expect(failedLoginsView(0)).toEqual({ cls: 'badge--neutral', text: '۰' });
    expect(failedLoginsView(undefined)).toEqual({ cls: 'badge--neutral', text: '—' });
    expect(failedLoginsView(-1)).toEqual({ cls: 'badge--neutral', text: '—' });
  });
});

// ───────────────────────── EXP-4 — بنر نگهبان موتور (گارد کامل) ─────────────────────────

describe('EXP-4 — بنر نگهبان موتور: بیرون پوستهٔ دسکتاپ no-op بی‌کرش', () => {
  it('بدون کانال __TAURI__ (مرورگر/آزمون) → نصب نمی‌شود و هیچ throwی ندارد', () => {
    expect((globalThis as Record<string, unknown>)['__TAURI__']).toBeUndefined(); // محیط آزمون — کانال نیست
    const out = installEngineWatchdogBanner();
    expect(out.installed).toBe(false);
    expect(out.reason).toBe('no-tauri-channel');
    // فراخوانی دوباره هم بی‌خطر است
    expect(installEngineWatchdogBanner().installed).toBe(false);
  });
});

// ───────────────── موج ۴ (۴-۱) — پنج سیگنال §۴ نقد، هرکدام سه رنگ ─────────────────
// نگاشت‌ها تابع خالص بی‌DOM‌اند (الگوی بالای همین فایل) — پنج سیگنال: موتور محلی، مرکز،
// عقب‌ماندگی سینک، مصرف سهمیه، پشتیبان + EXP-6 drill عملیاتی.

describe('موج ۴ (۴-۱) — سیگنال موتور محلی', () => {
  it('db سالم و بدون فیلد بازی‌ها (نسخهٔ قدیمی‌تر) → سبز؛ فیلد games افزوده با گارد کامل', () => {
    expect(engineSignalView({ version: '1.26.3', db: { ok: true, latency_ms: 3 } })).toMatchObject({ tone: 'ok', label: 'سالم' });
    expect(engineSignalView({ version: '1.26.3', db: { ok: true }, games: { ok: true, port: 8787 } })).toMatchObject({ tone: 'ok' });
    // games حاضر ولی ok=false → زرد
    expect(engineSignalView({ db: { ok: true }, games: { ok: false, port: 8787 } })).toMatchObject({ tone: 'warn', label: 'ناتمام — بازی‌ها' });
    // games شکل خراب → بی‌اثر (سبز عادی)
    expect(engineSignalView({ db: { ok: true }, games: 'junk' })).toMatchObject({ tone: 'ok' });
    expect(engineSignalView({ db: { ok: false } })).toMatchObject({ tone: 'error', label: 'پاسخ نمی‌دهد' });
    expect(engineSignalView(null)).toMatchObject({ tone: 'error' });
    expect(engineSignalView('junk')).toMatchObject({ tone: 'error' });
  });
});

describe('موج ۴ (۴-۱) — سیگنال مرکز و عقب‌ماندگی سینک', () => {
  const NOW = Date.parse('2026-11-14T10:00:00Z');

  it('مرکز: هم‌گام با نسخه → سبز؛ خارج از خط → زرد «داده محفوظ است»؛ خطا → قرمز؛ ناسازگاری → قرمز', () => {
    const synced = { state: 'synced', version: { client: '1.26.3', center: '1.26.3', compatible: true }, last_pull_ok_at: '2026-11-14T09:58:00Z' };
    expect(centerSignalView(synced, NOW)).toMatchObject({ tone: 'ok', label: 'در دسترس' });
    expect(centerSignalView(synced, NOW).detail).toContain('نسخهٔ مرکز 1.26.3');
    expect(centerSignalView({ state: 'offline' }, NOW)).toMatchObject({ tone: 'warn', label: 'قطع — داده محفوظ است' });
    expect(centerSignalView({ state: 'error', last_error: { kind: 'server', at: '2026-11-14T09:00:00Z' } }, NOW)).toMatchObject({ tone: 'error', label: 'پاسخ نمی‌دهد' });
    expect(centerSignalView({ state: 'synced', version: { client: '1.26.3', center: '1.26.0', compatible: false } }, NOW)).toMatchObject({ tone: 'error', label: 'ناسازگار نسخه' });
    expect(centerSignalView(null, NOW)).toMatchObject({ tone: 'unknown' });
    expect(centerSignalView(undefined, NOW)).toMatchObject({ tone: 'unknown' });
  });

  it('سینک: صفر و هم‌گام → سبز؛ N رکورد در انتظار → زرد با رقم فارسی؛ خطا/توقف نسخه → قرمز', () => {
    expect(syncLagSignalView({ state: 'synced', pending_push: 0 })).toMatchObject({ tone: 'ok', label: 'بی‌عقب‌ماندگی' });
    expect(syncLagSignalView({ state: 'synced', pending_push: 12 })).toMatchObject({ tone: 'warn', label: '۱۲ رکورد در انتظار' });
    expect(syncLagSignalView({ state: 'offline', pending_push: 0 })).toMatchObject({ tone: 'warn', label: 'خارج از خط' });
    expect(syncLagSignalView({ state: 'error', pending_push: 0 })).toMatchObject({ tone: 'error', label: 'خطای هم‌گامی' });
    expect(syncLagSignalView({ state: 'synced', pending_push: 5, version: { client: 'a', center: 'b', compatible: false } })).toMatchObject({ tone: 'error', label: 'متوقف — نسخه' });
    expect(syncLagSignalView(null)).toMatchObject({ tone: 'unknown' });
  });
});

describe('موج ۴ (۴-۱) — سیگنال مصرف سهمیه و پشتیبان', () => {
  it('سهمیه: بدترین سطح حاکم است — danger قرمز با توصیهٔ Workers Paid، warn زرد، سبز، خاکستری', () => {
    expect(quotaSignalView({ level: { requests: 'ok', rows_written: 'ok', rows_read: 'ok' } })).toMatchObject({ tone: 'ok', label: 'زیر سقف' });
    expect(quotaSignalView({ level: { requests: 'warn', rows_written: 'ok', rows_read: 'ok' } })).toMatchObject({ tone: 'warn', label: 'نزدیک سقف' });
    const danger = quotaSignalView({ level: { requests: 'ok', rows_written: 'danger', rows_read: 'ok' } });
    expect(danger).toMatchObject({ tone: 'error', label: 'سقف رد شده' });
    expect(danger.detail).toContain('Workers Paid');
    expect(quotaSignalView(null)).toMatchObject({ tone: 'unknown', label: 'دریافت نشد' });
  });

  const NOW = Date.parse('2026-11-14T10:00:00Z');

  it('پشتیبان: مُهر غایب → قرمز؛ تا ۷ روز سبز؛ ۸–۳۰ زرد؛ بیش از ۳۰ قرمز — با رقم فارسی', () => {
    expect(backupSignalView(null, NOW)).toMatchObject({ tone: 'error', label: 'بی‌پشتیبان' });
    expect(backupSignalView('not-an-iso', NOW)).toMatchObject({ tone: 'error' });
    expect(backupSignalView('2026-11-11T00:00:00Z', NOW)).toMatchObject({ tone: 'ok', label: 'تازه' });
    expect(backupSignalView('2026-11-01T00:00:00Z', NOW)).toMatchObject({ tone: 'warn', label: 'کهنه شده' });
    expect(backupSignalView('2026-11-01T00:00:00Z', NOW).detail).toContain('۱۳ روز پیش');
    expect(backupSignalView('2026-09-01T00:00:00Z', NOW)).toMatchObject({ tone: 'error', label: 'بیش از یک ماه' });
  });
});

describe('EXP-6 — رکورد drill عملیاتی در پنل', () => {
  const NOW = Date.parse('2026-11-14T10:00:00Z');

  it('بدون رکورد → خاکستری «—»؛ تا ۳۱ روز سبز با تاریخ فارسی؛ بیش از ۳۱ روز زرد', () => {
    expect(drillRecordView(null, NOW)).toMatchObject({ tone: 'unknown', label: '—' });
    expect(drillRecordView({ at: 'broken' }, NOW)).toMatchObject({ tone: 'unknown' });
    expect(drillRecordView({ at: '2026-11-12T00:00:00Z', result: 'done' }, NOW).tone).toBe('ok');
    expect(drillRecordView({ at: '2026-11-12T00:00:00Z', result: 'done' }, NOW).label).toContain('۲۱'); // تاریخ شمسی با رقم فارسی
    const stale = drillRecordView({ at: '2026-08-01T00:00:00Z', result: 'done' }, NOW);
    expect(stale.tone).toBe('warn');
    expect(stale.detail).toContain('وقت drill بعدی است');
  });

  it('خواندن نرم از انبار: JSON خراب/کلید غایب = null؛ کلید قرارداد nodesync:ops-drill-v1', () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    expect(readOpsDrillRecord(storage)).toBeNull();
    storage.setItem(OPS_DRILL_KEY, 'not json');
    expect(readOpsDrillRecord(storage)).toBeNull();
    storage.setItem(OPS_DRILL_KEY, JSON.stringify({ at: '2026-11-12T00:00:00Z', result: 'done' }));
    expect(readOpsDrillRecord(storage)).toMatchObject({ result: 'done' });
    storage.setItem(OPS_DRILL_KEY, JSON.stringify({ result: 'done' })); // بی‌at → نامعتبر
    expect(readOpsDrillRecord(storage)).toBeNull();
  });
});

describe('موج ۴ — نگاشت سه‌رنگ مشترک سیگنال‌ها', () => {
  it('healthToneView: چهار tone قراردادی؛ ناشناخته → خنثی', () => {
    expect(healthToneView('ok')).toEqual({ badge: 'badge--success', dot: 'dot--success' });
    expect(healthToneView('warn')).toEqual({ badge: 'badge--warning', dot: 'dot--warning' });
    expect(healthToneView('error')).toEqual({ badge: 'badge--error', dot: 'dot--error' });
    expect(healthToneView('unknown')).toEqual({ badge: 'badge--neutral', dot: 'dot--neutral' });
    expect(healthToneView('nonsense')).toEqual({ badge: 'badge--neutral', dot: 'dot--neutral' });
    expect(healthToneView(undefined)).toEqual({ badge: 'badge--neutral', dot: 'dot--neutral' });
  });
});

/**
 * آزمون کارت «وضعیت هم‌گامی» پنل سلامت (ف۶ + موج ۱):
 * نگاشت حالت موتور هم‌گامی → برچسب فارسی/کلاس رنگ باید پایدار بماند —
 * قرارداد GET /api/node-sync/status نسخهٔ ۲: synced/catching_up/offline/error/idle
 * + version/clock_drift_minutes/clock_warning/last_catchup (موج ۱ — ۱-۱/۱-۳/۱-۴).
 * نگاشت‌ها تابع خالص‌اند (بدون DOM) — الگو: front-view-identifiers.test.ts و format-front.test.ts.
 */
// @ts-ignore — فایل .js فرانت، خارج از include تایپ‌اسکریپت است (import تک‌خطی تا @ts-ignore نشتی را بپوشاند)
import { syncErrorKindView, syncStateView, clockWarningView, catchupSummaryView, versionNumbersView, versionIncompatView, reconciliationView, reconciliationDetailView, quotaLevelView, failedLoginsView, installEngineWatchdogBanner } from '../../public/assets/js/views/health-panel.js';

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

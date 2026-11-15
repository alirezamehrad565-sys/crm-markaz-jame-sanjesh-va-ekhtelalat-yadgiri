/**
 * آزمون کارت «اتصال ابری» (فاز B — طرح docs/rust/server-cloud-update-design.md §۲-۵):
 * قرارداد GET /api/instance-sync/status فقط‌مدیر — پاکت {configured, url, device_id,
 * secret_present, running, interval_ms, last_sync: null|{at, result:'synced'|'error'|'offline',
 * pulled, pushed, error}, conflicts_total, clock_warning, schema_match}. فرمان‌های راز فقط روی
 * کانال پوستهٔ میز: cloud_secret_set / cloud_secret_get / cloud_secret_delete (Credential Manager).
 * نگاشت‌ها تابع خالص‌اند (بدون DOM) — الگو: front-server-status.test.ts و front-sync-status.test.ts.
 * feed وضعیت HTTP است: poll ۳۰ثانیه‌ای + poll فوری پس از هر کنش؛ پاکت ناآشنا نادیده می‌ماند.
 */
// @ts-ignore — فایل .js فرانت، خارج از include تایپ‌اسکریپت است (import تک‌خطی تا @ts-ignore نشتی را بپوشاند)
import { cloudSyncStateView, cloudCountsView, cloudSecretMaskView, cloudCardView, cloudSyncErrorKindOf, cloudSyncErrorKindView, cloudSyncStatusMessageView, cloudHumanStatusView, cloudAdvancedView, cloudAdvancedToggleView, unwrapInstanceSyncStatus, cloudSecretInvoke, startCloudSyncFeed, pollCloudSyncNow, subscribeCloudSyncStatus, lastCloudSyncStatus, resetCloudSyncFeedForTests, cloudSetupEntryToggleView, healthPanelLayoutView, markAdvancedSectionsOpen, advancedSectionsOpenInSession, HEALTH_PANEL_ADVANCED_KEY, makeCloudCardPaint, engineGapShortView, engineAppVersionGapView } from '../../public/assets/js/views/health-panel.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FRONT = join(__dirname, '../../public/assets/js');

/** پاکت کامل سبز — مرجع مشترک آزمون‌های حالت */
const FULL_SYNCED = {
  configured: true,
  url: 'https://markaz-test.workers.dev',
  device_id: 'dev-1',
  secret_present: true,
  running: false,
  interval_ms: 600_000,
  last_sync: { at: '2026-01-01T10:00:00Z', result: 'synced', pulled: {}, pushed: {} },
  conflicts_total: 0,
  clock_warning: false,
  schema_match: true
};

describe('cloudSyncStateView — تقدم حالت‌های اتصال ابری (سند §۲-۵)', () => {
  it('تقدم: unconfigured بر همه؛ schema ناسازگار بر running؛ running بر نتیجهٔ هم‌گامی', () => {
    expect(cloudSyncStateView({ ...FULL_SYNCED, configured: false, schema_match: false, running: true }))
      .toMatchObject({ badge: 'badge--neutral', dot: 'dot--neutral', label: 'اتصال ابری تنظیم نشده' });
    expect(cloudSyncStateView({ ...FULL_SYNCED, schema_match: false, running: true }))
      .toMatchObject({ badge: 'badge--error', dot: 'dot--error', label: 'نسخهٔ ساختار اطلاعات متفاوت است — به‌روزرسانی لازم است' });
    expect(cloudSyncStateView({ ...FULL_SYNCED, running: true }))
      .toMatchObject({ badge: 'badge--warning', dot: 'dot--warning', label: 'هم‌گامی در جریان…' });
  });

  it('result=synced → سبز «هم‌گام شد» + زمان جلالی (ISO و unix هر دو خوانده می‌شوند)', () => {
    const iso = cloudSyncStateView(FULL_SYNCED);
    expect(iso).toMatchObject({ badge: 'badge--success', dot: 'dot--success', label: 'هم‌گام شد' });
    expect(iso.detail).toContain('آخرین هم‌گامی:');
    expect(iso.detail).toContain('،'); // قالب «تاریخ، ساعت» formatJalaliDateTime
    const unix = cloudSyncStateView({ ...FULL_SYNCED, last_sync: { at: 1767225600, result: 'synced' } });
    expect(unix.detail).toContain('آخرین هم‌گامی:');
    // مُهر خراب → بدون زمان ولی بی‌کرش و همچنان سبز
    const brokenAt = cloudSyncStateView({ ...FULL_SYNCED, last_sync: { at: 'junk', result: 'synced' } });
    expect(brokenAt.badge).toBe('badge--success');
    expect(brokenAt.detail).toBeNull();
  });

  it('result=error → قرمز «خطای هم‌گامی» + error کوتاه‌شده (سقف ۱۲۰ نویسه)', () => {
    const view = cloudSyncStateView({ ...FULL_SYNCED, last_sync: { at: '2026-01-01T10:00:00Z', result: 'error', error: 'x'.repeat(200) } });
    expect(view).toMatchObject({ badge: 'badge--error', dot: 'dot--error', label: 'خطای هم‌گامی' });
    expect(view.detail?.length).toBeLessThanOrEqual(121);
    expect(view.detail?.endsWith('…')).toBe(true);
    // بدون error → فقط برچسب، بی‌کرش
    expect(cloudSyncStateView({ ...FULL_SYNCED, last_sync: { result: 'error' } }).detail).toBeNull();
  });

  it('result=offline → زرد «خارج از خط — تلاش دوباره خودکار»', () => {
    expect(cloudSyncStateView({ ...FULL_SYNCED, last_sync: { at: '2026-01-01T10:00:00Z', result: 'offline' } }))
      .toMatchObject({ badge: 'badge--warning', dot: 'dot--warning', label: 'خارج از خط — تلاش دوباره خودکار' });
  });

  it('بدون last_sync → خنثی «در انتظار اولین هم‌گامی»', () => {
    expect(cloudSyncStateView({ ...FULL_SYNCED, last_sync: null }))
      .toMatchObject({ badge: 'badge--neutral', dot: 'dot--neutral', label: 'در انتظار اولین هم‌گامی' });
    expect(cloudSyncStateView({ configured: true })).toMatchObject({ label: 'در انتظار اولین هم‌گامی' });
  });

  it('ناشناخته/غایب/خراب/نتیجهٔ ناآشنا → خنثی «وضعیت نامشخص» بی‌کرش', () => {
    expect(cloudSyncStateView(undefined)).toMatchObject({ badge: 'badge--neutral', label: 'وضعیت نامشخص' });
    expect(cloudSyncStateView(null)).toMatchObject({ dot: 'dot--neutral', label: 'وضعیت نامشخص' });
    expect(cloudSyncStateView('junk' as unknown as Record<string, unknown>)).toMatchObject({ label: 'وضعیت نامشخص' });
    expect(cloudSyncStateView(42 as unknown as Record<string, unknown>)).toMatchObject({ label: 'وضعیت نامشخص' });
    // پاکت تهی هم بی‌کرش است — به شاخهٔ unconfigured می‌افتد (خنثی)
    expect(cloudSyncStateView({})).toMatchObject({ badge: 'badge--neutral', label: 'اتصال ابری تنظیم نشده' });
    expect(cloudSyncStateView({ configured: true, last_sync: { result: 'weird' } }))
      .toMatchObject({ badge: 'badge--neutral', label: 'وضعیت نامشخص' });
  });

  it('clock_warning → ضمیمهٔ «اختلاف ساعت با مقصد!» — فقط وقتی اتصال هست', () => {
    const warn = cloudSyncStateView({ ...FULL_SYNCED, clock_warning: true });
    expect(warn.label).toBe('هم‌گام شد — اختلاف ساعت با مقصد!');
    expect(cloudSyncStateView({ ...FULL_SYNCED, running: true, clock_warning: true }).label)
      .toBe('هم‌گامی در جریان… — اختلاف ساعت با مقصد!');
    // بی‌اتصال مقصدی در کار نیست — پیام ضمیمه نمی‌شود
    expect(cloudSyncStateView({ ...FULL_SYNCED, configured: false, clock_warning: true }).label)
      .toBe('اتصال ابری تنظیم نشده');
    expect(cloudSyncStateView({ ...FULL_SYNCED, clock_warning: false }).label).toBe('هم‌گام شد');
  });
});

describe('cloudCountsView — جمع دو جهت + جزئیات مرتب per-table', () => {
  it('جمع صحیح در هر دو جهت و جزئیات مرتب بر الفبای جدول (فقط غیرصفرها)', () => {
    const out = cloudCountsView({ games: 4, clients: 1 }, { games: 2, sessions: 20 });
    expect(out.head).toBe('↑۲۲ ↓۵'); // pushed=۲۲ (↑) · pulled=۵ (↓)
    expect(out.detail).toBe('clients ↓۱ · games ↑۲ ↓۴ · sessions ↑۲۰');
  });

  it('صفرها از جزئیات حذف می‌شوند؛ همه صفر → detail null', () => {
    expect(cloudCountsView({ a: 0 }, {})).toMatchObject({ head: '↑۰ ↓۰', detail: null });
    expect(cloudCountsView({}, {})).toMatchObject({ head: '↑۰ ↓۰', detail: null });
    // جدول با فقط-دریافت nonzero — جهت تنها می‌آید (آرگومان اول pulled/↓، دوم pushed/↑)
    expect(cloudCountsView({ a: 0, b: 2 }, { b: 0 })).toMatchObject({ head: '↑۰ ↓۲', detail: 'b ↓۲' });
  });

  it('ورودی خراب/منفی/غیرعددی → بی‌کرش و همان صفر شمرده می‌شود', () => {
    expect(cloudCountsView(null, undefined)).toMatchObject({ head: '↑۰ ↓۰', detail: null });
    expect(cloudCountsView('junk' as unknown as Record<string, number>, 42 as unknown as Record<string, number>))
      .toMatchObject({ head: '↑۰ ↓۰', detail: null });
    const out = cloudCountsView({ a: -5, b: '7', c: Number.NaN } as unknown as Record<string, number>, null);
    expect(out.head).toBe('↑۰ ↓۷');
    expect(out.detail).toBe('b ↓۷');
  });
});

describe('cloudSecretMaskView — ماسک secret پوسته («●●●●آخرین ۴ رقم»)', () => {
  it('رشتهٔ ماسک‌شده → خودش؛ غایب/خراب/تهی → «—»', () => {
    expect(cloudSecretMaskView('●●●●۱۲۳۴')).toBe('●●●●۱۲۳۴');
    expect(cloudSecretMaskView('  ●●●●abcd  ')).toBe('●●●●abcd'); // نرم حاشیه‌ای بریده می‌شود
    expect(cloudSecretMaskView(null)).toBe('—');
    expect(cloudSecretMaskView(undefined)).toBe('—');
    expect(cloudSecretMaskView('')).toBe('—');
    expect(cloudSecretMaskView('   ')).toBe('—');
    expect(cloudSecretMaskView(42 as unknown as string)).toBe('—');
  });
});

describe('cloudCardView — گاردهای دکمه‌ها/ردیف‌های کارت', () => {
  it('پاکت کامل اتصال‌دار → دکمه‌ها فعال، ردیف‌ها پُر؛ در جریان بودن → «هم‌گام‌سازی اکنون» غیرفعال', () => {
    expect(cloudCardView(FULL_SYNCED)).toMatchObject({
      configured: true,
      runNowDisabled: false,
      showDelete: true,
      urlText: 'https://markaz-test.workers.dev',
      deviceIdText: 'dev-1',
      intervalText: 'هر ۱۰ دقیقه',
      conflictsTotal: 0,
      secretPresent: true
    });
    expect(cloudCardView({ ...FULL_SYNCED, running: true }).runNowDisabled).toBe(true);
    expect(cloudCardView({ ...FULL_SYNCED, conflicts_total: 3 }).conflictsTotal).toBe(3);
  });

  it('interval_ms → دقیقهٔ فارسی گردشده؛ خراب/صفر/بی‌اتصال → null', () => {
    expect(cloudCardView({ ...FULL_SYNCED, interval_ms: 90_000 }).intervalText).toBe('هر ۲ دقیقه'); // ۱.۵ گرد می‌شود
    expect(cloudCardView({ ...FULL_SYNCED, interval_ms: 59_000 }).intervalText).toBe('هر ۱ دقیقه');
    expect(cloudCardView({ ...FULL_SYNCED, interval_ms: 0 }).intervalText).toBeNull();
    expect(cloudCardView({ ...FULL_SYNCED, interval_ms: 'junk' }).intervalText).toBeNull();
    expect(cloudCardView({ configured: false, interval_ms: 600_000 }).intervalText).toBeNull(); // بی‌اتصال — ردیف نشان داده نمی‌شود
  });

  it('پاکت غایب/ناقص → همهٔ گاردها بسته بی‌کرش (runNow غیرفعال، حذف پنهان، ردیف‌ها خالی)', () => {
    expect(cloudCardView(null)).toMatchObject({
      configured: false,
      runNowDisabled: true,
      showDelete: false,
      urlText: null,
      deviceIdText: null,
      intervalText: null,
      conflictsTotal: null,
      secretPresent: false
    });
    expect(cloudCardView(undefined)).toMatchObject({ runNowDisabled: true, showDelete: false });
    const partial = cloudCardView({ configured: true, interval_ms: 'junk', conflicts_total: -1, url: 42 });
    expect(partial.intervalText).toBeNull();
    expect(partial.conflictsTotal).toBeNull();
    expect(partial.urlText).toBeNull();
  });
});

/* ── فاز D1 — «انسانی‌سازی» کارت «اتصال ابری»: نگاشت گونهٔ خطا، پیام‌های وضعیت کارفرما،
   خط وضعیت انسانی لایهٔ عادی، مدل لایهٔ پیشرفته و بازو/بستن پیش‌فرض‌بسته — همه تابع خالص. ── */

describe('cloudSyncErrorKindOf/cloudSyncErrorKindView — گونهٔ خطا → جملهٔ انسانی تاریخچه', () => {
  it('نگاشت واژگان موجود error kindها به جملات تاریخچهٔ خطاها (قطع اینترنت/ابر شلوغ/کلید/به‌روزرسانی)', () => {
    expect(cloudSyncErrorKindView('network_error')).toBe('قطع اینترنت');
    expect(cloudSyncErrorKindView('http_error')).toBe('ابر شلوغ بود');
    expect(cloudSyncErrorKindView('throttled')).toBe('ابر شلوغ بود');
    expect(cloudSyncErrorKindView('auth_error')).toBe('کلید اتصال پذیرفته نشد');
    expect(cloudSyncErrorKindView('version_error')).toBe('نیاز به به‌روزرسانی برنامه');
    expect(cloudSyncErrorKindView('weird')).toBeNull(); // ناشناخته → null بی‌کرش
    expect(cloudSyncErrorKindView(undefined)).toBeNull();
  });

  it('دسته‌بندی نتیجهٔ پاکت: offline → network_error؛ متن خطا با نشانهٔ روشن به گونهٔ درست', () => {
    expect(cloudSyncErrorKindOf({ result: 'offline' })).toBe('network_error');
    expect(cloudSyncErrorKindOf({ result: 'error', error: 'کلید نود رد شد (۴۰۱)' })).toBe('auth_error');
    expect(cloudSyncErrorKindOf({ result: 'error', error: 'نسخهٔ اسکیما با ابر هم‌خوان نیست — یک سو را به‌روزرسانی کنید' })).toBe('version_error');
    expect(cloudSyncErrorKindOf({ result: 'error', error: '۴۲۹Too Many Requests' })).toBe('throttled');
    expect(cloudSyncErrorKindOf({ result: 'synced' })).toBeNull();
    expect(cloudSyncErrorKindOf(null)).toBeNull();
  });
});

describe('cloudSyncStatusMessageView — سه پیام وضعیت کارفرما عیناً', () => {
  it('network_error / http_error/throttled / auth_error → سه پیام دقیق بند کارفرما', () => {
    expect(cloudSyncStatusMessageView('network_error'))
      .toBe('اتصال ابر کند است؛ اطلاعات محلی سالم است و در صف ارسال است');
    expect(cloudSyncStatusMessageView('http_error'))
      .toBe('مرکز ابری در دسترس نیست؛ کار عادی ادامه دارد و پس از وصل شدن، اطلاعات خودکار رد و بدل می‌شود');
    expect(cloudSyncStatusMessageView('throttled'))
      .toBe('مرکز ابری در دسترس نیست؛ کار عادی ادامه دارد و پس از وصل شدن، اطلاعات خودکار رد و بدل می‌شود');
    expect(cloudSyncStatusMessageView('auth_error'))
      .toBe('کلید اتصال پذیرفته نشد — اتصال را ویرایش کنید');
    expect(cloudSyncStatusMessageView('weird')).toBeNull();
  });
});

describe('cloudHumanStatusView — خط وضعیت انسانی لایهٔ عادی کارت', () => {
  it('بی‌اتصال → «اتصال ابری تنظیم نشده»؛ synced → «متصل به مرکز ابری — آخرین هم‌گامی: …»', () => {
    expect(cloudHumanStatusView({})).toMatchObject({ tone: 'unknown', text: 'اتصال ابری تنظیم نشده' });
    expect(cloudHumanStatusView(null).text).toBe('اتصال ابری تنظیم نشده');
    const human = cloudHumanStatusView(FULL_SYNCED, Date.parse('2026-01-01T10:02:00Z'));
    expect(human.tone).toBe('ok');
    expect(human.text).toContain('متصل به مرکز ابری');
    expect(human.text).toContain('آخرین هم‌گامی:');
    expect(human.text).toContain('۲ دقیقه پیش');
    // بی‌last_sync با اتصال → انتظار اولین رد و بدل
    expect(cloudHumanStatusView({ configured: true }).text).toContain('در انتظار اولین دریافت و ارسال');
  });

  it('offline و خطا → سه پیام کارفرما عیناً در خط وضعیت؛ auth قرمز و بقیه زرد', () => {
    const offline = cloudHumanStatusView({ ...FULL_SYNCED, last_sync: { at: '2026-01-01T10:00:00Z', result: 'offline' } });
    expect(offline.text).toBe('اتصال ابر کند است؛ اطلاعات محلی سالم است و در صف ارسال است');
    expect(offline.tone).toBe('warn');
    const auth = cloudHumanStatusView({ ...FULL_SYNCED, last_sync: { result: 'error', error: 'کلید نود رد شد (۴۰۱)' } });
    expect(auth.text).toBe('کلید اتصال پذیرفته نشد — اتصال را ویرایش کنید');
    expect(auth.tone).toBe('error');
    const http = cloudHumanStatusView({ ...FULL_SYNCED, last_sync: { result: 'error', error: 'خطای HTTP ۵۰۰ از ابر' } });
    expect(http.text)
      .toBe('مرکز ابری در دسترس نیست؛ کار عادی ادامه دارد و پس از وصل شدن، اطلاعات خودکار رد و بدل می‌شود');
    expect(http.tone).toBe('warn');
    // در جریان بودن + کج‌ساعت ضمیمهٔ کوتاه خودش را دارد
    expect(cloudHumanStatusView({ ...FULL_SYNCED, running: true }).text).toContain('در جریان است');
    const clock = cloudHumanStatusView({ ...FULL_SYNCED, clock_warning: true });
    expect(clock.text.endsWith('— اختلاف ساعت با مقصد')).toBe(true);
  });
});

describe('cloudAdvancedView — مدل لایهٔ پیشرفته (پیش‌فرض بسته؛ جزئیات نشست‌محلی)', () => {
  it('نسخهٔ ساختار اطلاعات با جملهٔ «یکسان است/متفاوت است» + تعارض با جملهٔ امن + تاریخچهٔ خطا', () => {
    expect(cloudAdvancedView(FULL_SYNCED)).toMatchObject({
      schemaText: 'نسخهٔ ساختار اطلاعات: یکسان است',
      conflictsText: 'بدون تعارض — همهٔ رکوردها یک نسخه دارند',
      errorText: null
    });
    const schemaBad = cloudAdvancedView({ ...FULL_SYNCED, schema_match: false });
    expect(schemaBad.schemaText).toContain('متفاوت است');
    const conflicts = cloudAdvancedView({ ...FULL_SYNCED, conflicts_total: 3 });
    expect(conflicts.conflictsText)
      .toBe('۳ رکورد دو نسخه‌ای شدند — نسخهٔ قدیمی‌تر به‌عنوان مرجع است و نسخهٔ دیگر امن ذخیره شده');
    const err = cloudAdvancedView({ ...FULL_SYNCED, last_sync: { at: '2026-01-01T10:00:00Z', result: 'offline' } });
    expect(err.errorText).toContain('قطع اینترنت');
    // بی‌اتصال → هر سه null (لایهٔ پیشرفته اصلاً رندر نمی‌شود)
    expect(cloudAdvancedView(null)).toMatchObject({ schemaText: null, conflictsText: null, errorText: null });
    expect(cloudAdvancedView({ configured: false, conflicts_total: 5 }).conflictsText).toBeNull();
  });
});

describe('cloudAdvancedToggleView — بازو/بستن «جزئیات پیشرفته» با پیش‌فرض بسته', () => {
  it('پیش‌فرض (بسته) → برچسب «جزئیات پیشرفته» + hidden=true + expanded=false؛ باز → برچسب «بستن …»', () => {
    expect(cloudAdvancedToggleView()).toMatchObject({ label: 'جزئیات پیشرفته', hidden: true, expanded: false });
    expect(cloudAdvancedToggleView(false)).toMatchObject({ hidden: true, expanded: false });
    expect(cloudAdvancedToggleView(true)).toMatchObject({ label: 'بستن جزئیات پیشرفته', hidden: false, expanded: true });
  });
});

describe('سوپ واژگان فاز D1 — در متن‌های UI کارت ابری اصطلاح خام نمی‌آید', () => {
  it('برچسب‌ها/خط وضعیت/لایهٔ پیشرفته بدون «schema» و «push» و «توکن» و «ورکر» و «secret»', () => {
    const texts = [
      ...Object.values(cloudSyncStateView(FULL_SYNCED)).filter((v) => typeof v === 'string'),
      cloudSyncStateView({ ...FULL_SYNCED, schema_match: false }).label,
      cloudHumanStatusView(FULL_SYNCED).text,
      cloudHumanStatusView({ ...FULL_SYNCED, last_sync: { result: 'offline' } }).text,
      cloudAdvancedView(FULL_SYNCED).schemaText,
      cloudAdvancedView({ ...FULL_SYNCED, conflicts_total: 2 }).conflictsText,
      cloudAdvancedToggleView().label,
      cloudAdvancedToggleView(true).label,
      cloudCardView(FULL_SYNCED).intervalText,
      cloudSyncErrorKindView('auth_error')
    ];
    for (const t of texts) {
      for (const banned of ['schema', 'push', 'pull', 'توکن', 'ورکر', 'secret', 'Worker', 'endpoint', 'binding']) {
        expect(String(t)).not.toContain(banned);
      }
    }
  });
});

describe('unwrapInstanceSyncStatus — پوشش پاکت وضعیت اتصال ابری', () => {
  it('پاکت {data:…} باز می‌شود؛ پاکت شناخته → خودش؛ بی‌هیچ فیلد شناخته/غایب → null', () => {
    expect(unwrapInstanceSyncStatus({ data: FULL_SYNCED })).toMatchObject({ configured: true });
    expect(unwrapInstanceSyncStatus({ configured: true })).toMatchObject({ configured: true });
    expect(unwrapInstanceSyncStatus({ data: { junk: 1 } })).toBeNull();
    expect(unwrapInstanceSyncStatus({})).toBeNull();
    expect(unwrapInstanceSyncStatus(null)).toBeNull();
    expect(unwrapInstanceSyncStatus(undefined)).toBeNull();
    expect(unwrapInstanceSyncStatus('x')).toBeNull();
  });
});

describe('cloudSecretInvoke — گارد کلیک فرمان راز با کانال مصنوعی', () => {
  it('فقط __TAURI_INTERNALS__ مصنوعی (بدون __TAURI__) → گارد رد می‌کند و invoke صدا نمی‌خورد', async () => {
    const calls: Array<[string, unknown]> = [];
    const g = globalThis as unknown as Record<string, unknown>;
    g['__TAURI_INTERNALS__'] = { invoke: async (cmd: string, args?: unknown) => { calls.push([cmd, args]); return null; } };
    try {
      await expect(cloudSecretInvoke('cloud_secret_set', { secret: 'abc' }))
        .resolves.toMatchObject({ ok: false, reason: 'no-tauri-channel' });
      expect(calls.length).toBe(0); // گارد کلیک — هیچ فرمانی به پوسته نرفت
      await expect(cloudSecretInvoke('cloud_secret_get')).resolves.toMatchObject({ ok: false, reason: 'no-tauri-channel' });
      expect(calls.length).toBe(0);
    } finally {
      delete g['__TAURI_INTERNALS__'];
    }
  });

  it('روی کانال __TAURI__ مصنوعی → cloud_secret_set با {secret} فراخوانی می‌شود؛ Err پوسته → {ok:false}', async () => {
    const calls: Array<[string, unknown]> = [];
    const g = globalThis as unknown as Record<string, unknown>;
    g['__TAURI__'] = {
      invoke: async (cmd: string, args?: unknown) => {
        calls.push([cmd, args]);
        if (cmd === 'cloud_secret_boom') throw new Error('پوسته رد کرد');
        return '●●●●۱۲۳۴';
      }
    };
    try {
      const out = await cloudSecretInvoke('cloud_secret_set', { secret: 'abc' });
      expect(out).toMatchObject({ ok: true, value: '●●●●۱۲۳۴' });
      // پین رشتهٔ فرمان راز — قرارداد با lib.rs: cloud_secret_set با آرگومان secret
      expect(calls[0][0]).toBe('cloud_secret_set');
      expect(calls[0][1]).toEqual({ secret: 'abc' });
      await expect(cloudSecretInvoke('cloud_secret_get')).resolves.toMatchObject({ ok: true });
      expect(calls[1]).toEqual(['cloud_secret_get', {}]); // بدون آرگومان — پاکت خالی می‌رود
      await expect(cloudSecretInvoke('cloud_secret_boom')).resolves.toMatchObject({ ok: false, reason: 'پوسته رد کرد' });
    } finally {
      delete g['__TAURI__'];
    }
  });
});

describe('startCloudSyncFeed — feed مشترک وضعیت اتصال ابری (fetcher مصنوعی)', () => {
  it('poll نخست فوری + اشتراک بلافاصله آخرین وضعیت را می‌گیرد؛ پاکت ناآشنا نادیده؛ شنوندهٔ خراب feed را نمی‌کشد؛ لغو اشتراک قطع می‌کند', async () => {
    resetCloudSyncFeedForTests();
    const polls: number[] = [];
    const fetcher = async () => { polls.push(1); return FULL_SYNCED; };
    try {
      expect(startCloudSyncFeed(fetcher).installed).toBe(true);
      expect(startCloudSyncFeed(fetcher).installed).toBe(true); // نصب دوباره بی‌خطر — poll دوم نمی‌سازد
      await new Promise((r) => setTimeout(r, 0));
      expect(polls.length).toBe(1); // poll نخست فوری — تایمر ۳۰ثانیه‌ای در آزمون نمی‌رسد
      expect(lastCloudSyncStatus()).toMatchObject({ configured: true });

      const seen: Array<Record<string, unknown>> = [];
      const unsubs: Array<() => void> = [];
      unsubs.push(subscribeCloudSyncStatus((s: Record<string, unknown>) => seen.push(s)));
      expect(seen.length).toBe(1); // آخرین وضعیت شناخته‌شده بلافاصله می‌رسد
      expect(seen[0]).toMatchObject({ configured: true });

      await pollCloudSyncNow(async () => ({ configured: false }));
      expect(seen.length).toBe(2);
      expect(seen[1]).toMatchObject({ configured: false });

      await pollCloudSyncNow(async () => ({ junk: 1 })); // پاکت ناآشنا — وضعیت قبلی می‌ماند
      await pollCloudSyncNow(async () => null);
      expect(seen.length).toBe(2);

      subscribeCloudSyncStatus(() => { throw new Error('boom'); }); // شنوندهٔ خراب
      await pollCloudSyncNow(async () => ({ configured: true, running: true }));
      expect(seen.length).toBe(3); // شنوندهٔ سالم رخداد را گرفت و feed زنده ماند
      expect(lastCloudSyncStatus()).toMatchObject({ running: true });

      unsubs[0]();
      await pollCloudSyncNow(async () => ({ configured: true }));
      expect(seen.length).toBe(3); // پس از لغو اشتراک پیام نمی‌گیرد
      expect(lastCloudSyncStatus()).toMatchObject({ configured: true }); // ولی feed زنده است
    } finally {
      resetCloudSyncFeedForTests();
    }
  });

  it('pollCloudSyncNow با fetcher پرتاب‌کننده بی‌کرش است — وضعیت قبلی دست‌نخورده می‌ماند', async () => {
    resetCloudSyncFeedForTests();
    try {
      await expect(pollCloudSyncNow(() => { throw new Error('درگاه نیست'); })).resolves.toBeUndefined();
      expect(lastCloudSyncStatus()).toBeNull();
    } finally {
      resetCloudSyncFeedForTests();
    }
  });

  it('resetCloudSyncFeedForTests پس از start — بازنصب با fetcher تازه بی‌خطر است', async () => {
    resetCloudSyncFeedForTests();
    const aCalls: number[] = [];
    const bCalls: number[] = [];
    try {
      startCloudSyncFeed(async () => { aCalls.push(1); return null; });
      resetCloudSyncFeedForTests(); // teardown — تایمر بسته و fetcher پاک می‌شود
      startCloudSyncFeed(async () => { bCalls.push(1); return { configured: true }; });
      await new Promise((r) => setTimeout(r, 0));
      expect(bCalls.length).toBe(1); // feed تازه با fetcher تازه از اول نصب شد
      expect(lastCloudSyncStatus()).toMatchObject({ configured: true });
    } finally {
      resetCloudSyncFeedForTests();
    }
  });
});

/* ── فاز D2 — دو خواست کارفرما پس از v1.27.10 (همه مدل خالص بی‌DOM — الگوی cloudAdvancedToggleView):
   ۱) جریان کامل پیکربندی ابری داخل کارت بی‌اتصال (بدون ناوبری به صفحهٔ جدا)؛
   ۲) کوتاه‌سازی پنل سلامت: بالای صفحه سه چیز؛ بقیه زیر آکاردئون واحد «جزئیات پیشرفته». ── */

describe('cloudSetupEntryToggleView — دکمهٔ «شروع پیکربندی ابری» کارت بی‌اتصال (بازو/بستهٔ ناحیهٔ داخلی)', () => {
  it('بسته (پیش‌فرض) → «شروع پیکربندی ابری» با hidden/expanded بسته؛ باز → برچسب «بستن پیکربندی ابری»', () => {
    expect(cloudSetupEntryToggleView()).toMatchObject({ label: 'شروع پیکربندی ابری', hidden: true, expanded: false });
    expect(cloudSetupEntryToggleView(false)).toMatchObject({ label: 'شروع پیکربندی ابری', hidden: true, expanded: false });
    expect(cloudSetupEntryToggleView(true)).toMatchObject({ label: 'بستن پیکربندی ابری', hidden: false, expanded: true });
  });

  it('سوپ منفی — مدل ورودی ویزارد هیچ ناوبری به صفحهٔ جدا ندارد؛ شاخهٔ بی‌اتصال سورس هم به دکمهٔ داخلی وصل است', () => {
    for (const open of [false, true]) {
      const json = JSON.stringify(cloudSetupEntryToggleView(open));
      expect(json).not.toContain('#/cloud-setup'); // شروع پیکربندی ناوبری ندارد — جریان داخل کارت است
      expect(json).not.toContain('location.hash');
    }
    const src = readFileSync(join(FRONT, 'views/health-panel.js'), 'utf8');
    // ردیف بی‌اتصال کارت به دکمهٔ سوارکنندهٔ داخلی وصل است (نه به ناوبری)
    expect(src).toMatch(/'با «پیکربندی اولیه» این دستگاه به مرکز ابری وصل می‌شود[\s\S]{0,400}setupToggleBtn\)/);
    // ویزارد با import پویا lazy سوار می‌شود (فقط هنگام باز شدن) و compact می‌گیرد
    expect(src).toMatch(/import\('\.\/cloud-setup\.js'\)/);
    expect(src).toMatch(/mountCloudSetup\(setupHost/);
    // مسیر دیپ‌لینک #/cloud-setup فقط در لایهٔ پیشرفتهٔ کارت متصل می‌ماند (deep-link دست‌نخورده)
    expect(src).toContain("vm.configured ? el('button'");
  });
});

describe('healthPanelLayoutView — کوتاه‌سازی پنل: بالای صفحه سه چیز؛ بقیه زیر آکاردئون واحد', () => {
  it('پیش‌فرض بسته: advancedHidden=true و هیچ بخش ثانویه‌ای در خروجی مدل نمی‌آید؛ سه بخش بالا ثابت‌اند', () => {
    const closed = healthPanelLayoutView(undefined);
    expect(closed.open).toBe(false);
    expect(closed.advancedHidden).toBe(true);
    expect(closed.toggleLabel).toBe('جزئیات پیشرفته');
    expect(closed.advancedSections).toEqual([]); // بخش‌های ثانویه فقط وقتی بازند رندر می‌شوند
    expect(closed.topSections).toEqual(['سلامت یک‌نگاهی — پنج سیگنال', 'سرور محلی', 'اتصال ابری']);
    expect(healthPanelLayoutView(false).advancedSections).toEqual([]);
    expect(healthPanelLayoutView('junk' as unknown as boolean).advancedSections).toEqual([]); // ورودی خراب → بسته
  });

  it('باز: همهٔ بخش‌های ثانویه به همان ترتیب قبل می‌آیند — عنوان‌ها عین h3/برچسب موجود (پین متن)', () => {
    const open = healthPanelLayoutView(true);
    expect(open.open).toBe(true);
    expect(open.advancedHidden).toBe(false);
    expect(open.toggleLabel).toBe('بستن جزئیات پیشرفته');
    expect(open.advancedSections).toEqual([
      'نوار نجات',
      'سامانه',
      'وضعیت هم‌گامی',
      'مصرف مرکز (برآوردی)',
      'لینک کنترل‌پلین — شش درگاه',
      'هشدارهای فعال',
      'گزارش رشد جدول‌ها',
      'آخرین drill ثبت‌شده',
      'راهنما — چکیدهٔ راهنمای ادمین'
    ]);
  });

  it('فلگ سشن‌محلی hp.advancedOpen — الگوی cs.cloudSetupSkipped: نوشتن/خواندن/پاک‌کردن + بی‌storage بی‌کرش', () => {
    const g = globalThis as unknown as Record<string, unknown>;
    const makeStorage = () => {
      const m = new Map<string, string>();
      return {
        getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
        setItem: (k: string, v: string) => { m.set(k, v); },
        removeItem: (k: string) => { m.delete(k); }
      };
    };
    const sessionStore = makeStorage();
    g['sessionStorage'] = sessionStore;
    try {
      expect(HEALTH_PANEL_ADVANCED_KEY).toBe('hp.advancedOpen');
      expect(advancedSectionsOpenInSession()).toBe(false); // پیش‌فرض بسته
      markAdvancedSectionsOpen(true);
      expect(advancedSectionsOpenInSession()).toBe(true);
      expect(sessionStore.getItem('hp.advancedOpen')).toBe('1');
      markAdvancedSectionsOpen(false);
      expect(advancedSectionsOpenInSession()).toBe(false);
      expect(sessionStore.getItem('hp.advancedOpen')).toBeNull(); // فقط سشن — هیچ قفل localStorage
    } finally {
      delete g['sessionStorage'];
    }
    // بی‌storage (node/حالت خصوصی) → false بی‌کرش — پیش‌فرض بسته می‌ماند
    expect(advancedSectionsOpenInSession()).toBe(false);
    expect(() => markAdvancedSectionsOpen(true)).not.toThrow();
  });
});

/* ── ۱.۲۷.۱۲ — پرِ اولیهٔ کارت «اتصال ابری» با بدنهٔ جدا از DOM (اشکال گزارش‌شدهٔ کارفرما:
   باگ paint اولیه + موتور کهنهٔ بدون /api/instance-sync/* — feed هرگز emit نمی‌کند) ──
   DOM مصنوعی کمینه — الگوی آزمون mountCloudSetup در front-cloud-setup.test.ts. ── */

class FakeNode {
  tagName: string;
  children: FakeNode[] = [];
  parentNode: FakeNode | null = null;
  attributes = new Map<string, string>();
  listeners = new Map<string, Array<(ev?: unknown) => void>>();
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  className = '';
  value = '';
  disabled = false;
  isRoot = false;

  constructor(tag: string) { this.tagName = String(tag).toUpperCase(); }

  get isConnected(): boolean {
    let p: FakeNode | null = this;
    while (p.parentNode !== null) p = p.parentNode;
    return p.isRoot;
  }
  appendChild(child: FakeNode): FakeNode { child.parentNode = this; this.children.push(child); return child; }
  replaceChildren(...kids: unknown[]): void {
    for (const c of this.children) c.parentNode = null;
    this.children = [];
    for (const k of kids) {
      if (k === null || k === undefined || k === false) continue;
      this.appendChild(k instanceof FakeNode ? k : new FakeText(String(k)));
    }
  }
  setAttribute(key: string, v: string): void { this.attributes.set(key, String(v)); }
  getAttribute(key: string): string | null { return this.attributes.get(key) ?? null; }
  addEventListener(type: string, fn: (ev?: unknown) => void): void {
    const arr = this.listeners.get(type) ?? [];
    arr.push(fn);
    this.listeners.set(type, arr);
  }
}

class FakeText extends FakeNode {
  text: string;
  constructor(text: string) { super('#text'); this.text = text; }
}

/** نصب DOM مصنوعی روی globalThis (ui.js append به instanceof Node گارد می‌زند) — خروجی = بازگردانی */
function installFakeDom(): () => void {
  const g = globalThis as unknown as Record<string, unknown>;
  const prevDocument = g['document'];
  const prevNode = g['Node'];
  g['document'] = {
    createElement: (tag: string) => new FakeNode(tag),
    createElementNS: (ns: string, tag: string) => new FakeNode(tag),
    createTextNode: (text: string) => new FakeText(text),
    body: new FakeNode('body')
  };
  g['Node'] = FakeNode;
  return () => {
    if (prevDocument === undefined) delete g['document']; else g['document'] = prevDocument;
    if (prevNode === undefined) delete g['Node']; else g['Node'] = prevNode;
  };
}

/** همهٔ گره‌های زیرین + متن یک گره (فقط گره‌های متنی) — الگوی آزمون mountCloudSetup */
function allNodes(root: FakeNode): FakeNode[] {
  const out: FakeNode[] = [];
  const walk = (n: FakeNode) => { out.push(n); for (const c of n.children) walk(c); };
  walk(root);
  return out;
}
function textOf(node: FakeNode): string {
  const out: string[] = [];
  for (const n of allNodes(node)) if (n instanceof FakeText) out.push(n.text);
  return out.join('').trim();
}
function findButton(root: FakeNode, label: string): FakeNode | null {
  return allNodes(root).find((n) => n.tagName === 'BUTTON' && textOf(n).includes(label)) ?? null;
}

describe('makeCloudCardPaint — پرِ اولیهٔ کارت «اتصال ابری» با بدنهٔ جدا از DOM (۱.۲۷.۱۲)', () => {
  // متن کوتاه هشدار ناهم‌نسخه‌ای — از همان تابع خالص، تا سوپِ رندر با مدل هم‌خوان بماند
  const GAP_SHORT = engineGapShortView(engineAppVersionGapView('1.27.4', '1.27.11')) as string;

  const makeCtx = (over: Record<string, unknown> = {}) => {
    const setupToggleBtn = new FakeNode('button');
    setupToggleBtn.appendChild(new FakeText('شروع پیکربندی ابری')); // برچسب paintSetupToggle در section
    const advancedToggleBtn = new FakeNode('button');
    advancedToggleBtn.appendChild(new FakeText('جزئیات پیشرفته')); // برچسب paintAdvanced در section
    return {
      setupToggleBtn,
      advancedToggleBtn,
      advancedBody: new FakeNode('div'),
      resultLine: new FakeNode('div'),
      runNowAction: async () => {},
      configureAction: () => {},
      deleteConnectionAction: async () => {},
      gapShort: null,
      onStaleSubscription: vi.fn(),
      ...over
    };
  };

  it('پرِ اولیه (isInitial=true) حتی با status=null و بدنهٔ جدا از DOM پُر می‌شود: توضیح + دو دکمهٔ غیرفعال + CTA', () => {
    const restore = installFakeDom();
    try {
      const body = new FakeNode('div'); // جدا از DOM — همان لحظهٔ ساخت کارت داخل آرایهٔ el در reload
      const ctx = makeCtx();
      const paint = makeCloudCardPaint(body, ctx);
      paint(null, true); // با گارد قدیمی بی‌صدا رد می‌شد و کارت تا ابد خالی می‌ماند
      expect(body.children.length).toBeGreaterThan(0);
      const t = textOf(body);
      // سوپ — خواست کارفرما: خروجی کارت بی‌اتصال شامل متن توضیحِ «وضعیت نگرفته شده» است
      expect(t).toContain('وضعیت اتصال ابری از سرور نگرفته شد — اگر موتور محلی قدیمی است، با به‌روزرسانی نصب درست می‌شود.');
      for (const label of ['دریافت اطلاعات', 'ارسال اطلاعات']) {
        const b = findButton(body, label);
        expect(b).not.toBeNull();
        expect(b?.disabled).toBe(true); // بی‌اتصال → غیرفعال (دکمه‌ها و CTA دست‌نخورده)
      }
      expect(findButton(body, 'شروع پیکربندی ابری')).not.toBeNull(); // CTA در خروجی است
      expect(t).toContain('با «پیکربندی اولیه» این دستگاه به مرکز ابری وصل می‌شود');
      expect(ctx.onStaleSubscription).not.toHaveBeenCalled(); // پرِ اولیه اشتراک کهنه را نمی‌بندد
    } finally { restore(); }
  });

  it('موتور کهنه (status=null + gapShort) → متن کوتاه هشدار ناهم‌نسخه‌ای در cell-sub ردیف بی‌اتصال می‌آید تا CTA بی‌توضیح نماند', () => {
    const restore = installFakeDom();
    try {
      const body = new FakeNode('div');
      const ctx = makeCtx({ gapShort: GAP_SHORT });
      const paint = makeCloudCardPaint(body, ctx);
      paint(null, true);
      const t = textOf(body);
      expect(t).toContain(GAP_SHORT); // متن کوتاه هشدار کنار CTA
      expect(t).toContain('با «پیکربندی اولیه»'); // متن اصلی CTA هم هست
      // شرط status=null است: با وضعیت رسیده (بدنهٔ وصل) متن gap در ردیف بی‌اتصال نمی‌آید
      const body2 = new FakeNode('div');
      const root = new FakeNode('div');
      root.isRoot = true;
      root.appendChild(body2);
      const paint2 = makeCloudCardPaint(body2, makeCtx({ gapShort: GAP_SHORT }));
      paint2({ configured: false }, false);
      const t2 = textOf(body2);
      expect(t2).toContain('با «پیکربندی اولیه»');
      expect(t2).not.toContain(GAP_SHORT);
      expect(t2).not.toContain('وضعیت اتصال ابری از سرور نگرفته شد'); // status واقعی → توضیح «نگرفته شد» حذف
    } finally { restore(); }
  });

  it('گارد فقط برای emitهای feed است: emit با بدنهٔ جدا → اشتراک کهنه بسته می‌شود و بدنه دست‌نخورده می‌ماند', () => {
    const restore = installFakeDom();
    try {
      const body = new FakeNode('div');
      const ctx = makeCtx();
      const paint = makeCloudCardPaint(body, ctx);
      paint(null, true); // پرِ اولیه — جدا از DOM
      const before = body.children.length;
      paint({ configured: true, running: true }, false); // emit feed — بدنه هنوز جدا
      expect(ctx.onStaleSubscription).toHaveBeenCalledTimes(1); // بستن اشتراک کهنه (پیام عین قبل)
      expect(body.children.length).toBe(before); // گارد — بدون رندر
    } finally { restore(); }
  });

  it('پاکت اتصال‌دار (status واقعی) → همان چیدمان قبل با شمارنده‌ها و لایهٔ پیشرفته — هیچ تغییر رفتار', () => {
    const restore = installFakeDom();
    try {
      const body = new FakeNode('div');
      const ctx = makeCtx();
      const paint = makeCloudCardPaint(body, ctx);
      paint(FULL_SYNCED, true); // پرِ اولیه با پاکت کامل
      const t = textOf(body);
      expect(t).toContain('متصل به مرکز ابری');
      expect(t).toContain('همگام‌سازی خودکار: هر ۱۰ دقیقه');
      expect(t).toContain('↑۰ ↓۰');
      expect(t).toContain('نسخهٔ ساختار اطلاعات'); // لایهٔ پیشرفته با اتصال رندر می‌شود
      expect(t).toContain('کلید اتصال');
      expect(t).toContain('تنظیم شده');
      expect(findButton(body, 'دریافت اطلاعات')?.disabled).toBe(false); // با اتصال → فعال
      expect(findButton(body, 'شروع پیکربندی ابری')).toBeNull(); // ردیف بی‌اتصال نیست
      expect(t).not.toContain('وضعیت اتصال ابری از سرور نگرفته شد'); // فقط وقتی status=null
    } finally { restore(); }
  });
});

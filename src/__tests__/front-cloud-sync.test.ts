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
import { cloudSyncStateView, cloudCountsView, cloudSecretMaskView, cloudCardView, unwrapInstanceSyncStatus, cloudSecretInvoke, startCloudSyncFeed, pollCloudSyncNow, subscribeCloudSyncStatus, lastCloudSyncStatus, resetCloudSyncFeedForTests } from '../../public/assets/js/views/health-panel.js';

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
      .toMatchObject({ badge: 'badge--error', dot: 'dot--error', label: 'ناسازگاری نسخهٔ schema — به‌روزرسانی لازم است' });
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

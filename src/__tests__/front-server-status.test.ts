/**
 * آزمون نشانگرهای دوگانهٔ «سرور محلی» (فاز A — طرح docs/rust/server-cloud-update-design.md §۱):
 * نگاشت حالت FSM موتور → برچسب فارسی/کلاس رنگ باید پایدار بماند —
 * قرارداد پوسته ↔ فرانت: رویداد engine:status + فرمان‌های invoke: engine_status /
 * engine_restart / open_data_dir با پاکت {state, port, gamesPort, startedAtUnix,
 * lastEventAtUnix, degradedReason, appVersion}؛ حالت‌ها = رشته‌های FSM موتور (lib.rs):
 * Booting/Validating/Starting/Ready/Degraded/Recovering/Failed.
 * نگاشت‌ها تابع خالص‌اند (بدون DOM) — الگو: front-sync-status.test.ts.
 */
// @ts-ignore — فایل .js فرانت، خارج از include تایپ‌اسکریپت است (import تک‌خطی تا @ts-ignore نشتی را بپوشاند)
import { serverStateView, degradedReasonView, serverPortsView, unixJalaliView, unixAgeView, serverDiagnosticsText, copyTextToClipboard, unwrapEngineStatus, installServerStatusFeed, subscribeServerStatus, lastServerStatus, engineInvoke, resetServerStatusFeedForTests, serverAddressView, engineAppVersionGapView, engineGapShortView, makeServerCardPaint } from '../../public/assets/js/views/health-panel.js';

describe('serverStateView — نگاشت حالت FSM موتور به برچسب/رنگ', () => {
  it('هفت حالت شناخته‌شدهٔ قرارداد → برچسب فارسی و کلاس رنگ درست', () => {
    expect(serverStateView('Ready')).toMatchObject({ badge: 'badge--success', dot: 'dot--success', label: 'سرور محلی در حال اجرا' });
    expect(serverStateView('Degraded', 'games_unhealthy')).toMatchObject({ badge: 'badge--warning', dot: 'dot--warning', label: 'سرور محلی ناتمام — بخش بازی‌ها ناسالم است' });
    expect(serverStateView('Failed')).toMatchObject({ badge: 'badge--error', dot: 'dot--error', label: 'سرور بالا نیامد' });
    expect(serverStateView('Booting')).toMatchObject({ badge: 'badge--warning', dot: 'dot--warning', label: 'در حال راه‌اندازی…' });
    expect(serverStateView('Validating')).toMatchObject({ badge: 'badge--warning', dot: 'dot--warning', label: 'در حال راه‌اندازی…' });
    expect(serverStateView('Starting')).toMatchObject({ badge: 'badge--warning', dot: 'dot--warning', label: 'در حال راه‌اندازی…' });
    expect(serverStateView('Recovering')).toMatchObject({ badge: 'badge--error', dot: 'dot--error', label: 'در حال بازیابی…' });
    // Restarting = حالت واقعی سورسِ امروز (رویداد engine:restarting نگهبان در lib.rs) → زرد
    expect(serverStateView('Restarting')).toMatchObject({ badge: 'badge--warning', dot: 'dot--warning', label: 'در حال بازیابی…' });
  });

  it('Degraded بدون دلیل/با دلیل ناشناخته → زرد «ناتمام — دلیل نامشخص» بی‌کرش', () => {
    expect(serverStateView('Degraded')).toMatchObject({ badge: 'badge--warning', label: 'سرور محلی ناتمام — دلیل نامشخص' });
    expect(serverStateView('Degraded', null)).toMatchObject({ label: 'سرور محلی ناتمام — دلیل نامشخص' });
    expect(serverStateView('Degraded', 'other_reason')).toMatchObject({ label: 'سرور محلی ناتمام — دلیل نامشخص' });
    expect(serverStateView('Degraded', 'games_unhealthy').badge).toBe('badge--warning'); // رنگ با بی‌دلیل فرق نمی‌کند
  });

  it('حالت ناشناخته/غایب/خراب → خنثی «وضعیت نامشخص» بی‌کرش (درگاه شاید هنوز مستقر نباشد)', () => {
    expect(serverStateView('nonsense')).toMatchObject({ badge: 'badge--neutral', dot: 'dot--neutral', label: 'وضعیت نامشخص' });
    expect(serverStateView(undefined)).toMatchObject({ badge: 'badge--neutral', label: 'وضعیت نامشخص' });
    expect(serverStateView(undefined, 'games_unhealthy')).toMatchObject({ badge: 'badge--neutral', label: 'وضعیت نامشخص' });
    expect(serverStateView(null)).toMatchObject({ dot: 'dot--neutral', label: 'وضعیت نامشخص' });
    expect(serverStateView('')).toMatchObject({ badge: 'badge--neutral', label: 'وضعیت نامشخص' });
    expect(serverStateView(42 as unknown as string)).toMatchObject({ badge: 'badge--neutral', label: 'وضعیت نامشخص' });
    expect(serverStateView('ready')).toMatchObject({ badge: 'badge--neutral', label: 'وضعیت نامشخص' }); // بزرگی/کوچکی حروف پایدار
  });
});

describe('degradedReasonView — نگاشت دلیل ناتمامی موتور به فارسی', () => {
  it('دلیل شناخته‌شدهٔ قرارداد → فارسی؛ ناشناخته/غایب → «دلیل نامشخص»', () => {
    expect(degradedReasonView('games_unhealthy')).toBe('بخش بازی‌ها ناسالم است');
    expect(degradedReasonView('other_reason')).toBe('دلیل نامشخص');
    expect(degradedReasonView(undefined)).toBe('دلیل نامشخص');
    expect(degradedReasonView(null)).toBe('دلیل نامشخص');
    expect(degradedReasonView('')).toBe('دلیل نامشخص');
  });
});

describe('serverStateView/serverPortsView — خط پورت‌های پاکت وضعیت', () => {
  it('پاکت کامل → پورت اصلی و بازی‌ها با رقم فارسی؛ غایب/خراب → «—» بی‌کرش', () => {
    expect(serverPortsView({ port: 8787, gamesPort: 8788 })).toBe('پورت اصلی ۸۷۸۷ · بازی‌ها ۸۷۸۸');
    expect(serverPortsView({ port: 8787 })).toBe('پورت اصلی ۸۷۸۷ · بازی‌ها —');
    expect(serverPortsView({})).toBe('پورت اصلی — · بازی‌ها —');
    expect(serverPortsView({ port: 'junk', gamesPort: 0 })).toBe('پورت اصلی — · بازی‌ها —');
    expect(serverPortsView(null)).toBe('پورت اصلی — · بازی‌ها —');
    expect(serverPortsView(undefined)).toBe('پورت اصلی — · بازی‌ها —');
  });
});

describe('unixJalaliView/unixAgeView — نگاشت مُهرهای unix پاکت وضعیت', () => {
  const NOW = 1730000123_000; // میلی‌ثانیه — متناظر unix 1730000123

  it('unix ثانیه معتبر → تاریخ جلالی فارسی؛ غایب/صفر/خراب → «—»', () => {
    const txt = unixJalaliView(1730000000);
    expect(txt).not.toBe('—');
    expect(txt).toContain('،'); // قالب «تاریخ، ساعت» formatJalaliDateTime
    expect(unixJalaliView(0)).toBe('—');
    expect(unixJalaliView(-5)).toBe('—');
    expect(unixJalaliView('junk')).toBe('—');
    expect(unixJalaliView(null)).toBe('—');
    expect(unixJalaliView(undefined)).toBe('—');
  });

  it('سن آخرین رویداد خوانا؛ مُهر آیندهٔ عجیب → «—»', () => {
    expect(unixAgeView(1730000123 - 30, NOW)).toBe('لحظه‌ها پیش'); // ۳۰ ثانیه پیش
    expect(unixAgeView(1730000123 - 1800, NOW)).toBe('۳۰ دقیقه پیش'); // نیم‌ساعت
    expect(unixAgeView(1730000123 - 3660, NOW)).toBe('۱ ساعت پیش'); // مرز ۳۶۰۰ثانیه‌ای ageHuman
    expect(unixAgeView(1730000123 - 90, NOW)).toBe('۲ دقیقه پیش'); // مرز ۹۰ثانیه‌ای ageHuman
    expect(unixAgeView(1730000123 + 60, NOW)).toBe('—'); // مُهر آینده — کج‌ساعت عجیب
    expect(unixAgeView(0, NOW)).toBe('—');
    expect(unixAgeView('junk', NOW)).toBe('—');
    expect(unixAgeView(undefined, NOW)).toBe('—');
  });
});

describe('serverDiagnosticsText — رشتهٔ «کپی اطلاعات عیب‌یابی»', () => {
  it('پاکت کامل → نسخه + وضعیت FSM + دلیل + پورت‌ها (لاتین برای گزارش) + آخرین رویداد', () => {
    const text = serverDiagnosticsText({
      state: 'Ready',
      port: 8787,
      gamesPort: 8788,
      startedAtUnix: 1730000000,
      lastEventAtUnix: 1730000123,
      degradedReason: null,
      appVersion: '1.27.6'
    });
    expect(text).toContain('اطلاعات عیب‌یابی — سرور محلی مرکز جامع');
    expect(text).toContain('نسخهٔ اپ: 1.27.6');
    expect(text).toContain('وضعیت FSM: Ready — سرور محلی در حال اجرا');
    expect(text).toContain('دلیل ناتمامی: —');
    expect(text).toContain('پورت‌ها: اصلی 8787 · بازی‌ها 8788');
    expect(text).toContain('unix 1730000123');
  });

  it('Degraded → وضعیت و دلیل فارسی در همان رشته؛ پاکت غایب/خراب → «نامشخص» بی‌کرش', () => {
    const text = serverDiagnosticsText({ state: 'Degraded', degradedReason: 'games_unhealthy' });
    expect(text).toContain('وضعیت FSM: Degraded — سرور محلی ناتمام — بخش بازی‌ها ناسالم است');
    expect(text).toContain('دلیل ناتمامی: بخش بازی‌ها ناسالم است');
    const empty = serverDiagnosticsText(null);
    expect(empty).toContain('وضعیت FSM: نامشخص');
    expect(empty).toContain('نسخهٔ اپ: —');
    expect(empty).toContain('پورت‌ها: اصلی — · بازی‌ها —');
    expect(serverDiagnosticsText('junk')).toContain('وضعیت FSM: نامشخص');
    expect(serverDiagnosticsText(undefined)).toBe(serverDiagnosticsText(null));
  });
});

describe('unwrapEngineStatus — پوشش پاکت رویداد/فرمان وضعیت', () => {
  it('پاکت شناخته → خودش؛ بی‌هیچ فیلد شناخته/غایب/ناسازگار → null', () => {
    expect(unwrapEngineStatus({ state: 'Ready', port: 8787 })).toMatchObject({ state: 'Ready' });
    expect(unwrapEngineStatus({ degradedReason: 'games_unhealthy' })).toMatchObject({ degradedReason: 'games_unhealthy' });
    expect(unwrapEngineStatus({})).toBeNull();
    expect(unwrapEngineStatus({ foo: 1 })).toBeNull();
    expect(unwrapEngineStatus(null)).toBeNull();
    expect(unwrapEngineStatus(undefined)).toBeNull();
    expect(unwrapEngineStatus('Ready')).toBeNull();
  });
});

describe('copyTextToClipboard — گارد کامل بی‌DOM', () => {
  it('محیط بدون کلیپ‌بورد/DOM (آزمون) → false و بدون throw', async () => {
    await expect(copyTextToClipboard('test')).resolves.toBe(false);
  });
});

describe('engineInvoke — فرمان پوستهٔ میز با گارد', () => {
  it('بدون کانال __TAURI__ (مرورگر/آزمون) → {ok:false, reason:"no-tauri-channel"}', async () => {
    await expect(engineInvoke('engine_restart')).resolves.toMatchObject({ ok: false, reason: 'no-tauri-channel' });
    await expect(engineInvoke('open_data_dir')).resolves.toMatchObject({ ok: false, reason: 'no-tauri-channel' });
  });
});

// ───────────────── feed مشترک وضعیت سرور (engine:status + poll ۳۰ثانیه‌ای) ─────────────────

describe('installServerStatusFeed — بیرون پوستهٔ دسکتاپ no-op بی‌کرش', () => {
  it('بدون کانال __TAURI__ → نصب نمی‌شود؛ فراخوانی دوباره هم بی‌خطر است', () => {
    resetServerStatusFeedForTests();
    expect((globalThis as Record<string, unknown>)['__TAURI__']).toBeUndefined(); // محیط آزمون — کانال نیست
    const out = installServerStatusFeed();
    expect(out.installed).toBe(false);
    expect(out.reason).toBe('no-tauri-channel');
    expect(installServerStatusFeed().installed).toBe(false);
    expect(lastServerStatus()).toBeNull();
    resetServerStatusFeedForTests();
  });
});

describe('installServerStatusFeed — روی کانال مصنوعی: گوش‌دادن + poll + اشتراک', () => {
  it('engine:status گوش داده می‌شود؛ engine_status پول می‌شود؛ شنونده پاکت نرمال‌شده می‌گیرد؛ لغو اشتراک قطع می‌کند', async () => {
    const registered: string[] = [];
    const invoked: string[] = [];
    const handlers: Record<string, (ev?: unknown) => void> = {};
    let invokeResult: unknown = { state: 'Booting', port: 8787, gamesPort: 8788 };
    const g = globalThis as unknown as Record<string, unknown>;
    g['__TAURI__'] = {
      event: { listen: async (name: string, cb: (ev?: unknown) => void) => { registered.push(name); handlers[name] = cb; } },
      invoke: async (cmd: string) => { invoked.push(cmd); return invokeResult; }
    };
    resetServerStatusFeedForTests();
    const unsubRef: Array<() => void> = [];
    try {
      expect(installServerStatusFeed().installed).toBe(true);
      await new Promise((r) => setTimeout(r, 0)); // گوش‌دادن و poll نخست async است
      expect(registered).toEqual(expect.arrayContaining(['engine:status']));
      expect(invoked).toContain('engine_status');
      expect(lastServerStatus()).toMatchObject({ state: 'Booting' });

      const seen: Array<Record<string, unknown>> = [];
      unsubRef.push(subscribeServerStatus((s: Record<string, unknown>) => seen.push(s)));
      expect(seen.length).toBe(1); // آخرین وضعیت شناخته‌شده بلافاصله می‌رسد
      expect(seen[0]).toMatchObject({ state: 'Booting' });

      // رویداد پوسته → شنونده درجا تازه می‌شود (پاکت ناآشنا نادیده گرفته می‌شود)
      handlers['engine:status']({ payload: { state: 'Degraded', degradedReason: 'games_unhealthy', port: 8787 } });
      expect(seen.length).toBe(2);
      expect(seen[1]).toMatchObject({ state: 'Degraded', degradedReason: 'games_unhealthy' });
      handlers['engine:status']({ payload: { junk: true } });
      handlers['engine:status'](undefined);
      expect(seen.length).toBe(2); // پاکت ناآشنا — وضعیت قبلی می‌ماند

      // شنوندهٔ خراب هرگز feed را نمی‌کشد
      subscribeServerStatus(() => { throw new Error('boom'); });
      handlers['engine:status']({ payload: { state: 'Ready', port: 8787 } });
      expect(seen.length).toBe(3); // شنوندهٔ سالم هم رخداد Ready را گرفته
      expect(lastServerStatus()).toMatchObject({ state: 'Ready' });

      unsubRef[0]();
      handlers['engine:status']({ payload: { state: 'Failed' } });
      expect(seen.length).toBe(3); // پس از لغو اشتراک پیام نمی‌گیرد
      expect(lastServerStatus()).toMatchObject({ state: 'Failed' }); // ولی feed زنده است
    } finally {
      if (unsubRef[0]) unsubRef[0]();
      resetServerStatusFeedForTests();
      delete g['__TAURI__'];
    }
  });

  it('پوسته فقط با invoke (بدون event) هم feed برقرار است — poll تنها کافی است', async () => {
    const g = globalThis as unknown as Record<string, unknown>;
    g['__TAURI__'] = { invoke: async () => ({ state: 'Starting', port: 8787 }) };
    resetServerStatusFeedForTests();
    try {
      expect(installServerStatusFeed().installed).toBe(true);
      await new Promise((r) => setTimeout(r, 0));
      expect(lastServerStatus()).toMatchObject({ state: 'Starting' });
    } finally {
      resetServerStatusFeedForTests();
      delete g['__TAURI__'];
    }
  });
});

/* ── ۱.۲۷.۱۲ — آدرس سرور محلی در کارت + هشدار ناهم‌نسخه‌ای موتور/برنامه + پرِ اولیهٔ کارت ── */

describe('serverAddressView — آدرس سرور محلی برای کارت (خواست کارفرما: «۱۲۷.۰.۰.۱ نشون نمی‌دهد»)', () => {
  it('پورت عددی معتبر → http://127.0.0.1:<پورت> با رقم فارسی + copyText لاتین و isDefault=false', () => {
    expect(serverAddressView({ port: 8787, gamesPort: 8788 }, null)).toEqual({ address: 'http://127.0.0.1:۸۷۸۷', copyText: 'http://127.0.0.1:8787', isDefault: false });
    expect(serverAddressView({ port: 8901 }, null).address).toBe('http://127.0.0.1:۸۹۰۱'); // متن فارسی پورت با fa
    expect(serverAddressView({ port: 8901 }, null).copyText).toBe('http://127.0.0.1:8901'); // کپی همیشه رقم لاتین — آدرس چسبانده‌شده مستقیم کار کند
    expect(serverAddressView({ port: '8787' }, null).isDefault).toBe(false); // پورت رشته‌ای عددی هم معتبر
  });

  it('پورت غایب/خراب → پیش‌فرض ۸۷۸۷ با isDefault=true (رندر، sub «پورت پیش‌فرض» را می‌گذارد)', () => {
    expect(serverAddressView({}, null)).toEqual({ address: 'http://127.0.0.1:۸۷۸۷', copyText: 'http://127.0.0.1:8787', isDefault: true });
    expect(serverAddressView({ port: 0 }, null).isDefault).toBe(true);
    expect(serverAddressView({ port: -1 }, null).isDefault).toBe(true);
    expect(serverAddressView({ port: 'junk' }, null).isDefault).toBe(true);
    expect(serverAddressView(null, null)).toEqual({ address: 'http://127.0.0.1:۸۷۸۷', copyText: 'http://127.0.0.1:8787', isDefault: true });
    expect(serverAddressView(undefined, undefined).isDefault).toBe(true);
  });

  it('حالت وب — کانال تائوری نیست: origin خودش آدرس است (isDefault=false، همان تابع)', () => {
    expect(serverAddressView(null, 'http://192.168.1.10:8787')).toEqual({ address: 'http://192.168.1.10:8787', copyText: 'http://192.168.1.10:8787', isDefault: false });
    expect(serverAddressView({}, 'https://markaz.example.com')).toEqual({ address: 'https://markaz.example.com', copyText: 'https://markaz.example.com', isDefault: false });
    // پورت معتبر بر origin مقدم است
    expect(serverAddressView({ port: 8901 }, 'https://markaz.example.com').address).toBe('http://127.0.0.1:۸۹۰۱');
    // origin بی‌ارزش ('null' بی‌کانال واقعی/تهی) → پیش‌فرض
    expect(serverAddressView(null, 'null')).toEqual({ address: 'http://127.0.0.1:۸۷۸۷', copyText: 'http://127.0.0.1:8787', isDefault: true });
    expect(serverAddressView(null, '')).toEqual({ address: 'http://127.0.0.1:۸۷۸۷', copyText: 'http://127.0.0.1:8787', isDefault: true });
    expect(serverAddressView(null, 42 as unknown as string)).toEqual({ address: 'http://127.0.0.1:۸۷۸۷', copyText: 'http://127.0.0.1:8787', isDefault: true });
  });
});

describe('engineAppVersionGapView — هشدار ناهم‌نسخه‌ای موتور محلی/برنامهٔ نمایش (خودتوضیحی موتور کهنه)', () => {
  it('موتور قدیمی‌تر از برنامه → gap با متن دو جمله‌ای و هر دو نسخه (مقایسهٔ عددی نقطه‌ای — نه رشته‌ای)', () => {
    const gap = engineAppVersionGapView('1.27.4', '1.27.11');
    expect(gap).not.toBeNull();
    expect(gap).toMatchObject({ engineVersion: '1.27.4', appVersion: '1.27.11' });
    expect(gap.text).toContain('موتور محلی (1.27.4) قدیمی‌تر از برنامهٔ نمایش (1.27.11) است');
    expect(gap.text).toContain('آخرین نصاب را اجرا کنید تا موتور هم به‌روز شود');
    expect(gap.text).toContain('فایل اشغال است'); // جملهٔ دوم — راهِ نصبِ نافرجام
    // مقایسهٔ عددی segment به segment: 4 < 11 — مقایسهٔ رشته‌ای می‌گفت '4' > '1'
    expect(engineAppVersionGapView('1.26.9', '1.27.11')).toMatchObject({ engineVersion: '1.26.9' });
    expect(engineAppVersionGapView('1.27.10', '1.27.11')).toMatchObject({ engineVersion: '1.27.10' });
  });

  it('برابر / موتور تازه‌تر → null بی‌هشدار', () => {
    expect(engineAppVersionGapView('1.27.11', '1.27.11')).toBeNull();
    expect(engineAppVersionGapView('1.27.12', '1.27.11')).toBeNull(); // موتور تازه‌تر از برنامه
    expect(engineAppVersionGapView('2.0.0', '1.27.11')).toBeNull();
    expect(engineAppVersionGapView('1.27.4', '1.27.4')).toBeNull();
    expect(engineAppVersionGapView('1.27', '1.27.0')).toBeNull(); // پُرکردن صفر — برابر
  });

  it('رقم فارسی/عربی نرمال می‌شود («۱.۲۷.۴» → 1.27.4) و gap درست می‌دهد', () => {
    const gap = engineAppVersionGapView('۱.۲۷.۴', '1.27.11');
    expect(gap).toMatchObject({ engineVersion: '1.27.4', appVersion: '1.27.11' });
    expect(gap.text).toContain('موتور محلی (1.27.4)'); // متن هم با نسخهٔ نرمال‌شده
    // ارقام عربی (٠-٩) هم نرمال می‌شوند
    expect(engineAppVersionGapView('١.٢٧.٤', '1.27.11')).toMatchObject({ engineVersion: '1.27.4' });
  });

  it('هر نسخهٔ نامعلوم/خراب → null بی‌کرش؛ engineGapShortView متن کوتاه تا پیش از «؛» می‌دهد', () => {
    expect(engineAppVersionGapView(null, '1.27.11')).toBeNull();
    expect(engineAppVersionGapView('1.27.4', null)).toBeNull();
    expect(engineAppVersionGapView(undefined, undefined)).toBeNull();
    expect(engineAppVersionGapView('', '')).toBeNull();
    expect(engineAppVersionGapView('نامشخص', '1.27.11')).toBeNull();
    expect(engineAppVersionGapView('1.27.4', {} as unknown as string)).toBeNull();
    const gap = engineAppVersionGapView('1.27.4', '1.27.11');
    const short = engineGapShortView(gap);
    expect(short).toBe('موتور محلی (1.27.4) قدیمی‌تر از برنامهٔ نمایش (1.27.11) است — آخرین نصاب را اجرا کنید تا موتور هم به‌روز شود');
    expect(short).not.toContain('؛'); // کوتاه‌شده — جملهٔ دوم نصب حذف است
    expect(engineGapShortView(null)).toBeNull();
    expect(engineGapShortView({ text: '' })).toBeNull();
    expect(engineGapShortView({} as unknown as { text: string })).toBeNull();
  });
});

/* ── DOM مصنوعی کمینه — الگوی آزمون mountCloudSetup در front-cloud-setup.test.ts ── */

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

describe('makeServerCardPaint — پرِ اولیهٔ کارت «سرور محلی» با بدنهٔ جدا از DOM (اشکال گزارش‌شدهٔ کارفرما)', () => {
  const makeCtx = () => ({
    engineRestartAction: async () => {},
    openDataDirAction: async () => {},
    copyDiagAction: async () => {},
    onStaleSubscription: vi.fn()
  });

  it('پرِ اولیه (isInitial=true) حتی با status=null پُر می‌شود: خط وضعیت خاکستری + آدرس محلی + سه دکمه', () => {
    const restore = installFakeDom();
    try {
      const body = new FakeNode('div'); // جدا از DOM — همان لحظهٔ ساخت کارت داخل آرایهٔ el در reload
      const ctx = makeCtx();
      const paint = makeServerCardPaint(body, ctx);
      paint(null, true); // پرِ اولیه — با گارد قدیمی بی‌صدا رد می‌شد و کارت خالی می‌ماند
      expect(body.children.length).toBeGreaterThan(0);
      const t = textOf(body);
      expect(t).toContain('وضعیت هنوز از پوستهٔ برنامه نرسیده'); // ردیف وضعیت خاکستری «وضعیت نامشخص»
      expect(t).toContain('وضعیت نامشخص');
      expect(t).toContain('آدرس محلی'); // ردیف تازهٔ آدرس بعد از ردیف وضعیت — خواست کارفرما
      expect(t).toContain('http://127.0.0.1:۸۷۸۷'); // بی‌پورت → پیش‌فرض
      expect(t).toContain('پورت پیش‌فرض — پس از رسیدن وضعیت پوسته، آدرس دقیق می‌شود');
      for (const label of ['راه‌اندازی دوباره', 'بازکردن پوشهٔ داده', 'کپی اطلاعات عیب‌یابی']) {
        expect(findButton(body, label)).not.toBeNull(); // سه دکمهٔ کارت
      }
      expect(findButton(body, 'کپی آدرس')).not.toBeNull();
      expect(ctx.onStaleSubscription).not.toHaveBeenCalled(); // پرِ اولیه اشتراک کهنه را نمی‌بندد
    } finally { restore(); }
  });

  it('گارد فقط برای emitهای feed است: emit با بدنهٔ جدا → اشتراک کهنه بسته و بدنه دست‌نخورده؛ با بدنهٔ وصل → پُر می‌شود', () => {
    const restore = installFakeDom();
    try {
      const body = new FakeNode('div');
      const ctx = makeCtx();
      const paint = makeServerCardPaint(body, ctx);
      paint(null, true); // پرِ اولیه — جدا از DOM
      const before = body.children.length;
      paint({ state: 'Ready', port: 8901 }, false); // emit feed — بدنه هنوز جدا
      expect(ctx.onStaleSubscription).toHaveBeenCalledTimes(1); // بستن اشتراک کهنه (پیام عین قبل)
      expect(body.children.length).toBe(before); // گارد — بدون رندر
      const root = new FakeNode('div');
      root.isRoot = true;
      root.appendChild(body); // کارت وصل شد
      paint({ state: 'Ready', port: 8901 }, false);
      expect(ctx.onStaleSubscription).toHaveBeenCalledTimes(1); // بستن اضافی نه
      const t = textOf(body);
      expect(t).toContain('سرور محلی روشن است'); // Ready — خط پورت انسانی
      expect(t).toContain('http://127.0.0.1:۸۹۰۱'); // آدرس واقعی از پورت وضعیت — خواست کارفرما
      expect(t).not.toContain('وضعیت هنوز از پوستهٔ برنامه نرسیده');
      expect(t).not.toContain('پورت پیش‌فرض'); // پورت واقعی آمد — توضیح پیش‌فرض حذف
    } finally { restore(); }
  });
});

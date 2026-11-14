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
import { serverStateView, degradedReasonView, serverPortsView, unixJalaliView, unixAgeView, serverDiagnosticsText, copyTextToClipboard, unwrapEngineStatus, installServerStatusFeed, subscribeServerStatus, lastServerStatus, engineInvoke, resetServerStatusFeedForTests } from '../../public/assets/js/views/health-panel.js';

describe('serverStateView — نگاشت حالت FSM موتور به برچسب/رنگ', () => {
  it('هفت حالت شناخته‌شدهٔ قرارداد → برچسب فارسی و کلاس رنگ درست', () => {
    expect(serverStateView('Ready')).toMatchObject({ badge: 'badge--success', dot: 'dot--success', label: 'سرور محلی در حال اجرا' });
    expect(serverStateView('Degraded', 'games_unhealthy')).toMatchObject({ badge: 'badge--warning', dot: 'dot--warning', label: 'سرور محلی ناتمام — ورکر بازی‌ها ناسالم' });
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
    expect(degradedReasonView('games_unhealthy')).toBe('ورکر بازی‌ها ناسالم');
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
    expect(text).toContain('وضعیت FSM: Degraded — سرور محلی ناتمام — ورکر بازی‌ها ناسالم');
    expect(text).toContain('دلیل ناتمامی: ورکر بازی‌ها ناسالم');
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

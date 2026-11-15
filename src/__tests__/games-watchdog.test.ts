// ۱.۲۶.۴ — ENG-4: ماشین وضعیت واچ‌داگ ورکر بازی‌ها (آینهٔ engine_watchdog.rs) + پیام فارسی
import { describe, it, expect } from 'vitest';
// @ts-expect-error — ماژول plain mjs موتور (بدون declaration)
import { nextAction, restartMessage, GAMES_WATCHDOG_POLICY, GAMES_FAIL_THRESHOLD } from '../../scripts/engine/games-watchdog.mjs';

const record = (at_ms: number, delay_ms: number) => ({ at_ms, delay_ms });

describe('games-watchdog — آینهٔ ماشین وضعیت نگهبان', () => {
  it('سیاست = بک‌آف ۲/۵/۱۰ ثانیه، کاپ ۳، پنجرهٔ ۱۰ دقیقه (هم‌مقادیر Rust)', () => {
    expect(GAMES_WATCHDOG_POLICY.backoffs_ms).toEqual([2_000, 5_000, 10_000]);
    expect(GAMES_WATCHDOG_POLICY.max_attempts).toBe(3);
    expect(GAMES_WATCHDOG_POLICY.window_ms).toBe(10 * 60_000);
    expect(GAMES_FAIL_THRESHOLD).toBe(2);
  });

  it('بدون تاریخچه → نخستین تلاش با کوچک‌ترین انتظار', () => {
    expect(nextAction([], 1_000, 1_000)).toEqual({ kind: 'restart', delay_ms: 2_000 });
  });

  it('توالی انتظارها ۲/۵/۱۰ ثانیه', () => {
    expect(nextAction([record(0, 2_000)], 5_000, 5_000)).toEqual({ kind: 'restart', delay_ms: 5_000 });
    expect(nextAction([record(0, 2_000), record(5_000, 5_000)], 9_000, 9_000)).toEqual({
      kind: 'restart',
      delay_ms: 10_000
    });
  });

  it('سه خرابی سریع → تلاش چهارم تسلیم', () => {
    const history = [record(0, 2_000), record(1_000, 5_000), record(2_000, 10_000)];
    expect(nextAction(history, 3_000, 3_000)).toEqual({ kind: 'give_up' });
  });

  it('خرابی ۱۱ دقیقه پس از نخستین → بازنشانی پنجره (نه تسلیم)', () => {
    const history = [record(0, 2_000), record(60_000, 5_000), record(120_000, 10_000)];
    expect(nextAction(history, 660_000, 660_000)).toEqual({ kind: 'reset_window' });
    expect(nextAction([], 660_000, 660_000)).toEqual({ kind: 'restart', delay_ms: 2_000 });
  });

  it('مرز دقیق پنجره هنوز داخل است', () => {
    const history = [record(0, 2_000), record(1_000, 5_000), record(2_000, 10_000)];
    expect(nextAction(history, 600_000, 600_000)).toEqual({ kind: 'give_up' });
  });

  it('پیام انسانی ری‌استارت با رقم فارسی — قرارداد «ورکر بازی‌ها ری‌استارت شد (تلاش K)»', () => {
    expect(restartMessage(1)).toBe('ورکر بازی‌ها ری‌استارت شد (تلاش ۱)');
    expect(restartMessage(3)).toBe('ورکر بازی‌ها ری‌استارت شد (تلاش ۳)');
    expect(restartMessage(12)).toContain('۱۲');
  });
});

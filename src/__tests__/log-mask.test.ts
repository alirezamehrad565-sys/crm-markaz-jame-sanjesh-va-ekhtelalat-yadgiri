/**
 * واحد ۱.۲۷.۷۸ (sdt155) — ماسک مسیرِ لاگ (موج B1، بستن security-005):
 * segmentهای اعتبار-حامل (توکن لینک عمومی بازی و سکرت وب‌هوک) باید با :masked جایگزین شوند
 * و مسیرهای عادی دست‌نخورده بمانند.
 */
import { describe, it, expect } from 'vitest';
import { maskSensitivePath } from '../core/shared/log-mask';

describe('maskSensitivePath — ماسک segmentهای اعتبار-حامل (security-005)', () => {
  it('توکن صفحهٔ عمومی /m/:token ماسک می‌شود', () => {
    expect(maskSensitivePath('/m/abc123')).toBe('/m/:masked');
    expect(maskSensitivePath('/m/abc123?x=1')).toBe('/m/:masked?x=1');
  });

  it('توکن API زنجیرهٔ عمومی /api/m/:token/* ماسک می‌شود و دنبالهٔ مسیر می‌ماند', () => {
    expect(maskSensitivePath('/api/m/tok-9/state')).toBe('/api/m/:masked/state');
    expect(maskSensitivePath('/api/m/tok-9/next-item')).toBe('/api/m/:masked/next-item');
    expect(maskSensitivePath('/api/m/tok-9')).toBe('/api/m/:masked');
  });

  it('سکرت وب‌هوک /webhook/bale/:secret ماسک می‌شود', () => {
    expect(maskSensitivePath('/webhook/bale/sec-42')).toBe('/webhook/bale/:masked');
  });

  it('مسیرهای عادی — حتی با شناسهٔ داخلی — دست‌نخورده می‌مانند', () => {
    expect(maskSensitivePath('/api/students')).toBe('/api/students');
    expect(maskSensitivePath('/api/students/42/timeline')).toBe('/api/students/42/timeline');
    expect(maskSensitivePath('/api/me')).toBe('/api/me');
    expect(maskSensitivePath('/')).toBe('/');
    expect(maskSensitivePath('/m/')).toBe('/m/'); // segment توکن ندارد
    expect(maskSensitivePath('/api/games')).toBe('/api/games');
  });

  it('ورودی نامناسب امن است', () => {
    expect(maskSensitivePath('')).toBe('');
    expect(maskSensitivePath(undefined as never)).toBe('');
    expect(maskSensitivePath(null as never)).toBe('');
  });

  it('ماسک دوالغه نیست — خودِ :masked دوباره ماسک نمی‌شود', () => {
    expect(maskSensitivePath('/m/:masked')).toBe('/m/:masked');
  });
});

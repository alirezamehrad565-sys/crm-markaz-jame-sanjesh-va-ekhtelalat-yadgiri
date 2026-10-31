/**
 * تست زمان‌بند cron سلف‌هاست — پارسر فیلدها، تطبیق UTC و ایمنی تیک
 */
import { describe, expect, it } from 'vitest';
import { ALL_CRONS, cronMatches, parseCronField } from '../crons';

describe('parseCronField', () => {
  it('۱ — *، عدد، بازه، گام و لیست', () => {
    expect(parseCronField('*', 0, 59).size).toBe(60);
    expect(parseCronField('17', 0, 59)).toEqual(new Set([17]));
    expect(parseCronField('10-12', 0, 59)).toEqual(new Set([10, 11, 12]));
    expect(parseCronField('*/15', 0, 59)).toEqual(new Set([0, 15, 30, 45]));
    expect(parseCronField('5-30/10', 0, 59)).toEqual(new Set([5, 15, 25]));
    expect(parseCronField('1,3,5', 0, 59)).toEqual(new Set([1, 3, 5]));
    expect(() => parseCronField('99', 0, 59)).toThrow();
    expect(() => parseCronField('x', 0, 59)).toThrow();
  });
});

describe('cronMatches', () => {
  it('۲ — عبارت‌های واقعی پروداکشن روی UTC تطبیق می‌کنند', () => {
    // 17:00 UTC = 20:30 تهران
    expect(cronMatches('0 17 * * *', new Date('2026-01-15T17:00:00Z'))).toBe(true);
    expect(cronMatches('0 17 * * *', new Date('2026-01-15T17:01:00Z'))).toBe(false);
    expect(cronMatches('30 6 * * *', new Date('2026-01-15T06:30:00Z'))).toBe(true);
    expect(cronMatches('30 14 * * *', new Date('2026-01-15T14:30:00Z'))).toBe(true);
    expect(cronMatches('0 4 * * *', new Date('2026-01-15T04:00:00Z'))).toBe(true);
    // فیلد روز هفته
    expect(cronMatches('0 17 * * 1', new Date('2026-01-19T17:00:00Z'))).toBe(true); // دوشنبه
    expect(cronMatches('0 17 * * 1', new Date('2026-01-18T17:00:00Z'))).toBe(false); // یکشنبه
  });

  it('۳ — فهرست کرون‌ها همان ۴ عبارت wrangler.prod.toml است', () => {
    expect([...ALL_CRONS].sort()).toEqual(['0 17 * * *', '0 4 * * *', '30 14 * * *', '30 6 * * *']);
  });
});

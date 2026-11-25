/**
 * آزمون مرزی موتور OT — ۱.۲۷.۸۳ (sdt160: بستن testing-007)
 * computeSuspicion خالص: برش‌های SNAP-IV والد/معلم (۱۶/۱۱ و ۱۶/۱۴ · HI ۱۳/۱۱)، SCARED
 * (۳۰/۲۵/۲۰)، رنگ SDQ، تجمیع هم‌گرایی والد+معلم و فیلتر تازگی ۱۲ماهه — همه با now تزریقی.
 */
import { describe, it, expect } from 'vitest';
// @ts-ignore — سرویس OT خارج از مسیر آزمون‌های فرانت است اما خالص است
import { computeSuspicion, isFresh, sourceOf, numOf } from '../service';

const NOW = () => new Date('2026-11-25T12:00:00Z');
const freshIso = (iso: string) => isFresh(iso, NOW);

function snapEvent(role: 'p' | 't', ia: number | null, hi: number | null, occurredAt = '2026-08-01T10:00:00Z') {
  return {
    toolKey: `ce-snap-iv-${role}-v1`,
    status: 'completed',
    occurredAt,
    payload: {
      ia_total: { value: ia === null ? '' : String(ia) },
      hi_total: { value: hi === null ? '' : String(hi) }
    }
  };
}

describe('computeSuspicion — برش‌ها و تازگی (testing-007 — ۱.۲۷.۸۳)', () => {
  it('SNAP والد — danger ۱۶ / watch ۱۱ / زیر مرز ۱۰ بی‌سگنال', () => {
    expect(computeSuspicion([snapEvent('p', 16, null)], null, freshIso).signals.some((s) => s.construct === 'adhd' && s.level === 'high' && s.sources.includes('parent'))).toBe(true);
    expect(computeSuspicion([snapEvent('p', 11, null)], null, freshIso).signals.some((s) => s.construct === 'adhd' && s.level === 'watch')).toBe(true);
    expect(computeSuspicion([snapEvent('p', 10, null)], null, freshIso).signals).toHaveLength(0);
  });

  it('SNAP معلم — مرزهای جدا: IA watch از ۱۴ و HI high از ۱۱', () => {
    expect(computeSuspicion([snapEvent('t', 14, null)], null, freshIso).signals.some((s) => s.construct === 'adhd' && s.level === 'watch')).toBe(true);
    expect(computeSuspicion([snapEvent('t', 11, null)], null, freshIso).signals).toHaveLength(0); // زیر مرز معلم
    const hiHit = computeSuspicion([snapEvent('t', null, 11)], null, freshIso);
    expect(hiHit.signals.some((s) => s.construct === 'adhd' && s.level === 'high')).toBe(true);
  });

  it('SCARED والد — ۳۰ باند اختصاصی / ۲۵ پرخطر / ۲۴ هشدار / ۱۹ بی‌سگنال', () => {
    const ev = (score: number) => ({
      toolKey: 'ce-scared-p-v1', status: 'completed', occurredAt: '2026-08-01T10:00:00Z',
      analysis: { score }
    });
    const out = (score: number) => computeSuspicion([ev(score)], null, freshIso).signals.filter((s) => s.construct === 'anxiety');
    expect(out(30)[0]?.level).toBe('high');
    expect(out(25)[0]?.level).toBe('high');
    expect(out(24)[0]?.level).toBe('watch');
    expect(out(19)).toHaveLength(0);
  });

  it('SDQ — رنگ hyper پرخطر → adhd high؛ emo پرخطر → anxiety watch', () => {
    const ev = {
      toolKey: 'ce-sdq-p-v1', status: 'completed', occurredAt: '2026-08-01T10:00:00Z',
      analysis: { subscaleScores: [{ id: 'hyper', score: 8, band: 'بالا', color: 'danger' }, { id: 'emo', score: 7, band: 'بالا', color: 'danger' }] }
    };
    const signals = computeSuspicion([ev], null, freshIso).signals;
    expect(signals.some((s) => s.construct === 'adhd' && s.level === 'high')).toBe(true);
    expect(signals.some((s) => s.construct === 'anxiety' && s.level === 'watch')).toBe(true);
  });

  it('هم‌گرایی والد+معلم — هر دو منبع در evidence یک سگنال', () => {
    const out = computeSuspicion([snapEvent('p', 16, null), snapEvent('t', 16, null)], null, freshIso);
    const adhd = out.signals.find((s) => s.construct === 'adhd');
    expect(adhd?.level).toBe('high');
    expect(adhd?.sources).toEqual(expect.arrayContaining(['parent', 'teacher']));
    expect(JSON.stringify(out.signals)).toContain('هم‌گرا');
  });

  it('تازگی ۱۲ماهه — رویداد کهنه از برش‌ها بیرون است', () => {
    const stale = snapEvent('p', 16, null, '2024-06-01T10:00:00Z');
    expect(computeSuspicion([stale], null, freshIso).signals).toHaveLength(0);
    const fresh = snapEvent('p', 16, null, '2026-08-01T10:00:00Z');
    expect(computeSuspicion([fresh], null, freshIso).signals.length).toBeGreaterThan(0);
    // رویداد ناتمام هم بیرون است
    expect(computeSuspicion([{ ...fresh, status: 'pending' }], null, freshIso).signals).toHaveLength(0);
  });

  it('isFresh — مرز دقیق پنجرهٔ ۱۲×۳۰ روز + قالب بدون T', () => {
    expect(isFresh('2026-05-27T00:00:00Z', () => new Date('2026-11-25T00:00:00Z'))).toBe(true);  // ~۱۱٫۹ ماه
    expect(isFresh('2025-11-24T00:00:00Z', () => new Date('2026-11-25T00:00:00Z'))).toBe(false); // ~۱۲+ ماه
    expect(isFresh('2026-06-01 10:00:00', () => new Date('2026-11-25T00:00:00Z'))).toBe(true);   // بدون T → UTC فرض
    expect(isFresh('نامعتبر', NOW)).toBe(false);
    expect(isFresh(undefined, NOW)).toBe(false);
  });

  it('sourceOf/numOf — نگاشت والد/معلم و پارس نرم ارقام فارسی', () => {
    expect(sourceOf('ce-snap-iv-t-v1')).toBe('teacher');
    expect(sourceOf('ce-snap-iv-p-v1')).toBe('parent');
    expect(sourceOf('teacher-classroom')).toBe('teacher');
    expect(numOf('۱۶')).toBe(16);
    expect(numOf('')).toBeNull();
    expect(numOf('x')).toBeNull();
  });
});

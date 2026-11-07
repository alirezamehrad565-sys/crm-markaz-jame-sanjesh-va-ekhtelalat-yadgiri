// آزمون طلایی کیفیت جلسه (فاز ۷ بازطراحی / ۱.۲۵.۱۷) — سه‌تایی با قواعد شفاف
// ⚠ ممنوعیت نتیجه‌گیری شناختی: هیچ پرچمی دربارهٔ کودک قضاوت نمی‌کند
import { describe, it, expect } from 'vitest';
import { assessQuality, DEFAULT_QUALITY_THRESHOLDS, QUALITY_RULES_VERSION } from '../quality';
import { FORBIDDEN_TEXT_PATTERNS } from '../pure';
import type { QualityInput } from '../quality';

const CLEAN: QualityInput = {
  validity: 'valid',
  total_items: 24,
  done_items: 24,
  idle_gap_max_ms: 3000,
  pause_count: 0,
  pause_total_ms: 0,
  out_of_surface_total: 0,
  premature_total: 0,
  frame_drops_total: 0,
  max_frame_delta_ms: 17,
  evidence_coverage: 1,
  rt_floor_violations: 0
};

describe('ماتریس سناریو ← پرچم (قواعد شفاف §۷)', () => {
  it('جلسهٔ تمیز: explainable با پرچم all_clear', () => {
    const q = assessQuality(CLEAN);
    expect(q.verdict).toBe('explainable');
    expect(q.flags[0].rule).toBe('all_clear');
    expect(q.rules_version).toBe(QUALITY_RULES_VERSION);
    expect(q.thresholds).toEqual(DEFAULT_QUALITY_THRESHOLDS);
  });

  it('جلسهٔ ناقص (تکمیل <۶۰٪) → incomplete_or_invalid با دلیل عددی', () => {
    const q = assessQuality({ ...CLEAN, done_items: 10 });
    expect(q.verdict).toBe('incomplete_or_invalid');
    expect(q.flags.some((f) => f.rule === 'completion' && f.detail.includes('42'))).toBe(true);
  });

  it('validity partial از پایه → incomplete_or_invalid', () => {
    const q = assessQuality({ ...CLEAN, validity: 'partial' });
    expect(q.verdict).toBe('incomplete_or_invalid');
    expect(q.flags.some((f) => f.rule === 'base_validity')).toBe(true);
  });

  it('مکث تجمیعی >۹۰ثانیه → needs_caution', () => {
    const q = assessQuality({ ...CLEAN, pause_count: 3, pause_total_ms: 120_000 });
    expect(q.verdict).toBe('needs_caution');
    expect(q.flags.some((f) => f.rule === 'pause_total' && f.detail.includes('120'))).toBe(true);
  });

  it('شکاف بی‌فعالیتی >۵دقیقه → needs_caution', () => {
    const q = assessQuality({ ...CLEAN, idle_gap_max_ms: 6 * 60_000 });
    expect(q.flags.some((f) => f.rule === 'idle_gap')).toBe(true);
    expect(q.verdict).toBe('needs_caution');
  });

  it('لمس بیرون صحنه >۱۰ → needs_caution با توصیف بی‌قضاوت', () => {
    const q = assessQuality({ ...CLEAN, out_of_surface_total: 14 });
    expect(q.flags.some((f) => f.rule === 'out_of_surface')).toBe(true);
    expect(q.verdict).toBe('needs_caution');
  });

  it('پاسخ زودتر از محرک >۳۰٪ آزمون‌ها → needs_caution', () => {
    const q = assessQuality({ ...CLEAN, premature_total: 10 }); // ۱۰/۲۴ ≈ ۴۲٪
    expect(q.flags.some((f) => f.rule === 'premature_ratio')).toBe(true);
  });

  it('افت فریم زیاد یا فریم بلند → needs_caution کیفیت دستگاه', () => {
    const q1 = assessQuality({ ...CLEAN, frame_drops_total: 30, max_frame_delta_ms: 60 });
    expect(q1.flags.some((f) => f.rule === 'device_frame')).toBe(true);
    const q2 = assessQuality({ ...CLEAN, frame_drops_total: 2, max_frame_delta_ms: 900 });
    expect(q2.flags.some((f) => f.rule === 'device_frame')).toBe(true);
  });

  it('پوشش مُهر نمایش <۵۰٪ → needs_caution', () => {
    const q = assessQuality({ ...CLEAN, evidence_coverage: 0.4 });
    expect(q.flags.some((f) => f.rule === 'evidence_coverage')).toBe(true);
  });

  it('پاسخ زیر کف RT >۳ → needs_caution', () => {
    const q = assessQuality({ ...CLEAN, rt_floor_violations: 5 });
    expect(q.flags.some((f) => f.rule === 'rt_floor')).toBe(true);
  });

  it('شدیدترین پرچم حکم می‌دهد: caution + incomplete → incomplete', () => {
    const q = assessQuality({ ...CLEAN, validity: 'partial', pause_total_ms: 500_000 });
    expect(q.verdict).toBe('incomplete_or_invalid');
    expect(q.flags.length).toBeGreaterThanOrEqual(2);
  });

  it('بدون دادهٔ مکث کلاینت (null): قاعدهٔ مکث ساکن می‌ماند — صفرِ ساختگی ندارد', () => {
    const q = assessQuality({ ...CLEAN, pause_count: null, pause_total_ms: null });
    expect(q.flags.some((f) => f.rule === 'pause_total')).toBe(false);
  });
});

describe('ممنوعیت نتیجه‌گیری شناختی — گیت متنی', () => {
  const scenarios: QualityInput[] = [
    CLEAN,
    { ...CLEAN, validity: 'partial', done_items: 5, premature_total: 20, out_of_surface_total: 30, frame_drops_total: 50, rt_floor_violations: 9, evidence_coverage: 0.1, pause_total_ms: 400_000, idle_gap_max_ms: 700_000 },
    { ...CLEAN, validity: 'invalid' }
  ];

  it('هیچ پرچم/حکمی واژهٔ ممنوع لحن یا برچسب شناختی دارد', () => {
    const COGNITIVE_LABELS = ['ADHD', 'بیش‌فعال', 'اوتیسم', 'اختلال', 'تشخیص', 'ضعف', 'ناتوان', 'کم‌هوش', 'تنبل'];
    for (const s of scenarios) {
      const q = assessQuality(s);
      const text = JSON.stringify(q);
      for (const w of FORBIDDEN_TEXT_PATTERNS) {
        expect(text.includes(w), `واژهٔ ممنوع «${w}» در خروجی کیفیت`).toBe(false);
      }
      for (const w of COGNITIVE_LABELS) {
        expect(text.includes(w), `برچسب شناختی «${w}» در خروجی کیفیت ممنوع است`).toBe(false);
      }
    }
  });

  it('پرچم‌ها رفتار داده را توصیف می‌کنند، نه کودک را — همهٔ جزئیات عدد یا ثبت دارند', () => {
    const q = assessQuality({ ...CLEAN, premature_total: 12 });
    const f = q.flags.find((x) => x.rule === 'premature_ratio')!;
    expect(f.detail).toMatch(/پاسخ زودتر از محرک/);
    expect(f.detail).toMatch(/تفسیر با درمانگر/);
  });
});

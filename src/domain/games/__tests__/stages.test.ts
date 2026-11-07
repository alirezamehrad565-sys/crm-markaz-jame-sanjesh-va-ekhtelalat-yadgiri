// آزمون نظام مرحله‌ها و ستاره‌ها (۱.۲۵.۲۲) — موتور خالص stages.ts
import { describe, it, expect } from 'vitest';
import {
  applyStageOverrides,
  currentStageOf,
  stageById,
  stageByIndex,
  stageOutcomeOf,
  stageProgressOf,
  STAGE_OVERRIDE_KEYS,
  STAGE_RULES_VERSION,
  STAGE_THRESHOLDS,
  STAGE_TOTAL
} from '../stages';

describe('نسخهٔ قواعد و ثابت‌ها', () => {
  it('نسخهٔ قواعد سمانتیک است و پنج مرحله تعریف شده', () => {
    expect(STAGE_RULES_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(STAGE_TOTAL).toBe(5);
  });

  it('کلیدهای بازنویسی فقط پنج پارامتر زمان‌بندی‌اند — نسبت گو/شکل محرک هرگز دست نمی‌خورد', () => {
    expect([...STAGE_OVERRIDE_KEYS].sort()).toEqual([
      'fixation_ms', 'isi_max_ms', 'isi_min_ms',
      'response_window_go_ms', 'response_window_nogo_ms'
    ].sort());
  });

  it('آستانه‌ها صعودی‌اند: گذار < دو ستاره < سه ستاره', () => {
    expect(STAGE_THRESHOLDS.pass.go_pct).toBeLessThan(STAGE_THRESHOLDS.star2.go_pct);
    expect(STAGE_THRESHOLDS.star2.go_pct).toBeLessThan(STAGE_THRESHOLDS.star3.go_pct);
    expect(STAGE_THRESHOLDS.pass.nogo_pct).toBeLessThan(STAGE_THRESHOLDS.star2.nogo_pct);
    expect(STAGE_THRESHOLDS.star2.nogo_pct).toBeLessThan(STAGE_THRESHOLDS.star3.nogo_pct);
  });
});

describe('بازنویسی پارامترها بر پایهٔ مرحله و باند سنی', () => {
  it('مرحلهٔ ۲ = پایهٔ پروتکل — هیچ کلیدی بازنویسی نمی‌شود', () => {
    const s2 = stageByIndex('7-12', 2)!;
    const base = { response_window_go_ms: 1500, isi_min_ms: 800 };
    expect(applyStageOverrides(base, s2)).toEqual(base);
  });

  it('باند ۴–۶ همیشه پنجرهٔ پهن‌تر یا هم‌ارز باند ۷–۱۲ دارد', () => {
    for (let i = 1; i <= STAGE_TOTAL; i++) {
      const young = stageByIndex('4-6', i)!;
      const old = stageByIndex('7-12', i)!;
      expect(young.overrides.response_window_go_ms ?? 2000)
        .toBeGreaterThanOrEqual(old.overrides.response_window_go_ms ?? 1500);
    }
  });

  it('فقط کلیدهای مجاز بازنویسی می‌شوند — go_ratio دست‌نخورده می‌ماند', () => {
    const s5 = stageByIndex('7-12', 5)!;
    const out = applyStageOverrides({ go_ratio: 0.75, block_size: 24, response_window_go_ms: 1500 }, s5);
    expect(out.go_ratio).toBe(0.75);
    expect(out.block_size).toBe(24);
    expect(out.response_window_go_ms).toBe(1000);
  });

  it('شناسهٔ ناشناخته = null — جلسه بی‌مرحله می‌ماند نه خراب', () => {
    expect(stageById('7-12', 's99')).toBeNull();
    expect(stageById('7-12', null)).toBeNull();
    expect(stageById('7-12', '')).toBeNull();
    expect(stageByIndex('7-12', 6)).toBeNull();
    expect(stageByIndex('7-12', 0)).toBeNull();
  });
});

describe('نتیجهٔ مرحله و ستاره‌ها', () => {
  it('زیر آستانهٔ گذار = ۰ ستاره و عدم گذار', () => {
    expect(stageOutcomeOf(69, 60)).toEqual({ passed: false, stars: 0, thresholds: STAGE_THRESHOLDS });
    expect(stageOutcomeOf(70, 59)).toEqual({ passed: false, stars: 0, thresholds: STAGE_THRESHOLDS });
  });

  it('دادهٔ تهی (جلسهٔ بی‌خلاصه) = ۰ ستاره — هرگز ستارهٔ هدیه نیست', () => {
    expect(stageOutcomeOf(null, null).stars).toBe(0);
    expect(stageOutcomeOf(undefined, 90).stars).toBe(0);
    expect(stageOutcomeOf(Number.NaN, 90).stars).toBe(0);
  });

  it('مرزهای ستاره دقیق‌اند — ۷۰/۶۰ یک ستاره، ۸۰/۷۵ دو، ۹۰/۸۵ سه', () => {
    expect(stageOutcomeOf(70, 60).stars).toBe(1);
    expect(stageOutcomeOf(79, 74).stars).toBe(1);
    expect(stageOutcomeOf(80, 75).stars).toBe(2);
    expect(stageOutcomeOf(89, 84).stars).toBe(2);
    expect(stageOutcomeOf(90, 85).stars).toBe(3);
    expect(stageOutcomeOf(100, 100).stars).toBe(3);
  });
});

describe('پیشرفت مسیر از تاریخچه', () => {
  it('تاریخچهٔ خالی: مرحلهٔ ۱ باز، صفر ستاره', () => {
    const p = stageProgressOf([]);
    expect(p.unlocked_index).toBe(1);
    expect(p.stars_total).toBe(0);
    expect(currentStageOf(p, '4-6')!.id).toBe('s1');
  });

  it('جلسهٔ نامعتبر هرگز قفل باز نمی‌کند — فقط valid', () => {
    const p = stageProgressOf([
      { stage_id: 's1', validity: 'partial', correct_go_pct: 95, correct_nogo_pct: 95 },
      { stage_id: 's1', validity: 'invalid', correct_go_pct: 95, correct_nogo_pct: 95 },
      { stage_id: 's1', validity: null, correct_go_pct: 95, correct_nogo_pct: 95 }
    ]);
    expect(p.unlocked_index).toBe(1);
    expect(p.best['s1']).toBeUndefined();
  });

  it('گذار مرحلهٔ ۱ مرحلهٔ ۲ را باز می‌کند؛ نه بیشتر', () => {
    const p = stageProgressOf([
      { stage_id: 's1', validity: 'valid', correct_go_pct: 75, correct_nogo_pct: 65 }
    ]);
    expect(p.unlocked_index).toBe(2);
    expect(p.best['s1']).toEqual({ stars: 1, passed: true });
    expect(p.best['s2']).toBeUndefined();
  });

  it('جلسهٔ خوب ولی زیر آستانهٔ گذار فقط ستاره نمی‌دهد و قفلی باز نمی‌شود', () => {
    const p = stageProgressOf([
      { stage_id: 's1', validity: 'valid', correct_go_pct: 65, correct_nogo_pct: 50 }
    ]);
    expect(p.unlocked_index).toBe(1);
    expect(p.best['s1']).toBeUndefined();
  });

  it('بهترین ستاره حفظ می‌شود — جلسهٔ ضعیف‌تر ستارهٔ قبلی را نمی‌گیرد', () => {
    const p = stageProgressOf([
      { stage_id: 's1', validity: 'valid', correct_go_pct: 95, correct_nogo_pct: 90 },
      { stage_id: 's1', validity: 'valid', correct_go_pct: 72, correct_nogo_pct: 62 }
    ]);
    expect(p.best['s1']!.stars).toBe(3);
    expect(p.stars_total).toBe(3);
    expect(p.unlocked_index).toBe(2);
  });

  it('زنجیرهٔ کامل گذار تا مرحلهٔ ۵ — و بیشتر از ۵ نمی‌رود', () => {
    const rows = [1, 2, 3, 4, 5].map((i) => ({
      stage_id: 's' + i, validity: 'valid', correct_go_pct: 90, correct_nogo_pct: 88
    }));
    const p = stageProgressOf(rows);
    expect(p.unlocked_index).toBe(5); // آخرین مرحله — جلوتر مسیری نیست
    expect(currentStageOf(p, '7-12')!.id).toBe('s5');
  });

  it('گذار نامرتب (گذار s3 بدون s2) مرحله‌های میانی را نمی‌پرد — فقط +۱', () => {
    const p = stageProgressOf([
      { stage_id: 's3', validity: 'valid', correct_go_pct: 90, correct_nogo_pct: 88 }
    ]);
    expect(p.unlocked_index).toBe(4);
  });

  it('شناسهٔ مرحلهٔ ناشناخته در تاریخچه نادیده گرفته می‌شود', () => {
    const p = stageProgressOf([
      { stage_id: 'sX', validity: 'valid', correct_go_pct: 90, correct_nogo_pct: 88 }
    ]);
    expect(p.unlocked_index).toBe(1);
    expect(p.stars_total).toBe(0);
  });

  it('مجموع ستاره‌ها جمع بهترین‌های همهٔ مرحله‌هاست', () => {
    const p = stageProgressOf([
      { stage_id: 's1', validity: 'valid', correct_go_pct: 95, correct_nogo_pct: 92 },
      { stage_id: 's2', validity: 'valid', correct_go_pct: 82, correct_nogo_pct: 76 }
    ]);
    expect(p.stars_total).toBe(3 + 2);
  });
});

describe('باند سنی و مرحلهٔ فعال', () => {
  it('مرحلهٔ فعال برای باند ۴–۶ از همان مسیر پنج‌تایی می‌آید', () => {
    const p = stageProgressOf([
      { stage_id: 's1', validity: 'valid', correct_go_pct: 90, correct_nogo_pct: 88 },
      { stage_id: 's2', validity: 'valid', correct_go_pct: 90, correct_nogo_pct: 88 }
    ]);
    const st = currentStageOf(p, '4-6')!;
    expect(st.id).toBe('s3');
    expect(st.title_fa).toBe('تندتر');
    expect(st.difficulty).toBe(3);
  });
});

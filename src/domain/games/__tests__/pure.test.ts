// آزمون موتور نمره‌دهی و گیت‌های انتشار بازی (M1 / ۱.۲۵.۰۷) — نمونه‌های طلایی §۸
import { describe, it, expect } from 'vitest';
import {
  accuracyOf,
  answerDisplayOf,
  commissionCountOf,
  computeMetricValue,
  containsHomophonePair,
  decideValidity,
  DEFAULT_RT_FLOOR_MS,
  lintSentence,
  lintTexts,
  masteryAchieved,
  meanNumlineErrorOf,
  medianRtOf,
  omissionCountOf,
  runPublishGates,
  scoreAttempt,
  stimLabelOf,
  stripAnswerKeys,
  toItemView
} from '../pure';
import type { MissionConfig, MissionItem, PackageBody } from '../types';

function missionOf(items: MissionItem[], over: Partial<MissionConfig> = {}): MissionConfig {
  return {
    id: 'm1', game: 'numberline', goal: 'numline', metric: 'pct_error_numline',
    mastery: { threshold: 20, sessions: 2 },
    items,
    ...over
  };
}

describe('نمره‌دهی آیتم — سمت سرور', () => {
  it('choice: پاسخ درست و نادرست', () => {
    const m = missionOf([{ id: 'i1', phase: 'train', type: 'choice', options: [{ label: '۲' }, { label: '۷' }], correct: 1 }]);
    expect(scoreAttempt(m.items[0], m, { option: 1 }, 300).correct).toBe(true);
    expect(scoreAttempt(m.items[0], m, { option: 0 }, 300).correct).toBe(false);
  });

  it('numline: تطابق دقیق + خطای نرمال‌شده', () => {
    const m = missionOf([{ id: 'n1', phase: 'probe', type: 'numline', correct: 70, range: [0, 100] }]);
    const ok = scoreAttempt(m.items[0], m, { chosen: 70 }, 900);
    expect(ok.correct).toBe(true);
    expect(ok.numlineErrorPct).toBe(0);
    const near = scoreAttempt(m.items[0], m, { chosen: 60 }, 900);
    expect(near.correct).toBe(false);
    expect(near.numlineErrorPct).toBe(10);
  });

  it('touch_report: go و nogo و پرچم‌های commission/omission', () => {
    const go: MissionItem = { id: 'g', phase: 'probe', type: 'touch_report', correct_touch: true };
    const nogo: MissionItem = { id: 'n', phase: 'probe', type: 'touch_report', correct_touch: false };
    const m = missionOf([go, nogo]);
    expect(scoreAttempt(go, m, { touched: true }, 400).correct).toBe(true);
    const bad = scoreAttempt(nogo, m, { touched: true }, 400);
    expect(bad.correct).toBe(false);
    expect(bad.commission).toBe(true);
    const miss = scoreAttempt(go, m, { touched: false }, null);
    expect(miss.correct).toBe(false);
    expect(miss.omission).toBe(true);
    expect(scoreAttempt(nogo, m, { touched: false }, null).correct).toBe(true);
  });

  it('کف زمان واکنش: ۱۴۹ms در گو/نوگو نامعتبر و ۱۹۹ms در انتخاب نامعتبر است (§۸)', () => {
    const go: MissionItem = { id: 'g', phase: 'probe', type: 'touch_report', correct_touch: true };
    const ch: MissionItem = { id: 'c', phase: 'probe', type: 'choice', correct: 0, options: [{ label: 'الف' }] };
    const m = missionOf([go, ch]);
    expect(scoreAttempt(go, m, { touched: true }, 149).rtValid).toBe(false);
    expect(scoreAttempt(go, m, { touched: true }, 150).rtValid).toBe(true);
    expect(scoreAttempt(ch, m, { option: 0 }, 199).rtValid).toBe(false);
    expect(scoreAttempt(ch, m, { option: 0 }, 200).rtValid).toBe(true);
    expect(DEFAULT_RT_FLOOR_MS.touch_report).toBe(150);
    expect(DEFAULT_RT_FLOOR_MS.choice).toBe(200);
  });

  it('کف تعیین‌شده در مأموریت بر پیش‌فرض می‌چربد و زمان منفی صفر می‌شود', () => {
    const ch: MissionItem = { id: 'c', phase: 'probe', type: 'choice', correct: 0, options: [{ label: 'الف' }] };
    const m = missionOf([ch], { rt_floor_ms: 500 });
    expect(scoreAttempt(ch, m, { option: 0 }, 499).rtValid).toBe(false);
    expect(scoreAttempt(ch, m, { option: 0 }, 500).rtValid).toBe(true);
    const clamped = scoreAttempt(ch, m, { option: 0 }, -50);
    expect(clamped.rtMs).toBeNull(); // زمان منفی = بدون اندازه‌گیری، نه صفرِ زیر کف
    expect(clamped.rtValid).toBe(true);
  });
});

describe('فرمول‌های سنجه با نمونهٔ طلایی', () => {
  it('accuracy: ۳ از ۴ برابر ۷۵ و تهی روی ورودی خالی', () => {
    const mk = (correct: boolean) => ({ itemId: 'x', phase: 'probe' as const, correct, rtMs: null, rtValid: true });
    expect(accuracyOf([mk(true), mk(true), mk(true), mk(false)])).toBe(75);
    expect(accuracyOf([])).toBeNull();
  });

  it('خطای خط عددی: میانگین خطاها', () => {
    const mk = (err: number) => ({ itemId: 'x', phase: 'probe' as const, correct: false, rtMs: null, rtValid: true, numlineErrorPct: err });
    expect(meanNumlineErrorOf([mk(10), mk(20)])).toBe(15);
    expect(meanNumlineErrorOf([])).toBeNull();
  });

  it('میانهٔ زمان واکنش: فقط پاسخ‌های درست و معتبر', () => {
    const mk = (correct: boolean, rtMs: number | null, rtValid = true) =>
      ({ itemId: 'x', phase: 'probe' as const, correct, rtMs, rtValid });
    // نادرست و نامعتبر حذف می‌شوند → [۳۰۰،۵۰۰،۴۰۰] → ۴۰۰
    const pts = [mk(true, 300), mk(true, 500), mk(false, 100), mk(true, 400), mk(true, null), mk(true, 90, false)];
    expect(medianRtOf(pts)).toBe(400);
    expect(medianRtOf([mk(true, 300), mk(true, 500)])).toBe(400); // زوج = میانگین
    expect(medianRtOf([])).toBeNull();
  });

  it('شمارش commission و omission', () => {
    const mk = (commission: boolean, omission: boolean) => ({ itemId: 'x', phase: 'probe' as const, correct: false, rtMs: null, rtValid: true, commission, omission });
    expect(commissionCountOf([mk(true, false), mk(true, false), mk(false, false)])).toBe(2);
    expect(omissionCountOf([mk(false, true), mk(false, false)])).toBe(1);
  });

  it('computeMetricValue: مسیریابی فرمول', () => {
    const mk = (correct: boolean) => ({ itemId: 'x', phase: 'probe' as const, correct, rtMs: null, rtValid: true });
    expect(computeMetricValue('accuracy', [mk(true), mk(false)])).toBe(50);
    expect(computeMetricValue('none', [mk(true)])).toBeNull();
    expect(computeMetricValue('median_rt', [])).toBeNull();
  });

  it('answerDisplay: برچسب گزینهٔ درست برای آموزش، هیچ برای لمسی', () => {
    const ch: MissionItem = { id: 'c', phase: 'train', type: 'choice', correct: 1, options: [{ label: '۲' }, { label: '۷' }] };
    expect(answerDisplayOf(ch)).toBe('۷');
    const nl: MissionItem = { id: 'n', phase: 'train', type: 'numline', correct: 70, range: [0, 100] };
    expect(answerDisplayOf(nl)).toBe('70');
    const tg: MissionItem = { id: 't', phase: 'train', type: 'touch_report', correct_touch: true };
    expect(answerDisplayOf(tg)).toBeNull();
  });
});

describe('اعتبار جلسه و تسلط', () => {
  it('شکاف بیکاری بیش از ۵ دقیقه → partial', () => {
    const t0 = 1_000_000;
    expect(decideValidity([t0, t0 + 4 * 60 * 1000], 5, 5)).toBe('valid');
    expect(decideValidity([t0, t0 + 5 * 60 * 1000 + 1], 5, 5)).toBe('partial');
  });

  it('تکمیل کمتر از ۶۰٪ → partial', () => {
    expect(decideValidity([1, 2], 2, 5)).toBe('partial');
    expect(decideValidity([1, 2], 3, 5)).toBe('valid');
  });

  it('تسلط: ۸۰٪ در دو جلسهٔ پیاپی (بالاتر بهتر)', () => {
    expect(masteryAchieved([70, 85, 82], 80, 2)).toBe(true);
    expect(masteryAchieved([70, 85, 75], 80, 2)).toBe(false);
    expect(masteryAchieved([90], 80, 2)).toBe(false);
  });

  it('تسلط سنجهٔ «پایین بهتر» (خطای خط عددی)', () => {
    expect(masteryAchieved([18, 12], 20, 2, false)).toBe(true);
    expect(masteryAchieved([12, 25], 20, 2, false)).toBe(false);
  });
});

// ─── بدنهٔ معتبر بسته برای گیت‌ها ───
function validBody(over: Partial<PackageBody> = {}): PackageBody {
  return {
    package_id: 'numsense',
    goals: ['numline'],
    mastery: { threshold: 20, sessions: 2 },
    tone_rules: ['no_timer', 'no_rank', 'no_streak', 'no_fail_message'],
    missions: [{
      id: 'numline_m1', game: 'numberline', goal: 'numline', metric: 'pct_error_numline',
      mastery: { threshold: 20, sessions: 2 },
      items: [
        { id: 't1', phase: 'train', type: 'numline', correct: 70, range: [0, 100] },
        { id: 'p1', phase: 'probe', type: 'numline', correct: 50, range: [0, 100] }
      ]
    }],
    parent_copy: { before: 'امروز با خط عددی کار می‌کنیم.', after: 'فردا ۱۵ دقیقه کافی است.' },
    ...over
  };
}

const VALID_DOSE = { days_per_week: 3, minutes: 15, max_missions_per_day: 2, min_weeks: 6 };
const GATE_CTX = { metricIds: new Set(['pct_error_numline', 'accuracy_gonogo', 'median_rt_gonogo', 'commission_gonogo', 'omission_gonogo']), goalIds: new Set(['numline', 'inhibition']) };

describe('گیت‌های انتشار (§۴)', () => {
  it('بدنهٔ سالم همهٔ گیت‌ها را می‌گذراند', () => {
    expect(runPublishGates(validBody(), VALID_DOSE, 'B', GATE_CTX)).toEqual([]);
  });

  it('هدف ناشناخته و سنجهٔ تعریف‌نشده رد می‌شود', () => {
    const errs = runPublishGates(validBody({ goals: ['ناموجود'] }), VALID_DOSE, 'B', GATE_CTX);
    expect(errs.some((e) => e.rule === 'goal')).toBe(true);
    const errs2 = runPublishGates(validBody({ missions: [validBody().missions[0]] }) && validBody({
      missions: [{ ...validBody().missions[0], metric: 'ناشناخته' }]
    }), VALID_DOSE, 'B', GATE_CTX);
    expect(errs2.some((e) => e.rule === 'metric')).toBe(true);
  });

  it('آستانهٔ تسلط تهی = انتشار رد می‌شود (قاعدهٔ حیاتی)', () => {
    const body = validBody();
    body.missions[0].mastery = { threshold: null, sessions: 2 };
    const errs = runPublishGates(body, VALID_DOSE, 'B', GATE_CTX);
    expect(errs.some((e) => e.rule === 'threshold')).toBe(true);
  });

  it('بدون آیتم پروب، سنجه‌ای ساخته نمی‌شود → رد', () => {
    const body = validBody();
    body.missions[0].items = [{ id: 't1', phase: 'train', type: 'numline', correct: 70, range: [0, 100] }];
    const errs = runPublishGates(body, VALID_DOSE, 'B', GATE_CTX);
    expect(errs.some((e) => e.rule === 'probe')).toBe(true);
  });

  it('دوز ناقص و برچسب شواهد نامعتبر رد می‌شوند', () => {
    const errs = runPublishGates(validBody(), { days_per_week: 0, minutes: 15, max_missions_per_day: 2, min_weeks: 0 }, 'X', GATE_CTX);
    expect(errs.some((e) => e.rule === 'dose')).toBe(true);
    expect(errs.some((e) => e.rule === 'evidence')).toBe(true);
  });

  it('قاعدهٔ لحن ناقص رد می‌شود', () => {
    const body = validBody({ tone_rules: ['no_timer', 'no_rank'] });
    const errs = runPublishGates(body, VALID_DOSE, 'B', GATE_CTX);
    expect(errs.filter((e) => e.rule === 'tone').length).toBe(2);
  });

  it('واژهٔ ممنوع در متن والد = رد (لینت لحن §۱۰)', () => {
    const body = validBody({ parent_copy: { after: 'با تمرین منظم درمان می‌شود، تضمین است.' } });
    const errs = runPublishGates(body, VALID_DOSE, 'B', GATE_CTX);
    expect(errs.filter((e) => e.rule === 'tone_lint').length).toBeGreaterThanOrEqual(2);
  });

  it('جفت هم‌آوا در بستهٔ واجی هرگز تمایز شنیداری نمی‌شود (قاعدهٔ حیاتی فارسی)', () => {
    const body = validBody({
      pa_phonemic: true,
      missions: [{
        id: 'pa_m1', game: 'sound_pick', goal: 'numline', metric: 'pct_error_numline',
        mastery: { threshold: 80, sessions: 2 },
        items: [
          { id: 'p1', phase: 'probe', type: 'choice', prompt: 'کدام صدا؟ س یا ص', options: [{ label: 'س' }, { label: 'ص' }], correct: 0 },
          { id: 'p2', phase: 'train', type: 'choice', prompt: 'کدام واژه با «ش» آغاز می‌شود؟', options: [{ label: 'سیب' }, { label: 'شیر' }], correct: 1 }
        ]
      }]
    });
    const errs = runPublishGates(body, VALID_DOSE, 'B', GATE_CTX);
    const homophone = errs.filter((e) => e.rule === 'homophone');
    expect(homophone.length).toBe(1); // فقط p1 رد می‌شود؛ س/ش هم‌آوا نیست
    expect(homophone[0].message).toContain('p1');
  });

  it('بستهٔ غیرواجی گیت هم‌آوا ندارد', () => {
    const body = validBody({
      missions: [{
        id: 'sp_m1', game: 'spelling', goal: 'numline', metric: 'pct_error_numline',
        mastery: { threshold: 80, sessions: 2 },
        items: [{ id: 'p1', phase: 'probe', type: 'choice', prompt: 'املای درست: س یا ص', options: [{ label: 'سبز' }, { label: 'صبر' }], correct: 0 }]
      }]
    });
    expect(runPublishGates(body, VALID_DOSE, 'B', GATE_CTX).filter((e) => e.rule === 'homophone')).toEqual([]);
  });
});

describe('لینت لحن و پاک‌سازی کلید پاسخ', () => {
  it('لینت متن تخت و تودرتو', () => {
    expect(lintSentence('کودک شکست نخورده است')).toEqual(['شکست']);
    const nested = lintTexts({ a: { b: ['متن سالم', 'رتبهٔ اول شد'] } });
    expect(nested.length).toBe(1);
    expect(nested[0]).toContain('رتبهٔ');
  });

  it('stripAnswerKeys هر کلید حاوی correct را (حتی تودرتو) حذف می‌کند', () => {
    const input = { id: 'i1', correct: 3, stim: { shape: 'star', correct_touch: true }, options: [{ label: 'الف' }] };
    const out = stripAnswerKeys(input) as Record<string, unknown>;
    expect(out).toEqual({ id: 'i1', stim: { shape: 'star' }, options: [{ label: 'الف' }] });
  });

  it('toItemView: نمای کلاینت هرگز کلید پاسخ و آستانه ندارد', () => {
    const item: MissionItem = { id: 'p1', phase: 'probe', type: 'numline', correct: 50, range: [0, 100], prompt: '۵ کجاست؟' };
    const view = toItemView(item) as unknown as Record<string, unknown>;
    expect(JSON.stringify(view)).not.toContain('correct');
    expect(view.range).toEqual([0, 100]);
    expect(view.prompt).toBe('۵ کجاست؟');
  });

  it('جفت‌های هم‌آوا: تشخیص مستقیم', () => {
    expect(containsHomophonePair(Array.from('توطئه'))).toBe(true);  // ت/ط
    expect(containsHomophonePair(Array.from('سیب'))).toBe(false);   // س/ش هم‌آوا نیست
    expect(containsHomophonePair(Array.from('ظفر'))).toBe(false);   // تک‌عضوی
  });
});

describe('برچسب فارسی محرک برای راهنمای بازی کودک (M2)', () => {
  it('نمونه‌های طلایی: شکل + رنگ فارسی می‌شود و مقادیر فارسی عیناً عبور می‌کنند', () => {
    expect(stimLabelOf({ shape: 'star', color: 'yellow' })).toBe('ستاره زرد');
    expect(stimLabelOf({ shape: 'square', color: 'آبی' })).toBe('مربع آبی');
    expect(stimLabelOf({ color: 'سبز' })).toBe('سبز');
    expect(stimLabelOf({ shape: 'fish', color: 'قرمز' })).toBe('ماهی قرمز');
  });

  it('کلید ناشناختهٔ لاتین نمایش داده نمی‌شود و محرک تهی «هدف» می‌دهد', () => {
    // 'ufo' از ۱.۲۵.۲۳ شکل شناخته‌شدهٔ درون‌مایهٔ مرحله‌هاست — ناشناختهٔ واقعی: 'unicorn'
    expect(stimLabelOf({ shape: 'unicorn', color: 'crimson' })).toBe('هدف');
    expect(stimLabelOf(null)).toBe('هدف');
    expect(stimLabelOf(undefined)).toBe('هدف');
    expect(stimLabelOf({})).toBe('هدف');
  });
});

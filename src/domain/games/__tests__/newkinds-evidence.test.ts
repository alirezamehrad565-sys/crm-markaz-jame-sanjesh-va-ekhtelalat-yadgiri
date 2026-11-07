// golden tests ۱.۲۵.۳۲ — سه بازی تازه (stroop/flanker/trail) + موتور شواهد + اهرم موج اسکن
// همهٔ فرمول‌ها خالص‌اند — این آزمون‌ها قرارداد §۸ را قفل می‌کنند: کلید پاسخ هرگز به کلاینت نمی‌رود؛
// قاعدهٔ دامنهٔ صفر (مخرج صفر = null) و بی‌تفاوتی به ترتیب/تکرار مثل scan عیناً برقرار است.
import { describe, expect, it } from 'vitest';
import {
  answerDisplayOf,
  computeMetricValue,
  interferenceMsOf,
  scoreAttempt,
  trailPrefixPctOf,
  type ScoredAttempt
} from '../pure';
import {
  flankerItemInStage,
  gameKindOf,
  scanStageWaveMs,
  stageOutcomeFor,
  stroopItemInStage,
  trailItemInStage,
  type GameKind
} from '../stages';
import { buildEvidenceDossier, EVIDENCE_RULES_VERSION } from '../evidence';
import { summarizeAttempts } from '../scoring';
import type { MissionConfig, MissionItem } from '../types';

const MISSION: MissionConfig = { id: 'm1', game: 'stroop', goal: 'stroop_attention', metric: 'accuracy_stroop', items: [] };

// ─── استروپ — رنگ جوهر را لمس می‌کند؛ بی‌پاسخ پنجره = اُمیشن ───

const stroopItem: MissionItem = {
  id: 'st1', phase: 'probe', type: 'stroop',
  prompt: 'رنگ جوهر را لمس کن.',
  // بانک واقعی گزینه‌های رشته‌ای رنگ لاتین می‌سازد — تایپ عام فقط شکل label‌دار را می‌شناسد
  options: ['blue', 'red'] as unknown as MissionItem['options'],
  correct: 0, // «قرمز» با جوهر آبی → جواب آبی (اندیس ۰)
  stim: { word: 'قرمز', ink: 'blue', window_ms: 3600, congruent: false, band: 'c' }
};

describe('نمره‌دهی استروپ (۱.۲۵.۳۲)', () => {
  it('لمس رنگ جوهر درست', () => {
    const s = scoreAttempt(stroopItem, MISSION, { option: 0 }, 1450);
    expect(s.correct).toBe(true);
    expect(s.omission).toBe(false);
    expect(s.timedOut).toBe(false);
    expect(s.congruent).toBe(false);
    expect(s.rtValid).toBe(true);
  });

  it('لمس معنی واژه (تله) = نادرست؛ بی‌پاسخ پنجره = اُمیشن و timedOut', () => {
    const wrong = scoreAttempt(stroopItem, MISSION, { option: 1 }, 1800);
    expect(wrong.correct).toBe(false);
    const miss = scoreAttempt(stroopItem, MISSION, { option: null, timed_out: true }, null);
    expect(miss.correct).toBe(false);
    expect(miss.omission).toBe(true);
    expect(miss.timedOut).toBe(true);
    expect(miss.rtMs).toBeNull();
  });

  it('کنگرنت از stim.congruent پرچم می‌خورد — مبنای سنجهٔ تداخل', () => {
    const cong: MissionItem = { ...stroopItem, id: 'st2', stim: { ...stroopItem.stim, congruent: true, word: 'آبی', ink: 'blue' } };
    const s = scoreAttempt(cong, MISSION, { option: 0 }, 900);
    expect(s.congruent).toBe(true);
    expect(s.correct).toBe(true);
  });

  it('کف ۲۰۰ms — زیر کف = rt نامعتبر', () => {
    const s = scoreAttempt(stroopItem, MISSION, { option: 0 }, 120);
    expect(s.rtValid).toBe(false);
  });
});

// ─── فلانکر — فقط جهت گرگ وسط؛ cond = مبنای هم‌خوانی ───

const flankerItem: MissionItem = {
  id: 'fl1', phase: 'probe', type: 'flanker',
  prompt: 'فقط نگاه گرگ وسط را دنبال کن.',
  correct: 1, // وسط رو به راست
  stim: { arrows: ['L', 'R', 'L', 'R', 'L'], window_ms: 2800, cond: 'incongruent' }
};

describe('نمره‌دهی فلانکر (۱.۲۵.۳۲)', () => {
  it('پاسخ به جهت مرکز درست؛ فلانکر مخالف مرکز = ناهم‌خوان', () => {
    const s = scoreAttempt(flankerItem, MISSION, { option: 1 }, 1100);
    expect(s.correct).toBe(true);
    expect(s.congruent).toBe(false);
  });
  it('فریب فلانکرها = نادرست؛ بی‌پاسخ = اُمیشن', () => {
    expect(scoreAttempt(flankerItem, MISSION, { option: 0 }, 1500).correct).toBe(false);
    const miss = scoreAttempt(flankerItem, MISSION, { option: null, timed_out: true }, null);
    expect(miss.correct).toBe(false);
    expect(miss.omission).toBe(true);
  });
});

// ─── رد پای دزد — ترتیب دقیق گره‌ها؛ پیش‌ماند صحیح ───

const trailItem: MissionItem = {
  id: 'tr1', phase: 'probe', type: 'trail',
  prompt: 'رد را به ترتیب شماره کامل کن.',
  correct: [2, 0, 3, 1],
  stim: {
    nodes: [{ x: 20, y: 30, n: 3 }, { x: 70, y: 60, n: 4 }, { x: 40, y: 70, n: 1 }, { x: 80, y: 20, n: 2 }],
    window_ms: 18000, alt: false, seq: [1, 2, 3, 4]
  }
};

describe('نمره‌دهی رد پای دزد (۱.۲۵.۳۲)', () => {
  it('ترتیب کامل درست', () => {
    const s = scoreAttempt(trailItem, MISSION, { order: [2, 0, 3, 1], node_rts_ms: [700, 1400, 2100, 2800] }, 700);
    expect(s.correct).toBe(true);
    expect(s.trailNodes).toBe(4);
    expect(s.trailNodesTotal).toBe(4);
  });

  it('قطع رد در گرهٔ سوم — نادرست؛ پیش‌ماند صحیح = ۲', () => {
    const s = scoreAttempt(trailItem, MISSION, { order: [2, 0, 1] }, 700);
    expect(s.correct).toBe(false);
    expect(s.trailNodes).toBe(2);
    expect(s.trailNodesTotal).toBe(4);
  });

  it('تکرار گره — نخستین ورود حفظ می‌شود؛ ترتیب کج = پیش‌ماند صفر', () => {
    const dup = scoreAttempt(trailItem, MISSION, { order: [2, 2, 0, 3, 1] }, 700);
    expect(dup.correct).toBe(true); // تکرار بی‌اثر — مثل scan
    const broken = scoreAttempt(trailItem, MISSION, { order: [0, 2, 3, 1] }, 700);
    expect(broken.correct).toBe(false);
    expect(broken.trailNodes).toBe(0);
  });

  it('پاسخ تهی/کج — ناسالم امن', () => {
    expect(scoreAttempt(trailItem, MISSION, {}, 700).correct).toBe(false);
    expect(scoreAttempt(trailItem, MISSION, { order: 'x' }, 700).trailNodesTotal).toBe(4);
  });
});

// ─── فرمول‌های تداخل و پیش‌ماند ───

describe('سنجه‌های تداخل استروپ/فلانکر و پیش‌ماند رد (۱.۲۵.۳۲)', () => {
  const mk = (id: string, congruent: boolean, rt: number | null, correct: boolean): ScoredAttempt => ({
    itemId: id, phase: 'probe', correct, rtMs: rt, rtValid: rt === null || rt >= 200, congruent
  });

  it('interference_ms = میانهٔ ناهم‌خوان − میانهٔ هم‌خوان؛ هر سمت ≥۲ RT', () => {
    const scored: ScoredAttempt[] = [
      mk('a1', true, 800, true), mk('a2', true, 1000, true),
      mk('b1', false, 1300, true), mk('b2', false, 1500, true)
    ];
    expect(interferenceMsOf(scored)).toBe(500);
  });

  it('یک سمت کم‌داده = null (قاعدهٔ صادقانه)', () => {
    expect(interferenceMsOf([mk('a1', true, 800, true), mk('b1', false, 1300, true)])).toBeNull();
    expect(interferenceMsOf([])).toBeNull();
  });

  it('فرمول‌های congruent_acc/incongruent_acc در رجیستری محاسبه می‌شوند', () => {
    const scored: ScoredAttempt[] = [
      mk('a1', true, 800, true), mk('a2', true, 900, false), mk('a3', true, 1000, true),
      mk('b1', false, 1300, true), mk('b2', false, 1500, true)
    ];
    expect(computeMetricValue('congruent_acc', scored)).toBe(66.67);
    expect(computeMetricValue('incongruent_acc', scored)).toBe(100);
    // میانهٔ هم‌خوان (۸۰۰،۱۰۰۰) = ۹۰۰ · میانهٔ ناهم‌خوان (۱۳۰۰،۱۵۰۰) = ۱۴۰۰ → ۵۰۰
    expect(computeMetricValue('interference_ms', scored)).toBe(500);
  });

  it('trail_prefix = مجموع پیش‌ماند / مجموع طول رد', () => {
    const rows: ScoredAttempt[] = [
      { itemId: 't1', phase: 'probe', correct: true, rtMs: 700, rtValid: true, trailNodes: 4, trailNodesTotal: 4 },
      { itemId: 't2', phase: 'probe', correct: false, rtMs: 600, rtValid: true, trailNodes: 2, trailNodesTotal: 6 }
    ];
    expect(trailPrefixPctOf(rows)).toBe(60); // (۴+۲)/(۴+۶)
    expect(computeMetricValue('trail_prefix', rows)).toBe(60);
    expect(computeMetricValue('trail_prefix', [])).toBeNull();
  });
});

// ─── برچسب نمایشی پاسخ درست — فقط تمرین ───

describe('answerDisplayOf سه بازی تازه', () => {
  it('استروپ: برچسب فارسی رنگ جوهر', () => {
    expect(answerDisplayOf(stroopItem)).toBe('آبی');
  });
  it('فلانکر: چپ/راست', () => {
    expect(answerDisplayOf(flankerItem)).toBe('راست');
    expect(answerDisplayOf({ ...flankerItem, correct: 0 })).toBe('چپ');
  });
  it('رد: CSV اندیس‌های ترتیب درست — کلید برای نشان حقیقت تمرین', () => {
    expect(answerDisplayOf(trailItem)).toBe('2,0,3,1');
  });
});

// ─── نوع‌بازی و مراحل ───

describe('نوع‌بازی و ملاک گذار سه بازی تازه', () => {
  it('gameKindOf سه نوع تازه را می‌شناسد', () => {
    expect(gameKindOf('stroop')).toBe('stroop');
    expect(gameKindOf('flanker')).toBe('flanker');
    expect(gameKindOf('trail')).toBe('trail');
    expect(gameKindOf('maghrur')).toBe('gonogo');
  });

  it('ملاک گذار سه نوع تازه بر دقت — ۶۵/۷۸/۸۸', () => {
    const pct = (a: number | null) => ({ correct_go: null, correct_nogo: null, accuracy: a });
    expect(stageOutcomeFor('stroop', { pct: pct(64) }).passed).toBe(false);
    expect(stageOutcomeFor('flanker', { pct: pct(65) }).passed).toBe(true);
    expect(stageOutcomeFor('trail', { pct: pct(78) }).stars).toBe(2);
    expect(stageOutcomeFor('trail', { pct: pct(88) }).stars).toBe(3);
  });

  it('فیلتر بانک استروپ بر گروه stim.band', () => {
    const a = { stim: { band: 'a' } };
    const d = { stim: { band: 'd' } };
    expect(stroopItemInStage(a, 's1')).toBe(true);
    expect(stroopItemInStage(d, 's1')).toBe(false);
    expect(stroopItemInStage(d, 's4')).toBe(true);
    expect(stroopItemInStage(d, 's5')).toBe(true); // مرور بزرگ — همهٔ بانک
    expect(stroopItemInStage({ stim: {} }, 's1')).toBe(true); // بی‌گروه = همیشه حاضر
  });

  it('فیلتر فلانکر بر گروه stim.band + بازگشت ساختاری برای بانک بی‌گروه', () => {
    const calm = { stim: { arrows: ['L', 'L', 'L'] } };        // بدون قلابی — بی‌گروه
    const one = { stim: { arrows: ['R', 'L', 'R', 'R', 'R'] } }; // یک قلابی — بی‌گروه
    const three = { stim: { arrows: ['L', 'L', 'R', 'L', 'R'] } }; // سه قلابی (مرکز R) — بی‌گروه
    const four = { stim: { arrows: ['L', 'L', 'R', 'L', 'L'] } }; // مرکز R — هر چهار مخالف — بی‌گروه
    expect(flankerItemInStage(calm, 's1')).toBe(true);
    expect(flankerItemInStage(one, 's1')).toBe(false);
    expect(flankerItemInStage(one, 's2')).toBe(true);
    expect(flankerItemInStage(three, 's3')).toBe(true);
    expect(flankerItemInStage(three, 's2')).toBe(false);
    expect(flankerItemInStage(four, 's4')).toBe(true);
    expect(flankerItemInStage(four, 's3')).toBe(false);
    // بانک گروه‌دار — پروب هرگز به مرحله‌های اولیه درز نمی‌کند (رفع نشت ۱.۲۵.۳۲)
    const bandA = { stim: { arrows: ['L', 'R', 'L'], band: 'a' } };
    const bandP = { stim: { arrows: ['L', 'L', 'L'], band: 'p' } }; // کنگرنت ولی پروب
    expect(flankerItemInStage(bandA, 's1')).toBe(true);
    expect(flankerItemInStage(bandP, 's1')).toBe(false);
    expect(flankerItemInStage(bandP, 's5')).toBe(true);
  });

  it('فیلتر رد بر گروه stim.band + بازگشت ساختاری برای بانک بی‌گروه', () => {
    expect(trailItemInStage({ stim: { nodes: [1, 2, 3, 4] } }, 's1')).toBe(true);
    expect(trailItemInStage({ stim: { nodes: [1, 2, 3, 4, 5] } }, 's1')).toBe(false);
    expect(trailItemInStage({ stim: { nodes: [1, 2, 3, 4, 5, 6, 7] } }, 's4')).toBe(true);
    expect(trailItemInStage({ stim: { nodes: [] } }, 's1')).toBe(false);
    // بانک گروه‌دار — پروب ۶ ردپایی به مرحلهٔ ۳ درز نمی‌کند (رفع نشت ۱.۲۵.۳۲)
    const bandP6 = { stim: { nodes: [1, 2, 3, 4, 5, 6], band: 'p' } };
    expect(trailItemInStage(bandP6, 's3')).toBe(false);
    expect(trailItemInStage(bandP6, 's5')).toBe(true);
    const bandC6 = { stim: { nodes: [1, 2, 3, 4, 5, 6], band: 'c' } };
    expect(trailItemInStage(bandC6, 's3')).toBe(true);
  });
});

// ─── اهرم تندشدن موج اسکن ───

describe('scanStageWaveMs (۱.۲۵.۳۲)', () => {
  it('کمینهٔ زمان authored و سقف مرحله — کودک هرگز سریع‌تر از بانک نمی‌شود', () => {
    expect(scanStageWaveMs(24000, 's1')).toBe(22000);
    expect(scanStageWaveMs(16000, 's1')).toBe(16000); // authored کوتاه‌تر — عیناً
    expect(scanStageWaveMs(20000, 's5')).toBe(13000);
  });
  it('بی‌مرحله/مرحلهٔ ناشناخته = null — عیناً آیتم authored', () => {
    expect(scanStageWaveMs(20000, null)).toBeNull();
    expect(scanStageWaveMs(20000, 's9')).toBeNull();
  });
});

// ─── موتور جمع‌کردن شواهد ───

describe('buildEvidenceDossier (۱.۲۵.۳۲)', () => {
  const baseSummary = summarizeAttempts([
    { itemId: 'p1', phase: 'probe', correct: true, rtMs: 900, rtValid: true, isGo: true, commission: false, omission: false }
  ], [], 24);

  it('نسخهٔ قواعد ثبت می‌شود و توصیهٔ گذار بی‌رقارت است', () => {
    const d = buildEvidenceDossier('scan', baseSummary, true);
    expect(d.rules_version).toBe(EVIDENCE_RULES_VERSION);
    expect(d.recommendation.action).toBe('promote');
    expect(d.flags.fatigue).toBe(false);
    expect(d.signals.length).toBeGreaterThanOrEqual(5);
  });

  it('ناگذرانده = review؛ بی‌سرزنش', () => {
    const d = buildEvidenceDossier('stroop', baseSummary, false);
    expect(d.recommendation.action).toBe('review');
    expect(d.recommendation.reason_fa).not.toContain('شکست');
  });

  it('افت دقت انتهای جلسه = پرچم خستگی و توصیهٔ تکرار آرام', () => {
    const rows: ScoredAttempt[] = [];
    // بلوک ۱ همه درست؛ بلوک ۲ و ۳ همه نادرست — افت ≥۲۰pp
    for (let i = 0; i < 24; i++) rows.push({ itemId: 'x' + i, phase: 'probe', correct: true, rtMs: 900, rtValid: true, isGo: true });
    for (let i = 24; i < 48; i++) rows.push({ itemId: 'x' + i, phase: 'probe', correct: false, rtMs: 950, rtValid: true, isGo: true });
    for (let i = 48; i < 72; i++) rows.push({ itemId: 'x' + i, phase: 'probe', correct: false, rtMs: 980, rtValid: true, isGo: true });
    const s = summarizeAttempts(rows, [], 24);
    const d = buildEvidenceDossier('gonogo', s, true);
    expect(d.flags.fatigue).toBe(true);
    expect(d.recommendation.action).toBe('hold');
    const driftSignal = d.signals.find((x) => x.id === 'accuracy_drift_pp');
    expect(driftSignal?.value).toBeLessThanOrEqual(-20);
  });

  it('بی‌پاسخی پنجره فقط برای انتخاب زمان‌دار تعریف می‌شود', () => {
    const d1 = buildEvidenceDossier('gonogo', baseSummary, false);
    expect(d1.signals.find((x) => x.id === 'window_miss_pct')?.value).toBeNull();
    const rows: ScoredAttempt[] = [
      { itemId: 's1', phase: 'probe', correct: true, rtMs: 900, rtValid: true, congruent: true, omission: false },
      { itemId: 's2', phase: 'probe', correct: false, rtMs: null, rtValid: true, congruent: false, omission: true, timedOut: true }
    ];
    const s2 = summarizeAttempts(rows, [], 24);
    const d2 = buildEvidenceDossier('stroop', s2, false);
    const miss = d2.signals.find((x) => x.id === 'window_miss_pct');
    expect(miss?.value).toBe(50);
    expect(d2.flags.disengagement).toBe(true);
  });
});

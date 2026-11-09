// golden tests ۱.۲۵.۳۲ — سه بازی تازه (stroop/flanker/ردِ حذف‌شده) + موتور شواهد + اهرم موج اسکن
// + کولهٔ مرواریدها (corsi — ۱۴۰۵/۰۸/۱۹؛ رد پای دزد پس از نقد سه‌گانه حذف شد)
// همهٔ فرمول‌ها خالص‌اند — این آزمون‌ها قرارداد §۸ را قفل می‌کنند: کلید پاسخ هرگز به کلاینت نمی‌رود؛
// قاعدهٔ دامنهٔ صفر (مخرج صفر = null) و بی‌تفاوتی به ترتیب/تکرار مثل scan عیناً برقرار است.
import { describe, expect, it } from 'vitest';
import {
  answerDisplayOf,
  computeMetricValue,
  corsiSeqAccPctOf,
  corsiSpanMaxOf,
  interferenceMsOf,
  scoreAttempt,
  type ScoredAttempt
} from '../pure';
import {
  corsiItemInStage,
  flankerItemInStage,
  gameKindOf,
  scanStageWaveMs,
  stageOutcomeFor,
  stroopItemInStage,
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

// ─── کولهٔ مرواریدها — بازتولید دنبالهٔ مرواریدها؛ کلید = خود دنبالهٔ نمایش‌داده‌شده ───

const corsiItem: MissionItem = {
  id: 'co1', phase: 'probe', type: 'corsi',
  prompt: 'مرواریدها پشت‌سرهم برق می‌زنند؛ همان ترتیب را لمس کن.',
  stim: {
    shells: [
      { x: 20, y: 26 }, { x: 50, y: 18 }, { x: 80, y: 30 },
      { x: 32, y: 48 }, { x: 66, y: 46 }, { x: 18, y: 68 },
      { x: 48, y: 70 }, { x: 82, y: 72 }, { x: 50, y: 86 }
    ],
    sequence: [2, 0, 3, 1], lit_ms: 650, gap_ms: 280, window_ms: 16000, band: 'c'
  }
};

describe('نمره‌دهی کولهٔ مرواریدها (۱۴۰۵/۰۸/۱۹)', () => {
  it('بازتولید کامل درست — کلید از stim.sequence می‌آید (آیتم correct ندارد)', () => {
    const s = scoreAttempt(corsiItem, MISSION, { order: [2, 0, 3, 1], shell_rts_ms: [700, 1400, 2100, 2800] }, 700);
    expect(s.correct).toBe(true);
    expect(s.corsiPrefix).toBe(4);
    expect(s.corsiLen).toBe(4);
  });

  it('قطع دنباله در مروارید سوم — نادرست؛ پیش‌ماند صحیح = ۲', () => {
    const s = scoreAttempt(corsiItem, MISSION, { order: [2, 0, 1] }, 700);
    expect(s.correct).toBe(false);
    expect(s.corsiPrefix).toBe(2);
    expect(s.corsiLen).toBe(4);
  });

  it('تکرار صدف — نخستین ورود حفظ می‌شود؛ ترتیب کج = پیش‌ماند صفر', () => {
    const dup = scoreAttempt(corsiItem, MISSION, { order: [2, 2, 0, 3, 1] }, 700);
    expect(dup.correct).toBe(true); // تکرار بی‌اثر — مثل scan
    const broken = scoreAttempt(corsiItem, MISSION, { order: [0, 2, 3, 1] }, 700);
    expect(broken.correct).toBe(false);
    expect(broken.corsiPrefix).toBe(0);
  });

  it('پاسخ تهی/کج — ناسالم امن؛ بی‌پاسخ پنجره = دنبالهٔ ناقص، نه اُمیشن سخت', () => {
    expect(scoreAttempt(corsiItem, MISSION, {}, 700).correct).toBe(false);
    expect(scoreAttempt(corsiItem, MISSION, { order: 'x' }, 700).corsiLen).toBe(4);
  });

  it('کف ۱۵۰ms سرور — زیر کف = RT نامعتبر اما نمرهٔ درستی برجا می‌ماند', () => {
    const s = scoreAttempt(corsiItem, MISSION, { order: [2, 0, 3, 1] }, 90);
    expect(s.correct).toBe(true);
    expect(s.rtValid).toBe(false);
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

  it('corsi_seq = درصد بازتولید کامل · corsi_span = بلندترین دنبالهٔ کامل درست', () => {
    const rows: ScoredAttempt[] = [
      { itemId: 'c1', phase: 'probe', correct: true, rtMs: 700, rtValid: true, corsiPrefix: 3, corsiLen: 3 },
      { itemId: 'c2', phase: 'probe', correct: false, rtMs: 600, rtValid: true, corsiPrefix: 2, corsiLen: 4 },
      { itemId: 'c3', phase: 'probe', correct: true, rtMs: 800, rtValid: true, corsiPrefix: 4, corsiLen: 4 }
    ];
    expect(corsiSeqAccPctOf(rows)).toBe(66.67);
    expect(corsiSpanMaxOf(rows)).toBe(4);
    expect(computeMetricValue('corsi_seq', rows)).toBe(66.67);
    expect(computeMetricValue('corsi_span', rows)).toBe(4);
    // قاعدهٔ دامنهٔ صفر — بدون دنبالهٔ سالم = null
    expect(computeMetricValue('corsi_seq', [])).toBeNull();
    expect(computeMetricValue('corsi_span', [
      { itemId: 'c4', phase: 'probe', correct: false, rtMs: 600, rtValid: true, corsiPrefix: 1, corsiLen: 3 }
    ])).toBeNull();
  });
});

// ─── برچسب نمایشی پاسخ درست — فقط تمرین ───

describe('answerDisplayOf بازی‌های تازه', () => {
  it('استروپ: برچسب فارسی رنگ جوهر', () => {
    expect(answerDisplayOf(stroopItem)).toBe('آبی');
  });
  it('فلانکر: چپ/راست', () => {
    expect(answerDisplayOf(flankerItem)).toBe('راست');
    expect(answerDisplayOf({ ...flankerItem, correct: 0 })).toBe('چپ');
  });
  it('کولهٔ مرواریدها: null — بازپخش دنبالهٔ تمرین در خود ماژول است؛ پاسخ مخفی ندارد', () => {
    expect(answerDisplayOf(corsiItem)).toBeNull();
  });
});

// ─── نوع‌بازی و مراحل ───

describe('نوع‌بازی و ملاک گذار بازی‌های تازه', () => {
  it('gameKindOf انواع تازه را می‌شناسد؛ trail حذف‌شده = گونوگو (سازگاری بسته‌های قدیمی)', () => {
    expect(gameKindOf('stroop')).toBe('stroop');
    expect(gameKindOf('flanker')).toBe('flanker');
    expect(gameKindOf('nback')).toBe('nback');
    expect(gameKindOf('corsi')).toBe('corsi');
    expect(gameKindOf('trail')).toBe('gonogo'); // بازنشسته — ناشناخته به گونوگو می‌نشیند
    expect(gameKindOf('maghrur')).toBe('gonogo');
  });

  it('ملاک گذار بر دقت — ۶۵/۷۸/۸۸؛ کولهٔ مرواریدها آستانهٔ مستقل خودش را دارد', () => {
    const pct = (a: number | null) => ({ correct_go: null, correct_nogo: null, accuracy: a });
    expect(stageOutcomeFor('stroop', { pct: pct(64) }).passed).toBe(false);
    expect(stageOutcomeFor('flanker', { pct: pct(65) }).passed).toBe(true);
    expect(stageOutcomeFor('corsi', { pct: pct(78) }).stars).toBe(2);
    expect(stageOutcomeFor('corsi', { pct: pct(88) }).stars).toBe(3);
    expect(stageOutcomeFor('corsi', { pct: pct(64) }).passed).toBe(false);
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

  it('فیلتر کولهٔ مرواریدها بر گروه stim.band + بازگشت ساختاری برای بانک بی‌گروه', () => {
    // بانک بی‌گروه — قاعدهٔ ساختاری: طول دنباله
    expect(corsiItemInStage({ stim: { sequence: [1, 2] } }, 's1')).toBe(true);
    expect(corsiItemInStage({ stim: { sequence: [1, 2, 3] } }, 's1')).toBe(false);
    expect(corsiItemInStage({ stim: { sequence: [1, 2, 3, 4, 5] } }, 's4')).toBe(true);
    expect(corsiItemInStage({ stim: { sequence: [] } }, 's1')).toBe(false);
    // بانک گروه‌دار — پروب هرگز به مرحله‌های اولیه درز نمی‌کند
    const bandA2 = { stim: { sequence: [1, 2], band: 'a' } };
    const bandP4 = { stim: { sequence: [1, 2, 3, 4], band: 'p' } };
    expect(corsiItemInStage(bandA2, 's1')).toBe(true);
    expect(corsiItemInStage(bandP4, 's2')).toBe(false);
    expect(corsiItemInStage(bandP4, 's5')).toBe(true);
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

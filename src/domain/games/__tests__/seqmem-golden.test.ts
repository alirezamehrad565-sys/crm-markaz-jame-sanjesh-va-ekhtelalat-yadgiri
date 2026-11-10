// golden tests G8/۱.۲۵.۴۹ — دو بازی حافظهٔ دنباله‌ای (صدف‌های جادویی corsi / حباب‌های عدد span)
// قرارداد §۸ قفل می‌شود: کلید پاسخ (correct) هرگز به کلاینت نمی‌رود؛ مقایسهٔ دنباله کامل
// سمت سرور است؛ span_max قاعدهٔ دامنهٔ صفر دارد (بدون دنبالهٔ درست = null)؛ اهرم مرحله‌ها
// پیش‌ماندهٔ بانک authored است (پروب در همهٔ مراحل — خط‌کش ثابت سنجش) و محرک را بازنویسی نمی‌کند.
import { describe, expect, it } from 'vitest';
import {
  answerDisplayOf,
  computeMetricValue,
  scoreAttempt,
  spanMaxOf,
  toItemView,
  type ScoredAttempt
} from '../pure';
import {
  corsiItemInStage,
  gameKindOf,
  spanItemInStage,
  stageOutcomeFor,
  STAGE_RULES_VERSION
} from '../stages';
import { ENGINE_METRICS, ENGINE_ONLY_FORMULAS } from '../registry-extra';
import type { MissionConfig, MissionItem } from '../types';

const MISSION_C: MissionConfig = { id: 'mc', game: 'corsi', goal: 'corsi_seq_memory', metric: 'accuracy_corsi', items: [] };
const MISSION_S: MissionConfig = { id: 'ms', game: 'span', goal: 'span_number_memory', metric: 'accuracy_span', items: [] };

const corsiItem: MissionItem = {
  id: 'cs1', phase: 'probe', type: 'corsi',
  prompt: 'صدف‌ها یکی‌یکی روشن می‌شوند؛ همان ترتیب را لمس کن.',
  correct: [1, 4, 7],
  stim: { cols: 3, rows: 3, seq: [1, 4, 7], flash_ms: 620, gap_ms: 240, window_ms: 16000, band: 'p' }
};

const spanItem: MissionItem = {
  id: 'sp1', phase: 'probe', type: 'span',
  prompt: 'عددها یکی‌یکی می‌آیند؛ همان‌ها را به ترتیب وارد کن.',
  correct: [4, 7, 2],
  stim: { seq: [4, 7, 2], pace_ms: 760, gap_ms: 340, window_ms: 18000, band: 'p' }
};

describe('نمره‌دهی صدف‌های جادویی (corsi — G8)', () => {
  it('لمس همان ترتیب = درست؛ طول دنباله برای span_max ثبت می‌شود', () => {
    const s = scoreAttempt(corsiItem, MISSION_C, { order: [1, 4, 7] }, 1450);
    expect(s.correct).toBe(true);
    expect(s.spanLen).toBe(3);
    expect(s.omission).toBe(false);
    expect(s.rtValid).toBe(true); // کف ۱۵۰ms کرسی
  });

  it('ترتیب جابه‌جا = نادرست؛ دنبالهٔ ناقص = نادرست؛ بی‌لمس = اُمیشن', () => {
    const swapped = scoreAttempt(corsiItem, MISSION_C, { order: [1, 7, 4] }, 1600);
    expect(swapped.correct).toBe(false);
    expect(swapped.spanLen).toBeUndefined();
    const short = scoreAttempt(corsiItem, MISSION_C, { order: [1, 4] }, 900);
    expect(short.correct).toBe(false);
    const empty = scoreAttempt(corsiItem, MISSION_C, { order: [], timed_out: true }, null);
    expect(empty.correct).toBe(false);
    expect(empty.omission).toBe(true);
  });

  it('تکرار صدف بی‌اثر است — نخستین ورود هر اندیس می‌ماند (مثل رد)', () => {
    const dup = scoreAttempt(corsiItem, MISSION_C, { order: [1, 4, 4, 7] }, 2000);
    expect(dup.correct).toBe(true);
  });

  it('کف RT سروری — لمس زیر ۱۵۰ms از سنجه‌های زمانی حذف می‌شود', () => {
    const fast = scoreAttempt(corsiItem, MISSION_C, { order: [1, 4, 7] }, 120);
    expect(fast.correct).toBe(true);
    expect(fast.rtValid).toBe(false);
  });

  it('کلید پاسخ هرگز به نمای کلاینت نمی‌رود — اما دنبالهٔ نمایش (محرک) می‌رود', () => {
    const viewC = toItemView(corsiItem);
    expect(viewC.stim).toHaveProperty('seq'); // محرک عمومی — کودک باید ببیند
    expect((viewC as unknown as Record<string, unknown>).correct).toBeUndefined();
    const viewS = toItemView(spanItem);
    expect(viewS.stim).toHaveProperty('seq');
    expect((viewS as unknown as Record<string, unknown>).correct).toBeUndefined();
    expect(answerDisplayOf(corsiItem)).toBe('1,4,7'); // فقط در بازخورد تمرین از سرور می‌آید
  });
});

describe('نمره‌دهی حباب‌های عدد (span — G8)', () => {
  it('ورود همان ترتیب = درست؛ spanLen ثبت می‌شود', () => {
    const s = scoreAttempt(spanItem, MISSION_S, { digits: [4, 7, 2] }, null);
    expect(s.correct).toBe(true);
    expect(s.spanLen).toBe(3);
  });

  it('ترتیب اشتباه/ناقص/تهی = نادرست با اُمیشن صریح برای تهی', () => {
    expect(scoreAttempt(spanItem, MISSION_S, { digits: [4, 2, 7] }, null).correct).toBe(false);
    expect(scoreAttempt(spanItem, MISSION_S, { digits: [4, 7] }, null).correct).toBe(false);
    const empty = scoreAttempt(spanItem, MISSION_S, { digits: [], timed_out: true }, null);
    expect(empty.correct).toBe(false);
    expect(empty.omission).toBe(true);
  });

  it('کف RT بازهٔ عدد صفر است — ورود صفحه‌کلیدی زمان واکنش نیست', () => {
    const s = scoreAttempt(spanItem, MISSION_S, { digits: [4, 7, 2] }, 4200);
    expect(s.rtValid).toBe(true);
  });

  it('answer_display — دنبالهٔ درست به شکل CSV (فقط بازخورد تمرین)', () => {
    expect(answerDisplayOf(spanItem)).toBe('4,7,2');
  });
});

describe('فرمول span_max — قاعدهٔ دامنهٔ صفر (G8)', () => {
  it('بلندترین دنبالهٔ کاملِ درست؛ پاسخ نادرست هرگز به فرمول نمی‌رسد', () => {
    const rows: ScoredAttempt[] = [
      { itemId: 'a', phase: 'probe', correct: true, rtMs: 900, rtValid: true, spanLen: 2 },
      { itemId: 'b', phase: 'probe', correct: false, rtMs: 900, rtValid: true, spanLen: 5 }, // نادرست — نمی‌شمارد
      { itemId: 'c', phase: 'probe', correct: true, rtMs: 900, rtValid: true, spanLen: 4 },
      { itemId: 'd', phase: 'probe', correct: true, rtMs: 900, rtValid: true } // بی‌spanLen (نوع دیگر) — بی‌اثر
    ];
    expect(spanMaxOf(rows)).toBe(4);
    expect(computeMetricValue('span_max', rows)).toBe(4);
  });

  it('جلسهٔ بدون هیچ دنبالهٔ درست = null — نه صفرِ ساختگی', () => {
    expect(spanMaxOf([])).toBeNull();
    expect(spanMaxOf([{ itemId: 'a', phase: 'probe', correct: false, rtMs: null, rtValid: true, spanLen: 3 }])).toBeNull();
    expect(computeMetricValue('span_max', [])).toBeNull();
  });

  it('span_max فرمولِ فقط-موتور است — upsert دستی ممنوع', () => {
    expect(ENGINE_ONLY_FORMULAS).toContain('span_max');
  });

  it('سنجه‌های موتور دو بازی تازه با flatten رجیستری می‌آیند', () => {
    const ids = ENGINE_METRICS.map((m) => m.id);
    expect(ids).toContain('corsi_span_max');
    expect(ids).toContain('digitspan_span_max');
    const spanMetric = ENGINE_METRICS.find((m) => m.id === 'corsi_span_max');
    expect(spanMetric?.formula).toBe('span_max');
    expect(spanMetric?.unit).toBe('score');
    expect(spanMetric?.higher_is_better).toBe(true);
  });
});

describe('اهرم مرحله‌ها — پیش‌ماندهٔ بانک authored با معافیت پروب (G8)', () => {
  const trainSeq = (len: number) => ({ phase: 'train', stim: { seq: Array.from({ length: len }, (_, i) => i * 2) } });
  const probeSeq = (len: number) => ({ phase: 'probe', stim: { seq: Array.from({ length: len }, (_, i) => i * 2) } });

  it('صدف‌های جادویی — سقف طول دنباله فقط برای تمرین؛ پروب در همهٔ مراحل', () => {
    expect(corsiItemInStage(trainSeq(2), 's1')).toBe(true);
    expect(corsiItemInStage(trainSeq(3), 's1')).toBe(false);
    expect(corsiItemInStage(trainSeq(3), 's2')).toBe(true);
    expect(corsiItemInStage(trainSeq(4), 's2')).toBe(false);
    expect(corsiItemInStage(trainSeq(5), 's4')).toBe(true);
    expect(corsiItemInStage(trainSeq(5), 's3')).toBe(false);
    expect(corsiItemInStage(trainSeq(5), 's5')).toBe(true); // مرور بزرگ — همهٔ بانک
    expect(corsiItemInStage(trainSeq(5), null)).toBe(true); // بی‌مرحله = همه
    expect(corsiItemInStage({ stim: {} }, 's2')).toBe(false); // دنبالهٔ ناسالم = صفر → جا نمی‌شود
    // پروب = خط‌کش ثابت سنجش — در هر مرحله حاضر (رفع P0 ممیزی فازها، هم‌قرارداد اسکن)
    expect(corsiItemInStage(probeSeq(5), 's1')).toBe(true);
    expect(corsiItemInStage(probeSeq(5), 's2')).toBe(true);
  });

  it('حباب‌های عدد — سقف شمار عددها فقط برای تمرین؛ پروب در همهٔ مراحل', () => {
    expect(spanItemInStage(trainSeq(3), 's1')).toBe(true);
    expect(spanItemInStage(trainSeq(4), 's1')).toBe(false);
    expect(spanItemInStage(trainSeq(5), 's3')).toBe(true);
    expect(spanItemInStage(trainSeq(6), 's3')).toBe(false);
    expect(spanItemInStage(trainSeq(6), 's5')).toBe(true);
    expect(spanItemInStage(trainSeq(6), null)).toBe(true);
    expect(spanItemInStage({ stim: {} }, 's2')).toBe(false);
    expect(spanItemInStage(probeSeq(6), 's1')).toBe(true);
    expect(spanItemInStage(probeSeq(6), 's4')).toBe(true);
  });
});

describe('ملاک گذار و هویت نوع‌ها (G8)', () => {
  it('گذار بر دقت — ۶۵/۷۸/۸۸ برای هر دو بازی حافظهٔ دنباله‌ای', () => {
    const pass = stageOutcomeFor('corsi', { pct: { correct_go: null, correct_nogo: null, accuracy: 66 } });
    expect(pass.passed).toBe(true);
    expect(pass.stars).toBe(1);
    const three = stageOutcomeFor('span', { pct: { correct_go: null, correct_nogo: null, accuracy: 89 } });
    expect(three.passed).toBe(true);
    expect(three.stars).toBe(3);
    const fail = stageOutcomeFor('corsi', { pct: { correct_go: null, correct_nogo: null, accuracy: 50 } });
    expect(fail.passed).toBe(false);
    expect(fail.stars).toBe(0);
  });

  it('شناسه‌های نوع شناخته می‌شوند و پیش‌فرض امن دست‌نخورده است', () => {
    expect(gameKindOf('corsi')).toBe('corsi');
    expect(gameKindOf('span')).toBe('span');
    expect(gameKindOf('unknown-kind')).toBe('gonogo');
  });

  it('نسخهٔ قواعد مرحله‌ها ۱.۵.۰ شد — افزودن دو قاعدهٔ تازه بامپ گرفت', () => {
    expect(STAGE_RULES_VERSION).toBe('1.7.0');
  });
});

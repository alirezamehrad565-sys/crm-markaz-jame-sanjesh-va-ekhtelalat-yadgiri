// golden test ۱.۲۵.۵۲ — «هم‌صداها» (simon — تقلید متوالی) با الگوی seqmem-golden:
// قرارداد §۸ قفل می‌شود: کلید پاسخ (correct) هرگز به کلاینت نمی‌رود؛ مقایسهٔ دنبالهٔ
// کامل سمت سرور است — و برخلاف کرسی، تکرارِ غیرمجاور در دنباله مجاز و معیار است
// (امضای سیمون). span_max قاعدهٔ دامنهٔ صفر دارد؛ اهرم مرحله‌ها پیش‌ماندهٔ بانک
// authored است (پروب در همهٔ مراحل — خط‌کش ثابت سنجش) و محرک را بازنویسی نمی‌کند.
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
  SIMON_STAGE_MAX_SPAN,
  simonItemInStage,
  stageOutcomeFor,
  STAGE_RULES_VERSION
} from '../stages';
import { ENGINE_METRICS, ENGINE_ONLY_FORMULAS } from '../registry-extra';
import { GAME_KIND_IDS, GAME_KINDS, gameKindOf } from '../registry';
import type { MissionConfig, MissionItem } from '../types';

const MISSION: MissionConfig = { id: 'mz', game: 'simon', goal: 'simon_seq_memory', metric: 'accuracy_simon', items: [] };

/* آیتم با تکرارِ غیرمجاور — امضای سیمون؛ در کرسی چنین کلیدی ناممکن است */
const simonItem: MissionItem = {
  id: 'sm1', phase: 'probe', type: 'simon',
  prompt: 'دوستان یکی‌یکی نور می‌گیرند؛ همان ترتیب را لمس کن.',
  correct: [0, 2, 3, 0],
  stim: { cols: 2, rows: 2, seq: [0, 2, 3, 0], flash_ms: 440, gap_ms: 170, window_ms: 20000, band: 'p' }
};

describe('نمره‌دهی هم‌صداها (simon — ۱.۲۵.۵۲)', () => {
  it('همان ترتیب = درست؛ طول دنباله برای span_max ثبت می‌شود', () => {
    const s = scoreAttempt(simonItem, MISSION, { order: [0, 2, 3, 0] }, 1450);
    expect(s.correct).toBe(true);
    expect(s.spanLen).toBe(4);
    expect(s.omission).toBe(false);
    expect(s.rtValid).toBe(true); // کف ۱۵۰ms هم‌صداها
  });

  it('تکرارِ غیرمجاور عیناً معیار است — حذف تکرار نمره را نمی‌شکند (امضای سیمون، تفاوت با کرسی)', () => {
    // کلید [0,2,3,0] — پاسخ بدون تکرار [0,2,3] یا با تکرار جای دیگر هرگز درست نیست
    expect(scoreAttempt(simonItem, MISSION, { order: [0, 2, 3] }, 900).correct).toBe(false);
    expect(scoreAttempt(simonItem, MISSION, { order: [0, 2, 3, 2] }, 900).correct).toBe(false);
    // ترتیب جابه‌جا = نادرست
    expect(scoreAttempt(simonItem, MISSION, { order: [0, 3, 2, 0] }, 900).correct).toBe(false);
  });

  it('بی‌لمس = اُمیشن صریح؛ دنبالهٔ ناقص = نادرست', () => {
    const empty = scoreAttempt(simonItem, MISSION, { order: [], timed_out: true }, null);
    expect(empty.correct).toBe(false);
    expect(empty.omission).toBe(true);
    const short = scoreAttempt(simonItem, MISSION, { order: [0, 2] }, 900);
    expect(short.correct).toBe(false);
    expect(short.omission).toBe(false);
  });

  it('کف RT سروری ۱۵۰ms — لمس زیر کف از سنجه‌های زمانی حذف می‌شود', () => {
    const fast = scoreAttempt(simonItem, MISSION, { order: [0, 2, 3, 0] }, 120);
    expect(fast.correct).toBe(true);
    expect(fast.rtValid).toBe(false);
  });

  it('answer_display — دنبالهٔ درست به شکل CSV (فقط بازخورد تمرین)', () => {
    expect(answerDisplayOf(simonItem)).toBe('0,2,3,0');
  });

  it('کلید پاسخ هرگز به نمای کلاینت نمی‌رود — دنبالهٔ نمایش (محرک) می‌رود', () => {
    const view = toItemView(simonItem);
    expect(view.stim).toHaveProperty('seq');
    expect((view as unknown as Record<string, unknown>).correct).toBeUndefined();
  });
});

describe('رجیستری هم‌صداها — نهمین نوع‌بازی (۱.۲۵.۵۲)', () => {
  it('نوع simon در GAME_KIND_IDS هست و هویت دارد — ناشناخته‌ها همچنان به گونوگو برمی‌گردند', () => {
    expect(gameKindOf('simon')).toBe('simon');
    expect(gameKindOf('simon')).toBe('simon'); // (از مسیر stages هم همین قرارداد)
    expect(gameKindOf('trail')).toBe('gonogo'); // حذف‌شدهٔ نقد ۱.۲۵.۵۱ دست‌نخورده
    expect(GAME_KIND_IDS[GAME_KIND_IDS.length - 1]).toBe('simon'); // تولد در انتها — ترتیب قطعی
  });

  it('نردبان سقف طول — ۲/۳/۴/۵/null (مرحلهٔ پایانی همهٔ دنباله‌ها تا ۶)', () => {
    expect(SIMON_STAGE_MAX_SPAN).toEqual({ s1: 2, s2: 3, s3: 4, s4: 5, s5: null });
  });

  it('پیش‌ماندهٔ مرحله — سقف فقط تمرین؛ پروب در همهٔ مراحل (خط‌کش ثابت سنجش)', () => {
    const probeLen6: MissionItem = { ...simonItem, phase: 'probe', stim: { ...simonItem.stim, seq: [0, 1, 2, 3, 0, 2] } };
    const trainLen6: MissionItem = { ...simonItem, phase: 'train' };
    expect(simonItemInStage(probeLen6, 's1')).toBe(true);  // پروب همه‌جا
    expect(simonItemInStage(trainLen6, 's1')).toBe(false); // طول ۶ در س۱ نه
    const trainLen2: MissionItem = { ...simonItem, phase: 'train', stim: { ...simonItem.stim, seq: [0, 2] } };
    expect(simonItemInStage(trainLen2, 's1')).toBe(true);
    expect(simonItemInStage(trainLen2, 's5')).toBe(true);  // س۵ = همه
  });

  it('آستانهٔ مشترک SEQ_MEMORY (۶۵/۷۸/۸۸) و گذار دقت‌محور — هم‌پلهٔ کرسی و بازهٔ عدد', () => {
    const rule = GAME_KINDS.simon.stage_rule;
    expect(rule.shape).toBe('accuracy');
    if (rule.shape !== 'accuracy') return;
    expect(rule.pass.value).toBe(65);
    expect(rule.star2.value).toBe(78);
    expect(rule.star3.value).toBe(88);
    const out = stageOutcomeFor('simon', { pct: { correct_go: null, correct_nogo: null, accuracy: 80 } });
    expect(out.passed).toBe(true);
    expect(out.stars).toBe(2);
  });

  it('سنجهٔ موتور simon_span_max از فرمول span_max می‌آید — فرمول موتور-فقط تازه‌ای معرفی نمی‌شود', () => {
    const metric = ENGINE_METRICS.find((m) => m.id === 'simon_span_max');
    expect(metric).toBeDefined();
    expect(metric?.formula).toBe('span_max');
    expect(ENGINE_ONLY_FORMULAS).toContain('span_max');
    expect(ENGINE_ONLY_FORMULAS.filter((f) => f === 'span_max').length).toBe(1);
  });

  it('قفل نسخهٔ قواعد — ۱.۷.۰ (افزودن قواعد هم‌صداها)', () => {
    expect(STAGE_RULES_VERSION).toBe('1.7.0');
  });
});

describe('فرمول span_max برای هم‌صداها — قاعدهٔ دامنهٔ صفر', () => {
  it('بلندترین آواز کاملِ درست؛ پاسخ نادرست هرگز به فرمول نمی‌رسد', () => {
    const rows: ScoredAttempt[] = [
      { itemId: 'a', phase: 'probe', correct: true, rtMs: 900, rtValid: true, spanLen: 3 },
      { itemId: 'b', phase: 'probe', correct: false, rtMs: 900, rtValid: true, spanLen: 6 },
      { itemId: 'c', phase: 'probe', correct: true, rtMs: 900, rtValid: true, spanLen: 5 }
    ];
    expect(spanMaxOf(rows)).toBe(5);
    expect(computeMetricValue('span_max', rows)).toBe(5);
  });

  it('جلسهٔ بدون هیچ دنبالهٔ درست = null — نه صفرِ ساختگی', () => {
    const rows: ScoredAttempt[] = [
      { itemId: 'a', phase: 'probe', correct: false, rtMs: 900, rtValid: true, spanLen: 2 }
    ];
    expect(spanMaxOf(rows)).toBeNull();
  });
});

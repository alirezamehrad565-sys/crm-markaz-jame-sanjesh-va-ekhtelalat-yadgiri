// آزمون طلایی مرحله‌های «جادهٔ عددها» (۱.۲۵.۲۸) — آستانه‌ها، پیشرفت، پیش‌ماندهٔ جاده، نسخهٔ قواعد
import { describe, it, expect } from 'vitest';
import {
  NUMLINE_STAGE_THRESHOLDS,
  NUMLINE_STAGE_MAX,
  STAGE_RULES_VERSION,
  gameKindOf,
  numlineItemInStage,
  stageOutcomeFor,
  stageOutcomeNumline,
  stageProgressOfKind,
  stageByIndex,
  stageById,
  currentStageOf,
  stageProgressOf
} from '../stages';
import type { StageHistoryRow } from '../stages';

const row = (over: Partial<StageHistoryRow>): StageHistoryRow =>
  ({ stage_id: 's1', validity: 'valid', correct_go_pct: null, correct_nogo_pct: null, ...over });

describe('آستانه‌های گذار خط عددی — وضعیت proposed تا پیلوت مرکز', () => {
  it('نتیجهٔ مرحله از دقت — سه‌ستاره/دوستاره/یک‌ستاره/عدم‌گذار', () => {
    expect(stageOutcomeNumline(90).stars).toBe(3);
    expect(stageOutcomeNumline(80).stars).toBe(2);
    expect(stageOutcomeNumline(70).stars).toBe(1);
    expect(stageOutcomeNumline(70).passed).toBe(true);
    expect(stageOutcomeNumline(60).passed).toBe(false);
    expect(stageOutcomeNumline(60).stars).toBe(0);
    expect(stageOutcomeNumline(null).stars).toBe(0); // بدون داده = بدون ستارهٔ ساختگی
    expect(stageOutcomeNumline(88).stars).toBe(3);   // مرز دقیق ستارهٔ ۳
    expect(stageOutcomeNumline(65).passed).toBe(true); // مرز دقیق گذار
  });

  it('راهنمای نوع‌بازی — گونوگو و خط عددی ملاک‌های خودشان را می‌گیرند، هرگز مخلوط نمی‌شوند', () => {
    const summaryNum = { pct: { correct_go: null, correct_nogo: null, accuracy: 92 } };
    expect(stageOutcomeFor('numline', summaryNum).stars).toBe(3);
    // همان خلاصه اگر گونوگو بود: بدون درصدی گو/نوگو → صفر ستاره (قاعدهٔ دامنهٔ صفر)
    expect(stageOutcomeFor('gonogo', summaryNum).stars).toBe(0);
    const summaryGo = { pct: { correct_go: 95, correct_nogo: 90, accuracy: 95 } };
    expect(stageOutcomeFor('gonogo', summaryGo).stars).toBe(3);
    expect(stageOutcomeFor('numline', summaryGo).stars).toBe(3);
  });

  it('بامپ نسخهٔ قواعد — قواعد اسکن با نسخهٔ ۱.۲.۰ ثبت می‌شوند؛ خط عددی از ۱.۱.۰ عیناً مانده', () => {
    expect(STAGE_RULES_VERSION).toBe('1.3.0'); // ۱.۲۵.۳۲ — سه بازی تازه + اهرم تندشدن موج
    expect(NUMLINE_STAGE_THRESHOLDS).toEqual({ pass: 65, star2: 78, star3: 88 });
  });
});

describe('پیش‌ماندهٔ آیتم در جادهٔ مرحله', () => {
  const ranged = (max: number) => ({ range: [0, max] } as { range: [number, number] });

  it('سقف جادهٔ هر مرحله — s1..s5', () => {
    expect(NUMLINE_STAGE_MAX).toEqual({ s1: 10, s2: 20, s3: 50, s4: 100, s5: null });
  });

  it('آیتم‌ها با گسترهٔ خود در مرحله می‌مانند — سقف شامل، بیش‌سقف حذف', () => {
    expect(numlineItemInStage(ranged(10), 's1')).toBe(true);
    expect(numlineItemInStage(ranged(20), 's1')).toBe(false);
    expect(numlineItemInStage(ranged(20), 's2')).toBe(true);
    expect(numlineItemInStage(ranged(100), 's4')).toBe(true);
    expect(numlineItemInStage(ranged(100), 's5')).toBe(true);
    expect(numlineItemInStage(ranged(10), 's5')).toBe(true); // جادهٔ قهرمان‌ها = همه
  });

  it('بی‌مرحله/مرحلهٔ ناشناخته = همهٔ آیتم‌ها (سازگاری جلسه‌های قدیمی)', () => {
    expect(numlineItemInStage(ranged(100), null)).toBe(true);
    expect(numlineItemInStage(ranged(100), 'unknown')).toBe(true);
    expect(numlineItemInStage({ range: undefined }, 's2')).toBe(false);
  });
});

describe('پیشرفت مسیر خط عددی از تاریخچه', () => {
  it('گذار مرحله‌ای با دقت — قدم‌به‌قدم بدون پرش؛ بهترین ستاره حفظ می‌شود', () => {
    const history: StageHistoryRow[] = [
      row({ stage_id: 's1', accuracy: 92 }),            // ستاره ۳ → s2 باز
      row({ stage_id: 's2', accuracy: 66 }),            // ستاره ۱ → s3 باز
      row({ stage_id: 's2', accuracy: 80 }),            // ستاره ۲ (بهترین s2)
      row({ stage_id: 's2', accuracy: 55 }),            // زیر آستانه — اثری ندارد
      row({ stage_id: 's3', accuracy: 70, validity: 'partial' }) // نامعتبر — هرگز
    ];
    const prog = stageProgressOfKind('numline', history);
    expect(prog.unlocked_index).toBe(3);
    expect(prog.best.s1.stars).toBe(3);
    expect(prog.best.s2.stars).toBe(2);
    expect(prog.best.s3).toBeUndefined();
    expect(prog.stars_total).toBe(5);
  });

  it('تاریخچهٔ بدون دقت (جلسه‌های گونوگو) برای خط عددی ستاره نمی‌سازد — ملاک مخلوط ممنوع', () => {
    const history: StageHistoryRow[] = [
      row({ stage_id: 's1', correct_go_pct: 95, correct_nogo_pct: 90 }) // فقط ملاک گونوگو
    ];
    const prog = stageProgressOfKind('numline', history);
    expect(prog.unlocked_index).toBe(1);
    expect(prog.stars_total).toBe(0);
    // همان تاریخچه برای گونوگو می‌گذارد — پیشرفت مسیر گونوگو دست‌نخورده
    expect(stageProgressOf(history).unlocked_index).toBe(2);
  });
});

describe('عنوان‌های جاده‌ها — مرحله‌های نوع‌بازی‌آگاه', () => {
  it('خط عددی: جادهٔ کوچک تا جادهٔ قهرمان‌ها؛ گونوگو: گرم‌کردن تا قهرمان', () => {
    expect(stageByIndex('7-12', 1, 'numline')?.title_fa).toBe('جادهٔ کوچک');
    expect(stageByIndex('7-12', 5, 'numline')?.title_fa).toBe('جادهٔ قهرمان‌ها');
    expect(stageByIndex('7-12', 1)?.title_fa).toBe('گرم‌کردن'); // پیش‌فرض گونوگو
    expect(stageById('7-12', 's3', 'numline')?.title_fa).toBe('جادهٔ بلند');
    expect(stageById('7-12', 's3')?.title_fa).toBe('تندتر');
  });

  it('مرحلهٔ فعال از نوع‌بازی — کلید خاموشی بالاتر از این توابع نیست این‌جا', () => {
    const prog = stageProgressOfKind('numline', [row({ stage_id: 's1', accuracy: 90 })]);
    expect(currentStageOf(prog, '7-12', 'numline')?.title_fa).toBe('جادهٔ شهر');
  });

  it('نوع‌بازی از mission.game — ناشناخته = گونوگو (سازگاری بسته‌های قدیمی)', () => {
    expect(gameKindOf('numline')).toBe('numline');
    expect(gameKindOf('gonogo')).toBe('gonogo');
    expect(gameKindOf(undefined)).toBe('gonogo');
    expect(gameKindOf('xyz')).toBe('gonogo');
  });

  it('آستانه‌های خط عددی پیشنهاد کارشناس‌اند — honest proposed', () => {
    expect(NUMLINE_STAGE_THRESHOLDS).toEqual({ pass: 65, star2: 78, star3: 88 });
  });
});

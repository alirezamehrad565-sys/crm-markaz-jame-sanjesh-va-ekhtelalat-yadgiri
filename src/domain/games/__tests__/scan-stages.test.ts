// آزمون طلایی مرحله‌های «حملهٔ جاسوس‌ها» (۱.۲۵.۳۰) — سقف موج، آستانه‌ها، پیشرفت، نسخهٔ قواعد ۱.۲.۰
import { describe, it, expect } from 'vitest';
import {
  SCAN_STAGE_THRESHOLDS,
  SCAN_STAGE_MAX_TILES,
  STAGE_RULES_VERSION,
  gameKindOf,
  scanItemInStage,
  stageOutcomeFor,
  stageOutcomeScan,
  stageProgressOfKind,
  stageByIndex,
  stageById,
  currentStageOf
} from '../stages';
import type { StageHistoryRow } from '../stages';

const row = (over: Partial<StageHistoryRow>): StageHistoryRow =>
  ({ stage_id: 's1', validity: 'valid', correct_go_pct: null, correct_nogo_pct: null, ...over });

const waveStim = (cols: number, rows: number) => ({ stim: { cols, rows, signature: 2, tiles: [] } });

describe('آستانه‌های گذار اسکن — وضعیت proposed تا پیلوت مرکز', () => {
  it('نتیجهٔ مرحله از دقت موج‌ها — سه‌ستاره/دوستاره/یک‌ستاره/عدم‌گذار', () => {
    expect(stageOutcomeScan(90).stars).toBe(3);
    expect(stageOutcomeScan(80).stars).toBe(2);
    expect(stageOutcomeScan(70).stars).toBe(1);
    expect(stageOutcomeScan(70).passed).toBe(true);
    expect(stageOutcomeScan(60).passed).toBe(false);
    expect(stageOutcomeScan(null).stars).toBe(0);
    expect(stageOutcomeScan(88).stars).toBe(3);
    expect(stageOutcomeScan(65).passed).toBe(true);
  });

  it('راهنمای نوع‌بازی — اسکن ملاک خودش را می‌گیرد، قواعد مخلوط نمی‌شوند', () => {
    const summaryScan = { pct: { correct_go: null, correct_nogo: null, accuracy: 92 } };
    expect(stageOutcomeFor('scan', summaryScan).stars).toBe(3);
    expect(stageOutcomeFor('gonogo', summaryScan).stars).toBe(0);
    expect(stageOutcomeFor('numline', summaryScan).stars).toBe(3);
  });

  it('بامپ نسخهٔ قواعد — قواعد اسکن با نسخهٔ ۱.۲.۰ ثبت می‌شوند', () => {
    expect(STAGE_RULES_VERSION).toBe('1.4.0'); // ۱.۲۵.۴۰ — آلبوم خرچنگ (nback) + قواعد شش نوع پیشین عیناً
  });

  it('آستانه‌ها همان ۶۵/۷۸/۸۸ خط عددی‌اند — proposed', () => {
    expect(SCAN_STAGE_THRESHOLDS).toEqual({ pass: 65, star2: 78, star3: 88 });
  });
});

describe('پیش‌ماندهٔ موج در مرحله — اهرم سختی = اندازهٔ موج', () => {
  it('سقف خانه‌های هر مرحله — s1..s5', () => {
    expect(SCAN_STAGE_MAX_TILES).toEqual({ s1: 6, s2: 9, s3: 12, s4: 15, s5: null });
  });

  it('موج‌ها با اندازهٔ خود در مرحله می‌مانند — سقف شامل، بیش‌سقف حذف', () => {
    expect(scanItemInStage(waveStim(3, 2), 's1')).toBe(true);  // ۶
    expect(scanItemInStage(waveStim(3, 3), 's1')).toBe(false); // ۹
    expect(scanItemInStage(waveStim(3, 3), 's2')).toBe(true);
    expect(scanItemInStage(waveStim(4, 3), 's2')).toBe(false); // ۱۲
    expect(scanItemInStage(waveStim(4, 3), 's3')).toBe(true);
    expect(scanItemInStage(waveStim(5, 3), 's4')).toBe(true);  // ۱۵
    expect(scanItemInStage(waveStim(5, 3), 's5')).toBe(true);  // مرور بزرگ: همه
  });

  it('بی‌مرحله/موج ناسالم — سازگاری: بی‌مرحله همهٔ موج‌ها؛ موج ناسالم هیچ‌جا', () => {
    expect(scanItemInStage(waveStim(3, 2), null)).toBe(true);
    expect(scanItemInStage(waveStim(3, 2), 'unknown-stage')).toBe(true);
    expect(scanItemInStage({ stim: {} }, 's1')).toBe(false);
    expect(scanItemInStage({ stim: { cols: 0, rows: 2 } }, 's1')).toBe(false);
  });
});

describe('عنوان‌های مرحله‌ها — روایت عدی، گفتار آرام', () => {
  it('پنج مرحلهٔ اسکن با عنوان‌های صحنهٔ دشمن', () => {
    const titles = [1, 2, 3, 4, 5].map((i) => stageByIndex('7-12', i, 'scan')?.title_fa);
    expect(titles).toEqual(['کاوش شب اول', 'گشت دوم', 'رگبار سوم', 'حملهٔ بزرگ', 'دفاع قهرمان‌ها']);
    expect(stageById('7-12', 's1', 'scan')?.goal_fa).toContain('آهسته');
    expect(stageById('4-6', 's3', 'scan')?.title_fa).toBe('رگبار سوم');
  });

  it('نوع‌بازی scan از mission.game — ناشناخته = گونوگو', () => {
    expect(gameKindOf('scan')).toBe('scan');
    expect(gameKindOf('numline')).toBe('numline');
    expect(gameKindOf('gonogo')).toBe('gonogo');
    expect(gameKindOf('anything-else')).toBe('gonogo');
  });
});

describe('پیشرفت مسیر اسکن — گذار فقط از جلسهٔ معتبر', () => {
  it('گذار و بهترین ستاره — همان قرارداد مسیرهای دیگر', () => {
    const progress = stageProgressOfKind('scan', [
      row({ stage_id: 's1', accuracy: 90 }),
      row({ stage_id: 's1', accuracy: 70 }),
      row({ stage_id: 's2', accuracy: 80 }),
      row({ stage_id: 's3', validity: 'partial', accuracy: 95 }) // نامعتبر = هیچ
    ]);
    expect(progress.unlocked_index).toBe(3);
    expect(progress.best['s1']?.stars).toBe(3);
    expect(progress.best['s2']?.stars).toBe(2);
    expect(progress.best['s3']).toBeUndefined();
    expect(progress.stars_total).toBe(5);
  });

  it('مرحلهٔ فعال کودک — بالاترین قفل‌گشایی‌شده با عنوان اسکن', () => {
    const progress = stageProgressOfKind('scan', [row({ stage_id: 's1', accuracy: 66 })]);
    expect(progress.unlocked_index).toBe(2);
    const stage = currentStageOf(progress, '7-12', 'scan');
    expect(stage?.id).toBe('s2');
    expect(stage?.title_fa).toBe('گشت دوم');
  });
});

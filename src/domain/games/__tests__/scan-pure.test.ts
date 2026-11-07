// آزمون طلایی نمره‌دهی «حملهٔ جاسوس‌ها» (۱.۲۵.۳۰) — مجموعهٔ دقیق، بازخورد CSV، فرمول‌ها و خلاصهٔ اسکن
import { describe, it, expect } from 'vitest';
import {
  scoreAttempt,
  scanMissedCsv,
  scanFaPctOf,
  scanMissPctOf,
  computeMetricValue,
  tilesCountOf,
  SCAN_FB_ALL,
  type ScoredAttempt
} from '../pure';
import { summarizeAttempts } from '../scoring';
import type { MissionItem, MissionConfig } from '../types';

/** موج آزمونی — شبکهٔ ۳×۲ با جاسوس‌های معلوم؛ سایر خانه‌ها هم‌نوع با آنتن متفاوت */
function wave(over: Partial<MissionItem> & { correct?: number[]; tiles?: number[] } = {}): MissionItem {
  const correct = over.correct ?? [0, 3];
  const tiles = over.tiles ?? [2, 1, 2, 4, 1, 1];
  return {
    id: over.id ?? 'wa1',
    phase: over.phase ?? 'train',
    type: 'scan',
    prompt: 'جاسوس‌ها ربات‌هایی با ۲ آنتن‌اند — همه را بگیر، هم‌نوع‌ها را دست نزن.',
    correct,
    ...(over.stim ? { stim: over.stim } : { stim: { cols: 3, rows: 2, wave_ms: 15000, signature: 2, tiles } }),
    ...over
  } as MissionItem;
}

const mission = { id: 'scan_v1', game: 'scan', metric: 'accuracy_scan', items: [] } as unknown as MissionConfig;

describe('scoreAttempt نوع scan — دقیقاً همان مجموعهٔ جاسوس‌ها', () => {
  it('موج کامل درست است — ترتیب بی‌اثر', () => {
    const it1 = scoreAttempt(wave(), mission, { hits: [0, 3] }, 800);
    const it2 = scoreAttempt(wave(), mission, { hits: [3, 0] }, 800);
    expect(it1.correct).toBe(true);
    expect(it2.correct).toBe(true);
  });

  it('تکرار لمس همان خانه بی‌اثر است — dedupe', () => {
    expect(scoreAttempt(wave(), mission, { hits: [0, 0, 3] }, 800).correct).toBe(true);
  });

  it('گرفتن هم‌نوع = موج نادرست با شمار خطا', () => {
    const s = scoreAttempt(wave(), mission, { hits: [0, 1, 3] }, 800);
    expect(s.correct).toBe(false);
    expect(s.scanFalse).toBe(1);
    expect(s.scanMissed).toBe(0);
    expect(s.scanDistractors).toBe(4);
    expect(s.scanSpies).toBe(2);
  });

  it('جاانداختن جاسوس = موج نادرست با شمار اُمیشن', () => {
    const s = scoreAttempt(wave(), mission, { hits: [0] }, 800);
    expect(s.correct).toBe(false);
    expect(s.scanFalse).toBe(0);
    expect(s.scanMissed).toBe(1);
  });

  it('موج خالی با جاسوس حاضر = نادرست؛ کف RT اسکن ۱۵۰ms', () => {
    const s = scoreAttempt(wave(), mission, { hits: [] }, 800);
    expect(s.correct).toBe(false);
    expect(s.scanMissed).toBe(2);
    const fast = scoreAttempt(wave(), mission, { hits: [0, 3] }, 90);
    expect(fast.rtValid).toBe(false); // زیر کف ۱۵۰ — حدس
  });

  it('پاسخ خراب (بدون hits) هرگز درست نیست — کلید فقط سرور', () => {
    expect(scoreAttempt(wave(), mission, {}, 800).correct).toBe(false);
    expect(scoreAttempt(wave(), mission, { hits: '0,3' }, 800).correct).toBe(false);
    expect(scoreAttempt(wave(), mission, { hits: [-1, 99] }, 800).correct).toBe(false);
  });

  it('شمار خانه‌های موج از خود stim — ناسالم = صفر', () => {
    expect(tilesCountOf(wave())).toBe(6);
    expect(tilesCountOf({ ...wave(), stim: { cols: 5, rows: 3 } } as MissionItem)).toBe(15);
    expect(tilesCountOf({ ...wave(), stim: {} } as MissionItem)).toBe(0);
  });
});

describe('بازخورد اسکن — CSV جاسوس‌های جامانده فقط برای موج نادرست', () => {
  it('CSV فقط جاسوس‌های واقعاً جامانده — رقم‌های لاتین با کاما', () => {
    expect(scanMissedCsv(wave(), { hits: [0] })).toBe('3');
    expect(scanMissedCsv(wave(), { hits: [3] })).toBe('0');
    expect(scanMissedCsv(wave(), { hits: [0, 3] })).toBeNull();
    expect(scanMissedCsv(wave(), { hits: [0, 1, 3] })).toBeNull(); // نادرست اما هیچ جاسوسی جامانده نیست
    expect(scanMissedCsv(wave({ correct: [0, 2, 4] }), { hits: [0] })).toBe('2,4');
  });

  it('پیام درست موج کامل — بی‌رقارت و بدون سرزنش (§۲)', () => {
    expect(SCAN_FB_ALL).toBe('همهٔ جاسوس‌ها را گرفتی! چشم‌هایت تیز بود.');
  });
});

describe('فرمول‌های اسکن — دامنه از خود موج، قاعدهٔ دامنهٔ صفر', () => {
  const scored: ScoredAttempt[] = [
    scoreAttempt(wave(), mission, { hits: [0, 3] }, 800),
    scoreAttempt(wave({ id: 'wa2', correct: [1], stim: { cols: 3, rows: 1, wave_ms: 15000, signature: 2, tiles: [1, 2, 1] } }), mission, { hits: [1, 2] }, 700),
    scoreAttempt(wave({ id: 'wa3' }), mission, { hits: [0] }, 900)
  ];

  it('fa روی هم‌نوع‌ها — جمع خطاها تقسیم بر جمع هم‌نوع‌ها', () => {
    // هم‌نوع‌ها: موج۱=۴ (۶−۲) · موج۲=۲ (۳−۱) · موج۳=۴ (۶−۲) → ۱۰؛ خطا: موج۲=۱ → ۱۰٪
    expect(scanFaPctOf(scored)).toBe(10);
  });

  it('miss روی جاسوس‌ها — جمع اُمیشن تقسیم بر جمع جاسوس‌ها', () => {
    // جاسوس‌ها: ۲+۱+۲=۵؛ جامانده: موج۳=۱ → ۲۰٪
    expect(scanMissPctOf(scored)).toBe(20);
  });

  it('بدون آیتم اسکن = null — صفرِ ساختگی ممنوع', () => {
    expect(scanFaPctOf([])).toBeNull();
    expect(scanMissPctOf([])).toBeNull();
    const touch = scoreAttempt(
      { id: 'g1', phase: 'probe', type: 'touch_report', correct_touch: true } as unknown as MissionItem,
      mission, { touched: true }, 400
    );
    expect(scanFaPctOf([touch])).toBeNull();
    expect(scanMissPctOf([touch])).toBeNull();
  });

  it('computeMetricValue فرمول‌های scan_fa/scan_miss — فقط-موتور', () => {
    expect(computeMetricValue('scan_fa', scored)).toBe(10);
    expect(computeMetricValue('scan_miss', scored)).toBe(20);
    expect(computeMetricValue('scan_fa', [])).toBeNull();
  });
});

describe('خلاصهٔ جلسهٔ اسکن — بلوک scan جدا از گو/نوگو', () => {
  const mk = (id: string, phase: 'train' | 'probe', hits: number[], correct: number[], tiles: number[]): ScoredAttempt =>
    scoreAttempt(wave({ id, phase, correct, tiles }), mission, { hits }, 800);

  it('دقت موج‌ها + fa/miss — و بدون آیتم اسکن خلاصهٔ اسکن null است', () => {
    const rows = [
      mk('wa1', 'train', [0, 3], [0, 3], [2, 1, 2, 4, 1, 1]),
      mk('wp1', 'probe', [0, 3], [0, 3], [2, 1, 2, 4, 1, 1]),
      mk('wp2', 'probe', [0], [0, 3], [2, 1, 2, 4, 1, 1])
    ];
    const sum = summarizeAttempts(rows, [], 24);
    expect(sum.scan).not.toBeNull();
    expect(sum.scan?.waves).toBe(3);
    expect(sum.scan?.correct_waves).toBe(2);
    expect(sum.scan?.correct_waves_pct).toBeCloseTo(66.67, 1);
    expect(sum.scan?.fa_pct).toBe(0);
    expect(sum.scan?.miss_pct).toBeCloseTo(16.67, 1); // ۱ جامانده از ۶ جاسوس (۲+۲+۲)
    expect(sum.pct.accuracy).toBeCloseTo(66.67, 1); // دقت عمومی = دقت موج‌ها
    const empty = summarizeAttempts([], [], 24);
    expect(empty.scan).toBeNull();
  });

  it('هم‌نوع صفر در کل جلسه → fa_pct null با توضیح صادقانه', () => {
    // موج ۲×۲ که همهٔ خانه‌هایش جاسوس است — مخرج fa صفر
    const four = [scoreAttempt(wave({ id: 'wp9', phase: 'probe', correct: [0, 1, 2, 3], stim: { cols: 2, rows: 2, wave_ms: 15000, signature: 2, tiles: [2, 2, 2, 2] } }), mission, { hits: [0, 1, 2, 3] }, 800)];
    const sum = summarizeAttempts(four, [], 24);
    expect(sum.scan?.fa_pct).toBeNull();
    expect(sum.zero_denominator.join(' ')).toContain('fa_pct');
  });
});

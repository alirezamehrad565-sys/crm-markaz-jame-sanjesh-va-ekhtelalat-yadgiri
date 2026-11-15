// آزمون طلایی خط عددی «جادهٔ عددها» (۱.۲۵.۲۸) — آستانهٔ پذیرش، خطا، بازخورد دو-سطحی، نمای آیتم
import { describe, it, expect } from 'vitest';
import {
  scoreAttempt,
  answerDisplayOf,
  numlineFeedbackOf,
  previewItemAt,
  NUMLINE_FB_EXACT,
  NUMLINE_FB_NEAR,
  toItemView
} from '../pure';
import { summarizeAttempts } from '../scoring';
import type { MissionConfig, MissionItem } from '../types';

function missionOf(items: MissionItem[]): MissionConfig {
  return { id: 'm', game: 'numline', goal: 'numline', metric: 'pct_error_numline', items } as unknown as MissionConfig;
}

const item = (over: Partial<MissionItem>): MissionItem =>
  ({ id: 'n1', phase: 'train', type: 'numline', range: [0, 20], correct: 12, ...over } as MissionItem);

describe('نمره‌دهی خط عددی — آستانهٔ پذیرش سن‌محور', () => {
  it('پیش‌فرض ۰٫۵ = لمس صحیح همان عدد — رفتار قبلی عیناً حفظ شده', () => {
    const it1 = item({ tolerance: undefined });
    expect(scoreAttempt(it1, missionOf([it1]), { chosen: 12 }, 900).correct).toBe(true);
    expect(scoreAttempt(it1, missionOf([it1]), { chosen: 13 }, 900).correct).toBe(false);
    expect(scoreAttempt(it1, missionOf([it1]), { chosen: 11 }, 900).correct).toBe(false);
  });

  it('آستانهٔ authored گسترهٔ بزرگ — درون کران درست، بیرون کران نادرست', () => {
    const it2 = item({ tolerance: 2 });
    expect(scoreAttempt(it2, missionOf([it2]), { chosen: 10 }, 900).correct).toBe(true);
    expect(scoreAttempt(it2, missionOf([it2]), { chosen: 14 }, 900).correct).toBe(true);
    expect(scoreAttempt(it2, missionOf([it2]), { chosen: 9 }, 900).correct).toBe(false);
    expect(scoreAttempt(it2, missionOf([it2]), { chosen: 15 }, 900).correct).toBe(false);
  });

  it('آستانهٔ صفر قانونی است — فقط همان عدد', () => {
    const it0 = item({ tolerance: 0 });
    expect(scoreAttempt(it0, missionOf([it0]), { chosen: 12 }, 900).correct).toBe(true);
    expect(scoreAttempt(it0, missionOf([it0]), { chosen: 13 }, 900).correct).toBe(false);
  });

  it('خطای نرمال‌شده از گسترهٔ خود آیتم — مقدارهای طلایی', () => {
    const itA = item({ correct: 7, range: [0, 10], tolerance: 0.5 });
    const sA = scoreAttempt(itA, missionOf([itA]), { chosen: 9 }, 900);
    expect(sA.correct).toBe(false);
    expect(sA.numlineErrorPct).toBe(20); // |9-7|/10 × ۱۰۰
    const itB = item({ correct: 63, range: [0, 100], tolerance: 4 });
    const sB = scoreAttempt(itB, missionOf([itB]), { chosen: 67 }, 900);
    expect(sB.correct).toBe(true); // |67−63|=۴ ≤ آستانهٔ ۴
    expect(sB.numlineErrorPct).toBe(4);
    expect(scoreAttempt(itB, missionOf([itB]), { chosen: 68 }, 900).correct).toBe(false); // ۵ > ۴
  });

  it('بدون پاسخ عددی یا بدون گستره = نادرست؛ RT منفی بی‌اندازه نه زیر کف', () => {
    const it1 = item({});
    expect(scoreAttempt(it1, missionOf([it1]), {}, 900).correct).toBe(false);
    expect(scoreAttempt(it1, missionOf([it1]), { chosen: 12 }, 900).rtValid).toBe(true); // کف خط عددی صفر است
    expect(scoreAttempt(it1, missionOf([it1]), { chosen: 12 }, -5).rtMs).toBeNull();
  });
});

describe('بازخورد دو-سطحی خط عددی', () => {
  it('دقیقاً همان عدد → تحسین دقیق', () => {
    const it1 = item({ correct: 12 });
    expect(numlineFeedbackOf(it1, true, { chosen: 12 })).toBe(NUMLINE_FB_EXACT);
  });

  it('درون آستانه ولی نه همان عدد → «خیلی نزدیک بود»', () => {
    const it1 = item({ correct: 12, tolerance: 2 });
    expect(numlineFeedbackOf(it1, true, { chosen: 14 })).toBe(NUMLINE_FB_NEAR);
  });

  it('نادرست → null (متن پیش‌فرض §۲ سرور می‌گذارد)؛ غیر-خط-عددی هم null', () => {
    const it1 = item({ correct: 12, tolerance: 2 });
    expect(numlineFeedbackOf(it1, false, { chosen: 12 })).toBeNull();
    const touch = { id: 't1', phase: 'train', type: 'touch_report', correct_touch: true } as MissionItem;
    expect(numlineFeedbackOf(touch, true, { touched: true })).toBeNull();
  });

  it('نمایش پاسخ نادرست = عدد درست؛ کلید هرگز در نمای آیتم نیست', () => {
    const it1 = item({ correct: 23, tolerance: 2 });
    expect(answerDisplayOf(it1)).toBe('23');
    const view = toItemView(it1);
    expect(JSON.stringify(view)).not.toContain('correct');
    expect(JSON.stringify(view)).not.toContain('tolerance');
    expect(view.range).toEqual([0, 20]);
  });
});

describe('خلاصهٔ جلسه — میانگین خطای خط عددی با قاعدهٔ دامنهٔ صفر', () => {
  it('جلسهٔ خط عددی: دقت + میانگین خطا؛ گو/نوگو null با یادداشت دامنهٔ صفر', () => {
    const items = [
      item({ id: 'a', correct: 7, range: [0, 10], tolerance: 0.5 }),
      item({ id: 'b', correct: 12, range: [0, 20], tolerance: 1 }),
      item({ id: 'c', correct: 37, range: [0, 50], tolerance: 2 })
    ];
    const m = missionOf(items);
    const scored = [
      scoreAttempt(items[0], m, { chosen: 7 }, 900),   // درست — خطا ۰
      scoreAttempt(items[1], m, { chosen: 13 }, 900),  // درست (آستانهٔ ۱) — خطا ۵
      scoreAttempt(items[2], m, { chosen: 30 }, 900)   // نادرست — خطا ۱۴
    ];
    const sum = summarizeAttempts(scored);
    expect(sum.pct.accuracy).toBeCloseTo(66.67);
    expect(sum.numline.mean_error_pct).toBeCloseTo(6.33);
    expect(sum.pct.correct_go).toBeNull();
    expect(sum.zero_denominator.some((z) => z.includes('go=0'))).toBe(true);
  });

  it('جلسهٔ گو/نوگو: میانگین خطای خط عددی null — بدون صفر ساختگی', () => {
    const touch = { id: 'g1', phase: 'probe', type: 'touch_report', correct_touch: true } as MissionItem;
    const scored = [scoreAttempt(touch, missionOf([touch]), { touched: true }, 500)];
    const sum = summarizeAttempts(scored);
    expect(sum.numline.mean_error_pct).toBeNull();
    expect(sum.pct.accuracy).toBe(100);
  });
});

describe('پیش‌نمایش خط عددی — ترتیب authored بدون دنبالهٔ g/n', () => {
  it('موقعیت n = آیتم authored همان جایگاه', () => {
    const items = [
      item({ id: 'n1' }),
      item({ id: 'n2', correct: 15 }),
      item({ id: 'n3', correct: 37, range: [0, 50] })
    ];
    const at = previewItemAt(missionOf(items), null, 1);
    expect(at.item?.id).toBe('n2');
    expect(at.progress).toEqual({ done: 1, total: 3 });
    expect(previewItemAt(missionOf(items), null, 5).item).toBeNull();
  });
});

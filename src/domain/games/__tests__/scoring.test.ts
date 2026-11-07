// آزمون طلایی موتور نمره‌دهی جلسه (فاز ۵ بازطراحی / ۱.۲۵.۱۵) — مجموع‌ها/درصدها/RT/بلوک/دامنهٔ صفر
import { describe, it, expect } from 'vitest';
import { summarizeAttempts } from '../scoring';
import { scoreAttempt } from '../pure';
import type { MissionConfig, MissionItem } from '../types';

function missionOf(items: MissionItem[]): MissionConfig {
  return { id: 'm', game: 'gonogo', goal: 'inhibition', metric: 'accuracy_gonogo', items } as MissionItem extends never ? never : MissionConfig;
}

// سناریوی مرجع: ۱۰ گو (۸ درست با RT) + ۶ نوگو (۵ درست) — همه پروب touch_report
function referenceItems(): MissionItem[] {
  const items: MissionItem[] = [];
  for (let i = 1; i <= 10; i++) items.push({ id: 'g' + i, phase: 'probe', type: 'touch_report', correct_touch: true });
  for (let i = 1; i <= 6; i++) items.push({ id: 'n' + i, phase: 'probe', type: 'touch_report', correct_touch: false });
  return items;
}

const m = missionOf(referenceItems());
const RTS = [400, 450, 500, 550, 600, 650, 700, 750]; // RTهای درست گو

function referenceRun() {
  const scored = [];
  const evidence = [];
  // ۸ گوی درست + ۲ گوی اُمیشن
  for (let i = 0; i < 8; i++) {
    scored.push(scoreAttempt(m.items[i], m, { touched: true }, RTS[i]));
    evidence.push({ presented_at_ms: 1000 + i, frame_drops: i < 2 ? 3 : 0, max_frame_delta_ms: i < 2 ? 48 : 20, touch_count: 1, premature_count: 0, multiple_count: 0, out_of_surface_count: 0, window_ms: 1500 });
  }
  for (let i = 8; i < 10; i++) {
    scored.push(scoreAttempt(m.items[i], m, { touched: false }, null));
    evidence.push({ presented_at_ms: null, frame_drops: 0, max_frame_delta_ms: null, touch_count: 0, premature_count: 1, multiple_count: 0, out_of_surface_count: 1, window_ms: 1500 });
  }
  // ۵ نوگوی درست (بازداری) + ۱ کمیسیون
  for (let i = 10; i < 15; i++) {
    scored.push(scoreAttempt(m.items[i], m, { touched: false }, null));
    evidence.push({ presented_at_ms: 2000, frame_drops: 0, max_frame_delta_ms: null, touch_count: 0, premature_count: 0, multiple_count: 0, out_of_surface_count: 0, window_ms: 1500 });
  }
  scored.push(scoreAttempt(m.items[15], m, { touched: true }, 600));
  evidence.push({ presented_at_ms: 2100, frame_drops: 1, max_frame_delta_ms: 40, touch_count: 2, premature_count: 0, multiple_count: 1, out_of_surface_count: 0, window_ms: 1500 });
  return { scored, evidence };
}

describe('خلاصهٔ جلسه — مجموع‌ها و درصدها (نمونهٔ طلایی)', () => {
  const { scored, evidence } = referenceRun();
  const s = summarizeAttempts(scored, evidence, 8);

  it('مجموع‌ها: گو/نوگو/درست/کمیسیون/اُمیشن', () => {
    expect(s.totals.total).toBe(16);
    expect(s.totals.go).toBe(10);
    expect(s.totals.nogo).toBe(6);
    expect(s.totals.correct_go).toBe(8);
    expect(s.totals.correct_nogo).toBe(5);
    expect(s.totals.commission).toBe(1);
    expect(s.totals.omission).toBe(2);
  });

  it('درصدهای نسبی طبق دفترچهٔ وظیفه §۵', () => {
    expect(s.pct.correct_go).toBe(80);
    expect(s.pct.correct_nogo).toBe(83.33);
    expect(s.pct.commission).toBe(16.67);
    expect(s.pct.omission).toBe(20);
    expect(s.pct.accuracy).toBe(81.25); // ۱۳/۱۶
  });

  it('RT: میانه/میانگین/SD/دامنه/تعداد — CV با ۸ دادهٔ درست حاضر است', () => {
    expect(s.rt.median).toBe(575);
    expect(s.rt.mean).toBe(575);
    expect(s.rt.min).toBe(400);
    expect(s.rt.max).toBe(750);
    expect(s.rt.count).toBe(8);
    expect(s.rt.cv).toBeGreaterThan(0);
    expect(s.rt.sd).toBeGreaterThan(0);
  });

  it('رفتار: premature/multiple/out_of_surface/افت فریم از شواهد فاز ۴', () => {
    expect(s.behavior.premature_total).toBe(2); // دو گوی اُمیشن هرکدام یک premature
    expect(s.behavior.multiple_total).toBe(1);
    expect(s.behavior.out_of_surface_total).toBe(2);
    expect(s.behavior.frame_drops_total).toBe(7); // ۳+۳+۱
    expect(s.behavior.max_frame_delta_ms).toBe(48);
    expect(s.behavior.evidence_coverage).toBe(0.88); // ۱۴ از ۱۶ با مُهر نمایش
  });

  it('بلوک‌ها: تقسیم بر جایگاه با blockSize=۸ — عملکرد هر بلوک', () => {
    expect(s.blocks.length).toBe(2);
    expect(s.blocks[0]).toMatchObject({ block: 1, total: 8, correct: 8, correct_pct: 100 }); // ۸ گوی درست
    expect(s.blocks[1]).toMatchObject({ block: 2, total: 8, correct: 5, correct_pct: 62.5 }); // ۵ بازداری درست
    expect(s.blocks[0].median_rt).toBe(575); // میانهٔ ۴۰۰..۷۵۰ // (500+550)/2
  });

  it('d-prime رزرو است و هیچ مقدار ساختگی ندارد', () => {
    expect(s.dprime).toBeNull();
  });
});

describe('قاعدهٔ دامنهٔ صفر — صادقانه null، نه صفرِ ساختگی', () => {
  it('بدون نوگو: commission% و correct_nogo% تهی + ردیابی دلیل', () => {
    const items = [{ id: 'g1', phase: 'probe', type: 'touch_report', correct_touch: true }] as MissionItem[];
    const mm = missionOf(items);
    const scored = [scoreAttempt(items[0], mm, { touched: true }, 500)];
    const s = summarizeAttempts(scored, [], 24);
    expect(s.totals.nogo).toBe(0);
    expect(s.pct.commission).toBeNull();
    expect(s.pct.correct_nogo).toBeNull();
    expect(s.pct.correct_go).toBe(100);
    expect(s.zero_denominator.some((x) => x.includes('nogo=0'))).toBe(true);
  });

  it('بدون گو: omission% و correct_go% تهیه', () => {
    const items = [{ id: 'n1', phase: 'probe', type: 'touch_report', correct_touch: false }] as MissionItem[];
    const mm = missionOf(items);
    const scored = [scoreAttempt(items[0], mm, { touched: false }, null)];
    const s = summarizeAttempts(scored, [], 24);
    expect(s.pct.omission).toBeNull();
    expect(s.pct.correct_go).toBeNull();
    expect(s.pct.correct_nogo).toBe(100);
    expect(s.zero_denominator.some((x) => x.includes('go=0'))).toBe(true);
  });

  it('CV با دادهٔ کم (۴ RT) صادقانه null است', () => {
    const items = referenceItems();
    const mm = missionOf(items);
    const scored = [500, 520, 480, 510].map((rt, i) => scoreAttempt(mm.items[i], mm, { touched: true }, rt));
    const s = summarizeAttempts(scored, [], 24);
    expect(s.rt.count).toBe(4);
    expect(s.rt.cv).toBeNull();
    expect(s.rt.sd).not.toBeNull();
  });

  it('جلسهٔ تهی: همه‌چیز تهی، نه صفر — بدون خطا', () => {
    const s = summarizeAttempts([], [], 24);
    expect(s.totals.total).toBe(0);
    expect(s.pct.accuracy).toBeNull();
    expect(s.rt.median).toBeNull();
    expect(s.blocks).toEqual([]);
    expect(s.dprime).toBeNull();
  });
});

/**
 * تست‌های یکپارچگی وکسلر ۴ با موتور شناسایی
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// wechsler-integration.test.ts — پیوند فرم ce-wechsler-w4-v1 با runInference — نسخهٔ m156:
// ۱) قاعدهٔ خام fsiq → دیرآموزی (بافتار T8)  ۲) m156 — فرضیه‌های engine_output (قدیم m98) نادیده
// گرفته می‌شوند: هیچ فرضیه‌ای از وکسلر به هیچ هدفی تزریق نمی‌شود  ۳) پروفایل T1 → قواعد سیگنالی باند
// سناریوی پایه = دادهٔ واقعی آریا: fsiq ۷۵ / DLD ۰٫۴ / BIF ۰٫۳ / APD ۰٫۲۵ / MOOD ۰٫۲ (شکل payload قدیم)

import { describe, it, expect } from 'vitest';
import { runInference } from '../infer';
import type { EvidenceEvent } from '../types';

// ───────── سازندهٔ رویداد وکسلر ۴ ─────────

/** خروجی موتور تفسیر — مشابه Aria: fsiq=75 و چهار فرضیه (شکل payload قدیمی m98) */
const ARIA_ENGINE_OUTPUT = {
  ok: true,
  engineVersion: 'm132',
  ageLine: 'sq-10',
  snapshot: { fsiq: 75, indices: { FSIQ: { scaled: 75, cls: 'مرزی' } } },
  main: { id: 'BIF', name: 'عملکرد مرزی/دیرآموزی (BIF)', level: 'متوسط' },
  hypotheses: [
    { id: 'DLD', weight: 0.4 },
    { id: 'BIF', weight: 0.3 },
    { id: 'APD', weight: 0.25 },
    { id: 'MOOD', weight: 0.2 }
  ],
  weakDomains: ['language', 'working_memory'],
  flags: [{ key: 'scatter', fa: 'پراکندگی نیم‌رخ زیاد است' }],
  monitoringInterval: 6
};

function wechslerEvent(opts: {
  eventId: string;
  fsiq?: string;
  engine?: unknown | null;
  occurredAt?: string;
}): EvidenceEvent {
  const payload: Record<string, { value: string; label: string }> = {};
  if (opts.fsiq !== undefined) payload['fsiq'] = { value: opts.fsiq, label: 'هوشبهر کلی' };
  if (opts.engine !== null && opts.engine !== undefined) {
    payload['engine_output'] = { value: JSON.stringify(opts.engine), label: 'خروجی موتور تفسیر' };
  }
  return {
    eventId: opts.eventId,
    toolKey: 'ce-wechsler-w4-v1',
    typeTitle: 'وکسلر ۴ — پروندهٔ تفسیر موتور',
    status: 'completed',
    occurredAt: opts.occurredAt ?? '2026-10-03T08:00:00.000Z',
    payload: Object.keys(payload).length ? payload : null,
    analysis: null,
    bands: null,
    subscales: null
  };
}

/** رویداد SDQ والد با زیرمقیاس هیجانی (emo) در باند danger */
function sdqParentEmoDanger(eventId: string): EvidenceEvent {
  return {
    eventId,
    toolKey: 'sdq-parent',
    typeTitle: 'پرسش‌نامهٔ توانمندی‌ها و دشواری‌ها (SDQ) — والد',
    status: 'completed',
    occurredAt: '2026-10-04T08:00:00.000Z',
    payload: null,
    analysis: {
      score: 8,
      band: null,
      answered: 25,
      total: 25,
      maxScore: 50,
      subscaleScores: [{ id: 'emo', name: 'هیجانی', score: 7, max: 10, band: null, color: 'danger' }]
    },
    bands: null,
    subscales: null
  };
}

// ───────── آزمون‌ها ─────────

describe('پیوند وکسلر ۴ با موتور شناسایی (m156 — بدون تغذیهٔ فرضیه‌ای)', () => {
  it('۱) فقط رویداد وکسلر (fsiq=۷۵) → دیرآموزی با شاهد «هوشبهر کلی وکسلر در محدودهٔ مرزی» — قاعدهٔ خام بندل', () => {
    const out = runInference([wechslerEvent({ eventId: 'w1', fsiq: '75' })]);
    const slow = out.ranked.find((h) => h.targetKey === 'slow_learner');
    expect(slow).toBeDefined();
    // fsiq در بازهٔ ۷۰–۸۵ → وزن قاعدهٔ وکسلر = ۲ (instrumentDanger)
    expect(slow!.score).toBeCloseTo(2, 5);
    expect(slow!.evidenceFa.some((e) => e.includes('هوشبهر کلی وکسلر در محدودهٔ مرزی'))).toBe(true);
    expect(out.dataCoverage.seen).toContain('ce-wechsler-w4-v1');
  });

  it('۲) payload قدیمی با فرضیهٔ DLD وزن ۰٫۴ → هیچ فرضیهٔ زبان/گفتاری ساخته نمی‌شود (m156 — اتصال قطع)', () => {
    const out = runInference([wechslerEvent({ eventId: 'w1', fsiq: '75', engine: ARIA_ENGINE_OUTPUT })]);
    expect(out.ranked.find((h) => h.targetKey === 'speech_language')).toBeUndefined();
    expect(out.dataCoverage.seen).toEqual(['ce-wechsler-w4-v1']);
  });

  it('۳) payload قدیمی با فرضیهٔ MOOD وزن ۰٫۲ → هیچ فرضیهٔ اضطرابی ساخته نمی‌شود', () => {
    const out = runInference([wechslerEvent({ eventId: 'w1', fsiq: '75', engine: ARIA_ENGINE_OUTPUT })]);
    expect(out.ranked.find((h) => h.targetKey === 'anxiety')).toBeUndefined();
  });

  it('۴) payload قدیمی با main=BIF (تفسیر موازی m98) → هیچ دیرآموزی‌ای از main ساخته نمی‌شود', () => {
    const out = runInference([wechslerEvent({ eventId: 'w1', engine: ARIA_ENGINE_OUTPUT })]);
    // بدون fsiq دستی و بدون profile → هیچ نامزد وکسلری وجود ندارد
    expect(out.ranked.find((h) => h.targetKey === 'slow_learner')).toBeUndefined();
  });

  it('۵) ترکیب با چک‌لیست: SDQ والد زیرمقیاس هیجانی danger → اضطراب فقط از چک‌لیست (w۱) — بدون فرضیهٔ وکسلری', () => {
    const out = runInference([
      wechslerEvent({ eventId: 'w1', fsiq: '75', engine: ARIA_ENGINE_OUTPUT }),
      sdqParentEmoDanger('s1')
    ]);
    // اضطراب = فقط SDQ (w۱) — هیچ تقویت وکسلری اضافه نمی‌شود
    const anx = out.ranked.find((h) => h.targetKey === 'anxiety')!;
    expect(anx.score).toBeCloseTo(1, 5);
    expect(anx.evidenceFa.some((e) => e.includes('زیرمقیاس هیجانی SDQ والد'))).toBe(true);
    expect(anx.evidenceFa.some((e) => e.includes('وکسلر'))).toBe(false);
    // دیرآموزی مستقل روی ۲ می‌ماند (قاعدهٔ خام fsiq)
    expect(out.ranked.find((h) => h.targetKey === 'slow_learner')!.score).toBeCloseTo(2, 5);
  });

  it('شبیه‌سازی آریا (m156) — امتیاز نهایی: دیرآموزی ۲؛ زبان/گفتار و اضطراب ساخته نمی‌شوند', () => {
    const out = runInference([wechslerEvent({ eventId: 'w1', fsiq: '75', engine: ARIA_ENGINE_OUTPUT })]);
    const scores = Object.fromEntries(out.ranked.map((h) => [h.targetKey, h.score]));
    expect(scores['slow_learner']).toBeCloseTo(2, 5);
    expect(scores['speech_language']).toBeUndefined();
    expect(scores['anxiety']).toBeUndefined();
  });
});

/**
 * تست‌های یکپارچگی وکسلر ۴ با موتور شناسایی
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// wechsler-integration.test.ts — پیوند فرم ce-wechsler-w4-v1 (engine_output) با runInference:
// ۱) رفع قاعدهٔ مردهٔ fsiq → دیرآموزی  ۲) تزریق فرضیه‌ها به هدف مرتبط حتی بدون چک‌لیست (گیت hasData)
// ۳) وزن «بالا/متوسط»  ۴) وزن زیر ۰٫۱۸ → هیچ  ۵) جمع‌شدن با شواهد چک‌لیست (smoke)
// سناریوی پایه = دادهٔ واقعی آریا: fsiq ۷۵ / DLD ۰٫۴ / BIF ۰٫۳ / APD ۰٫۲۵ / MOOD ۰٫۲

import { describe, it, expect } from 'vitest';
import { runInference } from '../infer';
import type { EvidenceEvent } from '../types';

// ───────── سازندهٔ رویداد وکسلر ۴ ─────────

/** خروجی موتور تفسیر — مشابه Aria: fsiq=75 و چهار فرضیه */
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

describe('پیوند وکسلر ۴ با موتور شناسایی (Task 39-a)', () => {
  it('۱) فقط رویداد وکسلر (fsiq=۷۵) → دیرآموزی با شاهد «هوشبهر کلی وکسلر در محدودهٔ مرزی» — رفع قاعدهٔ مرده', () => {
    const out = runInference([wechslerEvent({ eventId: 'w1', fsiq: '75' })]);
    const slow = out.ranked.find((h) => h.targetKey === 'slow_learner');
    expect(slow).toBeDefined();
    // fsiq در بازهٔ ۷۰–۸۵ → وزن قاعدهٔ وکسلر = ۲ (instrumentDanger)
    expect(slow!.score).toBeCloseTo(2, 5);
    expect(slow!.evidenceFa.some((e) => e.includes('هوشبهر کلی وکسلر در محدودهٔ مرزی'))).toBe(true);
    expect(out.dataCoverage.seen).toContain('ce-wechsler-w4-v1');
  });

  it('۲) فرضیهٔ DLD وزن ۰٫۴ → زبان/گفتار با شاهد وکسلری «وزن بالا» — بدون هیچ چک‌لیست زبان (گیت hasData)', () => {
    const out = runInference([wechslerEvent({ eventId: 'w1', fsiq: '75', engine: ARIA_ENGINE_OUTPUT })]);
    const speech = out.ranked.find((h) => h.targetKey === 'speech_language');
    expect(speech).toBeDefined();
    expect(speech!.score).toBeCloseTo(2, 5);
    expect(speech!.evidenceFa.some((e) => e.includes('نیم‌رخ وکسلر ۴ با فرضیهٔ «اختلال زبانی (DLD)» هم‌گراست (وزن بالا)'))).toBe(true);
    // اثبات گیت hasData: هیچ رویداد دیگری جز وکسلر در ورودی نیست
    expect(out.dataCoverage.seen).toEqual(['ce-wechsler-w4-v1']);
  });

  it('۳) فرضیهٔ MOOD وزن ۰٫۲ → اضطراب با شاهد «وزن متوسط» (w۱)', () => {
    const out = runInference([wechslerEvent({ eventId: 'w1', fsiq: '75', engine: ARIA_ENGINE_OUTPUT })]);
    const anx = out.ranked.find((h) => h.targetKey === 'anxiety');
    expect(anx).toBeDefined();
    expect(anx!.score).toBeCloseTo(1, 5);
    expect(anx!.evidenceFa.some((e) => e.includes('عامل خلقی/اضطرابی (MOOD)') && e.includes('متوسط'))).toBe(true);
  });

  it('۴) فرضیه با وزن ۰٫۱ (زیر آستانهٔ ۰٫۱۸) → هیچ تقویتی اعمال نمی‌شود', () => {
    const out = runInference([
      wechslerEvent({
        eventId: 'w1',
        engine: { ok: true, hypotheses: [{ id: 'DLD', weight: 0.1 }, { id: 'MOOD', weight: 0.1 }] }
      })
    ]);
    // بدون boost، هدف‌های زبان/اضطراب اصلاً وارد رتبه‌بندی نمی‌شوند (گیت داده رد می‌کند)
    expect(out.ranked.find((h) => h.targetKey === 'speech_language')).toBeUndefined();
    expect(out.ranked.find((h) => h.targetKey === 'anxiety')).toBeUndefined();
    // دیرآموزی هم بدون fsiq و بدون boost امتیازی ندارد
    expect(out.ranked.find((h) => h.targetKey === 'slow_learner')).toBeUndefined();
  });

  it('۵) ترکیب با چک‌لیست: SDQ والد زیرمقیاس هیجانی danger + MOOD → جمع امتیاز (smoke)', () => {
    const out = runInference([
      wechslerEvent({ eventId: 'w1', fsiq: '75', engine: ARIA_ENGINE_OUTPUT }),
      sdqParentEmoDanger('s1')
    ]);
    // اضطراب = SDQ (w۱) + MOOD (w۱) = ۲
    const anx = out.ranked.find((h) => h.targetKey === 'anxiety')!;
    expect(anx.score).toBeCloseTo(2, 5);
    expect(anx.evidenceFa.some((e) => e.includes('زیرمقیاس هیجانی SDQ والد'))).toBe(true);
    expect(anx.evidenceFa.some((e) => e.includes('نیم‌رخ وکسلر ۴'))).toBe(true);
    // دیرآموزی مستقل از SDQ روی ۲ می‌ماند
    expect(out.ranked.find((h) => h.targetKey === 'slow_learner')!.score).toBeCloseTo(2, 5);
  });

  it('شبیه‌سازی آریا — امتیاز نهایی: دیرآموزی ۲، زبان/گفتار ۲، اضطراب ۱', () => {
    const out = runInference([wechslerEvent({ eventId: 'w1', fsiq: '75', engine: ARIA_ENGINE_OUTPUT })]);
    const scores = Object.fromEntries(out.ranked.map((h) => [h.targetKey, h.score]));
    expect(scores['slow_learner']).toBeCloseTo(2, 5);
    expect(scores['speech_language']).toBeCloseTo(2, 5);
    expect(scores['anxiety']).toBeCloseTo(1, 5);
  });
});

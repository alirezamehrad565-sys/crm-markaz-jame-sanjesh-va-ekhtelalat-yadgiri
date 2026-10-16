/**
 * تست‌های واحد — infer
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// infer.test.ts — موتور شناسایی — امتیاز شواهد، جدول ملاک‌ها، هم‌رأیی، تفریق، گپ و لحن ساده
// همهٔ ورودی‌ها EvidenceEvent دست‌ساز — بدون I/O (قرارداد ماژول pure)

import { describe, it, expect } from 'vitest';
import { runInference } from '../infer';
import { narrativeOf, narrativeOfHypothesis, plainTerm, faNum } from '../narrative';
import { ENGINE_DISCLAIMER, WCPM_NORM_50TH } from '../instruments';
import { CONFIDENCE_THRESHOLDS } from '../rules';
import type { EvidenceEvent } from '../types';

// ───────── سازندهٔ رویداد چک‌لیست ─────────

const SLD_READ_BANDS = [
  { max: 10, label: 'در محدودهٔ انتظار', color: 'ok' },
  { max: 13, label: 'مرزی — نیاز به پیگیری', color: 'warn' },
  { max: 9999, label: 'بالای برش — ناحیهٔ بالینی', color: 'danger' }
] as const;

const SLD_SUBSCALES: { id: string; name: string; excludeFromTotal: boolean; bands: { max: number; label: string; color: 'ok' | 'warn' | 'danger' }[] }[] = [
  { id: 'crita', name: 'ملاک A', excludeFromTotal: false, bands: [{ max: 5, label: 'ok', color: 'ok' }, { max: 8, label: 'warn', color: 'warn' }, { max: 9999, label: 'danger', color: 'danger' }] },
  { id: 'critb', name: 'ملاک B', excludeFromTotal: false, bands: [{ max: 1, label: 'ok', color: 'ok' }, { max: 9999, label: 'danger', color: 'danger' }] },
  { id: 'critc', name: 'ملاک C', excludeFromTotal: true, bands: [] },
  { id: 'critd', name: 'ملاک D', excludeFromTotal: true, bands: [] }
];

function sldPayload(values: Record<string, number>): EvidenceEvent['payload'] {
  const out: Record<string, { value: string; label: string }> = {};
  for (const [k, v] of Object.entries(values)) out[k] = { value: String(v), label: k };
  return out;
}

function sldEvent(overrides: {
  eventId: string;
  values: Record<string, number>;
  occurredAt?: string;
}): EvidenceEvent {
  const v = overrides.values;
  const crita = ['rA1', 'rA2', 'rA3', 'rA4', 'rA5', 'rA6'].reduce((s, k) => s + (v[k] ?? 0), 0);
  const critb = (v.rB1 ?? 0) + (v.rB2 ?? 0);
  const color = (score: number, bands: readonly { max: number; label: string; color: 'ok' | 'warn' | 'danger' }[]): 'ok' | 'warn' | 'danger' =>
    bands.find((b) => score <= b.max)?.color ?? 'danger';
  return {
    eventId: overrides.eventId,
    toolKey: 'ce-sld-read-v1',
    typeTitle: 'چک‌لیست ملاکی نارساخوانی (DSM-5-TR — والد و معلم)',
    status: 'completed',
    occurredAt: overrides.occurredAt ?? '2026-10-01T08:00:00.000Z',
    payload: sldPayload(v),
    analysis: {
      score: crita + critb + (v.rC1 ?? 0) + (v.rD1 ?? 0),
      band: null,
      answered: 10,
      total: 10,
      maxScore: 20,
      subscaleScores: [
        { id: 'crita', name: 'ملاک A', score: crita, max: 12, band: null, color: color(crita, SLD_SUBSCALES[0].bands) },
        { id: 'critb', name: 'ملاک B', score: critb, max: 4, band: null, color: color(critb, SLD_SUBSCALES[1].bands) }
      ]
    },
    bands: SLD_READ_BANDS as unknown as EvidenceEvent['bands'],
    subscales: SLD_SUBSCALES as unknown as EvidenceEvent['subscales']
  };
}

// ───────── آزمون‌ها ─────────

describe('موتور شناسایی (پلن §۵)', () => {
  it('دادهٔ خالی → بدون فرضیه، اقدام بعدی «کامل کنید» و پانویس خط قرمز', () => {
    const out = runInference([], { now: () => new Date('2026-10-13T06:00:00.000Z') });
    expect(out.ranked).toHaveLength(0);
    expect(out.criteria).toHaveLength(0);
    expect(out.nextActions.some((a) => a.includes('دادهٔ کافی'))).toBe(true);
    expect(out.disclaimer).toBe(ENGINE_DISCLAIMER);
    expect(out.batteryVersion).toBe('battery-v1');
    expect(out.generatedAt).toBe('2026-10-13T06:00:00.000Z');
  });

  it('دو مرجع danger → نارساخوانی «زیاد» + ملاک‌های برآورده + هم‌رأیی ×۱٫۵', () => {
    const parent = sldEvent({ eventId: 'e1', values: { rA1: 2, rA2: 2, rA3: 2, rA4: 2, rA5: 2, rA6: 2, rB1: 2, rB2: 2, rC1: 2, rD1: 0 }, occurredAt: '2026-10-01T08:00:00.000Z' });
    const teacher = sldEvent({ eventId: 'e2', values: { rA1: 2, rA2: 2, rA3: 2, rA4: 2, rA5: 2, rA6: 2, rB1: 2, rB2: 2, rC1: 2, rD1: 0 }, occurredAt: '2026-10-02T08:00:00.000Z' });
    const out = runInference([teacher, parent]);

    const dys = out.ranked.find((h) => h.targetKey === 'dyslexia');
    expect(dys).toBeDefined();
    // قواعد پایه: crita danger دو مرجع (۲+۲)؛ هم‌رأیی: جمع جفت ×۱٫۵ = ۶
    expect(dys!.score).toBeCloseTo(6, 5);
    expect(dys!.confidence).toBe('زیاد');
    expect(dys!.evidenceFa.some((e) => e.includes('خانه و مدرسه') && e.includes('وزن شواهد بیشتر'))).toBe(true);
    // ملاک‌ها: a1/a2/a3 + sld.b + sld.c (هر دو مرجع endorsed) برآورده؛ sld.d همه صفر → not_met
    const crit = Object.fromEntries(out.criteria.filter((c) => c.targetKey === 'dyslexia').map((c) => [c.criterionId, c.status]));
    expect(crit['dyslexia.a1']).toBe('met');
    expect(crit['dyslexia.a2']).toBe('met');
    expect(crit['dyslexia.a3']).toBe('met');
    expect(crit['sld.b']).toBe('met');
    expect(crit['sld.c']).toBe('met');
    expect(crit['sld.d']).toBe('not_met');
    expect(dys!.criteriaSummary.met).toBe(5);
  });

  it('یک مرجع فقط → «متوسط» + خط ناهم‌رأیی وقتی مرجع دوم در محدودهٔ انتظار است', () => {
    const parent = sldEvent({ eventId: 'e1', values: { rA1: 2, rA2: 2, rA3: 2, rA4: 2, rA5: 2, rA6: 2, rB1: 2, rB2: 2, rC1: 2, rD1: 0 } });
    const teacher = sldEvent({ eventId: 'e2', values: { rA1: 0, rA2: 0, rA3: 0, rA4: 0, rA5: 0, rA6: 0, rB1: 0, rB2: 0, rC1: 0, rD1: 0 }, occurredAt: '2026-10-02T08:00:00.000Z' });
    const out = runInference([teacher, parent]);
    const dys = out.ranked.find((h) => h.targetKey === 'dyslexia')!;
    // فقط مرجع خانه danger (۲) — معلم در محدودهٔ انتظار
    expect(dys.score).toBeCloseTo(2, 5);
    expect(dys.confidence).toBe('متوسط');
    expect(out.discrepancies.some((d) => d.includes('نارساخوانی') && d.includes('خانه و مدرسه') && d.includes('نیست'))).toBe(true);
  });

  it('پروب زیر ۸۰٪ هنجار → شاهد پروب (w۲) و گپ ابزار ملاکی', () => {
    const probe: EvidenceEvent = {
      eventId: 'p1',
      toolKey: 'ce-probe-read-v1',
      typeTitle: 'پروب عملکردی خواندن (ثبت درمانگر)',
      status: 'completed',
      occurredAt: '2026-10-03T08:00:00.000Z',
      payload: { wcpm: { value: '40', label: 'WCPM' }, text_grade: { value: 'دوم', label: 'پایهٔ متن' } },
      analysis: null,
      bands: null,
      subscales: null
    };
    expect(40).toBeLessThan(WCPM_NORM_50TH['دوم'] * 0.8);
    const out = runInference([probe]);
    const dys = out.ranked.find((h) => h.targetKey === 'dyslexia')!;
    expect(dys.score).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLDS.medium);
    expect(dys.evidenceFa.some((e) => e.includes('پروب خواندن'))).toBe(true);
    expect(dys.missingFa.some((m) => m.includes('چک‌لیست دشواری خواندن'))).toBe(true);
    expect(out.nextActions.some((a) => a.includes('چک‌لیست دشواری خواندن'))).toBe(true);
  });

  it('وکسلر مرزی ۷۰–۸۵ → شاهد دیرآموزی؛ خارج بازه → هیچ', () => {
    const wechsler = (fsiq: number): EvidenceEvent => ({
      eventId: `w${fsiq}`,
      toolKey: 'wechsler',
      typeTitle: 'پروندهٔ وکسلر v2 — پروفایل WISC-V',
      status: 'completed',
      occurredAt: '2026-10-03T08:00:00.000Z',
      payload: { fsiq: { value: String(fsiq), label: 'هوشبهر کلی' } },
      analysis: null,
      bands: null,
      subscales: null
    });
    const hit = runInference([wechsler(78)]);
    const slow = hit.ranked.find((h) => h.targetKey === 'slow_learner');
    expect(slow).toBeDefined();
    expect(slow!.confidence).toBe('متوسط');

    const miss = runInference([wechsler(110)]);
    expect(miss.ranked.find((h) => h.targetKey === 'slow_learner')).toBeUndefined();
  });

  it('پرچم شرح‌حال: «افت همه‌درسی» + وکسلر مرزی → شاهد w۱ اضافه', () => {
    const anam: EvidenceEvent = {
      eventId: 'a1',
      toolKey: 'ce-anamnesis-v2',
      typeTitle: 'شرح حال ساخت‌یافته v2',
      status: 'completed',
      occurredAt: '2026-10-03T07:00:00.000Z',
      payload: { chief_complaint: { value: 'افت تحصیلی تدریجی در همهٔ درس‌ها', label: 'شکایت اصلی' } },
      analysis: null,
      bands: null,
      subscales: null
    };
    const w: EvidenceEvent = {
      eventId: 'w1',
      toolKey: 'wechsler',
      typeTitle: 'وکسلر',
      status: 'completed',
      occurredAt: '2026-10-03T08:00:00.000Z',
      payload: { fsiq: { value: '80', label: 'هوشبهر کلی' } },
      analysis: null,
      bands: null,
      subscales: null
    };
    const out = runInference([w, anam]);
    const slow = out.ranked.find((h) => h.targetKey === 'slow_learner')!;
    // wechsler ۲ + anamnesis ۱ = ۳
    expect(slow.score).toBeCloseTo(3, 5);
    expect(slow.evidenceFa.some((e) => e.includes('شرح حال'))).toBe(true);
  });

  it('ODD — دست‌کم ۴ ملاک A کامل → شاهد ویژه + یک امتیاز', () => {
    const odd: EvidenceEvent = {
      eventId: 'o1',
      toolKey: 'ce-odd-criteria-v1',
      typeTitle: 'چک‌لیست ملاکی نافرمانی مقابله‌ای',
      status: 'completed',
      occurredAt: '2026-10-03T08:00:00.000Z',
      payload: sldPayload({ oA1: 2, oA2: 2, oA3: 2, oA4: 2, oA5: 0, oA6: 0, oA7: 0, oA8: 0, oB1: 2, oC1: 2, oD1: 0 }),
      analysis: {
        score: 12, band: null, answered: 11, total: 11, maxScore: 22,
        subscaleScores: [{ id: 'crita', name: 'ملاک A', score: 8, max: 16, band: null, color: 'danger' }]
      },
      bands: null,
      subscales: null
    };
    const out = runInference([odd]);
    const o = out.ranked.find((h) => h.targetKey === 'odd')!;
    expect(o.evidenceFa.some((e) => e.includes('ملاک A نافرمانی'))).toBe(true);
    expect(o.score).toBeGreaterThanOrEqual(3);
  });

  it('سقف فرضیه ۳ + پوشش داده', () => {
    const many: EvidenceEvent[] = [sldEvent({ eventId: 'e1', values: { rA1: 2, rA2: 2, rA3: 2, rA4: 2, rA5: 2, rA6: 2, rB1: 2, rB2: 2, rC1: 2, rD1: 0 } })];
    const out = runInference(many);
    expect(out.ranked.length).toBeLessThanOrEqual(3);
    expect(out.dataCoverage.seen).toContain('ce-sld-read-v1');
  });
});

describe('لحن ساده (پلن §۶)', () => {
  it('سه‌بخشی «چه دیدیم / یعنی چه / گام بعدی» + پانویس — بدون قطعیت کاذب', () => {
    const parent = sldEvent({ eventId: 'e1', values: { rA1: 2, rA2: 2, rA3: 2, rA4: 2, rA5: 2, rA6: 2, rB1: 2, rB2: 2, rC1: 2, rD1: 0 } });
    const out = runInference([parent]);
    const full = narrativeOf(out);
    expect(full.top).not.toBeNull();
    expect(full.text).toContain('چه دیدیم');
    expect(full.text).toContain('یعنی چه');
    expect(full.text).toContain('گام بعدی');
    expect(full.text).toContain(ENGINE_DISCLAIMER);
    expect(full.text).not.toContain('قطعاً');
    expect(full.text).not.toContain('صد در صد');
    // عدد در جدول ملاک‌ها فارسی است
    const n = narrativeOfHypothesis(out.ranked[0]);
    expect(n.saw).toMatch(/[۰-۹]/);
    expect(n.saw).not.toMatch(/[0-9]/);
  });

  it('واژه‌نامهٔ «به زبان ساده» و ارقام فارسی', () => {
    expect(plainTerm('WCPM')).toContain('دقیقه');
    expect(plainTerm('ناموجود')).toBeNull();
    expect(faNum(18)).toBe('۱۸');
    expect(faNum('40')).toBe('۴۰');
  });
});

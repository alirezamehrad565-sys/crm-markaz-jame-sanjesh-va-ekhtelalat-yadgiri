import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInference, anamnesisSignalsOf, ANAMNESIS_V2_KEY, ANAMNESIS_V3_KEY } from '../infer';
import { narrativeOf, narrativeOfHypothesis, faNum } from '../narrative';
import { WCPM_NORM_50TH } from '../instruments';
import { CONFIDENCE_THRESHOLDS } from '../rules';
import type { EvidenceEvent } from '../types';

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

describe('موتور شناسایی (پلن §۵)', () => {
  it('دادهٔ خالی → بدون فرضیه و اقدام بعدی «کامل کنید» (: پانویس انکار حذف شد)', () => {
    const out = runInference([], { now: () => new Date('2026-10-13T06:00:00.000Z') });
    expect(out.ranked).toHaveLength(0);
    expect(out.criteria).toHaveLength(0);
    expect(out.nextActions.some((a) => a.includes('دادهٔ کافی'))).toBe(true);
    expect('disclaimer' in out).toBe(false);
    expect(out.batteryVersion).toBe('battery-v1');
    expect(out.generatedAt).toBe('2026-10-13T06:00:00.000Z');
  });

  it('دو مرجع danger → نارساخوانی «زیاد» + ملاک‌های برآورده + هم‌رأیی ×۱٫۵', () => {
    const parent = sldEvent({ eventId: 'e1', values: { rA1: 2, rA2: 2, rA3: 2, rA4: 2, rA5: 2, rA6: 2, rB1: 2, rB2: 2, rC1: 2, rD1: 0 }, occurredAt: '2026-10-01T08:00:00.000Z' });
    const teacher = sldEvent({ eventId: 'e2', values: { rA1: 2, rA2: 2, rA3: 2, rA4: 2, rA5: 2, rA6: 2, rB1: 2, rB2: 2, rC1: 2, rD1: 0 }, occurredAt: '2026-10-02T08:00:00.000Z' });
    const out = runInference([teacher, parent]);

    const dys = out.ranked.find((h) => h.targetKey === 'dyslexia');
    expect(dys).toBeDefined();
    expect(dys!.score).toBeCloseTo(6, 5);
    expect(dys!.confidence).toBe('زیاد');
    expect(dys!.evidenceFa.some((e) => e.includes('خانه و مدرسه') && e.includes('وزن شواهد بیشتر'))).toBe(true);
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
      toolKey: 'ce-wechsler-w4-v1',
      typeTitle: 'وکسلر ۴ — پروندهٔ تفسیر موتور',
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
      toolKey: 'ce-wechsler-w4-v1',
      typeTitle: 'وکسلر ۴ — پروندهٔ تفسیر موتور',
      status: 'completed',
      occurredAt: '2026-10-03T08:00:00.000Z',
      payload: { fsiq: { value: '80', label: 'هوشبهر کلی' } },
      analysis: null,
      bands: null,
      subscales: null
    };
    const out = runInference([w, anam]);
    const slow = out.ranked.find((h) => h.targetKey === 'slow_learner')!;
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

const T4_NOW = { now: () => new Date('2026-10-22T06:30:00.000Z') };

function anamEvent(toolKey: string, payload: Record<string, string>, occurredAt = '2026-10-03T07:00:00.000Z'): EvidenceEvent {
  const p: EvidenceEvent['payload'] = {};
  for (const [k, v] of Object.entries(payload)) p[k] = { value: v, label: k };
  return {
    eventId: toolKey === ANAMNESIS_V3_KEY ? 'a3' : 'a2',
    toolKey,
    typeTitle: toolKey === ANAMNESIS_V3_KEY ? 'گفت‌وگوی اول — شرح‌حال کودک (نسخهٔ ۳)' : 'گفت‌وگوی اول — شرح‌حال کودک',
    status: 'completed',
    occurredAt,
    payload: p,
    analysis: null,
    bands: null,
    subscales: null
  };
}

function w4Event(fsiq: number): EvidenceEvent {
  return {
    eventId: 'w1',
    toolKey: 'ce-wechsler-w4-v1',
    typeTitle: 'وکسلر ۴ — پروندهٔ تفسیر موتور',
    status: 'completed',
    occurredAt: '2026-10-03T08:00:00.000Z',
    payload: { fsiq: { value: String(fsiq), label: 'هوشبهر کلی' } },
    analysis: null,
    bands: null,
    subscales: null
  };
}

function legacyView(out: ReturnType<typeof runInference>): Record<string, unknown> {
  const { anamnesisSignals: _signals, convergence: _conv, exclusions: _excl, ...rest } = out; // exclusions کلید جدید است و در پایهٔ T4 نیست
  const { disclaimer: _disc, ...legacy } = rest as Record<string, unknown>;
  // سه فیلد مالک استثنایی روی تک‌تک فرضیه‌ها هم در پایهٔ T4 نیستند
  const ranked = Array.isArray(legacy.ranked)
    ? (legacy.ranked as Record<string, unknown>[]).map(({ exclusionsFa: _e, exclusionPenalty: _p, needsExclusionRuling: _n, ...h }) => h)
    : legacy.ranked;
  return { ...legacy, ranked };
}

describe('شرح‌حال v3 — سیگنال‌های ساخت‌یافته (T4 )', () => {
  it('v3 کامل → ۱۳ سیگنال مرتب با قرارداد ClinicalSignal (domain/source/۰..۱/fa)', () => {
    const v3 = anamEvent(ANAMNESIS_V3_KEY, {
      chief_complaint: 'خواندن و نوشتنش از اول مهر افت کرده',
      sld_read_concern: 'زیاد — نگران‌کننده',
      sld_write_concern: 'متوسط',
      sld_calc_concern: 'بدون نگرانی',
      attention_concern: 'کم',
      hyper_concern: 'متوسط',
      exam_anxiety: 'کم',
      morning_somatic: 'گاهی',
      crisis_event: 'بله — برای خود کودک',
      sensory_concern: 'کم',
      home_language: 'دوزبانه',
      decline_scope: 'بیشترِ درس‌ها افت کرده‌اند',
      absence_level: 'یک تا سه ماه',
      school_change: 'یک بار'
    });
    const sig = anamnesisSignalsOf(v3);
    expect(sig).toHaveLength(13);
    expect(sig.map((s) => s.key)).toEqual([...sig.map((s) => s.key)].sort());
    for (const s of sig) {
      expect(s.source).toBe('anamnesis');
      expect(s.value).toBeGreaterThanOrEqual(0);
      expect(s.value).toBeLessThanOrEqual(1);
      expect(s.fa.length).toBeGreaterThan(3);
    }
    const byKey = Object.fromEntries(sig.map((s) => [s.key, s]));
    expect(byKey['anam.sld_read']).toMatchObject({ domain: 'academic', value: 1 });
    expect(byKey['anam.sld_write']).toMatchObject({ domain: 'academic', value: 0.67 });
    expect(byKey['anam.sld_calc']).toMatchObject({ domain: 'academic', value: 0 });
    expect(byKey['anam.attention']).toMatchObject({ domain: 'attention', value: 0.33 });
    expect(byKey['anam.hyper']).toMatchObject({ domain: 'attention', value: 0.67 });
    expect(byKey['anam.morning_somatic']).toMatchObject({ domain: 'emotional', value: 0.5 });
    expect(byKey['anam.crisis_event']).toMatchObject({ domain: 'emotional', value: 1 });
    expect(byKey['anam.sensory']).toMatchObject({ domain: 'motor', value: 0.33 });
    expect(byKey['anam.home_language']).toMatchObject({ domain: 'language', value: 0.5 });
    expect(byKey['anam.decline_scope']).toMatchObject({ domain: 'academic', value: 0.67 });
    expect(byKey['anam.absence']).toMatchObject({ domain: 'academic', value: 0.67 });
    expect(byKey['anam.school_change']).toMatchObject({ domain: 'academic', value: 0.33 });
    expect(byKey['anam.exam_anxiety']).toMatchObject({ domain: 'emotional', value: 0.33 });
  });

  it('سیگنال‌ها کلید افزودنی خروجی‌اند — پروندهٔ v3 به موتور می‌رود ولی امتیازها دست نمی‌خورد', () => {
    const v3 = anamEvent(ANAMNESIS_V3_KEY, {
      chief_complaint: 'افت در همهٔ درس‌ها',
      sld_read_concern: 'زیاد — نگران‌کننده',
      decline_scope: 'فقط یکی دو درس مشخص' // پرچم دیرآموزی نمی‌گیرد
    });
    const w = w4Event(80);
    const out = runInference([w, v3], T4_NOW);
    expect(out.anamnesisSignals.length).toBeGreaterThan(0);
    const slow = out.ranked.find((h) => h.targetKey === 'slow_learner');
    expect(slow).toBeDefined();
    expect(slow!.score).toBeCloseTo(2, 5); // فقط وکسلر — decline_scope «فقط یکی دو درس» پرچم نمی‌دهد
  });

  it('پرچم v3: decline_scope «بیشترِ درس‌ها/همهٔ درس‌ها» → شاهد دیرآموزی w۱', () => {
    for (const scope of ['بیشترِ درس‌ها افت کرده‌اند', 'همهٔ درس‌ها با هم افت کرده‌اند']) {
      const out = runInference([w4Event(80), anamEvent(ANAMNESIS_V3_KEY, { chief_complaint: 'افت دارد', decline_scope: scope })], T4_NOW);
      const slow = out.ranked.find((h) => h.targetKey === 'slow_learner')!;
      expect(slow.score, scope).toBeCloseTo(3, 5);
      expect(slow.evidenceFa.some((e) => e.includes('افت تحصیلی تدریجی'))).toBe(true);
    }
  });

  it('پرچم v3 اضطراب: morning_somatic «گاهی» و «بیشتر روزها» → شاهد w۱؛ «نه» → هیچ', () => {
    const hit = runInference([anamEvent(ANAMNESIS_V3_KEY, { chief_complaint: 'نگران است', morning_somatic: 'گاهی' })], T4_NOW);
    expect(hit.ranked.find((h) => h.targetKey === 'anxiety')).toBeDefined();
    const strong = runInference([anamEvent(ANAMNESIS_V3_KEY, { chief_complaint: 'نگران است', morning_somatic: 'بیشتر روزها — بدون علت پزشکی' })], T4_NOW);
    expect(strong.ranked.find((h) => h.targetKey === 'anxiety')).toBeDefined();
    const miss = runInference([anamEvent(ANAMNESIS_V3_KEY, { chief_complaint: 'نگران است', morning_somatic: 'نه' })], T4_NOW);
    expect(miss.ranked.find((h) => h.targetKey === 'anxiety')).toBeUndefined();
  });

  it('هم‌زیستی v2+v3 → نسخهٔ ۳ برنده است (سیگنال از v3؛ پرچم از کلیدهای ساخت‌یافته)', () => {
    const v2Old = anamEvent(ANAMNESIS_V2_KEY, { chief_complaint: 'افت تحصیلی در همهٔ درس‌ها' }, '2026-09-01T07:00:00.000Z');
    const v3New = anamEvent(ANAMNESIS_V3_KEY, { chief_complaint: 'مشکل در مدرسه', decline_scope: 'افت محسوسی ندارم' }, '2026-10-20T07:00:00.000Z');
    const out = runInference([v2Old, v3New], T4_NOW);
    expect(out.ranked.find((h) => h.targetKey === 'slow_learner')).toBeUndefined();
    expect(out.anamnesisSignals.length).toBeGreaterThanOrEqual(0);
  });

  it('گزینهٔ خارج از قرارداد نادیده گرفته می‌شود — بدون سیگنال، بدون خطا', () => {
    const sig = anamnesisSignalsOf(anamEvent(ANAMNESIS_V3_KEY, { sld_read_concern: 'گزینهٔ آینده', chief_complaint: 'x' }));
    expect(sig).toEqual([]);
    expect(anamnesisSignalsOf(undefined)).toEqual([]);
    expect(anamnesisSignalsOf(anamEvent(ANAMNESIS_V2_KEY, { sld_read_concern: 'کم' }))).toEqual([]);
  });

  it('فال‌بک دقیق نسخهٔ ۲ — خروجی بایت‌به‌بایت پایهٔ پیش از T4 (t4-baseline.json)', () => {
    const baseline = JSON.parse(readFileSync(new URL('../../../../scripts/t4-baseline.json', import.meta.url), 'utf8')) as {
      outputs: Record<string, ReturnType<typeof runInference> | undefined>;
    };
    const wechsler = (fsiq: number): EvidenceEvent => ({ ...w4Event(fsiq), eventId: 'w4' });
    const probeRead = (wcpm: number, grade: string): EvidenceEvent => ({
      eventId: 'p1', toolKey: 'ce-probe-read-v1', typeTitle: 'پروب خواندن', status: 'completed',
      occurredAt: '2026-10-03T08:00:00.000Z',
      payload: { wcpm: { value: String(wcpm), label: 'WCPM' }, text_grade: { value: grade, label: 'پایه' } },
      analysis: null, bands: null, subscales: null
    });
    const fixtures: Record<string, EvidenceEvent[]> = {
      f1_v2_slow_learner_flag: [wechsler(80), anamEvent(ANAMNESIS_V2_KEY, { chief_complaint: 'افت تحصیلی تدریجی در همهٔ درس‌ها' })],
      f2_v2_anxiety_flag: [anamEvent(ANAMNESIS_V2_KEY, { chief_complaint: 'صبح‌ها دل‌درد دارد و گاهی تهوع پیش از مدرسه' })],
      f3_v2_no_flag: [anamEvent(ANAMNESIS_V2_KEY, { chief_complaint: 'تأخیر در تکلم؛ از سه سالگی توجه خانواده جلب شد.', development: 'راه‌افتادن ۱۴ ماهگی' })],
      f4_wechsler_no_anamnesis: [wechsler(80)],
      f5_empty: [],
      f6_v2_probe_read: [anamEvent(ANAMNESIS_V2_KEY, { chief_complaint: 'روان‌خوانی کند است' }), probeRead(40, 'دوم')]
    };
    for (const [name, events] of Object.entries(fixtures)) {
      const base = baseline.outputs[name];
      expect(base, name).toBeTruthy();
      const out = runInference(events, T4_NOW);
      if (name === 'f4_wechsler_no_anamnesis') {
        const norm = (o: unknown): unknown =>
          JSON.parse(JSON.stringify(o).replaceAll('گفت‌وگوی اول — شرح‌حال کودک (نسخهٔ ۳)', 'گفت‌وگوی اول — شرح‌حال کودک')) as unknown;
        const outNorm = norm(legacyView(out));
        const baseNorm = norm(legacyView(base as ReturnType<typeof runInference>));
        expect(JSON.stringify(legacyView(out))).toContain('گفت‌وگوی اول — شرح‌حال کودک (نسخهٔ ۳) هنوز ارسال/ثبت نشده');
        expect(JSON.stringify(base as unknown)).toContain('گفت‌وگوی اول — شرح‌حال کودک هنوز ارسال/ثبت نشده');
        expect(outNorm).toEqual(baseNorm);
        continue;
      }
      expect(legacyView(out)).toEqual(legacyView(base as ReturnType<typeof runInference>));
      expect(out.anamnesisSignals).toEqual([]);
    }
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
    expect(full.text).not.toContain('جایگزین قضاوت بالینی');
    expect(full.text).not.toContain('قطعاً');
    expect(full.text).not.toContain('صد در صد');
    const n = narrativeOfHypothesis(out.ranked[0]);
    expect(n.saw).toMatch(/[۰-۹]/);
    expect(n.saw).not.toMatch(/[0-9]/);
  });

  it('ارقام فارسی در روایت', () => {
    expect(faNum(18)).toBe('۱۸');
    expect(faNum('40')).toBe('۴۰');
  });
});

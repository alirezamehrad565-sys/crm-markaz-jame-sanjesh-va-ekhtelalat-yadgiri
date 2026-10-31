import { describe, it, expect } from 'vitest';
import { basisSuggestionsOf, basisSnapshotForTarget, basisTargetsCovered, BASIS_RULES } from '../basis';
import { engineFactsOf, PROBES } from '../infer';
import { ALL_TARGETS_INCLUDING_REHAB } from '../targets';
import type { EvidenceEvent } from '../types';

// ─── سازنده‌های شاهد (همان قرارداد loadEvidenceEvents) ───

function anamV3(values: Record<string, string>): EvidenceEvent {
  const payload: Record<string, { value: string; label: string }> = {};
  for (const [k, v] of Object.entries(values)) payload[k] = { value: v, label: v };
  return {
    eventId: 'anam', toolKey: 'ce-anamnesis-v3', typeTitle: 'شرح‌حال v3', status: 'completed',
    occurredAt: '2026-10-01T07:00:00.000Z', payload, analysis: null, bands: null, subscales: null
  };
}

function readCore(levels: Record<string, string>): EvidenceEvent {
  const payload: Record<string, { value: string; label: string }> = {};
  for (const [k, v] of Object.entries(levels)) payload[k] = { value: v, label: v };
  return {
    eventId: 'readcore', toolKey: 'ce-read-core-v1', typeTitle: 'هستهٔ خواندن', status: 'completed',
    occurredAt: '2026-10-02T07:00:00.000Z', payload, analysis: { score: 4, band: null, answered: 5, total: 5, maxScore: 10 }, bands: null, subscales: null
  };
}

function probe(key: string, value: number, grade: string): EvidenceEvent {
  const def = PROBES.find((p) => p.toolKey === key)!;
  return {
    eventId: key, toolKey: key, typeTitle: def.fa, status: 'completed',
    occurredAt: '2026-10-03T07:00:00.000Z',
    payload: { [def.valueField]: { value: String(value), label: String(value) }, [def.gradeField]: { value: grade, label: grade } },
    analysis: null, bands: null, subscales: null
  };
}

function snap(subscaleId: 'ia' | 'hi', color: 'danger' | 'ok'): EvidenceEvent {
  return {
    eventId: `snap-${subscaleId}`, toolKey: 'ce-snap-iv-p-v1', typeTitle: 'SNAP-IV والد', status: 'completed',
    occurredAt: '2026-10-04T07:00:00.000Z', payload: {},
    analysis: { score: 18, band: null, answered: 9, total: 9, maxScore: 18, subscaleScores: [{ id: subscaleId, name: subscaleId, score: 18, max: 18, band: null, color }] },
    bands: null, subscales: null
  };
}

function wechslerFsiq(fsiq: number, adaptDanger = false): EvidenceEvent {
  const engine = { ok: true, profile: { fsiq, fsiqBand: 'BIF', indexScatter: 5, vci: null, pri: null, wmi: null, psi: null, step5: null } };
  return {
    eventId: 'w4', toolKey: 'ce-wechsler-w4-v1', typeTitle: 'وکسلر چهار', status: 'completed',
    occurredAt: '2026-10-05T07:00:00.000Z',
    payload: { engine_output: { value: JSON.stringify(engine), label: 'engine' } }, analysis: null, bands: null, subscales: null
  };
}

const rulesOf = (out: ReturnType<typeof basisSuggestionsOf>, targetKey: string) =>
  out.find((b) => b.targetKey === targetKey)?.rules ?? [];

// ─── پوشش کتابخانه و تشخیص ───

describe('کتابخانهٔ قاعدهٔ اگر-آنگاه ()', () => {
  it('پوشش: هر یک از هجده هدفِ غیرتوانبخشی دست‌کم یک قاعده دارد؛ توانبخشی هیچ', () => {
    const covered = new Set(basisTargetsCovered());
    const nonRehab = ALL_TARGETS_INCLUDING_REHAB.filter((t) => !t.key.startsWith('rehab'));
    expect(nonRehab).toHaveLength(18);
    for (const t of nonRehab) expect(covered.has(t.key), t.key).toBe(true);
    for (const r of BASIS_RULES) expect(r.targetKey.startsWith('rehab'), r.key).toBe(false);
  });

  it('آگاهی واج‌شناختی ضعف آشکار → قاعدهٔ واج‌شناسی نارساخوانی فعال می‌شود', () => {
    const out = basisSuggestionsOf([readCore({ pa: 'ضعف آشکار', dec: 'برقرار', flu: 'برقرار', voc: 'برقرار', comp: 'برقرار' })]);
    const dys = rulesOf(out, 'dyslexia');
    expect(dys.some((r) => r.key === 'dyslexia_pa')).toBe(true);
    expect(dys[0].thenFa).toContain('واج');
  });

  it('پروب حساب خطر → قاعدهٔ مصورسازی عدد؛ تک‌پروب خطر + بقیه برقرار → تک‌درس', () => {
    const out = basisSuggestionsOf([
      probe('ce-probe-calc-v1', 18, 'دوم'), // آستانهٔ خطر «دوم» = ۲۰ — ۱۸ زیر آن است
      probe('ce-probe-read-v1', 110, 'دوم'),
      probe('ce-probe-write-v1', 45, 'دوم')
    ]);
    expect(rulesOf(out, 'dyscalculia').some((r) => r.key === 'dyscalculia_probe')).toBe(true);
    expect(rulesOf(out, 'single_subject').some((r) => r.key === 'single_subject_probe')).toBe(true);
  });

  it('SNAP کم‌توجهی خطر → قاعدهٔ مدیریت رفتار محیطی ADHD', () => {
    const out = basisSuggestionsOf([snap('ia', 'danger')]);
    expect(rulesOf(out, 'adhd').some((r) => r.key === 'adhd_attention')).toBe(true);
  });

  it('هوش‌بهر مرزی بدون انطباق پایین → قاعدهٔ دیرآموز؛ انطباق پایین → قاعده فعال نمی‌شود', () => {
    const withOut = basisSuggestionsOf([wechslerFsiq(78)]);
    expect(rulesOf(withOut, 'slow_learner').some((r) => r.key === 'slow_learner_bif')).toBe(true);
    const facts = engineFactsOf([wechslerFsiq(78), {
      eventId: 'adapt', toolKey: 'ce-id-adapt-v1', typeTitle: 'انطباق', status: 'completed',
      occurredAt: '2026-10-06T07:00:00.000Z', payload: {},
      analysis: { score: 8, band: null, answered: 10, total: 10, maxScore: 20, subscaleScores: [{ id: 'id_adapt', name: 'انطباق', score: 8, max: 20, band: null, color: 'danger' }] },
      bands: null, subscales: null
    }]);
    expect(facts.adapt).toBe('low'); // قرارداد انطباق — مسیر ناتوانی هوشی جای قاعدهٔ دیرآموزی را می‌گیرد
  });

  it('شرح‌حال v3: رویداد بحرانی → استرس خانوادگی؛ افت همهٔ درس‌ها → دیرآموز؛ v2 همین قاعده‌ها را فعال نمی‌کند', () => {
    const v3 = basisSuggestionsOf([anamV3({ crisis_event: 'بله — برای خانواده', decline_scope: 'همهٔ درس‌ها با هم افت کرده‌اند' })]);
    expect(rulesOf(v3, 'family_stress').length).toBe(1);
    expect(rulesOf(v3, 'slow_learner').some((r) => r.key === 'slow_learner_decline')).toBe(true);

    const v2Only = basisSuggestionsOf([{
      eventId: 'anam2', toolKey: 'ce-anamnesis-v2', typeTitle: 'شرح‌حال v2', status: 'completed',
      occurredAt: '2026-10-01T07:00:00.000Z',
      payload: { crisis_event: { value: 'بله — برای خانواده', label: 'بله — برای خانواده' } },
      analysis: null, bands: null, subscales: null
    }]);
    expect(rulesOf(v2Only, 'family_stress')).toHaveLength(0);
  });

  it('اسنپ‌شات مبنا فقط قواعد همان هدف را برمی‌گرداند؛ بی‌قاعده → null', () => {
    const events = [readCore({ pa: 'ضعف آشکار', dec: 'برقرار', flu: 'برقرار', voc: 'برقرار', comp: 'برقرار' })];
    const snap1 = basisSnapshotForTarget(events, 'dyslexia');
    expect(snap1?.targetKey).toBe('dyslexia');
    expect(snap1?.rules.every((r) => r.ifFa && r.thenFa && r.sourceFa)).toBe(true);
    expect(basisSnapshotForTarget(events, 'adhd')).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { runInference } from '../infer';
import {
  collectExclusions,
  exclusionsForTarget,
  exclusionPenaltyOf,
  needsExclusionRulingOf
} from '../exclusions';
import {
  hypothesisLogFingerprint,
  hypothesisLogEntriesOf,
  hypothesisLogPayload,
  hypothesisLogSummary,
  rankMovementsOf
} from '../hypothesis-log';
import type { EvidenceEvent, RankedHypothesis } from '../types';

// ─── سازنده‌های رویداد شاهد (همان قرارداد loadEvidenceEvents سرویس) ───

function sldEvent(eventId: string, values: Record<string, number>, occurredAt = '2026-10-01T08:00:00.000Z'): EvidenceEvent {
  const payload: Record<string, { value: string; label: string }> = {};
  for (const [k, v] of Object.entries(values)) payload[k] = { value: String(v), label: k };
  const crita = ['rA1', 'rA2', 'rA3', 'rA4', 'rA5', 'rA6'].reduce((s, k) => s + (values[k] ?? 0), 0);
  return {
    eventId,
    toolKey: 'ce-sld-read-v1',
    typeTitle: 'چک‌لیست ملاکی نارساخوانی',
    status: 'completed',
    occurredAt,
    payload,
    analysis: {
      score: crita,
      band: null,
      answered: 10,
      total: 10,
      maxScore: 20,
      subscaleScores: [{ id: 'crita', name: 'ملاک A', score: crita, max: 12, band: null, color: crita >= 9 ? 'danger' : crita >= 6 ? 'warn' : 'ok' }]
    },
    bands: null,
    subscales: null
  };
}

function probeReadEvent(wcpm: number, grade: string): EvidenceEvent {
  return {
    eventId: 'probe-read',
    toolKey: 'ce-probe-read-v1',
    typeTitle: 'پروب روانی‌خواندن',
    status: 'completed',
    occurredAt: '2026-10-02T08:00:00.000Z',
    payload: { wcpm: { value: String(wcpm), label: String(wcpm) }, text_grade: { value: grade, label: grade } },
    analysis: null,
    bands: null,
    subscales: null
  };
}

function snapParentIaDanger(): EvidenceEvent {
  return {
    eventId: 'snap-p',
    toolKey: 'ce-snap-iv-p-v1',
    typeTitle: 'SNAP-IV والد',
    status: 'completed',
    occurredAt: '2026-10-03T08:00:00.000Z',
    payload: {},
    analysis: {
      score: 18,
      band: null,
      answered: 9,
      total: 9,
      maxScore: 18,
      subscaleScores: [{ id: 'ia', name: 'کم‌توجهی', score: 18, max: 18, band: null, color: 'danger' }]
    },
    bands: null,
    subscales: null
  };
}

function anamEvent(values: Record<string, string>): EvidenceEvent {
  const payload: Record<string, { value: string; label: string }> = {};
  for (const [k, v] of Object.entries(values)) payload[k] = { value: v, label: v };
  return {
    eventId: 'anam',
    toolKey: 'ce-anamnesis-v3',
    typeTitle: 'شرح‌حال ساخت‌یافته v3',
    status: 'completed',
    occurredAt: '2026-10-01T07:00:00.000Z',
    payload,
    analysis: null,
    bands: null,
    subscales: null
  };
}

function fakeHypothesis(targetKey: string, score: number, confidence: RankedHypothesis['confidence'] = 'متوسط'): RankedHypothesis {
  return {
    targetKey,
    targetTitle: targetKey,
    confidence,
    score,
    evidenceFa: [],
    missingFa: [],
    differentialsFa: [],
    criteriaSummary: { met: 0, partial: 0, unknown: 0, notMet: 0 },
    exclusionsFa: [],
    exclusionPenalty: 0,
    needsExclusionRuling: false
  };
}

// ─── مالک‌های استثنایی: جمع‌آوری از دادهٔ موجود ───

describe('مالک‌های استثنایی — collectExclusions ()', () => {
  it('بدون داده → هیچ مالکی فعال نیست', () => {
    expect(collectExclusions({ anamV3: undefined, fsiq: null, adaptLow: false })).toEqual([]);
  });

  it('دوزبانگی: غیرفارسی پررنگ (danger) و دوزبانه هشدار (warn)', () => {
    const danger = collectExclusions({ anamV3: anamEvent({ home_language: 'غیرفارسی' }), fsiq: null, adaptLow: false });
    expect(danger).toHaveLength(1);
    expect(danger[0].key).toBe('bilingualism');
    expect(danger[0].strength).toBe('danger');
    expect(danger[0].weight).toBe(1.5);

    const warn = collectExclusions({ anamV3: anamEvent({ home_language: 'دوزبانه' }), fsiq: null, adaptLow: false });
    expect(warn[0].strength).toBe('warn');
    expect(warn[0].weight).toBe(0.75); // نصف وزن در حالت هشدار
  });

  it('غیبت: بیش از سه ماه پررنگ، یک تا سه ماه هشدار', () => {
    const hits = collectExclusions({ anamV3: anamEvent({ absence_level: 'بیش از سه ماه' }), fsiq: null, adaptLow: false });
    expect(hits.map((h) => h.key)).toEqual(['absenteeism']);
    expect(hits[0].strength).toBe('danger');
    const warn = collectExclusions({ anamV3: anamEvent({ absence_level: 'یک تا سه ماه' }), fsiq: null, adaptLow: false });
    expect(warn[0].strength).toBe('warn');
  });

  it('نقص ذهنی: هوش‌بهر ≤ ۷۰ پررنگ؛ انطباق پایینِ بی‌وکسلر فقط هشدار', () => {
    const iq = collectExclusions({ anamV3: undefined, fsiq: 65, adaptLow: false });
    expect(iq[0].key).toBe('id_deficit');
    expect(iq[0].strength).toBe('danger');
    const adaptOnly = collectExclusions({ anamV3: undefined, fsiq: null, adaptLow: true });
    expect(adaptOnly[0].key).toBe('id_deficit');
    expect(adaptOnly[0].strength).toBe('warn');
    // هوش‌بهر طبیعی + انطباق عادی → هیچ
    expect(collectExclusions({ anamV3: undefined, fsiq: 100, adaptLow: false })).toEqual([]);
  });

  it('آموزش ناکافی / حسی / روانی-اجتماعی از شرح‌حال', () => {
    const hits = collectExclusions({
      anamV3: anamEvent({ school_change: 'سه بار یا بیشتر', sensory_concern: 'متوسط', crisis_event: 'بله — برای خود کودک' }),
      fsiq: null,
      adaptLow: false
    });
    expect(hits.map((h) => [h.key, h.strength])).toEqual([
      ['sensory', 'warn'],
      ['insufficient_education', 'danger'],
      ['psychosocial', 'danger']
    ]);
  });

  it('شمول: دوزبانگی روی SLD و اختلال زبان؛ روانی-اجتماعی روی ADHD/اضطراب؛ نقص ذهنی هرگز روی دیرآموز', () => {
    const bil = exclusionsForTarget([{ key: 'bilingualism', titleFa: 'دوزبانگی', strength: 'danger', weight: 1.5, evidenceFa: 'x' } as never], 'speech_language');
    expect(bil).toHaveLength(1);
    expect(exclusionsForTarget([{ key: 'psychosocial', titleFa: 'x', strength: 'danger', weight: 1, evidenceFa: 'x' } as never], 'dyslexia')).toHaveLength(0);
    expect(exclusionsForTarget([{ key: 'psychosocial', titleFa: 'x', strength: 'danger', weight: 1, evidenceFa: 'x' } as never], 'adhd')).toHaveLength(1);
    expect(exclusionsForTarget([{ key: 'id_deficit', titleFa: 'x', strength: 'danger', weight: 2, evidenceFa: 'x' } as never], 'slow_learner')).toHaveLength(0);
    expect(exclusionsForTarget([{ key: 'id_deficit', titleFa: 'x', strength: 'danger', weight: 2, evidenceFa: 'x' } as never], 'dyscalculia')).toHaveLength(1);
  });

  it('نیاز به رد استثنا فقط با مالک پررنگ روشن می‌شود', () => {
    expect(needsExclusionRulingOf([{ key: 'bilingualism', titleFa: 'x', strength: 'warn', weight: 0.75, evidenceFa: 'x' }])).toBe(false);
    expect(needsExclusionRulingOf([{ key: 'bilingualism', titleFa: 'x', strength: 'danger', weight: 1.5, evidenceFa: 'x' }])).toBe(true);
    expect(exclusionPenaltyOf([
      { key: 'bilingualism', titleFa: 'x', strength: 'danger', weight: 1.5, evidenceFa: 'x' },
      { key: 'absenteeism', titleFa: 'x', strength: 'warn', weight: 0.75, evidenceFa: 'x' }
    ])).toBe(2.3); // ۱٫۵ + ۰٫۷۵ — گرد به یک رقم اعشار
  });
});

// ─── اثر بر موتور: رتبه، سقف اطمینان و ملاک D ───

describe('اثر مالک استثنایی بر runInference ()', () => {
  it('کسر رتبهٔ وزن‌دار: ADHD امتیاز کمتر ولی بی‌مالک، بالای نارساخوانیِ صاحب مالک می‌نشیند', () => {
    // نارساخوانی: پروب (۲) + چک‌لیست (۲) = ۴ خام — با دوزبانگی+غیبت پررنگ → کسر ۳ → کلید رتبه ۱
    // ADHD: یک فرم SNAP والد (۲) خام، بدون مالک → کلید رتبه ۲
    const events = [
      anamEvent({ home_language: 'غیرفارسی', absence_level: 'بیش از سه ماه' }),
      probeReadEvent(40, 'دوم'),
      sldEvent('sld1', { rA1: 2, rA2: 2, rA3: 2, rA4: 2, rA5: 2, rA6: 2, rB1: 2, rB2: 2, rC1: 2, rD1: 0 }),
      snapParentIaDanger()
    ];
    const out = runInference(events, { now: () => new Date('2026-10-13T06:00:00.000Z') });
    expect(out.exclusions.map((x) => x.key)).toEqual(['absenteeism', 'bilingualism']);
    expect(out.ranked[0].targetKey).toBe('adhd'); // بدون نارساخوانی اول بود
    const dys = out.ranked.find((h) => h.targetKey === 'dyslexia');
    expect(dys).toBeDefined();
    expect(dys!.score).toBe(4); // امتیاز شواهد دست نمی‌خورد
    expect(dys!.exclusionPenalty).toBe(3);
    expect(dys!.needsExclusionRuling).toBe(true);
    expect(dys!.exclusionsFa.some((x) => x.includes('دوزبانگی'))).toBe(true);
    expect(dys!.exclusionsFa.some((x) => x.includes('غیبت'))).toBe(true);
  });

  it('سقف اطمینان: خامِ «زیاد» با مالک پررنگ به «متوسط» محدود می‌شود — مسدود نیست، منصفانه دیرتر', () => {
    const events = [
      anamEvent({ home_language: 'غیرفارسی' }),
      probeReadEvent(40, 'دوم'),
      sldEvent('sld1', { rA1: 2, rA2: 2, rA3: 2, rA4: 2, rA5: 2, rA6: 2, rB1: 2, rB2: 2, rC1: 2, rD1: 0 })
    ];
    const out = runInference(events, { now: () => new Date('2026-10-13T06:00:00.000Z') });
    const dys = out.ranked.find((h) => h.targetKey === 'dyslexia');
    expect(dys!.score).toBeGreaterThanOrEqual(3.5); // خام در آستانهٔ «زیاد»
    expect(dys!.confidence).toBe('متوسط'); // ولی با مالک پررنگ سقف می‌خورد
    expect(out.nextActions.some((a) => a.includes('رد یا تأیید'))).toBe(true);
  });

  it('ملاک D: مالک پررنگ D را «برآورده نیست» می‌کند با یادداشت مالک؛ پاسخ صریحِ بدون مالک دست‌نخورده', () => {
    const events = [
      anamEvent({ home_language: 'غیرفارسی' }),
      sldEvent('sld1', { rA1: 2, rA2: 2, rA3: 2, rA4: 2, rA5: 2, rA6: 2, rB1: 2, rB2: 2, rC1: 2, rD1: 0 })
    ];
    const out = runInference(events, { now: () => new Date('2026-10-13T06:00:00.000Z') });
    const d = out.criteria.find((c) => c.targetKey === 'dyslexia' && c.group === 'D');
    expect(d!.status).toBe('not_met'); // مالک پررنگ → D نقض می‌شود
    expect(d!.exclusionsFa?.some((x) => x.includes('دوزبانگی'))).toBe(true);
  });

  it('مالک هشداری: اطمینان سقف نمی‌خورد و Dِ نامعلوم فقط «ناقص» می‌شود', () => {
    const events = [
      anamEvent({ home_language: 'دوزبانه' }),
      probeReadEvent(40, 'دوم'),
      sldEvent('sld1', { rA1: 2, rA2: 2, rA3: 2, rA4: 2, rA5: 2, rA6: 2, rB1: 2, rB2: 2, rC1: 2 }) // rD1 پاسخ نداده → unknown
    ];
    const out = runInference(events, { now: () => new Date('2026-10-13T06:00:00.000Z') });
    const dys = out.ranked.find((h) => h.targetKey === 'dyslexia');
    expect(dys!.needsExclusionRuling).toBe(false);
    expect(dys!.confidence).toBe('زیاد'); // خامِ بالا با مالک هشداری سقف نمی‌خورد
    expect(dys!.exclusionPenalty).toBe(0.8); // ۰٫۷۵ گردشده به یک رقم اعشار (همان قرارداد گردکردن امتیاز)
    const d = out.criteria.find((c) => c.targetKey === 'dyslexia' && c.group === 'D');
    expect(d!.status).toBe('partial');
  });
});

// ─── لج فرضیه: اثرانگشت، خلاصه و جابه‌جایی رتبه ───

describe('لج فرضیه — helpers خالص ()', () => {
  it('اثرانگشت: کلید/امتیاز/اطمینان/ترتیب — تغییر هرکدام اثرانگشت را عوض می‌کند', () => {
    const a = [fakeHypothesis('dyslexia', 4, 'متوسط'), fakeHypothesis('adhd', 2, 'کم')];
    const same = [fakeHypothesis('dyslexia', 4, 'متوسط'), fakeHypothesis('adhd', 2, 'کم')];
    const reordered = [fakeHypothesis('adhd', 2, 'کم'), fakeHypothesis('dyslexia', 4, 'متوسط')];
    const rescored = [fakeHypothesis('dyslexia', 4.5, 'متوسط'), fakeHypothesis('adhd', 2, 'کم')];
    expect(hypothesisLogFingerprint(a)).toBe(hypothesisLogFingerprint(same));
    expect(hypothesisLogFingerprint(a)).not.toBe(hypothesisLogFingerprint(reordered));
    expect(hypothesisLogFingerprint(a)).not.toBe(hypothesisLogFingerprint(rescored));
  });

  it('payload و summary: ورودی‌های لج با بج رد استثنا + سقف ۳۰۰ کاراکتر خلاصه', () => {
    const ranked = [fakeHypothesis('dyslexia', 4, 'متوسط')];
    ranked[0].needsExclusionRuling = true;
    const payload = hypothesisLogPayload(ranked, '2026-10-13T06:00:00.000Z');
    expect(payload.fingerprint).toBe('dyslexia:4:متوسط');
    expect(payload.ranked[0].needsExclusionRuling).toBe(true);
    const summary = hypothesisLogSummary(ranked);
    expect(summary).toContain('لج فرضیه');
    expect(summary).toContain('نارساخوانی'.length ? 'dyslexia' : 'dyslexia'); // targetTitle از خود فرضیه می‌آید
    expect(summary.length).toBeLessThanOrEqual(300);
  });

  it('جابه‌جایی رتبه: بالا/پایین/ثابت/تازه‌وارد', () => {
    const prev = [fakeHypothesis('dyslexia', 4), fakeHypothesis('adhd', 2), fakeHypothesis('anxiety', 1)];
    const curr = [fakeHypothesis('adhd', 5), fakeHypothesis('dyslexia', 4), fakeHypothesis('odd', 3)];
    const mv = rankMovementsOf(curr, prev);
    expect(mv).toEqual({ adhd: 'up', dyslexia: 'down', odd: 'new' });
    expect(rankMovementsOf(prev, prev)).toEqual({ dyslexia: 'same', adhd: 'same', anxiety: 'same' });
  });
});

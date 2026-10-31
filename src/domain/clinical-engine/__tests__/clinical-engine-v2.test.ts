import { describe, it, expect } from 'vitest';
import { runInference } from '../infer';
import { convergenceItemOf, convergenceSourceOfTool, ID_ADAPT_EVENT_KEY } from '../convergence';
import type { EvidenceEvent } from '../types';

function ev(toolKey: string, opts: Partial<EvidenceEvent> = {}): EvidenceEvent {
  return {
    eventId: opts.eventId ?? `ev-${toolKey}-${Math.random().toString(36).slice(2, 8)}`,
    toolKey,
    typeTitle: opts.typeTitle ?? toolKey,
    status: 'completed',
    occurredAt: opts.occurredAt ?? '2026-10-03T08:00:00.000Z',
    payload: opts.payload ?? null,
    analysis: opts.analysis ?? null,
    bands: opts.bands ?? null,
    subscales: opts.subscales ?? null
  };
}

function w4(opts: { engine?: Record<string, unknown> | null; fsiq?: string; occurredAt?: string } = {}): EvidenceEvent {
  const payload: Record<string, { value: string; label: string }> = {};
  if (opts.fsiq !== undefined) payload['fsiq'] = { value: opts.fsiq, label: 'هوشبهر کلی' };
  if (opts.engine) payload['engine_output'] = { value: JSON.stringify(opts.engine), label: 'خروجی موتور تفسیر' };
  return ev('ce-wechsler-w4-v1', { payload: Object.keys(payload).length ? payload : null, occurredAt: opts.occurredAt });
}

function engineWithProfile(opts: {
  fsiq: number;
  fsiqBand?: string;
  indexScatter?: number;
  hypotheses?: { id: string; weight: number }[];
  step5Weak?: string[];
}): Record<string, unknown> {
  return {
    ok: true,
    hypotheses: opts.hypotheses ?? [],
    snapshot: { fsiq: opts.fsiq, indexScatter: opts.indexScatter ?? 6, step5Weak: opts.step5Weak ?? [] },
    profile: {
      fsiq: opts.fsiq,
      fsiqBand: opts.fsiqBand ?? null,
      indexScatter: opts.indexScatter ?? 6,
      step5: { weaknesses: opts.step5Weak ?? [] }
    }
  };
}

function idAdapt(score: number, color: 'danger' | 'warn' | 'ok', occurredAt = '2026-10-04T08:00:00.000Z'): EvidenceEvent {
  return ev(ID_ADAPT_EVENT_KEY, {
    occurredAt,
    analysis: { score, band: null, answered: 12, total: 12, maxScore: 24, subscaleScores: [{ id: 'id_adapt', name: 'انطباق روزمره', score, max: 24, band: null, color }] }
  });
}

function snap(form: 'p' | 't', ia: number, color: 'danger' | 'warn' | 'ok' | null, occurredAt = '2026-10-04T08:00:00.000Z'): EvidenceEvent {
  return ev(form === 'p' ? 'ce-snap-iv-p-v1' : 'ce-snap-iv-t-v1', {
    occurredAt,
    analysis: { score: ia, band: null, answered: 9, total: 9, maxScore: 27, subscaleScores: [{ id: 'ia', name: 'کم‌توجهی', score: ia, max: 27, band: null, color }] }
  });
}

describe('فرضیه‌های وکسلر به موتور واحد تغذیه نمی‌شوند', () => {
  it('فرضیه‌های engine_output رویداد وکسلر (قدیم ) نادیده گرفته می‌شوند — اتیسم با یک فرضیهٔ وکسلری ساخته نمی‌شود', () => {
    const out = runInference([
      w4({ engine: { ok: true, hypotheses: [{ id: 'ASD', weight: 0.9 }, { id: 'SLD', weight: 0.9 }] } })
    ]);
    expect(out.ranked.find((h) => h.targetKey === 'autism')).toBeUndefined();
    expect(out.ranked.find((h) => h.targetKey === 'dyslexia')).toBeUndefined();
  });

  it('فرضیهٔ BIF وزن‌دار بی‌پروفایل → هیچ دیرآموزی‌ای ساخته نمی‌شود', () => {
    const out = runInference([
      w4({ engine: { ok: true, hypotheses: [{ id: 'BIF', weight: 0.9 }] } })
    ]);
    expect(out.ranked.find((h) => h.targetKey === 'slow_learner')).toBeUndefined();
  });

  it('ID هرگز slow_learner نمی‌سازد (تفکیک انطباقی §۳.۱ — بقا پس از )', () => {
    const out = runInference([
      w4({ engine: { ok: true, hypotheses: [{ id: 'ID', weight: 0.4 }], profile: { fsiq: 65, fsiqBand: 'ID', indexScatter: 4 } } })
    ]);
    expect(out.ranked.find((h) => h.targetKey === 'slow_learner')).toBeUndefined();
  });

  it('ضعف گام ۵ (VCI) بی‌چک‌لیست → هیچ فرضیهٔ زبان/گفتار از وکسلر ساخته نمی‌شود', () => {
    const out = runInference([
      w4({ engine: { ok: true, hypotheses: [{ id: 'DOMAIN_WEAK', weight: 0.4 }], snapshot: { step5Weak: ['VCI'] } } })
    ]);
    expect(out.ranked.find((h) => h.targetKey === 'speech_language')).toBeUndefined();
  });
});

describe('T6 — قواعد سیگنالی وکسلر (infer) — تفکیک ID/دیرآموز و پایش مرز پایین', () => {
  it('FSIQ ≤ ۷۰ + انطباق پایین → پرچم ارجاع + اقدام «ارجاع» — بدون هیچ تقویت دیرآموزی', () => {
    const out = runInference([
      w4({ fsiq: '65', engine: engineWithProfile({ fsiq: 65, fsiqBand: 'ID', indexScatter: 3, hypotheses: [{ id: 'BIF', weight: 0.3 }] }) }),
      idAdapt(8, 'danger')
    ]);
    expect(out.referralFlags.some((f) => f.includes('مسیر ناتوانی هوشی'))).toBe(true);
    expect(out.nextActions.some((a) => a.includes('ارجاع'))).toBe(true);
    expect(out.ranked.find((h) => h.targetKey === 'slow_learner')).toBeUndefined();
  });

  it('FSIQ = ۷۰ (مرز) + انطباق پایین → قاعدهٔ خام fsiq هم سرکوب می‌شود — دو مسیر هم‌پوشان نمی‌شوند', () => {
    const out = runInference([
      w4({ fsiq: '70', engine: engineWithProfile({ fsiq: 70, fsiqBand: 'BIF', indexScatter: 4 }) }),
      idAdapt(10, 'danger')
    ]);
    expect(out.referralFlags.some((f) => f.includes('مسیر ناتوانی هوشی'))).toBe(true);
    expect(out.ranked.find((h) => h.targetKey === 'slow_learner')).toBeUndefined();
  });

  it('FSIQ ۷۰–۸۴ + انطباق عادی → تقویت دیرآموزی؛ «قوی‌ترین تک‌تقویت» — قاعدهٔ خام ۲ بر تقویت پروفایل ۱ می‌چربد', () => {
    const out = runInference([
      w4({ fsiq: '78', engine: engineWithProfile({ fsiq: 78, fsiqBand: 'BIF', indexScatter: 5 }) }),
      idAdapt(20, 'ok')
    ]);
    const slow = out.ranked.find((h) => h.targetKey === 'slow_learner')!;
    expect(slow.score).toBeCloseTo(2, 5); // ۲ (قاعدهٔ خام) نه ۳ — جمع ممنوع
    expect(slow.evidenceFa.filter((e) => e.includes('دیرآموزی')).length).toBeLessThanOrEqual(1);
    expect(out.referralFlags.some((f) => f.includes('مسیر ناتوانی هوشی'))).toBe(false);
  });

  it('FSIQ ۷۰–۸۴ بدون fsiq دستی (فقط پروفایل) + انطباق ثبت‌نشده → تقویت پروفایل w۱', () => {
    const out = runInference([
      w4({ engine: engineWithProfile({ fsiq: 78, fsiqBand: 'BIF', indexScatter: 5 }) })
    ]);
    const slow = out.ranked.find((h) => h.targetKey === 'slow_learner')!;
    expect(slow.score).toBeCloseTo(1, 5);
    expect(slow.evidenceFa.some((e) => e.includes('بازهٔ مرزی/دیرآموزی') && e.includes('ثبت‌نشده'))).toBe(true);
  });

  it('FSIQ ۷۰–۸۴ با انطباق «مرزی» → تقویت پروفایل نمی‌گیرد (فقط عادی/ثبت‌نشده) ولی پایش ID هم نیست', () => {
    const out = runInference([
      w4({ engine: engineWithProfile({ fsiq: 78, fsiqBand: 'BIF', indexScatter: 5 }) }),
      idAdapt(15, 'warn')
    ]);
    expect(out.ranked.find((h) => h.targetKey === 'slow_learner')).toBeUndefined();
    expect(out.referralFlags.some((f) => f.includes('مسیر ناتوانی هوشی'))).toBe(false);
  });

  it('پروندهٔ قدیمی (بدون profile) عیناً رفتار امروز — تقویت پروفایل و خط قرمز ID خاموش', () => {
    const out = runInference([w4({ fsiq: '65' }), idAdapt(8, 'danger')]);
    expect(out.referralFlags.some((f) => f.includes('مسیر ناتوانی هوشی'))).toBe(false);
    expect(out.ranked.find((h) => h.targetKey === 'slow_learner')).toBeUndefined();
  });

  it('FSIQ ۸۵–۸۹ یکنواخت → فقط جملهٔ پایش در اقدام بعدی — بدون برچسب تشخیصی و بدون تقویت', () => {
    const out = runInference([
      w4({ engine: engineWithProfile({ fsiq: 87, fsiqBand: 'LOW_BORDER', indexScatter: 7 }) })
    ]);
    expect(out.ranked.find((h) => h.targetKey === 'slow_learner')).toBeUndefined();
    const mon = out.nextActions.find((a) => a.includes('مرز پایین') && a.includes('پایش'));
    expect(mon).toBeDefined();
    expect(mon).not.toContain('دیرآموز');
    expect(mon).not.toContain('اختلال');
  });

  it('FSIQ ۸۵–۸۹ با پراکندگی شدید → جملهٔ پایش «یکنواخت» نمی‌آید (نیم‌رخ یکنواخت نیست)', () => {
    const out = runInference([
      w4({ engine: engineWithProfile({ fsiq: 87, fsiqBand: 'LOW_BORDER', indexScatter: 25 }) })
    ]);
    expect(out.nextActions.some((a) => a.includes('مرز پایین') && a.includes('پایش دوره‌ای'))).toBe(false);
  });
});

describe('T6 — هم‌گرایی چندمنبعی (سه حالت خوانا)', () => {
  it('طبقه‌بندی خالص: هم‌گرا (≥۲ منبع) / تنها (۱ منبع) / واگرا (دادهٔ مخالف) / بی‌شاهد → null', () => {
    const conv = (p: string[], d: string[]) => convergenceItemOf('adhd', 'بیش‌فعالی/کم‌توجهی', p as never, d as never);
    expect(conv(['family', 'teacher'], ['family', 'teacher'])!.state).toBe('هم‌گرا');
    expect(conv(['probe', 'test'], ['probe', 'test'])!.state).toBe('هم‌گرا');
    expect(conv(['family'], ['family'])!.state).toBe('تنها');
    expect(conv(['family'], ['family', 'teacher'])!.state).toBe('واگرا');
    expect(conv([], ['family'])).toBeNull();
    const item = conv(['family', 'teacher'], ['family', 'teacher'])!;
    expect(Object.keys(item).sort()).toEqual(['implicationFa', 'state', 'targetKey']);
    expect(item.implicationFa).toContain('خانواده');
    expect(item.implicationFa).toContain('مدرسه');
  });

  it('جدول منابع: فرم‌های تکی خانواده/معلم منبع خود را دارند (بدون پکیج جامع)؛ کلید ناشناختهٔ معلمی با batteryDef معلم می‌شود', () => {
    expect(convergenceSourceOfTool('ce-comp-family-v2')).toBeNull();
    expect(convergenceSourceOfTool('ce-snap-iv-p-v1')).toBe('family');
    expect(convergenceSourceOfTool(ID_ADAPT_EVENT_KEY)).toBe('family');
    expect(convergenceSourceOfTool('sdq-parent')).toBe('family');
    expect(convergenceSourceOfTool('ce-snap-iv-t-v1')).toBe('teacher');
    expect(convergenceSourceOfTool('ce-wechsler-w4-v1')).toBe('test');
    expect(convergenceSourceOfTool('ce-probe-read-v1')).toBe('probe');
    expect(convergenceSourceOfTool('ce-sld-read-v1')).toBe('clinician');
    expect(convergenceSourceOfTool('ce-not-a-tool')).toBeNull();
  });

  it('هم‌گرا در عمل: والد + معلم هر دو کم‌توجهی بالا → «هم‌گرا» برای adhd', () => {
    const out = runInference([snap('p', 18, 'danger'), snap('t', 17, 'danger', '2026-10-05T08:00:00.000Z')]);
    const item = out.convergence.find((c) => c.targetKey === 'adhd');
    expect(item?.state).toBe('هم‌گرا');
    expect(item?.implicationFa).toContain('خانواده');
    expect(item?.implicationFa).toContain('مدرسه');
  });

  it('تنها در عمل: فقط والد → «تنها» با یادآوری منبع دیگر', () => {
    const out = runInference([snap('p', 18, 'danger')]);
    const item = out.convergence.find((c) => c.targetKey === 'adhd');
    expect(item?.state).toBe('تنها');
    expect(item?.implicationFa).toContain('فقط از سوی خانواده');
  });

  it('واگرا در عمل: والد نشانه می‌دهد، معلم پاسخ داده ولی نشانه‌ای نداده → «واگرا»', () => {
    const out = runInference([snap('p', 18, 'danger'), snap('t', 2, 'ok', '2026-10-05T08:00:00.000Z')]);
    const item = out.convergence.find((c) => c.targetKey === 'adhd');
    expect(item?.state).toBe('واگرا');
    expect(item?.implicationFa).toContain('هم‌رأی نیستند');
  });

  it('واگرای دیرآموزی: انطباق پایین خانواده در برابر شواهد BIF آزمون → «واگرا»', () => {
    const out = runInference([
      w4({ engine: engineWithProfile({ fsiq: 78, fsiqBand: 'BIF', indexScatter: 5 }) }),
      idAdapt(8, 'danger')
    ]);
    const slow = out.ranked.find((h) => h.targetKey === 'slow_learner');
    expect(slow).toBeUndefined();
  });

  it('هم‌گرایی فقط کلید افزودنی است — کلیدهای قدیمی عیناً سرجایشان و ترتیب‌شان حفظ است', () => {
    const out = runInference([snap('p', 18, 'danger')]);
    expect(Object.keys(out)).toEqual([
      'batteryVersion',
      'generatedAt',
      'criteria',
      'ranked',
      'discrepancies',
      'nextActions',
      'dataCoverage',
      'referralFlags',
      'anamnesisSignals',
      'exclusions', // مالک‌های استثنایی (بند D) پس از سیگنال‌های شرح‌حال
      'convergence'
    ]);
  });
});

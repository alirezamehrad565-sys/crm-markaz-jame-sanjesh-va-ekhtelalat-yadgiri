import { describe, it, expect } from 'vitest';
import { runInference } from '../infer';
import type { EvidenceEvent } from '../types';

const SLD_READ_BANDS = [
  { max: 10, label: 'در محدودهٔ انتظار', color: 'ok' },
  { max: 9999, label: 'بالای برش — ناحیهٔ بالینی', color: 'danger' }
] as const;

function sldReadDanger(eventId: string): EvidenceEvent {
  const values: Record<string, number> = { rA1: 2, rA2: 2, rA3: 2, rA4: 2, rA5: 2, rA6: 2, rB1: 2, rB2: 2, rC1: 2, rD1: 0 };
  const payload: EvidenceEvent['payload'] = {};
  for (const [k, v] of Object.entries(values)) payload[k] = { value: String(v), label: k };
  return {
    eventId,
    toolKey: 'ce-sld-read-v1',
    typeTitle: 'چک‌لیست ملاکی نارساخوانی',
    status: 'completed',
    occurredAt: '2026-10-02T08:00:00.000Z',
    payload,
    analysis: {
      score: 14,
      band: 'بالای برش — ناحیهٔ بالینی',
      answered: 10,
      total: 10,
      maxScore: 20,
      subscaleScores: [{ id: 'crita', name: 'ملاک A', score: 12, max: 12, band: 'بالای برش — ناحیهٔ بالینی', color: 'danger' }]
    },
    bands: null,
    subscales: SLD_READ_BANDS.map((b) => ({ id: 'crita', name: 'ملاک A', excludeFromTotal: false, bands: [...SLD_READ_BANDS] })).slice(0, 1)
  };
}

function w4Profile(opts: {
  eventId?: string;
  fsiq: number;
  vci?: number | null;
  pri?: number | null;
  wmi?: number | null;
  psi?: number | null;
  step5Weak?: string[];
}): EvidenceEvent {
  const p = {
    fsiq: opts.fsiq,
    fsiqBand: opts.fsiq <= 69 ? 'ID' : opts.fsiq <= 84 ? 'BIF' : opts.fsiq <= 89 ? 'LOW_BORDER' : 'AVERAGE',
    indexScatter: 6,
    vci: opts.vci === undefined ? null : { scaled: opts.vci },
    pri: opts.pri === undefined ? null : { scaled: opts.pri },
    wmi: opts.wmi === undefined ? null : { scaled: opts.wmi },
    psi: opts.psi === undefined ? null : { scaled: opts.psi },
    step5: { strengths: [], weaknesses: opts.step5Weak ?? [] }
  };
  return {
    eventId: opts.eventId ?? 'w4',
    toolKey: 'ce-wechsler-w4-v1',
    typeTitle: 'وکسلر ۴',
    status: 'completed',
    occurredAt: '2026-10-01T08:00:00.000Z',
    payload: { engine_output: { value: JSON.stringify({ ok: true, snapshot: { fsiq: opts.fsiq }, profile: p }), label: 'خروجی موتور' } },
    analysis: null,
    bands: null,
    subscales: null
  };
}

function idAdapt(color: 'ok' | 'warn' | 'danger'): EvidenceEvent {
  return {
    eventId: 'adapt',
    toolKey: 'ce-id-adapt-v1',
    typeTitle: 'سنجهٔ انطباق روزمره',
    status: 'completed',
    occurredAt: '2026-10-03T08:00:00.000Z',
    payload: null,
    analysis: {
      score: 1,
      band: null,
      answered: 1,
      total: 1,
      maxScore: 3,
      subscaleScores: [{ id: 'id_adapt', name: 'انطباق روزمره', score: 1, max: 3, band: null, color }]
    },
    bands: null,
    subscales: null
  };
}

describe('m159 — هم‌گرایی پردازشی SLD', () => {
  it('الگوی هم‌گرا: چک‌لیست خواندن danger + WMI/PSI ضعیف + VCI سالم → شاهد پردازشی با تقابل و هم‌گرای دو منبع', () => {
    const out = runInference([
      sldReadDanger('sld'),
      w4Profile({ fsiq: 95, vci: 100, pri: 98, wmi: 78, psi: 82, step5Weak: ['WMI', 'PSI'] })
    ]);
    const h = out.ranked.find((x) => x.targetKey === 'dyslexia');
    expect(h).toBeDefined();
    const ev = h!.evidenceFa.find((t) => t.includes('الگوی هم‌گرا با دشواری خواندن'));
    expect(ev).toBeDefined();
    expect(ev!).toContain('حافظهٔ فعال و سرعت پردازش');
    expect(ev!).toContain('درک کلامی');
    expect(ev!).toContain('رویکرد پردازش اطلاعات');
    const conv = (out.convergence ?? []).find((c) => c.targetKey === 'dyslexia');
    expect(conv?.state).toBe('هم‌گرا');
  });

  it('هرگز از وکسلر تنها سناریو نمی‌سازد — پروفایل ضعیف بدون شواهد تحصیلی → بدون فرضیهٔ dyslexia', () => {
    const out = runInference([
      w4Profile({ fsiq: 95, vci: 100, pri: 98, wmi: 78, psi: 82, step5Weak: ['WMI', 'PSI'] })
    ]);
    expect(out.ranked.find((x) => x.targetKey === 'dyslexia')).toBeUndefined();
  });

  it('بدون تقابل سالم: نیم‌رخ کلی ضعیف → شاهد همسو با جملهٔ تعبیر محدودتر', () => {
    const out = runInference([
      sldReadDanger('sld'),
      w4Profile({ fsiq: 76, vci: 80, pri: 78, wmi: 70, psi: 74, step5Weak: ['WMI'] })
    ]);
    const h = out.ranked.find((x) => x.targetKey === 'dyslexia');
    expect(h).toBeDefined();
    const ev = h!.evidenceFa.find((t) => t.includes('حافظهٔ فعال'));
    expect(ev).toBeDefined();
    expect(ev!).toContain('تعبیر اختصاصی محدودتر');
    expect(ev!).toContain('بازهٔ مرزی'); // یادداشت احتیاط BIF
  });

  it('مسیر فعال ID بر تقویت SLD مقدم است — هیچ شاهد پردازشی اعمال نمی‌شود', () => {
    const out = runInference([
      sldReadDanger('sld'),
      w4Profile({ fsiq: 63, vci: 62, pri: 70, wmi: 66, psi: 68, step5Weak: ['WMI', 'PSI'] }),
      idAdapt('danger')
    ]);
    expect(out.referralFlags.some((f) => f.includes('خط قرمز — مسیر ناتوانی هوشی'))).toBe(true);
    const h = out.ranked.find((x) => x.targetKey === 'dyslexia');
    expect(h?.evidenceFa.some((t) => t.includes('الگوی هم‌گرا با دشواری')) ?? false).toBe(false);
  });
});

describe('m159 — سناریوهای تکمیلی ID', () => {
  it('FSIQ ۷۱–۷۵ + انطباق پایین → پرچم ارجاع با احتساب SEM (بدون فعال‌سازی مسیر ID)', () => {
    const out = runInference([
      w4Profile({ fsiq: 73, vci: 74, pri: 76, wmi: 70, psi: 72 }),
      idAdapt('danger')
    ]);
    expect(out.referralFlags.some((f) => f.includes('۷۱–۷۵') && f.includes('SEM'))).toBe(true);
    expect(out.referralFlags.some((f) => f.includes('خط قرمز — مسیر ناتوانی هوشی'))).toBe(false);
  });

  it('FSIQ ≤۷۰ بدون سنجهٔ انطباق → اقدام بعدیِ ثبت انطباق (تفکیک ID از دیرآموزی)', () => {
    const out = runInference([w4Profile({ fsiq: 63 })]);
    expect(out.nextActions.some((a) => a.includes('سنجهٔ انطباق روزمره ثبت نشده'))).toBe(true);
  });

  it('FSIQ نرمال → هیچ سناریوی ID جدیدی فعال نمی‌شود', () => {
    const out = runInference([w4Profile({ fsiq: 100, vci: 100, pri: 102, wmi: 98, psi: 96 })]);
    expect(out.referralFlags.some((f) => f.includes('۷۱–۷۵'))).toBe(false);
    expect(out.nextActions.some((a) => a.includes('سنجهٔ انطباق روزمره ثبت نشده'))).toBe(false);
  });
});

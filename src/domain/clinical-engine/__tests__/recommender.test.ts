import { describe, it, expect } from 'vitest';
import { checklistPlanContextOf, recommendChecklistPlan, PLAN_TOOL_KEYS, RECOMMENDER_THRESHOLDS } from '../recommender';
import { fsiqBandOf } from '../signals';
import type { EvidenceEvent } from '../types';

const EV = (e: Partial<EvidenceEvent> & { toolKey: string; eventId: string }): EvidenceEvent => ({
  typeTitle: e.toolKey,
  status: 'completed',
  occurredAt: '2026-10-05T08:00:00.000Z',
  payload: null,
  analysis: null,
  bands: null,
  subscales: null,
  ...e
});

function wechslerEngine(opts: {
  fsiq: number;
  vci?: number | null;
  pri?: number | null;
  wmi?: number | null;
  psi?: number | null;
  scatter?: number;
  subs?: Record<string, number>;
  step5Weak?: string[];
}): Record<string, unknown> {
  const sub = (c: string): number | null => (opts.subs?.[c] !== undefined ? opts.subs[c] : null);
  const idx = (v: number | null | undefined) => (v == null ? null : { scaled: v, percentile: null });
  const pattern = (codes: string[]) => {
    const scaled: Record<string, number> = {};
    for (const c of codes) {
      const v = sub(c);
      if (v === null || v > RECOMMENDER_THRESHOLDS.SUBTEST_WEAK) return null;
      scaled[c] = v;
    }
    return { codes, scaled };
  };
  return {
    ok: true,
    engineVersion: '',
    snapshot: {
      fsiq: opts.fsiq,
      indexScatter: opts.scatter ?? 0,
      indices: { VCI: idx(opts.vci), PRI: idx(opts.pri), WMI: idx(opts.wmi), PSI: idx(opts.psi), FSIQ: idx(opts.fsiq) },
      subtests: Object.entries(opts.subs ?? {}).map(([code, scaled]) => ({ code, scaled }))
    },
    profile: {
      vci: idx(opts.vci),
      pri: idx(opts.pri),
      wmi: idx(opts.wmi),
      psi: idx(opts.psi),
      fsiq: opts.fsiq,
      gai: null,
      gaiValidity: null,
      indexScatter: opts.scatter ?? 0,
      fsiqBand: fsiqBandOf(opts.fsiq),
      acid: pattern(['AR', 'CD', 'IN', 'DS']),
      cad: pattern(['AR', 'CD', 'DS']),
      step5: { strengths: [], weaknesses: (opts.step5Weak ?? []).map((key) => ({ key, diff: -12, cut: 8, valid: true })) },
      substitutes: [],
      flags: []
    },
    hypotheses: [],
    signals: []
  };
}

function wechslerEvent(engine: Record<string, unknown> | null, manual?: Record<string, number>): EvidenceEvent {
  const payload: Record<string, { value: string; label: string }> = {};
  if (engine) payload['engine_output'] = { value: JSON.stringify(engine), label: 'خروجی موتور تفسیر' };
  for (const [k, v] of Object.entries(manual ?? {})) payload[k] = { value: String(v), label: k };
  return EV({ eventId: 'w1', toolKey: 'ce-wechsler-w4-v1', payload: Object.keys(payload).length ? payload : null });
}

function anamV3(fields: Record<string, string>): EvidenceEvent {
  const payload = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { value: v, label: k }]));
  return EV({ eventId: 'a1', toolKey: 'ce-anamnesis-v3', payload });
}

function anamV2(fields: Record<string, string>): EvidenceEvent {
  return EV({
    eventId: 'a0',
    toolKey: 'ce-anamnesis-v2',
    payload: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { value: v, label: k }]))
  });
}

function idAdaptEvent(score: number): EvidenceEvent {
  const band = score <= 12 ? 'پایین — نیاز به بررسی' : score <= 17 ? 'مرزی' : 'نرمال';
  const color = score <= 12 ? 'danger' : score <= 17 ? 'warn' : 'ok';
  return EV({
    eventId: 'id1',
    toolKey: 'ce-id-adapt-v1',
    analysis: {
      score,
      band: null,
      answered: 12,
      total: 12,
      maxScore: 24,
      subscaleScores: [{ id: 'id_adapt', name: 'انطباق روزمره', score, max: 24, band, color }]
    }
  });
}

function toolEvent(toolKey: string, danger = false): EvidenceEvent {
  return EV({
    eventId: `t-${toolKey}`,
    toolKey,
    analysis: danger
      ? { score: 9, band: null, answered: 10, total: 10, maxScore: 10, subscaleScores: [{ id: 'x', name: 'x', score: 9, max: 10, band: 'بالا', color: 'danger' }] }
      : null
  });
}

function uniformEngine(fsiq: number, scatter = 2): Record<string, unknown> {
  return wechslerEngine({ fsiq, vci: fsiq, pri: fsiq, wmi: fsiq, psi: fsiq, scatter });
}

const TOOL = PLAN_TOOL_KEYS;

describe('قاعدهٔ ۰ — باتری پایهٔ غربال عمومی (همیشه‌برقرار)', () => {
  it('پروندهٔ خالی → فقط SDQ والد + معلم با اولویت core و پلن تکی + پانویس خط قرمز', () => {
    const plan = recommendChecklistPlan(checklistPlanContextOf([]));
    expect(plan.items.map((i) => i.toolKey)).toEqual([TOOL.sdqP, TOOL.sdqT]);
    expect(plan.items.every((i) => i.priority === 'core' && i.reasonFa.length > 10 && i.hypothesisKeys.length >= 1)).toBe(true);
    expect(plan.planType).toBe('تکی');
    expect(plan.referralFa).toBeNull();
    expect(plan.basis).toContain('ثبت‌نشده');
  });

  it('SDQ والد/معلمِ موجود → دوباره پیشنهاد نمی‌شود (پلن خالی سالم)', () => {
    const plan = recommendChecklistPlan(checklistPlanContextOf([toolEvent(TOOL.sdqP), toolEvent(TOOL.sdqT)]));
    expect(plan.items).toEqual([]);
  });
});

describe('قاعدهٔ ۵ — پلن دیرآموز (BIF) + تفکیک انطباقی از ID (§۳.۱)', () => {
  it('FSIQ ۷۸ یکنواخت بدون انطباق → سه پروب + سنجهٔ انطباق + باتری رفتاری (SDQ والد/معلم) + شرح‌حال v3؛ بدون چک‌لیست ملاکی (بدون فرم جامع)', () => {
    const plan = recommendChecklistPlan(checklistPlanContextOf([wechslerEvent(uniformEngine(78))]));
    const keys = plan.items.map((i) => i.toolKey);
    expect(keys).toEqual(expect.arrayContaining([TOOL.probeRead, TOOL.probeWrite, TOOL.probeCalc, TOOL.idAdapt, TOOL.anamnesisV3, TOOL.sdqP, TOOL.sdqT]));
    expect(keys.filter((k) => k.startsWith('ce-sld-'))).toEqual([]);
    expect(plan.items.every((i) => i.priority === 'core')).toBe(true);
    expect(plan.planType).toBe('جامع');
    expect(plan.basis).toContain('مرزی/دیرآموزی');
    expect(plan.basis).toContain('ثبت‌نشده'); // انطباق روزمره: ثبت‌نشده
    expect(plan.referralFa).toBeNull();
  });

  it('شرح‌حال v3 موجود → دیگر پیشنهاد نمی‌شود (حذف موجود)', () => {
    const plan = recommendChecklistPlan(checklistPlanContextOf([wechslerEvent(uniformEngine(78)), anamV3({})]));
    expect(plan.items.map((i) => i.toolKey)).not.toContain(TOOL.anamnesisV3);
  });

  it('هم‌بودی یادگیری (سیگنال v3) → چک‌لیست ملاکی همان حوزه core (فقط با نشانهٔ هم‌بودی)', () => {
    const plan = recommendChecklistPlan(checklistPlanContextOf([
      wechslerEvent(uniformEngine(78)),
      anamV3({ sld_read_concern: 'زیاد — نگران‌کننده', decline_scope: 'همهٔ درس‌ها با هم افت کرده‌اند' })
    ]));
    const read = plan.items.find((i) => i.toolKey === TOOL.sldRead);
    expect(read?.priority).toBe('core');
    expect(read?.reasonFa).toContain('هم‌بودی');
    expect(plan.items.some((i) => i.toolKey === TOOL.sldWri || i.toolKey === TOOL.sldCalc)).toBe(false);
  });

  it('هم‌بودی توجه با گپ شاخصی ≥۱۰ → SNAP والد و معلم هر دو core (پکیجِ پوشش‌دهنده حذف شده)', () => {
    const engine = wechslerEngine({ fsiq: 78, vci: 82, pri: 81, wmi: 70, psi: 77, scatter: 8 });
    const plan = recommendChecklistPlan(checklistPlanContextOf([wechslerEvent(engine)]));
    expect(plan.items.map((i) => i.toolKey)).toContain(TOOL.snapT);
    expect(plan.items.map((i) => i.toolKey)).toContain(TOOL.snapP);
    expect(plan.planType).toBe('جامع');
  });

  it('FSIQ ۷۰–۸۴ با انطباق پایین → همچنان پلن دیرآموز (نه خط قرمز) با هشدار انطباقی', () => {
    const plan = recommendChecklistPlan(checklistPlanContextOf([wechslerEvent(uniformEngine(78)), idAdaptEvent(10)]));
    expect(plan.referralFa).toBeNull();
    expect(plan.items.map((i) => i.toolKey)).toContain(TOOL.probeRead);
    expect(plan.basis).toContain('پایین');
  });

  it('FSIQ ۶۵ + انطباق پایین → خط قرمز ID: بدون هیچ پلن ابزار + پرچم ارجاع شفاف', () => {
    const plan = recommendChecklistPlan(checklistPlanContextOf([wechslerEvent(uniformEngine(65)), idAdaptEvent(10)]));
    expect(plan.items).toEqual([]);
    expect(plan.referralFa).toContain('خط قرمز');
    expect(plan.basis).toContain('ناتوانی هوشی');
  });

  it('FSIQ ۶۵ + انطباق ثبت‌نشده → سنجهٔ انطباق روزمره برای تفکیک؛ مسیر ID مهر نمی‌شود ()', () => {
    const plan = recommendChecklistPlan(checklistPlanContextOf([wechslerEvent(uniformEngine(65))]));
    expect(plan.items.map((i) => i.toolKey)).toEqual([TOOL.idAdapt, TOOL.sdqP, TOOL.sdqT]);
    expect(plan.items[0].reasonFa).toContain('تفکیک');
    expect(plan.referralFa).toBeNull();
  });

  it('FSIQ ۶۵ + انطباق نرمال → مسیر ID تأیید نمی‌شود؛ پلن پروب‌محور دیرآموز می‌آید (انطباقِ موجود دوباره پیشنهاد نمی‌شود)', () => {
    const plan = recommendChecklistPlan(checklistPlanContextOf([wechslerEvent(uniformEngine(65)), idAdaptEvent(20)]));
    expect(plan.referralFa).toBeNull();
    const keys = plan.items.map((i) => i.toolKey);
    expect(keys).toEqual(expect.arrayContaining([TOOL.probeRead]));
    expect(keys).not.toContain(TOOL.idAdapt); // — انطباق نرمال ثبت شده؛ ابزار تکراری نمی‌آید
  });

  it('رویداد وکسلرِ پیش از T1 (فقط فیلد دستی) → فال‌بک fsiqBandOf و همان پلن دیرآموز', () => {
    const plan = recommendChecklistPlan(checklistPlanContextOf([wechslerEvent(null, { fsiq: 78 })]));
    expect(plan.items.map((i) => i.toolKey)).toContain(TOOL.probeRead);
    expect(plan.planType).toBe('جامع');
    expect(plan.basis).toContain('۷۸');
  });
});

describe('قاعدهٔ مرزی — ۸۵–۸۹ یکنواخت (LOW_BORDER)', () => {
  it('FSIQ ۸۷ یکنواخت → فقط باتری پایه؛ بدون پروب/چک‌لیست سنگین + توصیهٔ پایش «مرز پایین»', () => {
    const plan = recommendChecklistPlan(checklistPlanContextOf([wechslerEvent(uniformEngine(87))]));
    const keys = plan.items.map((i) => i.toolKey);
    expect(keys).toEqual([TOOL.sdqP, TOOL.sdqT]);
    expect(keys.some((k) => k.startsWith('ce-probe-'))).toBe(false);
    expect(plan.basis).toContain('مرز پایین');
    expect(plan.planType).toBe('تکی');
  });
});

describe('قاعده‌های پروفایلی ۱ تا ۱۴ (بیرون از مسیر دیرآموز)', () => {
  it('قاعدهٔ ۱ — گپ توجه دو-شاخصی (WMI ≥۱۰ و PSI ≥۵ زیر توان) → SNAP والد+معلم core و SDQ معلم', () => {
    const engine = wechslerEngine({ fsiq: 100, vci: 110, pri: 108, wmi: 97, psi: 102, subs: { DS: 6 }, scatter: 11 });
    const plan = recommendChecklistPlan(checklistPlanContextOf([wechslerEvent(engine)]));
    const snapP = plan.items.find((i) => i.toolKey === TOOL.snapP);
    const snapT = plan.items.find((i) => i.toolKey === TOOL.snapT);
    expect(snapP?.priority).toBe('core');
    expect(snapT?.priority).toBe('core');
    expect(plan.items.find((i) => i.toolKey === TOOL.sdqT)?.priority).toBe('core');
    expect(snapP?.hypothesisKeys).toContain('r1');
    expect(plan.basis).toContain('توجه');
  });

  it('قاعدهٔ ۱ — گپ تک‌شاخصی (فقط WMI ≥۱۰) کافی نیست (دو شاخص جدا در سند)', () => {
    const engine = wechslerEngine({ fsiq: 100, vci: 108, pri: 106, wmi: 94, psi: 104, scatter: 10 });
    const plan = recommendChecklistPlan(checklistPlanContextOf([wechslerEvent(engine)]));
    expect(plan.items.map((i) => i.toolKey)).not.toContain(TOOL.snapP);
  });

  it('قاعدهٔ ۲ — گپ + الگوی ACID بدون شکایت مشخص → چک‌لیست خواندن (حوزهٔ کلاسیک) + پروب خواندن core', () => {
    const engine = wechslerEngine({ fsiq: 90, vci: 100, pri: 100, wmi: 88, psi: 88, subs: { AR: 6, CD: 6, IN: 6, DS: 6 }, scatter: 12 });
    const plan = recommendChecklistPlan(checklistPlanContextOf([wechslerEvent(engine)]));
    const read = plan.items.find((i) => i.toolKey === TOOL.sldRead);
    const probeRead = plan.items.find((i) => i.toolKey === TOOL.probeRead);
    expect(read?.priority).toBe('core');
    expect(probeRead?.priority).toBe('core');
    expect(plan.items.find((i) => i.toolKey === TOOL.sldWri)?.priority).toBe('optional');
    expect(plan.items.find((i) => i.toolKey === TOOL.sldCalc)?.priority).toBe('optional');
  });

  it('قاعدهٔ ۲ — حوزهٔ شکایت از سیگنال شرح‌حال v3 (نوشتن) → چک‌لیست+پروب نوشتن core', () => {
    const engine = wechslerEngine({ fsiq: 90, vci: 108, pri: 104, wmi: 94, psi: 96, subs: { CD: 6 }, scatter: 10 });
    const plan = recommendChecklistPlan(checklistPlanContextOf([
      wechslerEvent(engine),
      anamV3({ sld_write_concern: 'متوسط' })
    ]));
    expect(plan.items.find((i) => i.toolKey === TOOL.sldWri)?.priority).toBe('core');
    expect(plan.items.find((i) => i.toolKey === TOOL.probeWrite)?.priority).toBe('core');
    expect(plan.items.map((i) => i.toolKey)).not.toContain(TOOL.probeRead);
  });

  it('قاعدهٔ ۳ — VCI ≤۸۵ با واژگان ضعیف → چک‌لیست زبان core + پروب خواندن recommended', () => {
    const engine = wechslerEngine({ fsiq: 88, vci: 82, pri: 96, wmi: 94, psi: 96, subs: { VO: 6 }, scatter: 14 });
    const plan = recommendChecklistPlan(checklistPlanContextOf([wechslerEvent(engine)]));
    expect(plan.items.find((i) => i.toolKey === TOOL.speech)?.priority).toBe('core');
    expect(plan.items.find((i) => i.toolKey === TOOL.probeRead)?.priority).toBe('recommended');
  });

  it('قاعدهٔ ۴ — WMI ≤۸۵ با فراخنای ارقام ضعیف → چک‌لیست زبان + یادآوری ارجاع شنوایی‌شناسی', () => {
    const engine = wechslerEngine({ fsiq: 90, vci: 96, pri: 94, wmi: 82, psi: 92, subs: { DS: 6, LN: 5 }, scatter: 12 });
    const plan = recommendChecklistPlan(checklistPlanContextOf([wechslerEvent(engine)]));
    expect(plan.items.find((i) => i.toolKey === TOOL.speech)?.priority).toBe('core');
    expect(plan.basis).toContain('شنوایی‌شناسی');
  });

  it('قاعدهٔ ۷ — NVLD (شکاف کلامی/غیرکلامی ≥۱۰) → حساب core + DCDQ core + اتیسم optional', () => {
    const engine = wechslerEngine({ fsiq: 100, vci: 110, pri: 95, wmi: 98, psi: 95, subs: { CD: 9, SS: 11 }, scatter: 15 });
    const plan = recommendChecklistPlan(checklistPlanContextOf([wechslerEvent(engine)]));
    expect(plan.items.find((i) => i.toolKey === TOOL.sldCalc)?.priority).toBe('core');
    expect(plan.items.find((i) => i.toolKey === TOOL.dcdq)?.priority).toBe('core');
    expect(plan.items.find((i) => i.toolKey === TOOL.asd)?.priority).toBe('optional');
  });

  it('قاعدهٔ ۸ — الگوی وکسلری + نشانهٔ اجتماعی شرح‌حال → اتیسم core؛ بدون نشانه → optional', () => {
    const engine = wechslerEngine({ fsiq: 88, vci: 88, pri: 86, wmi: 84, psi: 92, subs: { CD: 6, SS: 9 }, scatter: 8 });
    const withSocial = recommendChecklistPlan(checklistPlanContextOf([
      wechslerEvent(engine),
      anamV3({ chief_complaint: 'در بازی با همسالان مشارکت نمی‌کند' })
    ]));
    expect(withSocial.items.find((i) => i.toolKey === TOOL.asd)?.priority).toBe('core');
    const withoutSocial = recommendChecklistPlan(checklistPlanContextOf([wechslerEvent(engine)]));
    expect(withoutSocial.items.find((i) => i.toolKey === TOOL.asd)?.priority).toBe('optional');
  });

  it('قاعدهٔ ۹ — شاخص ضعیف + رخداد بحرانی v3 → SCARED core + SDQ معلم؛ بدون خط قرمز', () => {
    const engine = wechslerEngine({ fsiq: 92, vci: 100, pri: 98, wmi: 94, psi: 84, scatter: 16 });
    const plan = recommendChecklistPlan(checklistPlanContextOf([
      wechslerEvent(engine),
      anamV3({ crisis_event: 'بله — برای خود کودک' })
    ]));
    expect(plan.items.find((i) => i.toolKey === TOOL.scared)?.priority).toBe('core');
    expect(plan.referralFa).toBeNull();
  });

  it('قاعدهٔ ۹ — رخداد بحرانی با نیم‌رخ سالم → SCARED فقط recommended', () => {
    const plan = recommendChecklistPlan(checklistPlanContextOf([
      wechslerEvent(uniformEngine(100, 6)),
      anamV3({ crisis_event: 'بله — برای خانواده' })
    ]));
    expect(plan.items.find((i) => i.toolKey === TOOL.scared)?.priority).toBe('recommended');
  });

  it('قاعدهٔ ۱۰ — PSI منفردِ پایین‌ترین + سابقهٔ آسیب در شرح‌حال → خط قرمز ارجاع پزشکی + SDQ', () => {
    const engine = wechslerEngine({ fsiq: 95, vci: 105, pri: 100, wmi: 95, psi: 78, scatter: 27 });
    const plan = recommendChecklistPlan(checklistPlanContextOf([
      wechslerEvent(engine),
      anamV2({ medical: 'سابقهٔ تصادف و بستری در سال گذشته' })
    ]));
    expect(plan.referralFa).toContain('پزشکی');
    expect(plan.items.find((i) => i.toolKey === TOOL.sdqT)).toBeDefined();
  });

  it('قاعدهٔ ۱۱ — دواستثنایی: شاخص ≥۱۲۰ + ضعف اجرایی + پراکندگی ≥۲۰ → بستهٔ SLD حوزهٔ ضعف + استعداد', () => {
    const engine = wechslerEngine({ fsiq: 110, vci: 125, pri: 122, wmi: 88, psi: 95, scatter: 33 });
    const plan = recommendChecklistPlan(checklistPlanContextOf([wechslerEvent(engine)]));
    const sld = plan.items.find((i) => i.toolKey === TOOL.sldRead);
    expect(sld?.priority).toBe('core');
    expect(sld?.reasonFa).toContain('استعداد');
  });

  it('قاعدهٔ ۱۲ — FSIQ ≥۹۰ با ضعف گام ۵ (WMI) → چک‌لیست توجه recommended (توصیهٔ حوزه‌ای)', () => {
    const engine = wechslerEngine({ fsiq: 100, vci: 100, pri: 102, wmi: 95, psi: 100, scatter: 7, step5Weak: ['WMI'] });
    const plan = recommendChecklistPlan(checklistPlanContextOf([wechslerEvent(engine)]));
    expect(plan.items.find((i) => i.toolKey === TOOL.snapP)?.priority).toBe('recommended');
  });

  it('قاعدهٔ ۱۳ — نیم‌رخ هم‌نواز متوسط → فقط باتری پایهٔ سبک + یادداشت پایان زودهنگام', () => {
    const plan = recommendChecklistPlan(checklistPlanContextOf([wechslerEvent(uniformEngine(100, 10))]));
    expect(plan.items.map((i) => i.toolKey)).toEqual([TOOL.sdqP, TOOL.sdqT]);
    expect(plan.basis).toContain('هم‌نواز');
  });

  it('قاعدهٔ ۱۴ — پراکندگی شدید ≥۲۳ بدون الگو → پرچم اعتبار اجرا، نه چک‌لیست', () => {
    const engine = wechslerEngine({ fsiq: 97, vci: 100, pri: 86, wmi: 95, psi: 100, scatter: 25 });
    const plan = recommendChecklistPlan(checklistPlanContextOf([wechslerEvent(engine)]));
    expect(plan.items.map((i) => i.toolKey)).toEqual([TOOL.sdqP, TOOL.sdqT]);
    expect(plan.basis).toContain('اعتبار');
  });
});

describe('قرارداد خروجی — پایداری و پاکیزگی', () => {
  it('قطعیت — دو فراخوانی با ورودی یکسان → خروجی بایت‌به‌بایت یکسان', () => {
    const events = [
      wechslerEvent(uniformEngine(78)),
      anamV3({ sld_read_concern: 'کم', attention_concern: 'متوسط' }),
      idAdaptEvent(15)
    ];
    const a = recommendChecklistPlan(checklistPlanContextOf(events));
    const b = recommendChecklistPlan(checklistPlanContextOf(events));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('شکل آیتم‌ها — priority در enum، reasonFa غیرخالی، hypothesisKeys حداقل یکی', () => {
    const engine = wechslerEngine({ fsiq: 100, vci: 110, pri: 108, wmi: 97, psi: 102, subs: { DS: 6 }, scatter: 11 });
    const plan = recommendChecklistPlan(checklistPlanContextOf([wechslerEvent(engine)]));
    expect(plan.items.length).toBeGreaterThan(0);
    for (const it of plan.items) {
      expect(['core', 'recommended', 'optional']).toContain(it.priority);
      expect(it.reasonFa.length).toBeGreaterThan(10);
      expect(it.hypothesisKeys.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('ترتیب آیتم‌ها — اولویت core → recommended → optional و داخل هر سطح بر کلید', () => {
    const engine = wechslerEngine({ fsiq: 90, vci: 100, pri: 100, wmi: 88, psi: 88, subs: { AR: 6, CD: 6, IN: 6, DS: 6 }, scatter: 12 });
    const plan = recommendChecklistPlan(checklistPlanContextOf([wechslerEvent(engine)]));
    const rank = { core: 0, recommended: 1, optional: 2 } as const;
    const ranks = plan.items.map((i) => rank[i.priority]);
    expect([...ranks]).toEqual([...ranks].sort((a, b) => a - b));
  });

  it('ابزار موجود پرونده (حتی غیر danger) → از پلن حذف می‌شود', () => {
    const plan = recommendChecklistPlan(checklistPlanContextOf([
      wechslerEvent(uniformEngine(78)),
      toolEvent(TOOL.probeRead)
    ]));
    expect(plan.items.map((i) => i.toolKey)).not.toContain(TOOL.probeRead);
    expect(plan.items.map((i) => i.toolKey)).toContain(TOOL.probeWrite);
  });

  it('قلمرو ابزار — همهٔ آیتم‌ها از باتری رسمی‌اند (بدون کلید خیالی)', () => {
    const known = new Set<string>([
      TOOL.snapP, TOOL.snapT, TOOL.sdqP, TOOL.sdqT, TOOL.scared, TOOL.dcdq,
      TOOL.sldRead, TOOL.sldWri, TOOL.sldCalc, TOOL.asd, TOOL.speech, TOOL.odd,
      TOOL.probeRead, TOOL.probeWrite, TOOL.probeCalc, TOOL.idAdapt, TOOL.anamnesisV3
    ]);
    const samples = [
      checklistPlanContextOf([wechslerEvent(uniformEngine(78))]),
      checklistPlanContextOf([wechslerEvent(uniformEngine(87))]),
      checklistPlanContextOf([wechslerEvent(uniformEngine(100, 10))]),
      checklistPlanContextOf([])
    ];
    for (const ctx of samples) {
      for (const it of recommendChecklistPlan(ctx).items) {
        expect(known.has(it.toolKey)).toBe(true);
      }
    }
  });
});

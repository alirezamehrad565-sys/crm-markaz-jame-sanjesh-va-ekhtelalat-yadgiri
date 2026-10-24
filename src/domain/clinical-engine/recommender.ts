import type { EvidenceEvent } from './types';
import type { ClinicalSignal, WechslerFsiqBand } from './signals';
import { fsiqBandOf } from './signals';
import { WECHSLER_W4_EVENT_KEY, wechslerEngineOutputOf } from './wechsler-link';
import { anamnesisSignalsOf, ANAMNESIS_V3_KEY } from './infer';

export const RECOMMENDER_THRESHOLDS = {
  INDEX_GAP_HIGH: 10,
  INDEX_GAP_SECONDARY: 5,
  LOW_INDEX: 85,
  SCATTER_SEVERE: 23,
  SCATTER_TWO_E: 20,
  STRONG_INDEX: 120,
  EXEC_WEAK: 90,
  SUBTEST_WEAK: 7,
  SIGNAL_ENDORSED: 0.5,
  SIGNAL_STRONG: 0.67,
  NORMAL_INDEX_MAX: 110
} as const;

export const BIF_PLAN_RANGE = { min: 70, max: 84 } as const;
export const LOW_BORDER_RANGE = { min: 85, max: 89 } as const;

export const PLAN_TOOL_KEYS = {
  snapP: 'ce-snap-iv-p-v1',
  snapT: 'ce-snap-iv-t-v1',
  sdqP: 'ce-sdq-p-v1',
  sdqT: 'ce-sdq-t-v1',
  scared: 'ce-scared-p-v1',
  dcdq: 'ce-dcdq-v1',
  sldRead: 'ce-sld-read-v1',
  sldWri: 'ce-sld-wri-v1',
  sldCalc: 'ce-sld-calc-v1',
  asd: 'ce-asd-criteria-v1',
  speech: 'ce-speech-criteria-v1',
  odd: 'ce-odd-criteria-v1',
  probeRead: 'ce-probe-read-v1',
  probeWrite: 'ce-probe-write-v1',
  probeCalc: 'ce-probe-calc-v1',
  idAdapt: 'ce-id-adapt-v1',
  anamnesisV3: 'ce-anamnesis-v3'
} as const;

export type PlanPriority = 'core' | 'recommended' | 'optional';
export type PlanType = 'جامع' | 'تکی';

export interface PlanItem {
  toolKey: string;
  priority: PlanPriority;
  reasonFa: string;
  hypothesisKeys: string[];
}

export interface ChecklistPlan {
  planType: PlanType;
  items: PlanItem[];
  basis: string;
  referralFa: string | null;
}

export interface ChecklistPlanContext {
  wechslerEvent: EvidenceEvent | null;
  anamnesisSignals: ClinicalSignal[];
  anamnesisEvent: EvidenceEvent | null;
  events: EvidenceEvent[];
}

function numOf(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))));
  return Number.isFinite(n) ? n : null;
}

function faNum(n: number): string {
  return String(n).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}

function subtestsOf(engine: Record<string, unknown> | null): Map<string, number> {
  const map = new Map<string, number>();
  const snap = engine?.['snapshot'] as { subtests?: { code?: string; scaled?: unknown }[] } | undefined;
  for (const s of snap?.subtests ?? []) {
    if (typeof s?.code === 'string' && Number.isFinite(Number(s.scaled))) {
      if (!map.has(s.code)) map.set(s.code, Number(s.scaled));
    }
  }
  return map;
}

interface WechslerFacts {
  available: boolean;
  fsiq: number | null;
  fsiqBand: WechslerFsiqBand | null;
  vci: number | null;
  pri: number | null;
  wmi: number | null;
  psi: number | null;
  indexScatter: number | null;
  acid: boolean;
  cad: boolean;
  tirageLow: boolean;
  codingBelowSymbol: boolean;
  digitsSpanLow: boolean;
  letterNumberLow: boolean;
  vocabLow: boolean;
  step5Weak: string[];
}

const ACID_CODES = ['AR', 'CD', 'IN', 'DS'];
const CAD_CODES = ['AR', 'CD', 'DS'];

function extractWechslerFacts(event: EvidenceEvent | null): WechslerFacts {
  const empty: WechslerFacts = {
    available: false, fsiq: null, fsiqBand: null, vci: null, pri: null, wmi: null, psi: null,
    indexScatter: null, acid: false, cad: false, tirageLow: false, codingBelowSymbol: false,
    digitsSpanLow: false, letterNumberLow: false, vocabLow: false, step5Weak: []
  };
  if (!event || event.toolKey !== WECHSLER_W4_EVENT_KEY) return empty;

  const engine = wechslerEngineOutputOf(event) as unknown as Record<string, unknown> | null;
  const profile = (engine?.['profile'] ?? null) as {
    fsiq?: number | null; fsiqBand?: WechslerFsiqBand | null;
    vci?: { scaled?: number } | null; pri?: { scaled?: number } | null;
    wmi?: { scaled?: number } | null; psi?: { scaled?: number } | null;
    indexScatter?: number | null; acid?: unknown; cad?: unknown;
    step5?: { weaknesses?: unknown[] } | null;
  } | null;
  const snap = (engine?.['snapshot'] ?? null) as {
    fsiq?: number | null; indexScatter?: number | null;
    indices?: Record<string, { scaled?: number } | undefined>;
  } | null;

  const manual = (k: string): number | null => numOf(event.payload?.[k]?.value);

  const idxOf = (k: 'VCI' | 'PRI' | 'WMI' | 'PSI'): number | null =>
    profile?.[k.toLowerCase() as 'vci' | 'pri' | 'wmi' | 'psi']?.scaled
    ?? snap?.indices?.[k]?.scaled
    ?? manual(k.toLowerCase());

  const subs = subtestsOf(engine);
  const sub = (code: string): number | null => subs.get(code) ?? null;
  const patternActive = (codes: string[]): boolean => codes.every((c) => {
    const v = sub(c);
    return v !== null && v <= RECOMMENDER_THRESHOLDS.SUBTEST_WEAK;
  });

  const fsiq = profile?.fsiq ?? snap?.fsiq ?? manual('fsiq');
  const fsiqBand: WechslerFsiqBand | null = profile?.fsiqBand ?? (fsiq !== null ? fsiqBandOf(fsiq) : null);
  const scatter = profile?.indexScatter ?? snap?.indexScatter ?? null;
  const step5Weak = (profile?.step5?.weaknesses ?? [])
    .map((w) => (typeof w === 'string' ? w : (w as { key?: string })?.key ?? ''))
    .filter((k) => ['VCI', 'PRI', 'WMI', 'PSI'].includes(k));

  const cd = sub('CD');
  const ss = sub('SS');
  const ds = sub('DS');
  const ln = sub('LN');
  const vo = sub('VO');
  const si = sub('SI');

  return {
    available: engine !== null || fsiq !== null,
    fsiq,
    fsiqBand,
    vci: idxOf('VCI'),
    pri: idxOf('PRI'),
    wmi: idxOf('WMI'),
    psi: idxOf('PSI'),
    indexScatter: scatter,
    acid: profile?.acid != null ? true : patternActive(ACID_CODES),
    cad: profile?.cad != null ? true : patternActive(CAD_CODES),
    tirageLow: (cd !== null && cd <= RECOMMENDER_THRESHOLDS.SUBTEST_WEAK) || (ss !== null && ss <= RECOMMENDER_THRESHOLDS.SUBTEST_WEAK),
    codingBelowSymbol: cd !== null && ss !== null && cd < ss,
    digitsSpanLow: ds !== null && ds <= RECOMMENDER_THRESHOLDS.SUBTEST_WEAK,
    letterNumberLow: ln !== null && ln <= 6,
    vocabLow: (vo !== null && vo <= RECOMMENDER_THRESHOLDS.SUBTEST_WEAK) || (si !== null && si <= RECOMMENDER_THRESHOLDS.SUBTEST_WEAK),
    step5Weak
  };
}

export type IdAdaptLevel = 'low' | 'border' | 'normal' | 'unknown';

function idAdaptLevelOf(events: EvidenceEvent[]): { level: IdAdaptLevel; event: EvidenceEvent | null } {
  const ev = events.find((e) => e.toolKey === PLAN_TOOL_KEYS.idAdapt) ?? null;
  const ss = ev?.analysis?.subscaleScores?.find((s) => s.id === 'id_adapt') ?? null;
  if (!ss) return { level: 'unknown', event: ev };
  const color = ss.color ?? ev?.subscales?.find((d) => d.id === 'id_adapt')?.bands?.find((b) => b.label === ss.band)?.color ?? null;
  if (color === 'danger' || (ss.band ?? '').includes('پایین')) return { level: 'low', event: ev };
  if (color === 'warn' || (ss.band ?? '').includes('مرزی')) return { level: 'border', event: ev };
  if (color === 'ok' || (ss.band ?? '').includes('نرمال')) return { level: 'normal', event: ev };
  return { level: 'unknown', event: ev };
}

const ANAM_TEXT_FIELDS = ['chief_complaint', 'weak_subjects', 'development', 'medical'];

const COMORBID_KEYWORDS: Record<'sld' | 'adhd' | 'social' | 'crisis' | 'injury', string[]> = {
  sld: ['یادگیری', 'خواندن', 'نوشتن', 'املا', 'املاء', 'ریاضی', 'حساب', 'دیکت'],
  adhd: ['بیش‌فعال', 'بیش فعال', 'بی‌قرار', 'کم‌توجه', 'کم توجه', 'تمرکز', 'تکانش'],
  social: ['همسال', 'دوستان', 'ارتباط چشمی', 'اجتماعی', 'انزوا', 'تنهایی بازی'],
  crisis: ['طلاق', 'فوت', 'مهاجرت', 'بحران', 'مرگ', 'جدایی'],
  injury: ['آسیب', 'تصادف', 'صرع', 'تشنج', 'بستری', 'شیمی', 'ضربه']
};

function anamTextOf(event: EvidenceEvent | null): string {
  if (!event?.payload) return '';
  return ANAM_TEXT_FIELDS.map((k) => event.payload?.[k]?.value ?? '').join(' ');
}

function textHas(text: string, words: string[]): boolean {
  return text ? words.some((w) => text.includes(w)) : false;
}

interface AnamFacts {
  signals: Map<string, ClinicalSignal>;
  text: string;
  sld: boolean;
  sldDomains: { read: boolean; write: boolean; calc: boolean };
  attention: boolean;
  emotional: boolean;
  crisis: boolean;
  injury: boolean;
  social: boolean;
}

function extractAnamFacts(ctx: ChecklistPlanContext): AnamFacts {
  const signals = new Map(ctx.anamnesisSignals.map((s) => [s.key, s]));
  const sigVal = (key: string): number | null => signals.get(key)?.value ?? null;
  const text = anamTextOf(ctx.anamnesisEvent);

  const sldDomains = {
    read: (sigVal('anam.sld_read') ?? 0) >= RECOMMENDER_THRESHOLDS.SIGNAL_ENDORSED,
    write: (sigVal('anam.sld_write') ?? 0) >= RECOMMENDER_THRESHOLDS.SIGNAL_ENDORSED,
    calc: (sigVal('anam.sld_calc') ?? 0) >= RECOMMENDER_THRESHOLDS.SIGNAL_ENDORSED
  };
  const sldSignal = sldDomains.read || sldDomains.write || sldDomains.calc;
  const attentionSignal =
    (sigVal('anam.attention') ?? 0) >= RECOMMENDER_THRESHOLDS.SIGNAL_STRONG ||
    (sigVal('anam.hyper') ?? 0) >= RECOMMENDER_THRESHOLDS.SIGNAL_STRONG;
  const emotionalSignal =
    (sigVal('anam.exam_anxiety') ?? 0) >= RECOMMENDER_THRESHOLDS.SIGNAL_ENDORSED ||
    (sigVal('anam.morning_somatic') ?? 0) >= RECOMMENDER_THRESHOLDS.SIGNAL_ENDORSED ||
    (sigVal('anam.crisis_event') ?? 0) >= RECOMMENDER_THRESHOLDS.SIGNAL_ENDORSED;
  const crisisSignal = (sigVal('anam.crisis_event') ?? 0) >= RECOMMENDER_THRESHOLDS.SIGNAL_ENDORSED;

  return {
    signals,
    text,
    sld: sldSignal || textHas(text, COMORBID_KEYWORDS.sld),
    sldDomains,
    attention: attentionSignal || textHas(text, COMORBID_KEYWORDS.adhd),
    emotional: emotionalSignal || textHas(text, COMORBID_KEYWORDS.crisis),
    crisis: crisisSignal || textHas(text, COMORBID_KEYWORDS.crisis),
    injury: textHas(text, COMORBID_KEYWORDS.injury),
    social: textHas(text, COMORBID_KEYWORDS.social)
  };
}

function existingToolsOf(events: EvidenceEvent[]): Set<string> {
  return new Set(events.map((e) => e.toolKey));
}

const PRIORITY_ORDER: Record<PlanPriority, number> = { core: 0, recommended: 1, optional: 2 };

class PlanBuilder {
  items = new Map<string, PlanItem>();
  domains = new Set<string>();
  notes: string[] = [];
  referral: string | null = null;

  add(toolKey: string, priority: PlanPriority, reasonFa: string, ruleKey: string): void {
    const prev = this.items.get(toolKey);
    if (!prev) {
      this.items.set(toolKey, { toolKey, priority, reasonFa, hypothesisKeys: [ruleKey] });
      return;
    }
    if (PRIORITY_ORDER[priority] < PRIORITY_ORDER[prev.priority]) prev.priority = priority;
    if (!prev.hypothesisKeys.includes(ruleKey)) prev.hypothesisKeys.push(ruleKey);
  }
}

export function recommendChecklistPlan(ctx: ChecklistPlanContext): ChecklistPlan {
  const facts = extractWechslerFacts(ctx.wechslerEvent);
  const anam = extractAnamFacts(ctx);
  const adapt = idAdaptLevelOf(ctx.events);
  const existing = existingToolsOf(ctx.events);
  const builder = new PlanBuilder();

  const fsiq = facts.fsiq;
  const band = facts.fsiqBand ?? (fsiq !== null ? fsiqBandOf(fsiq) : null);
  const maxAbility = [facts.vci, facts.pri].filter((v): v is number => v !== null);
  const abilityMax = maxAbility.length ? Math.max(...maxAbility) : null;
  const gapOf = (v: number | null): number | null => (abilityMax !== null && v !== null ? abilityMax - v : null);
  const wmiGap = gapOf(facts.wmi);
  const psiGap = gapOf(facts.psi);

  if (band === 'ID' && adapt.level === 'low') {
    return {
      planType: 'جامع',
      items: [],
      basis: `هوش‌بهر کل ${faNum(fsiq ?? 0)} در بازهٔ ناتوانی هوشی است و انطباق روزمره «پایین» گزارش شده — طبق ملاک تفکیک انطباقی، مسیر ارجاع ناتوانی هوشی (ID) فعال می‌شود و سامانه پلن ابزاری پیشنهاد نمی‌کند؛ تصمیم و ارجاع با متخصص است.`,
      referralFa: 'خط قرمز — مسیر ناتوانی هوشی (FSIQ ≤ ۷۰ همراه انطباق پایین): پلن چک‌لیست رفتاری پیشنهاد نمی‌شود؛ پرونده برای ارجاع تخصصی (روان‌پزشک/مدیر پرونده) علامت خورد.'
    };
  }

  const bifCondition =
    band === 'BIF' ||
    (band === 'ID' && (adapt.level === 'normal' || adapt.level === 'border'));
  if (bifCondition) {
    const bandFa = band === 'BIF' ? 'بازهٔ مرزی/دیرآموزی (۷۰–۸۴)' : 'پایین‌تر از مرز ۷۰ با انطباق حفظ‌شده';
    const probeReason =
      `پلن دیرآموز (FSIQ ${faNum(fsiq ?? 0)} — ${bandFa}): سنجش عملکرد واقعی در سه حوزهٔ پایه برای هدف‌گذاری آموزشی واقع‌بینانه (قاعدهٔ ۵).`;
    for (const key of [PLAN_TOOL_KEYS.probeRead, PLAN_TOOL_KEYS.probeWrite, PLAN_TOOL_KEYS.probeCalc]) {
      builder.add(key, 'core', probeReason, 'r5');
    }
    builder.add(
      PLAN_TOOL_KEYS.idAdapt,
      'core',
      'سنجهٔ انطباق روزمره (فرم خانواده) — تفکیک دیرآموزی از مسیر ناتوانی هوشی (§۳.۱) و زمینهٔ خانه.',
      'r5'
    );
    if (!existing.has(PLAN_TOOL_KEYS.anamnesisV3)) {
      builder.add(
        PLAN_TOOL_KEYS.anamnesisV3,
        'core',
        'شرح‌حال ساخت‌یافتهٔ نسخهٔ ۳ — مبنای تفسیر پروب‌ها و پایش ۶ماههٔ دیرآموزی.',
        'r5'
      );
    }
    builder.domains.add('academic');
    if (adapt.level === 'unknown') {
      builder.notes.push('انطباق روزمره هنوز ثبت نشده — سنجهٔ انطباق روزمره (فرم خانواده) آن را می‌سنجد.');
    }
    if (adapt.level === 'low') {
      builder.notes.push('انطباق روزمره «پایین» گزارش شده — با وجود بازهٔ هوشی مرزی، مسیر ارجاع تکمیلی را بررسی کنید.');
    }
    const sldComorbid = anam.sld || facts.acid;
    const adhdComorbid = anam.attention || facts.cad ||
      (wmiGap !== null && wmiGap >= RECOMMENDER_THRESHOLDS.INDEX_GAP_HIGH) ||
      (psiGap !== null && psiGap >= RECOMMENDER_THRESHOLDS.INDEX_GAP_HIGH);
    if (sldComorbid) {
      const domains: [boolean, string, string][] = [
        [anam.sldDomains.read || (!anam.sld && facts.acid), PLAN_TOOL_KEYS.sldRead, 'خواندن'],
        [anam.sldDomains.write, PLAN_TOOL_KEYS.sldWri, 'نوشتن'],
        [anam.sldDomains.calc, PLAN_TOOL_KEYS.sldCalc, 'حساب']
      ];
      let added = false;
      for (const [on, key, label] of domains) {
        if (!on) continue;
        builder.add(key, 'core', `نشانهٔ هم‌بودی یادگیری در شرح‌حال/نیم‌رخ (الگوی ACID یا شکایت ${label}) — چک‌لیست ملاکی ${label} در کنار پلن دیرآموز (§۳.۱).`, 'r5+r2');
        added = true;
      }
      if (added) builder.domains.add('academic');
    }
    if (adhdComorbid) {
      builder.add(PLAN_TOOL_KEYS.snapP, 'core', 'نشانهٔ هم‌بودی توجه (شرح‌حال یا الگوی CAD/گپ شاخصی) — چک‌لیست توجه خانواده (§۳.۱).', 'r5+r1');
      builder.add(PLAN_TOOL_KEYS.snapT, 'core', 'نشانهٔ هم‌بودی توجه — چک‌لیست توجه معلم برای هم‌گرایی خانه و مدرسه (§۳.۱).', 'r5+r1');
      builder.domains.add('attention');
    }
  } else {
    if (band === 'ID' && adapt.level === 'unknown') {
      builder.add(
        PLAN_TOOL_KEYS.idAdapt,
        'core',
        `هوش‌بهر کل ${faNum(fsiq ?? 0)} پایین‌تر از مرز ۷۰ است ولی انطباق روزمره ثبت نشده — سنجهٔ انطباق روزمره (فرم خانواده) برای تفکیک مسیر ناتوانی هوشی از دیرآموزی لازم است (§۳.۱).`,
        'r6'
      );
      builder.notes.push('تا تکمیل سنجهٔ انطباق، مسیر ID مهر نمی‌شود — ملاک تفکیک انطباقی دو مسیر را جدای هم نگه می‌دارد.');
    }
    applyProfileRules({ builder, facts, anam, band, abilityMax, wmiGap, psiGap });
  }

  const parentSdqPresent = existing.has(PLAN_TOOL_KEYS.sdqP) || existing.has('sdq-parent');
  const teacherSdqPresent = existing.has(PLAN_TOOL_KEYS.sdqT);
  if (!parentSdqPresent) {
    builder.add(
      PLAN_TOOL_KEYS.sdqP,
      'core',
      'باتری پایهٔ غربال عمومی — پرسش‌نامهٔ رفتار کودک فرم خانواده، جدا از هر الگوی پروفایلی (قاعدهٔ همیشه‌برقرار).',
      'r0'
    );
  }
  if (!teacherSdqPresent) {
    builder.add(
      PLAN_TOOL_KEYS.sdqT,
      'core',
      'باتری پایهٔ غربال عمومی — فرم معلم برای هم‌گرایی خانه و مدرسه (قاعدهٔ همیشه‌برقرار).',
      'r0'
    );
  }
  if (!parentSdqPresent || !teacherSdqPresent) {
    builder.domains.add('behavior'); // — باتری رفتاری پایه (m186: جایگزینِ پوششِ «فرم جامع»)
  }

  const items = [...builder.items.values()].filter((it) => {
    if (existing.has(it.toolKey) && it.toolKey !== PLAN_TOOL_KEYS.anamnesisV3) return false;
    return true;
  });
  items.sort((a, b) =>
    PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || (a.toolKey < b.toolKey ? -1 : a.toolKey > b.toolKey ? 1 : 0)
  );

  const planType: PlanType = builder.domains.size >= 2 ? 'جامع' : 'تکی';

  return {
    planType,
    items,
    basis: buildBasis({ facts, anam, adapt, domains: builder.domains, notes: builder.notes, planType, band, fsiq }),
    referralFa: builder.referral
  };
}

function applyProfileRules(args: {
  builder: PlanBuilder;
  facts: WechslerFacts;
  anam: AnamFacts;
  band: WechslerFsiqBand | null;
  abilityMax: number | null;
  wmiGap: number | null;
  psiGap: number | null;
}): void {
  const { builder, facts, anam, band, abilityMax, wmiGap, psiGap } = args;
  if (!facts.available) {
    builder.notes.push('نیم‌رخ وکسلر هنوز ثبت نشده — پیشنهادها پس از ثبت وکسلر کامل می‌شود.');
    return;
  }
  const T = RECOMMENDER_THRESHOLDS;

  const sldGap = (wmiGap !== null && wmiGap >= T.INDEX_GAP_HIGH) || (psiGap !== null && psiGap >= T.INDEX_GAP_HIGH);
  if (sldGap && (facts.tirageLow || facts.acid || facts.cad)) {
    const domainOf: [boolean, string, string, string][] = [
      [anam.sldDomains.read, PLAN_TOOL_KEYS.sldRead, 'خواندن', PLAN_TOOL_KEYS.probeRead],
      [anam.sldDomains.write, PLAN_TOOL_KEYS.sldWri, 'نوشتن', PLAN_TOOL_KEYS.probeWrite],
      [anam.sldDomains.calc, PLAN_TOOL_KEYS.sldCalc, 'حساب', PLAN_TOOL_KEYS.probeCalc]
    ];
    const declared = domainOf.filter(([on]) => on);
    const chosen = declared.length ? declared : [domainOf[0]];
    for (const [, cKey, label, pKey] of chosen) {
      builder.add(cKey, 'core', `گپ ${wmiGap !== null && wmiGap >= T.INDEX_GAP_HIGH ? 'حافظهٔ کاری' : 'سرعت پردازش'} ≥۱۰ نمره از توان${facts.acid ? ' با الگوی ACID' : facts.cad ? ' با الگوی CAD' : ' همراه تیراژ ضعیف'} — چک‌لیست ملاکی ${label} (قاعدهٔ ۲).`, 'r2');
      builder.add(pKey, 'core', `پروب ${label} — سنجش عملکرد واقعی در همان حوزهٔ شکایت (قاعدهٔ ۲).`, 'r2');
    }
    for (const [, cKey, label] of domainOf) {
      if (chosen.some(([, k]) => k === cKey)) continue;
      builder.add(cKey, 'optional', `حوزهٔ ${label} — برای تفریق هم‌بودی SLD در کنار حوزهٔ اصلی (قاعدهٔ ۲).`, 'r2');
    }
    builder.domains.add('academic');
  }

  const gapHighSecond =
    (wmiGap !== null && wmiGap >= T.INDEX_GAP_HIGH && psiGap !== null && psiGap >= T.INDEX_GAP_SECONDARY) ||
    (psiGap !== null && psiGap >= T.INDEX_GAP_HIGH && wmiGap !== null && wmiGap >= T.INDEX_GAP_SECONDARY);
  if (gapHighSecond && !builder.items.has(PLAN_TOOL_KEYS.snapP)) {
    const strong = facts.digitsSpanLow || anam.attention;
    builder.add(PLAN_TOOL_KEYS.snapP, 'core', `گپ توجه (حافظهٔ کاری/سرعت پردازش) از توان مشاهده می‌شود${facts.digitsSpanLow ? ' با فراخنای ارقام ضعیف' : ''} — چک‌لیست توجه خانواده (قاعدهٔ ۱).`, 'r1');
    builder.add(PLAN_TOOL_KEYS.snapT, 'core', 'چک‌لیست توجه معلم — هم‌گرایی خانه و مدرسه برای تصمیم شک بیش‌فعالی (قاعدهٔ ۱).', 'r1');
    builder.add(PLAN_TOOL_KEYS.sdqT, 'recommended', 'زیرمقیاس بیش‌فعالی SDQ معلم — مکمل رتبه‌بندی توجه (قاعدهٔ ۱).', 'r1');
    if (strong) builder.notes.push('شکایت توجه در شرح‌حال با نیم‌رخ وکسلر هم‌گراست.');
    builder.domains.add('attention');
  }

  if (facts.vci !== null && facts.vci <= T.LOW_INDEX && facts.vocabLow) {
    builder.add(PLAN_TOOL_KEYS.speech, 'core', `شاخص کلامی ${faNum(facts.vci)} با واژگان/تشابهات ضعیف — چک‌لیست زبان و گفتار (قاعدهٔ ۳).`, 'r3');
    builder.add(PLAN_TOOL_KEYS.probeRead, 'recommended', 'پروب روانی‌خواندن در سن مدرسه — تفکیک زبان از خواندن (قاعدهٔ ۳).', 'r3');
    builder.domains.add('language');
  }

  if (facts.wmi !== null && facts.wmi <= T.LOW_INDEX && (facts.digitsSpanLow || facts.letterNumberLow)) {
    builder.add(PLAN_TOOL_KEYS.speech, 'core', `حافظهٔ کاری ${faNum(facts.wmi)} با فراخنای ارقام/توالی حرف-عدد ضعیف — چک‌لیست زبان + بررسی پردازش شنیداری (قاعدهٔ ۴).`, 'r4');
    builder.notes.push('الگوی پردازش شنیداری — ارجاع شنوایی‌شناسی (APD) در نوبت‌گیری در نظر گرفته شود.');
    builder.domains.add('language');
  }

  if (facts.vci !== null && facts.pri !== null && facts.psi !== null &&
      facts.vci - facts.pri >= T.INDEX_GAP_HIGH && facts.vci - facts.psi >= T.INDEX_GAP_HIGH) {
    builder.add(PLAN_TOOL_KEYS.sldCalc, 'core', 'شکاف کلامی/غیرکلامی ≥۱۰ — چک‌لیست ملاکی حساب (تقریب عملیاتی NVLD — قاعدهٔ ۷).', 'r7');
    builder.add(PLAN_TOOL_KEYS.dcdq, 'core', 'پرسش‌نامهٔ هماهنگی حرکتی — مولفهٔ حرکتی دقیق NVLD (قاعدهٔ ۷).', 'r7');
    builder.add(PLAN_TOOL_KEYS.asd, 'optional', 'چک‌لیست اتیسم — فقط برای تفریق غربال اجتماعی (قاعدهٔ ۷).', 'r7');
    builder.domains.add('academic');
    builder.domains.add('motor');
  }

  if (!builder.items.has(PLAN_TOOL_KEYS.asd) &&
      ((facts.wmi !== null && facts.wmi <= T.LOW_INDEX) || (facts.psi !== null && facts.psi <= T.LOW_INDEX)) &&
      facts.codingBelowSymbol && !facts.acid && !facts.cad) {
    if (anam.social) {
      builder.add(PLAN_TOOL_KEYS.asd, 'core', 'الگوی وکسلری نشانه‌دار + نشانهٔ اجتماعی شرح‌حال — چک‌لیست اتیسم (قاعدهٔ ۸).', 'r8');
    } else {
      builder.add(PLAN_TOOL_KEYS.asd, 'optional', 'الگوی وکسلری مشکوک ولی بدون نشانهٔ اجتماعی شرح‌حال — چک‌لیست اتیسم با احتیاط (قاعدهٔ ۸).', 'r8');
    }
    builder.domains.add('social');
  }

  if (((facts.psi !== null && facts.psi <= T.LOW_INDEX) || (facts.wmi !== null && facts.wmi <= T.LOW_INDEX)) && anam.crisis) {
    builder.add(PLAN_TOOL_KEYS.scared, 'core', 'شاخص ضعیف همراه رخداد مهم زندگی در شرح‌حال — پرسش‌نامهٔ اضطراب کودک (قاعدهٔ ۹).', 'r9');
    builder.add(PLAN_TOOL_KEYS.sdqT, 'recommended', 'زیرمقیاس هیجانی SDQ معلم — مکمل عامل خلقی (قاعدهٔ ۹).', 'r9');
    builder.domains.add('emotional');
  } else if (anam.crisis) {
    builder.add(PLAN_TOOL_KEYS.scared, 'recommended', 'رخداد مهم زندگی در شرح‌حال — غربال اضطراب حتی با نیم‌رخ سالم (قاعدهٔ ۹).', 'r9');
    builder.domains.add('emotional');
  }

  if (facts.psi !== null && facts.wmi !== null && facts.vci !== null && facts.pri !== null &&
      facts.psi < facts.wmi && facts.psi < facts.vci && facts.psi < facts.pri &&
      abilityMax !== null && abilityMax - facts.psi >= T.INDEX_GAP_HIGH && anam.injury) {
    builder.add(PLAN_TOOL_KEYS.sdqT, 'recommended', 'PSI منفردِ پایین‌ترین با سابقهٔ آسیب/بیماری — باتری پایه در کنار ارجاع پزشکی (قاعدهٔ ۱۰).', 'r10');
    builder.referral = 'خط قرمز — الگوی PSI منفردِ پایین‌ترین همراه سابقهٔ آسیب/بیماری در شرح‌حال: ارجاع پزشکی (مغز و اعصاب) پیش از مداخله آموزشی بررسی شود.';
    builder.domains.add('attention');
  }

  const strongIdx = [facts.vci, facts.pri].filter((v): v is number => v !== null && v >= T.STRONG_INDEX);
  const execWeak = (facts.wmi !== null && facts.wmi <= T.EXEC_WEAK) || (facts.psi !== null && facts.psi <= T.EXEC_WEAK);
  if (strongIdx.length > 0 && execWeak && facts.indexScatter !== null && facts.indexScatter >= T.SCATTER_TWO_E) {
    const weakDomain = anam.sldDomains.write ? [PLAN_TOOL_KEYS.sldWri, 'نوشتن'] : anam.sldDomains.calc ? [PLAN_TOOL_KEYS.sldCalc, 'حساب'] : [PLAN_TOOL_KEYS.sldRead, 'خواندن'];
    builder.add(weakDomain[0] as string, 'core', `شاخص قوی ${faNum(Math.max(...strongIdx))} با ضعف اجرایی و پراکندگی ${faNum(facts.indexScatter)} — بستهٔ SLD حوزهٔ ضعف (${weakDomain[1]}) + تگ استعداد (قاعدهٔ ۱۱).`, 'r11');
    builder.domains.add('academic');
  }

  if (facts.fsiq !== null && facts.fsiq >= 90 && facts.step5Weak.length > 0) {
    const map: Record<string, [string, string]> = {
      WMI: [PLAN_TOOL_KEYS.snapP, 'حافظهٔ کاری'],
      PSI: [PLAN_TOOL_KEYS.snapP, 'سرعت پردازش'],
      VCI: [PLAN_TOOL_KEYS.speech, 'کلامی'],
      PRI: [PLAN_TOOL_KEYS.dcdq, 'دیداری-حرکتی']
    };
    const seen = new Set<string>();
    const domainOfKey: Record<string, string> = { WMI: 'attention', PSI: 'attention', VCI: 'language', PRI: 'motor' };
    for (const k of facts.step5Weak) {
      const m = map[k];
      if (!m || seen.has(m[0])) continue;
      seen.add(m[0]);
      builder.add(m[0], 'recommended', `گام ۵ پروفایل شخصی: ضعف ${m[1]} با هوش‌بهر کل سالم — چک‌لیست همان حوزه (قاعدهٔ ۱۲).`, 'r12');
      builder.domains.add(domainOfKey[k] ?? 'attention');
    }
  }

  if (band === 'LOW_BORDER' &&
      (facts.indexScatter === null || facts.indexScatter < T.SCATTER_SEVERE) && !facts.acid && !facts.cad &&
      !builder.items.has(PLAN_TOOL_KEYS.sldRead) && !builder.items.has(PLAN_TOOL_KEYS.sldWri) && !builder.items.has(PLAN_TOOL_KEYS.sldCalc) &&
      !builder.items.has(PLAN_TOOL_KEYS.snapP)) {
    builder.notes.push('نیم‌رخ «مرز پایین» یکنواخت — پایش دوره‌ای توصیه می‌شود؛ ابزار سنگین اضافه پیشنهاد نمی‌شود (§۳.۱).');
  }
  if (band === 'AVERAGE' &&
      facts.vci !== null && facts.pri !== null && facts.wmi !== null && facts.psi !== null &&
      [facts.vci, facts.pri, facts.wmi, facts.psi].every((v) => v >= 90 && v <= T.NORMAL_INDEX_MAX) &&
      (facts.indexScatter ?? 0) <= T.SCATTER_SEVERE - 1 && !facts.acid && !facts.cad && builder.items.size === 0) {
    builder.notes.push('نیم‌رخ هم‌نواز در بازهٔ متوسط — باتری پایهٔ سبک و پایان زودهنگام مسیر شناسایی (قاعدهٔ ۱۳).');
  }
  if ((facts.indexScatter ?? 0) >= T.SCATTER_SEVERE && !facts.acid && !facts.cad && builder.items.size === 0) {
    builder.notes.push(`پراکندگی بین‌شاخصی ${faNum(facts.indexScatter ?? 0)} (≥۲۳) بدون الگوی معنادار — ابتدا اعتبار اجرای آزمون بازبینی شود؛ تفسیر به سطح شاخص‌ها منتقل می‌شود (قاعدهٔ ۱۴).`);
  }

  void band;
}

const DOMAIN_FA: Record<string, string> = {
  academic: 'یادگیری',
  attention: 'توجه',
  language: 'زبان',
  emotional: 'هیجان',
  motor: 'حرکتی',
  social: 'اجتماعی'
};

const ADAPT_FA: Record<IdAdaptLevel, string> = {
  low: 'پایین',
  border: 'مرزی',
  normal: 'نرمال',
  unknown: 'ثبت‌نشده'
};

function buildBasis(args: {
  facts: WechslerFacts;
  anam: AnamFacts;
  adapt: { level: IdAdaptLevel };
  domains: Set<string>;
  notes: string[];
  planType: PlanType;
  band: WechslerFsiqBand | null;
  fsiq: number | null;
}): string {
  const { facts, anam, adapt, domains, notes, planType } = args;
  const parts: string[] = [];
  parts.push(facts.available && facts.fsiq !== null
    ? `نیم‌رخ وکسلر: FSIQ ${faNum(facts.fsiq)}${args.band ? ` — ${bandLabelFa(args.band)}` : ''}`
    : 'نیم‌رخ وکسلر: ثبت‌نشده');
  parts.push(anam.signals.size > 0
    ? `شرح‌حال ساخت‌یافته: ${faNum(anam.signals.size)} نشانهٔ ثبت‌شده`
    : (anam.text.length > 0 ? 'شرح‌حال: نسخهٔ قدیمی (بدون سیگنال ساخت‌یافته)' : 'شرح‌حال نسخهٔ ۳: ثبت‌نشده'));
  parts.push(`انطباق روزمره: ${ADAPT_FA[adapt.level]}`);
  const domainFa = [...domains].map((d) => DOMAIN_FA[d] ?? d);
  parts.push(domainFa.length ? `حوزه‌های درگیر: ${domainFa.join('، ')}` : 'حوزهٔ درگیر مشخص نشده');
  parts.push(`پلن پیشنهادی: ${planType}`);
  return [...parts, ...notes].join(' — ');
}

function bandLabelFa(band: WechslerFsiqBand): string {
  const map: Partial<Record<WechslerFsiqBand, string>> = {
    ID: 'بازهٔ ناتوانی هوشی',
    BIF: 'بازهٔ مرزی/دیرآموزی (۷۰–۸۴)',
    LOW_BORDER: 'مرز پایین (۸۵–۸۹)',
    AVERAGE: 'متوسط',
    HIGH_AVERAGE: 'بالاتر از متوسط',
    SUPERIOR: 'عالی',
    GIFTED: 'استعداد'
  };
  return map[band] ?? band;
}

function latestByKey(events: EvidenceEvent[]): Map<string, EvidenceEvent> {
  const map = new Map<string, EvidenceEvent>();
  for (const e of events) {
    if (!map.has(e.toolKey)) map.set(e.toolKey, e);
  }
  return map;
}

export function checklistPlanContextOf(events: EvidenceEvent[]): ChecklistPlanContext {
  const done = events.filter((e) => e.status === 'completed');
  const latest = latestByKey(done);
  const anamEvent = latest.get(ANAMNESIS_V3_KEY) ?? latest.get('ce-anamnesis-v2') ?? null;
  return {
    wechslerEvent: latest.get(WECHSLER_W4_EVENT_KEY) ?? null,
    anamnesisSignals: anamnesisSignalsOf(latest.get(ANAMNESIS_V3_KEY)),
    anamnesisEvent: anamEvent,
    events: done
  };
}

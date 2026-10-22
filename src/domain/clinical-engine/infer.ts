import type {
  EvidenceEvent,
  EvidenceRule,
  InferenceOutput,
  ProbeDef,
  RankedHypothesis,
  RuleSet,
  ConfidenceLevel,
  DsmCriterionStatus
} from './types';
import { BATTERY_VERSION } from './types';
import type { CaseEventBand } from '@domain/case-events';
import { RULES, rulesOf, CONFIDENCE_THRESHOLDS, ODD_MIN_FULL_CRITERIA, ASD_B_FULL_CRITERIA, BIF_IQ_RANGE, SCARED_SCHOOL_CUTOFF, FSIQ_BAND_BIF, ID_PATH_MAX_FSIQ, SCATTER_UNIFORM_MAX, fsiqBandOf } from './rules';
import { DSM_RECORDS } from './dsm-criteria';
import { targetOf } from './targets';
import { WCPM_NORM_50TH, ALPHA_15S_NORM, DIGITS_2MIN_NORM, batteryDef } from './instruments';
import { WECHSLER_W4_EVENT_KEY, wechslerEngineOutputOf } from './wechsler-link';
import type { ClinicalSignal, SignalDomain, WechslerFsiqBand } from './signals';
import { makeSignal, sortSignals } from './signals';
import { convergenceSourceOfTool, convergenceItemOf, idAdaptLevelOfEvent, ID_ADAPT_EVENT_KEY, type ConvergenceSource, type ConvergenceItem } from './convergence';

export const PROBES: ProbeDef[] = [
  { toolKey: 'ce-probe-read-v1', valueField: 'wcpm', gradeField: 'text_grade', norm: WCPM_NORM_50TH, fa: 'پروب روانی‌خواندن' },
  { toolKey: 'ce-probe-write-v1', valueField: 'alpha15s', gradeField: 'dict_grade', norm: ALPHA_15S_NORM, fa: 'پروب روانی‌نوشتن' },
  { toolKey: 'ce-probe-calc-v1', valueField: 'digits2min', gradeField: 'calc_grade', norm: DIGITS_2MIN_NORM, fa: 'پروب سلیقۀ حساب' }
];

function probeDefOf(toolKey: string): ProbeDef | undefined {
  return PROBES.find((p) => p.toolKey === toolKey);
}

export const ANAMNESIS_V2_KEY = 'ce-anamnesis-v2';
export const ANAMNESIS_V3_KEY = 'ce-anamnesis-v3';

export function latestAnamnesisKeyOf(latest: Map<string, EvidenceEvent>): string {
  return latest.has(ANAMNESIS_V3_KEY) ? ANAMNESIS_V3_KEY : ANAMNESIS_V2_KEY;
}

const ANAMNESIS_V3_LEVEL4: Record<string, number> = {
  'بدون نگرانی': 0,
  'کم': 0.33,
  'متوسط': 0.67,
  'زیاد — نگران‌کننده': 1
};

const level4Of = (label: string): number | null => {
  const v = ANAMNESIS_V3_LEVEL4[label];
  return v === undefined ? null : v;
};

const ANAMNESIS_V3_SIGNAL_SPEC: { fieldKey: string; sigKey: string; domain: SignalDomain; faHead: string; valueOf: (label: string) => number | null }[] = [
  { fieldKey: 'sld_read_concern', sigKey: 'anam.sld_read', domain: 'academic', faHead: 'خواندن', valueOf: level4Of },
  { fieldKey: 'sld_write_concern', sigKey: 'anam.sld_write', domain: 'academic', faHead: 'نوشتن و املا', valueOf: level4Of },
  { fieldKey: 'sld_calc_concern', sigKey: 'anam.sld_calc', domain: 'academic', faHead: 'ریاضی', valueOf: level4Of },
  { fieldKey: 'attention_concern', sigKey: 'anam.attention', domain: 'attention', faHead: 'توجه و تمرکز', valueOf: level4Of },
  { fieldKey: 'hyper_concern', sigKey: 'anam.hyper', domain: 'attention', faHead: 'بی‌قراری و تکانش', valueOf: level4Of },
  { fieldKey: 'exam_anxiety', sigKey: 'anam.exam_anxiety', domain: 'emotional', faHead: 'اضطراب امتحان', valueOf: level4Of },
  { fieldKey: 'morning_somatic', sigKey: 'anam.morning_somatic', domain: 'emotional', faHead: 'نشانهٔ جسمانی صبحگاهی', valueOf: (l) => ({ 'نه': 0, 'گاهی': 0.5, 'بیشتر روزها — بدون علت پزشکی': 1 }[l] ?? null) },
  { fieldKey: 'crisis_event', sigKey: 'anam.crisis_event', domain: 'emotional', faHead: 'رویداد بحرانی اخیر', valueOf: (l) => ({ 'نه': 0, 'بله — برای خود کودک': 1, 'بله — برای خانواده': 0.75, 'نمی‌خواهم بگویم': 0.5 }[l] ?? null) },
  { fieldKey: 'sensory_concern', sigKey: 'anam.sensory', domain: 'motor', faHead: 'حساسیت حسی', valueOf: level4Of },
  { fieldKey: 'home_language', sigKey: 'anam.home_language', domain: 'language', faHead: 'زبان گفت‌وگوی خانه', valueOf: (l) => ({ 'فارسی': 0, 'دوزبانه': 0.5, 'غیرفارسی': 1 }[l] ?? null) },
  { fieldKey: 'decline_scope', sigKey: 'anam.decline_scope', domain: 'academic', faHead: 'دامنهٔ افت تحصیلی', valueOf: (l) => ({ 'افت محسوسی ندارم': 0, 'فقط یکی دو درس مشخص': 0.33, 'بیشترِ درس‌ها افت کرده‌اند': 0.67, 'همهٔ درس‌ها با هم افت کرده‌اند': 1 }[l] ?? null) },
  { fieldKey: 'absence_level', sigKey: 'anam.absence', domain: 'academic', faHead: 'غیبت از مدرسه', valueOf: (l) => ({ 'ندارد': 0, 'کمتر از یک ماه': 0.33, 'یک تا سه ماه': 0.67, 'بیش از سه ماه': 1 }[l] ?? null) },
  { fieldKey: 'school_change', sigKey: 'anam.school_change', domain: 'academic', faHead: 'تغییر مدرسه (سه سال اخیر)', valueOf: (l) => ({ 'هیچ': 0, 'یک بار': 0.33, 'دو بار': 0.67, 'سه بار یا بیشتر': 1 }[l] ?? null) }
];

function anamV3ValueOf(fieldKey: string, label: string): number | null {
  const spec = ANAMNESIS_V3_SIGNAL_SPEC.find((s) => s.fieldKey === fieldKey);
  return spec ? spec.valueOf(label) : null;
}

export function anamnesisSignalsOf(event: EvidenceEvent | undefined): ClinicalSignal[] {
  if (!event || event.toolKey !== ANAMNESIS_V3_KEY || !event.payload) return [];
  const signals: ClinicalSignal[] = [];
  for (const spec of ANAMNESIS_V3_SIGNAL_SPEC) {
    const label = event.payload[spec.fieldKey]?.value;
    if (!label) continue;
    const value = spec.valueOf(label);
    if (value === null) continue; // گزینهٔ خارج از قرارداد — نادیده (دادهٔ آینده‌پذیر)
    signals.push(makeSignal(spec.domain, spec.sigKey, value, 'anamnesis', `${spec.faHead}: ${label}`));
  }
  return sortSignals(signals);
}

interface SldProcessingSpec {
  related: ('vci' | 'pri' | 'wmi' | 'psi')[];
  contrast: ('vci' | 'pri' | 'wmi' | 'psi')[];
  faHead: string;
  mechanism: string;
}

const SLD_FA_OF: Record<string, string> = { vci: 'درک کلامی', pri: 'استدلال ادراکی', wmi: 'حافظهٔ فعال', psi: 'سرعت پردازش' };

const SLD_PROCESSING: Record<string, SldProcessingSpec> = {
  dyslexia: {
    related: ['wmi', 'psi'],
    contrast: ['vci', 'pri'],
    faHead: 'خواندن',
    mechanism: 'فشار بر نگه‌داشت زبانی و خودکارسازی'
  },
  dysgraphia: {
    related: ['wmi', 'psi'],
    contrast: ['vci', 'pri'],
    faHead: 'نوشتن',
    mechanism: 'فشار بر نگه‌داشت در حین تولید نوشتاری و خودکارسازی دیداری-حرکتی'
  },
  dyscalculia: {
    related: ['wmi', 'pri', 'psi'],
    contrast: ['vci'],
    faHead: 'حساب',
    mechanism: 'فشار بر حافظهٔ کاری عددی، استدلال دیداری-منطقی و خودکارسازی'
  }
};

const isWeakRelated = (facts: { vci: number | null; pri: number | null; wmi: number | null; psi: number | null; step5Weak: string[] }, key: 'vci' | 'pri' | 'wmi' | 'psi'): boolean =>
  (facts[key] !== null && facts[key] < 85) || facts.step5Weak.includes(key.toUpperCase());

const isIntactContrast = (facts: { vci: number | null; pri: number | null; wmi: number | null; psi: number | null; step5Weak: string[] }, key: 'vci' | 'pri' | 'wmi' | 'psi'): boolean =>
  facts[key] !== null && facts[key] >= 90 && !facts.step5Weak.includes(key.toUpperCase());

function completed(events: EvidenceEvent[]): EvidenceEvent[] {
  return events.filter((e) => e.status === 'completed');
}

function faNum(n: number): string {
  return String(n).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}

function wechslerProfileFactsOf(event: EvidenceEvent | undefined): {
  fsiq: number | null;
  band: WechslerFsiqBand | null;
  indexScatter: number | null;
  vci: number | null;
  pri: number | null;
  wmi: number | null;
  psi: number | null;
  step5Weak: string[];
} {
  const profile = wechslerEngineOutputOf(event)?.profile ?? null;
  const idxNum = (x?: { scaled?: number | null } | null): number | null =>
    typeof x?.scaled === 'number' ? x.scaled : null;
  const fsiq = typeof profile?.fsiq === 'number' ? profile.fsiq : null;
  const bandRaw = typeof profile?.fsiqBand === 'string' ? profile.fsiqBand : null;
  const band = (bandRaw as WechslerFsiqBand | null) ?? (fsiq !== null ? fsiqBandOf(fsiq) : null);
  const scatter = typeof profile?.indexScatter === 'number' ? profile.indexScatter : null;
  const step5Weak = (profile?.step5?.weaknesses ?? []).filter((k): k is string => typeof k === 'string');
  return {
    fsiq,
    band,
    indexScatter: scatter,
    vci: idxNum(profile?.vci),
    pri: idxNum(profile?.pri),
    wmi: idxNum(profile?.wmi),
    psi: idxNum(profile?.psi),
    step5Weak
  };
}

function latestPerTool(events: EvidenceEvent[]): Map<string, EvidenceEvent> {
  const map = new Map<string, EvidenceEvent>();
  for (const e of events) {
    if (!map.has(e.toolKey)) map.set(e.toolKey, e);
  }
  return map;
}

function latestTwoPerTool(events: EvidenceEvent[]): Map<string, EvidenceEvent[]> {
  const map = new Map<string, EvidenceEvent[]>();
  for (const e of events) {
    const arr = map.get(e.toolKey);
    if (arr) {
      if (arr.length < 2) arr.push(e);
    } else {
      map.set(e.toolKey, [e]);
    }
  }
  return map;
}

function colorOfBandLabel(label: string | null | undefined, bands: CaseEventBand[] | null | undefined): 'ok' | 'warn' | 'danger' | null {
  if (!label || !bands) return null;
  return bands.find((b) => b.label === label)?.color ?? null;
}

function num(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))));
  return Number.isFinite(n) ? n : null;
}

function payloadText(e: EvidenceEvent, keys: string[]): string {
  if (!e.payload) return '';
  return keys.map((k) => e.payload?.[k]?.value ?? '').join(' ');
}

type BandColor = 'ok' | 'warn' | 'danger';

function ruleColor(rule: EvidenceRule, event: EvidenceEvent | undefined): BandColor | null {
  if (!event) return null;

  if (rule.kind === 'probe') {
    const def = probeDefOf(rule.toolKey);
    if (!def) return null;
    const value = num(event.payload?.[def.valueField]?.value);
    const grade = event.payload?.[def.gradeField]?.value ?? null;
    if (value === null || !grade) return null;
    const n = def.norm[grade];
    if (!n) return null;
    return value < n * 0.8 ? 'danger' : 'ok';
  }

  if (rule.kind === 'wechsler') {
    const fsiq = num(event.payload?.['fsiq']?.value);
    if (fsiq === null) return null;
    return fsiq >= BIF_IQ_RANGE.min && fsiq <= BIF_IQ_RANGE.max ? 'danger' : 'ok';
  }

  if (rule.kind === 'anamnesis') return null;

  const analysis = event.analysis;
  if (!analysis) return null;
  if (rule.subscaleId) {
    const ss = analysis.subscaleScores?.find((s) => s.id === rule.subscaleId);
    if (!ss) return null;
    if (ss.color) return ss.color;
    const def = event.subscales?.find((s) => s.id === rule.subscaleId);
    return colorOfBandLabel(ss.band, def?.bands ?? null);
  }
  return colorOfBandLabel(analysis.band, event.bands);
}

const ANAMNESIS_TEXT_FIELDS = ['chief_complaint', 'weak_subjects', 'development', 'medical'];

function anamnesisFlagFor(targetKey: string, event: EvidenceEvent | undefined): boolean {
  if (event && event.toolKey === ANAMNESIS_V3_KEY) {
    if (targetKey === 'slow_learner') {
      const v = anamV3ValueOf('decline_scope', event.payload?.['decline_scope']?.value ?? '');
      return v !== null && v >= 0.67;
    }
    if (targetKey === 'anxiety') {
      const v = anamV3ValueOf('morning_somatic', event.payload?.['morning_somatic']?.value ?? '');
      return v !== null && v >= 0.5;
    }
    return false;
  }
  if (!event || event.toolKey !== ANAMNESIS_V2_KEY) return false;
  const text = payloadText(event, ANAMNESIS_TEXT_FIELDS);
  if (!text) return false;
  if (targetKey === 'slow_learner') {
    return text.includes('افت') && (text.includes('همه') || text.includes('همۀ'));
  }
  if (targetKey === 'anxiety') {
    return text.includes('صبح') && ['دل‌درد', 'دل درد', 'تهوع', 'شکم', 'استفراغ', 'سردرد'].some((w) => text.includes(w));
  }
  return false;
}

function criterionStatus(criterionId: string, ruleSet: RuleSet, perTool: Map<string, EvidenceEvent[]>): DsmCriterionStatus {
  const entries = ruleSet.criteriaMap.filter((m) => m.criterionId === criterionId);
  let metCount = 0;
  let answeredEvents = 0;
  let zeroOnly = true;
  const sources: string[] = [];

  for (const entry of entries) {
    for (const event of perTool.get(entry.toolKey) ?? []) {
      const values = entry.itemRefs.map((k) => num(event.payload?.[k]?.value));
      if (!values.some((v) => v !== null)) continue;
      answeredEvents += 1;
      const endorsed = values.some((v) => v !== null && v >= entry.passScore);
      const partial = values.some((v) => v !== null && v > 0 && v < entry.passScore);
      if (endorsed) {
        metCount += 1;
        zeroOnly = false;
      } else if (partial) {
        zeroOnly = false;
      }
      sources.push(event.typeTitle);
    }
  }

  if (metCount >= 2) return { criterionId, status: 'met', sources };
  if (metCount === 1) return { criterionId, status: 'partial', sources };
  if (answeredEvents > 0 && zeroOnly) return { criterionId, status: 'not_met', sources };
  return { criterionId, status: 'unknown', sources };
}

function fullCriteriaCount(targetKey: string, perTool: Map<string, EvidenceEvent[]>): number {
  const ruleSet = rulesOf(targetKey);
  if (!ruleSet) return 0;
  let full = 0;
  for (const entry of ruleSet.criteriaMap) {
    if (!entry.criterionId.startsWith(`${targetKey}.a`)) continue;
    const endorsed = (perTool.get(entry.toolKey) ?? []).some((event) =>
      entry.itemRefs.some((k) => {
        const v = num(event.payload?.[k]?.value);
        return v !== null && entry.passScore > 0 && v >= entry.passScore;
      })
    );
    if (endorsed) full += 1;
  }
  return full;
}

function autismPattern(perTool: Map<string, EvidenceEvent[]>): { allA: boolean; bMet: number } {
  const ruleSet = rulesOf('autism');
  if (!ruleSet) return { allA: false, bMet: 0 };
  const status = (id: string) => criterionStatus(id, ruleSet, perTool).status;
  const allA = ['autism.a1', 'autism.a2', 'autism.a3'].every((id) => status(id) === 'met');
  const bMet = ['autism.b1', 'autism.b2', 'autism.b3', 'autism.b4'].filter((id) => status(id) === 'met').length;
  return { allA, bMet };
}

function dangerWeightOf(rules: EvidenceRule[], toolKey: string, event: EvidenceEvent): number | null {
  for (const rule of rules) {
    if (rule.toolKey !== toolKey || rule.band !== 'danger') continue;
    if (rule.kind === 'anamnesis') continue;
    if (ruleColor(rule, event) === 'danger') return rule.weight;
  }
  return null;
}

interface ConsensusResult {
  bonus: number;
  oneSided: boolean;
}

function consensusOf(ruleSet: RuleSet, perTool: Map<string, EvidenceEvent[]>): ConsensusResult {
  if (!ruleSet.consensus) return { bonus: 0, oneSided: false };
  const { parent, teacher } = ruleSet.consensus;
  const parentEvents = perTool.get(parent) ?? [];
  const teacherEvents = teacher === parent ? parentEvents.slice(1) : perTool.get(teacher) ?? [];
  const pw = parentEvents.length > 0 ? dangerWeightOf(ruleSet.evidence, parent, parentEvents[0]) : null;
  const tw = teacherEvents.length > 0 ? dangerWeightOf(ruleSet.evidence, teacher, teacherEvents[0]) : null;
  if (pw !== null && tw !== null) {
    return { bonus: pw * 0.5 + tw * 0.5, oneSided: false };
  }
  if (parentEvents.length > 0 && teacherEvents.length > 0 && (pw !== null) !== (tw !== null)) {
    return { bonus: 0, oneSided: true };
  }
  return { bonus: 0, oneSided: false };
}

export interface InferOptions {
  now?: () => Date;
}

export function runInference(events: EvidenceEvent[], options: InferOptions = {}): InferenceOutput {
  const done = completed(events);
  const latest = latestPerTool(done);
  const perTool = latestTwoPerTool(done);
  const now = options.now ?? (() => new Date());

  const seen = [...latest.keys()];
  const seenTitles = [...new Set([...latest.values()].map((e) => e.typeTitle))];
  const anamKey = latest.has(ANAMNESIS_V3_KEY) ? ANAMNESIS_V3_KEY : ANAMNESIS_V2_KEY;
  const anamnesisSignals = anamnesisSignalsOf(latest.get(ANAMNESIS_V3_KEY));

  const hypotheses: RankedHypothesis[] = [];
  const criteria: InferenceOutput['criteria'] = [];
  const discrepancies: string[] = [];
  const referralFlags: string[] = [];
  const nextActionsSet = new Set<string>();

  const wEvent = latest.get(WECHSLER_W4_EVENT_KEY);
  const wFacts = wechslerProfileFactsOf(wEvent);
  const adapt = idAdaptLevelOfEvent(latest.get(ID_ADAPT_EVENT_KEY));
  const idPathActive = wFacts.fsiq !== null && wFacts.fsiq <= ID_PATH_MAX_FSIQ && adapt === 'low';
  if (idPathActive) {
    referralFlags.push('خط قرمز — مسیر ناتوانی هوشی: هوش‌بهر کل ۷۰ یا کمتر همراه انطباق روزمرهٔ «پایین» است؛ پرونده برای ارجاع تخصصی (روان‌پزشک/مدیر پرونده) علامت خورد — پلن چک‌لیست رفتاری پیشنهاد نمی‌شود.');
    nextActionsSet.add('مسیر ناتوانی هوشی (ID) فعال شده است — «ارجاع» به متخصص تخصصی پیش از هر پلن آموزشی؛ فرضیهٔ دیرآموزی تقویت نمی‌شود.');
  }
  if (!idPathActive && wFacts.band === 'LOW_BORDER' && wFacts.indexScatter !== null && wFacts.indexScatter < SCATTER_UNIFORM_MAX) {
    nextActionsSet.add('نیم‌رخ هوشی در «مرز پایین» با شاخص‌های یکنواخت است — بدون برچسب تشخیصی، پایش دوره‌ای (شش‌ماهه) پیشنهاد می‌شود.');
  }
  if (!idPathActive && wFacts.fsiq !== null && wFacts.fsiq >= 71 && wFacts.fsiq <= 75 && adapt === 'low') {
    referralFlags.push('هوش‌بهر کل ۷۱–۷۵ همراه انطباق روزمرهٔ «پایین» است — با احتساب خطای استاندارد اندازه‌گیری وکسلر (SEM حدود ۳ نمره)، ناتوانی هوشی رد نمی‌شود؛ ارزیابی تخصصی انطباق و مشورت ارجاع لازم است.');
  }
  if (wFacts.fsiq !== null && wFacts.fsiq <= ID_PATH_MAX_FSIQ && adapt === 'unknown' && wEvent) {
    nextActionsSet.add('هوش‌بهر کل ۷۰ یا کمتر است ولی سنجهٔ انطباق روزمره ثبت نشده — تفکیک مسیر ناتوانی هوشی از دیرآموزی به ثبت آن وابسته است (فرم جامع خانواده).');
  }
  const convergenceMap = new Map<string, { positive: ConvergenceSource[]; data: ConvergenceSource[] }>();

  for (const ruleSet of RULES) {
    const target = targetOf(ruleSet.targetKey);
    if (!target) continue;

    const toolKeys = new Set<string>([
      ...ruleSet.evidence.map((r) => r.toolKey),
      ...ruleSet.criteriaMap.map((m) => m.toolKey)
    ]);
    if (ruleSet.consensus) {
      toolKeys.add(ruleSet.consensus.parent);
      toolKeys.add(ruleSet.consensus.teacher);
    }
    if (toolKeys.has(ANAMNESIS_V2_KEY)) toolKeys.add(anamKey);
    const hasData = [...toolKeys].some((k) => {
      const e = latest.get(k);
      return Boolean(e && (e.analysis || e.payload));
    });
    if (!hasData) continue;

    const evidenceFa: string[] = [];
    const seenFa = new Set<string>();
    const addFa = (fa: string) => {
      if (!seenFa.has(fa)) {
        seenFa.add(fa);
        evidenceFa.push(fa);
      }
    };
    const srcPositive: ConvergenceSource[] = [];
    const srcData: ConvergenceSource[] = [];
    const noteSource = (toolKey: string, fired: boolean) => {
      const s = convergenceSourceOfTool(toolKey);
      if (!s) return;
      if (!srcData.includes(s)) srcData.push(s);
      if (fired && !srcPositive.includes(s)) srcPositive.push(s);
    };
    let score = 0;
    for (const rule of ruleSet.evidence) {
      if (rule.kind === 'anamnesis') continue; // با پرچم هدف‌محور پایین
      if (rule.kind === 'wechsler' && ruleSet.targetKey === 'slow_learner') continue;
      if (rule.kind === 'probe' || rule.kind === 'wechsler') {
        const color = ruleColor(rule, latest.get(rule.toolKey));
        if (color === null || color !== rule.band) continue;
        score += rule.weight;
        addFa(rule.fa);
        continue;
      }
      for (const event of perTool.get(rule.toolKey) ?? []) {
        const color = ruleColor(rule, event);
        if (color === null || color !== rule.band) continue;
        score += rule.weight;
        addFa(rule.fa);
      }
    }
    for (const rule of ruleSet.evidence) {
      if (rule.kind === 'anamnesis') continue;
      if (ruleSet.targetKey === 'slow_learner' && rule.kind === 'wechsler') continue;
      if (rule.kind === 'probe' || rule.kind === 'wechsler') {
        const color = ruleColor(rule, latest.get(rule.toolKey));
        if (color !== null) noteSource(rule.toolKey, color === rule.band);
        continue;
      }
      for (const event of perTool.get(rule.toolKey) ?? []) {
        const color = ruleColor(rule, event);
        if (color !== null) {
          noteSource(rule.toolKey, color === rule.band);
          break; // یک رویداد کافی است — منبع تکراری معنا ندارد
        }
      }
    }

    if (ruleSet.targetKey === 'slow_learner') {
      const cands: { weight: number; fa: string }[] = [];
      for (const rule of ruleSet.evidence) {
        if (rule.kind !== 'wechsler') continue;
        const color = ruleColor(rule, wEvent);
        if (color !== null) {
          noteSource(rule.toolKey, color === rule.band);
          if (color === rule.band) cands.push({ weight: rule.weight, fa: rule.fa });
        }
      }
      if (wEvent?.payload || wEvent?.analysis) noteSource(WECHSLER_W4_EVENT_KEY, false);
      if (adapt === 'low' && latest.has(ID_ADAPT_EVENT_KEY)) noteSource(ID_ADAPT_EVENT_KEY, false);
      if (!idPathActive && wFacts.fsiq !== null && wFacts.fsiq >= FSIQ_BAND_BIF.min && wFacts.fsiq <= FSIQ_BAND_BIF.max && (adapt === 'normal' || adapt === 'unknown')) {
        cands.push({
          weight: 1,
          fa: `هوش‌بهر کل ${faNum(wFacts.fsiq)} در بازهٔ مرزی/دیرآموزی (۷۰–۸۴) است و انطباق روزمره عادی یا ثبت‌نشده است — شاهد دیرآموزی (BIF).`
        });
      }
      if (!idPathActive) {
        const best = cands.reduce<{ weight: number; fa: string } | null>((a, b) => (a === null || b.weight > a.weight ? b : a), null);
        if (best) {
          score += best.weight;
          addFa(best.fa);
          noteSource(WECHSLER_W4_EVENT_KEY, true);
        }
      }
    }

    const sldSpec = SLD_PROCESSING[ruleSet.targetKey];
    if (sldSpec && !idPathActive && wFacts.fsiq !== null) {
      const weakRel = sldSpec.related.filter((k) => isWeakRelated(wFacts, k));
      if (weakRel.length) {
        const weakFa = weakRel.map((k) => SLD_FA_OF[k]).join(' و ');
        const intact = sldSpec.contrast.filter((k) => isIntactContrast(wFacts, k));
        const contrastFa = intact.map((k) => SLD_FA_OF[k]).join(' و ');
        const bifNote = wFacts.fsiq >= FSIQ_BAND_BIF.min && wFacts.fsiq <= FSIQ_BAND_BIF.max
          ? ' (هوش‌بهر کل در بازهٔ مرزی است — تعبیر با احتیاط و در کنار شواهد دیرآموزی)'
          : '';
        addFa(intact.length
          ? `در نیم‌رخ وکسلر، ${weakFa} پایین‌تر از حد انتظار است و ${contrastFa} حفظ شده است — الگوی هم‌گرا با دشواری ${sldSpec.faHead} (رویکرد پردازش اطلاعات: ${sldSpec.mechanism})؛ شاهد پشتیبان ملاک‌های تحصیلی.${bifNote}`
          : `در نیم‌رخ وکسلر ${weakFa} پایین است — همسو با دشواری ${sldSpec.faHead} (${sldSpec.mechanism})؛ چون نیم‌رخ کلی ضعیف است، تعبیر اختصاصی محدودتر می‌ماند.${bifNote}`);
        score += 1;
        noteSource(WECHSLER_W4_EVENT_KEY, true);
      } else if (wEvent?.payload || wEvent?.analysis) {
        noteSource(WECHSLER_W4_EVENT_KEY, false);
      }
    }

    const anamRule = ruleSet.evidence.find((r) => r.kind === 'anamnesis');
    const anamFired = Boolean(anamRule) && anamnesisFlagFor(ruleSet.targetKey, latest.get(anamKey));
    if (anamFired) {
      score += 1;
      if (anamRule) evidenceFa.push(anamRule.fa);
    }
    if (anamRule && latest.get(anamKey)?.payload) noteSource(anamKey, anamFired);

    const consensus = consensusOf(ruleSet, perTool);
    score += consensus.bonus;
    if (consensus.bonus > 0) {
      evidenceFa.push('گزارش خانه و مدرسه هم‌رأی است — وزن شواهد بیشتر شد.');
    } else if (consensus.oneSided) {
      discrepancies.push(`برای «${target.title}» گزارش خانه و مدرسه هم‌رأی نیست — هیچ‌کدام را قطعی نگیرید؛ بررسی بیشتر لازم است.`);
    }

    if (ruleSet.targetKey === 'odd') {
      const full = fullCriteriaCount('odd', perTool);
      if (full >= ODD_MIN_FULL_CRITERIA) {
        evidenceFa.push(`${full} ملاک A نافرمانی با نمرهٔ کامل گزارش شده است (حداقل لازم: ${ODD_MIN_FULL_CRITERIA}).`);
        score += 1;
      }
    }
    if (ruleSet.targetKey === 'autism') {
      const asd = autismPattern(perTool);
      if (asd.allA && asd.bMet >= ASD_B_FULL_CRITERIA) {
        evidenceFa.push(`هر سه ملاک A و ${asd.bMet} ملاک B اتیسم برآورده شده است (حداقل B لازم: ${ASD_B_FULL_CRITERIA}).`);
        score += 1;
      }
    }

    const dsm = DSM_RECORDS[ruleSet.targetKey];
    const critSummary = { met: 0, partial: 0, unknown: 0, notMet: 0 };
    if (dsm) {
      for (const criterion of dsm.criteria) {
        const status = criterionStatus(criterion.id, ruleSet, perTool);
        criteria.push({ ...status, targetKey: ruleSet.targetKey, textFa: criterion.textFa, group: criterion.group });
        critSummary[status.status === 'not_met' ? 'notMet' : status.status] += 1;
      }
    }

    const missingFa: string[] = [];
    for (const toolKey of ruleSet.nextInstrument) {
      const satisfied = latest.has(toolKey) || (toolKey === ANAMNESIS_V2_KEY && latest.has(ANAMNESIS_V3_KEY));
      const displayKey = toolKey === ANAMNESIS_V2_KEY && !latest.has(ANAMNESIS_V2_KEY) ? ANAMNESIS_V3_KEY : toolKey;
      if (!satisfied) {
        const probe = probeDefOf(displayKey);
        missingFa.push(probe ? `${probe.fa} هنوز گرفته نشده است.` : `${batteryDef(displayKey)?.title ?? `ابزار «${displayKey}»`} هنوز ارسال/ثبت نشده است.`);
      }
    }

    const confidence: ConfidenceLevel =
      score >= CONFIDENCE_THRESHOLDS.high ? 'زیاد' : score >= CONFIDENCE_THRESHOLDS.medium ? 'متوسط' : 'کم';

    const differentialsFa = confidence === 'کم' ? [] : ruleSet.differentials.map((d) => d.fa);

    if (score > 0) {
      hypotheses.push({
        targetKey: ruleSet.targetKey,
        targetTitle: target.title,
        confidence,
        score: Math.round(score * 10) / 10,
        evidenceFa,
        missingFa,
        differentialsFa,
        criteriaSummary: critSummary
      });
    }

    for (const m of missingFa) nextActionsSet.add(m);

    const consensusTools = [ruleSet.consensus?.parent, ruleSet.consensus?.teacher].filter(Boolean) as string[];
    for (const toolKey of new Set([...consensusTools, ...ruleSet.evidence.filter((r) => r.kind === 'instrument').map((r) => r.toolKey)])) {
      for (const e of perTool.get(toolKey) ?? []) {
        for (const flag of e.analysis?.flags ?? []) {
          referralFlags.push(`${e.typeTitle}: ${flag.label}`);
        }
      }
    }

    convergenceMap.set(ruleSet.targetKey, { positive: srcPositive, data: srcData });
  }

  hypotheses.sort((a, b) => b.score - a.score || b.criteriaSummary.met - a.criteriaSummary.met);

  const ranked = hypotheses.slice(0, 3);

  const sch = latest.get('ce-scared-p-v1')?.analysis?.subscaleScores?.find((s) => s.id === 'sch');
  if (sch && sch.score >= SCARED_SCHOOL_CUTOFF) {
    nextActionsSet.add('اجتناب از مدرسه در SCARED گزارش شده — با معلم و خانواده دربارهٔ موقعیت مدرسه صحبت کنید.');
  }

  if (ranked.length === 0) {
    nextActionsSet.add('هنوز دادهٔ کافی برای فرضیه نیست — SDQ (والد/معلم) و شرح حال ساخت‌یافته را کامل کنید.');
  }

  const convergence: ConvergenceItem[] = [];
  for (const h of ranked) {
    const s = convergenceMap.get(h.targetKey);
    if (!s) continue;
    const item = convergenceItemOf(h.targetKey, h.targetTitle, s.positive, s.data);
    if (item) convergence.push(item);
  }

  const output = {
    batteryVersion: BATTERY_VERSION,
    generatedAt: now().toISOString(),
    criteria,
    ranked,
    discrepancies: [...new Set(discrepancies)],
    nextActions: [...nextActionsSet].slice(0, 8),
    dataCoverage: { seen, seenTitles },
    referralFlags: [...new Set(referralFlags)].slice(0, 10),
    anamnesisSignals
  };
  return { ...output, convergence };
}

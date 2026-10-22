/**
 * موتور بالینی — باتری‌ها، قواعد، روایت و اهداف مداخله — استنتاج بالینی از نتایج
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// موتور شناسایی (پلن §۵): ملاک‌محور + وزن‌دار + تفریقی + ناهم‌رأیی + گپ اطلاعاتی
// بدون I/O — ورودی EvidenceEvent[] نرمال‌شده؛ خروجی InferenceOutput قطعی و بازتولیدپذیر.
// قراردادها:
// - فقط رویدادهای completed مصرف می‌شوند (سرویس فیلتر می‌کند — این‌جا هم محافظت می‌شود)
// - «آخرین اندازه‌گیری» برای امتیاز شواهد: جدیدترین رویداد هر ابزار
// - جدول ملاک‌ها از «دو رویداد آخر هر ابزار» نظر می‌گیرد (والد + معلم — پلن §۵ گام ۱)
// - هم‌رأیی والد/معلم: جفت شاهد danger از دو مرجعِ consensus — هر دو ×۱٫۵ (پلن §۵ گام ۲)

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
// T4 (m148) — لایهٔ سیگنال شرح‌حال: قرارداد ClinicalSignal از signals.ts (افزودنی — بدون تغییر کلیدهای قدیمی)
import type { ClinicalSignal, SignalDomain, WechslerFsiqBand } from './signals';
import { makeSignal, sortSignals } from './signals';
// T6 (m148-b) — هم‌گرایی چندمنبعی: جدول طبقه‌بندی منابع + طبقه‌بندی خوانا سه‌حالته
import { convergenceSourceOfTool, convergenceItemOf, idAdaptLevelOfEvent, ID_ADAPT_EVENT_KEY, type ConvergenceSource, type ConvergenceItem } from './convergence';

// ───────── نگاشت پروب‌ها (هاردکد — پلن §۴ لایهٔ ۳) ─────────

export const PROBES: ProbeDef[] = [
  { toolKey: 'ce-probe-read-v1', valueField: 'wcpm', gradeField: 'text_grade', norm: WCPM_NORM_50TH, fa: 'پروب روانی‌خواندن' },
  { toolKey: 'ce-probe-write-v1', valueField: 'alpha15s', gradeField: 'dict_grade', norm: ALPHA_15S_NORM, fa: 'پروب روانی‌نوشتن' },
  { toolKey: 'ce-probe-calc-v1', valueField: 'digits2min', gradeField: 'calc_grade', norm: DIGITS_2MIN_NORM, fa: 'پروب سلیقۀ حساب' }
];

function probeDefOf(toolKey: string): ProbeDef | undefined {
  return PROBES.find((p) => p.toolKey === toolKey);
}

// ───────── شرح‌حال — کلیدهای ابزار (T4 m148) ─────────

/** نسخهٔ ۲ — فقط برای پرونده‌های قدیمی (برای ورودی جدید غیرفعال شده) */
export const ANAMNESIS_V2_KEY = 'ce-anamnesis-v2';
/** نسخهٔ ۳ — فرم ساخت‌یافتهٔ جدید؛ حل شواهد شرح‌حال نسخهٔ ۳ را ترجیح می‌دهد */
export const ANAMNESIS_V3_KEY = 'ce-anamnesis-v3';

/** آخرین شرح‌حال مؤثر پرونده — نسخهٔ ۳ اگر رویداد داشته باشد، وگرنه نسخهٔ ۲ (فال‌بک دقیق) — مصرف‌کننده: تست‌ها */
export function latestAnamnesisKeyOf(latest: Map<string, EvidenceEvent>): string {
  return latest.has(ANAMNESIS_V3_KEY) ? ANAMNESIS_V3_KEY : ANAMNESIS_V2_KEY;
}

// ───────── سیگنال‌های شرح‌حال نسخهٔ ۳ (T4 m148 — قرارداد کلیدها برای T3/T6) ─────────

// فیلدهای ساخت‌یافتهٔ نسخهٔ ۳ با گزینه‌های ثابت می‌آیند؛ هر گزینه به شدت ۰..۱ نگاشت می‌شود.
// جدول بازه‌های نگرانی ۴تایی — مشترک بین فیلدهای concern (قرارداد فرم v3):
//   «بدون نگرانی»=۰ · «کم»=۰٫۳۳ · «متوسط»=۰٫۶۷ · «زیاد — نگران‌کننده»=۱
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

/** جدول نگاشت فیلد نسخهٔ ۳ → سیگنال (تک‌منبع قرارداد؛ منبع همیشه anamnesis) */
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

/** نگاشت گزینهٔ نسخهٔ ۳ به شدت ۰..۱ از جدول قرارداد — ناشناخته → null */
function anamV3ValueOf(fieldKey: string, label: string): number | null {
  const spec = ANAMNESIS_V3_SIGNAL_SPEC.find((s) => s.fieldKey === fieldKey);
  return spec ? spec.valueOf(label) : null;
}

/**
 * سیگنال‌های شرح‌حال از آخرین رویداد نسخهٔ ۳ — افزودنی (کلید جدید anamnesisSignals).
 * فقط نسخهٔ ۳ سیگنال می‌دهد؛ نسخهٔ ۲ دقیقاً رفتار امروز (هیوریستیک متن) را دارد → []
 * گزینهٔ ناشناخته/فیلد بی‌پاسخ نادیده گرفته می‌شود — خروجی قطعی و مرتب‌شده با sortSignals.
 */
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

// ───────── ابزارهای کمکی ─────────

function completed(events: EvidenceEvent[]): EvidenceEvent[] {
  return events.filter((e) => e.status === 'completed');
}

/** عدد فارسی برای جملات موتور (T6) */
function faNum(n: number): string {
  return String(n).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}

// ───────── قواعد سیگنالی وکسلر — تفکیک انطباقی ID/دیرآموز (T6 m148-b — §۳.۱) ─────────

/**
 * اطلاعات پروفایل وکسلر برای قواعد سیگنالی — فقط از profile (T1).
 * رویدادهای قدیمی بدون profile → همه null: قواعد جدید خاموش می‌مانند و رفتار امروز
 * بایت‌به‌بایت حفظ می‌شود (پاریتی پرونده‌های قدیمی).
 */
function wechslerProfileFactsOf(event: EvidenceEvent | undefined): {
  fsiq: number | null;
  band: WechslerFsiqBand | null;
  indexScatter: number | null;
} {
  const profile = wechslerEngineOutputOf(event)?.profile ?? null;
  const fsiq = typeof profile?.fsiq === 'number' ? profile.fsiq : null;
  const bandRaw = typeof profile?.fsiqBand === 'string' ? profile.fsiqBand : null;
  const band = (bandRaw as WechslerFsiqBand | null) ?? (fsiq !== null ? fsiqBandOf(fsiq) : null);
  const scatter = typeof profile?.indexScatter === 'number' ? profile.indexScatter : null;
  return { fsiq, band, indexScatter: scatter };
}

/** جدیدترین رویداد هر کلید ابزار (ورودی نزولی زمانی — اولین = جدیدترین) */
function latestPerTool(events: EvidenceEvent[]): Map<string, EvidenceEvent> {
  const map = new Map<string, EvidenceEvent>();
  for (const e of events) {
    if (!map.has(e.toolKey)) map.set(e.toolKey, e);
  }
  return map;
}

/** دو رویداد آخر هر ابزار — منابع جدول ملاک‌ها و هم‌رأیی */
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

// ───────── رنگ هر قاعدهٔ شواهد از یک رویداد مشخص ─────────

type BandColor = 'ok' | 'warn' | 'danger';

/** رنگ تحقق یک قاعده نسبت به رویداد داده‌شده — null یعنی داده‌ای نیست */
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
    // قرارداد پروب (قبلاً probeStatus): زیر ۸۰٪ هنجار = پایین از انتظار (شاهد اصلی)
    return value < n * 0.8 ? 'danger' : 'ok';
  }

  if (rule.kind === 'wechsler') {
    const fsiq = num(event.payload?.['fsiq']?.value);
    if (fsiq === null) return null;
    return fsiq >= BIF_IQ_RANGE.min && fsiq <= BIF_IQ_RANGE.max ? 'danger' : 'ok';
  }

  // anamnesis با پرچم هدف‌محور جداگانه اعمال می‌شود (anamnesisFlagFor) — این‌جا null
  if (rule.kind === 'anamnesis') return null;

  // instrument / sdq — از تحلیل چک‌لیست (زیرمقیاس یا کل)
  const analysis = event.analysis;
  if (!analysis) return null;
  if (rule.subscaleId) {
    const ss = analysis.subscaleScores?.find((s) => s.id === rule.subscaleId);
    if (!ss) return null;
    if (ss.color) return ss.color;
    // فال‌بک رویدادهای قدیمی: برچسب باند → رنگ از تعریف زیرمقیاس
    const def = event.subscales?.find((s) => s.id === rule.subscaleId);
    return colorOfBandLabel(ss.band, def?.bands ?? null);
  }
  return colorOfBandLabel(analysis.band, event.bands);
}

/**
 * پرچم‌های شرح‌حال — هیوریستیک شفاف v1 روی متن فیلدهای آزاد (کامنت‌دار و تست‌پذیر).
 * با دادهٔ مرکز به فلگ ساخت‌یافتهٔ دقیق ارتقا می‌یابد.
 * T4 (m148): نسخهٔ ۲ عیناً همین هیوریستیک می‌ماند (فال‌بک دقیق پرونده‌های قدیمی)؛
 * نسخهٔ ۳ پرچم را از کلیدهای ساخت‌یافته می‌گیرد — نه از متن آزاد.
 */
const ANAMNESIS_TEXT_FIELDS = ['chief_complaint', 'weak_subjects', 'development', 'medical'];

function anamnesisFlagFor(targetKey: string, event: EvidenceEvent | undefined): boolean {
  // نسخهٔ ۳ — کلیدهای ساخت‌یافته (قرارداد فرم v3)
  if (event && event.toolKey === ANAMNESIS_V3_KEY) {
    if (targetKey === 'slow_learner') {
      // «افت همه‌درسی/بیشترِ درس‌ها» — از گزینهٔ ساخت‌یافتهٔ decline_scope (≥۰٫۶۷)
      const v = anamV3ValueOf('decline_scope', event.payload?.['decline_scope']?.value ?? '');
      return v !== null && v >= 0.67;
    }
    if (targetKey === 'anxiety') {
      // «نشانهٔ جسمانی صبحگاهی بدون علت پزشکی» — گزینه‌های «گاهی» و «بیشتر روزها» (همان حساسیت متن آزاد v2)
      const v = anamV3ValueOf('morning_somatic', event.payload?.['morning_somatic']?.value ?? '');
      return v !== null && v >= 0.5;
    }
    return false;
  }
  // نسخهٔ ۲ — هیوریستیک متن آزاد (بایت‌به‌بایت رفتار امروز)
  if (!event || event.toolKey !== ANAMNESIS_V2_KEY) return false;
  const text = payloadText(event, ANAMNESIS_TEXT_FIELDS);
  if (!text) return false;
  if (targetKey === 'slow_learner') {
    // «افت تحصیلی تدریجی همه‌درسی» — الگوی متن آزاد v1
    return text.includes('افت') && (text.includes('همه') || text.includes('همۀ'));
  }
  if (targetKey === 'anxiety') {
    // «نشانهٔ جسمانی صبحگاهی بدون علت پزشکی»
    return text.includes('صبح') && ['دل‌درد', 'دل درد', 'تهوع', 'شکم', 'استفراغ', 'سردرد'].some((w) => text.includes(w));
  }
  return false;
}

// ───────── گام ۱ — جدول وضعیت ملاک‌ها ─────────

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

  // «باند بالا در دو مرجع = برآورده؛ یکی = ناقص؛ هیچ = نامشخص/نیاز به بررسی» (پلن §۵ گام ۱)
  if (metCount >= 2) return { criterionId, status: 'met', sources };
  if (metCount === 1) return { criterionId, status: 'partial', sources };
  if (answeredEvents > 0 && zeroOnly) return { criterionId, status: 'not_met', sources };
  return { criterionId, status: 'unknown', sources };
}

/** تعداد ملاک‌های A با نمرهٔ کامل از هر مرجع — قاعدهٔ ویژهٔ ODD (≥۴ از ۸) */
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

/** الگوی ملاکی اتیسم: هر سه A برآورده + تعداد Bهای برآورده (قاعدهٔ §۵ — حداقل ۲ از ۴) */
function autismPattern(perTool: Map<string, EvidenceEvent[]>): { allA: boolean; bMet: number } {
  const ruleSet = rulesOf('autism');
  if (!ruleSet) return { allA: false, bMet: 0 };
  const status = (id: string) => criterionStatus(id, ruleSet, perTool).status;
  const allA = ['autism.a1', 'autism.a2', 'autism.a3'].every((id) => status(id) === 'met');
  const bMet = ['autism.b1', 'autism.b2', 'autism.b3', 'autism.b4'].filter((id) => status(id) === 'met').length;
  return { allA, bMet };
}

// ───────── هم‌رأیی والد/معلم (گام ۲ — ×۱٫۵) ─────────

/**
 * آیا این رویداد، شاهد danger برای یکی از قواعد danger همان ابزار می‌سازد؟
 * خروجی: وزن قاعدهٔ محقق‌شده (برای محاسبهٔ ضریب) — یا null.
 */
function dangerWeightOf(rules: EvidenceRule[], toolKey: string, event: EvidenceEvent): number | null {
  for (const rule of rules) {
    if (rule.toolKey !== toolKey || rule.band !== 'danger') continue;
    if (rule.kind === 'anamnesis') continue;
    if (ruleColor(rule, event) === 'danger') return rule.weight;
  }
  return null;
}

interface ConsensusResult {
  /** نیم‌جمع وزن جفت — به امتیاز اضافه می‌شود تا جفت = ۱٫۵ برابر جمع پایه */
  bonus: number;
  /** شاهد تک‌مرجعی خانه بدون تأیید معلم — برای خط ناهم‌رأیی */
  oneSided: boolean;
}

function consensusOf(ruleSet: RuleSet, perTool: Map<string, EvidenceEvent[]>): ConsensusResult {
  if (!ruleSet.consensus) return { bonus: 0, oneSided: false };
  const { parent, teacher } = ruleSet.consensus;
  const parentEvents = perTool.get(parent) ?? [];
  // ابزار یکسان (مثل چک‌لیست‌های ملاکی والد+معلم): دو رویداد جدا؛ ابزار متفاوت (SNAP والد/معلم)
  const teacherEvents = teacher === parent ? parentEvents.slice(1) : perTool.get(teacher) ?? [];
  const pw = parentEvents.length > 0 ? dangerWeightOf(ruleSet.evidence, parent, parentEvents[0]) : null;
  const tw = teacherEvents.length > 0 ? dangerWeightOf(ruleSet.evidence, teacher, teacherEvents[0]) : null;
  if (pw !== null && tw !== null) {
    return { bonus: pw * 0.5 + tw * 0.5, oneSided: false };
  }
  // ناهم‌رأیی فقط وقتی هر دو مرجع پاسخ داده‌اند ولی فقط یکی danger است
  if (parentEvents.length > 0 && teacherEvents.length > 0 && (pw !== null) !== (tw !== null)) {
    return { bonus: 0, oneSided: true };
  }
  return { bonus: 0, oneSided: false };
}

// ───────── موتور اصلی ─────────

export interface InferOptions {
  /** ISO UTC — تزریقی برای تست */
  now?: () => Date;
}

export function runInference(events: EvidenceEvent[], options: InferOptions = {}): InferenceOutput {
  const done = completed(events);
  const latest = latestPerTool(done);
  const perTool = latestTwoPerTool(done);
  const now = options.now ?? (() => new Date());

  const seen = [...latest.keys()];
  const seenTitles = [...new Set([...latest.values()].map((e) => e.typeTitle))];
  // شرح‌حال مؤثر پرونده (نسخهٔ ۳ ترجیح، فال‌بک نسخهٔ ۲) + سیگنال‌های افزودنی (فقط نسخهٔ ۳ سیگنال می‌دهد)
  const anamKey = latest.has(ANAMNESIS_V3_KEY) ? ANAMNESIS_V3_KEY : ANAMNESIS_V2_KEY;
  const anamnesisSignals = anamnesisSignalsOf(latest.get(ANAMNESIS_V3_KEY));

  const hypotheses: RankedHypothesis[] = [];
  const criteria: InferenceOutput['criteria'] = [];
  const discrepancies: string[] = [];
  const referralFlags: string[] = [];
  const nextActionsSet = new Set<string>();

  // ── T6 (m148-b) — زمینهٔ قواعد سیگنالی وکسلر (همه از دادهٔ موجود؛ بدون محاسبهٔ تازه) ──
  const wEvent = latest.get(WECHSLER_W4_EVENT_KEY);
  const wFacts = wechslerProfileFactsOf(wEvent);
  const adapt = idAdaptLevelOfEvent(latest.get(ID_ADAPT_EVENT_KEY));
  // m156 — زمینهٔ فرضیه‌های وکسلر (hypCtx/sigValOf/domainWeakIndexOf) حذف شد؛ نیم‌رخ هوشی فقط
  // از طریق قواعد سیگنالی پروفایل (FSIQ band/ID red-line) خوانده می‌شود — هیچ فرضیه‌ای از وکسلر نمی‌آید.
  // خط قرمز مسیر ID (§۳.۱): FSIQ ≤ ۷۰ «و» انطباق پایین → ارجاع؛
  // در این مسیر هیچ تقویت دیرآموزی اعمال نمی‌شود — دو مسیر ID و دیرآموز هرگز هم‌پوشان نمی‌شوند.
  const idPathActive = wFacts.fsiq !== null && wFacts.fsiq <= ID_PATH_MAX_FSIQ && adapt === 'low';
  if (idPathActive) {
    referralFlags.push('خط قرمز — مسیر ناتوانی هوشی: هوش‌بهر کل ۷۰ یا کمتر همراه انطباق روزمرهٔ «پایین» است؛ پرونده برای ارجاع تخصصی (روان‌پزشک/مدیر پرونده) علامت خورد — پلن چک‌لیست رفتاری پیشنهاد نمی‌شود.');
    nextActionsSet.add('مسیر ناتوانی هوشی (ID) فعال شده است — «ارجاع» به متخصص تخصصی پیش از هر پلن آموزشی؛ فرضیهٔ دیرآموزی تقویت نمی‌شود.');
  }
  // مرز پایین یکنواخت (۸۵–۸۹ با پراکندگی زیر سقف تفسیر واحد) — فقط توصیهٔ پایش، بدون برچسب تشخیصی (§۳.۱)
  if (!idPathActive && wFacts.band === 'LOW_BORDER' && wFacts.indexScatter !== null && wFacts.indexScatter < SCATTER_UNIFORM_MAX) {
    nextActionsSet.add('نیم‌رخ هوشی در «مرز پایین» با شاخص‌های یکنواخت است — بدون برچسب تشخیصی، پایش دوره‌ای (شش‌ماهه) پیشنهاد می‌شود.');
  }
  // جمع‌آوری منابع هم‌گرایی (T6 — در همین یک محاسبه؛ ماتریس هرگز به UI نمی‌آید)
  const convergenceMap = new Map<string, { positive: ConvergenceSource[]; data: ConvergenceSource[] }>();

  for (const ruleSet of RULES) {
    const target = targetOf(ruleSet.targetKey);
    if (!target) continue;

    // ۰) گیت داده: بدون هیچ رویدادِ معنادار از ابزارهای همین هدف → رد شود (بدون ملاک‌های بی‌معنی)
    const toolKeys = new Set<string>([
      ...ruleSet.evidence.map((r) => r.toolKey),
      ...ruleSet.criteriaMap.map((m) => m.toolKey)
    ]);
    if (ruleSet.consensus) {
      toolKeys.add(ruleSet.consensus.parent);
      toolKeys.add(ruleSet.consensus.teacher);
    }
    // شرح‌حال: قواعد به کلید v2 اشاره می‌کنند — اگر پرونده نسخهٔ ۳ دارد، همان هم شاهد است (T4)
    if (toolKeys.has(ANAMNESIS_V2_KEY)) toolKeys.add(anamKey);
    // m156 — هیچ تقویت فرضیه‌ای از وکسلر به هیچ هدفی تزریق نمی‌شود (اتصال قطع شد).
    const hasData = [...toolKeys].some((k) => {
      const e = latest.get(k);
      return Boolean(e && (e.analysis || e.payload));
    });
    if (!hasData) continue;

    // ۱) امتیاز شواهد — instrument/sdq از «دو مرجع» (دو رویداد آخر هر ابزار)؛
    // پروب/وکسلر از آخرین اندازه‌گیری؛ band = رنگِ دقیقِ لازم (warn فقط مرزی، danger فقط بالینی)
    const evidenceFa: string[] = [];
    const seenFa = new Set<string>();
    const addFa = (fa: string) => {
      if (!seenFa.has(fa)) {
        seenFa.add(fa);
        evidenceFa.push(fa);
      }
    };
    // منابع هم‌گرایی همین هدف (T6) — مثبت = شواهد همان‌جهت؛ داده = رویداد مرتبط با تحلیل/پاسخ
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
      // T6 — شواهد وکسلریِ دیرآموزی (باند BIF) یک‌جا در بلوک «قوی‌ترین تک‌تقویت» پایین اعمال می‌شود
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
    // منابع هم‌گرایی از قواعد ابزاری — فقط رویدادِ دارای داده (رنگ null = داده‌ای نیست)
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

    // ── T6 (m148-b) — خانوادهٔ شواهد BIF هدف دیرآموزی: «قوی‌ترین تک‌تقویت» — هیچ‌وقت جمع نمی‌شوند ──
    // (قبل از بلوک شرح‌حال — تا ترتیب متن شواهد با رفتار امروز یکسان بماند)
    // دو نامزد (m156 — نامزد فرضیه‌ای حذف شد): ۱) قاعدهٔ خام fsiq (رفتار امروز — بازهٔ ۷۰–۸۵ در BIF_IQ_RANGE)؛
    // ۲) سیگنال پروفایل (فقط رویدادهای دارای profile — T1): FSIQ ۷۰–۸۴ + انطباق عادی/ثبت‌نشده.
    // فقط قوی‌ترین یکی به امتیاز می‌رود؛ مسیر ID فعال → هیچ تقویتی اعمال نمی‌شود (عدم هم‌پوشانی).
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
      // انطباق «پایین» خانواده با مسیر دیرآموزی هم‌رأی نیست — منبع خانواده با دادهٔ مخالف (T6)
      if (adapt === 'low' && latest.has(ID_ADAPT_EVENT_KEY)) noteSource(ID_ADAPT_EVENT_KEY, false);
      // نامزد ۲ — سیگنال پروفایل: باند BIF (۷۰–۸۴) با انطباق عادی یا ثبت‌نشده
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
          // هر دو نامزد از رویداد وکسلر می‌آیند — تقویتِ اعمال‌شده = شاهد مثبت منبع «آزمون»
          noteSource(WECHSLER_W4_EVENT_KEY, true);
        }
      }
    }

    // پرچم شرح‌حال هدف‌محور (w۱) — نسخهٔ ۳ ترجیح دارد؛ بی‌نسخهٔ ۳، نسخهٔ ۲ با هیوریستیک امروز
    const anamRule = ruleSet.evidence.find((r) => r.kind === 'anamnesis');
    const anamFired = Boolean(anamRule) && anamnesisFlagFor(ruleSet.targetKey, latest.get(anamKey));
    if (anamFired) {
      score += 1;
      if (anamRule) evidenceFa.push(anamRule.fa);
    }
    // منبع خانواده برای اهداف دارای قاعدهٔ شرح‌حال — مثبت اگر پرچم همان‌جهت داشت (T6)
    if (anamRule && latest.get(anamKey)?.payload) noteSource(anamKey, anamFired);

    // ۲) هم‌رأیی والد/معلم — جفت danger هر دو مرجع → جمع جفت ×۱٫۵
    const consensus = consensusOf(ruleSet, perTool);
    score += consensus.bonus;
    if (consensus.bonus > 0) {
      evidenceFa.push('گزارش خانه و مدرسه هم‌رأی است — وزن شواهد بیشتر شد.');
    } else if (consensus.oneSided) {
      discrepancies.push(`برای «${target.title}» گزارش خانه و مدرسه هم‌رأی نیست — هیچ‌کدام را قطعی نگیرید؛ بررسی بیشتر لازم است.`);
    }

    // ۳) قواعد ویژهٔ ملاکی
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

    // ۴) جدول ملاک‌ها — همیشه کامل حتی برای فرضیه‌های نشده (پلن §۵ گام ۱)
    const dsm = DSM_RECORDS[ruleSet.targetKey];
    const critSummary = { met: 0, partial: 0, unknown: 0, notMet: 0 };
    if (dsm) {
      for (const criterion of dsm.criteria) {
        const status = criterionStatus(criterion.id, ruleSet, perTool);
        criteria.push({ ...status, targetKey: ruleSet.targetKey, textFa: criterion.textFa, group: criterion.group });
        critSummary[status.status === 'not_met' ? 'notMet' : status.status] += 1;
      }
    }

    // ۵) گپ اطلاعاتی — ابزار بعدی همان هدف
    const missingFa: string[] = [];
    for (const toolKey of ruleSet.nextInstrument) {
      // شرح‌حال (T4): وجود هرکدام از نسخهٔ ۲ یا ۳ گپ را پر می‌کند؛ اگر هیچ‌کدام نیست،
      // پیشنهاد به فرم فعال (نسخهٔ ۳) اشاره می‌کند — پروندهٔ قدیمیِ فقط-v2 بایت‌به‌بایت امروز می‌ماند.
      const satisfied = latest.has(toolKey) || (toolKey === ANAMNESIS_V2_KEY && latest.has(ANAMNESIS_V3_KEY));
      const displayKey = toolKey === ANAMNESIS_V2_KEY && !latest.has(ANAMNESIS_V2_KEY) ? ANAMNESIS_V3_KEY : toolKey;
      if (!satisfied) {
        const probe = probeDefOf(displayKey);
        missingFa.push(probe ? `${probe.fa} هنوز گرفته نشده است.` : `${batteryDef(displayKey)?.title ?? `ابزار «${displayKey}»`} هنوز ارسال/ثبت نشده است.`);
      }
    }

    // ۶) اطمینان توصیفی (آستانه‌های §۵ — کم/متوسط/زیاد)
    const confidence: ConfidenceLevel =
      score >= CONFIDENCE_THRESHOLDS.high ? 'زیاد' : score >= CONFIDENCE_THRESHOLDS.medium ? 'متوسط' : 'کم';

    // ۷) تفریق‌ها فقط برای فرضیه‌های جدی
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

    // ۸) گپ → اقدام بعدی
    for (const m of missingFa) nextActionsSet.add(m);

    // ۹) خط قرمز — آیتم‌های بحرانی ابزارهای همین هدف
    const consensusTools = [ruleSet.consensus?.parent, ruleSet.consensus?.teacher].filter(Boolean) as string[];
    for (const toolKey of new Set([...consensusTools, ...ruleSet.evidence.filter((r) => r.kind === 'instrument').map((r) => r.toolKey)])) {
      for (const e of perTool.get(toolKey) ?? []) {
        for (const flag of e.analysis?.flags ?? []) {
          referralFlags.push(`${e.typeTitle}: ${flag.label}`);
        }
      }
    }

    // ثبت منابع هم‌گرایی این هدف (T6)
    convergenceMap.set(ruleSet.targetKey, { positive: srcPositive, data: srcData });
  }

  // رتبه‌بندی: امتیاز ↓ سپس ملاک‌های برآورده ↓ (sort پایدار ترتیب سند را حفظ می‌کند)
  hypotheses.sort((a, b) => b.score - a.score || b.criteriaSummary.met - a.criteriaSummary.met);

  // سقف فرضیه (پلن §۱۱ پیش‌فرض: ۳)
  const ranked = hypotheses.slice(0, 3);

  // پرچم اجتناب از مدرسه (SCARED sch — برش از قواعد: SCARED_SCHOOL_CUTOFF)
  const sch = latest.get('ce-scared-p-v1')?.analysis?.subscaleScores?.find((s) => s.id === 'sch');
  if (sch && sch.score >= SCARED_SCHOOL_CUTOFF) {
    nextActionsSet.add('اجتناب از مدرسه در SCARED گزارش شده — با معلم و خانواده دربارهٔ موقعیت مدرسه صحبت کنید.');
  }

  if (ranked.length === 0) {
    nextActionsSet.add('هنوز دادهٔ کافی برای فرضیه نیست — SDQ (والد/معلم) و شرح حال ساخت‌یافته را کامل کنید.');
  }

  // T6 (m148-b) — هم‌گرایی چندمنبعی فرضیه‌های رتبه‌خورده (سه حالت خوانا؛ ماتریس پشت‌پرده می‌ماند)
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
    // T4 (m148) — کلید افزودنی: سیگنال‌های شرح‌حال نسخهٔ ۳ (پروندهٔ فقط-v2 → [])
    anamnesisSignals
  };
  // T6 (m148-b) — کلید افزودنی هم‌گرایی؛ ساختار قبلی عیناً حفظ شده (لنگر t4-verify سرجایش است)
  return { ...output, convergence };
}

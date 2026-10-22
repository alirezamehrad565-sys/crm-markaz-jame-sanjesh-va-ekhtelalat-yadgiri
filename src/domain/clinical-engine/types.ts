/**
 * موتور بالینی — باتری‌ها، قواعد، روایت و اهداف مداخله — تایپ‌های ماژول
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// قرارداد موتور بالینی (پلن §۹ — نسخهٔ ۲): ملاک DSM-5-TR + هدف بالینی + قواعد شواهد
// بدون I/O — همهٔ ساختارها هاردکد و نسخه‌دار (battery-v1) هستند.

import type { CaseEventField, CaseEventSubscale, CaseEventBand, CaseEventCategory, CaseEventAudience, CaseEventAnalysis } from '@domain/case-events';
import type { ClinicalSignal } from './signals';
import type { ConvergenceItem } from './convergence';

/** نسخهٔ باتری — تغییر ملاک/آیتم = نسخهٔ جدید (گزارش‌های قدیم دست‌نخورده می‌مانند) */
export const BATTERY_VERSION = 'battery-v1' as const;
export type BatteryVersion = typeof BATTERY_VERSION;

// ───────────── لایهٔ ۱ — ملاک‌های DSM-5-TR ─────────────

/** یک ملاک حرف‌دار (بازآفرینی فارسی — ترجمهٔ لفظ‌به‌لفظ متن حق‌نویزی‌شده نیست) */
export interface DsmCriterion {
  /** شناسهٔ ملاک — گره آیتم‌های چک‌لیست در RuleSet.criteriaMap با همین id */
  id: string;
  group: 'A' | 'B' | 'C' | 'D' | 'E';
  textFa: string;
}

export interface DsmRecord {
  nameFa: string;
  nameEn: string;
  /** کد ICD-10-CM */
  icd: string;
  criteria: DsmCriterion[];
  /** ملاک طول/تداوم */
  durationFa: string;
  /** ملاک شروع */
  onsetFa: string;
  /** ملاک‌های طرد/تبیین جایگزین */
  exclusionsFa: string[];
  /** خط قرمز ارجاع تخصصی */
  referralFa: string[];
}

// ───────────── هدف بالینی (ادغام دفتر آموزشی + DSM) ─────────────

export type TargetGroup = 'clinical' | 'support';

/** یک تمرین از پیش تعیین‌شده — عیناً از دفترهای آموزشی مرکز */
export interface ExerciseSpec {
  title: string;
  /** توضیح اجرا — فارسی ساده (متن خانواده) */
  description: string;
  /** زمان تقریبی در دفتر آموزشی */
  minutes: number;
}

/** یک گام مسیر مرکز */
export interface PathStep {
  key: string;
  title: string;
}

/** متون سه‌بخشی «لحن ساده» (پلن §۶) — قالب ثابت چه دیدیم/یعنی چه/گام بعدی */
export interface TargetTexts {
  saw: string;
  means: string;
  next: string;
}

export interface ClinicalTarget {
  key: string;
  group: TargetGroup;
  title: string;
  /** فقط گروه clinical — رکورد ملاک‌های DSM-5-TR */
  dsm?: DsmRecord;
  coreDeficit: string;
  homeSigns: string[];
  schoolSigns: string[];
  /** تمایزهای مهم (تفریق تشخیصی به زبان ساده) */
  differentials: string[];
  /** کلیدهای ابزار باتری مرتبط (ce-*) */
  instruments: string[];
  /** کلیدهای پروب عملکردی مرتبط */
  probes: string[];
  /** ۳ تمرین فوری دفتر آموزشی */
  exercises: ExerciseSpec[];
  path: PathStep[];
  texts: TargetTexts;
}

// ───────────── قواعد شواهد (موتور شناسایی — infer در همین را مصرف می‌کند) ─────────────

export type EvidenceKind = 'instrument' | 'probe' | 'sdq' | 'consensus' | 'anamnesis' | 'wechsler';

/** یک قاعدهٔ شواهد: ابزار W زیرمقیاس X در باند Y وزن W */
export interface EvidenceRule {
  kind: EvidenceKind;
  /** کلید ابزار باتری (ce-*) یا کلید ابزار موجود ('sdq-parent'، 'teacher-classroom'،...) */
  toolKey: string;
  subscaleId?: string;
  /** باند لازم برای احتساب شواهد */
  band: 'warn' | 'danger';
  weight: number;
  /** قالب متن شواهد ساده‌فهم (تفسیر «چه دیدیم») */
  fa: string;
}

/** گرهٔ آیتم‌های چک‌لیست به ملاک حرف‌دار DSM */
export interface CriterionMapEntry {
  criterionId: string;
  toolKey: string;
  itemRefs: string[];
  /** حداقل نمرهٔ آیتم برای «برآورده» بودن ملاک از آن آیتم */
  passScore: number;
}

/** قاعدهٔ «چرا نه» — تفریق تشخیصی */
export interface DifferentialRule {
  targetKey: string;
  fa: string;
}

export interface RuleSet {
  targetKey: string;
  batteryVersion: BatteryVersion;
  evidence: EvidenceRule[];
  /** جفت ابزار والد/معلم برای قاعدهٔ هم‌رأیی چندمرجعی */
  consensus?: { parent: string; teacher: string };
  criteriaMap: CriterionMapEntry[];
  differentials: DifferentialRule[];
  /** گپ اطلاعاتی — ابزار بعدی پیشنهادی وقتی شواهد ناکامل است */
  nextInstrument: string[];
}

/** وضعیت یک ملاک DSM در خروجی موتور */
export interface DsmCriterionStatus {
  criterionId: string;
  status: 'met' | 'partial' | 'not_met' | 'unknown';
  sources: string[];
}

// ───────────── موتور شناسایی + پروتکل قضاوت (پلن §۵ و §۷) ─────────────

/** یک رویداد نرمال‌شدهٔ ورودی موتور — سرویس از case_events + case_event_types می‌سازد (I/O این‌جا ممنوع) */
export interface EvidenceEvent {
  eventId: string;
  /** کلید ثابت نوع رویداد (ce-* یا کلید ابزار موجود مثل sdq-parent/wechsler) */
  toolKey: string;
  typeTitle: string;
  status: string;
  /** ISO UTC */
  occurredAt: string;
  payload: Record<string, { value: string; label: string }> | null;
  analysis: CaseEventAnalysis | null;
  /** باندهای کل نوع (نقشهٔ برچسب باند → رنگ برای رویدادهای قدیمی بدون color) */
  bands: CaseEventBand[] | null;
  /** تعریف زیرمقیاس‌های نوع (فال‌بک نقشهٔ باند زیرمقیاس → رنگ) */
  subscales: CaseEventSubscale[] | null;
}

/** اطمینان توصیفی — هیچ‌وقت قطعیت ادعا نمی‌کند (پلن §۶ قاعدهٔ ۴) */
export type ConfidenceLevel = 'کم' | 'متوسط' | 'زیاد';

/** یک فرضیهٔ رتبه‌بندی‌شده — شکل §۹ (snapshot در intervention_paths.engine_hypothesis) */
export interface RankedHypothesis {
  targetKey: string;
  targetTitle: string;
  confidence: ConfidenceLevel;
  /** جمع وزن شواهد — عدد فنی (در متن اصلی نمی‌آید؛ قاعدهٔ ۳ لحن ساده) */
  score: number;
  evidenceFa: string[];
  missingFa: string[];
  /** تفریق‌های تشخیصی فعال برای این فرضیه («چرا نه») */
  differentialsFa: string[];
  /** خلاصهٔ جدول ملاک‌ها — counts برای نمایش */
  criteriaSummary: { met: number; partial: number; unknown: number; notMet: number };
}

/** خروجی کامل موتور شناسایی — محاسبهٔ زندهٔ قطعی از دادهٔ موجود (بدون جدول تفسیر) */
export interface InferenceOutput {
  batteryVersion: BatteryVersion;
  /** ISO UTC لحظهٔ تولید */
  generatedAt: string;
  /** جدول وضعیت ملاک‌ها برای همهٔ اهداف بالینیِ دارای داده (پلن §۵ گام ۱) */
  criteria: (DsmCriterionStatus & { targetKey: string; textFa: string; group: DsmCriterion['group'] })[];
  ranked: RankedHypothesis[];
  /** ناهم‌رأیی چندمرجعی (پلن §۵ گام ۴) */
  discrepancies: string[];
  /** گپ اطلاعاتی + اقدام بعدی مشخص (پلن §۵ گام ۵) */
  nextActions: string[];
  /** پوشش داده — چه ابزارهایی آمده / چه ابزارهایی از باتری غایب‌اند */
  dataCoverage: { seen: string[]; seenTitles: string[] };
  /** پرچم‌های خط قرمز (آیتم بحرانی/ارجاع) */
  referralFlags: string[];
  /**
   * T4 (m148) — کلید افزودنی: سیگنال‌های شرح‌حال (فقط از آخرین رویداد نسخهٔ ۳).
   * پروندهٔ فقط-v2 / بی‌شرح‌حال → [] — هیچ کلید قدیمی دیگری تغییر نمی‌کند (اثبات: t4-baseline).
   */
  anamnesisSignals: ClinicalSignal[];
  /**
   * T6 (m148-b) — کلید افزودنی: هم‌گرایی چندمنبعی — سه حالت خوانا (هم‌گرا/تنها/واگرا)
   * + یک جملهٔ دلالت برای هر هدف رتبه‌خورده. هیچ وزن/امتیاز/ماتریسی در این ساختار نیست
   * (اصل ۳ طرح: پشت‌پردهٔ نامرئی). جمع‌آوری منابع در همان یک محاسبهٔ runInference انجام
   * می‌شود؛ طبقه‌بندی و متن‌ها در convergence.ts.
   */
  convergence: ConvergenceItem[];
}

/** تصمیم ثبت‌شدهٔ درمانگر — دادهٔ کالیبراسیون «موتور چه گفت / متخصص چه گرفت» */
export interface PathDecision {
  action: 'confirm' | 'edit' | 'reject' | 'need_info';
  by: string;
  byName: string;
  /** ISO UTC */
  at: string;
  note: string | null;
}

/** یک گام مسیر با وضعیت انجام */
export interface PathStepState {
  key: string;
  title: string;
  doneAt: string | null;
}

export const INTERVENTION_PATH_STATUSES = ['suggested', 'reviewed', 'active', 'closed'] as const;
export type InterventionPathStatus = (typeof INTERVENTION_PATH_STATUSES)[number];

export const INTERVENTION_PATH_STATUS_LABELS: Record<InterventionPathStatus, string> = {
  suggested: 'پیشنهاد موتور',
  reviewed: 'بازبینی‌شده',
  active: 'در مداخله',
  closed: 'بسته‌شده'
};

export interface InterventionPathRecord {
  id: string;
  studentId: string;
  studentName: string;
  targetKey: string;
  targetTitle: string;
  status: InterventionPathStatus;
  /** snapshot فرضیهٔ موتور در لحظهٔ ساخت — پایهٔ کالیبراسیون ؛ null = هدف دستی درمانگر */
  engineHypothesis: RankedHypothesis | null;
  decision: PathDecision | null;
  steps: PathStepState[];
  exerciseIds: string[];
  reassessAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** تعریف یک پروب برای infer — نگاشت کلید پروب → فیلد اصلی + هنجار */
export interface ProbeDef {
  toolKey: string;
  /** فیلد عددی اصلی پروب در payload */
  valueField: string;
  /** فیلد پایه/پایهٔ تحصیلی */
  gradeField: string;
  norm: Record<string, number>;
  /** عنوان فارسی برای متن گپ */
  fa: string;
}

// ───────────── تعریف خام ابزار باتری (شکل JSON) ─────────────

export interface BatteryDef {
  key: string;
  title: string;
  /** — معرفی روایی فرم برای انتخابگر و سربرگ */
  description?: string;
  category: CaseEventCategory;
  icon: string;
  familyFillable: boolean;
  audience: CaseEventAudience;
  source: string;
  tags: string[];
  fields?: CaseEventField[];
  subscales?: CaseEventSubscale[] | null;
  bands?: CaseEventBand[] | null;
  /** آیتم‌ها و زیرمقیاس‌ها از این کلید کپی می‌شوند (فقط باندها تفاوت دارد — مثل SNAP-IV والد/معلم) */
  sameItemsAs?: string;
  /**
   * — T5 (m150): پکیج چند-ابزاری فرم جامع خانواده — کامپوننت‌ها به‌ترتیب اجرا.
   * فقط برای کلید پکیج (ce-comp-family-v2) معنا دارد؛ فیلدهای خودِ تعریف = بلوک زمینهٔ کوتاه.
   * مصرف: فرم عمومی پکیجی (رندر بخش‌به‌بخش + رویداد مستقل به‌ازای هر کامپوننت) — نه ابزار تکی پیشنهادی.
   * آینهٔ قرارداد: COMPOSITE_FAMILY_COMPONENTS در case-events/pure.ts (تست پاریتی دارد).
   */
  packageComponents?: string[];
}

import type { CaseEventField, CaseEventSubscale, CaseEventBand, CaseEventCategory, CaseEventAudience, CaseEventAnalysis } from '@domain/case-events';
import type { ClinicalSignal } from './signals';
import type { ConvergenceItem } from './convergence';
import type { ProbeVerdict, ProbeMasteryEvaluation, ProbePointLike, ProbeMonitor } from './progress'; // پراپ پیشروی مسیر · داوری پایش

export const BATTERY_VERSION = 'battery-v1' as const;
export type BatteryVersion = typeof BATTERY_VERSION;

export interface DsmCriterion {
  id: string;
  group: 'A' | 'B' | 'C' | 'D' | 'E';
  textFa: string;
}

export interface DsmRecord {
  nameFa: string;
  nameEn: string;
  icd: string;
  criteria: DsmCriterion[];
  durationFa: string;
  onsetFa: string;
  exclusionsFa: string[];
  referralFa: string[];
}

export type TargetGroup = 'clinical' | 'support';

export interface ExerciseSpec {
  title: string;
  description: string;
  minutes: number;
}

export interface PathStep {
  key: string;
  title: string;
}

export interface TargetTexts {
  saw: string;
  means: string;
  next: string;
}

export interface ClinicalTarget {
  key: string;
  group: TargetGroup;
  title: string;
  dsm?: DsmRecord;
  coreDeficit: string;
  homeSigns: string[];
  schoolSigns: string[];
  differentials: string[];
  instruments: string[];
  probes: string[];
  exercises: ExerciseSpec[];
  path: PathStep[];
  texts: TargetTexts;
}

export type EvidenceKind = 'instrument' | 'probe' | 'sdq' | 'consensus' | 'anamnesis' | 'wechsler';

export interface EvidenceRule {
  kind: EvidenceKind;
  toolKey: string;
  subscaleId?: string;
  band: 'warn' | 'danger';
  weight: number;
  fa: string;
}

export interface CriterionMapEntry {
  criterionId: string;
  toolKey: string;
  itemRefs: string[];
  passScore: number;
}

export interface DifferentialRule {
  targetKey: string;
  fa: string;
}

export interface RuleSet {
  targetKey: string;
  batteryVersion: BatteryVersion;
  evidence: EvidenceRule[];
  consensus?: { parent: string; teacher: string };
  criteriaMap: CriterionMapEntry[];
  differentials: DifferentialRule[];
  nextInstrument: string[];
}

export interface DsmCriterionStatus {
  criterionId: string;
  status: 'met' | 'partial' | 'not_met' | 'unknown';
  sources: string[];
  exclusionsFa?: string[]; // مالک استثنایی فعال روی این ملاک (ملاک D)
}

export interface EvidenceEvent {
  eventId: string;
  toolKey: string;
  typeTitle: string;
  status: string;
  occurredAt: string;
  payload: Record<string, { value: string; label: string }> | null;
  analysis: CaseEventAnalysis | null;
  bands: CaseEventBand[] | null;
  subscales: CaseEventSubscale[] | null;
}

export type ConfidenceLevel = 'کم' | 'متوسط' | 'زیاد';

// کلید مالک‌های استثنایی (بند D) — تعریف وزن‌ها و شمول در exclusions.ts
export type ExclusionFactorKey =
  | 'id_deficit'
  | 'sensory'
  | 'insufficient_education'
  | 'absenteeism'
  | 'bilingualism'
  | 'psychosocial';

// یک مالک استثنایی فعال‌شده از دادهٔ موجود (شرح‌حال v3 / وکسلر / انطباق)
export interface ExclusionHit {
  key: ExclusionFactorKey;
  titleFa: string;
  strength: 'warn' | 'danger'; // danger = «پررنگ» — بج «نیاز به رد استثنا» می‌گیرد
  weight: number;              // وزن مؤثر رتبه (danger کامل، warn نصف)
  evidenceFa: string;          // داده‌ای که این مالک را فعال کرده
}

export interface RankedHypothesis {
  targetKey: string;
  targetTitle: string;
  confidence: ConfidenceLevel;
  score: number;
  evidenceFa: string[];
  missingFa: string[];
  differentialsFa: string[];
  criteriaSummary: { met: number; partial: number; unknown: number; notMet: number };
  // مالک‌های استثنایی مرتبط با همین فرضیه + کسر رتبهٔ وزن‌دار + بج «نیاز به رد استثنا»
  exclusionsFa: string[];
  exclusionPenalty: number;
  needsExclusionRuling: boolean;
}

export interface InferenceOutput {
  batteryVersion: BatteryVersion;
  generatedAt: string;
  criteria: (DsmCriterionStatus & { targetKey: string; textFa: string; group: DsmCriterion['group'] })[];
  ranked: RankedHypothesis[];
  discrepancies: string[];
  nextActions: string[];
  dataCoverage: { seen: string[]; seenTitles: string[] };
  referralFlags: string[];
  anamnesisSignals: ClinicalSignal[];
  convergence: ConvergenceItem[];
  exclusions: ExclusionHit[]; // همهٔ مالک‌های استثنایی فعال‌شده از دادهٔ موجود
}

export interface PathDecision {
  action: 'confirm' | 'edit' | 'reject' | 'need_info';
  by: string;
  byName: string;
  at: string;
  note: string | null;
}

export interface PathStepState {
  key: string;
  title: string;
  doneAt: string | null;
  hint?: string | null;
}

// ─── پروتکل جلسه‌به‌جلسهٔ مسیر + قالب مسیر (بازگردانی بخش مدیریت قالب‌ها) ───
export const PATHWAY_SESSION_STATUSES = ['planned', 'done', 'skipped'] as const;
export type PathwaySessionStatus = (typeof PATHWAY_SESSION_STATUSES)[number];

// دو نوع کارت: پراپ (سنجش کوتاه جلسه) + آموزش خانواده (محتوای والد-محور)؛
// ارجاع به «دکترین سه‌نفره» حذف شد (سه‌گانهٔ بالینی در لغو شد، خود کارت‌ها معتبرند)
export const PATHWAY_ITEM_TYPES = ['exercise', 'homework', 'game', 'instruction', 'event', 'probe', 'family'] as const;
export type PathwayItemType = (typeof PATHWAY_ITEM_TYPES)[number];

export interface PathSessionItem {
  type: PathwayItemType;
  text: string;
  done: boolean;
  linkId: string | null; // پیوند کارت به رکورد بانک تمرین (تمرین/بازی/دستورالعمل/آموزش خانواده)
}

export interface PathSessionRecord {
  id: string;
  pathwayId: string;
  ord: number;
  title: string;
  plan: string | null;
  criterion: string | null; // معیار تسلط جلسه
  outcome: string | null; // نتیجهٔ جلسه پس از اجرا
  items: PathSessionItem[];
  status: PathwaySessionStatus;
  doneAt: string | null;
  note: string | null;
  fidelity: SessionFidelity | null; // وفاداری اجرا (پروتکل/تمرین خانگی/حضور والد)
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// چک‌لیست وفاداری اجرای جلسه — سه بولی؛ null یعنی هنوز پر نشده
export interface SessionFidelity {
  protocol: boolean; // پروتکل کامل اجرا شد
  homework: boolean; // تمرین خانگی تنظیم شد
  parent: boolean;   // حضور/هماهنگی والد برقرار بود
}

export interface PathwayTemplateStep {
  key: string;
  title: string;
  hint?: string | null;
}

export interface PathwayTemplateSession {
  title: string;
  plan: string | null; // هدف جلسه در طرح
  criterion: string | null; // معیار تسلط جلسه
  items: PathSessionItem[]; // done در قالب همیشه false است — تیک مالِ جلسهٔ دانش‌آموز است
}

export interface PathwayTemplateSummary {
  key: string;
  title: string;
  description: string | null;
  protocol: string | null;
  targetKey: string | null;
  steps: PathwayTemplateStep[];
  sessions: PathwayTemplateSession[];
  isSystem: boolean;
  active: boolean;
  createdBy: string | null;
}

export const INTERVENTION_PATH_STATUSES = ['suggested', 'reviewed', 'active', 'closed'] as const;
export type InterventionPathStatus = (typeof INTERVENTION_PATH_STATUSES)[number];

export const INTERVENTION_PATH_STATUS_LABELS: Record<InterventionPathStatus, string> = {
  suggested: 'پیشنهاد سامانه',
  reviewed: 'بازبینی‌شده',
  active: 'در مداخله',
  closed: 'بسته‌شده'
};

// کارتِ استفاده‌شدهٔ تیم (کتابخانهٔ استفادهٔ مجدد — حذف دوباره‌کاری)
export interface RecentCardRecord {
  type: PathwayItemType;
  text: string;
  linkId: string | null;
  usageCount: number;
  lastUsedAt: string;
}

export interface InterventionPathRecord {
  id: string;
  studentId: string;
  studentName: string;
  targetKey: string;
  targetTitle: string;
  status: InterventionPathStatus;
  engineHypothesis: RankedHypothesis | null;
  decision: PathDecision | null;
  steps: PathStepState[];
  exerciseIds: string[];
  templateKey: string | null;
  templateTitle: string | null;
  sessions: PathSessionRecord[];
  // بج پراپ در سرستون کارت مسیر (شمارش + سنجهٔ تسلط‌یافته) — بدون فراخوان اضافه از فرانت
  probeSummary: PathProbeSummaryBadge | null;
  reassessAt: string | null;
  // هدف اندازه‌پذیر (SMART) + اسنپ‌شات قواعد اگر-آنگاهِ فعالِ لحظهٔ ساخت — هر دو nullable
  goal: string | null;
  goalBasis: PathBasisSnapshot | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// اسنپ‌شات مبنا روی مسیر (هم‌ساخت با BasisSuggestion در basis.ts — بدون import متقاطع)
export interface PathBasisSnapshot {
  targetKey: string;
  rules: { key: string; ifFa: string; thenFa: string; sourceFa: string }[];
}

// ─── پایش پیشروی SLD: پراپ‌های سری زمانی مسیر مداخله ───
// بج خلاصهٔ پراپ برای فهرست مسیرها (masteredMetric = آخرین سنجه‌ای که ملاک دوجلسه‌ای را گذرانده)
export interface PathProbeSummaryBadge {
  count: number;
  masteredMetric: string | null;
}

export interface PathProbeRecord {
  id: string;
  pathwayId: string;
  sessionId: string | null;
  targetKey: string; // اسنپ‌شات هدف مسیر در لحظهٔ ثبت
  metric: string;
  value: number;
  unit: string | null;
  takenAt: string;
  takenBy: string;
  note: string | null;
  createdAt: string;
}

export interface PathProbeSeries {
  metric: string;
  unit: string | null;
  count: number;
  firstAt: string | null;
  lastAt: string | null;
  latestValue: number | null;
  slope: number;
  verdict: ProbeVerdict;
  mastery: ProbeMasteryEvaluation;
  monitor: ProbeMonitor; // قاعدهٔ ۴-نقطه + هشدار سکون
  points: ProbePointLike[];
}

// ─── گزارش دوره‌ای طرح درمان (فقط‌خواندنی؛ روی‌دادِ محاسبه‌شده — هیچ جدول گزارشی وجود ندارد) ───
export interface PathwayReportPeriod {
  from: string | null; // YYYY-MM-DD — غایب یعنی کل دوره
  to: string | null;
}

export interface PathwayReportPathway {
  id: string;
  studentId: string;
  studentName: string;
  targetKey: string;
  targetTitle: string;
  status: InterventionPathStatus;
  templateTitle: string | null;
  createdAt: string;
  reassessAt: string | null;
}

export interface PathwayReportSummary {
  sessionsTotal: number;
  sessionsDone: number;
  sessionsSkipped: number;
  sessionsPlanned: number;
  // پوشش نتیجه: سهم جلسات انجام‌شده‌ای که نتیجهٔ نوشته دارند (۰..۱)؛ بدون جلسهٔ انجام‌شده null
  outcomeCoverage: number | null;
  cardsTotal: number;
  cardsDone: number;
  cardsDonePct: number | null; // ۰..۱۰۰
  probeCardsPlanned: number;
  probeCardsDone: number;
  firstOutcome: string | null;
  latestOutcome: string | null;
  doneDateFirst: string | null;
  doneDateLast: string | null;
}

export interface PathwayReportSession {
  ord: number;
  title: string;
  status: PathwaySessionStatus;
  goal: string | null;
  criterion: string | null;
  outcome: string | null;
  doneAt: string | null; // مهر زمانیِ ملاک فیلتر بازه — done_at جدول
  cards: PathSessionItem[];
  cardsDone: number;
  cardsTotal: number;
}

export interface PathwayReport {
  pathway: PathwayReportPathway;
  period: PathwayReportPeriod;
  summary: PathwayReportSummary;
  sessions: PathwayReportSession[];
  monitoring: PathwayReportMonitoring; // پاسخ عددی سه پرسش: تسلط؟ روند؟ تصمیم؟
  parent: ReportParentVariant; // گزارش والدپسند (زبان ساده)
  school: ReportSchoolVariant; // گزارش مدرسه (عملکرد کلاس + توصیهٔ اجرایی)
  familySummary: string; // پاراگراف قطعیِ بدون LLM — فقط قالب رشته با اعداد واقعی
}

// دو واریانت از همان داده — ساخت سمت سرور، تک‌منبع
export interface ReportParentVariant {
  headline: string;
  paragraphs: string[];
  tips: string[];
}

export interface ReportSchoolVariant {
  headline: string;
  performance: string[];
  actions: string[];
}

// سه پرسش عددی گزارش دوره‌ای + شمارش دوز و وفاداری اجرا
export interface PathwayReportMonitoring {
  metric: string | null;          // سنجهٔ اصلی (پراپ با بیشترین داده)
  points: number;                 // تعداد دادهٔ سنجهٔ اصلی
  masteryPct: number | null;      // آخرین مقدار نسبت به ملاک تسلط (٪)
  masteryAchieved: boolean | null; // ملاک دوجلسه‌ای برقرار؟
  slopePerSession: number | null; // شیب OLS به‌ازای هر جلسه/پراپ
  trendKey: string | null;        // کلید داوری OLS
  fourPointKey: string | null;    // کلید قاعدهٔ ۴-نقطه
  decision: string | null;        // تصمیم پیشنهادی (continue/dose/change/none)
  decisionLabel: string | null;   // برچسب فارسی همان تصمیم
  dosePlanned: number;            // دوز بر مبنای جلسات برنامه‌ریزی‌شده
  doseDone: number;
  doseAdherencePct: number | null; // درصد دوز اجراشده نسبت به برنامه‌ریزی‌شده
  fidelityPct: number | null;      // میانگین وفاداری اجرا در جلسات دارای چک‌لیست (٪)
}

export interface ProbeDef {
  toolKey: string;
  valueField: string;
  gradeField: string;
  norm: Record<string, number>;
  fa: string;
}

export interface BatteryDef {
  key: string;
  title: string;
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
  sameItemsAs?: string;
}

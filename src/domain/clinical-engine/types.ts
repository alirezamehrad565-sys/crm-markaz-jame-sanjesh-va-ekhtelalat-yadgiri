import type { CaseEventField, CaseEventSubscale, CaseEventBand, CaseEventCategory, CaseEventAudience, CaseEventAnalysis } from '@domain/case-events';
import type { ClinicalSignal } from './signals';
import type { ConvergenceItem } from './convergence';

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

export interface RankedHypothesis {
  targetKey: string;
  targetTitle: string;
  confidence: ConfidenceLevel;
  score: number;
  evidenceFa: string[];
  missingFa: string[];
  differentialsFa: string[];
  criteriaSummary: { met: number; partial: number; unknown: number; notMet: number };
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
}

export const INTERVENTION_PATH_STATUSES = ['suggested', 'reviewed', 'active', 'closed'] as const;
export type InterventionPathStatus = (typeof INTERVENTION_PATH_STATUSES)[number];

export const INTERVENTION_PATH_STATUS_LABELS: Record<InterventionPathStatus, string> = {
  suggested: 'پیشنهاد سامانه',
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
  engineHypothesis: RankedHypothesis | null;
  decision: PathDecision | null;
  steps: PathStepState[];
  exerciseIds: string[];
  reassessAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
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
  packageComponents?: string[];
}

import {
  formulateCase as formulateCaseRaw,
  buildCaseFormulation,
  wechslerFromEvent,
  ageYearsFromBirthDate,
} from "./engine.js";
import type { RankedHypothesis } from "../clinical-engine/types";
import type { ConvergenceItem } from "../clinical-engine/convergence";
import { runInference } from "../clinical-engine/infer";

export interface EvidenceEvent {
  eventId?: string;
  toolKey: string;
  typeTitle?: string | null;
  status?: string | null;
  occurredAt?: string | null;
  payload?: Readonly<Record<string, { value?: unknown; label?: string } | undefined>> | null;
  analysis?: {
    score?: number | null;
    band?: string | null;
    subscaleScores?: readonly {
      id: string;
      score?: number;
      band?: string | null;
      color?: string | null;
      max?: number;
    }[] | null;
    flags?: readonly { label: string; [key: string]: unknown }[] | null;
  } | null;
  bands?: readonly { label: string; color: string }[] | null;
  subscales?: readonly { id: string; bands?: readonly { label: string; color: string }[] | null }[] | null;
}

export interface WechslerOutcome {
  id: string;
  status?: string;
  level?: string;
  rejectReason?: string | null;
}

export interface WechslerResult {
  ok?: boolean;
  snapshot?: {
    indices: Readonly<Record<string, { scaled?: number | null; percentile?: number | null } | undefined>>;
    indexScatter?: number | null;
    substitutes?: string[];
    computable?: Readonly<Record<string, boolean>>;
    fsiq?: number | null;
    gai?: number | null;
    gaiMeta?: unknown;
  } | null;
  main?: WechslerOutcome | null;
  comorbid?: WechslerOutcome | null;
  outcomes?: WechslerOutcome[];
  weakDomains?: string[];
  flags?: readonly { validity?: boolean; fa?: string }[];
  monitoringInterval?: string | null;
}

export interface OtSkill {
  status?: string | null;      // مقادیر مجاز: mastered | with_help | not_yet | null
  expectedAge?: string | null; // e.g. "۶-۸"
}

export interface OtDomain {
  key: string;               // مقادیر مجاز: gross | fine | visual | auditory | cognitive | adl | social
  scored?: number;
  notYet?: number;
  withHelp?: number;
  skills?: readonly OtSkill[];
}

export interface OtProfile {
  domains: readonly OtDomain[];
}

export interface GateStatus {
  key: string;               // مقادیر مجاز: anamnesis | behavioral | wechsler | skills | needs
  label?: string;
  done?: boolean;
  detail?: string;
}

export interface GatesSnapshot {
  gates: readonly GateStatus[];
}

export interface FormulationChild {
  id: string;
  ageYears?: number;
  grade?: string | null;
}

export interface FormulationEvidence {
  events: readonly EvidenceEvent[];
  wechsler: WechslerResult | null;
  ot: OtProfile | null;
  gates: GatesSnapshot | null;
  child: FormulationChild;
}

export interface FormulationOptions {
  now?: () => Date;
}

export type ConstructLevel = "پایین" | "مرزی" | "قابل‌توجه" | "هم‌گرا-بالا";
export type SourceType = "parent" | "teacher" | "examiner" | "performance";

export interface ConstructReport {
  key: string;
  titleFa: string;
  level: ConstructLevel;
  score: number;
  rawScore: number;
  sources: SourceType[];
  evidenceFa: readonly { toolId: string; signal: string; weight: number; sourceType: SourceType; textFa: string }[];
  conflictFa: readonly string[];
  capsFa?: readonly string[];
  subtypeFa?: readonly string[];
  sharedWith?: string;
}

export interface ComorbidityPattern {
  key: string; // شناسهٔ مسیر بین P1 تا P12 — مثلاً P12_GLOBAL_WEAK
  titleFa: string;
  baseRateFa: string;
  constructs: readonly string[];
  status: "active" | "candidate" | "ruled_out";
  rationaleFa: string;
  actionFa: string;
}

export interface FormulationResult {
  schemaVersion: ".2";
  generatedAt: string;
  childId: string;
  ageYears?: number;
  grade?: string | null;
  constructs: ConstructReport[];
  coherence: "واگرا" | "هم‌گرا" | "ناقص";
  patterns: ComorbidityPattern[];
  primaryProfile: { key: string; titleFa: string; rationaleFa: string; sharedConstructKeys: string[] };
  differentialsFa: string[];
  wechslerLink: Record<string, unknown> | null;
  redFlags: readonly { key: string; textFa: string; actionFa: string; urgent: boolean }[];
  dataCoverage: { percent: number; missing: string[] };
  nextActions: readonly { priority: number; actionFa: string; toolId?: string; reasonFa?: string }[];
  protocolSuggestion: { protocol: string; secondary?: string; rationaleFa: string } | null;
  monitoring: { intervalMonths: number; rationaleFa: string };
  confidence: number; // عدد بین ۰٫۱ و ۰٫۹۵
  capsFa: string[];
  disclaimer: string;
  inferenceRanked?: readonly RankedHypothesis[];
  inferenceConvergence?: readonly ConvergenceItem[];
}

export function formulateCase(
  evidence: FormulationEvidence,
  options?: FormulationOptions
): FormulationResult {
  const raw = formulateCaseRaw(evidence as never, options) as unknown as FormulationResult;
  const inf = runInference((evidence.events ?? []) as never, options);
  return { ...raw, inferenceRanked: inf.ranked, inferenceConvergence: inf.convergence };
}

export { buildCaseFormulation, wechslerFromEvent, ageYearsFromBirthDate };

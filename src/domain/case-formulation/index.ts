// Case-formulation engine (موتور فرمول‌بندی مورد) — public TypeScript API.
//
// EXTRACTED MODULE: the engine body lives in engine.js, a byte-verbatim
// extraction of worker/bundle.js lines 29109-30981 (commit 365d103, "m130
// (1.00.9)", extracted 2026-02-01 by task 39-d2). This file only adds types and
// re-exports the entry point. NOT yet wired into the build: production still
// runs the bundle; equivalence is proven by tests/golden/formulation-golden.test.mjs.
//
// Interface (mirrors the bundle call site — bundle.js:31066-31078,
// createReasoningEngineService.getCaseFormulation for route
// GET /api/students/:id/case-formulation):
//   formulateCase({ events, wechsler, ot, gates, child }, { now? }) -> formulation JSON
//     events   : completed case_events rows, most recent first
//     wechsler : wechsler engine output (or wechslerFromEvent(payload)) or null
//     ot       : OT profile (otEngine.getOtProfile) or null
//     gates    : standard-pathway gates (otEngine.getGates) or null
//     child    : { id, ageYears, grade }

import {
  formulateCase as formulateCaseRaw,
  buildCaseFormulation,
  wechslerFromEvent,
  ageYearsFromBirthDate,
} from "./engine.js";

// ─────────────────────────── input types ───────────────────────────

/** One completed case_event row, as loaded by loadEvidenceEvents (bundle.js:31006-31037). */
export interface EvidenceEvent {
  eventId?: string;
  toolKey: string;
  typeTitle?: string | null;
  /** only "completed" events are consumed (latestPerTool2) */
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
  /** band table of the case_event_type — used as color fallback */
  bands?: readonly { label: string; color: string }[] | null;
  subscales?: readonly { id: string; bands?: readonly { label: string; color: string }[] | null }[] | null;
}

/** Wechsler outcome object from the wechsler engine (or rejected/candidate entry). */
export interface WechslerOutcome {
  id: string;
  status?: string;
  level?: string;
  rejectReason?: string | null;
}

/** Wechsler engine output, or the object built by wechslerFromEvent(). */
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
  status?: string | null;      // "mastered" | "with_help" | "not_yet" | null
  expectedAge?: string | null; // e.g. "۶-۸"
}

export interface OtDomain {
  key: string;               // gross | fine | visual | auditory | cognitive | adl | social
  scored?: number;
  notYet?: number;
  withHelp?: number;
  skills?: readonly OtSkill[];
}

export interface OtProfile {
  domains: readonly OtDomain[];
}

export interface GateStatus {
  key: string;               // anamnesis | behavioral | wechsler | skills | needs
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

// ─────────────────────────── output types ───────────────────────────

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
  key: string; // P1..P12, e.g. "P12_GLOBAL_WEAK"
  titleFa: string;
  baseRateFa: string;
  constructs: readonly string[];
  status: "active" | "candidate" | "ruled_out";
  rationaleFa: string;
  actionFa: string;
}

export interface FormulationResult {
  schemaVersion: "m93.1";
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
  otLink: { delayedDomainsFa: string[]; summaryFa: string } | null;
  redFlags: readonly { key: string; textFa: string; actionFa: string; urgent: boolean }[];
  dataCoverage: { percent: number; missing: string[] };
  nextActions: readonly { priority: number; actionFa: string; toolId?: string; reasonFa?: string }[];
  protocolSuggestion: { protocol: string; secondary?: string; rationaleFa: string } | null;
  monitoring: { intervalMonths: number; rationaleFa: string };
  narrative: { saw: string; means: string; next: string };
  confidence: number; // 0.1-0.95
  capsFa: string[];
  disclaimer: string;
}

// ─────────────────────────── public API ───────────────────────────

/**
 * Pure case-formulation engine — exact behavioral twin of
 * buildCaseFormulation in worker/bundle.js (lines 30763-30872).
 */
export function formulateCase(
  evidence: FormulationEvidence,
  options?: FormulationOptions
): FormulationResult {
  return formulateCaseRaw(evidence as never, options) as unknown as FormulationResult;
}

export { buildCaseFormulation, wechslerFromEvent, ageYearsFromBirthDate };

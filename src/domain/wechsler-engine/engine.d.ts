export type SubtestCode =
  | "BD" | "SI" | "DS" | "PCn" | "CD" | "VC" | "LN" | "MR" | "CO" | "SS"
  | "PCm" | "CA" | "IN" | "AR" | "WR";

export type RawScores = Partial<Record<SubtestCode, number>>;

export type JalaliDate = [number, number, number];

export interface WechslerAnalysisInput {
  rawScores: RawScores;
  testDate: JalaliDate;
  birthDate: JalaliDate;
  strict?: boolean;
  baseAnswers?: Record<string, string>;
  skippedHypotheses?: string[];
}

export interface WechslerValidationError {
  kind: "shape" | "date" | "age" | "raw_range" | "no_data";
  message: string;
  code?: string;
  value?: string;
  min?: number;
  max?: number;
}

export interface WechslerValidation {
  ok: boolean;
  errors: WechslerValidationError[];
  warnings: string[];
  computable: { VCI: boolean; PRI: boolean; WMI: boolean; PSI: boolean; FSIQ: boolean };
  raw: RawScores;
  testDate: JalaliDate;
  birthDate: JalaliDate;
  years: number;
  band: string;
  missing: SubtestCode[];
}

export interface WechslerPsychometrics {
  fsiq: { value: number; band: string | null; bandFa: string | null; percentile: number | null; computable: boolean } | null;
  indices: Array<{ key: string; fa: string; scaled: number; percentile: number | null; cls: string | null }>;
  scatter: { value: number; homogeneous: boolean } | null;
  strengths: Array<{ key: string; fa: string; diff: number }>;
  weaknesses: Array<{ key: string; fa: string; diff: number }>;
  gaps: Array<{ key: string; fa: string; diff: number; textFa: string }>;
  patterns: Array<{ key: string; textFa: string }>;
  validityNotes: string[];
  summaryFa: string;
}

export interface WechslerIndexScore {
  scaled: number | null;
  percentile: number | null;
  ci: string | null;
  cls: string;
}

export interface WechslerSnapshot {
  indices: Record<string, WechslerIndexScore>;
  subtests: Array<{ code: string; raw: number | null; scaled: number | null }>;
  indexScatter: number;
  spreads: Record<string, number>;
  computable: { VCI: boolean; PRI: boolean; WMI: boolean; PSI: boolean; FSIQ: boolean };
  substitutes: string[];
  gai: number | null;
  gaiMeta: { scaled: number; percentile: number | null; ci95: string | number | null } | null;
  fsiq: number | null;
  personalIndexMean: number;
  personalSubMean: number | null;
  outOfBandSubs: number;
  weakestIndex: string | null;
  strongestIndex: string | null;
  step5Weak: string[];
  step5Strong: string[];
  s5rows: Array<{ key: string; scaled: number; diff: number; cut: number; valid: boolean; strength: string; unusual: boolean }>;
  pairs: Array<{ label: string; aLabel: string; bLabel: string; winner: string; diff: number; unusual: boolean; text: string; advice: string }>;
  subStrong: Array<{ code: string; scaled: number }>;
  subWeak: Array<{ code: string; scaled: number }>;
}

export interface WechslerAnalysisResult {
  ok: boolean;
  ageLine: string;
  validation: WechslerValidation;
  analysis: Record<string, unknown> | null;
  snapshot: WechslerSnapshot | null;
  flags: Array<{ id: string; fa: string; validity: boolean }>;
  psychometrics: WechslerPsychometrics | null;
  weakDomains: Array<{ domain: string; label: string; indices: string[] }>;
  monitoringInterval: string;
  signals: WechslerSignal[];
  profile: WechslerProfile | null;
}

export type WechslerFsiqBand =
  | "ID"
  | "BIF"
  | "LOW_BORDER"
  | "AVERAGE"
  | "HIGH_AVERAGE"
  | "SUPERIOR"
  | "GIFTED";

export interface WechslerFsiqBandRange {
  band: WechslerFsiqBand;
  min: number;
  max: number;
  fa: string;
}

export interface WechslerSignal {
  domain:
    | "attention"
    | "language"
    | "memory"
    | "executive"
    | "social"
    | "emotional"
    | "academic"
    | "motor"
    | "cognitive_level"
    | "validity";
  key: string;
  value: number;
  source: "anamnesis" | "wechsler" | "checklist" | "probe" | "ot" | "observation";
  fa: string;
}

export interface WechslerIndexPair {
  scaled: number;
  percentile: number | null;
}

export interface WechslerProfilePattern {
  codes: string[];
  scaled: Record<string, number>;
}

export interface WechslerProfile {
  vci: WechslerIndexPair | null;
  pri: WechslerIndexPair | null;
  wmi: WechslerIndexPair | null;
  psi: WechslerIndexPair | null;
  fsiq: number | null;
  gai: number | null;
  gaiValidity: string | null;
  indexScatter: number;
  fsiqBand: WechslerFsiqBand | null;
  acid: WechslerProfilePattern | null;
  cad: WechslerProfilePattern | null;
  step5: { strengths: string[]; weaknesses: string[] };
  substitutes: string[];
  flags: Array<{ id: string; fa: string; validity: boolean }>;
}

export interface FormFieldEntry {
  value?: string | number | null;
  label?: string;
}

export type FormPayload = Record<string, FormFieldEntry | undefined | null>;

export interface WechslerComputedScores {
  fsiq: number | null;
  vci: number | null;
  pri: number | null;
  wmi: number | null;
  psi: number | null;
  gai: number | null;
  ageLine: string;
}

export interface WechslerHookResult {
  payload: FormPayload;
  ran: boolean;
  result: WechslerAnalysisResult | null;
  computed: WechslerComputedScores;
}

export declare function runWechslerAnalysis(input: WechslerAnalysisInput): WechslerAnalysisResult;
export declare function analyzeWisc(
  rawScores: RawScores,
  testDate: JalaliDate,
  birthDate: JalaliDate,
  strict?: boolean
): Record<string, unknown>;

export type WechslerResultSlice = Pick<
  WechslerAnalysisResult,
  "ok" | "snapshot" | "analysis" | "flags"
>;

export declare function profileSignals(result: WechslerResultSlice | null | undefined): WechslerSignal[];

export declare function buildWechslerProfile(result: WechslerResultSlice | null | undefined): WechslerProfile | null;

export declare function fsiqBandOf(fsiq: number): WechslerFsiqBand;

export declare const FSIQ_BANDS: WechslerFsiqBandRange[];
export declare function applyWechslerEngineToPayload(
  payload: FormPayload,
  birthDateRaw: string | null | undefined,
  occurredAtIso: string
): WechslerHookResult;
export declare function extractRawScores(payload: FormPayload | null | undefined): RawScores;
export declare function compactWechslerOutput(result: WechslerAnalysisResult): Record<string, unknown>;
export declare function parseJalaliLoose(input: unknown): JalaliDate | null;
export declare function parseBirthDateLoose(input: unknown): JalaliDate | null;
export declare function gregorianIsoToJalali(iso: string): JalaliDate;
export declare function normalizeDigits(input: string): string;
export declare function summarySafePayload(payload: FormPayload): FormPayload;
export declare function validateWechslerInput(args: {
  raw: RawScores;
  testDate: JalaliDate;
  birthDate: JalaliDate;
}): WechslerValidation;
export declare function bandForAge(years: number): string;
export declare function ageFromJalali(
  ty: number, tm: number, td: number, by: number, bm: number, bd: number
): [number, number, number];

export declare const WISC4_EVENT_KEY: "ce-wechsler-w4-v1";
export declare const RAW_FIELD_MAP: Record<string, SubtestCode>;
export declare const SUBTESTS: Array<{ code: SubtestCode; col: string; fa: string }>;
export declare const SUBTEST_CODES: SubtestCode[];
export declare const SUBTEST_FA: Record<string, string>;
export declare const SUBTEST_FA_OK: Record<string, string>;
export declare const NORMS: Record<string, any>;
export declare const NORM_MIN_AGE: 6;
export declare const NORM_MAX_BAND: 14;
export declare const INDEX_MEMBERS: Record<"VCI" | "PRI" | "WMI" | "PSI" | "FSIQ", string[]>;
export declare const GAI_MEMBERS: string[];
export declare const MIN_AGE: 6;
export declare const MAX_AGE: 16;

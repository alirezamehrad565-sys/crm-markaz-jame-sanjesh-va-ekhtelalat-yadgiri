// engine.d.ts — hand-written types for the extracted Wechsler engine module.
//
// The runtime implementation (engine.js) is verbatim extracted bundle code
// (worker/bundle.js lines 21120-24656 at commit 365d103, engineVersion m98).
// Deep result structures (analysis / snapshot internals) are typed pragmatically:
// top-level input & output shapes are exact, deeply nested payload data is typed
// loosely rather than duplicating ~3000 lines of engine internals.

export type SubtestCode =
  | "BD" | "SI" | "DS" | "PCn" | "CD" | "VC" | "LN" | "MR" | "CO" | "SS"
  | "PCm" | "CA" | "IN" | "AR" | "WR";

/** Raw (test-page) scores per subtest code. */
export type RawScores = Partial<Record<SubtestCode, number>>;

/** Jalali date triple [year, month, day]. */
export type JalaliDate = [number, number, number];

/** Input of runWechslerAnalysis / analyzeWechsler.
 *
 * T8 (m149) — baseAnswers/skippedHypotheses در قرارداد ورودی می‌مانند (پالایش وزن MOOD با BQ4
 * و سازگاری فراخوانی‌های قدیمی)؛ اما صف پرسش/پاسخ و امتیازدهی ملاک‌ها دیگر تولید نمی‌شود.
 */
export interface WechslerAnalysisInput {
  rawScores: RawScores;
  /** Test date as Jalali [y, m, d]. */
  testDate: JalaliDate;
  /** Birth date as Jalali [y, m, d]. */
  birthDate: JalaliDate;
  /** Default true. When false, GAI is computed from the norms table even if VCI/PRI differ by more than 23. */
  strict?: boolean;
  /** Pre-filled questionnaire answers, keyed "<HYP_ID>:<CRIT_ID>" (also "BQ4" for the base question). */
  baseAnswers?: Record<string, string>;
  /** Hypothesis ids the assessor chose to skip. */
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

/** فرضیهٔ فعال‌شده از نیم‌رخ (پیش از پرسش‌نامه) — تنها خروجی بالینی موتور (T8/m149) */
export interface WechslerHypothesisActivation {
  id: string;
  weight: number;
  clues: string[];
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
  /** null when GAI is not computable/valid in strict mode. */
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

/** Full engine result (psychometrics + hypothesis evidence — T8/m149: بدون لایهٔ تفسیر موازی). */
export interface WechslerAnalysisResult {
  ok: boolean;
  ageLine: string;
  validation: WechslerValidation;
  /** Detailed WISC-IV analysis; rich nested structure (see bundle engine region). */
  analysis: Record<string, unknown> | null;
  snapshot: WechslerSnapshot | null;
  flags: Array<{ id: string; fa: string; validity: boolean }>;
  /** شواهد فرضیه‌ای موتور — موتور واحد همین‌ها را مصرف می‌کند ({id, weight, clues}) */
  hypotheses: WechslerHypothesisActivation[];
  weakDomains: Array<{ domain: string; label: string; indices: string[] }>;
  monitoringInterval: string;
  /** T1 (m146) — افزودنی: سیگنال‌های بالینی ساخته‌شده از snapshot/analysis موجود (ok:false → []) */
  signals: WechslerSignal[];
  /** T1 (m146) — افزودنی: پروفایل ساخت‌یافتهٔ خلاصه (ok:false → null) */
  profile: WechslerProfile | null;
}

// --- T1 (m146) — clinical signal layer (additive) ----------------------------

/** بازهٔ هوش‌بهر کل — هم‌ارز WechslerFsiqBand در src/domain/clinical-engine/signals.ts */
export type WechslerFsiqBand =
  | "ID"
  | "BIF"
  | "LOW_BORDER"
  | "AVERAGE"
  | "HIGH_AVERAGE"
  | "SUPERIOR"
  | "GIFTED";

/** یک ردیف جدول بازه‌های FSIQ (هم‌ارز FSIQ_BAND_RANGES در signals.ts) */
export interface WechslerFsiqBandRange {
  band: WechslerFsiqBand;
  min: number;
  max: number;
  fa: string;
}

/** سیگنال بالینی وکسلر — ساختار هم‌ارز ClinicalSignal در signals.ts */
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
  /** شدت/اطمینان ۰..۱ */
  value: number;
  source: "anamnesis" | "wechsler" | "checklist" | "probe" | "ot" | "observation";
  /** دلیل فارسی قابل‌نمایش برای درمانگر */
  fa: string;
}

/** نمرهٔ تراز + صدک یک شاخص (وقتی محاسبه‌پذیر) */
export interface WechslerIndexPair {
  scaled: number;
  percentile: number | null;
}

/** الگوی فعال ACID/CAD — فقط وقتی همهٔ زیرآزمون‌های الگو ≤۷ باشند مقدار دارد */
export interface WechslerProfilePattern {
  codes: string[];
  scaled: Record<string, number>;
}

/** پروفایل ساخت‌یافتهٔ خلاصه — همهٔ فیلدها از داده‌های موجود snapshot/analysis */
export interface WechslerProfile {
  vci: WechslerIndexPair | null;
  pri: WechslerIndexPair | null;
  wmi: WechslerIndexPair | null;
  psi: WechslerIndexPair | null;
  fsiq: number | null;
  gai: number | null;
  /** "معتبر"/"نامعتبر" از analysis.gai — null وقتی تحلیل موجود نیست */
  gaiValidity: string | null;
  indexScatter: number;
  fsiqBand: WechslerFsiqBand | null;
  acid: WechslerProfilePattern | null;
  cad: WechslerProfilePattern | null;
  step5: { strengths: string[]; weaknesses: string[] };
  substitutes: string[];
  flags: Array<{ id: string; fa: string; validity: boolean }>;
}

// --- form payload glue -------------------------------------------------------

/** One form field value as stored in case_events.payload. */
export interface FormFieldEntry {
  value?: string | number | null;
  label?: string;
}

export type FormPayload = Record<string, FormFieldEntry | undefined | null>;

/** Index scores computed for the form fields (NOT gated by computable flags — mirrors bundle behavior). */
export interface WechslerComputedScores {
  fsiq: number | null;
  vci: number | null;
  pri: number | null;
  wmi: number | null;
  psi: number | null;
  gai: number | null;
  ageLine: string;
}

/** Return of applyWechslerEngineToPayload (the hook I/O contract minus DB/error glue). */
export interface WechslerHookResult {
  payload: FormPayload;
  ran: boolean;
  result: WechslerAnalysisResult | null;
  computed: WechslerComputedScores;
}

// --- exported engine functions ----------------------------------------------

export declare function runWechslerAnalysis(input: WechslerAnalysisInput): WechslerAnalysisResult;
export declare function analyzeWisc(
  rawScores: RawScores,
  testDate: JalaliDate,
  birthDate: JalaliDate,
  strict?: boolean
): Record<string, unknown>;

// --- T1 (m146) — clinical signal layer (additive) ----------------------------

/** ورودی profileSignals/buildWechslerProfile — فقط همین بخش‌های نتیجه خوانده می‌شوند */
export type WechslerResultSlice = Pick<
  WechslerAnalysisResult,
  "ok" | "snapshot" | "analysis" | "flags"
>;

/**
 * سیگنال‌های بالینی پروفایل وکسلر — تابع خالص؛ فقط از snapshot/analysis موجود
 * می‌خواند (بدون محاسبهٔ تازهٔ روان‌سنجی). ورودی نامعتبر/خالی → [].
 */
export declare function profileSignals(result: WechslerResultSlice | null | undefined): WechslerSignal[];

/** پروفایل ساخت‌یافتهٔ خلاصه — تابع خالص؛ ورودی نامعتبر/خالی → null */
export declare function buildWechslerProfile(result: WechslerResultSlice | null | undefined): WechslerProfile | null;

/** بازهٔ FSIQ ورودی — ورودی غیرمتناهی/منفی محافظه‌کارانه به ID می‌رود */
export declare function fsiqBandOf(fsiq: number): WechslerFsiqBand;

/** جدول بازه‌های FSIQ موتور — باید با FSIQ_BAND_RANGES در signals.ts هم‌ارز بماند */
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

// --- data tables -------------------------------------------------------------

export declare const WISC4_EVENT_KEY: "ce-wechsler-w4-v1";
export declare const RAW_FIELD_MAP: Record<string, SubtestCode>;
export declare const SUBTESTS: Array<{ code: SubtestCode; col: string; fa: string }>;
export declare const SUBTEST_CODES: SubtestCode[];
export declare const SUBTEST_FA: Record<string, string>;
export declare const SUBTEST_FA_OK: Record<string, string>;
/** Norm tables (raw→scaled pairs per age band sq-6..sq-14, index/cluster/step5 conversion rows). */
export declare const NORMS: Record<string, any>;
export declare const NORM_MIN_AGE: 6;
export declare const NORM_MAX_BAND: 14;
export declare const INDEX_MEMBERS: Record<"VCI" | "PRI" | "WMI" | "PSI" | "FSIQ", string[]>;
export declare const GAI_MEMBERS: string[];
export declare const MIN_AGE: 6;
export declare const MAX_AGE: 16;

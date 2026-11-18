import {
  runWechslerAnalysis,
  applyWechslerEngineToPayload,
  profileSignals,
  buildWechslerProfile,
  fsiqBandOf,
  FSIQ_BANDS,
  WISC4_EVENT_KEY,
  SUBTESTS,
  SUBTEST_CODES,
  RAW_FIELD_MAP,
  NORMS,
  MIN_AGE,
  MAX_AGE,
  type FormPayload,
  type WechslerAnalysisInput,
  type WechslerAnalysisResult,
  type WechslerHookResult,
  type SubtestCode
} from "./engine.js";

export {
  runWechslerAnalysis,
  analyzeWisc,
  applyWechslerEngineToPayload,
  profileSignals,
  buildWechslerProfile,
  fsiqBandOf,
  FSIQ_BANDS,
  extractRawScores,
  compactWechslerOutput,
  parseJalaliLoose,
  parseBirthDateLoose,
  gregorianIsoToJalali,
  normalizeDigits,
  summarySafePayload,
  validateWechslerInput,
  bandForAge,
  ageFromJalali,
  WISC4_EVENT_KEY,
  RAW_FIELD_MAP,
  SUBTESTS,
  SUBTEST_CODES,
  SUBTEST_FA,
  SUBTEST_FA_OK,
  NORMS,
  NORM_MIN_AGE,
  NORM_MAX_BAND,
  INDEX_MEMBERS,
  GAI_MEMBERS,
  MIN_AGE,
  MAX_AGE,
  type SubtestCode,
  type RawScores,
  type JalaliDate,
  type WechslerAnalysisInput,
  type WechslerValidation,
  type WechslerValidationError,
  type WechslerAnalysisResult,
  type WechslerSnapshot,
  type WechslerPsychometrics,
  type FormPayload,
  type FormFieldEntry,
  type WechslerComputedScores,
  type WechslerHookResult,
  type WechslerSignal,
  type WechslerProfile,
  type WechslerProfilePattern,
  type WechslerIndexPair,
  type WechslerFsiqBand,
  type WechslerFsiqBandRange,
  type WechslerResultSlice
} from "./engine.js";

export function analyzeWechsler(input: WechslerAnalysisInput): WechslerAnalysisResult {
  return runWechslerAnalysis(input);
}

export function analyzeWechslerForm(
  payload: FormPayload,
  birthDateRaw: string | null | undefined,
  occurredAtIso: string
): WechslerHookResult {
  return applyWechslerEngineToPayload(payload, birthDateRaw, occurredAtIso);
}

export function wechslerHookErrorMessage(result: WechslerAnalysisResult | null): string | null {
  if (result?.ok) return null;
  const msgs = result?.validation?.errors ?? [];
  const first = msgs.length ? msgs[0].message : "";
  const prefix = "تحلیل وکسلر ۴: ";
  if (msgs.length > 1) return `${prefix}${first} (+${msgs.length - 1} خطای دیگر)`;
  return `${prefix}${first || "ورودی نامعتبر است"}`;
}

export const WECHSLER_EVENT_KEY: typeof WISC4_EVENT_KEY = WISC4_EVENT_KEY;

export const wechslerSubtestCodes: readonly SubtestCode[] = SUBTEST_CODES;

export const wechslerAgeRange: { min: number; max: number } = { min: MIN_AGE, max: MAX_AGE };

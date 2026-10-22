// index.ts — clean public API for the extracted WISC-IV Wechsler engine.
//
// Phase 0 / task 39-d1. The engine was extracted verbatim from
// worker/bundle.js lines 21120-24656 (commit 365d103, engineVersion "m98")
// into engine.js (+ engine.d.ts). This file exposes the intended API surface:
//
//   analyzeWechsler(input)            → full engine result (typed)
//   analyzeWechslerForm(payload, …)   → form-payload hook I/O (no DB, no errors thrown)
//
// Deliberately NOT part of this module (bundle-only route/DB glue):
//   - applyWechslerHook (bundle.js 24666-24680): reads students.birth_date via D1
//     and throws ValidationError when the engine reports !ok. Reproduce its error
//     text with wechslerHookErrorMessage() below if ever needed.
//   - studentBirthDate (bundle.js 24657-24665).
//
// This module is NOT wired into the build in phase 0 — equivalence proof only
// (see tests/golden/wechsler-golden.test.mjs).

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
  // entry points
  runWechslerAnalysis,
  analyzeWisc,
  applyWechslerEngineToPayload,
  // T1 (m146) — لایهٔ سیگنال بالینی (افزودنی)
  profileSignals,
  buildWechslerProfile,
  fsiqBandOf,
  FSIQ_BANDS,
  // pure glue
  extractRawScores,
  compactWechslerOutput,
  parseJalaliLoose,
  parseBirthDateLoose,
  gregorianIsoToJalali,
  normalizeDigits,
  summarySafePayload,
  // validation / helpers
  validateWechslerInput,
  bandForAge,
  ageFromJalali,
  // data tables
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
  // types
  type SubtestCode,
  type RawScores,
  type JalaliDate,
  type WechslerAnalysisInput,
  type WechslerValidation,
  type WechslerValidationError,
  type WechslerAnalysisResult,
  type WechslerSnapshot,
  type WechslerHypothesisActivation,
  type FormPayload,
  type FormFieldEntry,
  type WechslerComputedScores,
  type WechslerHookResult,
  // T1 (m146) — types لایهٔ سیگنال (افزودنی)
  type WechslerSignal,
  type WechslerProfile,
  type WechslerProfilePattern,
  type WechslerIndexPair,
  type WechslerFsiqBand,
  type WechslerFsiqBandRange,
  type WechslerResultSlice
} from "./engine.js";

/**
 * Analyze a WISC-IV profile.
 *
 * Input:
 *   rawScores — raw subtest scores keyed by subtest code
 *               (SI VC CO IN WR BD PCn MR PCm DS LN AR CD SS CA),
 *               integers within the age-band norm range.
 *   testDate / birthDate — Jalali [year, month, day] triples.
 *   strict (default true) — when true, a VCI/PRI gap > 23 marks GAI invalid.
 *   baseAnswers — legacy input contract (T8/m149): accepted for weight refinement
 *                 (base question "BQ4" refines the MOOD weight); no queue is produced.
 *   skippedHypotheses — legacy input contract (T8/m149): accepted, no longer scored.
 *
 * Output: WechslerAnalysisResult — validation (errors/warnings/computable/missing),
 * index scores + FSIQ + GAI (snapshot), flags, hypothesis EVIDENCE (13 possible ids:
 * SLD ADHD ID BIF DLD NVLD TBI ASD TWO_E MOOD APD NORMAL DOMAIN_WEAK — {id, weight, clues}),
 * weak domains, monitoring interval, signals and the structured profile.
 * T8 (m149) — the parallel interpretation layer (outcomes/main/comorbid pick,
 * binary scenarios, treatment plans, questionnaire queue/answers) is REMOVED:
 * interpretation display belongs to the unified reasoning engine.
 */
export function analyzeWechsler(input: WechslerAnalysisInput): WechslerAnalysisResult {
  return runWechslerAnalysis(input);
}

/**
 * Form-payload level engine run (pure; mirrors applyWechslerEngineToPayload).
 *
 * Input:
 *   payload       — case_events payload map ({value, label} entries); raw scores are
 *                   read from raw_si..raw_ca (+ legacy raw_sim/raw_voc/raw_com/raw_pc),
 *                   test date from the "test_date" field (Jalali, loose format).
 *   birthDateRaw  — student birth date as stored in students.birth_date
 *                   (Jalali loose or Gregorian ISO); may be null/empty.
 *   occurredAtIso — event occurred_at ISO timestamp; used as test date when
 *                   the payload has no parsable test_date.
 *
 * Output: { payload, ran, result, computed }. When raw scores exist but no valid
 * birth date is available, `ran` is true and result.ok is false with a shape error
 * (the production hook converts this into a thrown ValidationError — see below).
 * When no raw score field is present at all, `ran` is false and the payload passes
 * through untouched.
 */
export function analyzeWechslerForm(
  payload: FormPayload,
  birthDateRaw: string | null | undefined,
  occurredAtIso: string
): WechslerHookResult {
  return applyWechslerEngineToPayload(payload, birthDateRaw, occurredAtIso);
}

/**
 * Reproduces the error message the production hook (applyWechslerHook,
 * bundle.js lines 24666-24680) would throw for a failed engine run, without
 * importing bundle/DB code. Returns null when the hook would pass (result.ok).
 */
export function wechslerHookErrorMessage(result: WechslerAnalysisResult | null): string | null {
  if (result?.ok) return null;
  const msgs = result?.validation?.errors ?? [];
  const first = msgs.length ? msgs[0].message : "";
  const prefix = "موتور وکسلر ۴: ";
  if (msgs.length > 1) return `${prefix}${first} (+${msgs.length - 1} خطای دیگر)`;
  return `${prefix}${first || "ورودی نامعتبر است"}`;
}

/** Event type key the engine is bound to in production (case_events.type_key). */
export const WECHSLER_EVENT_KEY: typeof WISC4_EVENT_KEY = WISC4_EVENT_KEY;

/** Subtest code list (SI VC CO IN WR BD PCn MR PCm DS LN AR CD SS CA). */
export const wechslerSubtestCodes: readonly SubtestCode[] = SUBTEST_CODES;

/** Supported age range in whole years (norm tables are clamped to band sq-14 above that). */
export const wechslerAgeRange: { min: number; max: number } = { min: MIN_AGE, max: MAX_AGE };

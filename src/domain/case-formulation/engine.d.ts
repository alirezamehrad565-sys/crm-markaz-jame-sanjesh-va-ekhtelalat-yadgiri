// Type declarations for engine.js (plain-JS extraction of the case-formulation
// engine from worker/bundle.js lines 29109-30981 @ commit 365d103).
// The runtime module is NOT compiled by tsc (tsconfig only includes src/**/*.ts);
// this .d.ts gives the TS wrapper (index.ts) a typed surface.

export interface FormulationEvidenceLike {
  /** completed case_events rows, most recent first (latestPerTool2 keeps the first seen per toolKey) */
  events: readonly unknown[];
  /** wechsler engine output (see wechslerFromEvent) or null */
  wechsler: unknown;
  /** OT profile (otEngine.getOtProfile) or null */
  ot: unknown;
  /** standard-pathway gates (otEngine.getGates) or null */
  gates: unknown;
  child: {
    id: string;
    ageYears?: number;
    grade?: string | null;
  };
}

export interface FormulationOptionsLike {
  now?: () => Date;
}

export declare function formulateCase(
  evidence: FormulationEvidenceLike,
  options?: FormulationOptionsLike
): Record<string, unknown>;

export declare function buildCaseFormulation(
  evidence: FormulationEvidenceLike,
  options?: FormulationOptionsLike
): Record<string, unknown>;

/** Build the wechsler engine-output object from a ce-wechsler-w4-v1 event payload (bundle.js:30884). */
export declare function wechslerFromEvent(payload: unknown): unknown;

/** Age in years from a Gregorian or Jalali birth date string (bundle.js:30957). */
export declare function ageYearsFromBirthDate(birthDate: string | null | undefined): number | undefined;

/** Internal lookup tables exposed for tests/diagnostics. */
export declare const __tables: Record<string, unknown>;

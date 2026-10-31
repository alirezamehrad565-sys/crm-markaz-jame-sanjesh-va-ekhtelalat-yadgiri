export interface FormulationEvidenceLike {
  events: readonly unknown[];
  wechsler: unknown;
  ot: unknown;
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

export declare function wechslerFromEvent(payload: unknown): unknown;

export declare function ageYearsFromBirthDate(birthDate: string | null | undefined): number | undefined;

export declare const __tables: Record<string, unknown>;

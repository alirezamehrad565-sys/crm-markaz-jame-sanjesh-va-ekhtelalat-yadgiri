export interface ContentPart {
  exercises: number;
  packages: number;
  templates: number;
  forms: number;
  exerciseUses: number;
  exerciseRefs: number;
  templateUses: number;
  templateRefs: number;
  formFills: number;
  formRefs: number;
}

export interface ContentScore {
  production: number;
  usage: number;
  reference: number;
  total: number;
}

export interface Level {
  min: number;
  key: string;
  label: string;
  badge: string;
}

export interface BoardRow {
  staffId: string;
  fullName: string;
  role: string;
  active: boolean;
  content: ContentPart;
  contentScore: ContentScore;
  usagePoints: number;
  usageCapped: boolean;
  usageDetail: Record<string, number>;
  usageLabels: Record<string, string>;
  total: number;
  rank: number;
}

export interface FormulaItem {
  key: string;
  weight: number;
  label: string;
}

export type UsageFormulaItem = [action: string, weight: number, label: string, group: string];

export const CONTENT_FORMULA: {
  production: FormulaItem[];
  usage: FormulaItem[];
  reference: FormulaItem[];
};

export const USAGE_FORMULA: UsageFormulaItem[];

export function clampWeight(v: unknown, fallback: number): number;

export const PERIODS: Record<string, { key: string; label: string; days?: number; sinceIso: null }>;

export function usageWeightMap(formula?: UsageFormulaItem[]): Map<string, number>;

export function applyUsageWeights(
  aggRows: Array<{ actorId: string; action: string; count: number }>,
  formula?: UsageFormulaItem[]
): { points: Record<string, number>; counts: Record<string, Record<string, number>> };

export function contentScoreOf(content: Partial<ContentPart>, formula?: typeof CONTENT_FORMULA): ContentScore;

export function productionScoreOf(
  counts: { exercises?: number; packages?: number; templates?: number; forms?: number },
  formula?: { production?: FormulaItem[] }
): number;

export function rankRows(rows: Array<Record<string, unknown> & { total: number; fullName: string }>): Array<Record<string, unknown> & { rank: number }>;

export function periodSinceUtc(periodKey: string, periods?: typeof PERIODS, now?: Date): string | null;

export const SCORING_EPOCH: string;

export const ADMIN_CAP_ROLES: string[];

export const ADMIN_USAGE_CAP: number;

export const SCORING_CONFIG_KEY: string;

export function effectiveContentFormula(weights?: Record<string, unknown> | null): typeof CONTENT_FORMULA;

export function effectiveUsageFormula(weights?: Record<string, unknown> | null): UsageFormulaItem[];

export function effectiveAdminCap(weights?: Record<string, unknown> | null): number;

export function readScoringConfig(d1: {
  prepare(sql: string): { bind(...params: unknown[]): { first(): Promise<{ value?: unknown } | null> } };
}): Promise<{ epoch?: string; weights?: Record<string, unknown> }>;

export function effectiveSince(
  periodKey: string,
  periods?: typeof PERIODS,
  now?: Date,
  epoch?: string
): string;

export async function computeBoard(
  d1: { prepare(sql: string): { bind(...params: unknown[]): { all(): Promise<{ results: Array<Record<string, unknown>> }> } } },
  sinceUtc: string | null,
  cfg?: {
    contentFormula?: typeof CONTENT_FORMULA;
    usageFormula?: UsageFormulaItem[];
    adminCap?: number;
  }
): Promise<BoardRow[]>;

export async function handleScoring(request: Request, env: { DB: unknown; AUTH_SECRET?: string; ENV?: string }): Promise<Response>;

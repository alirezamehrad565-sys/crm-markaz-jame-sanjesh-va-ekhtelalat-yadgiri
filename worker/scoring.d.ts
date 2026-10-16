/**
 * تایپ‌های لایهٔ امتیاز سراسری
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// تعریف تایپ برای ماژول امتیاز سراسری (مصرف در تست‌های TS)
// خود ماژول plain JS است؛ این فایل فقط سطح API را برای tsc توصیف می‌کند.

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
  /** — true اگر سهم فعالیت اداری این نقش سقف خورده باشد */
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

/** — سطح‌بندی تابلو حذف شد (باجت‌های تازه‌کار/… غیرمحترمانه — فقط امتیاز) */

export const PERIODS: Record<string, { key: string; label: string; days?: number; sinceIso: null }>;

export function usageWeightMap(formula?: UsageFormulaItem[]): Map<string, number>;

export function applyUsageWeights(
  aggRows: Array<{ actorId: string; action: string; count: number }>,
  formula?: UsageFormulaItem[]
): { points: Record<string, number>; counts: Record<string, Record<string, number>> };

export function contentScoreOf(content: Partial<ContentPart>, formula?: typeof CONTENT_FORMULA): ContentScore;

/** — نمرهٔ مشارکت عملی گزارش دوره: جمع وزن‌دار بخش تولید محتوا — formula اختیاری */
export function productionScoreOf(
  counts: { exercises?: number; packages?: number; templates?: number; forms?: number },
  formula?: { production?: FormulaItem[] }
): number;

export function rankRows(rows: Array<Record<string, unknown> & { total: number; fullName: string }>): Array<Record<string, unknown> & { rank: number }>;

export function periodSinceUtc(periodKey: string, periods?: typeof PERIODS, now?: Date): string | null;

/** — epoch شروع دورهٔ امتیاز (UTC «YYYY-MM-DD HH:MM:SS») — فعالیت قبل از آن صفر است */
export const SCORING_EPOCH: string;

/** — نقش‌های دفتری که سهم فعالیت اداری‌شان سقف دارد */
export const ADMIN_CAP_ROLES: string[];

/** — سقف امتیاز فعالیت اداری نقش‌های دفتری در هر دوره */
export const ADMIN_USAGE_CAP: number;

// ── پیکربندی قابل‌تنظیم امتیازدهی (تنظیمات ← «امتیازبندی همکاران») ──

/** کلید جدول settings که پیکربندی در آن ذخیره می‌شود */
export const SCORING_CONFIG_KEY: string;

/** فرمول محتوای مؤثر — وزن‌های ذخیره‌شدهٔ مدیر روی پیش‌فرض سوار می‌شود */
export function effectiveContentFormula(weights?: Record<string, unknown> | null): typeof CONTENT_FORMULA;

/** فرمول استفادهٔ مؤثر — وزن پایهٔ یکنواخت (baseAction) روی همهٔ اقدام‌ها */
export function effectiveUsageFormula(weights?: Record<string, unknown> | null): UsageFormulaItem[];

/** سقف فعالیت اداری مؤثر */
export function effectiveAdminCap(weights?: Record<string, unknown> | null): number;

/** خواندن پیکربندی از settings — هر خطا = پیش‌فرض */
export function readScoringConfig(d1: {
  prepare(sql: string): { bind(...params: unknown[]): { first(): Promise<{ value?: unknown } | null> } };
}): Promise<{ epoch?: string; weights?: Record<string, unknown> }>;

/** — cutoff مؤثر دوره = بزرگ‌ترِ cutoff دورهٔ انتخابی و SCORING_EPOCH */
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

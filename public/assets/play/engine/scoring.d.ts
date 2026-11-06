// scoring.d.ts — تعریف نوع نمرهٔ موقت موتور کلاینت (فاز ۳ بازطراحی)
export interface EngineTrial {
  item_id?: string;
  go: boolean | null;
  touched: boolean;
  rtMs?: number | null;
  rt_ms?: number | null;
  rtValid?: boolean;
  correct: boolean;
  prematureCount?: number;
  multipleCount?: number;
  block?: number;
}
export function medianOf(values: number[]): number | null;
export function rtVariabilityOf(rts: number[]): number | null;
export function summarizeSession(trials: EngineTrial[]): {
  total: number;
  total_go: number;
  total_nogo: number;
  correct_go: number;
  correct_nogo: number;
  commission: number;
  omission: number;
  premature: number;
  multiple: number;
  correct_go_pct: number | null;
  correct_nogo_pct: number | null;
  commission_pct: number | null;
  omission_pct: number | null;
  median_rt: number | null;
  rt_variability: number | null;
  blocks: Record<string, { total: number; correct: number }>;
  dprime: null;
};

// scoring.d.ts — تعریف نوع خلاصهٔ موتور کلاینت (بازنویسی G1 / ۱.۲۵.۳۵)
// کلاینت کلید پاسخ ندارد — این خلاصه فقط توصیف رفتار ثبت‌شده است؛ مرجع سنجه سرور است (§۸).
export interface EngineTrial {
  item_id?: string;
  touched?: boolean;
  rt_ms?: number | null;
  premature_count?: number;
  multiple_count?: number;
  out_of_surface_count?: number;
  frame_drops?: number;
}
export function medianOf(values: number[]): number | null;
export function summarizeSession(trials: EngineTrial[]): {
  total: number;
  touched: number;
  no_response: number;
  median_rt: number | null;
  premature_total: number;
  multiple_total: number;
  out_of_surface_total: number;
  frame_drops_total: number;
};

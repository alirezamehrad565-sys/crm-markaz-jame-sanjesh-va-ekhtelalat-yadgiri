// gonogo.d.ts — تعریف نوع ماژول نوع‌بازی گو/نوگو + لایهٔ اقتباس jsPsych (۱.۲۵.۳۴)
export function stimSvg(stim: { shape?: unknown; color?: unknown } | null | undefined): string;
export function previewSteps(hint: { go?: { stim?: Record<string, unknown>; label?: string } | null; nogo?: { stim?: Record<string, unknown>; label?: string } | null } | null): Array<{ svg: string; line: string }>;

export const GO_NOGO_TEXT: Record<string, string | ((...args: unknown[]) => string)>;
export const PRACTICE_LIMITS: { go_ms: number; nogo_ms: number; min_ms: number; max_ms: number };

export function practiceLimitOf(type: 'go' | 'nogo' | string, rawMs: number | null | undefined): number;
export function practiceOutcome(type: 'go' | 'nogo' | string, touched: boolean): 'success' | 'retry';

export function practiceInteractive(ctx: {
  stage: HTMLElement;
  sleeper: { sleep(ms: number): Promise<void>; cancel(): void; pause(): void; resume(): void };
  hint: { go?: { stim?: Record<string, unknown>; label?: string; window_ms?: number } | null; nogo?: { stim?: Record<string, unknown>; label?: string; window_ms?: number } | null } | null;
}): Promise<{ applied: boolean; go_retries: number; nogo_retries: number }>;

export function debriefMarkup(
  summary: {
    scored_total?: number; scored_correct?: number; median_rt?: number | null;
  } | null | undefined,
  extra?: { go_retries?: number; nogo_retries?: number } | null
): string;

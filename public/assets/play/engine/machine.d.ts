// machine.d.ts — تعریف نوع موتور ماشین حالت کلاینت (فاز ۳ بازطراحی)
export const STATES: Record<string, string>;
export function isTerminalState(s: string): boolean;
export function createMachine(
  onChange?: (state: string, from: string, meta: unknown) => void
): {
  readonly state: string;
  can(to: string): boolean;
  to(to: string, meta?: unknown): string;
  resumeTo(state: string, meta?: unknown): string;
  history(): Array<{ from: string; to: string; at: number; meta: unknown }>;
  lastAt(): number;
};
export function classifyTouch(
  state: string,
  opts?: { alreadyAnswered?: boolean; insideStage?: boolean }
): 'primary' | 'premature' | 'multiple' | 'out_of_surface';
export function windowMsFor(item: { stim?: Record<string, unknown> } | null, protocol: { params?: Record<string, number> } | null): number;
export function stimulusHideMsFor(item: { stim?: Record<string, unknown> } | null, protocol: { params?: Record<string, number> } | null): number | null;

// timing.d.ts — تعریف نوع لایهٔ زمان‌سنج کلاینت (فاز ۳/۴ بازطراحی)
export function nextFrame(): Promise<number>;
export function afterPaint(): Promise<number>;
export const FRAME_DROP_THRESHOLD_MS: number;
export function countFrameDeltas(deltas: number[]): { drops: number; maxDelta: number };
export function createFrameMonitor(): {
  start(): void;
  presentedAt(): number | null;
  stop(): { presentedAt: number | null; deltas: number; drops: number; maxDelta: number };
};
export function createPausableClock(): {
  start(): void;
  pause(): void;
  resume(): void;
  touch(): number;
  readonly running: boolean;
  readonly acc: number;
};
export function createSleeper(onPauseChange?: (paused: boolean) => void): {
  sleep(ms: number): Promise<void>;
  cancel(): void;
  pause(): void;
  resume(): void;
  readonly paused: boolean;
};

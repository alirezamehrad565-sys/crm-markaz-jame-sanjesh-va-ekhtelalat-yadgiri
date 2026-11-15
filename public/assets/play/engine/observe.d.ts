// observe.d.ts — تعریف نوع لایهٔ مشترک شواهد لمس/نمایش (G1 / ۱.۲۵.۳۵)
import type { classifyTouch } from './machine';

export interface TouchLedger {
  start(): void;
  stop(): void;
  record(
    state: string,
    flags?: { insideStage?: boolean; alreadyAnswered?: boolean }
  ): ReturnType<typeof classifyTouch> | null;
  evidenceCounts(): { premature_count: number; multiple_count: number; out_of_surface_count: number };
  touchCount(): number;
  events(): Array<{ name: string; at: number }>;
  readonly started: boolean;
}

export function createTouchLedger(): TouchLedger;

export function attachTouchEvidence(
  stage: Element,
  ledger: TouchLedger,
  getState: () => string | null,
  getAnswered: () => boolean
): () => void;

export function observeDisplayFrames(): () => {
  presentedAt: number | null;
  deltas: number;
  drops: number;
  maxDelta: number;
};

// توابع خالص «امتیاز شناسنامهٔ آیتم» — 1.25.48 m6
// فرمول v1 — ثابت دو طرفه (CP همین را بازخوانی می‌کند؛ تغییر فرمول = جلو رفتن formulaVersion)

import type { ItemScore } from './types';

export const SCORE_FORMULA_VERSION = 1;
export const SCORE_SOURCES = ['exercises', 'pathway_templates'] as const;
export type ScoreSourceTable = (typeof SCORE_SOURCES)[number];

/** امتیاز ارجاع = min(50, refs × ۵) */
export function refScoreOf(refs: number): number {
  return Math.min(50, Math.max(0, Math.floor(refs) || 0) * 5);
}

/** امتیاز استفاده = min(50, uses × ۲) */
export function useScoreOf(uses: number): number {
  return Math.min(50, Math.max(0, Math.floor(uses) || 0) * 2);
}

/** امتیاز کل v1 = امتیاز ارجاع + امتیاز استفاده (۰ تا ۱۰۰) */
export function computeItemScore(refs: number, uses: number, generatedAtIso: string): ItemScore {
  const r = Math.max(0, Math.floor(refs) || 0);
  const u = Math.max(0, Math.floor(uses) || 0);
  const refScore = refScoreOf(r);
  const useScore = useScoreOf(u);
  return {
    score: Math.min(100, refScore + useScore),
    refs: r,
    uses: u,
    refScore,
    useScore,
    formulaVersion: SCORE_FORMULA_VERSION,
    generatedAt: generatedAtIso,
    source: 'client'
  };
}

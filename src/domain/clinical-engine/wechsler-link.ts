import type { EvidenceEvent } from './types';

export const WECHSLER_W4_EVENT_KEY = 'ce-wechsler-w4-v1' as const;

export interface WechslerEngineOutput {
  ok?: unknown;
  profile?: {
    fsiq?: number | null;
    fsiqBand?: string | null;
    indexScatter?: number | null;
    vci?: { scaled?: number | null } | null;
    pri?: { scaled?: number | null } | null;
    wmi?: { scaled?: number | null } | null;
    psi?: { scaled?: number | null } | null;
    step5?: { strengths?: string[]; weaknesses?: string[] } | null;
  } | null;
}

export function wechslerEngineOutputOf(event: EvidenceEvent | undefined | null): WechslerEngineOutput | null {
  if (!event) return null;
  const raw = event.payload?.['engine_output']?.value?.trim();
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as WechslerEngineOutput;
    return c && c.ok ? c : null;
  } catch {
    return null;
  }
}

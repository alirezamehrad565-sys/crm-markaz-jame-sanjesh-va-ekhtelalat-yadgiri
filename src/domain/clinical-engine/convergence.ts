import type { EvidenceEvent } from './types';
import { batteryDef } from './instruments';

export const CONVERGENCE_SOURCES = ['family', 'teacher', 'test', 'probe', 'clinician'] as const;
export type ConvergenceSource = (typeof CONVERGENCE_SOURCES)[number];

export const CONVERGENCE_SOURCE_FA: Record<ConvergenceSource, string> = {
  family: 'خانواده',
  teacher: 'مدرسه',
  test: 'آزمون شناختی',
  probe: 'پروب عملکردی',
  clinician: 'چک‌لیست ملاکی'
};

export type ConvergenceState = 'هم‌گرا' | 'تنها' | 'واگرا';

export interface ConvergenceItem {
  targetKey: string;
  state: ConvergenceState;
  implicationFa: string;
}

export const ID_ADAPT_EVENT_KEY = 'ce-id-adapt-v1';

export const COMPOSITE_FAMILY_EVENT_KEY = 'ce-comp-family-v2';

const SOURCE_BY_TOOL: Record<string, ConvergenceSource> = {
  'ce-anamnesis-v3': 'family',
  'ce-anamnesis-v2': 'family',
  'sdq-parent': 'family',
  'ce-sdq-p-v1': 'family',
  'ce-snap-iv-p-v1': 'family',
  'ce-scared-p-v1': 'family',
  [ID_ADAPT_EVENT_KEY]: 'family',
  [COMPOSITE_FAMILY_EVENT_KEY]: 'family',
  'ce-sdq-t-v1': 'teacher',
  'ce-snap-iv-t-v1': 'teacher',
  'ce-comp-teacher-v2': 'teacher',
  'ce-wechsler-w4-v1': 'test',
  'ce-probe-read-v1': 'probe',
  'ce-probe-write-v1': 'probe',
  'ce-probe-calc-v1': 'probe',
  'ce-sld-read-v1': 'clinician',
  'ce-sld-wri-v1': 'clinician',
  'ce-sld-calc-v1': 'clinician',
  'ce-odd-criteria-v1': 'clinician',
  'ce-asd-criteria-v1': 'clinician',
  'ce-speech-criteria-v1': 'clinician'
};

export function convergenceSourceOfTool(toolKey: string): ConvergenceSource | null {
  const direct = SOURCE_BY_TOOL[toolKey];
  if (direct) return direct;
  const def = batteryDef(toolKey);
  if (def?.audience === 'teacher') return 'teacher';
  return null;
}

export function convergenceItemOf(
  targetKey: string,
  targetTitle: string,
  positive: readonly ConvergenceSource[],
  withData: readonly ConvergenceSource[]
): ConvergenceItem | null {
  const pos: ConvergenceSource[] = [];
  for (const s of positive) if (!pos.includes(s)) pos.push(s);
  if (!pos.length) return null;
  const fa = (s: ConvergenceSource) => CONVERGENCE_SOURCE_FA[s];
  if (pos.length >= 2) {
    const names = pos.map(fa).join('، ');
    return {
      targetKey,
      state: 'هم‌گرا',
      implicationFa: `برای «${targetTitle}» چند منبع مستقل (${names}) هم‌جهت نشانه گزارش کرده‌اند؛ این فرضیه پشتوانهٔ چندجانبه دارد و در جمع‌بندی با اطمینان بالاتری طرح می‌شود.`
    };
  }
  const contradicting = withData.filter((s) => !pos.includes(s));
  if (contradicting.length) {
    const seen: string[] = [];
    for (const s of contradicting) if (!seen.includes(fa(s))) seen.push(fa(s));
    return {
      targetKey,
      state: 'واگرا',
      implicationFa: `دربارهٔ «${targetTitle}» منابع هم‌رأی نیستند — ${fa(pos[0])} نشانه می‌دهد ولی ${seen.join(' و ')} با وجود پاسخ‌دادن، نشانهٔ قابل توجهی گزارش نکرده است؛ جمع‌بندی به جلسهٔ بالینی موکول می‌شود.`
    };
  }
  return {
    targetKey,
    state: 'تنها',
    implicationFa: `نشانه‌های «${targetTitle}» فعلاً فقط از سوی ${fa(pos[0])} گزارش شده است — پیش از هر جمع‌بندی، دیدگاه منبع دیگر (خانه، مدرسه یا آزمون تکمیلی) لازم است.`
  };
}

export type AdaptLevel = 'low' | 'border' | 'normal' | 'unknown';

export function idAdaptLevelOfEvent(event: EvidenceEvent | undefined | null): AdaptLevel {
  const ss = event?.analysis?.subscaleScores?.find((s) => s.id === 'id_adapt') ?? null;
  if (!ss) return 'unknown';
  const color = ss.color ?? event?.subscales?.find((d) => d.id === 'id_adapt')?.bands?.find((b) => b.label === ss.band)?.color ?? null;
  if (color === 'danger' || (ss.band ?? '').includes('پایین')) return 'low';
  if (color === 'warn' || (ss.band ?? '').includes('مرزی')) return 'border';
  if (color === 'ok' || (ss.band ?? '').includes('نرمال')) return 'normal';
  return 'unknown';
}

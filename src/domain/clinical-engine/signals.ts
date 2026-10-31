export type SignalDomain =
  | 'attention'
  | 'language'
  | 'memory'
  | 'executive'
  | 'social'
  | 'emotional'
  | 'academic'
  | 'motor'
  | 'cognitive_level'
  | 'validity';

export type SignalSource = 'anamnesis' | 'wechsler' | 'checklist' | 'probe' | 'ot' | 'observation';

export interface ClinicalSignal {
  domain: SignalDomain;
  key: string;
  value: number;
  source: SignalSource;
  fa: string;
}

export type WechslerFsiqBand =
  | 'ID'
  | 'BIF'
  | 'LOW_BORDER'
  | 'AVERAGE'
  | 'HIGH_AVERAGE'
  | 'SUPERIOR'
  | 'GIFTED';

export const FSIQ_BAND_RANGES: { band: WechslerFsiqBand; min: number; max: number; fa: string }[] = [
  { band: 'ID', min: 0, max: 69, fa: 'بازهٔ ناتوانی هوشی (≤۶۹)' },
  { band: 'BIF', min: 70, max: 84, fa: 'بازهٔ مرزی/دیرآموزی (۷۰–۸۴)' },
  { band: 'LOW_BORDER', min: 85, max: 89, fa: 'مرز پایین (۸۵–۸۹)' },
  { band: 'AVERAGE', min: 90, max: 109, fa: 'متوسط (۹۰–۱۰۹)' },
  { band: 'HIGH_AVERAGE', min: 110, max: 119, fa: 'بالاتر از متوسط (۱۱۰–۱۱۹)' },
  { band: 'SUPERIOR', min: 120, max: 129, fa: 'عالی (۱۲۰–۱۲۹)' },
  { band: 'GIFTED', min: 130, max: 200, fa: 'استعداد (۱۳۰+)' }
];

export function fsiqBandOf(fsiq: number): WechslerFsiqBand {
  const s = Number(fsiq);
  if (!Number.isFinite(s) || s < 0) return 'ID';
  for (const b of FSIQ_BAND_RANGES) {
    if (s >= b.min && s <= b.max) return b.band;
  }
  return 'GIFTED';
}

export function fsiqBandFaOf(band: WechslerFsiqBand): string {
  return FSIQ_BAND_RANGES.find((b) => b.band === band)?.fa ?? band;
}

export function clamp01(v: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

export function makeSignal(
  domain: SignalDomain,
  key: string,
  value: number,
  source: SignalSource,
  fa: string
): ClinicalSignal {
  return { domain, key, value: clamp01(value), source, fa };
}

export function sortSignals(signals: ClinicalSignal[]): ClinicalSignal[] {
  return [...signals].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.fa < b.fa ? -1 : a.fa > b.fa ? 1 : 0));
}

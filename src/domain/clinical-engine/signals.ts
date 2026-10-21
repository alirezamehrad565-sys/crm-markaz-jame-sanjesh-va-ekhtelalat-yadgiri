/**
 * موتور بالینی — لایهٔ سیگنال (قرارداد مشترک مصرف‌کنندگان: پیشنهادگر چک‌لیست T3 · موتور شک v2 T6)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// ClinicalSignal: واحد کمینهٔ خروجی هر ابزار — هر منبع (شرح‌حال/وکسلر/چک‌لیست/پروب/OT/مشاهده)
// فقط «سیگنال» می‌دهد؛ روایت و جمع‌بندی فقط در موتور شک ساخته می‌شود (اصل تک‌منبع حقیقت، طرح واحد §۳).
// بدون I/O — سازنده‌ها خالص‌اند و هیچ وابستگی به بقیهٔ ماژول‌ها ندارند.
// نکتهٔ همگام‌سازی: جدول بازه‌های FSIQ (FSIQ_BAND_RANGES) باید با ثابت FSIQ_BANDS داخل
// موتور وکسلر (src/domain/wechsler-engine/engine.js و ناحیهٔ وکسلر worker/bundle.js)
// هم‌ارز بماند — تست هم‌خوانی دو جدول در tests/golden/wechsler-golden.test.mjs واگرایی
// آینده را می‌گیرد؛ تغییر این جدول = تغییر هم‌زمان هر دو سمت.

/** حوزهٔ بالینی سیگنال — ستون فقرات فیلترینگ مصرف‌کنندگان */
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

/** منبع سیگنال — کدام لایهٔ ارزیابی آن را تولید کرده است */
export type SignalSource = 'anamnesis' | 'wechsler' | 'checklist' | 'probe' | 'ot' | 'observation';

/** یک سیگنال ساخت‌یافتهٔ بالینی — قرارداد مشترک همهٔ موتورها */
export interface ClinicalSignal {
  domain: SignalDomain;
  /** کلید قطعی و دانه‌درشت، مثل 'fsiq.band' · 'index.scatter' · 'acid.pattern' · 'step5_weak.WMI' */
  key: string;
  /** شدت/اطمینان در بازهٔ ۰..۱ */
  value: number;
  source: SignalSource;
  /** دلیل فارسی قابل‌نمایش برای درمانگر (جملهٔ آماده، بدون نیاز به قالب‌بندی) */
  fa: string;
}

// ───────────── بازه‌های هوش‌بهر کل (FSIQ) — تک‌منبع قرارداد ─────────────

export type WechslerFsiqBand =
  | 'ID'
  | 'BIF'
  | 'LOW_BORDER'
  | 'AVERAGE'
  | 'HIGH_AVERAGE'
  | 'SUPERIOR'
  | 'GIFTED';

/** جدول بازه‌های FSIQ — همان جدولی که موتور وکسلر در engine_output استفاده می‌کند */
export const FSIQ_BAND_RANGES: { band: WechslerFsiqBand; min: number; max: number; fa: string }[] = [
  { band: 'ID', min: 0, max: 69, fa: 'بازهٔ ناتوانی هوشی (≤۶۹)' },
  { band: 'BIF', min: 70, max: 84, fa: 'بازهٔ مرزی/دیرآموزی (۷۰–۸۴)' },
  { band: 'LOW_BORDER', min: 85, max: 89, fa: 'مرز پایین (۸۵–۸۹)' },
  { band: 'AVERAGE', min: 90, max: 109, fa: 'متوسط (۹۰–۱۰۹)' },
  { band: 'HIGH_AVERAGE', min: 110, max: 119, fa: 'بالاتر از متوسط (۱۱۰–۱۱۹)' },
  { band: 'SUPERIOR', min: 120, max: 129, fa: 'عالی (۱۲۰–۱۲۹)' },
  { band: 'GIFTED', min: 130, max: 200, fa: 'استعداد (۱۳۰+)' }
];

/** بازهٔ FSIQ ورودی را برمی‌گرداند — ورودی غیرمتناهی/منفی محافظه‌کارانه به ID می‌رود */
export function fsiqBandOf(fsiq: number): WechslerFsiqBand {
  const s = Number(fsiq);
  if (!Number.isFinite(s) || s < 0) return 'ID';
  for (const b of FSIQ_BAND_RANGES) {
    if (s >= b.min && s <= b.max) return b.band;
  }
  return 'GIFTED';
}

/** متن فارسی بازهٔ FSIQ — از همان جدول قرارداد */
export function fsiqBandFaOf(band: WechslerFsiqBand): string {
  return FSIQ_BAND_RANGES.find((b) => b.band === band)?.fa ?? band;
}

// ───────────── سازنده‌های خالص کمکی ─────────────

/** محدودکردن مقدار به بازهٔ ۰..۱ (NaN → ۰) */
export function clamp01(v: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** سازندهٔ خالص سیگنال — مقدار را به ۰..۱ می‌کِشد تا قرارداد شکسته نشود */
export function makeSignal(
  domain: SignalDomain,
  key: string,
  value: number,
  source: SignalSource,
  fa: string
): ClinicalSignal {
  return { domain, key, value: clamp01(value), source, fa };
}

/** مرتب‌سازی قطعی سیگنال‌ها بر اساس کلید (و سپس متن fa برای پایداری کامل) */
export function sortSignals(signals: ClinicalSignal[]): ClinicalSignal[] {
  return [...signals].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.fa < b.fa ? -1 : a.fa > b.fa ? 1 : 0));
}

/**
 * موتور بالینی — باتری‌ها، قواعد، روایت و اهداف مداخله — پیوند وکسلر ۴ با موتور شناسایی
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// فرم جدید وکسلر (ce-wechsler-w4-v1) خروجی موتور تفسیر را در payload.engine_output
// (JSON رشته‌ای) نگه می‌دارد؛ این ماژول همان JSON را می‌خواند و فرضیه‌های هم‌گرا
// را به شکل «تقویت شواهد» به موتور شناسایی (infer.ts) تزریق می‌کند.
// قرارداد وزن: w≥۰٫۳ → وزن ۲ (بالا) ، ۰٫۱۸≤w<۰٫۳ → وزن ۱ (متوسط) ، وگرنه هیچ.
// BIF عمداً در نقشهٔ هدف نیست — قاعدهٔ fsiq (بازهٔ مرزی ۷۰–۸۵) کفایت می‌کند.

import type { EvidenceEvent } from './types';

/** کلید ثابت نوع رویداد فرم وکسلر ۴ (فرم قدیمی wechsler بازنشسته شده است) */
export const WECHSLER_W4_EVENT_KEY = 'ce-wechsler-w4-v1' as const;

/** نگاشت شناسهٔ فرضیهٔ موتور وکسلر → targetKey موتور شناسایی (BIF/ID/SLD/... هدف مستقل ندارند) */
export const WECHSLER_HYP_TARGETS: Record<string, string> = {
  DLD: 'speech_language',
  APD: 'speech_language',
  MOOD: 'anxiety',
  ADHD: 'adhd',
  ASD: 'autism'
};

/** نام فارسی فرضیه‌های موتور وکسلر — برای متن شواهد و خلاصهٔ گیت‌ها */
export const WECHSLER_HYP_NAMES: Record<string, string> = {
  DLD: 'اختلال زبانی (DLD)',
  BIF: 'عملکرد مرزی/دیرآموزی (BIF)',
  APD: 'اختلال پردازش شنیداری (APD)',
  MOOD: 'عامل خلقی/اضطرابی (MOOD)',
  ADHD: 'بیش‌فعالی/کم‌توجهی (ADHD)',
  ASD: 'اطیسم (ASD)',
  ID: 'ناتوانی هوشی (ID)',
  SLD: 'اختلال یادگیری خاص (SLD)',
  NVLD: 'یادگیری غیرکلامی (NVLD)',
  TBI: 'آسیب مغزی اکتسابی (TBI)',
  TWO_E: 'دواستثنایی (2e)',
  DOMAIN_WEAK: 'ضعف حوزه‌ای',
  NORMAL: 'نیم‌رخ عادی'
};

/** خروجی موتور تفسیر وکسلر — فقط فیلدهایی که این‌جا مصرف می‌شوند */
interface WechslerEngineOutput {
  ok?: unknown;
  hypotheses?: { id?: string; weight?: number | string }[];
}

/** خواندن engine_output از payload رویداد — خراب/غایب/ok:false → null (بدون پرتاب خطا) */
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

export interface WechslerHypothesisBoost {
  /** وزن افزوده به امتیاز شواهد — ۱ (متوسط) یا ۲ (بالا) */
  weight: number;
  /** متن شاهد فارسی — به evidenceFa افزوده می‌شود */
  fa: string;
}

/**
 * تقویت شواهد از فرضیه‌های هم‌گرای وکسلر ۴ برای یک هدف مشخص — یا null.
 * بین فرضیه‌های هم‌گرا فقط قوی‌ترین (بیشترین وزن) اعمال می‌شود.
 */
export function wechslerHypothesisBoost(
  event: EvidenceEvent | undefined | null,
  targetKey: string
): WechslerHypothesisBoost | null {
  const c = wechslerEngineOutputOf(event);
  if (!c) return null;
  const hyps = (c.hypotheses ?? []).filter((h) => WECHSLER_HYP_TARGETS[h.id ?? ''] === targetKey);
  if (!hyps.length) return null;
  const best = hyps.reduce((a, b) => (Number(b.weight) > Number(a.weight) ? b : a));
  const w = Number(best.weight) || 0;
  if (!(w >= 0.18)) return null;
  const weight = w >= 0.3 ? 2 : 1;
  const name = WECHSLER_HYP_NAMES[best.id ?? ''] ?? best.id ?? '';
  return { weight, fa: `نیم‌رخ وکسلر ۴ با فرضیهٔ «${name}» هم‌گراست (وزن ${w >= 0.3 ? 'بالا' : 'متوسط'}).` };
}

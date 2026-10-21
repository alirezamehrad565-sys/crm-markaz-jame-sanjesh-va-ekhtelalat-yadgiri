/**
 * موتور بالینی — باتری‌ها، قواعد، روایت و اهداف مداخله — پیوند وکسلر ۴ با موتور شناسایی
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// فرم جدید وکسلر (ce-wechsler-w4-v1) خروجی موتور تفسیر را در payload.engine_output
// (JSON رشته‌ای) نگه می‌دارد؛ این ماژول همان JSON را می‌خواند و فرضیه‌های هم‌گرا
// را به شکل «تقویت شواهد» به موتور شناسایی (infer.ts) تزریق می‌کند.
// قرارداد وزن: w≥۰٫۳ → وزن ۲ (بالا) ، ۰٫۱۸≤w<۰٫۳ → وزن ۱ (متوسط) ، وگرنه هیچ.
//
// T6 (m148-b) — نگاشت کامل سیزده‌فرضیه‌ای (طرح واحد §۳ «رجیستری فرضیهٔ واحد» و §۳.۱):
//   پیش از این موج فقط ۵ فرضیه (DLD/APD/MOOD/ADHD/ASD) هدف داشتند؛ اکنون هر سیزده شناسهٔ
//   موتور وکسلر به‌صورت صریح مدیریت می‌شود — یا هدف بالینی دارد، یا «عمداً null» است با
//   دلیل مکتوب (هیچ حذف بی‌سروصدایی وجود ندارد). دو فرضیهٔ وابسته به زمینه (SLD و
//   DOMAIN_WEAK) با تابع حل قطعی `wechslerHypTargetOf` از زمینهٔ همان پرونده حل می‌شوند.
//   BIF → slow_learner الزام صریح §۳.۱ است؛ ID هرگز نباید slow_learner را تقویت کند —
//   تفکیک انطباقی دو مسیر ID و دیرآموز هرگز هم‌پوشان نمی‌شوند.

import type { EvidenceEvent } from './types';

/** کلید ثابت نوع رویداد فرم وکسلر ۴ (فرم قدیمی wechsler بازنشسته شده است) */
export const WECHSLER_W4_EVENT_KEY = 'ce-wechsler-w4-v1' as const;

/**
 * شناسه‌های سیزده‌گانهٔ فرضیهٔ موتور وکسلر ۴ — تک‌منبع نگاشت این ماژول.
 * تست کامل‌بودن (clinical-engine-v2.test.ts) همین فهرست را با HYPOTHESES موتور وکسلر
 * (src/domain/wechsler-engine) هم‌خوان می‌کند تا شناسهٔ آینده‌ای جا نیفتد.
 */
export const WECHSLER_HYP_IDS = [
  'SLD',
  'ADHD',
  'ID',
  'BIF',
  'DLD',
  'NVLD',
  'TBI',
  'ASD',
  'TWO_E',
  'MOOD',
  'APD',
  'NORMAL',
  'DOMAIN_WEAK'
] as const;
export type WechslerHypId = (typeof WECHSLER_HYP_IDS)[number];

/**
 * نگاشت ثابت فرضیهٔ وکسلر → targetKey موتور شناسایی.
 * مقدار null یعنی «عمداً بی‌هدف» — نه جاافتادگی:
 *  - ID: هدف مستقل «ناتوانی هوشی» در رجیستری مداخلهٔ مرکز وجود ندارد و مسیر ID فقط با
 *    خط قرمز ارجاع (قاعدهٔ سیگنالی FSIQ≤۷۰ + انطباق پایین — infer.ts) فعال می‌شود؛
 *    به‌ویژه ID هرگز نباید slow_learner را تقویت کند: ملاک §۳.۱ تفکیک انطباقی، دو مسیر
 *    ID و دیرآموز را جدای هم نگه می‌دارد (ID = هوش پایین + انطباق پایین؛ BIF = هوش مرزی).
 *  - NVLD: هدف اختصاصی «یادگیری غیرکلامی» در رجیستری بالینی تعریف نشده؛ تقویتِ بی‌هدف فقط
 *    فرضیهٔ بی‌پشتوانه به مسیر مداخله می‌فرستد.
 *  - TBI: آسیب اکتسابی مسیر پزشکی/ارجاعی است نه هدف مداخلهٔ مرکز (قاعدهٔ TBI پیشنهادگر
 *    نیز به ارجاع پزشکی می‌رود).
 *  - TWO_E: دواستثنایی ترکیب توان بالا + ضعف اجرایی است و هدف واحدی ندارد؛ قواعد
 *    پروفایلی پیشنهادگر (r11) ابزارهای همان وضعیت را پیشنهاد می‌دهند.
 *  - NORMAL: نیم‌رخ عادی هیچ مداخله‌ای نمی‌خواهد — تقویتش خطای بالینی است.
 */
export const WECHSLER_HYP_TARGETS: Record<string, string | null> = {
  DLD: 'speech_language',
  APD: 'speech_language',
  MOOD: 'anxiety',
  ADHD: 'adhd',
  ASD: 'autism',
  // T6 (m148-b) — سناریوی دیرآموز §۳.۱: فرضیهٔ BIF وکسلر سرانجام هدف واحد خودش را می‌گیرد.
  // دوبارشماری ممنوع: این تقویت در infer.ts با قاعدهٔ خام fsiq و تقویت سیگنال پروفایل
  // به‌صورت «قوی‌ترین تک‌تقویت» حل می‌شود — هرگز جمع نمی‌شوند.
  BIF: 'slow_learner',
  ID: null,
  NVLD: null,
  TBI: null,
  TWO_E: null,
  NORMAL: null
  // SLD و DOMAIN_WEAK پویا هستند (به زمینهٔ پرونده وابسته‌اند) — با `wechslerHypTargetOf`
  // پایین حل می‌شوند و عضو همین نگاشت سیزده‌تایی‌اند.
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

/** زمینهٔ حل فرضیه‌های وابسته به پرونده — infer.ts آن را از دادهٔ همان کیس می‌سازد */
export interface WechslerHypContext {
  /**
   * شدت سه سیگنال SLD شرح‌حال نسخهٔ ۳ (کلیدهای anam.sld_read / anam.sld_write / anam.sld_calc
   * در بازهٔ ۰..۱) — null یعنی برای آن حوزه داده‌ای نیست.
   */
  sld?: { read: number | null; write: number | null; calc: number | null };
  /**
   * شاخص ضعف گام ۵ برای DOMAIN_WEAK — یکی از 'VCI' | 'PRI' | 'WMI' | 'PSI'؛
   * null/غایب یعنی جزئیات شاخص در خروجی موتور در دسترس نیست.
   */
  domainWeakIndex?: string | null;
}

/**
 * حل قطعی هدف برای فرضیه‌های وابسته به زمینه (SLD و DOMAIN_WEAK) + نگاشت ثابت بقیه.
 *
 *  - SLD: موتور وکسلر در خروجی فرضیه فقط {id, weight, clues} می‌دهد و حوزهٔ یادگیری
 *    (خواندن/نوشتن/حساب) را مشخص نمی‌کند. قاعدهٔ قطعی T6: فرضیهٔ SLD به هدفی می‌رود که
 *    «قوی‌ترین سیگنال شرح‌حال» همان پرونده نشان می‌دهد — بیشینهٔ anam.sld_read /
 *    anam.sld_write / anam.sld_calc؛ در تساوی، ترتیب ثابت خواندن، نوشتن، حساب ملاک است.
 *    اگر هیچ‌کدام از سه سیگنال در پرونده نیست، SLD بی‌هدف می‌ماند (null صریح — نه حذف
 *    بی‌سروصدا: تقویتِ بی‌دامنه فرضیهٔ گمراه‌کننده می‌سازد).
 *  - DOMAIN_WEAK: اگر جزئیات شاخص در دسترس باشد به هدف همان حوزه می‌رود (WMI→حافظهٔ کاری،
 *    VCI→زبان/گفتار، PRI→هماهنگی حرکتی/DCDQ)؛ PSI هدف مستقل «سرعت پردازش» در رجیستری
 *    ندارد → null صریح.
 */
export function wechslerHypTargetOf(hypId: string, ctx: WechslerHypContext = {}): string | null {
  if (hypId === 'SLD') {
    const c = ctx.sld;
    if (!c) return null;
    const cands: [string, number][] = [];
    if (c.read !== null && c.read !== undefined) cands.push(['dyslexia', c.read]);
    if (c.write !== null && c.write !== undefined) cands.push(['dysgraphia', c.write]);
    if (c.calc !== null && c.calc !== undefined) cands.push(['dyscalculia', c.calc]);
    if (!cands.length) return null;
    // قوی‌ترین سیگنال؛ تساوی → ترتیب ثابت خواندن، نوشتن، حساب (اولین بیشینه حفظ می‌شود)
    return cands.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
  }
  if (hypId === 'DOMAIN_WEAK') {
    switch (ctx.domainWeakIndex) {
      case 'WMI':
        return 'working_memory';
      case 'VCI':
        return 'speech_language';
      case 'PRI':
        return 'motor_coordination';
      // PSI: «سرعت پردازش» هدف مستقلی در رجیستری ندارد — null صریح با همین توضیح.
      default:
        return null;
    }
  }
  return WECHSLER_HYP_TARGETS[hypId] ?? null;
}

/** خروجی موتور تفسیر وکسلر — فقط فیلدهایی که این‌جا مصرف می‌شوند */
export interface WechslerEngineOutput {
  ok?: unknown;
  hypotheses?: { id?: string; weight?: number | string }[];
  /**
   * T6 — فیلدهای افزودنی لایهٔ سیگنال T1 که قواعد سیگنالی infer می‌خوانند.
   * رویدادهای قدیمی بدون profile عیناً رفتار امروز را دارند (پاریتی — پرونده‌های قدیمی).
   */
  profile?: {
    fsiq?: number | null;
    fsiqBand?: string | null;
    indexScatter?: number | null;
  } | null;
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
 * T6: پارامتر زمینهٔ اختیاری — برای حل قطعی SLD/DOMAIN_WEAK از دادهٔ همان پرونده.
 */
export function wechslerHypothesisBoost(
  event: EvidenceEvent | undefined | null,
  targetKey: string,
  ctx: WechslerHypContext = {}
): WechslerHypothesisBoost | null {
  const c = wechslerEngineOutputOf(event);
  if (!c) return null;
  const hyps = (c.hypotheses ?? []).filter((h) => {
    const t = wechslerHypTargetOf(h.id ?? '', ctx);
    return t !== null && t === targetKey;
  });
  if (!hyps.length) return null;
  const best = hyps.reduce((a, b) => (Number(b.weight) > Number(a.weight) ? b : a));
  const w = Number(best.weight) || 0;
  if (!(w >= 0.18)) return null;
  const weight = w >= 0.3 ? 2 : 1;
  const name = WECHSLER_HYP_NAMES[best.id ?? ''] ?? best.id ?? '';
  return { weight, fa: `نیم‌رخ وکسلر ۴ با فرضیهٔ «${name}» هم‌گراست (وزن ${w >= 0.3 ? 'بالا' : 'متوسط'}).` };
}

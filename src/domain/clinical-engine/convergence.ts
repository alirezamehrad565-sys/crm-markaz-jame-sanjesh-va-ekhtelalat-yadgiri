/**
 * موتور بالینی — هم‌گرایی چندمنبعی (T6/m148-b — طرح واحد §۳ ردیف «گزارش هم‌گرایی»)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// اصل ۳ طرح واحد — «پشت‌پردهٔ نامرئی»: ماتریس منابع، وزن‌ها و امتیازها هرگز به درمانگر
// نشان داده نمی‌شود؛ خروجی این ماژول فقط سه حالت خوانا («هم‌گرا» / «تنها» / «واگرا») و
// یک جملهٔ دلالت فارسی برای هر فرضیهٔ رتبه‌خورده است — بدون هیچ عدد و مکانیک.
// جمع‌آوری منابع (کدام ابزار از کدام منبع آمد و آیا شواهد همان‌جهت دارد) در infer.ts و
// «در همان یک محاسبه» انجام می‌شود (بدون گذر دوم روی رویدادها)؛ این ماژول فقط
// طبقه‌بندی خوانا + جدول تک‌منبع طبقه‌بندی کلید ابزار → منبع را دارد.

import type { EvidenceEvent } from './types';
import { batteryDef } from './instruments';

// ───────────── منابع مستقل هم‌گرایی ─────────────

/** پنج منبع مستقل — هر بستهٔ تجمیعی = یک منبع (خودِ informant)، هرگز چند منبع */
export const CONVERGENCE_SOURCES = ['family', 'teacher', 'test', 'probe', 'clinician'] as const;
export type ConvergenceSource = (typeof CONVERGENCE_SOURCES)[number];

/** برچسب فارسی منابع — در جملهٔ دلالت می‌آید (خوانا، بدون کلید فنی) */
export const CONVERGENCE_SOURCE_FA: Record<ConvergenceSource, string> = {
  family: 'خانواده',
  teacher: 'مدرسه',
  test: 'آزمون شناختی',
  probe: 'پروب عملکردی',
  clinician: 'چک‌لیست ملاکی'
};

/** سه حالت خوانا — هیچ حالت عددی/وزنی وجود ندارد */
export type ConvergenceState = 'هم‌گرا' | 'تنها' | 'واگرا';

/** یک آیتم هم‌گرایی — شکل کلید افزودنی `convergence` در InferenceOutput */
export interface ConvergenceItem {
  targetKey: string;
  state: ConvergenceState;
  /** یک جملهٔ دلالت فارسی — آمادهٔ نمایش، بدون عدد و وزن */
  implicationFa: string;
}

// ───────────── کلیدهای رویدادهای چند-ابزاری (تک‌منبع قرارداد) ─────────────

/** سنجهٔ انطباق روزمره (T5/m150) — مصرف مشترک: تفکیک ID/BIF در infer و جدول منابع این‌جا */
export const ID_ADAPT_EVENT_KEY = 'ce-id-adapt-v1';

/** پکیج فرم جامع خانواده (T5/m150) — کامپوننت‌هایش ذاتاً منبع خانواده‌اند: یک منبع، نه چند منبع */
export const COMPOSITE_FAMILY_EVENT_KEY = 'ce-comp-family-v2';

/**
 * جدول طبقه‌بندی کلید ابزار → منبع مستقل (تک‌منبع قرارداد T6).
 *  - family: شرح‌حال (هر دو نسخه)، SDQ/SNAP/SCARED والد (و legacy sdq-parent)، سنجهٔ
 *    انطباق روزمره، پکیج جامع خانواده. کامپوننت‌های پکیج (snap-p/sdq-p/scared/id-adapt)
 *    ذاتاً در همین جدول خانواده‌اند — یعنی پکیج هرگز چند منبع مستقل نمی‌سازد.
 *  - teacher: SDQ/SNAP معلم + پکیج جامع معلم (T7 — از همین موج در جدول ثبت است تا هرگز
 *    منبع جدایی نسازد) + فال‌بک مخاطب «معلم» برای کلیدهای آینده.
 *  - test: خروجی موتور وکسلر ۴ (engine_output).
 *  - probe: سه پروب عملکردی.
 *  - clinician: چک‌لیست‌های ملاکی آزماینده (سه SLD، odd، asd، speech) — مخاطب «both» آنها
 *    آزماینده است.
 */
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

/**
 * منبع مستقل یک کلید ابزار — ناشناخته → null (بی‌نقش در هم‌گرایی).
 * کلیدهای ناشناختهٔ آینده با مخاطب «معلم» (batteryDef) خودکار معلم شمرده می‌شوند
 * («any teacher-audience event») تا فرم جامع معلم T7 بدون تغییر این‌جا بنشیند.
 */
export function convergenceSourceOfTool(toolKey: string): ConvergenceSource | null {
  const direct = SOURCE_BY_TOOL[toolKey];
  if (direct) return direct;
  const def = batteryDef(toolKey);
  if (def?.audience === 'teacher') return 'teacher';
  return null;
}

// ───────────── طبقه‌بندی خوانا — سه حالت + جملهٔ دلالت ─────────────

/**
 * طبقه‌بندی خوانا برای یک هدف رتبه‌خورده از نقشهٔ منابع همان هدف.
 * ورودی (از infer — همان یک محاسبه):
 *   positive — منابعی که شواهد همان‌جهت برای این هدف دارند؛
 *   withData — منابعی که دادهٔ مرتبط این هدف را دارند (مثبت یا بی‌نشانه).
 * خروجی:
 *   ≥۲ منبع مستقل مثبت → «هم‌گرا»
 *   دقیقاً یک منبع مثبت + منبعِ دارای داده اما بی‌نشانه → «واگرا» (منابع هم‌رأی نیستند)
 *   دقیقاً یک منبع مثبت بدون مخالفت → «تنها»
 *   بدون منبع مثبت → null (فرضیهٔ بی‌شاهد — چیزی برای گفتن نیست)
 * جملهٔ دلالت فقط نام منابع را به فارسی می‌گوید — هیچ وزن/امتیازی در آن نیست.
 */
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

/** سطح انطباق روزمره از رویداد ce-id-adapt-v1 — قرارداد باندهای T5 (خواندن رنگ/برچسب باند) */
export type AdaptLevel = 'low' | 'border' | 'normal' | 'unknown';

/**
 * سطح انطباق از آخرین رویداد سنجه (نسخهٔ تکی یا کامپوننت پکیج — هر دو با همین کلید می‌آیند).
 * رویداد بالاتر = انطباق بهتر؛ باند danger («پایین — نیاز به بررسی») = low.
 * بدون رویداد/زیرمقیاس → unknown («normal-or-absent» قواعد ID/BIF همین را می‌گیرد).
 */
export function idAdaptLevelOfEvent(event: EvidenceEvent | undefined | null): AdaptLevel {
  const ss = event?.analysis?.subscaleScores?.find((s) => s.id === 'id_adapt') ?? null;
  if (!ss) return 'unknown';
  const color = ss.color ?? event?.subscales?.find((d) => d.id === 'id_adapt')?.bands?.find((b) => b.label === ss.band)?.color ?? null;
  if (color === 'danger' || (ss.band ?? '').includes('پایین')) return 'low';
  if (color === 'warn' || (ss.band ?? '').includes('مرزی')) return 'border';
  if (color === 'ok' || (ss.band ?? '').includes('نرمال')) return 'normal';
  return 'unknown';
}

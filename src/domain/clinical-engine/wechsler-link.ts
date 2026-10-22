/**
 * موتور بالینی — پیوند وکسلر ۴ با موتور واحد — فقط پروفایل روان‌سنجی
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// m156 — اتصال فرضیه‌ای به‌کلی قطع شد:
// ماشین فرضیه‌های وکسلر (WECHSLER_HYP_IDS/WECHSLER_HYP_TARGETS/WECHSLER_HYP_NAMES +
// wechslerHypTargetOf + wechslerHypothesisBoost) حذف شدند. موتور وکسلر هم خودش دیگر
// فرضیه تولید نمی‌کند (activateHypotheses حذف شد) و موتور واحد هم دیگر هیچ فرضیه‌ای
// از وکسلر نمی‌گیرد. تنها قرارداد باقی‌مانده: خواندن engine_output رویداد
// ce-wechsler-w4-v1 برای پروفایل روان‌سنجی (fsiq/band/scatter) که قواعد سیگنالی
// infer (باند BIF دیرآموز و خط قرمز ID) از آن می‌خوانند — نیم‌رخ هوشی، نه سناریو.

import type { EvidenceEvent } from './types';

/** کلید ثابت نوع رویداد فرم وکسلر ۴ (فرم قدیمی wechsler بازنشسته شده است) */
export const WECHSLER_W4_EVENT_KEY = 'ce-wechsler-w4-v1' as const;

/** خروجی موتور تفسیر وکسلر — فقط فیلدهایی که موتور واحد مصرف می‌کند */
export interface WechslerEngineOutput {
  ok?: unknown;
  /**
   * T1 — فیلدهای افزودنی لایهٔ سیگنال که قواعد سیگنالی infer می‌خوانند.
   * رویدادهای قدیمی بدون profile عیناً رفتار امروز را دارند (پاریتی — پرونده‌های قدیمی).
   */
  profile?: {
    fsiq?: number | null;
    fsiqBand?: string | null;
    indexScatter?: number | null;
    /**
     * m159 — شاخص‌های چهارگانه (نمرهٔ استاندارد) برای قواعد هم‌گرایی پردازشی SLD.
     * رویدادهای قدیمی بدون این فیلدها → null: قواعد جدید خاموش می‌مانند (پاریتی قدیمی‌ها).
     */
    vci?: { scaled?: number | null } | null;
    pri?: { scaled?: number | null } | null;
    wmi?: { scaled?: number | null } | null;
    psi?: { scaled?: number | null } | null;
    /** وضعیت شخصی گام ۵ — ضعف/قوت نسبت به میانگین شاخص‌های خود دانش‌آموز */
    step5?: { strengths?: string[]; weaknesses?: string[] } | null;
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

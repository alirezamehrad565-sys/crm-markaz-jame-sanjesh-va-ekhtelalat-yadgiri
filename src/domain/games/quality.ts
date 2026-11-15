// quality.ts — موتور کیفیت جلسه (فاز ۷ بازطراحی گو/نوگو / ۱.۲۵.۱۷)
// دفترچهٔ وظیفه §۷:
//   · بررسی قطع‌شدن، خروج از حالت متمرکز (مکث برگه)، مکث طولانی، لمس بیرون صحنه،
//     تأخیرهای نامتعارف، آزمون‌های ناقص
//   · خروجی سه‌تایی: explainable / needs_caution / incomplete_or_invalid
//   · قواعد شفاف و قابل‌تنظیم — هر آستانه با نام و مقدار در خروجی
//   ⚠ ممنوعیت مطلق: هیچ نتیجه‌گیری شناختی خودکار — پرچم‌ها رفتار داده را توصیف
//     می‌کنند، نه کودک را؛ تفسیر فقط کار درمانگر است.

import type { SessionValidity } from './types';

export const QUALITY_RULES_VERSION = '1.0.0';

export type QualityVerdict = 'explainable' | 'needs_caution' | 'incomplete_or_invalid';

export interface QualityThresholds {
  /** نسبت تکمیل زیر این = ناقص (هم‌سنگ MIN_COMPLETION_RATIO §۸) */
  min_completion_ratio: number;
  /** مکث تجمیعی برگه بالاتر از این (ms) → caution */
  pause_total_max_ms: number;
  /** شکاف بی‌فعالیتی بالاتر از این (ms) → caution (هم‌سنگ IDLE_PARTIAL_MS §۶) */
  idle_gap_max_ms: number;
  /** لمس بیرون صحنه بیش از این → caution */
  out_of_surface_max: number;
  /** نسبت پاسخ زودتر از محرک به آزمون‌ها بالاتر از این → caution */
  premature_ratio_max: number;
  /** کل فریم‌های افتاده بیش از این → caution (کیفیت دستگاه) */
  frame_drops_max: number;
  /** بلندترین فریم بالاتر از این (ms) → caution */
  max_frame_delta_ms_max: number;
  /** پوشش مُهر نمایش کمتر از این (۰..۱) → caution (عدم‌قطعیت اندازه‌گیری) */
  min_evidence_coverage: number;
  /** شمار پاسخ زیر کف RT بیش از این → caution */
  rt_floor_violations_max: number;
}

export const DEFAULT_QUALITY_THRESHOLDS: QualityThresholds = {
  min_completion_ratio: 0.6,
  pause_total_max_ms: 90_000,
  idle_gap_max_ms: 5 * 60_000,
  out_of_surface_max: 10,
  premature_ratio_max: 0.3,
  frame_drops_max: 20,
  max_frame_delta_ms_max: 500,
  min_evidence_coverage: 0.5,
  rt_floor_violations_max: 3
};

export interface QualityInput {
  /** حکم اعتبار §۶/§۸ (decideValidity) — ورودی مستقل و دست‌نخورده */
  validity: SessionValidity;
  total_items: number;
  done_items: number;
  /** بیشترین شکاف بین فعالیت‌ها (ms)؛ بی‌داده: null */
  idle_gap_max_ms: number | null;
  /** مکث برگه — از کلاینت (session_evidence finish)؛ بی‌داده: null */
  pause_count: number | null;
  pause_total_ms: number | null;
  /** شواهد نمایش فاز ۴ از game_attempts */
  out_of_surface_total: number;
  premature_total: number;
  frame_drops_total: number;
  max_frame_delta_ms: number | null;
  evidence_coverage: number | null;
  /** پاسخ‌های زیر کف RT (rt_valid=۰) */
  rt_floor_violations: number;
}

export interface QualityFlag {
  rule: string;
  verdict: 'ok' | 'needs_caution' | 'incomplete_or_invalid';
  detail: string;
}

export interface SessionQuality {
  verdict: QualityVerdict;
  flags: QualityFlag[];
  rules_version: string;
  thresholds: QualityThresholds;
}

function flag(rule: string, verdict: QualityFlag['verdict'], detail: string): QualityFlag {
  return { rule, verdict, detail };
}

/** حکم نهایی = شدیدترین پرچم؛ سه‌تایی صادقانه */
export function assessQuality(input: QualityInput, thresholds: QualityThresholds = DEFAULT_QUALITY_THRESHOLDS): SessionQuality {
  const flags: QualityFlag[] = [];
  const completionRatio = input.total_items > 0 ? input.done_items / input.total_items : null;

  // R1 — اعتبار پایه (شکاف بیکاری/تکمیل) — حکم ناقص/بی‌اعتبار را مستقیم می‌گیرد
  if (input.validity === 'invalid' || input.validity === 'partial') {
    flags.push(flag('base_validity', 'incomplete_or_invalid',
      `حکم اعتبار پایهٔ جلسه «${input.validity}» است — جلسهٔ کامل یکنواخت ثبت نشده`));
  }
  // R2 — تکمیل
  if (completionRatio !== null && completionRatio < thresholds.min_completion_ratio) {
    flags.push(flag('completion', 'incomplete_or_invalid',
      `فقط ${Math.round(completionRatio * 100)}٪ آیتم‌ها انجام شد — زیر آستانهٔ ${Math.round(thresholds.min_completion_ratio * 100)}٪`));
  }
  // R3 — مکث برگه
  if (input.pause_total_ms !== null && input.pause_total_ms > thresholds.pause_total_max_ms) {
    flags.push(flag('pause_total', 'needs_caution',
      `جمع مکث برگه ${Math.round(input.pause_total_ms / 1000)} ثانیه بود — زمان‌بندی در مکث‌ها مکث کرده اما جریان پراکنده شده`));
  }
  // R4 — شکاف بی‌فعالیتی
  if (input.idle_gap_max_ms !== null && input.idle_gap_max_ms > thresholds.idle_gap_max_ms) {
    flags.push(flag('idle_gap', 'needs_caution',
      `شکاف بی‌فعالیتی تا ${Math.round(input.idle_gap_max_ms / 1000)} ثانیه — قطع/ادامه در میانهٔ جلسه`));
  }
  // R5 — لمس بیرون صحنه
  if (input.out_of_surface_total > thresholds.out_of_surface_max) {
    flags.push(flag('out_of_surface', 'needs_caution',
      `${input.out_of_surface_total} لمس بیرون سطح بازی ثبت شد — احتمال لمس کف‌دست یا چندلمسی؛ بی‌اثر بر پاسخ`));
  }
  // R6 — پاسخ زودتر از محرک — توصیف داده، نه کودک؛ تفسیر با درمانگر
  if (input.total_items > 0 && input.premature_total / input.total_items > thresholds.premature_ratio_max) {
    flags.push(flag('premature_ratio', 'needs_caution',
      `${input.premature_total} پاسخ زودتر از محرک (بیش از ${Math.round(thresholds.premature_ratio_max * 100)}٪ آزمون‌ها) — الگوی لمس پیش از دیدن شکل؛ تفسیر با درمانگر`));
  }
  // R7 — کیفیت دستگاه
  if (input.frame_drops_total > thresholds.frame_drops_max || (input.max_frame_delta_ms !== null && input.max_frame_delta_ms > thresholds.max_frame_delta_ms_max)) {
    flags.push(flag('device_frame', 'needs_caution',
      `${input.frame_drops_total} فریم افتاده (بلندترین ${input.max_frame_delta_ms ?? '—'}ms) — دستگاه در لحظه‌های نمایش فشار داشته؛ دقت میلی‌ثانیه‌ای محتاط بخوانید`));
  }
  // R8 — پوشش مُهر نمایش
  if (input.evidence_coverage !== null && input.evidence_coverage < thresholds.min_evidence_coverage) {
    flags.push(flag('evidence_coverage', 'needs_caution',
      `فقط ${Math.round(input.evidence_coverage * 100)}٪ آزمون‌ها مُهر نمایش دارند — بخشی از زمان‌ها قابل راستی‌آزمایی نیست`));
  }
  // R9 — پاسخ‌های زیر کف RT
  if (input.rt_floor_violations > thresholds.rt_floor_violations_max) {
    flags.push(flag('rt_floor', 'needs_caution',
      `${input.rt_floor_violations} پاسخ زیر کف اعتبار RT بود — از سنجه‌های زمانی حذف شده‌اند`));
  }

  let verdict: QualityVerdict = 'explainable';
  for (const f of flags) {
    if (f.verdict === 'incomplete_or_invalid') { verdict = 'incomplete_or_invalid'; break; }
    if (f.verdict === 'needs_caution') verdict = 'needs_caution';
  }
  // پرچم ok پایه — گزارش شفاف حتی بدون مشکل
  if (flags.length === 0) {
    flags.push(flag('all_clear', 'ok', 'هیچ نشانهٔ ناهم‌خوانی در ثبت/زمان/لمس دیده نشد'));
  }

  return { verdict, flags, rules_version: QUALITY_RULES_VERSION, thresholds: { ...thresholds } };
}

/** سریالی‌سازی برای quality_json — کامل و خودتوضیح */
export function serializeQuality(q: SessionQuality): string {
  return JSON.stringify(q);
}

/**
 * سرویس نیازهای ویژه — توابع خالص منطق محض (بدون I/O)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// فاز ۷ — محاسبات قطعی و بی‌side-effect گرید/توجه (§12 + §15)
// هیچ I/O ندارد — ورودی ردیف‌های خام از service می‌آید؛ خروجی شکل پاسخ نهایی

import { SPECIAL_NEED_SEVERITIES, SPECIAL_NEED_TYPES } from '@core/shared';
import type { SpecialNeedSeverity, SpecialNeedType } from '@core/shared';
import type {
  AttentionInput,
  AttentionReason,
  AttentionStudent,
  GridCell,
  SchoolGridRow
} from './types';
import { ATTENTION_REASONS } from './types';

// ───────────── لیبل‌های فارسی (قرارداد یکسان با فرانت) ─────────────

export const ATTENTION_REASON_LABELS_FA: Record<AttentionReason, string> = {
  overdue_followup: 'پیگیری سررسید گذشته',
  long_open_followup: 'پیگیری باز بیش از ۳۰ روز',
  awaiting_assessment: 'در انتظار ارزیابی',
  no_recent_session: 'بیش از ۳۰ روز جلسه ندارد'
};

export const SPECIAL_NEED_TYPE_LABELS_FA: Record<SpecialNeedType, string> = {
  dyslexia: 'نارساخوانی (دیس‌لکسی)',
  dysgraphia: 'نارسانویسی (دیس‌گرافی)',
  dyscalculia: 'نارساریاضی (دیس‌کالکولی)',
  adhd: 'بیش‌فعالی و کم‌توجهی',
  autism: 'طیف اتیسم',
  speech_language: 'اختلال زبانی و بیان',
  anxiety: 'اضطراب',
  motor_coordination: 'اختلال هماهنگی حرکتی',
  slow_learner: 'دیرآموز',
  other: 'سایر'
};

export const SPECIAL_NEED_SEVERITY_LABELS_FA: Record<SpecialNeedSeverity, string> = {
  mild: 'خفیف',
  moderate: 'متوسط',
  severe: 'شدید'
};

// ───────────── derivation «نیاز به توجه دارد» (§12/§15.3) ─────────────

const DAY_MS = 86_400_000;

/** مرز «پیگیری باز طولانی» — ۳۰ روز */
export const LONG_OPEN_FOLLOWUP_DAYS = 30;
/** مرز «جلسهٔ اخیر ندارد» — ۳۰ روز */
export const RECENT_SESSION_DAYS = 30;

/**
 * قواعد قطعی (مستند در REMAKE-PLAN فاز ۷):
 * ۱) overdue_followup — پیگیری باز با due_at گذشته
 * ۲) long_open_followup — پیگیری باز با created_at قدیمی‌تر از ۳۰ روز
 * ۳) awaiting_assessment — case_status = awaiting_assessment
 * ۴) no_recent_session — در خدمت فعال (پذیرش‌شده یا سابقهٔ جلسه) ولی
 * بیش از ۳۰ روز جلسهٔ برگزارشده ندارد و نوبت
 * آینده‌ای هم ثبت نشده (بی‌سرپرستی واقعی جلسه)
 */
export function deriveAttentionReasons(input: AttentionInput, nowIso: string): AttentionReason[] {
  const now = Date.parse(nowIso);
  const computed: AttentionReason[] = [];

  // ۱) پیگیری سررسیدگذشته — due_at نه‌NULL و قبل از now
  const hasOverdue = input.openFollowups.some((f) => f.dueAt !== null && Date.parse(f.dueAt) < now);
  if (hasOverdue) computed.push('overdue_followup');

  // ۲) پیگیری باز بیش از ۳۰ روز
  const longOpenCutoff = now - LONG_OPEN_FOLLOWUP_DAYS * DAY_MS;
  const hasLongOpen = input.openFollowups.some((f) => Date.parse(f.createdAt) < longOpenCutoff);
  if (hasLongOpen) computed.push('long_open_followup');

  // ۳) در انتظار ارزیابی
  if (input.caseStatus === 'awaiting_assessment') computed.push('awaiting_assessment');

  // ۴) بیش از ۳۰ روز جلسه ندارد — فقط برای در-خدمت (پذیرش‌شده یا سابقهٔ جلسه)
  const inService = input.waitStatus === 'admitted' || input.lastSessionAt !== null;
  if (inService) {
    const cutoff = now - RECENT_SESSION_DAYS * DAY_MS;
    const stale = input.lastSessionAt === null || Date.parse(input.lastSessionAt) < cutoff;
    const upcoming = input.nextSessionAt !== null;
    if (stale && !upcoming) computed.push('no_recent_session');
  }

  // ترتیب ثابت طبق ATTENTION_REASONS — خروجی قطعی برای تست و رندر
  return ATTENTION_REASONS.filter((r) => computed.includes(r));
}

/** sort دانش‌آموزان توجه: بیشترین دلیل → نوع → نام خانوادگی → نام → id (قطعی) */
export function sortAttentionStudents(students: readonly AttentionStudent[]): AttentionStudent[] {
  return [...students].sort((a, b) => {
    if (b.reasons.length !== a.reasons.length) return b.reasons.length - a.reasons.length;
    const ta = a.specialNeedType ?? '';
    const tb = b.specialNeedType ?? '';
    if (ta !== tb) return ta < tb ? -1 : 1;
    const la = `${a.lastName} ${a.firstName}`;
    const lb = `${b.lastName} ${b.firstName}`;
    if (la !== lb) return la < lb ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

// ───────────── سلول‌ها و گرید ─────────────

export function emptyCell(): GridCell {
  return { total: 0, special: 0, attention: 0, bySeverity: {} };
}

export function addTotal(cell: GridCell, n = 1): void {
  cell.total += n;
}

export function addSpecial(cell: GridCell, severity: SpecialNeedSeverity | null): void {
  cell.special += 1;
  if (severity) cell.bySeverity[severity] = (cell.bySeverity[severity] ?? 0) + 1;
}

export function addAttention(cell: GridCell, n = 1): void {
  cell.attention += n;
}

/** جمع دو سلول — برای totals هر ردیف و overall */
export function mergeCells(a: GridCell, b: GridCell): GridCell {
  const bySeverity: Partial<Record<SpecialNeedSeverity, number>> = {};
  for (const s of SPECIAL_NEED_SEVERITIES) {
    const v = (a.bySeverity[s] ?? 0) + (b.bySeverity[s] ?? 0);
    if (v > 0) bySeverity[s] = v;
  }
  return { total: a.total + b.total, special: a.special + b.special, attention: a.attention + b.attention, bySeverity };
}

/** افزودن یک دانش‌آموز ویژه به byType (کمکی service) */
export function bumpByType(
  byType: Partial<Record<SpecialNeedType, number>>,
  type: SpecialNeedType | null
): Partial<Record<SpecialNeedType, number>> {
  if (!type) return byType;
  const next = { ...byType };
  next[type] = (next[type] ?? 0) + 1;
  return next;
}

/**
 * ترتیب پایدار پایه‌ها: اول پایه‌های شناخته‌شدهٔ STUDENT_GRADES (به ترتیب خودشان)،
 * بعد پایه‌های ناشناخته بر اساس الفبا — رندر جدول بین reload ها ثابت می‌ماند.
 */
export function sortGrades(present: Iterable<string>, knownOrder: readonly string[]): string[] {
  const seen = new Set(present);
  const known = knownOrder.filter((g) => seen.has(g));
  const unknown = [...seen].filter((g) => !knownOrder.includes(g)).sort((a, b) => (a < b ? -1 : 1));
  return [...known, ...unknown];
}

// ───────────── متریک‌های سوییچ‌شدنی heatmap (محاسبه سمت کلاینت — اینجا برای تست) ─────────────

/** درصد: special از total — «نسبت شناسایی» */
export function specialPercentage(cell: GridCell): number {
  if (cell.total === 0) return 0;
  return Math.round((cell.special / cell.total) * 100);
}

/** نسبت توجه: attention از special — «هر چند شناسایی‌شده، یک مورد توجه» (×۱۰ برای رزولوشن) */
export function attentionRatio(cell: GridCell): number {
  if (cell.special === 0) return 0;
  return Math.round((cell.attention / cell.special) * 10);
}

/** سطح شدت رنگ سلول ۰..۴ — برای کلاس CSS */
export function cellIntensity(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  const level = Math.ceil((value / max) * 4);
  return Math.min(4, Math.max(1, level));
}

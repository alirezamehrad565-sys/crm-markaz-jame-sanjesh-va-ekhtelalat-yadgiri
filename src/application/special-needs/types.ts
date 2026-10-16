/**
 * سرویس نیازهای ویژه — تایپ‌های ماژول
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// فاز ۷ — نیازهای ویژه + وضعیت همکاری مدرسه (§12 + §15)
// ماژول فقط-خواندنی (Projection + derivation) — مالک هیچ جدولی نیست (§4)
// write نیاز ویژه در student-profile است (مالک جدول students)

import type { AuthContext } from '@core/shared';
import type { DbClient } from '@core/db';
import type { Logger } from '@core/logger';
import type { SpecialNeedSeverity, SpecialNeedType, StudentCaseStatus } from '@core/shared';

// ───────────── «نیاز به توجه دارد» — derivation قطعی (§12/§15.3) ─────────────

/** قواعد توجه — هر دلیل یک قاعدهٔ مستقل و تست‌پذیر */
export const ATTENTION_REASONS = [
  'overdue_followup',
  'long_open_followup',
  'awaiting_assessment',
  'no_recent_session'
] as const;

export type AttentionReason = (typeof ATTENTION_REASONS)[number];

/** پیگیری باز — وضعیت‌های open/in_progress (هم‌قرارداد با FOLLOWUP_OPEN_STATUSES) */
export interface OpenFollowUpRef {
  id: string;
  dueAt: string | null;
  createdAt: string;
}

/** ورودی خام یک دانش‌آموز برای derivation توجه — همه از کوئری‌های فقط-خواندنی */
export interface AttentionInput {
  caseStatus: StudentCaseStatus | null;
  waitStatus: 'waiting' | 'admitted' | null;
  /** آخرین جلسهٔ برگزارشده (start_at <= now، غیرلغوشده) — null = هیچ */
  lastSessionAt: string | null;
  /** نزدیک‌ترین نوبت آیندهٔ scheduled — null = هیچ */
  nextSessionAt: string | null;
  openFollowups: readonly OpenFollowUpRef[];
}

/** دانش‌آموز نیازمند توجه — خروجی نهایی برای فرانت */
export interface AttentionStudent {
  id: string;
  firstName: string;
  lastName: string;
  grade: string | null;
  schoolId: string | null;
  schoolName: string | null;
  classId: string | null;
  className: string | null;
  specialNeedType: SpecialNeedType | null;
  specialNeedSeverity: SpecialNeedSeverity | null;
  caseStatus: StudentCaseStatus | null;
  reasons: AttentionReason[];
}

// ───────────── گرید مدرسه×پایه (heatmap §12) ─────────────

/** یک سلول گرید — شمارش‌های یک مدرسه در یک پایه */
export interface GridCell {
  /** کل دانش‌آموزان فعال این مدرسه/پایه (مخرج درصد) */
  total: number;
  /** شناسایی‌شده با نیاز ویژه */
  special: number;
  /** نیازمند توجه (derivation) */
  attention: number;
  /** تفکیک شدت — کلیدهای بدون مقدار حذف می‌شوند */
  bySeverity: Partial<Record<SpecialNeedSeverity, number>>;
}

/** یک ردیف گرید = یک مدرسه */
export interface SchoolGridRow {
  schoolId: string | null;
  schoolName: string | null;
  kind: string | null;
  /** کلید پایه → سلول؛ فقط پایه‌های دارای دانش‌آموز فعال */
  cells: Record<string, GridCell>;
  totals: GridCell;
}

/** خروجی گرید — دادهٔ خام کافی برای همهٔ متریک‌های سوییچ‌شدنی سمت کلاینت */
export interface SpecialNeedsGrid {
  generatedAt: string;
  /** پایه‌های حاضر در گرید — ترتیب نزولی شمارش برای پایداری رندر */
  grades: string[];
  schools: SchoolGridRow[];
  overall: GridCell & { byType: Partial<Record<SpecialNeedType, number>> };
  /** فهرست «نیاز به توجه دارد» — مرتب: بیشترین دلیل، بعد نام */
  attention: AttentionStudent[];
}

/** فیلترهای گرید — هم‌تراز REMAKE-PLAN (stage در این اپ وجود ندارد — grade پوشش می‌دهد) */
export interface GridFilters {
  schoolId?: string;
  grade?: string;
  severity?: SpecialNeedSeverity;
}

// ───────────── وضعیت همکاری مدرسه (§15.2 + §15.3) ─────────────

export interface SchoolOverview {
  school: { id: string; name: string; kind: string; active: boolean };
  metrics: {
    /** دانش‌آموزان فعال */
    studentsActive: number;
    /** پذیرش‌شده (پروجکشن از waitlist) */
    admitted: number;
    /** منتظر دریافت خدمت */
    waiting: number;
    /** کلاس‌های فعال */
    classesActive: number;
    /** کلاس‌های فعال با معلم تعریف‌شده — پایهٔ KPI همکاری */
    classesWithTeacher: number;
    /** کلاس‌هایی که معلمشان بات را وصل کرده (class_bot_links.status = 'linked') */
    classesBotLinked: number;
    /** جلسات برگزارشده در ۳۰ روز گذشته (غیرلغوشده، start_at <= now) */
    sessionsLast30: number;
    /** جلسات ۳۰ روز قبل از آن — برای سنجش روند */
    sessionsPrev30: number;
    /** دانش‌آموزان فعال با نیاز ویژهٔ شناسایی‌شده */
    specialNeeds: number;
    /** نیازمندان توجه (همان derivation گرید) */
    attention: number;
  };
  attention: AttentionStudent[];
}

export interface SpecialNeedsDeps {
  db: DbClient;
  logger: Logger;
}

export interface SpecialNeedsService {
  grid(filters: GridFilters, actor: AuthContext): Promise<SpecialNeedsGrid>;
  schoolOverview(schoolId: string, actor: AuthContext): Promise<SchoolOverview>;
}

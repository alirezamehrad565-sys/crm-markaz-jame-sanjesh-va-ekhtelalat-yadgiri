/**
 * ماژول پیگیری‌ها — تایپ‌های ماژول
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// تایپ‌های ماژول پیگیری (فاز ۳) — مالک WRITE جدول followups
// هوک‌ها (جلسه→پیگیری، لیست انتظار→پیگیری) از createWithinTx در همان تراکنش
// فراخواننده کار می‌کنند — همان الگوی createWithinTx در appointment-core.

import type { AuthContext, FollowUp, FollowUpGroup, FollowUpStatus } from '@core/shared';
import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';

/** ورودی ساخت پیگیری — مستقیم یا از هوک‌های خودکار */
export interface NewFollowUpInput {
  entityType: string;
  entityId: string;
  studentId?: string | null;
  title: string;
  /** مسئول پیگیری — هوک‌ها بازیگر عملیات را می‌گذارند (قابل جابه‌جایی بعداً با PATCH) */
  assigneeId: string;
  /** ISO UTC؛ undefined = مهلت پیش‌فرض (+FOLLOWUP_DEFAULT_DUE_DAYS)؛ null = بدون مهلت */
  dueAt?: string | null;
}

/** ورودی ویرایش — وضعیت/مسئول/مهلت (§13) */
export interface UpdateFollowUpInput {
  status?: FollowUpStatus;
  assigneeId?: string;
  /** null = حذف مهلت */
  dueAt?: string | null;
}

export interface FollowUpListFilters {
  /** فقط پیگیری‌های روی میز من (assignee = کاربر جاری) */
  mine?: boolean;
  /** — فیلتر مسئول صریح (بات: «پیگیری‌های من» با بازیگر بات، نه actor) */
  assigneeId?: string;
  /** گروه‌بندی §13.4 — پیش‌فرض open (همهٔ بازها) */
  group?: FollowUpGroup | 'all';
  /** فیلتر موجودیت — برای صفحهٔ جزئیات/هوک‌تست */
  entityType?: string;
  entityId?: string;
  studentId?: string;
}

export interface FollowUpDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
}

export interface FollowUpsService {
  list(filters: FollowUpListFilters, actor: AuthContext): Promise<FollowUp[]>;
  getById(id: string): Promise<FollowUp | null>;
  create(input: NewFollowUpInput, actor: AuthContext): Promise<FollowUp>;
  /**
   * فاز ۳ — ویرایش وضعیت/مسئول/مهلت.
   * RBAC: مدیر/منشی یا خودِ مسئول پیگیری (درمانگرِ غیرمسئول ۴۰۳ — §13.2).
   * ترنزیشن نامعتبر → 409؛ رسیدن به done → action «followup.completed».
   */
  update(id: string, patch: UpdateFollowUpInput, actor: AuthContext): Promise<FollowUp>;
  /**
   * ساخت داخل تراکنشِ فراخواننده (هوک جلسه/لیست انتظار):
   * INSERT + audit در همان tx؛ پاسخ در حافظه ساخته می‌شود — بدون read-back
   * (خواندن داخل تراکنش مقدار کهنه می‌دهد — درس فاز W).
   */
  createWithinTx(tx: DbClient, input: NewFollowUpInput, actor: AuthContext): Promise<FollowUp>;
}

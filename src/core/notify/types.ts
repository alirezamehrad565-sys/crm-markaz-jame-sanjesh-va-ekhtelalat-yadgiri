/**
 * هستهٔ اعلان و کلاینت بات بله — تایپ‌های ماژول
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// تایپ‌های ماژول اعلان — کانال‌های ارسال و نتایج
// کانال‌ها با setter injection ثبت می‌شوند (همان الگوی appointment-core/conflict-engine)
// تا هسته notify به هیچ پیام‌رسان خاصی وابسته نباشد.

import type {
  NotificationChannel,
  NotificationRecord,
  NotificationStatus,
  NotificationTemplateId,
  TemplateVars
} from '@core/shared';

/** — دکمه inline (کیبورد زیر پیام بله) */
export interface InlineButton {
  text: string;
  callbackData: string;
}

/** پیام خروجی آماده ارسال */
export interface OutboundMessage {
  to: string;      // chat_id / مقصد
  text: string;    // متن رندرشده نهایی
  /** — ردیف‌های دکمه inline؛ اختیاری (فقط کانال بله از آن استفاده می‌کند) */
  buttons?: InlineButton[][];
  /** — کیبورد ثابت ناوبری (ردیف‌های دکمهٔ متنی پایین چت)؛ اختیاری.
   * اگر buttons هم باشد، inline اولویت دارد (هر دو هم‌زمان در Bot API معتبر نیستند). */
  keyboard?: string[][];
}

/** نتیجه ارسال یک پیام از سمت کانال */
export interface SendResult {
  ok: boolean;
  externalId?: string; // شناسه پیام در سمت سرویس‌دهنده (مثلاً message_id بله)
  error?: string;
}

/**
 * آداپتور هر سرویس پیام‌رسانی.
 * قرارداد: send هرگز throw نمی‌کند — خطا در SendResult برگردانده می‌شود.
 */
export interface NotifyChannel {
  readonly name: NotificationChannel;
  send(message: OutboundMessage): Promise<SendResult>;
}

export interface EnqueueInput {
  channel: NotificationChannel;
  template: NotificationTemplateId;
  payload: TemplateVars;
  recipient?: string | null;
  studentId?: string | null;
  appointmentId?: string | null;
  staffId?: string | null;
  /** idempotency — اگر تکراری باشد enqueue رکورد جدید نمی‌سازد */
  dedupKey?: string | null;
  /**
   * — ساعت ارسال (ISO UTC)؛ NULL/ناموجود = فوری.
   * فقط اعلان‌های «ثبت نوبت جدید» تا ساعت تنظیم‌شده (notify_batch_hour) پیش‌نویس می‌مانند.
   */
  sendAt?: string | null;
}

export interface NotifyListFilters {
  status?: NotificationStatus;
  studentId?: string;
  appointmentId?: string;
  limit?: number;
}

export type { NotificationRecord, NotificationStatus, NotificationTemplateId, TemplateVars };

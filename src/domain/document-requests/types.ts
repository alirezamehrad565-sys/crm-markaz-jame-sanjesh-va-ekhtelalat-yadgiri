/**
 * ماژول درخواست مدارک از خانواده/معلم با بله — قراردادها (m151 — T2 · بازطراحی m166)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// قرارداد دامنه — فایل‌های پرونده که خانواده یا معلم با بله می‌فرستد
// m166: فرم ساخت‌یافتهٔ قالب‌ها → توضیح آزاد + تگ‌های روشن؛ گیرندهٔ چندگانه (خانواده و/یا معلم)

import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { ObjectStore } from '@core/storage';
import type { MediaFetcher, NotifyService } from '@core/notify';
import type { SettingsService } from '@app/settings';

/**
 * تگ پیش‌فرض درخواست مدارک — کلیدهای روشن و به‌زبان درمانگر (m166).
 * تگ دلخواه = متن آزاد کوتاه (string) کنار همین کلیدها ذخیره می‌شود.
 * برچسب فارسی در pure.ts.
 */
export type DocTagKey = 'narrative' | 'dictation' | 'exam' | 'report_card' | 'homework' | 'other';

/** گیرندهٔ درخواست — خانواده و/یا معلم؛ هر دو هم‌زمان مجاز است (m166) */
export type DocRecipient = 'family' | 'teacher';

/** چرخهٔ درخواست: sent (پیام رفت) → received (اولین مدرک رسید) → closed (بسته شد) */
export type DocRequestStatus = 'sent' | 'received' | 'closed';

export type DocMediaKind = 'photo' | 'document';

/** درخواست مدارک — ثبت روی پروندهٔ دانش‌آموز */
export interface DocumentRequest {
  id: string;
  studentId: string;
  /** تگ‌های درخواست — کلید پیش‌فرض یا متن دلخواه کوتاه (در ستون templates قدیمی) */
  tags: string[];
  /** گیرنده‌های پیام — رکوردهای قدیمی m151 همیشه ['family'] */
  recipients: DocRecipient[];
  customNote: string | null;
  status: DocRequestStatus;
  sentAt: string;
  closedAt: string | null;
  dueHint: string | null;
  requestedByName: string | null;
  /** چند گفتگو پیام گرفت — صفر یعنی بدون چت متصل ثبت نشد */
  deliveredChats: number;
}

/** مدرک دریافتی از بله — فایل چسبیده به پرونده */
export interface ReceivedDoc {
  id: string;
  studentId: string;
  requestId: string | null;
  mediaKind: DocMediaKind;
  fileName: string;
  mime: string;
  size: number;
  caption: string | null;
  storedAt: string;
  chatId: string;
}

export interface NewDocumentRequestInput {
  /** تگ‌ها — کلید پیش‌فرض یا متن دلخواه (خام؛ پارس در سرویس) */
  tags: unknown;
  /** گیرنده‌ها — غایب/خالی → ['family'] (سازگاری فراخوان‌های قدیمی) */
  recipients?: unknown;
  customNote?: string | null;
  dueHint?: string | null;
}

export interface DocumentRequestDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
  /** انبار فایل — همان نمونهٔ بانک تمرین (D1 تکه‌تکه / R2) */
  storage: ObjectStore;
  /** دریافت رسانه از بله — بدون توکن بله null (پاسخ «فعال نیست») */
  mediaFetcher: MediaFetcher | null;
  /** هستهٔ صف اعلان — پیام درخواست به چت‌های گیرنده */
  notify: NotifyService;
  settings: SettingsService;
  now?: () => Date;
}

/** پاسخ بات مدارک — همان شکل BotReply جریان‌های موجود (بدون دکمه) */
export interface DocBotReply {
  text: string;
  buttons: null;
}

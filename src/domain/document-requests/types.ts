/**
 * ماژول درخواست مدارک از خانواده با بله — قراردادها (m151 — T2)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// قرارداد دامنه — فایل‌های پرونده که خانواده با بله می‌فرستد

import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { ObjectStore } from '@core/storage';
import type { MediaFetcher, NotifyService } from '@core/notify';
import type { SettingsService } from '@app/settings';

/** قالب مدارک درخواستی — برچسب فارسی در pure.ts */
export type DocRequestTemplate = 'dictation' | 'report_card' | 'teacher_report' | 'prev_eval';

/** چرخهٔ درخواست: sent (پیام رفت) → received (اولین مدرک رسید) → closed (بسته شد) */
export type DocRequestStatus = 'sent' | 'received' | 'closed';

export type DocMediaKind = 'photo' | 'document';

/** درخواست مدارک — ثبت روی پروندهٔ دانش‌آموز */
export interface DocumentRequest {
  id: string;
  studentId: string;
  templates: DocRequestTemplate[];
  customNote: string | null;
  status: DocRequestStatus;
  sentAt: string;
  closedAt: string | null;
  dueHint: string | null;
  requestedByName: string | null;
  /** چند گفتگوی خانواده پیام گرفت — صفر یعنی بدون چت متصل ثبت نشد */
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
  templates: DocRequestTemplate[];
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
  /** هستهٔ صف اعلان — پیام درخواست به چت‌های خانواده */
  notify: NotifyService;
  settings: SettingsService;
  now?: () => Date;
}

/** پاسخ بات مدارک — همان شکل BotReply جریان‌های موجود (بدون دکمه) */
export interface DocBotReply {
  text: string;
  buttons: null;
}

import type {
  NotificationChannel,
  NotificationRecord,
  NotificationStatus,
  NotificationTemplateId,
  TemplateVars
} from '@core/shared';

export interface InlineButton {
  text: string;
  callbackData: string;
}

export interface OutboundMessage {
  to: string;      // chat_id / مقصد
  text: string;    // متن رندرشده نهایی
  buttons?: InlineButton[][];
  keyboard?: string[][];
}

export interface SendResult {
  ok: boolean;
  externalId?: string; // شناسه پیام در سمت سرویس‌دهنده (مثلاً message_id بله)
  error?: string;
}

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
  dedupKey?: string | null;
  sendAt?: string | null;
}

export interface NotifyListFilters {
  status?: NotificationStatus;
  studentId?: string;
  appointmentId?: string;
  limit?: number;
}

export type { NotificationRecord, NotificationStatus, NotificationTemplateId, TemplateVars };

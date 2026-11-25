/**
 * enqueueToMany — ۱.۲۷.۸۳ (sdt160: architecture-002 + performance-002)
 * عبارتِ «انتخاب کانال + حلقهٔ enqueue/flush» فقط یک تعریف در مخزن دارد: سه ناظر api-routing
 * و document-requests از همین helper می‌خوانند. رفت‌وبرگشت DB مستقل از تعداد گیرنده‌هاست
 * (enqueueMany: یک SELECT dedup + حداکثر یک INSERT چندردیفی) و خروجی همان رکوردهای قبلی.
 */
import type { NotifyService } from '@core/notify';
import type { NotificationTemplateId } from '@core/shared';

export interface EnqueueToManyInput {
  channel: 'bale' | 'internal';
  template: NotificationTemplateId;
  chats: string[];
  /** payload هر گیرنده — معمولاً ثابت با clinicName؛ ناظر چک‌لیست per-chat می‌سازد */
  payloadFor: (chat: string) => Record<string, unknown>;
  dedupKeyFor: (chat: string) => string;
  studentId?: string | null;
  staffId?: string | null;
  /** پیش‌فرض true — dispatchPending(50) فقط وقتی حداقل یک ردیف تازه نشسته */
  flush?: boolean;
}

export async function enqueueToMany(notify: NotifyService, input: EnqueueToManyInput): Promise<number> {
  const outcomes = await notify.enqueueMany(
    input.chats.map((chat) => ({
      channel: input.channel,
      template: input.template,
      recipient: chat,
      studentId: input.studentId ?? null,
      staffId: input.staffId ?? null,
      payload: input.payloadFor(chat),
      dedupKey: input.dedupKeyFor(chat)
    }))
  );
  const sent = outcomes.filter((o: { duplicate: boolean }) => !o.duplicate).length;
  if (sent > 0 && input.flush !== false) await notify.dispatchPending(50);
  return sent;
}

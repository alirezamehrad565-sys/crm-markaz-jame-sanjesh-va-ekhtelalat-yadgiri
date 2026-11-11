// بخش هشدارهای سرویس اعلان (ف۵ طرح ارتقا — P0-3 حداقلی): رساندن هشدار خودکار تا مدیر
// کانال رساندن همان است که دایجست روزانه با آن کار می‌کند: درگاه «بله» اگر بات تنظیم باشد،
// وگرنه درگاه داخلی (لاگ). گیرنده = چتِ همکاران نقش «manager» که بات‌لینک فعال دارند؛
// بدون هیچ گیرنده‌ای، صف‌کاری رد می‌شود و هشدار فقط در لاگ/پنل سلامت می‌ماند — صادقانه.
import type { NotifyCtx } from './context';
import type { NotifyAppService } from './service';

export function createAlertSection(ctx: NotifyCtx): Pick<NotifyAppService, 'enqueueOwnerAlert'> {
  const { deps, db, log, notify } = ctx;

  return {
    /**
     * یک پیام هشدار را برای همهٔ مدیرانِ بات‌لینک‌دار صف می‌کند — تعداد صف‌شده برمی‌گردد.
     * dedupKey روزانه از صدا زننده می‌آید (مثلاً `alert:2026-11-12`) تا اجرای تکراری کرون
     * در همان روز دوباره‌کاری نکند؛ کلید نهایی per-گسترنده است.
     */
    async enqueueOwnerAlert(text: string, dedupKey: string): Promise<number> {
      const channel: 'bale' | 'internal' = notify.getChannel('bale') ? 'bale' : 'internal';
      const chatRows = await db.query<{ chat_id: string }>(
        `SELECT sbl.chat_id
           FROM staff_bot_links sbl
           JOIN staff st ON st.id = sbl.staff_id
          WHERE sbl.status = 'linked' AND sbl.chat_id IS NOT NULL
            AND st.role = 'manager' AND st.active = 1`
      );
      if (chatRows.length === 0) {
        log.warn('alert.no_recipient', { channel, reason: 'no linked manager chat' });
        return 0;
      }
      const clinicName = await deps.settings.getClinicName();
      let enqueued = 0;
      for (const row of chatRows) {
        const outcome = await notify.enqueue({
          channel,
          template: 'generic',
          recipient: row.chat_id,
          payload: { extra: text, clinicName },
          dedupKey: `${dedupKey}:${row.chat_id}`
        });
        if (!outcome.duplicate) enqueued += 1;
      }
      log.info('alert.enqueued', { channel, recipients: chatRows.length, enqueued });
      return enqueued;
    }
  };
}

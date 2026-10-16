/**
 * هستهٔ اعلان و کلاینت بات بله — کانال اعلان داخلی (وقتی بات در دسترس نیست)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// کانال internal — ارسال «مجازی» (فقط log) برای توسعه، تست و پیام‌های درون‌سیستمی
// در production بدون توکن بله هم dispatch صف را سبز نگه می‌دارد (قابل مشاهده در log).

import type { Logger } from '@core/logger';
import type { NotifyChannel, OutboundMessage, SendResult } from './types';

export function createInternalChannel(logger: Logger): NotifyChannel {
  const log = logger.child('internal-channel');
  let counter = 0;

  return {
    name: 'internal',

    async send(message: OutboundMessage): Promise<SendResult> {
      counter += 1;
      log.info('message.delivered', { to: message.to, chars: message.text.length });
      return { ok: true, externalId: `internal-${Date.now()}-${counter}` };
    }
  };
}

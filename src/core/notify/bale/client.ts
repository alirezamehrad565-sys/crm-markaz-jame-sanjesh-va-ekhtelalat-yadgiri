/**
 * هستهٔ اعلان و کلاینت بات بله — کلاینت HTTP/API
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// آداپتور کانال بله — Bot API رسمی (tapi.bale.ai)
// قوانین:
// * fetch تزریقی است (قابل تست بدون شبکه)
// * send هرگز throw نمی‌کند — خطا در SendResult برمی‌گردد (قرارداد NotifyChannel)
// * token در URL قرار می‌گیرد و در logها هرگز نوشته نمی‌شود

import type { NotifyChannel, OutboundMessage, SendResult } from '../types';

export interface BaleClientOptions {
  token: string;
  /** برای تست یا تغییر دامنه API */
  apiBase?: string;
  fetchImpl?: typeof fetch;
}

interface BaleApiResponse {
  ok?: boolean;
  result?: { message_id?: number | string };
  description?: string;
  error_code?: number;
}

export function createBaleChannel(options: BaleClientOptions): NotifyChannel {
  const base = (options.apiBase ?? 'https://tapi.bale.ai').replace(/\/+$/, '');
  const doFetch = options.fetchImpl ?? fetch;
  const url = `${base}/bot${options.token}/sendMessage`;

  return {
    name: 'bale',

    async send(message: OutboundMessage): Promise<SendResult> {
      try {
        const payload: Record<string, unknown> = {
          chat_id: message.to,
          text: message.text
        };
        // دکمه‌های inline (لغو نوبت توسط همکار)
        if (message.buttons && message.buttons.length > 0) {
          payload.reply_markup = {
            inline_keyboard: message.buttons.map((row) =>
              row.map((b) => ({ text: b.text, callback_data: b.callbackData }))
            )
          };
        } else if (message.keyboard && message.keyboard.length > 0) {
          // کیبورد ثابت ناوبری (دکمه‌های متنی پایین چت — همیشه نمایان)
          payload.reply_markup = {
            keyboard: message.keyboard.map((row) => row.map((text) => ({ text }))),
            resize_keyboard: true
          };
        }

        const res = await doFetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const body = (await res.json().catch(() => ({}))) as BaleApiResponse;

        if (!res.ok || body.ok === false) {
          return {
            ok: false,
            error: `BALE_${res.status}: ${body.description ?? 'unknown error'}`
          };
        }

        const messageId = body.result?.message_id;
        return {
          ok: true,
          externalId: messageId != null ? String(messageId) : undefined
        };
      } catch (err) {
        // خطای شبکه/DNS و… — بدون لو دادن token
        return {
          ok: false,
          error: `BALE_NETWORK: ${err instanceof Error ? err.message : 'unknown'}`
        };
      }
    }
  };
}

import type { NotifyChannel, OutboundMessage, SendResult } from '../types';

export interface BaleClientOptions {
  token: string;
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
        if (message.buttons && message.buttons.length > 0) {
          payload.reply_markup = {
            inline_keyboard: message.buttons.map((row) =>
              row.map((b) => ({ text: b.text, callback_data: b.callbackData }))
            )
          };
        } else if (message.keyboard && message.keyboard.length > 0) {
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
        return {
          ok: false,
          error: `BALE_NETWORK: ${err instanceof Error ? err.message : 'unknown'}`
        };
      }
    }
  };
}

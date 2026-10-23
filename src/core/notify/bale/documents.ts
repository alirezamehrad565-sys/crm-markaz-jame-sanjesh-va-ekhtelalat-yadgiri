// ─── ارسال فایل (sendDocument) به بله — m180 ───
// مکانیک: فایل پشتیبان با multipart/form-data به متد sendDocument ربات بله
// فرستاده می‌شود (همان Bot API سازگار با تلگرام که sendMessage از آن استفاده می‌کند).
// سقف حجم فایل در بله حدود ۵۰ مگابایت است — سقف امن‌تر سمت ما در سرویس پشتیبان تعیین می‌شود.

import type { SendResult } from '../types';

export interface SendDocumentOptions {
  token: string;
  chatId: string;
  filename: string;
  bytes: Uint8Array;
  mime?: string;
  caption?: string;
  apiBase?: string;
  fetchImpl?: typeof fetch;
}

interface BaleApiResponse {
  ok?: boolean;
  result?: { message_id?: number | string };
  description?: string;
  error_code?: number;
}

export async function sendBaleDocument(options: SendDocumentOptions): Promise<SendResult> {
  const base = (options.apiBase ?? 'https://tapi.bale.ai').replace(/\/+$/, '');
  const doFetch = options.fetchImpl ?? fetch;
  const url = `${base}/bot${options.token}/sendDocument`;

  try {
    const form = new FormData();
    form.append('chat_id', options.chatId);
    if (options.caption) form.append('caption', options.caption);
    form.append(
      'document',
      new File([options.bytes.slice().buffer as ArrayBuffer], options.filename, {
        type: options.mime ?? 'application/octet-stream'
      })
    );

    const res = await doFetch(url, { method: 'POST', body: form });
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

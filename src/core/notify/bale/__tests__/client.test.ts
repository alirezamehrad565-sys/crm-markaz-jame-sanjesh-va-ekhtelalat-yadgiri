import { describe, expect, it } from 'vitest';
import { createBaleChannel } from '../client';

function fetchCapture(status = 200, body: unknown = { ok: true, result: { message_id: 12 } }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { impl, calls };
}

describe('createBaleChannel (pure با fetch تزریقی)', () => {
  it('C1: ارسال ساده — chat_id و text در بدنه، بدون reply_markup', async () => {
    const { impl, calls } = fetchCapture();
    const ch = createBaleChannel({ token: 'TOK', fetchImpl: impl });

    const res = await ch.send({ to: '555', text: 'سلام' });

    expect(res.ok).toBe(true);
    expect(res.externalId).toBe('12');
    expect(calls[0].url).toBe('https://tapi.bale.ai/botTOK/sendMessage');
    const payload = JSON.parse(String(calls[0].init.body));
    expect(payload.chat_id).toBe('555');
    expect(payload.text).toBe('سلام');
    expect(payload.reply_markup).toBeUndefined();
  });

  it('C2: با دکمه‌های inline — نگاشت به reply_markup.inline_keyboard با callback_data', async () => {
    const { impl, calls } = fetchCapture();
    const ch = createBaleChannel({ token: 'TOK', fetchImpl: impl });

    await ch.send({
      to: '555',
      text: 'لغو نوبت؟',
      buttons: [
        [{ text: 'بله، لغو شود', callbackData: 'cancel:abc-123' }]
      ]
    });

    const payload = JSON.parse(String(calls[0].init.body));
    expect(payload.reply_markup).toEqual({
      inline_keyboard: [[{ text: 'بله، لغو شود', callback_data: 'cancel:abc-123' }]]
    });
  });

  it('C3: پاسخ خطای API → SendResult.ok=false با توضیح، بدون throw', async () => {
    const { impl } = fetchCapture(400, { ok: false, description: 'chat not found' });
    const ch = createBaleChannel({ token: 'TOK', fetchImpl: impl });

    const res = await ch.send({ to: 'x', text: 'ی' });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('BALE_400');
    expect(res.error).toContain('chat not found');
  });
});

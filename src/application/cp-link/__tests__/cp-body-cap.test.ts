/**
 * گیت CP-5 — سقف بدنهٔ پاسخ پیش از parse (طرح ارتقا §۳-۵ سطر «پاسخ عظیم»)
 * پاسخ عظیم = حکم ماتریس خرابی: warn و دورهٔ بعد؛ isolate هرگز نمی‌بلعد.
 */
import { describe, it, expect } from 'vitest';
import {
  CP_RESPONSE_BODY_MAX_BYTES,
  CP_FILE_MAX_BYTES,
  CpBodyTooLargeError,
  readJsonCapped,
  readTextCapped,
  readBytesCapped
} from '../body';

function streamedRes(chunks: string[], headers: Record<string, string> = {}): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    }
  });
  return new Response(stream, { status: 200, headers });
}

describe('CP-5 — readJsonCapped: Content-Length صادق', () => {
  it('بدنهٔ عظیمِ اعلام‌شده حتی یک بایت هم خوانده نمی‌شود', async () => {
    const big = 'x'.repeat(CP_RESPONSE_BODY_MAX_BYTES + 1);
    const res = new Response('{"huge":true}', {
      status: 200,
      headers: { 'content-length': String(big.length) }
    });
    await expect(readJsonCapped(res)).rejects.toThrow(CpBodyTooLargeError);
  });

  it('خطا با receivedBytes=null و حد درست می‌آید (مسیر اعلام‌شده)', async () => {
    const res = new Response('{}', {
      status: 200,
      headers: { 'content-length': String(CP_RESPONSE_BODY_MAX_BYTES + 10) }
    });
    const err = await readJsonCapped(res).catch((e) => e);
    expect(err).toBeInstanceOf(CpBodyTooLargeError);
    expect((err as CpBodyTooLargeError).limitBytes).toBe(CP_RESPONSE_BODY_MAX_BYTES);
    expect((err as CpBodyTooLargeError).receivedBytes).toBeNull();
  });
});

describe('CP-5 — readJsonCapped: CP بی‌سر/دروغگو (خواندن جریانی)', () => {
  it('جریانِ تکه‌تکه زیر سقف کامل و درست parse می‌شود — فارسی سالم', async () => {
    const payload = { data: { server_time: '2026-11-11T08:30:00.000Z', items: [{ id: 'cp-an-1', title: 'اعلان — فارس/سالم', body: 'متنی طولانی' }] } };
    const text = JSON.stringify(payload);
    // سه تکهٔ ناهم‌مرز — UTF-8 نباید لُختی بخورد
    const a = text.slice(0, 40), b = text.slice(40, 90), c = text.slice(90);
    const res = streamedRes([a, b, c]); // بدون content-length
    const parsed = (await readJsonCapped(res)) as typeof payload;
    expect(parsed.data.items[0].title).toBe('اعلان — فارس/سالم');
  });

  it('جریانِ بدون سرِ بالای سقف نیمه‌راه بریده می‌شود — receivedBytes شمارندهٔ واقعی', async () => {
    const big = 'y'.repeat(CP_RESPONSE_BODY_MAX_BYTES + 100);
    const res = streamedRes([big.slice(0, 500_000), big.slice(500_000)]);
    const err = await readJsonCapped(res).catch((e) => e);
    expect(err).toBeInstanceOf(CpBodyTooLargeError);
    expect((err as CpBodyTooLargeError).receivedBytes).toBeGreaterThan(CP_RESPONSE_BODY_MAX_BYTES);
    expect((err as CpBodyTooLargeError).limitBytes).toBe(CP_RESPONSE_BODY_MAX_BYTES);
  });
});

describe('CP-5 — خواندن‌های دیگر', () => {
  it('readTextCapped سرِ بدنهٔ خطا را می‌دهد و از سقف می‌گذرد', async () => {
    const res = new Response('error-body-head|' + 'z'.repeat(400), { status: 502 });
    const text = await readTextCapped(res);
    expect(text.startsWith('error-body-head|')).toBe(true);
  });

  it('بدنهٔ بی‌جسم (204) = رشته/شیء خالی — نه استثنا', async () => {
    const res = new Response(null, { status: 204 });
    await expect(readTextCapped(res)).resolves.toBe('');
  });

  it('readBytesCapped فایل سالم را کامل می‌دهد — هم‌قرارداد arrayBuffer', async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
    const res = new Response(bytes.slice(), { status: 200, headers: { 'content-type': 'application/pdf' } });
    const buf = await readBytesCapped(res);
    expect(new Uint8Array(buf)).toEqual(bytes);
  });

  it('فایلِ اعلام‌شدهٔ بالای سقف فایل (۴۱MB) رد می‌شود — سقف بازسازی CP ۴۰MB است', async () => {
    const res = new Response(new Uint8Array(10), {
      status: 200,
      headers: { 'content-length': String(CP_FILE_MAX_BYTES + 1) }
    });
    await expect(readBytesCapped(res)).rejects.toThrow(CpBodyTooLargeError);
  });
});

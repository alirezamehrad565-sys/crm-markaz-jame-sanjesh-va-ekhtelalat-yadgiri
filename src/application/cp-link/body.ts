/**
 * CP-5 (طرح ارتقای بک‌اند §۳-۵ سطر «پاسخ عظیم» + §۴ آیتم ۲۴) — سقف بدنهٔ پاسخ پیش از parse
 * روی همهٔ pullهای CP و همهٔ خواندن‌های بدنهٔ خطا. تا ۱.۲۵.۶۷ هر `res.json()` سمت CP
 * بی‌سقف بود: یک CP خراب/درگیرشده می‌توانست بدنهٔ چندصدمگابایتی بفرستد و isolate نود را
 * در حلقهٔ ۱۵دقیقه‌ای بلعید — همهٔ جریان‌های HTTP از نود آغاز می‌شوند، پس سقف بدنه
 * تنها سپر سمت نود است (STRIDE §۳-۱۳ سطر DoS).
 *
 * سقف‌ها (بودجهٔ حجم §۳-۱۵):
 *  • پاسخ JSON pullها ≤ ۲MB — بودجهٔ سند: pull برگزیده‌ها ≈ ≤۱.۳MB (۱۰۰ × ≤۱۲KB)
 *  • فایل لحظه‌نیاز ≤ ۴۱MB — CP با سقف بازسازی خودش (MAX_CHUNKS=۴۰ تکه × ۱MB —
 *    cp-repo content/service.ts:240 و MAX_EXERCISE_UPLOAD_CHUNK_BYTES=۱MB نود) هرگز
 *    بیش از ۴۰MB سرو نمی‌کند؛ گیت ۴۱MB فقط بدنهٔ خراب را دور می‌ریزد، سالم را نمی‌بندد.
 *
 * اجرا: اول Content-Length (اگر دروغ گفت یا نبود) خواندن جریانی با شمارندهٔ بایت —
 * عبور از سقف = قطع خواندن و خطای CpBodyTooLargeError؛ هیچ‌وقت کل بدنه در حافظه جمع نمی‌شود.
 */

/** سقف پاسخ JSON همهٔ درگاه‌های pull/push CP — ۲MB */
export const CP_RESPONSE_BODY_MAX_BYTES = 2_000_000;
/** سقف فایل لحظه‌نیاز — ۴۱MB (سقف بازسازی CP: ۴۰ تکه × ۱MB) */
export const CP_FILE_MAX_BYTES = 41 * 1024 * 1024;

/** عبور بدنه از سقف — هم‌قرارداد «خطا = warn و دورهٔ بعد»، هرگز کرش چرخهٔ سینک */
export class CpBodyTooLargeError extends Error {
  readonly limitBytes: number;
  /** بایت خوانده‌شده تا لحظهٔ قطع — اگر Content-Length از قبل گویا بود null */
  readonly receivedBytes: number | null;

  constructor(limitBytes: number, receivedBytes: number | null) {
    super(`cp_body_too_large: limit=${limitBytes} received=${receivedBytes ?? 'unknown'}`);
    this.name = 'CpBodyTooLargeError';
    this.limitBytes = limitBytes;
    this.receivedBytes = receivedBytes;
  }
}

/** خواندن جریانی بدنه با سقف بایت — بدون Content-Length هم امن است */
async function readBodyCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  // ۱) اعتراف صادق CP — سقف با Content-Length زودتر بریده می‌شود (بدون خواندن)
  const declared = res.headers.get('content-length');
  if (declared) {
    const n = Number(declared);
    if (Number.isFinite(n) && n > maxBytes) {
      // بدنهٔ عظیم اعلام‌شده — حتی یک بایت هم نمی‌خوانیم
      try { await res.body?.cancel(); } catch { /* قبلاً بسته شده */ }
      throw new CpBodyTooLargeError(maxBytes, null);
    }
  }

  // ۲) خواندن جریانی با شمارنده — CP دروغگو/بی‌سر هم نمی‌تواند isolate را ببلعد
  const body = res.body;
  if (!body) return new Uint8Array(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          throw new CpBodyTooLargeError(maxBytes, total);
        }
        chunks.push(value);
      }
    }
  } finally {
    try { reader.releaseLock(); } catch { /* خواننده تمام شده */ }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/** JSON با سقف — هم‌قرارداد `res.json()` ولی بدنهٔ عظیم هرگز parse نمی‌شود */
export async function readJsonCapped(
  res: Response,
  maxBytes: number = CP_RESPONSE_BODY_MAX_BYTES
): Promise<unknown> {
  const bytes = await readBodyCapped(res, maxBytes);
  const text = new TextDecoder('utf-8').decode(bytes);
  return JSON.parse(text) as unknown;
}

/** متن با سقف — برای بدنه‌های خطای CP (لاگ فقط سرِ بدنه می‌خواهد؛ بدنهٔ عظیم هم دور ریختنی است) */
export async function readTextCapped(
  res: Response,
  maxBytes: number = CP_RESPONSE_BODY_MAX_BYTES
): Promise<string> {
  const bytes = await readBodyCapped(res, maxBytes);
  return new TextDecoder('utf-8').decode(bytes);
}

/** بایت‌های فایل با سقف — درگاه فایل لحظه‌نیاز (هم‌قرارداد res.arrayBuffer()) */
export async function readBytesCapped(
  res: Response,
  maxBytes: number = CP_FILE_MAX_BYTES
): Promise<ArrayBuffer> {
  const bytes = await readBodyCapped(res, maxBytes);
  // برش به ArrayBuffer از پیش تخصیص‌یافته — بدون کپی اضافه
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

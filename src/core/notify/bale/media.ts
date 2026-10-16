/**
 * هستهٔ اعلان و کلاینت بات بله — ارسال رسانه در بات
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// دریافت فایل رسانه‌ای از بله (حلقهٔ بازگشت تکلیف):
// file_id پیام → getFile → file_path → دانلود باینری از /file/bot<token>/
// قراردادها:
// * fetch تزریقی است (قابل تست بدون شبکه) — الگوی client.ts
// * خطا هرگز token لو نمی‌دهد؛ FetchMediaError با پیام بی‌خطر
// * available=false یعنی توکن بله تنظیم نیست — caller پاسخ «فعال نیست» می‌دهد

export interface FetchedMedia {
  bytes: Uint8Array;
  /** mime از هدر پاسخ دانلود — در نبودش null (caller پیش‌فرض می‌گذارد) */
  mime: string | null;
}

export interface MediaFetcher {
  /** false = توکن بله تنظیم نشده — دریافت رسانه ممکن نیست */
  readonly available: boolean;
  /** دانلود باینری فایل — هر خطا → FetchMediaError (بدون جزئیات شبکه) */
  fetch(fileId: string): Promise<FetchedMedia>;
}

export class FetchMediaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FetchMediaError';
  }
}

interface GetFileResponse {
  ok?: boolean;
  result?: { file_path?: string };
  description?: string;
}

export interface BaleMediaFetcherOptions {
  token: string;
  /** برای تست یا تغییر دامنه API */
  apiBase?: string;
  fetchImpl?: typeof fetch;
}

export function createBaleMediaFetcher(options: BaleMediaFetcherOptions): MediaFetcher {
  const base = (options.apiBase ?? 'https://tapi.bale.ai').replace(/\/+$/, '');
  const doFetch = options.fetchImpl ?? fetch;

  return {
    available: true,

    async fetch(fileId: string): Promise<FetchedMedia> {
      let path: string;
      try {
        const metaRes = await doFetch(`${base}/bot${options.token}/getFile?file_id=${encodeURIComponent(fileId)}`);
        const meta = (await metaRes.json().catch(() => ({}))) as GetFileResponse;
        if (!metaRes.ok || meta.ok === false || !meta.result?.file_path) {
          throw new FetchMediaError('دریافت شناسهٔ فایل از بله ناموفق بود');
        }
        path = meta.result.file_path;
      } catch (err) {
        if (err instanceof FetchMediaError) throw err;
        throw new FetchMediaError('ارتباط با بله برای دریافت فایل ناموفق بود');
      }

      try {
        const fileRes = await doFetch(`${base}/file/bot${options.token}/${path.replace(/^\/+/, '')}`);
        if (!fileRes.ok) throw new FetchMediaError('دانلود فایل از بله ناموفق بود');
        const buf = await fileRes.arrayBuffer();
        if (buf.byteLength === 0) throw new FetchMediaError('فایل دریافتی از بله خالی است');
        return {
          bytes: new Uint8Array(buf),
          mime: fileRes.headers.get('content-type')
        };
      } catch (err) {
        if (err instanceof FetchMediaError) throw err;
        throw new FetchMediaError('دانلود فایل از بله ناموفق بود');
      }
    }
  };
}

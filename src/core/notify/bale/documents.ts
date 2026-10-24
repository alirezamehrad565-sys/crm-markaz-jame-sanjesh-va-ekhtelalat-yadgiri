// ─── تایپ‌های ارسال فایل (sendDocument) به بله — m180 ───
// m184: خودِ تابع sendBaleDocument به src/domain/exercise-bank/routes.ts منتقل شد
// (تنها نقطهٔ تعریف تا فرانت پنل و سیم‌کشی فایل‌های تمرین یکی باشد)؛ این فایل فقط تایپ‌ها را نگه می‌دارد.
// مکانیک: فایل با multipart/form-data به متد sendDocument ربات بله فرستاده می‌شود
// (همان Bot API سازگار با تلگرام که sendMessage از آن استفاده می‌کند).
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

export interface BaleApiResponse {
  ok?: boolean;
  result?: { message_id?: number | string };
  description?: string;
  error_code?: number;
}

export type { SendResult };

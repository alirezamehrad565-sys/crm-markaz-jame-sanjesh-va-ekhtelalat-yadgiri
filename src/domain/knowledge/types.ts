/**
 * ماژول پایگاه دانش — تایپ‌های ماژول
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// دانش‌افزایی
// — پیوست فایل/تصویر مقاله (الگوی پیوست چندگانهٔ بانک تمرین 0036)

import type { AuthContext, KnowledgeCategory, KnowledgeRecord } from '@core/shared';

export interface NewKnowledgeInput {
  title: string;
  body: string;
  category: KnowledgeCategory;
  pinned: boolean;
  published: boolean;
}

export interface UpdateKnowledgeInput {
  title?: string;
  body?: string;
  category?: KnowledgeCategory;
  pinned?: boolean;
  published?: boolean;
}

/** فایل باینری آمادهٔ ذخیره (مسیر multipart پخش‌جریانی — قطعات ~۱.۵ مگابایتی) */
export interface KnowledgeFileBytesInput {
  filename: string;
  mimeType: string;
  segments: Uint8Array[];
  size: number;
}

export interface KnowledgeService {
  /** فهرست همکاران — منتشرشده‌ها (سنجاق‌شده اول)؛ همهٔ نقش‌ها */
  listPublished(): Promise<KnowledgeRecord[]>;
  /** فهرست مدیریتی — همهٔ ردیف‌ها (پیش‌نویس/بایگانی هم)؛ فقط دفتر */
  listAll(): Promise<KnowledgeRecord[]>;
  create(input: NewKnowledgeInput, actor: AuthContext): Promise<KnowledgeRecord>;
  update(id: string, input: UpdateKnowledgeInput, actor: AuthContext): Promise<KnowledgeRecord>;
  /** حذف کامل (الگوی — ثبت اشتباه باید قابل پاک‌کردن باشد)؛ فقط مدیر */
  remove(id: string, actor: AuthContext): Promise<{ id: string }>;

  /** — افزودن چند پیوست (multipart باینری)؛ فقط دفتر — سقف‌ها همان تمرین‌ها */
  addFiles(id: string, files: KnowledgeFileBytesInput[], actor: AuthContext): Promise<KnowledgeRecord>;
  /** — شروع بارگذاری پیوستهٔ فایل بزرگ: ردیف پیوست ساخته می‌شود؛ تکه‌ها بعداً می‌آیند */
  beginChunkedUpload(
    id: string,
    input: { filename: string; mimeType: string; size: number },
    actor: AuthContext
  ): Promise<{ fileId: string }>;
  /** — دریافت یک تکهٔ باینری (≤ ۱ مگابایت) */
  putUploadChunk(id: string, fileId: string, seq: number, bytes: Uint8Array, actor: AuthContext): Promise<{ received: number }>;
  /** — پایان بارگذاری پیوسته: شمار و مجموع تکه‌ها با متادیتای اعلام‌شده سنجیده می‌شود */
  completeChunkedUpload(id: string, fileId: string, actor: AuthContext): Promise<KnowledgeRecord>;
  /** — حذف یک پیوست؛ فقط دفتر */
  deleteAttachment(id: string, fileId: string, actor: AuthContext): Promise<KnowledgeRecord>;
  /** — دانلود یک پیوست مشخص (همهٔ همکاران احرازشده — مثل خواندن مقاله) */
  getAttachmentFile(id: string, fileId: string): Promise<{ bytes: Uint8Array; filename: string; mime: string } | null>;
}

export type { KnowledgeCategory, KnowledgeRecord };

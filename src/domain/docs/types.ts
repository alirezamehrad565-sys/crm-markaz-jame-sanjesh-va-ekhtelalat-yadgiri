import type { AuthContext } from '@core/shared';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { DbClient } from '@core/db';
import type { ObjectStore } from '@core/storage';

// ─── نمون‌برگ‌ها و اسناد خام: انواع ماژول ───

// دسته‌بندی جدید مرکز (به ترتیب منو): سنجش، اختلالات، حسابداری، بازدیدها،
// تابلو/مُهر/پوستر، آیین‌نامه‌ها، سایر — نگاشت داده‌های قدیمی: مایگریشن 0074
export const DOC_CATEGORIES = ['sanjesh', 'ekhtelalat', 'hesabdari', 'bazdidha', 'tablo_mohr_poster', 'ayinnameha', 'other'] as const;

export type DocCategory = (typeof DOC_CATEGORIES)[number];

export interface DocFileMeta {
  id: string;
  filename: string;
  mime: string;
  size: number;
}

export interface DocRecord {
  id: string;
  title: string;
  category: DocCategory;
  description: string;
  tags: string[];
  files: DocFileMeta[];
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocListOpts {
  q?: string;
  category?: DocCategory;
  limit: number;
  offset: number;
}

export interface NewDocInput {
  title: string;
  category: DocCategory;
  description: string;
  tags: string[];
}

export interface UpdateDocInput {
  title?: string;
  category?: DocCategory;
  description?: string;
  tags?: string[];
}

export interface DocFileBytesInput {
  filename: string;
  mimeType: string;
  segments: Uint8Array[];
  size: number;
}

export interface DocsDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
  storage: ObjectStore;
}

export interface DocsService {
  // اسناد
  list(opts: DocListOpts): Promise<{ items: DocRecord[]; hasMore: boolean }>;
  get(id: string): Promise<DocRecord | null>;
  create(input: NewDocInput, actor: AuthContext): Promise<DocRecord>;
  update(id: string, input: UpdateDocInput, actor: AuthContext): Promise<DocRecord>;
  remove(id: string, actor: AuthContext): Promise<{ id: string }>; // حذف نرم — deleted_at

  // فایل‌های پیوست
  addFiles(id: string, files: DocFileBytesInput[], actor: AuthContext): Promise<DocRecord>;
  beginChunkedUpload(id: string, input: { filename: string; mimeType: string; size: number }, actor: AuthContext): Promise<{ fileId: string }>;
  putUploadChunk(id: string, fileId: string, seq: number, bytes: Uint8Array, actor: AuthContext): Promise<{ received: number }>;
  completeChunkedUpload(id: string, fileId: string, actor: AuthContext): Promise<DocRecord>;
  deleteFile(id: string, fileId: string, actor: AuthContext): Promise<DocRecord>;
  getFile(id: string, fileId: string): Promise<{ bytes: Uint8Array; filename: string; mime: string } | null>;
}

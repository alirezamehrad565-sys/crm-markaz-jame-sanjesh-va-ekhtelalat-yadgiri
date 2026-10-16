/**
 * ماژول پایگاه دانش — تایپ‌های ماژول
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// دانش‌افزایی

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

export interface KnowledgeService {
  /** فهرست همکاران — منتشرشده‌ها (سنجاق‌شده اول)؛ همهٔ نقش‌ها */
  listPublished(): Promise<KnowledgeRecord[]>;
  /** فهرست مدیریتی — همهٔ ردیف‌ها (پیش‌نویس/بایگانی هم)؛ فقط دفتر */
  listAll(): Promise<KnowledgeRecord[]>;
  create(input: NewKnowledgeInput, actor: AuthContext): Promise<KnowledgeRecord>;
  update(id: string, input: UpdateKnowledgeInput, actor: AuthContext): Promise<KnowledgeRecord>;
  /** حذف کامل (الگوی — ثبت اشتباه باید قابل پاک‌کردن باشد)؛ فقط مدیر */
  remove(id: string, actor: AuthContext): Promise<{ id: string }>;
}

export type { KnowledgeCategory, KnowledgeRecord };

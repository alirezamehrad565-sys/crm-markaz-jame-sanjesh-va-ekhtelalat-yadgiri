/**
 * ماژول برچسب‌گذاری — تایپ‌های ماژول
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// تایپ‌های ماژول برچسب‌ها — مالک جدول‌های tags و student_tags

import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { AuthContext, TagCategory, TagRecord, TagRef } from '@core/shared';

export interface TagDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
}

export interface ListTagsFilters {
  category?: TagCategory;
  active?: boolean;
}

export interface NewTagInput {
  name: string;
  category: TagCategory;
  color?: string;
}

export interface TagService {
  /** فهرست برچسب‌ها با شمارش استفاده (usageCount) */
  list(filters: ListTagsFilters): Promise<TagRecord[]>;

  getById(id: string): Promise<TagRecord | null>;

  /** ساخت برچسب جدید — فقط مدیر (یکتایی category+name) */
  create(input: NewTagInput, actor: AuthContext): Promise<TagRecord>;

  /** غیرفعال‌سازی (بدون حذف — append-only history) */
  deactivate(id: string, actor: AuthContext): Promise<TagRecord>;

  /** برچسب‌های فعال یک دانش‌آموز */
  forStudent(studentId: string): Promise<TagRef[]>;

  /** جایگزینی کامل برچسب‌های دانش‌آموز + audit diff-based */
  replaceForStudent(studentId: string, tagIds: string[], actor: AuthContext): Promise<TagRef[]>;
}

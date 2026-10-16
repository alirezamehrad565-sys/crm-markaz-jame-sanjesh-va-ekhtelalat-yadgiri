/**
 * زیرساخت پاسخ و خطای HTTP — قالب پاسخ‌های استاندارد API
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// Response helpers — فرمت استاندارد { data, meta } و pagination

import type { PaginatedResult, PaginationMeta } from '@core/shared';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@core/shared';

export function ok<T>(data: T, meta?: Record<string, unknown>): { data: T; meta?: Record<string, unknown> } {
  return meta ? { data, meta } : { data };
}

export function paginate<T>(
  items: T[],
  page: number,
  pageSize: number,
  total: number
): PaginatedResult<T> {
  const safePage = Math.max(1, Math.floor(page) || 1);
  const safeSize = Math.min(Math.max(1, Math.floor(pageSize) || DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  const meta: PaginationMeta = {
    page: safePage,
    pageSize: safeSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / safeSize))
  };
  return { data: items, meta };
}

/** پارس پارامترهای pagination از query string */
export function pageParams(query: Record<string, string | undefined>): { page: number; pageSize: number } {
  return {
    page: Number.parseInt(query.page ?? '1', 10) || 1,
    pageSize: Number.parseInt(query.page_size ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE
  };
}

import type { PaginatedResult, PaginationMeta } from '@core/shared';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@core/shared';

export function ok<T>(data: T, meta?: Record<string, unknown>): { data: T; meta?: Record<string, unknown> } {
  return meta ? { data, meta } : { data };
}

export function pageParams(query: Record<string, string | undefined>): { page: number; pageSize: number } {
  return {
    page: Number.parseInt(query.page ?? '1', 10) || 1,
    pageSize: Number.parseInt(query.page_size ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE
  };
}

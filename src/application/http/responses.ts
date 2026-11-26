import type { PaginatedResult, PaginationMeta } from '@core/shared';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@core/shared';

export function ok<T>(data: T, meta?: Record<string, unknown>): { data: T; meta?: Record<string, unknown> } {
  return meta ? { data, meta } : { data };
}

/* architecture-003 (۱.۲۷.۸۴): پیاده‌سازی به @core/shared/http-params رفت — این مسیر فقط سازگاری */
export { pageParams } from '@core/shared';

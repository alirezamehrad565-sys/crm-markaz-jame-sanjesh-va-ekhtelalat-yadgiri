/**
 * زیرساخت پاسخ و خطای HTTP — نقطهٔ ورود و صادرات‌های ماژول (barrel)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// مرز عمومی ماژول http

export { ok, paginate, pageParams } from './responses';
export { errorHandler } from './error-handler';
export type { PaginatedResult, PaginationMeta } from '@core/shared';

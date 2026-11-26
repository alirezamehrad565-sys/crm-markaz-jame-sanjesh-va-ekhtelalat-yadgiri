/**
 * قرارداد صفحه‌بندی — ۱.۲۷.۸۴ (sdt161: architecture-003)
 * helper خالص pageParams از @app/http به هستهٔ مشترک منتقل شد تا هیچ فایل src/domain به @app
 * وابسته نماند؛ @app/http برای سازگاری همان را re-export می‌کند (یک تعریف، دو مسیر دسترسی).
 * ثابت‌ها از constants.ts: DEFAULT_PAGE_SIZE / MAX_PAGE_SIZE — هم‌منبع_paginated.ts.
 */
import { DEFAULT_PAGE_SIZE } from './constants';

export function pageParams(query: Record<string, string | undefined>): { page: number; pageSize: number } {
  return {
    page: Number.parseInt(query.page ?? '1', 10) || 1,
    pageSize: Number.parseInt(query.page_size ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE
  };
}

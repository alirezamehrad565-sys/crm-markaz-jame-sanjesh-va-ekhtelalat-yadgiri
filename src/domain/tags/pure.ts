/**
 * ماژول برچسب‌گذاری — توابع خالص منطق محض (بدون I/O)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// منطق خالص برچسب‌ها — قابل تست بدون دیتابیس

import type { TagRef } from '@core/shared';

/** نرمال‌سازی نام برچسب: فروکاستن فاصله‌های تکراری + حذف فاصله ابتدا/انتها */
export function normalizeTagName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/**
 * diff جایگزینی برچسب‌های دانش‌آموز — برای audit
 * خروجی: نام برچسب‌های افزوده‌شده و حذف‌شده (بر اساس id، نه نام)
 */
export function diffStudentTags(
  current: TagRef[],
  next: TagRef[]
): { added: string[]; removed: string[] } {
  const currentIds = new Set(current.map((t) => t.id));
  const nextIds = new Set(next.map((t) => t.id));
  const added = next.filter((t) => !currentIds.has(t.id)).map((t) => t.name);
  const removed = current.filter((t) => !nextIds.has(t.id)).map((t) => t.name);
  return { added, removed };
}

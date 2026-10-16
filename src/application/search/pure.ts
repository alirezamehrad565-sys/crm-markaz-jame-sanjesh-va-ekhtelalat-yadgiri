/**
 * سرویس جستجوی سراسری — توابع خالص منطق محض (بدون I/O)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// منطق خالص جستجوی سراسری — پاک‌سازی عبارت و مرتب‌سازی گروه‌ها

import { SEARCH_QUERY_MAX_LENGTH } from '@core/shared';
import type { SearchEntityType, SearchGroup, SearchItem } from '@core/shared';

/** ارقام فارسی/عربی → لاتین (برای جستجوی کد ملی که لاتین ذخیره می‌شود) */
export function toLatinDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

/**
 * پاک‌سازی عبارت جستجو:
 * ۱) ارقام فارسی→لاتین ۲) حذف wildcard های LIKE (% و _) ۳) فروکاستن فاصله‌ها ۴) سقف طول
 */
export function sanitizeSearchQuery(raw: string | undefined | null): string {
  return toLatinDigits(String(raw ?? ''))
    .replace(/[%_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SEARCH_QUERY_MAX_LENGTH);
}

/** آیا عبارت برای جستجو کافی است؟ (حداقل طول) */
export function isSearchable(value: string, minLength: number): boolean {
  return value.length >= minLength;
}

/** الگوی LIKE با wildcard — ورودی همیشه sanitize‌شده فرض می‌شود */
export function likePattern(value: string): string {
  return `%${value}%`;
}

/** ترتیب ثابت نمایش گروه‌ها در پاسخ — فاز W: لیست انتظار منبع پنجم */
const GROUP_ORDER: SearchEntityType[] = ['student', 'staff', 'school', 'tag', 'waitlist'];

/** گروه‌ها با ترتیب ثابت + حذف گروه‌های خالی */
export function orderGroups(groups: SearchGroup[]): SearchGroup[] {
  return GROUP_ORDER.map((type) => groups.find((g) => g.type === type)).filter(
    (g): g is SearchGroup => Boolean(g && g.items.length > 0)
  );
}

/** سقف تعداد آیتم هر گروه */
export function capItems(items: SearchItem[], limit: number): SearchItem[] {
  return items.slice(0, limit);
}

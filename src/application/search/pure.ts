import { SEARCH_QUERY_MAX_LENGTH } from '@core/shared';
import type { SearchEntityType, SearchGroup, SearchItem } from '@core/shared';

export function toLatinDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

export function sanitizeSearchQuery(raw: string | undefined | null): string {
  return toLatinDigits(String(raw ?? ''))
    .replace(/[%_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SEARCH_QUERY_MAX_LENGTH);
}

export function isSearchable(value: string, minLength: number): boolean {
  return value.length >= minLength;
}

export function likePattern(value: string): string {
  return `%${value}%`;
}

const GROUP_ORDER: SearchEntityType[] = ['student', 'staff', 'school', 'tag', 'waitlist', 'doc']; // + اسناد

export function orderGroups(groups: SearchGroup[]): SearchGroup[] {
  return GROUP_ORDER.map((type) => groups.find((g) => g.type === type)).filter(
    (g): g is SearchGroup => Boolean(g && g.items.length > 0)
  );
}

export function capItems(items: SearchItem[], limit: number): SearchItem[] {
  return items.slice(0, limit);
}

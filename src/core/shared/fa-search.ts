/**
 * fa-search (۱.۲۷.۷۷ — موج B3 «جستجوی هوشمند» پیام ۱۶) — نرمال‌سازی فارسیِ جستجو، تنها منبع
 * سمت سرور. سؤالِ کاربر و ستون‌های متنی هر دو با همین قواعد هم‌سطح می‌شوند تا تفاوت‌های
 * صفحه‌کلید/کپی-پیست جستجو را نمی‌شکند: ي/ى عربی→ی، ك عربی→ک، أ/إ/آ→ا، ة→ه، حذف نیم‌فاصله
 * (U+200C)، ارقام فارسی/عربی→لاتین، فشردن فاصله‌ها. سمت مرورگر: هم‌الگوی آن در format.js.
 */
import { SEARCH_QUERY_MAX_LENGTH } from './constants';

export function toLatinDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

export function faNormalize(value: string): string {
  return toLatinDigits(String(value ?? ''))
    .replace(/[\u064B-\u065F\u0670]/g, '') /* اعراب/تنوین/شدّه — از سؤال حذف؛ ستون‌ها عملاً بی‌اعراب‌اند */
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/\u200c/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** سؤالِ جستجو را امن و هم‌سطح می‌کند: نرمال فارسی + بی‌اثرکردن wildcard های LIKE + سقف طول */
export function sanitizeFaQuery(raw: string | undefined | null): string {
  return faNormalize(String(raw ?? ''))
    .replace(/[%_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SEARCH_QUERY_MAX_LENGTH);
}

export function likePattern(value: string): string {
  return `%${value}%`;
}

/**
 * عبارت SQL که ستونِ داده‌شده را با همان قواعد faNormalize هم‌سطح می‌کند — زنجیرهٔ REPLACE
 * روی مقدار ستون (NULL-امن: REPLACE(NULL)=NULL و LIKEِ NULL در OR فقط «عدم‌تطابق» است).
 * مصرف در students repository (لیست + شمارش) و global-search — هر دو یک قرارداد دارند.
 */
export function faHaystackExpr(sqlColumn: string): string {
  const rules: Array<[string, string]> = [
    ['ي', 'ی'],
    ['ى', 'ی'],
    ['ك', 'ک'],
    ['أ', 'ا'],
    ['إ', 'ا'],
    ['آ', 'ا'],
    ['ة', 'ه'],
    ['\u200c', '']
  ];
  return rules.reduce((expr, [from, to]) => `REPLACE(${expr}, '${from}', '${to}')`, sqlColumn);
}

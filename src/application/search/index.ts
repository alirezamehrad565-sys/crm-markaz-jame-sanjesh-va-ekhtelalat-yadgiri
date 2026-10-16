/**
 * سرویس جستجوی سراسری — نقطهٔ ورود و صادرات‌های ماژول (barrel)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
export { createSearchService } from './service';
export type { SearchService, SearchDeps } from './service';
export { registerSearchRoutes } from './routes';
export {
  toLatinDigits,
  sanitizeSearchQuery,
  isSearchable,
  likePattern,
  orderGroups,
  capItems
} from './pure';

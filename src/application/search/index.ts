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

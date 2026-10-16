/**
 * ماژول برچسب‌گذاری — نقطهٔ ورود و صادرات‌های ماژول (barrel)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
export { createTagService } from './service';
export { registerRoutes } from './routes';
export { normalizeTagName, diffStudentTags } from './pure';
export type { TagService, TagDeps, NewTagInput, ListTagsFilters } from './types';

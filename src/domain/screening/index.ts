/**
 * ماژول غربالگری — نقطهٔ ورود و صادرات‌های ماژول (barrel)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// مرز عمومی ماژول سنجش روزانه

export { createScreeningService } from './service';
export type { ScreeningService, ScreeningDeps } from './service';
export { registerScreeningRoutes } from './routes';
export { parseEntryInput, mergeTags, screeningStats, resolveHashTag, hasPredefinedTag } from './pure';
export { SCREENING_PREDEFINED_TAGS, SCREENING_REFERRAL_TAGS } from './types';
export type { ScreeningEntry, ScreeningStats, ScreeningTagCount, ScreeningDayCount, ScreeningRangeSummary } from './types';

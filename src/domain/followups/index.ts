/**
 * ماژول پیگیری‌ها — نقطهٔ ورود و صادرات‌های ماژول (barrel)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// مرز عمومی ماژول پیگیری (فاز ۳)

export { createFollowUpsService } from './service';
export { FOLLOWUP_TRANSITIONS, canTransition, followUpGroupOf, groupBoundaries, defaultDueAt, isOpenStatus } from './pure';
export { registerFollowUpRoutes } from './routes';
export type { FollowUpDeps, FollowUpListFilters, FollowUpsService, NewFollowUpInput, UpdateFollowUpInput } from './types';

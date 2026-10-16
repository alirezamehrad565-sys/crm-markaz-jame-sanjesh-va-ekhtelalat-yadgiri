/**
 * ماژول ساعات کاری — نقطهٔ ورود و صادرات‌های ماژول (barrel)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// Public boundary of the working-hours module

export type { WorkingHour, WorkingHoursService } from './types';
export { createWorkingHoursService } from './service';
export { registerRoutes } from './routes';
export { findOverlap, totalWeeklyMinutes, minuteToLabel } from './rules';
export type { HourRange } from './rules';

/**
 * ماژول کارکنان — نقطهٔ ورود و صادرات‌های ماژول (barrel)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// Public boundary of the staff module

export type { StaffMember, NewStaffInput, UpdateStaffInput, StaffService } from './types';
export { createStaffService } from './service';
export { registerRoutes } from './routes';

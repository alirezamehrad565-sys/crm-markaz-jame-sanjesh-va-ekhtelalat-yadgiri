/**
 * ماژول لیست انتظار — نقطهٔ ورود و صادرات‌های ماژول (barrel)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// مرز عمومی ماژول لیست انتظار (فاز W)

export { createWaitlistService } from './service';
export { registerWaitlistRoutes } from './routes';
export { WAITLIST_TRANSITIONS, canTransition, orderWaitlist, matchStudent, appendNote, isOverdue } from './pure';
export type {
  NewWaitlistInput,
  UpdateWaitlistInput,
  WaitlistListFilters,
  WaitlistScheduleInput,
  WaitlistScheduleResult,
  WaitlistDeps,
  WaitlistService
} from './types';

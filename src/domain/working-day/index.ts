/**
 * ماژول بورد روز کاری — نقطهٔ ورود و صادرات‌های ماژول (barrel)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// Public surface of the working-day module

export { createWorkingDayService } from './service';
export type { WorkingDayService, WorkingDayDeps } from './service';
export { registerWorkingDayRoutes } from './routes';
export {
  groupAppointmentsByStaff,
  sessionStatsFromAppointments,
  normalizeDayNoteBody
} from './pure';

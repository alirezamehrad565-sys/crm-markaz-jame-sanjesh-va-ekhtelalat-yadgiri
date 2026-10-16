/**
 * ماژول هستهٔ نوبت‌دهی — نقطهٔ ورود و صادرات‌های ماژول (barrel)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// مرز عمومی ماژول appointment-core — تنها نقطه import ماژول‌های دیگر

export { createAppointmentService } from './service';
export { registerRoutes } from './routes';
export { OPS_STATUS_TRANSITIONS, canTransitionOps, opsFromDb, opsTransitionMessage } from './pure';
export type { OpsFrom } from './pure';
export type {
  AppointmentDeps,
  AppointmentService,
  AppointmentUpdatePatch,
  CopyWeekInput,
  CopyWeekResult,
  ListFilters,
  MyStudent,
  NewAppointmentInput
} from './types';
export type { Appointment, AppointmentStudent, ConflictWarning } from '@core/shared';

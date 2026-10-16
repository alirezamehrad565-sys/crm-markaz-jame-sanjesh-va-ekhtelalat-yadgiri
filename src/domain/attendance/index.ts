/**
 * ماژول حضور و غیاب — نقطهٔ ورود و صادرات‌های ماژول (barrel)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// مرز عمومی ماژول attendance — دانش‌آموزان (نوبت‌محور) + همکاران (روزانه )

export { createAttendanceService } from './service';
export { registerRoutes } from './routes';
export type { AttendanceDeps, AttendanceService } from './service';
export type { PendingAttendanceItem, AttendanceStats } from '@core/shared';

//: حضور و غیاب همکاران
export { createStaffAttendanceService } from './staff';
export { registerStaffAttendanceRoutes } from './staff-routes';
export type { StaffAttendanceDeps, StaffAttendanceService, MarkStaffAttendanceInput } from './staff';
export { aggregateDay, aggregateRange, daysInRange, countDaysInclusive } from './staff';
export type { StaffAttendanceRecord } from '@core/shared';

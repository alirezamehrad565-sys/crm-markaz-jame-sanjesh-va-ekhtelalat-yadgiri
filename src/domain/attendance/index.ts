export { createAttendanceService } from './service';
export { registerRoutes } from './routes';
export type { AttendanceDeps, AttendanceService } from './service';
export type { PendingAttendanceItem, AttendanceStats } from '@core/shared';

export { createStaffAttendanceService } from './staff';
export { registerStaffAttendanceRoutes } from './staff-routes';
export type { StaffAttendanceDeps, StaffAttendanceService, MarkStaffAttendanceInput } from './staff';
export { aggregateDay, aggregateRange, daysInRange, countDaysInclusive } from './staff';
export type { StaffAttendanceRecord } from '@core/shared';

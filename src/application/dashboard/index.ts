export { createDashboardService } from './service';
export { registerRoutes } from './routes';
export type { DashboardDeps, DashboardService } from './service';
export {
  computeAttendanceStats,
  computeStaffCards,
  computeStatusCounts,
  findNextAppointment,
  groupByDay
} from './kpis';
export type { StaffInfo } from './kpis';
export type { DashboardPeriodSummary, DashboardStaffCard, DashboardSummaryDay, DashboardTodayCards } from '@core/shared';

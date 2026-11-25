export { createDashboardService } from './service';
export { registerRoutes } from './routes';
export type { DashboardDeps, DashboardService } from './service';
/* ۱.۲۷.۸۰ (architecture-001) — تجمیع KPI داشبورد به سرویس منتقل شد (از لایهٔ مسیریابی) */
export { createDashboardKpiService } from './kpi-source';
export type { DashboardKpiService, DashboardKpiDeps, DashboardKpiQuery, DashboardKpiCall } from './kpi-source';
export {
  computeAttendanceStats,
  computeStaffCards,
  computeStatusCounts,
  findNextAppointment,
  groupByDay
} from './kpis';
export type { StaffInfo } from './kpis';
export type { DashboardPeriodSummary, DashboardStaffCard, DashboardSummaryDay, DashboardTodayCards } from '@core/shared';

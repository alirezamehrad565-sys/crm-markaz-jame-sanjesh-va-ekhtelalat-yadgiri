/**
 * سرویس گزارش‌ها (دوره، تحلیل پیشرفته، مدارس) — نقطهٔ ورود و صادرات‌های ماژول (barrel)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// مرز عمومی ماژول گزارش‌ها

export { createReportService } from './service';
export { registerRoutes } from './routes';
export { buildDaySeries, buildPerStaff, buildTopStudents, safeRate, daysBetween, safeRateOrNull, weekStartOfYmd, buildWeeklyTrend, avgWaitDaysOf } from './pure';
export type { ReportDeps, ReportService } from './service';
export type { ApptMinuteRow, StudentSessionRow, TrendAppointmentRow, TrendAttendanceRow } from './pure';
export type { PeriodReport, AdvancedReport, AdvancedWeekPoint, WaitlistFunnel } from '@core/shared';

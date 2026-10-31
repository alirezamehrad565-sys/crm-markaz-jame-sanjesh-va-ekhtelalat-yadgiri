export { createWorkingDayService } from './service';
export type { WorkingDayService, WorkingDayDeps } from './service';
export { registerWorkingDayRoutes } from './routes';
export {
  groupAppointmentsByStaff,
  sessionStatsFromAppointments,
  normalizeDayNoteBody
} from './pure';

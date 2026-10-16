/**
 * سرویس تایم‌لاین پرونده — نقطهٔ ورود و صادرات‌های ماژول (barrel)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// مرز عمومی ماژول تایم‌لاین (فاز ۶ — Projection خالص §11)

export { createStudentTimelineService } from './service';
export {
  mergeTimelineEvents,
  filterTimelineEvents,
  paginateTimeline,
  deriveNextAction,
  appointmentEventState,
  parseCompositeRef,
  jalaliDateTimeLabel,
  subtitleWith,
  CASE_STATUS_LABELS_FA,
  NOTIFICATION_TITLES_FA
} from './pure';
export { registerStudentTimelineRoutes } from './routes';
export {
  TIMELINE_KINDS
} from './types';
export type {
  TimelineEvent,
  TimelineFilters,
  TimelineKind,
  TimelineNextAction,
  TimelineResult,
  StudentTimelineDeps,
  StudentTimelineService
} from './types';

/**
 * ماژول اعلان مدیر — نقطهٔ ورود و صادرات‌های ماژول (barrel)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// مرز عمومی ماژول اعلان‌ها

export { createAnnouncementService } from './service';
export { registerAnnouncementRoutes } from './routes';
export type { AnnouncementDeps, AnnouncementService, NewAnnouncementInput, UpdateAnnouncementInput } from './service';
export type { AnnouncementRecord, AnnouncementPublic, AnnouncementSendSummary } from '@core/shared';

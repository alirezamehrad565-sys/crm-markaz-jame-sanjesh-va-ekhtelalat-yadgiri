/**
 * سرویس تنظیمات مرکز — نقطهٔ ورود و صادرات‌های ماژول (barrel)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// مرز عمومی ماژول تنظیمات

export { createSettingsService } from './service';
export type { SettingsService, SettingsDeps, UpdateSettingsInput, UpdateScoringConfigInput } from './service';
export { registerSettingsRoutes } from './routes';

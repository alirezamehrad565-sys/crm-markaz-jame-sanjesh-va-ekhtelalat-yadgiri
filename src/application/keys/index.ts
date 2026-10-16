/**
 * سرویس کلیدهای API — نقطهٔ ورود و صادرات‌های ماژول (barrel)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// مرز عمومی ماژول کلیدهای API

export { createKeysService } from './service';
export type { KeysService, KeysDeps } from './service';
export { registerKeysRoutes } from './routes';

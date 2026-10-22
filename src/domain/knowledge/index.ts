/**
 * ماژول پایگاه دانش — نقطهٔ ورود و صادرات‌های ماژول (barrel)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// مرز عمومی ماژول دانش‌افزایی

export { createKnowledgeService } from './service';
export type { KnowledgeDeps } from './service';
export { registerKnowledgeRoutes } from './routes';
export type { KnowledgeService, NewKnowledgeInput, UpdateKnowledgeInput, KnowledgeFileBytesInput } from './types';

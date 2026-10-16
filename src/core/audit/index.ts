/**
 * ثبت رخدادهای audit به‌صورت append-only — نقطهٔ ورود و صادرات‌های ماژول (barrel)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// مرز عمومی ماژول audit

export { createAuditWriter } from './writer';
export type { AuditEntry, AuditWriter } from './writer';

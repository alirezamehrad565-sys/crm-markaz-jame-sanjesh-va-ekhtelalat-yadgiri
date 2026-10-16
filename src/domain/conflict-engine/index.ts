/**
 * موتور تشخیص تداخل نوبت — نقطهٔ ورود و صادرات‌های ماژول (barrel)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// مرز عمومی ماژول conflict-engine

export { createConflictEngine } from './service';
export type { ConflictEngine, ConflictEngineDeps } from './service';
export { findOverlaps } from './engine';
export type { ExistingAppointment, OverlapWarning, ProposedWindow } from './engine';

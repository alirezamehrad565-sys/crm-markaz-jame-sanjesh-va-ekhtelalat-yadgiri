/**
 * rust-f9 — زمان‌بند و پنل سینک محتوا از ابر (فرانت‌اند فقط-دسکتاپ)
 *  • runner.ts — حلقهٔ pull صفحه‌به‌صفحه + استقرار در موتور محلی + وضعیت نرم
 *  • panel.ts — پنل «همگام‌سازی محتوا از ابر» در تنظیمات اتصال ابر
 * سند: docs/rust/node-sync.md §استقرار
 */
export { createNodeSyncRunner, SYNC_STATUS_KEY, SYNC_MAX_PAGES_DEFAULT } from './runner';
export type { NodeSyncRunner, NodeSyncRunnerOptions, SyncStatusV1, SyncNowOutcome } from './runner';
export { buildSyncSection } from './panel';
export type { SyncSectionDeps } from './panel';

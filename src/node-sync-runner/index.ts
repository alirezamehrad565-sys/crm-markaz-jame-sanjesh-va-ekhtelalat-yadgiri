/**
 * rust-f9 + rust-f11 — زمان‌بند و پنل سینک (فرانت‌اند فقط-دسکتاپ)
 *  • runner.ts — حلقهٔ pull صفحه‌به‌صفحه + استقرار در موتور محلی + وضعیت نرم
 *  • runner.ts pushNow (rust-f11) — پوش نود: outbox موتور محلی → client.push → ابر
 *  • panel.ts — پنل «همگام‌سازی محتوا از ابر» در تنظیمات اتصال ابر
 * سند: docs/rust/node-sync.md §استقرار
 */
export { createNodeSyncRunner, SYNC_STATUS_KEY, SYNC_MAX_PAGES_DEFAULT, PUSH_WATERMARK_KEY } from './runner';
export type { NodeSyncRunner, NodeSyncRunnerOptions, SyncStatusV1, SyncNowOutcome, PushNowOutcome } from './runner';
export { buildSyncSection } from './panel';
export type { SyncSectionDeps } from './panel';

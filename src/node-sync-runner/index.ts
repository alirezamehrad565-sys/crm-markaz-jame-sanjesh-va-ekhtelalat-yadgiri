/**
 * rust-f9 + rust-f11 — زمان‌بند و پنل سینک (فرانت‌اند فقط-دسکتاپ)
 *  • runner.ts — حلقهٔ pull صفحه‌به‌صفحه + استقرار در موتور محلی + وضعیت نرم
 *  • runner.ts pushNow (rust-f11) — پوش نود: outbox موتور محلی → client.push → ابر
 *  • panel.ts — پنل «همگام‌سازی محتوا از ابر» در تنظیمات اتصال ابر
 * سند: docs/rust/node-sync.md §استقرار
 */
export { createNodeSyncRunner, SYNC_STATUS_KEY, SYNC_MAX_PAGES_DEFAULT, PUSH_WATERMARK_KEY } from './runner';
export type { NodeSyncRunner, NodeSyncRunnerOptions, SyncStatusV1, SyncNowOutcome, PushNowOutcome } from './runner';
export { buildSyncSection, notifySyncCredentialsChanged } from './panel';
export type { SyncSectionDeps } from './panel';
export {
  createSyncCoordinator,
  readCoordinatorState,
  modeFa,
  SYNC_COORD_KEY,
  COORD_INTERVAL_MS_DEFAULT,
  COORD_BASE_BACKOFF_MS,
  COORD_MAX_BACKOFF_MS,
  COORD_INGEST_BACKOFF_MS
} from './coordinator';
export type { SyncCoordinator, CoordinatorOptions, CoordinatorState, SyncMode, SyncFailureKind } from './coordinator';

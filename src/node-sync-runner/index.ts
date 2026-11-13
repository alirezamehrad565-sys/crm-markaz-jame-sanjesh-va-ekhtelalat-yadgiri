/**
 * rust-f9 + rust-f11 + rust-f14 — زمان‌بند، پنل، catch-up و وضعیت سینک (فرانت‌اند فقط-دسکتاپ)
 *  • runner.ts — حلقهٔ pull صفحه‌به‌صفحه + استقرار در موتور محلی + وضعیت نرم
 *  • runner.ts pushNow (rust-f11) — پوش نود: outbox موتور محلی → client.push → ابر
 *  • runner.ts catchUp (rust-f14) — همگام‌سازی جبرانی بوت: هر دو جهت تا تخلیهٔ کامل/سقف
 *  • coordinator.ts — لایهٔ زمان‌بندی/مقاوم (۳۰دقیقه + backoff + قرنطینه + گات نسخه)
 *  • panel.ts — پنل «همگام‌سازی محتوا از ابر» در تنظیمات اتصال ابر
 *  • boot.ts — ماشهٔ یک‌بارهٔ catch-up در بوت میز (fire-and-forget)
 *  • status.ts — قرارداد GET/POST /api/node-sync/status برای UI میز (سیم در api-routing)
 * سند: docs/rust/node-sync.md §استقرار
 */
export { createNodeSyncRunner, SYNC_STATUS_KEY, SYNC_MAX_PAGES_DEFAULT, PUSH_WATERMARK_KEY } from './runner';
export {
  CATCHUP_CURSOR_KEY,
  CATCHUP_STATE_KEY,
  CATCHUP_MAX_PAGES_DEFAULT,
  CATCHUP_MAX_PUSH_BATCHES,
  CATCHUP_PULL_LIMIT,
  CATCHUP_PUSH_CHUNK,
  CATCHUP_OUTBOX_PAGE_MAX,
  CLIENT_CURSOR_KEY,
  RECONCILE_KEY,
  RECONCILE_MAX_DETAIL,
  LOCAL_MAX_KEY
} from './runner';
export type {
  NodeSyncRunner,
  NodeSyncRunnerOptions,
  SyncStatusV1,
  SyncNowOutcome,
  PushNowOutcome,
  CatchUpOutcome,
  CatchUpStatus,
  CatchUpState,
  CatchUpStateV1,
  NodeSyncStatusMirror,
  NodeReconciliationV1,
  ReconcileDetailRow,
  ReconcileOutcome
} from './runner';
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
export { startNodeSyncBootCatchUp, resetNodeSyncBootCatchUpForTests } from './boot';
export type { BootCatchUpDeps } from './boot';
export { registerNodeSyncStatusRoute, NODE_SYNC_STATUS_MIRROR_KEY, NodeSyncStatusMirrorSchema } from './status';
export type { NodeSyncStatusRouteDeps, NodeSyncStatusPayload, NodeSyncReconciliationInfo } from './status';


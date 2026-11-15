/**
 * هستهٔ هم‌گامی دوسویه instance-sync (فاز B — docs/rust/server-cloud-update-design.md §۲-۴)
 * نقطهٔ ورود واحد ماژول: زیراپ مسیرها + هستهٔ سرویس + فهرست جداول + داور — مصرف‌کنندگان:
 *   • api-routing (قبل از گیت auth) و ورکر مرکزی مستقل (worker/src-entry-node.mjs)؛
 *   • عامل موازی فاز C (desktop-routes) و تست e2e دو-نمونه‌ای.
 */
export { createInstanceSyncApp } from './routes';
export {
  instanceState,
  pull,
  push,
  syncTableOf,
  recordSyncTombstone,
  PULL_MAX_ROWS_PER_TABLE,
  CONFLICT_PAYLOAD_MAX_BYTES,
  DEVICE_ID_PATTERN,
  truncateLoserPayload
} from './service';
export type {
  InstanceState,
  PullSince,
  PullResult,
  PushPayload,
  PushResult,
  SyncCursorPair
} from './service';
export { SYNC_TABLES, isSyncTable, syncTableMeta, syncPkValueOfRow, syncPkValueSplit } from './tables';
export { canonicalJson, syncHash, rowWinner, stampHashWinner, tombstoneCanonical, parseCursorPair } from './winner';
// فاز C (A1) — کلاینت ساخت خودکار ورکر ابری + پل دارایی‌های binding CLOUD_PROVISION
export {
  provisionCloudWorker,
  verifyCloudToken,
  normalizeWorkerName,
  chunkSchemaSql,
  schemaMigrationCount,
  SCHEMA_CHUNK_BYTES,
  WORKER_NAME_PATTERN,
  WORKER_NAME_PREFIX
} from './provision';
export type {
  CloudProvisionIO,
  ProvisionDeps,
  ProvisionResult,
  ProvisionStep,
  ProvisionSuccess,
  ProvisionFailure,
  CloudAccount,
  VerifyCloudDeps,
  VerifyCloudResult,
  WorkerNameOutcome
} from './provision';

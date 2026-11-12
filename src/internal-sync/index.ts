/**
 * rust-f9 — استقرار سینک نود در میز (سمت موتور محلی)
 *  • service.ts — صندوق ورودی 0110: پیش‌فیلتر فهرست سفید، idempotency (domain,id)، شمارش
 *  • routes.ts — /api/internal/sync/ingest + /status با گیت زمان‌اجرای CENTER_DESKTOP_ENGINE
 * سند قرارداد: docs/rust/node-sync.md §استقرار
 */
export { registerInternalSyncRoutes } from './routes';
export type { InternalSyncRoutesDeps } from './routes';
export {
  SYNC_INGEST_MAX_ITEMS,
  IngestBodySchema,
  IngestItemSchema,
  ingestInboxItem,
  inboxStatusCounts,
  splitByWhitelist
} from './service';
export type { IngestItem, IngestResult, IngestCounts } from './service';

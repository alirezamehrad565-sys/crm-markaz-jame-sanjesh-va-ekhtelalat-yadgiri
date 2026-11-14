/**
 * rust-f9/f11 — سینک نود سمت موتور محلی
 *  • service.ts — صندوق ورودی 0110: پیش‌فیلتر فهرست سفید، idempotency (domain,id)، شمارش
 *  • routes.ts — /api/internal/sync/ingest + /status + /outbox با گیت زمان‌اجرای CENTER_DESKTOP_ENGINE
 *  • outbox.ts — صندوق خروج push نود→ابر (rust-f11): client_errors/health_ping با since اختیاری
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
export {
  OUTBOX_MAX_ITEMS,
  OutboxSinceSchema,
  parseOutboxSince,
  buildOutboxPage
} from './outbox';
export type { OutboxItem, OutboxPage } from './outbox';

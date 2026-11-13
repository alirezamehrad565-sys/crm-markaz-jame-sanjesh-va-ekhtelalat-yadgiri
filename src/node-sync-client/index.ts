/**
 * کلاینت سینک نود دسکتاپ (rust-f4) — نقطهٔ ورود ماژول خالص
 * سند قرارداد: docs/rust/node-sync.md · این ماژول هیچ وابستگی مخزنی ندارد تا در
 * باندل پوستهٔ دسکتاپ (Tauri) و در آزمون‌ها بدون تغییر استفاده شود.
 */
export {
  createNodeSyncClient,
  NODE_PULL_DOMAINS,
  NODE_PUSH_DOMAINS,
  NODE_PULL_DOMAIN_SET,
  NODE_PUSH_DOMAIN_SET,
  NODE_PUSH_MIN_INTERVAL_MS
} from './client';
export type {
  NodeSyncStore,
  NodeSyncClient,
  NodeSyncClientOptions,
  NodePushItemInput,
  NodePullItem,
  PullOutcome,
  PushOutcome,
  NodeReconcileDomainRow,
  ReconcileOutcome
} from './client';

/**
 * سینک ترکیبی نودهای دسکتاپ (rust-f4) — سمت ورکر
 *  • service.ts — منطق: احراز کلید (cp-link)، رجیستری فقط-مدیر، pull کلیدsetی،
 *    push سفیدفهرستی idempotent با مُهر تلاش m1.5
 *  • app.ts — زیراپ Hono /node/* (پیش از گیت auth ثبت می‌شود؛ هم‌الگوی زنجیرهٔ عمومی §۵)
 * سند قرارداد: docs/rust/node-sync.md
 */
export { createNodeSyncApp } from './app';
export type { NodeSyncAppDeps } from './app';
export {
  NODE_PULL_DOMAINS,
  NODE_PUSH_DOMAINS,
  NODE_PULL_DOMAIN_SET,
  NODE_PUSH_DOMAIN_SET,
  NODE_PULL_DEFAULT_LIMIT,
  NODE_PULL_MAX_LIMIT,
  NODE_PUSH_MAX_ITEMS,
  NODE_PUSH_BODY_MAX_BYTES,
  NODE_PUSH_MIN_INTERVAL_MS,
  NODE_PUSH_CATCHUP_HEADER,
  NODE_CODE_PATTERN,
  NodeCodeInvalidError,
  bearerToken,
  generateNodeKey,
  timingSafeHexEqual,
  registerNode,
  rotateNodeKey,
  revokeNode,
  listNodes,
  verifyNodeCredentials,
  shouldAttemptNodePush,
  stampNodePushAttempt,
  stampNodePushOk,
  stampNodePull,
  encodeNodeCursor,
  decodeNodeCursor,
  pullNodePage,
  pushNodeEvents,
  validatePushItem,
  NodePushRawBodySchema,
  NodePushRawItemSchema,
  UsageSummaryPayloadSchema,
  ClientErrorPayloadSchema,
  HealthPingPayloadSchema,
  // rust-f15 — سهمیهٔ روزانهٔ مرکز و هم‌راستاسازی
  QUOTA_LIMITS,
  NODE_PULL_ROWS_WRITTEN_EST,
  NODE_PULL_ROWS_READ_EST,
  NODE_PUSH_ROWS_WRITTEN_EST,
  NODE_PUSH_ROWS_READ_EST,
  LOGIN_ROWS_WRITTEN_EST,
  LOGIN_ROWS_READ_EST,
  quotaDayUtc,
  bumpQuotaUsage,
  quotaLevelFor,
  quotaPercent,
  centralQuotaSnapshot,
  reconcileDomainCounts
} from './service';
export type {
  NodePullDomain,
  NodePushDomain,
  NodePullItem,
  PullPageResult,
  NodeCursor,
  SyncNodeRow,
  SyncNodeListItem,
  NodeRegistration,
  NodeKeyRotation,
  NodeAuthOutcome,
  NodePushRawItem,
  ValidatedPushItem,
  NodePushOutcome,
  GeneratedNodeKey,
  QuotaKind,
  QuotaLevel,
  CentralQuotaSnapshot,
  ReconcileDomainStatus
} from './service';

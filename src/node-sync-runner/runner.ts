/**
 * rust-f9 + rust-f11 — زمان‌بند سینک میز: pull محتوا از ابر + push نود (چانک فقط-دسکتاپ)
 *
 * حلقهٔ گم‌شدهٔ فاز ۴: کلاینت node-sync-client ساخته و در drill اثبات شده بود اما به
 * چرخهٔ اجرا سیم نشده بود. این ماژول:
 *  ۱) با همان اعتبار «اتصال ابر» (record + مخزن امن) یک client می‌سازد — cursor و مُهر
 *     تلاش در انبار پیشرفت (localStorage شکل) می‌مانند، راز هرگز آنجا نمی‌رود.
 *  ۲) syncNow: pull فرصت‌طلب صفحه‌به‌صفحه (سقف maxPages) و استقرار هر صفحه در موتور محلی
 *     با POST /api/internal/sync/ingest (توکن سشن کارمند) — همه‌چیز نرم (قرارداد drill §۳-۱۱):
 *     هیچ تابعی throw نمی‌کند؛ خطا در وضعیت می‌نشیند و دورهٔ بعد دوباره تلاش می‌شود.
 *  ۳) وضعیت «آخرین همگامی» در انبار پیشرفت — نشانگر پنل تنظیمات همان را می‌خواند.
 *  ۴) pushNow (rust-f11): پوش نود جدا از pull — آیتم‌های قابل‌پوش را از outbox موتور محلی
 *     می‌خواند (GET /api/internal/sync/outbox?since=watermark — همان مبدا، فقط توکن سشن
 *     کارمند) و با client.push به ابر می‌فرستد؛ watermark خودش در انبار پیشرفت است و
 *     گات ۱۵دقیقه‌ای + فهرست سفید سمت کلاینت سر جایشان اعتبار دارند. همه‌چیز نرم — هیچ throwی.
 *  ۵) catchUp (rust-f14) — همگام‌سازی جبرانی بوت: پس از هفته‌ها بسته‌ماندن اپ، هر دو جهت
 *     «تا تخلیهٔ کامل یا سقف» می‌رود:
 *       • pull صفحه‌به‌صفحه با cursor دقیق که فقط بعد از تعهد هر صفحه در صندوق جلو می‌رود
 *         (قطعی وسط راه = همان صفحهٔ متعهدنشده دوباره می‌آید؛ PK (domain,id) صندوق دوباره‌ها
 *         را می‌کشد — صفر اتلاف، صفر دوباره‌سازی).
 *       • push بسته‌به‌بستهٔ ≤۱۰۰ آیتم تا تخلیهٔ outbox یا سقف؛ watermark فقط بعد از ack کامل
 *         هر صفحهٔ outbox جلو می‌رود (بستهٔ ackنشده در دورهٔ بعد دوباره می‌رود و ابر با
 *         PK (node_code,id) دوباره‌ها را می‌شمارد).
 *       • گات ۱۵دقیقه‌ای فقط تیک دوره‌ای را می‌بندد — catch-up با هدر NODE_PUSH_CATCHUP_HEADER
 *         سمت ابر و بدون کلاینت گات‌دار صریحاً می‌گذرد.
 *     خروجی CatchUpOutcome است و هیچ مسیری throw نمی‌کند (قرارداد drill §۳-۱۱).
 *  ۶) موج ۱ — هندشیک نسخه (۱-۴) و ساعت مرجع مرکز (۱-۳): هر پاسخ موفق pull/push (دورهٔ عادی و
 *     جبرانی) center_version/min_node_version/server_ts دارد؛ runner آن را در NODE_VERSION_KEY
 *     ثبت می‌کند (compatible = APP_VERSION ≥ min با compareSemver؛ drift قدر مطلق به دقیقه،
 *     هشدار > ۲ دقیقه — فقط-اطلاعاتی) و ناسازگاری را فقط در catch-up به version_error می‌برد
 *     (هم‌رفتار ۴۲۶ receiving-سر). خلاصهٔ دورهٔ کامل جبرانی در last_catchup وضعیت می‌نشیند.
 *  ۷) EXP-1 — آشتی‌ساز (reconcile): پس از هر دورهٔ جبرانی کامل (state=synced) یک‌بار
 *     GET /node/reconcile با همان اعتبار نود زده می‌شود و شمارش + بیشینهٔ updated_at هر
 *     دامنهٔ سفید pull با صندوق محلی مقایسه می‌شود (شمارش از GET /api/internal/sync/status
 *     سمت موتور؛ بیشینهٔ محلی از مشاهدهٔ تجمعی استقرارها در LOCAL_MAX_KEY). فقط-گزارش:
 *     نتیجه در RECONCILE_KEY می‌نشیند و هیچ اصلاحی هرگز انجام نمی‌شود.
 * فهرست سفید سه‌لایه دست‌نخورده: ابر (pull) ← کلاینت (client.ts) ← سرور میز (internal-sync).
 * push مسیر معکوس است: موتور محلی (outbox) → client.push (پیش‌فیلتر فهرست سفید) → ابر (node/push).
 */
import { createNodeSyncClient } from '../node-sync-client/client.js';
import { NODE_PULL_DOMAINS } from '../node-sync-client/client.js';
import type { NodePullItem, NodeSyncStore } from '../node-sync-client/client.js';
import { APP_VERSION, compareSemver } from '../core/version.js';
import { SYNC_COORD_KEY } from './coordinator.js';

/** کلید وضعیت آخرین همگامی در انبار پیشرفت */
export const SYNC_STATUS_KEY = 'nodesync:last-status-v1';
/** سقف صفحات در هر دورهٔ syncNow — جلوگیری از حلقهٔ بی‌پایان روی cursor خراب ابر */
export const SYNC_MAX_PAGES_DEFAULT = 20;
/** کلید watermark پوش در انبار پیشرفت — ISO آخرین push موفق (rust-f11) */
export const PUSH_WATERMARK_KEY = 'nodesync:push-watermark-v1';
/** مسیر outbox موتور محلی — قرارداد ثابت rust-f11 (همان مبدا؛ فقط توکن سشن کارمند) */
const OUTBOX_PATH = '/api/internal/sync/outbox';

// ─── rust-f14 — ثابت‌های همگام‌سازی جبرانی (catch-up) ───

/**
 * کلید cursor «دقیق» catch-up در انبار پیشرفت — جدا از کلید استاندارد client. کلید client
 * در پایان داده '' می‌نویسد (cursor پارس‌نشده = دورهٔ بعد از صفحهٔ نخست = دوباره‌خوانی کل تاریخ)
 *؛ اینجا آخرین cursor واقعی حتی در پایان داده می‌ماند تا دورهٔ بعد فقط آیتم‌های تازه‌تر بیایند.
 */
export const CATCHUP_CURSOR_KEY = 'nodesync:catchup-cursor-v1';
/** کلید وضعیت دورهٔ catch-up در انبار پیشرفت — منبع فیلد state در GET /api/node-sync/status */
export const CATCHUP_STATE_KEY = 'nodesync:catchup-state-v1';
/** سقف صفحات pull در هر دورهٔ catch-up — سقف‌خورده یعنی ادامه در دورهٔ بعد (cursor محفوظ است) */
export const CATCHUP_MAX_PAGES_DEFAULT = 100;
/** سقف بسته‌های push در هر دورهٔ catch-up — سقف سالم: ≈۲۵ صفحهٔ outbox در یک دوره */
export const CATCHUP_MAX_PUSH_BATCHES = 50;
/** سایز صفحهٔ pull در catch-up — آینهٔ NODE_PULL_MAX_LIMIT سمت ورکر (فرانت‌اند از src/node-sync import ندارد) */
export const CATCHUP_PULL_LIMIT = 100;
/** سایز بستهٔ push — آینهٔ NODE_PUSH_MAX_ITEMS سمت ورکر (قرارداد /node/push) */
export const CATCHUP_PUSH_CHUNK = 100;
/** آینهٔ OUTBOX_MAX_ITEMS سمت موتور محلی (internal-sync/outbox.ts) — برای تشخیص «صفحهٔ پر» در watermark */
export const CATCHUP_OUTBOX_PAGE_MAX = 200;
/** مسیر آینهٔ وضعیت در موتور محلی — قرارداد rust-f14 (status.ts) */
const STATUS_MIRROR_PATH = '/api/node-sync/status';
/** آینهٔ NODE_PUSH_CATCHUP_HEADER سمت ورکر (service.ts) — فرانت‌اند از src/node-sync import ندارد */
const CATCHUP_HEADER = 'X-CP-Node-Catchup';
/** کلید cursor استاندارد client برای مجموعهٔ کامل دامنه‌ها — دقیقاً هم‌فرمول cursorKeyFor در client.ts */
export const CLIENT_CURSOR_KEY = `nodesync:cursor:${[...NODE_PULL_DOMAINS].sort().join('+')}`;

// ─── موج ۱ — هندشیک نسخه (۱-۴) و ساعت مرجع مرکز (۱-۳) ───

/**
 * کلید هندشیک نسخه در انبار پیشرفت — آخرین {client, center, compatible, drift} دیده‌شده از
 * پاسخ‌های موفق مرکز (pull/push، دورهٔ عادی و جبرانی). منبع فیلد version و clock_* در
 * GET /api/node-sync/status.
 */
export const NODE_VERSION_KEY = 'nodesync:version-handshake-v1';
/** آستانهٔ هشدار اختلاف ساعت به دقیقه — بیش از این = clock_warning (بند ۱-۳: بیش از ۲ دقیقه) */
export const CLOCK_DRIFT_WARN_MINUTES = 2;

// ─── EXP-1 — آشتی‌ساز (reconcile): مقایسهٔ فقط-گزارشی صندوق محلی با مرکز ───

/**
 * کلید نتیجهٔ آخرین مقایسهٔ آشتی‌ساز در انبار پیشرفت — منبع فیلد reconciliation در
 * GET /api/node-sync/status (نسخهٔ ۳). هیچ اصلاحی هرگز از این مسیر نمی‌گذرد؛ فقط گزارش.
 */
export const RECONCILE_KEY = 'nodesync:reconciliation-v1';
/** سقف ردیف‌های ناهم‌خوانی ذخیره‌شده — بریف EXP-1: حداکثر ۵ ورودی {domain, center, local} */
export const RECONCILE_MAX_DETAIL = 5;
/**
 * کلید بزرگ‌ترین updated_at مشاهده‌شدهٔ هر دامنه در استقرار — آینهٔ محلیِ
 * MAX(updated_at) FROM node_sync_inbox WHERE domain=? . موتور محلی per-domain max را در
 * هیچ مسیری نمی‌دهد (فقط GET /api/internal/sync/status با by_domain شمارش‌ها)؛ runner
 * تنها نویسندهٔ صندوق است، پس بیشینهٔ مشاهده‌شدهٔ همین ماژول = بیشینهٔ صندوق.
 */
export const LOCAL_MAX_KEY = 'nodesync:local-max-v1';
/** مسیر شمارش صندوق محلی — همان مبدا و همان گات سشنِ مسیر استقرار (internal-sync/routes.ts) */
const LOCAL_STATUS_PATH = '/api/internal/sync/status';

/** یک ردیف ناهم‌خوانی — شمارش مرکز و شمارش صندوق محلی همان دامنه */
export interface ReconcileDetailRow {
  domain: string;
  /** شمارش مرکز (count پاسخ /node/reconcile) */
  center: number;
  /** شمارش صندوق محلی (by_domain از GET /api/internal/sync/status) */
  local: number;
}

/** نتیجهٔ آخرین مقایسهٔ آشتی‌ساز — در RECONCILE_KEY انبار و در وضعیت v3 آینه می‌شود */
export interface NodeReconciliationV1 {
  v: 1;
  /** لحظهٔ مقایسه (ISO دستگاه) */
  at: string;
  /** true = همهٔ دامنه‌ها هم‌شمار؛ false = حداقل یک ناهم‌خوانی */
  ok: boolean;
  /** تعداد دامنه‌های ناهم‌خوان (صفر هنگام ok=true) */
  differences: number;
  /** حداکثر RECONCILE_MAX_DETAIL ردیف ناهم‌خوانی؛ هم‌خوانی کامل = null */
  detail: ReconcileDetailRow[] | null;
}

/** خروجی نرم یک دورهٔ آشتی‌ساز — هیچ مسیری throw نمی‌کند */
export type ReconcileOutcome =
  | { status: 'ok'; ok: boolean; differences: number }
  | { status: 'unavailable'; reason: string }

/** آخرین هندشیک نسخه/ساعت ثبت‌شده از پاسخ‌های مرکز — در NODE_VERSION_KEY انبار می‌شود */
export interface NodeVersionSeenV1 {
  v: 1;
  /** نسخهٔ خود نود (APP_VERSION هنگام ثبت) */
  client: string;
  /** نسخهٔ خود مرکز از پاسخ — پاسخ بدون فیلد = مقدار قبلی حفظ می‌شود */
  center: string | null;
  /** حداقل نسخهٔ نود اعلامی مرکز (min_node_version) */
  min_node: string | null;
  /** client ≥ min_node با compareSemver — min_node ناشناخته = سازگار فرض می‌شود */
  compatible: boolean;
  /** آخرین بار که پاسخی از مرکز ثبت شد (ISO دستگاه) */
  at: string | null;
  /** آخرین ساعت مرجع مرکز (server_ts) */
  server_ts: string | null;
  /** اختلاف ساعت دستگاه با مرکز — قدر مطلق به دقیقه (ناشناخته = null) */
  clock_drift_minutes: number | null;
  /** اختلاف بیش از CLOCK_DRIFT_WARN_MINUTES دقیقه */
  clock_warning: boolean;
}

/** نتیجهٔ کل دورهٔ catch-up — هیچ مسیری throw نمی‌کند؛ همه‌چیز در وضعیت است */
export type CatchUpStatus =
  | 'ok'
  | 'unconfigured'
  | 'auth_error'
  | 'version_error'
  | 'http_error'
  | 'network_error'
  | 'ingest_error'
  | 'push_failed';

export interface CatchUpOutcome {
  status: CatchUpStatus;
  /** فازی که دوره در آن تمام شد — done یعنی هر دو جهت کامل بود */
  phase: 'pull' | 'push' | 'done';
  http: number | null;
  /** پاکت خطای ابر یا کد وضعیت push (مثل throttled/outbox_error) */
  code: string | null;
  message: string | null;
  /** صفحات pull متعهدشده در همین دوره */
  pages: number;
  /** آیتم‌های استقراریافته در صندوق در همین دوره */
  items_pulled: number;
  by_domain: Record<string, number>;
  /** بسته‌های push ارسال‌شده در همین دوره */
  batches: number;
  items_pushed: number;
  /** دوباره‌هایی که ابر با PK شمرده است (مسیر resume — بدون ردیف دوباره) */
  duplicates_pushed: number;
  /** pull تا سیگنال پایان ابر رفت؟ (false = سقف/خطا — ادامه در دورهٔ بعد با cursor محفوظ) */
  pull_done: boolean;
  /** outbox تا انتها تخلیه شد؟ */
  push_done: boolean;
}

/** وضعیت catch-up برای UI — دقیقاً همان enum فیلد state در GET /api/node-sync/status */
export type CatchUpState = 'idle' | 'catching_up' | 'synced' | 'error' | 'offline';

export interface CatchUpStateV1 {
  v: 1;
  state: CatchUpState;
  started_at: string | null;
  last_run_at: string | null;
  pages_last_run: number;
  items_pulled_last_run: number;
  batches_last_run: number;
  items_pushed_last_run: number;
  last_error_kind: string | null;
  last_error_at: string | null;
  /**
   * موج ۱ (بقیهٔ ۱-۱) — خلاصهٔ آخرین دورهٔ جبرانیِ کامل (state=synced با دستاورد واقعی):
   * at = پایان دوره، pulled = آیتم‌های استقراریافته در صندوق، pushed = آیتم‌های محلی ackشدهٔ ابر.
   * دورهٔ ۰/۰ خلاصهٔ معنادار قبلی را پاک نمی‌کند (UI تا ۱۰ دقیقه «هم‌گام شد؛ N رکورد رسید» می‌دهد).
   */
  last_catchup: { at: string; pulled: number; pushed: number } | null;
}

/**
 * آینهٔ وضعیت فرانت‌اند به موتور محلی برای GET /api/node-sync/status — شکل دقیقش
 * NodeSyncStatusMirrorSchema در status.ts است؛ اینجا فقط نوع سازنده (بدون zod — چانک فرانت‌اند
 * وابستگی تازه نمی‌گیرد).
 */
export interface NodeSyncStatusMirror {
  v: 1;
  mode: 'auto' | 'quarantined' | 'paused_version';
  state: CatchUpState;
  last_pull_cursor_at: string | null;
  last_push_ok_at: string | null;
  last_pull_ok_at: string | null;
  last_error_kind: string | null;
  last_error_at: string | null;
  push_watermark: string | null;
  client_version: string | null;
  /** موج ۱ (۱-۴) — آخرین هندشیک نسخه از پاسخ‌های مرکز؛ هرگز هندشیک ندیده = null */
  version: { client: string; center: string; compatible: boolean } | null;
  /** موج ۱ (۱-۳) — قدر مطلق اختلاف ساعت دستگاه با مرکز به دقیقه؛ ناشناخته = null */
  clock_drift_minutes: number | null;
  /** موج ۱ (۱-۳) — اختلاف بیش از ۲ دقیقه */
  clock_warning: boolean;
  /** موج ۱ — خلاصهٔ آخرین دورهٔ جبرانی کامل {at, pulled, pushed}؛ هنوز هیچ دورهٔ کاملی نبوده = null */
  last_catchup: { at: string; pulled: number; pushed: number } | null;
  /**
   * EXP-1 (نسخهٔ ۳) — نتیجهٔ آخرین مقایسهٔ آشتی‌ساز؛ اختیاری تا آینهٔ قدیمی بدونِ آن هم
   * پذیرفته شود (هم‌قرارداد فیلدهای موج ۱). هنوز هیچ مقایسه‌ای نبوده = غایب.
   */
  reconciliation?: NodeReconciliationV1 | null;
  updated_at: string;
}

export interface SyncStatusV1 {
  v: 1;
  /** آخرین دورهٔ کامل موفق (ISO) */
  last_ok_at: string | null;
  /** خطای نرم آخرین دورهٔ ناموفق */
  last_error: string | null;
  last_error_at: string | null;
  /** جمع آیتم‌های آخرین دورهٔ موفق */
  items_last_run: number;
  by_domain: Record<string, number>;
  /** rust-f11 — آخرین دورهٔ push موفق به ابر (ISO) — اختیاری برای سازگاری رو به جلو */
  last_push_ok_at?: string | null;
  /** rust-f11 — خطای نرم آخرین push ناموفق (outbox/پوش) */
  last_push_error?: string | null;
}

export type SyncNowOutcome =
  | { status: 'ok'; items: number; pages: number; by_domain: Record<string, number> }
  | { status: 'unconfigured' }
  | { status: 'auth_error' }
  | { status: 'http_error'; http: number; code: string | null }
  | { status: 'network_error'; message: string }
  | { status: 'ingest_error'; http: number; message: string | null };

/** نتیجهٔ نرم pushNow (rust-f11) — هیچ مسیری throw نمی‌کند (قرارداد drill §۳-۱۱) */
export type PushNowOutcome =
  | { status: 'unconfigured' }
  | { status: 'ok'; sent: number }
  | { status: 'skipped' }
  | { status: 'push_failed'; code: string | null }
  | { status: 'network_error'; message: string }
  | { status: 'outbox_error'; http: number };

/** آیتم outbox موتور محلی — هم‌شکل قرارداد GET /api/internal/sync/outbox (rust-f11) */
interface OutboxItem {
  id: string;
  domain: string;
  at: string | null;
  payload: Record<string, unknown>;
}

/** قرارداد fetch زمان‌بند — پاسخ کامل Response یا ساده‌شدهٔ FetchLike (فقط status مصرف می‌شود) */
export type RunnerFetch = (
  input: string,
  init?: RequestInit
) => Promise<Response | { ok: boolean; status: number; json?: () => Promise<unknown> }>;

/** پاسخ fetch زمان‌بند پس از await — Response واقعی یا FetchLike ساده‌شدهٔ RunnerFetch */
type RunnerFetchRes = Awaited<ReturnType<RunnerFetch>>;

export interface NodeSyncRunnerOptions {
  baseUrl: string | null;
  nodeCode: string | null;
  nodeKey: string | null;
  /** انبار پیشرفت (cursor/مُهر/وضعیت) — پیش‌فرض localStorage وگرنه حافظهٔ فرایند */
  progressStorage?: NodeSyncStore;
  /** توکن سشن کارمند برای مسیر استقرار موتور (کلید cs.token پوسته) */
  tokenProvider?: () => string | null;
  /** fetch تزریق‌پذیر — قرارداد string-input (سازگار FetchLike اتصال ابر) */
  fetchFn?: RunnerFetch;
  now?: () => Date;
  maxPages?: number;
  /** مسیر استقرار — پیش‌فرض /api/internal/sync/ingest (همان مبدا) */
  ingestPath?: string;
}

export interface NodeSyncRunner {
  configured(): boolean;
  status(): SyncStatusV1;
  syncNow(): Promise<SyncNowOutcome>;
  /** rust-f11 — پوش نود: outbox موتور محلی → client.push → ابر؛ جدا از syncNow و جدا از watermark pull */
  pushNow(): Promise<PushNowOutcome>;
  /**
   * rust-f14 — همگام‌سازی جبرانی بوت: هر دو جهت تا تخلیهٔ کامل یا سقف، بدون گات ۱۵دقیقه‌ای
   * (فقط تیک دوره‌ای زیر گات می‌ماند). هیچ مسیری throw نمی‌کند.
   */
  catchUp(args?: { maxPages?: number; maxBatches?: number }): Promise<CatchUpOutcome>;
  /**
   * rust-f14 — آینهٔ وضعیت به موتور محلی برای GET /api/node-sync/status (فقط-افزودنی؛ نرم).
   * اختیاری است تا فِیک‌های آزمون ناچار به پیاده‌سازی نباشند.
   */
  mirrorStatus?(): void;
  resetStatus(): void;
}

function memoryStore(): NodeSyncStore {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

function defaultProgressStorage(): NodeSyncStore {
  const g = globalThis as { localStorage?: NodeSyncStore };
  return g.localStorage ?? memoryStore();
}

function emptyStatus(): SyncStatusV1 {
  return {
    v: 1,
    last_ok_at: null,
    last_error: null,
    last_error_at: null,
    items_last_run: 0,
    by_domain: {},
    last_push_ok_at: null,
    last_push_error: null
  };
}

function readStatus(storage: NodeSyncStore): SyncStatusV1 {
  try {
    const raw = storage.getItem(SYNC_STATUS_KEY);
    if (!raw) return emptyStatus();
    const p = JSON.parse(raw) as Partial<SyncStatusV1>;
    if (p?.v !== 1) return emptyStatus();
    return { ...emptyStatus(), ...p, v: 1 };
  } catch {
    return emptyStatus();
  }
}

/**
 * پارس دفاعی بدنهٔ outbox (rust-f11) — null یعنی بدنه خارج از قرارداد → خطای نرم.
 * آیتم خراب تک‌تک دور انداخته می‌شود تا یک عضو مسموم همهٔ پوش را نکشد.
 */
function parseOutbox(parsed: unknown): { items: OutboxItem[]; generatedAt: string | null } | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const data = (parsed as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return null;
  const d = data as { items?: unknown; generated_at?: unknown };
  if (!Array.isArray(d.items)) return null;
  const items: OutboxItem[] = [];
  for (const raw of d.items) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== 'string' || r.id.length === 0) continue;
    if (typeof r.domain !== 'string' || r.domain.length === 0) continue;
    if (!r.payload || typeof r.payload !== 'object' || Array.isArray(r.payload)) continue;
    items.push({
      id: r.id,
      domain: r.domain,
      at: typeof r.at === 'string' ? r.at : null,
      payload: r.payload as Record<string, unknown>
    });
  }
  return {
    items,
    generatedAt: typeof d.generated_at === 'string' && d.generated_at.length > 0 ? d.generated_at : null
  };
}

/** بزرگ‌ترین at معتبر آیتم‌ها — items صعودی‌اند ولی برای دفاع max حسابی می‌گیریم (rust-f11) */
function maxAtOf(items: readonly OutboxItem[]): string | null {
  let best: string | null = null;
  let bestT = Number.NaN;
  for (const it of items) {
    if (!it.at) continue;
    const t = Date.parse(it.at);
    if (Number.isNaN(t)) continue;
    if (Number.isNaN(bestT) || t > bestT) {
      bestT = t;
      best = it.at;
    }
  }
  return best;
}

// ─── rust-f14 — کمک‌سازهای catch-up (محض؛ بدون وابستگی تازه در چانک فرانت‌اند) ───

/** آیتم pull از دید catch-up — هم‌شکل NodePullItem کلاینت */
type CatchUpPullItem = NodePullItem;

/** پارس دفاعی بدنهٔ /node/pull — بدنهٔ خارج از قرارداد = null (خطای نرم، هم‌الگوی parseOutbox) */
function parsePullPage(parsed: unknown): { items: CatchUpPullItem[]; nextCursor: string | null } | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const data = (parsed as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return null;
  const d = data as { items?: unknown; next_cursor?: unknown };
  if (!Array.isArray(d.items)) return null;
  const items: CatchUpPullItem[] = [];
  for (const raw of d.items) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    // گارد شکل قرارداد استقرار (آینهٔ IngestItemSchema موتور محلی) — آیتم مسموم کل صفحه را
    // نمی‌کشد: آیتم ناسازگار هرگز قابل استقرار نیست؛ حذف نرم و cursor جلو می‌رود (حکم م۲۱۰).
    if (typeof r.id !== 'string' || r.id.length < 1 || r.id.length > 120) continue;
    if (typeof r.domain !== 'string' || r.domain.length < 1 || r.domain.length > 40) continue;
    if (typeof r.updated_at !== 'string' || r.updated_at.length < 4 || r.updated_at.length > 40) continue;
    if (!r.payload || typeof r.payload !== 'object' || Array.isArray(r.payload)) continue;
    items.push({ id: r.id, domain: r.domain, updated_at: r.updated_at, payload: r.payload as Record<string, unknown> });
  }
  return { items, nextCursor: typeof d.next_cursor === 'string' && d.next_cursor.length > 0 ? d.next_cursor : null };
}

/**
 * رمزگذار cursor از آخرین آیتم تحویل‌شده — آینهٔ encodeNodeCursor سمت ورکر (base64url JSON
 * {d,t,i}). برای پایانِ داده که ابر next_cursor=null می‌دهد: با cursor «آخرین آیتم» دورهٔ بعد
 * فقط آیتم‌های تازه‌تر می‌گیرند، نه بازخوانی تاریخ (فرانت‌اند از src/node-sync import ندارد).
 */
function encodeCursorOf(item: { domain: string; updated_at: string; id: string }): string {
  const json = JSON.stringify({
    d: item.domain.slice(0, 40),
    t: item.updated_at.slice(0, 40),
    i: item.id.slice(0, 200)
  });
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** یک میلی‌ثانیه عقب‌تر به شکل ISO — watermark برای «صفحهٔ پر» که ممکن است در وسط همان ثانیه بریده باشد */
function isoMinus1ms(iso: string): string | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Date(t - 1).toISOString();
}

/** چانک‌بندی ≤size — قرارداد سقف آیتم /node/push */
function chunksOf<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function emptyCatchUpState(): CatchUpStateV1 {
  return {
    v: 1,
    state: 'idle',
    started_at: null,
    last_run_at: null,
    pages_last_run: 0,
    items_pulled_last_run: 0,
    batches_last_run: 0,
    items_pushed_last_run: 0,
    last_error_kind: null,
    last_error_at: null,
    last_catchup: null
  };
}

/** خواندن وضعیت catch-up از انبار — غایب/خراب = خالی نرم */
function readCatchUpState(storage: NodeSyncStore): CatchUpStateV1 {
  try {
    const raw = storage.getItem(CATCHUP_STATE_KEY);
    if (!raw) return emptyCatchUpState();
    const p = JSON.parse(raw) as Partial<CatchUpStateV1>;
    if (p?.v !== 1) return emptyCatchUpState();
    return { ...emptyCatchUpState(), ...p, v: 1 };
  } catch {
    return emptyCatchUpState();
  }
}

/** حالت هماهنگ‌ساز از انبار مشترک — پارس دفاعی (runner مالک آن نیست، فقط برای آینهٔ وضعیت می‌خواند) */
function readCoordStateSafe(storage: NodeSyncStore): {
  mode: 'auto' | 'quarantined' | 'paused_version';
  last_error_kind: string;
  last_run_at: string | null;
  updated_at: string | null;
} | null {
  try {
    const raw = storage.getItem(SYNC_COORD_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Record<string, unknown>;
    const mode = p.mode === 'quarantined' || p.mode === 'paused_version' ? p.mode : 'auto';
    const kind = typeof p.last_error_kind === 'string' ? p.last_error_kind : 'none';
    return {
      mode,
      last_error_kind: kind,
      last_run_at: typeof p.last_run_at === 'string' ? p.last_run_at : null,
      updated_at: typeof p.updated_at === 'string' ? p.updated_at : null
    };
  } catch {
    return null;
  }
}

export function createNodeSyncRunner(opts: NodeSyncRunnerOptions): NodeSyncRunner {
  const progress = opts.progressStorage ?? defaultProgressStorage();
  const now = opts.now ?? (() => new Date());
  const maxPages = Math.max(1, opts.maxPages ?? SYNC_MAX_PAGES_DEFAULT);
  const ingestPath = opts.ingestPath ?? '/api/internal/sync/ingest';
  const fetchFn = opts.fetchFn ?? ((input: string, init?: RequestInit) => fetch(input, init));

  // انبار اعتبار برای client — راز از options می‌آید (هرگز در انبار نمی‌نشیند)،
  // cursor/مُهر از انبار پیشرفت خوانده/نوشته می‌شوند (کلیدهای استاندارد client).
  const credsStorage: NodeSyncStore = {
    getItem: (k) => {
      if (k === 'nodesync:node-code') return opts.nodeCode?.trim() || null;
      if (k === 'nodesync:node-key') return opts.nodeKey?.trim() || null;
      return progress.getItem(k);
    },
    setItem: (k, v) => progress.setItem(k, v)
  };

  const client = createNodeSyncClient({
    baseUrl: opts.baseUrl ?? '',
    storage: credsStorage,
    // runner فقط URL رشته‌ای می‌سازد — سازگاری نوع با قرارداد typeof fetch کلاینت
    fetchFn: fetchFn as unknown as typeof fetch,
    now
  });

  function writeStatus(next: SyncStatusV1): void {
    progress.setItem(SYNC_STATUS_KEY, JSON.stringify(next));
  }

  // ---- push (rust-f11): watermark پوش و ثبت وضعیت آن در همان SyncStatusV1 ----

  function readWatermark(): string | null {
    try {
      const raw = progress.getItem(PUSH_WATERMARK_KEY);
      return raw && !Number.isNaN(Date.parse(raw)) ? raw : null; // watermark خراب = ندیده بگیر
    } catch {
      return null;
    }
  }

  function writeWatermark(v: string): void {
    try {
      progress.setItem(PUSH_WATERMARK_KEY, v);
    } catch {
      // انبار ناموفق = نرم — دورهٔ بعد همان آیتم‌ها دوباره می‌روند (ابر duplicate را می‌شمارد)
    }
  }

  /** ثبت یک دورهٔ push موفق (حتی با sent:0) — خطای قبلی پاک می‌شود */
  function recordPushOk(): void {
    try {
      const st = readStatus(progress);
      writeStatus({ ...st, last_push_ok_at: now().toISOString(), last_push_error: null });
    } catch {
      // نرم — ثبت وضعیت هرگز pushNow را نمی‌کشد
    }
  }

  /** ثبت شکست نرم push/outbox — last_push_ok_at دست‌نخورده می‌ماند */
  function recordPushError(message: string): void {
    try {
      const st = readStatus(progress);
      writeStatus({ ...st, last_push_error: message });
    } catch {
      // نرم
    }
  }

  // ---- rust-f14 — catch-up: cursor دقیق، وضعیت دوره و آینهٔ وضعیت به موتور محلی ----

  /** cursor دقیق catch-up — غایب/'' = از صفحهٔ نخست؛ مقدار واقعی = ادامهٔ دقیق پس از آخرین تعهد */
  function readCatchUpCursor(): string | null {
    try {
      const raw = progress.getItem(CATCHUP_CURSOR_KEY);
      return raw && raw.length > 0 ? raw : null;
    } catch {
      return null;
    }
  }

  /**
   * تعهد cursor پس از commit صفحه — روی دو کلید می‌نشیند: کلید دقیق catch-up (حتی در پایان
   * داده cursor واقعی آخرین آیتم می‌ماند) و کلید استاندارد client تا تیک دوره‌ای هم از همین
   * نقطه ادامه دهد. نوشتن فقط «بعد از» استقرار موفق صفحه رخ می‌دهد — صفر اتلاف.
   */
  function writeCatchUpCursor(cursor: string | null): void {
    try {
      progress.setItem(CATCHUP_CURSOR_KEY, cursor ?? '');
    } catch {
      // انبار ناموفق = نرم — دورهٔ بعد همان صفحه دوباره می‌آید و PK صندوق دوباره‌ها را می‌کشد
    }
    try {
      progress.setItem(CLIENT_CURSOR_KEY, cursor ?? '');
    } catch {
      // نرم — هم‌قرارداد بالا
    }
  }

  function writeCatchUpState(patch: Partial<CatchUpStateV1> & { state: CatchUpState }): void {
    try {
      const prev = readCatchUpState(progress);
      progress.setItem(CATCHUP_STATE_KEY, JSON.stringify({ ...prev, ...patch, v: 1 }));
    } catch {
      // نرم — وضعیت هرگز catch-up را نمی‌کشد
    }
  }

  // ─── موج ۱ — هندشیک نسخه (۱-۴) و ساعت مرجع مرکز (۱-۳) ───

  /** خواندن نرم هندشیک نسخه از انبار — غایب/خراب = خالی سازگار */
  function readVersionSeen(): NodeVersionSeenV1 {
    try {
      const raw = progress.getItem(NODE_VERSION_KEY);
      if (!raw) return emptyVersionSeen();
      const p = JSON.parse(raw) as Partial<NodeVersionSeenV1>;
      if (p?.v !== 1) return emptyVersionSeen();
      return { ...emptyVersionSeen(), ...p, v: 1 };
    } catch {
      return emptyVersionSeen();
    }
  }

  function emptyVersionSeen(): NodeVersionSeenV1 {
    return {
      v: 1,
      client: APP_VERSION,
      center: null,
      min_node: null,
      compatible: true,
      at: null,
      server_ts: null,
      clock_drift_minutes: null,
      clock_warning: false
    };
  }

  /**
   * ثبت پاکت هندشیک از هر پاسخ موفق مرکز — pull/push، دورهٔ عادی و جبرانی (بند ۱-۳/۱-۴):
   *   • نسخه‌ها merge روی مقدار قبلی می‌شوند (پاسخِ بدون فیلد = قبلی می‌ماند)؛
   *   • compatible = APP_VERSION ≥ min_node_version با compareSemver (min_node ناشناخته = سازگار)؛
   *   • drift از server_ts نسبت به ساعت خود دستگاه — قدر مطلق به دقیقه؛ بیش از ۲ دقیقه = هشدار.
   * فقط-اطلاعاتی: این تابع رفتار سینک را عوض نمی‌کند؛ ناسازگاری را گزارش می‌دهد تا فقط
   * catchUp مسیر version_error بگیرد (تک‌مسیرِ گات نسخه، هم‌قرارداد ۴۲۶ receiving-سر).
   */
  function captureCenterEnvelope(data: unknown): { compatible: boolean; minNode: string | null } {
    const prev = readVersionSeen();
    let next = prev;
    if (data && typeof data === 'object') {
      const d = data as Record<string, unknown>;
      const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
      const center = str(d.center_version) ?? prev.center;
      const minNode = str(d.min_node_version) ?? prev.min_node;
      const compatible = minNode ? compareSemver(APP_VERSION, minNode) >= 0 : prev.compatible;
      let driftMinutes = prev.clock_drift_minutes;
      let warning = prev.clock_warning;
      const serverTs = str(d.server_ts);
      if (serverTs !== null) {
        const t = Date.parse(serverTs);
        if (!Number.isNaN(t)) {
          driftMinutes = Math.round(Math.abs(now().getTime() - t) / 60_000);
          warning = driftMinutes > CLOCK_DRIFT_WARN_MINUTES;
        }
      }
      next = {
        v: 1,
        client: APP_VERSION,
        center,
        min_node: minNode,
        compatible,
        at: now().toISOString(),
        server_ts: serverTs ?? prev.server_ts,
        clock_drift_minutes: driftMinutes,
        clock_warning: warning
      };
      try {
        progress.setItem(NODE_VERSION_KEY, JSON.stringify(next));
      } catch {
        // انبار ناموفق = نرم — هندشیک هرگز سینک را نمی‌کشد
      }
    }
    return { compatible: next.compatible, minNode: next.min_node };
  }

  // ─── EXP-1 — آشتی‌ساز: مقایسهٔ فقط-گزارشی، بدون هیچ اصلاحی ───

  /** خواندن نرم بیشینهٔ مشاهده‌شدهٔ هر دامنه — کلید غایب/خراب = جدول خالی */
  function readLocalMax(): Record<string, string> {
    try {
      const raw = progress.getItem(LOCAL_MAX_KEY);
      if (!raw) return {};
      const p = JSON.parse(raw) as unknown;
      if (!p || typeof p !== 'object' || Array.isArray(p)) return {};
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
        if (typeof k === 'string' && k.length > 0 && typeof v === 'string' && v.length > 0) out[k] = v;
      }
      return out;
    } catch {
      return {};
    }
  }

  /**
   * ثبت بیشینهٔ updated_at مشاهده‌شدهٔ هر دامنه پس از استقرار موفق — با هر صفحهٔ تعهدشده
   * جلو می‌رود (هرگز عقب نمی‌نشیند). این همان «MAX(updated_at) FROM node_sync_inbox» است
   * از دید runner — تنها نویسندهٔ صندوق همین ماژول است، پس مشاهدهٔ تجمعی = واقعیت صندوق.
   */
  function recordLocalMax(items: readonly { domain: string; updated_at: string }[]): void {
    if (items.length === 0) return;
    try {
      const cur = readLocalMax();
      let changed = false;
      for (const it of items) {
        const prev = cur[it.domain];
        if (prev === undefined || Date.parse(it.updated_at) > Date.parse(prev)) {
          cur[it.domain] = it.updated_at;
          changed = true;
        }
      }
      if (changed) progress.setItem(LOCAL_MAX_KEY, JSON.stringify(cur));
    } catch {
      // انبار ناموفق = نرم — آشتی‌ساز بعدی بدون بیشینهٔ محلی فقط شمارش را می‌سنجد
    }
  }

  /** خواندن نرم نتیجهٔ آخرین آشتی‌ساز — منبع فیلد reconciliation در آینهٔ وضعیت */
  function readReconciliation(): NodeReconciliationV1 | null {
    try {
      const raw = progress.getItem(RECONCILE_KEY);
      if (!raw) return null;
      const p = JSON.parse(raw) as Partial<NodeReconciliationV1>;
      if (p?.v !== 1 || typeof p.at !== 'string' || typeof p.ok !== 'boolean') return null;
      const differences = typeof p.differences === 'number' && p.differences >= 0 ? p.differences : 0;
      return { v: 1, at: p.at, ok: p.ok, differences, detail: Array.isArray(p.detail) ? p.detail.slice(0, RECONCILE_MAX_DETAIL) : null };
    } catch {
      return null;
    }
  }

  /** نوشتن نرم نتیجهٔ آشتی‌ساز — انبار ناموفق هیچ چیز را نمی‌شکند */
  function writeReconciliation(rec: NodeReconciliationV1): void {
    try {
      progress.setItem(RECONCILE_KEY, JSON.stringify(rec));
    } catch {
      // نرم
    }
  }

  /**
   * شمارش صندوق محلی بر حسب دامنه — همان گات و همان مبداِ مسیر استقرار (خواندن از
   * GET /api/internal/sync/status سمت موتور؛ محرک واقعی: SELECT COUNT(*) GROUP BY domain
   * روی node_sync_inbox در internal-sync/service.ts). هر خطا/بدنهٔ خارج از قرارداد = null.
   */
  async function localInboxCounts(): Promise<Record<string, number> | null> {
    try {
      const token = opts.tokenProvider?.() ?? null;
      if (!token) return null;
      const res = await fetchFn(LOCAL_STATUS_PATH, { method: 'GET', headers: { Authorization: `Bearer ${token}` } });
      if (res.status !== 200) return null;
      let parsed: unknown = null;
      try {
        if ('json' in res && typeof res.json === 'function') parsed = await res.json();
      } catch {
        parsed = null;
      }
      const byDomain = (parsed as { data?: { by_domain?: unknown } } | null)?.data?.by_domain;
      if (!byDomain || typeof byDomain !== 'object' || Array.isArray(byDomain)) return null;
      const out: Record<string, number> = {};
      for (const [d, n] of Object.entries(byDomain as Record<string, unknown>)) {
        if (typeof n === 'number' && Number.isFinite(n) && n >= 0) out[d] = Math.floor(n);
      }
      return out;
    } catch {
      return null;
    }
  }

  /**
   * دورهٔ آشتی‌ساز — پس از هر دورهٔ جبرانیِ کامل (state=synced) یک‌بار: شمارش و بیشینهٔ
   * updated_at هر دامنهٔ سفید pull بین مرکز و صندوق محلی مقایسه می‌شود و فقط «گزارش»
   * می‌شود — هیچ اصلاح/حذف/بازنویسی‌ای انجام نمی‌شود (قرارداد بریف EXP-1).
   * مقایسهٔ ناموفق (شبکه/اعتبار/درگاه محلی) نتیجهٔ قبلی را دست‌نخورده می‌گذارد.
   */
  async function reconcileNow(): Promise<ReconcileOutcome> {
    const localCounts = await localInboxCounts();
    if (localCounts === null) {
      return { status: 'unavailable', reason: 'شمارش صندوق محلی در دسترس نیست' };
    }
    const rec = await client.reconcile({ domains: [...NODE_PULL_DOMAINS] });
    if (rec.status !== 'ok') {
      return { status: 'unavailable', reason: `پاسخ مرکز: ${rec.status}` };
    }
    const localMax = readLocalMax();
    const detail: ReconcileDetailRow[] = [];
    for (const row of rec.domains) {
      // فقط دامنه‌های سفید pull سنجیده می‌شوند — بقیهٔ دامنه‌های پاسخ نادیده گرفته می‌شوند
      if (!(NODE_PULL_DOMAINS as readonly string[]).includes(row.domain)) continue;
      const localCount = localCounts[row.domain] ?? 0;
      let same = row.count === localCount;
      // مقایسهٔ بیشینه‌ها فقط وقتی هر دو سمت مُهر دارند — نبودِ مُهر با نبودِ ردیف هم‌معناست
      const centerMaxT = row.max_updated_at !== null ? Date.parse(row.max_updated_at) : Number.NaN;
      const localMaxIso = localMax[row.domain] ?? null;
      const localMaxT = localMaxIso !== null ? Date.parse(localMaxIso) : Number.NaN;
      if (!Number.isNaN(centerMaxT) && !Number.isNaN(localMaxT) && centerMaxT !== localMaxT) same = false;
      if (!same) {
        detail.push({ domain: row.domain, center: row.count, local: localCount });
        console.warn(
          `آشتی‌ساز: ناهم‌خوانی در دامنهٔ ${row.domain} — مرکز ${row.count}، این دستگاه ${localCount}`
        );
      }
    }
    const at = now().toISOString();
    if (detail.length === 0) {
      console.info('آشتی‌ساز: شمارش دامنه‌ها هم‌خوان است');
      writeReconciliation({ v: 1, at, ok: true, differences: 0, detail: null });
      return { status: 'ok', ok: true, differences: 0 };
    }
    writeReconciliation({
      v: 1,
      at,
      ok: false,
      differences: detail.length,
      detail: detail.slice(0, RECONCILE_MAX_DETAIL)
    });
    return { status: 'ok', ok: false, differences: detail.length };
  }

  /**
   * آینهٔ وضعیت به موتور محلی (POST /api/node-sync/status) — فقط-افزودنی: موتور به انبار
   * پیشرفت فرانت‌اند دسترسی ندارد و UI این قرارداد را از موتور می‌خواند؛ شکست آینه (وب/قطعی)
   * هیچ مسیری را نمی‌شکند و دادهٔ وضعیت محلی دست‌نخورده می‌ماند.
   */
  function mirrorStatus(): void {
    void (async () => {
      try {
        const token = opts.tokenProvider?.() ?? null;
        if (!token) return; // بدون سشن آینه ممکن نیست — نرم
        const st = readStatus(progress);
        const cu = readCatchUpState(progress);
        const co = readCoordStateSafe(progress);
        const vs = readVersionSeen();
        const hasError = Boolean(co && co.last_error_kind && co.last_error_kind !== 'none');
        const body: NodeSyncStatusMirror = {
          v: 1,
          mode: co?.mode ?? 'auto',
          state: cu.state,
          last_pull_cursor_at: st.last_ok_at,
          last_push_ok_at: st.last_push_ok_at ?? null,
          last_pull_ok_at: st.last_ok_at,
          last_error_kind: hasError ? (co?.last_error_kind ?? null) : null,
          last_error_at: hasError ? (co?.last_run_at ?? co?.updated_at ?? null) : null,
          push_watermark: readWatermark(),
          client_version: APP_VERSION, // موج ۱ — نسخهٔ خود نود (پیش‌تر قرارداد خالی بود؛ اکنون هندشیک داریم)
          version: vs.center
            ? { client: vs.client, center: vs.center, compatible: vs.compatible }
            : null, // هنوز هیچ پاسخی از مرکز نسخه را حمل نکرده = null
          clock_drift_minutes: vs.clock_drift_minutes,
          clock_warning: vs.clock_warning,
          last_catchup: cu.last_catchup ?? null,
          // EXP-1 — نتیجهٔ آخرین آشتی‌ساز (هیچ مقایسه‌ای نبوده = null نرم)
          reconciliation: readReconciliation(),
          updated_at: now().toISOString()
        };
        await fetchFn(STATUS_MIRROR_PATH, {
          method: 'POST',
          headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(body)
        });
        // پاسخ مصرف نمی‌شود — آینه فقط-افزودنی است
      } catch {
        // آینه هرگز نمی‌شکند (حکم م۲۱۰)
      }
    })();
  }

  return {
    configured() {
      return Boolean(opts.baseUrl && opts.nodeCode && opts.nodeKey);
    },

    status() {
      return readStatus(progress);
    },

    resetStatus() {
      writeStatus(emptyStatus());
    },

    async syncNow() {
      if (!opts.baseUrl || !opts.nodeCode || !opts.nodeKey) return { status: 'unconfigured' };

      const token = opts.tokenProvider?.() ?? null;
      let items = 0;
      let pages = 0;
      const by_domain: Record<string, number> = {};

      for (let page = 0; page < maxPages; page++) {
        const pull = await client.pull();
        if (pull.status !== 'ok') {
          const st = readStatus(progress);
          let message: string;
          if (pull.status === 'network_error') message = pull.message;
          else if (pull.status === 'http_error') message = `HTTP ${pull.http}${pull.code ? ` (${pull.code})` : ''}`;
          else message = pull.status;
          writeStatus({ ...st, last_error: message, last_error_at: now().toISOString() });
          if (pull.status === 'auth_error') return { status: 'auth_error' };
          if (pull.status === 'network_error') return { status: 'network_error', message: pull.message };
          if (pull.status === 'http_error') return { status: 'http_error', http: pull.http, code: pull.code };
          return { status: 'auth_error' }; // دست‌نیافتنی با اعتبار تنظیم‌شده — برای کامل بودن نوع
        }

        // موج ۱ — هندشیک نسخه/ساعت از پاسخ pull دورهٔ عادی هم ثبت می‌شود (فقط-ثبت؛ گات نسخهٔ
        // دورهٔ عادی با ۴۲۶/کد receiving-سر همان‌جا در classify هماهنگ‌ساز اعمال می‌شود)
        captureCenterEnvelope({
          center_version: pull.centerVersion,
          min_node_version: pull.minNodeVersion,
          server_ts: pull.serverTs
        });

        if (pull.items.length > 0) {
          if (!token) {
            const st = readStatus(progress);
            writeStatus({ ...st, last_error: 'توکن سشن در دسترس نیست', last_error_at: now().toISOString() });
            return { status: 'ingest_error', http: 0, message: 'توکن سشن در دسترس نیست' };
          }
          let res: { status: number };
          try {
            res = await fetchFn(ingestPath, {
              method: 'POST',
              headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ items: pull.items })
            });
          } catch (err) {
            const st = readStatus(progress);
            const message = err instanceof Error ? err.message : String(err);
            writeStatus({ ...st, last_error: `استقرار: ${message}`, last_error_at: now().toISOString() });
            return { status: 'ingest_error', http: 0, message };
          }
          if (res.status !== 200) {
            const st = readStatus(progress);
            writeStatus({ ...st, last_error: `استقرار: HTTP ${res.status}`, last_error_at: now().toISOString() });
            return { status: 'ingest_error', http: res.status, message: `HTTP ${res.status}` };
          }
          for (const it of pull.items) by_domain[it.domain] = (by_domain[it.domain] ?? 0) + 1;
          items += pull.items.length;
          recordLocalMax(pull.items); // EXP-1 — بیشینهٔ مشاهده‌شدهٔ هر دامنه برای آشتی‌ساز
        }

        pages += 1;
        if (!pull.nextCursor) break;
      }

      const st = readStatus(progress);
      writeStatus({
        ...st,
        last_ok_at: now().toISOString(),
        last_error: null,
        last_error_at: null,
        items_last_run: items,
        by_domain
      });
      return { status: 'ok', items, pages, by_domain };
    },

    // rust-f11 — پوش نود: outbox موتور محلی → client.push → ابر. جدا از syncNow؛
    // خطای outbox/پوش هرگز throw نمی‌شود و watermark فقط با موفقیت جلو می‌رود.
    async pushNow() {
      if (!opts.baseUrl || !opts.nodeCode || !opts.nodeKey) return { status: 'unconfigured' };

      // ۱) outbox موتور محلی — همان مبدا، فقط توکن سشن کارمند (نه اعتبار نود)؛ از watermark
      const since = readWatermark();
      const token = opts.tokenProvider?.() ?? null;
      if (!token) {
        recordPushError('توکن سشن در دسترس نیست');
        return { status: 'outbox_error', http: 0 };
      }
      let res: RunnerFetchRes;
      try {
        res = await fetchFn(`${OUTBOX_PATH}${since ? `?since=${encodeURIComponent(since)}` : ''}`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        recordPushError(`outbox: ${message}`);
        return { status: 'network_error', message };
      }
      if (res.status !== 200) {
        recordPushError(`outbox: HTTP ${res.status}`);
        return { status: 'outbox_error', http: res.status };
      }

      // ۲) پارس دفاعی بدنه — بدنهٔ خراب/خارج از قرارداد = خطای نرم outbox
      let parsed: unknown = null;
      try {
        if ('json' in res && typeof res.json === 'function') parsed = await res.json();
      } catch {
        parsed = null; // بدنهٔ خوانا نیست → پایین‌تر به‌عنوان outbox_error نرم دیده می‌شود
      }
      const box = parseOutbox(parsed);
      if (!box) {
        recordPushError(`outbox: HTTP ${res.status} (بدنهٔ خارج از قرارداد)`);
        return { status: 'outbox_error', http: res.status };
      }

      // ۳) outbox خالی → بدون هیچ push؛ watermark تا generated_at می‌رود
      if (box.items.length === 0) {
        if (box.generatedAt) writeWatermark(box.generatedAt);
        recordPushOk();
        return { status: 'ok', sent: 0 };
      }

      // ۴) push از راه کلاینت — گات ۱۵دقیقه‌ای و فهرست سفید همان‌جا اعمال می‌شود
      const push = await client.push({ items: box.items });
      if (push.status === 'ok' || push.status === 'throttled') {
        // موج ۱ — هندشیک نسخه/ساعت از پاسخ push دورهٔ عادی هم ثبت می‌شود (فقط-ثبت، نرم)
        captureCenterEnvelope({
          center_version: push.centerVersion,
          min_node_version: push.minNodeVersion,
          server_ts: push.serverTs
        });
      }
      if (push.status === 'ok') {
        // watermark = بزرگ‌ترین at آیتم‌های فرستاده (نبود at معتبر → generated_at)
        const mark = maxAtOf(box.items) ?? box.generatedAt;
        if (mark) writeWatermark(mark);
        recordPushOk();
        return { status: 'ok', sent: box.items.length };
      }
      if (push.status === 'skipped') {
        return { status: 'skipped' }; // گات کلاینت — watermark دست‌نخورده، دورهٔ بعد
      }

      // ۵) بقیهٔ وضعیت‌های client.push = شکست نرم — watermark دست‌نخورده می‌ماند
      if (push.status === 'network_error') {
        recordPushError(`push: ${push.message}`);
        return { status: 'network_error', message: push.message };
      }
      let code: string | null;
      if (push.status === 'http_error') {
        code = push.code;
        recordPushError(`push: HTTP ${push.http}${push.code ? ` (${push.code})` : ''}`);
      } else if (push.status === 'throttled') {
        code = 'throttled';
        recordPushError(`push: throttled${push.retryAfterS !== null ? ` (retry_after_s=${push.retryAfterS})` : ''}`);
      } else if (push.status === 'rejected_domains') {
        code = 'rejected_domains';
        recordPushError(`push: rejected_domains (${push.domains.join(',')})`);
      } else if (push.status === 'auth_error') {
        code = 'auth_error';
        recordPushError('push: auth_error');
      } else {
        code = 'unconfigured'; // دست‌نیافتنی — runner خودش اعتبار را پیش‌تر چک کرده
        recordPushError('push: unconfigured');
      }
      return { status: 'push_failed', code };
    },

    mirrorStatus,

    // rust-f14 — همگام‌سازی جبرانی (catch-up): پس از هفته‌ها آفلاین هر دو جهت «تا تخلیهٔ کامل
    // یا سقف» می‌رود. هیچ مسیری throw نمی‌کند (قرارداد drill §۳-۱۱)؛ قطعی وسط راه فقط وضعیت
    // می‌سازد — صفحات متعهدشده می‌مانند، cursor/watermark فقط بعد از تعهد جلو رفته‌اند و
    // دورهٔ بعد دقیقاً از همان‌جا ادامه می‌دهد (PK صندوق/ابر دوباره‌ها را می‌کشند).
    async catchUp(args) {
      const pageBound = Math.max(1, args?.maxPages ?? CATCHUP_MAX_PAGES_DEFAULT);
      const batchBound = Math.max(1, args?.maxBatches ?? CATCHUP_MAX_PUSH_BATCHES);
      const startedAt = now().toISOString();
      const outcome: CatchUpOutcome = {
        status: 'ok',
        phase: 'done',
        http: null,
        code: null,
        message: null,
        pages: 0,
        items_pulled: 0,
        by_domain: {},
        batches: 0,
        items_pushed: 0,
        duplicates_pushed: 0,
        pull_done: false,
        push_done: false
      };

      // ۰) اعتبار — کلید غایب = offline بدون هیچ fetch (drill §۳-۱۱)؛ آینهٔ وضعیت هم می‌نشیند
      if (!opts.baseUrl || !opts.nodeCode || !opts.nodeKey) {
        outcome.status = 'unconfigured';
        outcome.phase = 'pull';
        writeCatchUpState({
          state: 'offline',
          started_at: startedAt,
          last_run_at: now().toISOString(),
          pages_last_run: 0,
          items_pulled_last_run: 0,
          batches_last_run: 0,
          items_pushed_last_run: 0,
          last_error_kind: 'unconfigured',
          last_error_at: null
        });
        mirrorStatus();
        return outcome;
      }
      const baseUrl: string = opts.baseUrl;
      const nodeCode: string = opts.nodeCode;
      const nodeKey: string = opts.nodeKey;

      writeCatchUpState({ state: 'catching_up', started_at: startedAt, last_run_at: now().toISOString() });
      mirrorStatus();

      // ─── فاز pull: صفحه‌به‌صفحه تا سیگنال پایان ابر یا سقف؛ هر صفحه یک commit مستقل ───
      let cursor = readCatchUpCursor();
      let pullFailure: { status: CatchUpStatus; http: number | null; code: string | null; message: string | null } | null = null;

      for (let page = 0; page < pageBound; page += 1) {
        const pullUrl = new URL(`${baseUrl.replace(/\/+$/, '')}/node/pull`);
        pullUrl.searchParams.set('domains', NODE_PULL_DOMAINS.join(','));
        pullUrl.searchParams.set('limit', String(CATCHUP_PULL_LIMIT));
        if (cursor) pullUrl.searchParams.set('cursor', cursor);
        let res: RunnerFetchRes;
        try {
          res = await fetchFn(pullUrl.toString(), {
            method: 'GET',
            headers: { 'X-CP-Node-Code': nodeCode, Authorization: `Bearer ${nodeKey}` }
          });
        } catch (err) {
          pullFailure = { status: 'network_error', http: null, code: null, message: err instanceof Error ? err.message : String(err) };
          break;
        }
        if (res.status === 401) {
          pullFailure = { status: 'auth_error', http: 401, code: null, message: null };
          break;
        }
        if (res.status !== 200) {
          let errBody: unknown = null;
          try {
            if ('json' in res && typeof res.json === 'function') errBody = await res.json();
          } catch {
            errBody = null;
          }
          const envCode =
            errBody && typeof errBody === 'object' && typeof (errBody as Record<string, unknown>).error === 'string'
              ? ((errBody as Record<string, unknown>).error as string)
              : null;
          const isVersion = res.status === 426 || envCode === 'NODE_MIN_VERSION';
          pullFailure = { status: isVersion ? 'version_error' : 'http_error', http: res.status, code: envCode, message: null };
          break;
        }
        let parsed: unknown = null;
        try {
          if ('json' in res && typeof res.json === 'function') parsed = await res.json();
        } catch {
          parsed = null;
        }
        const pageData = parsePullPage(parsed);
        if (!pageData) {
          pullFailure = { status: 'http_error', http: res.status, code: 'NODE_PULL_BODY_INVALID', message: null };
          break;
        }

        // موج ۱ (۱-۴) — هندشیک نسخه/ساعت از هر پاسخ موفق pull ثبت می‌شود؛ ناسازگاری محلی
        // (APP_VERSION < min_node_version) = version_error بدون استقرار و بدون پوش —
        // هم‌رفتارِ مسیر ۴۲۶ receiving-سر (کد NODE_MIN_VERSION از ۱.۲۶.۱ آماده بود).
        const hand = captureCenterEnvelope((parsed as { data?: unknown } | null)?.data ?? null);
        if (!hand.compatible) {
          pullFailure = {
            status: 'version_error',
            http: null,
            code: 'NODE_MIN_VERSION',
            message:
              hand.minNode !== null
                ? `نسخهٔ نود ${APP_VERSION} کمتر از حداقل نسخهٔ مجاز مرکز (${hand.minNode}) است`
                : null
          };
          break;
        }

        // استقرار صفحه در موتور محلی = تعهد صفحه؛ cursor فقط «بعد از» پاسخ ۲۰۰ جلو می‌رود
        if (pageData.items.length > 0) {
          const token = opts.tokenProvider?.() ?? null;
          if (!token) {
            pullFailure = { status: 'ingest_error', http: 0, code: null, message: 'توکن سشن در دسترس نیست' };
            break;
          }
          let ingRes: RunnerFetchRes;
          try {
            ingRes = await fetchFn(ingestPath, {
              method: 'POST',
              headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ items: pageData.items })
            });
          } catch (err) {
            pullFailure = { status: 'ingest_error', http: 0, code: null, message: err instanceof Error ? err.message : String(err) };
            break;
          }
          if (ingRes.status !== 200) {
            pullFailure = { status: 'ingest_error', http: ingRes.status, code: null, message: `استقرار: HTTP ${ingRes.status}` };
            break;
          }
          for (const it of pageData.items) outcome.by_domain[it.domain] = (outcome.by_domain[it.domain] ?? 0) + 1;
          outcome.items_pulled += pageData.items.length;
          recordLocalMax(pageData.items); // EXP-1 — بیشینهٔ مشاهده‌شدهٔ هر دامنه برای آشتی‌ساز
        }

        outcome.pages += 1;
        const last = pageData.items.length > 0 ? pageData.items[pageData.items.length - 1] : null;
        if (pageData.nextCursor) {
          cursor = pageData.nextCursor;
          writeCatchUpCursor(cursor); // صفحه متعهد شد — cursor جلو می‌رود
        } else {
          // سیگنال پایان ابر — cursor دقیقِ آخرین آیتم می‌ماند تا دورهٔ بعد فقط تازه‌ترها بیایند؛
          // صفحهٔ خالی با cursor موجود یعنی هیچ تازه‌ای نیست — cursor دست‌نخورده می‌ماند.
          if (last) writeCatchUpCursor(encodeCursorOf(last));
          else if (!cursor) writeCatchUpCursor(null); // نخستین pull روی مرکز خالی
          outcome.pull_done = true;
          break;
        }
      }

      if (pullFailure) {
        outcome.status = pullFailure.status;
        outcome.phase = 'pull';
        outcome.http = pullFailure.http;
        outcome.code = pullFailure.code;
        outcome.message = pullFailure.message;
        const st = readStatus(progress);
        writeStatus({
          ...st,
          last_error:
            pullFailure.message ??
            (pullFailure.http ? `HTTP ${pullFailure.http}${pullFailure.code ? ` (${pullFailure.code})` : ''}` : pullFailure.status),
          last_error_at: now().toISOString()
        });
      } else {
        const st = readStatus(progress);
        writeStatus({
          ...st,
          last_ok_at: now().toISOString(),
          last_error: null,
          last_error_at: null,
          items_last_run: outcome.items_pulled,
          by_domain: outcome.by_domain
        });
      }

      // ─── فاز push: بسته‌های ≤۱۰۰ تا تخلیهٔ outbox یا سقف؛ گات ۱۵دقیقه‌ای فقط تیک دوره‌ای را ──
      // ── می‌بندد — catch-up با هدر اعلامی صریحاً می‌گذرد (قرارداد rust-f14 سمت ابر). ──
      const skipPush =
        outcome.status === 'unconfigured' || outcome.status === 'auth_error' || outcome.status === 'version_error';
      if (!skipPush) {
        const token = opts.tokenProvider?.() ?? null;
        if (!token) {
          recordPushError('توکن سشن در دسترس نیست');
          outcome.status = 'push_failed';
          outcome.phase = 'push';
          outcome.code = 'outbox_error';
          outcome.http = 0;
        } else {
          let pushFailure: { status: CatchUpStatus; http: number | null; code: string | null; message: string | null } | null = null;
          let watermark = readWatermark();
          for (;;) {
            if (outcome.batches >= batchBound) break; // سقف سالم — ادامه در دورهٔ بعد؛ watermark محفوظ
            let boxRes: RunnerFetchRes;
            try {
              boxRes = await fetchFn(`${OUTBOX_PATH}${watermark ? `?since=${encodeURIComponent(watermark)}` : ''}`, {
                method: 'GET',
                headers: { Authorization: `Bearer ${token}` }
              });
            } catch (err) {
              pushFailure = { status: 'network_error', http: null, code: 'outbox_error', message: err instanceof Error ? err.message : String(err) };
              break;
            }
            if (boxRes.status !== 200) {
              pushFailure = { status: 'push_failed', http: boxRes.status, code: 'outbox_error', message: `outbox: HTTP ${boxRes.status}` };
              break;
            }
            let boxParsed: unknown = null;
            try {
              if ('json' in boxRes && typeof boxRes.json === 'function') boxParsed = await boxRes.json();
            } catch {
              boxParsed = null;
            }
            const box = parseOutbox(boxParsed);
            if (!box) {
              pushFailure = { status: 'push_failed', http: boxRes.status, code: 'outbox_error', message: 'outbox: بدنهٔ خارج از قرارداد' };
              break;
            }
            if (box.items.length === 0) {
              if (box.generatedAt) writeWatermark(box.generatedAt);
              outcome.push_done = true;
              break;
            }
            let chunkFailure: { status: CatchUpStatus; http: number | null; code: string | null; message: string | null } | null = null;
            for (const chunk of chunksOf(box.items, CATCHUP_PUSH_CHUNK)) {
              if (outcome.batches >= batchBound) break; // سقف وسط صفحه — صفحهٔ متعهدنشده برای دورهٔ بعد می‌ماند
              let pushRes: RunnerFetchRes;
              try {
                pushRes = await fetchFn(`${baseUrl.replace(/\/+$/, '')}/node/push`, {
                  method: 'POST',
                  headers: {
                    'X-CP-Node-Code': nodeCode,
                    Authorization: `Bearer ${nodeKey}`,
                    [CATCHUP_HEADER]: '1' // اعلام دورهٔ جبرانی — گات ۱۵دقیقه‌ای سمت ابر این درخواست را نمی‌بندد
                  },
                  body: JSON.stringify({ items: chunk })
                });
              } catch (err) {
                chunkFailure = { status: 'network_error', http: null, code: null, message: err instanceof Error ? err.message : String(err) };
                break;
              }
              outcome.batches += 1;
              if (pushRes.status === 401) {
                chunkFailure = { status: 'auth_error', http: 401, code: null, message: null };
                break;
              }
              let pushBody: unknown = null;
              try {
                if ('json' in pushRes && typeof pushRes.json === 'function') pushBody = await pushRes.json();
              } catch {
                pushBody = null;
              }
              if (pushRes.status !== 200) {
                const envCode =
                  pushBody && typeof pushBody === 'object' && typeof (pushBody as Record<string, unknown>).error === 'string'
                    ? ((pushBody as Record<string, unknown>).error as string)
                    : null;
                const isVersion = pushRes.status === 426 || envCode === 'NODE_MIN_VERSION';
                chunkFailure = {
                  status: isVersion ? 'version_error' : 'push_failed',
                  http: pushRes.status,
                  code: envCode,
                  message: `push: HTTP ${pushRes.status}${envCode ? ` (${envCode})` : ''}`
                };
                break;
              }
              const data = (pushBody as { data?: { accepted?: unknown; duplicates?: unknown; throttled?: unknown; retry_after_s?: unknown } } | null)?.data;
              // موج ۱ (۱-۴) — هندشیک نسخه از پاسخ push هم ثبت می‌شود؛ ناسازگاری = توقف بسته‌ها
              // (watermark دست‌نخورده — بسته‌های ackشده در دورهٔ بعد دوباره می‌روند، ابر با PK می‌شمارد)
              const hand = captureCenterEnvelope(data ?? null);
              if (!hand.compatible) {
                chunkFailure = {
                  status: 'version_error',
                  http: null,
                  code: 'NODE_MIN_VERSION',
                  message:
                    hand.minNode !== null
                      ? `نسخهٔ نود ${APP_VERSION} کمتر از حداقل نسخهٔ مجاز مرکز (${hand.minNode}) است`
                      : null
                };
                break;
              }
              if (data?.throttled === true) {
                // زیر گات افتاد (مرکز قدیمی بدون هدر جبرانی؟) — می‌ایستیم؛ watermark دست‌نخورده
                chunkFailure = {
                  status: 'push_failed',
                  http: 200,
                  code: 'throttled',
                  message: 'push: throttled' + (typeof data.retry_after_s === 'number' ? ` (retry_after_s=${data.retry_after_s})` : '')
                };
                break;
              }
              const accepted = typeof data?.accepted === 'number' ? data.accepted : 0;
              const duplicates = typeof data?.duplicates === 'number' ? data.duplicates : 0;
              if (accepted <= 0 && duplicates <= 0) {
                // پاکت ناقص ۲۰۰ — محافظه‌کارانه می‌ایستیم؛ watermark جلو نمی‌رود تا آیتمی گم نشود
                chunkFailure = { status: 'push_failed', http: 200, code: 'NODE_PUSH_BODY_INVALID', message: 'push: پاکت پاسخ ناقص است' };
                break;
              }
              outcome.items_pushed += chunk.length;
              outcome.duplicates_pushed += duplicates;
            }
            if (chunkFailure) {
              pushFailure = chunkFailure;
              break; // watermark دست‌نخورده — بسته‌های ackشده در دورهٔ بعد دوباره می‌روند و ابر با PK می‌شمارد
            }
            // کل صفحهٔ outbox پذیرفته شد — watermark = بزرگ‌ترین at صفحه؛ اگر صفحه «پر» بود ممکن
            // است برش وسط همان ثانیه باشد → یک میلی‌ثانیه عقب‌تر تا هیچ آیتمِ هم‌ثانیه‌ای جا نماند
            // (دوباره‌ها سمت ابر با PK شمرده می‌شوند — بدون ردیف دوباره).
            const maxAt = maxAtOf(box.items);
            const mark = box.items.length >= CATCHUP_OUTBOX_PAGE_MAX && maxAt ? isoMinus1ms(maxAt) : maxAt ?? box.generatedAt;
            if (mark) {
              writeWatermark(mark);
              watermark = mark;
            }
          }

          if (pushFailure) {
            if (outcome.phase === 'done') outcome.phase = 'push';
            outcome.status = pushFailure.status;
            outcome.http = pushFailure.http;
            outcome.code = pushFailure.code;
            outcome.message = pushFailure.message;
            recordPushError(pushFailure.message ?? 'push ناموفق');
          } else {
            recordPushOk();
          }
        }
      }

      // ─── وضعیت نهایی دوره + خلاصهٔ تکمیل + آینهٔ تازه به موتور محلی ───
      const failed = outcome.status !== 'ok';
      const finalState: CatchUpState = failed
        ? 'error'
        : outcome.pull_done && outcome.push_done
          ? 'synced'
          : 'catching_up'; // سقف خورده ولی خطا ندارد — progress محفوظ است و دورهٔ بعد ادامه می‌دهد
      const statePatch: Partial<CatchUpStateV1> & { state: CatchUpState } = {
        state: finalState,
        last_run_at: now().toISOString(),
        pages_last_run: outcome.pages,
        items_pulled_last_run: outcome.items_pulled,
        batches_last_run: outcome.batches,
        items_pushed_last_run: outcome.items_pushed,
        last_error_kind: failed ? outcome.status : null,
        last_error_at: failed ? now().toISOString() : null
      };
      // موج ۱ (بقیهٔ ۱-۱) — خلاصهٔ دورهٔ کامل: فقط دورهٔ synced با دستاورد واقعی ثبت می‌شود؛
      // دورهٔ ۰/۰ خلاصهٔ معنادار قبلی را پاک نمی‌کند تا پیام «هم‌گام شد؛ N رکورد رسید»
      // در پنجرهٔ ۱۰دقیقه‌ای UI با تیک‌های بی‌خبر پوچ نشود.
      if (finalState === 'synced' && outcome.items_pulled + outcome.items_pushed > 0) {
        statePatch.last_catchup = {
          at: now().toISOString(),
          pulled: outcome.items_pulled,
          pushed: outcome.items_pushed
        };
      }
      writeCatchUpState(statePatch);
      // EXP-1 — آشتی‌ساز فقط پس از دورهٔ کامل هم‌گام (state=synced) و یک‌بار در همان دوره:
      // مقایسهٔ فقط-گزارشی مرکز↔صندوق محلی؛ هر خطا نرم است و دورهٔ catch-up را عوض نمی‌کند.
      if (finalState === 'synced') {
        try {
          await reconcileNow();
        } catch {
          // سپر دفاعی — آشتی‌ساز هرگز نمی‌شکند (قرارداد drill §۳-۱۱)
        }
      }
      mirrorStatus();
      return outcome;
    }
  };
}

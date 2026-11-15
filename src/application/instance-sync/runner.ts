/**
 * فاز B — رانر هم‌گامی میز↔ابر (docs/rust/server-cloud-update-design.md §۲-۴)
 *
 * جای اجرا: موتور محلی (adapter) همان‌جاست که SQLite مستقیم دارد — این ماژول با بوت اپ
 * (ثبت desktop-routes در api-routing) بیدار می‌شود و با زمان‌بند دوره‌ای + دکمهٔ
 * «هم‌گام‌سازی اکنون» می‌راند. داوری FWW و اعمال payload کار «هستهٔ سرویس» همین ماژول است
 * (service.ts/pull/push + winner.ts — همان کدی که ابر هم سرو می‌کند)؛ کار این فایل فقط
 * راندن دوره است: پیکربندی، state (schema_match + clock_warning)، بکاپ پیش از اعمال،
 * چانک‌خوانی/ارسال با cursor، اعمال echo (همگرایی بازنده)، audit و آینهٔ وضعیت.
 *
 * قرارداد ثابت (سند مأموریت فاز B):
 *   • پیکربندی: <dataDir>/cloud-config.json = {url, device_id, interval_ms?} — بدون هیچ secret
 *   • راز فقط از env: ENGINE_CLOUD_SECRET (پوستهٔ Rust از مخزن امن تزریق می‌کند) — سرایند
 *     Bearer فراخوانی‌های ماشینی + هدر X-Device-Id (گیت زیراپ instance-sync سمت ابر)
 *   • endpointهای ماشینی ابر (routes.ts — همان باندل، هر دو سو): GET state · POST pull
 *     ({since:{tables}}) · POST push ({device_id, tables}) — push پاسخ echo دارد
 *     (برندهٔ نهایی هر pk؛ null=حذف)
 *   • قاعدهٔ قطعی تداخل: برنده = زودترتشکیل‌شده (داور winner.ts — قطعی و متقارن)
 *
 * cursorها در dataDir/sync-state.json از طریق binding CLOUD_FS (پل CloudFsIO در
 * adapter/server.mjs — باندل ورکر هرگز node:fs import نمی‌کند)؛ هر cursor جفت‌محوره است
 * {rows, deleted} — عین SyncCursorPair هستهٔ سرویس. آینهٔ آخرین نتیجه در جدول settings
 * (کلید CLOUD_SYNC_LAST_KEY) — همان الگوی آینهٔ node-sync/status.
 */
import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import { ConflictError, ValidationError } from '@core/errors';
import type { BackupService } from '@app/backup/service';
// هستهٔ سرویس و فهرست جداول و داور — منبع واحد داوری FWW (همان کدی که ابر سرو می‌کند)
import { pull as localPull, push as localPushService } from './service';
import type { PullResult, PushPayload, PushResult, SyncCursorPair } from './service';
import { SYNC_TABLES as MACHINE_SYNC_TABLES, syncTableMeta } from './tables';
import { parseCursorPair } from './winner';

// ─── ثابت‌های قرارداد ───

/** cursor اولیه — نه null: مقایسه‌ها از این اپوک قطعی و کل‌مرتب می‌مانند */
export const SYNC_EPOCH_CURSOR = '1970-01-01T00:00:00.000Z';
/** فاصلهٔ پیش‌فرض هم‌گامی دوره‌ای: ۱۰ دقیقه */
export const CLOUD_SYNC_DEFAULT_INTERVAL_MS = 600_000;
/** کف فاصلهٔ هم‌گامی — زیر این مقدار با کف جایگزین می‌شود */
export const CLOUD_SYNC_MIN_INTERVAL_MS = 60_000;
/** آستانهٔ هشدار ساعت: انحراف بیش از ۱۲۰ ثانیه → clock_warning */
export const CLOUD_SYNC_MAX_CLOCK_DRIFT_MS = 120_000;
/** چرخش بکاپ پیش از اعمال — ۳ فایل آخر نگه داشته می‌شود */
export const CLOUD_SYNC_BACKUP_KEEP = 3;
export const CLOUD_CONFIG_FILE = 'cloud-config.json';
export const CLOUD_SYNC_STATE_FILE = 'sync-state.json';
export const CLOUD_SYNC_AUDIT_ACTION = 'cloud.sync';
export const CLOUD_CLONE_AUDIT_ACTION = 'cloud.clone';
export const CLOUD_UNLINK_AUDIT_ACTION = 'cloud.unlink';
/** کلید آینهٔ آخرین نتیجه در settings — شکل ثابت UI */
export const CLOUD_SYNC_LAST_KEY = 'cloudsync:last-sync-v1';

/** جفت‌محورهٔ اپوک — مبنای cursor غایب هر جدول */
const EPOCH_PAIR: SyncCursorPair = { rows: SYNC_EPOCH_CURSOR, deleted: SYNC_EPOCH_CURSOR };

// ─── پل فایل‌های ابری (CLOUD_FS از adapter/server.mjs — الگوی CloudFsIO) ───

export interface CloudFsIO {
  readText(name: string): Promise<string | null>;
  writeText(name: string, text: string): Promise<void>;
  remove(name: string): Promise<void>;
  /** نام فایل‌های هم‌پیشوند، تازه‌ترین (بزرگ‌ترین مُهر) اول */
  list(prefix: string): Promise<string[]>;
  /** مسیر مطلق dataDir — برای نمایش backup_path به کاربر */
  dir(): string;
}

// ─── پیکربندی ───

export interface CloudSyncConfig {
  url: string;
  device_id: string;
  interval_ms: number;
}

/** پارس خالص payload پیکربندی — https فقط؛ interval با کف ۶۰۰۰۰ و پیش‌فرض ۶۰۰۰۰۰ */
export function parseCloudConfigPayload(raw: unknown): {
  url: string;
  interval_ms: number;
  device_id: string | null;
} | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const rawUrl = typeof obj.url === 'string' ? obj.url.trim() : '';
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  // قرارداد ثابت: نشانی ابر فقط https (راز در سرایند درخواست‌ها می‌رود — HTTP هرگز)
  if (parsed.protocol !== 'https:' || !parsed.hostname) return null;
  const intervalRaw = typeof obj.interval_ms === 'number' ? obj.interval_ms : Number(obj.interval_ms);
  const interval =
    Number.isFinite(intervalRaw) && intervalRaw > 0
      ? Math.max(CLOUD_SYNC_MIN_INTERVAL_MS, Math.trunc(intervalRaw))
      : CLOUD_SYNC_DEFAULT_INTERVAL_MS;
  const device = typeof obj.device_id === 'string' && obj.device_id.trim() ? obj.device_id.trim() : null;
  return {
    url: `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/+$/, '')}`,
    interval_ms: interval,
    device_id: device
  };
}

/**
 * خواندن پیکربندی از dataDir/cloud-config.json؛ device_id غایب → UUID خودکار و ذخیرهٔ
 * فایل (ثبت یک‌بار برای همیشه — device per install طبق سند طراحی §۲-۴). فایل غایب/خراب
 * یا نشانی غیر-https → null (پیکربندی‌نشده — هم‌گامی خاموش).
 */
export async function readCloudConfig(fs: CloudFsIO | null): Promise<CloudSyncConfig | null> {
  if (!fs) return null;
  const text = await fs.readText(CLOUD_CONFIG_FILE).catch(() => null);
  if (!text) return null;
  let raw: unknown = null;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = parseCloudConfigPayload(raw);
  if (!parsed) return null;
  let device_id = parsed.device_id;
  if (!device_id) {
    device_id = crypto.randomUUID();
    // ثبت UUID بهترین‌تلاش است؛ اگر نوشتن شکست خورد همان UUID این دوره مصرف می‌شود
    try {
      await fs.writeText(
        CLOUD_CONFIG_FILE,
        JSON.stringify({ url: parsed.url, device_id, interval_ms: parsed.interval_ms }, null, 2) + '\n'
      );
    } catch {
      /* بهترین‌تلاش */
    }
  }
  return { url: parsed.url, device_id, interval_ms: parsed.interval_ms };
}

// ─── خطای هم‌گامی (نگاشت مسیر → وضعیت HTTP در desktop-routes) ───

export class CloudSyncError extends Error {
  constructor(
    /** offline = شبکه/پاسخ نامعتبر؛ auth = رد Bearer از ابر */
    readonly kind: 'offline' | 'auth',
    message: string
  ) {
    super(message);
    this.name = 'CloudSyncError';
  }
}

// ─── cursorها — انبار dataDir/sync-state.json (پل CLOUD_FS) ───

export interface SyncCursors {
  /** cursor pull بر جدول — جفت‌محوره {rows, deleted} (قرارداد هستهٔ سرویس) */
  pull: Record<string, SyncCursorPair>;
  /** cursor push بر جدول — جفت‌محوره؛ فقط پس از تراکنش موفق جلو می‌رود */
  push: Record<string, SyncCursorPair>;
}

export async function readSyncCursors(fs: CloudFsIO | null): Promise<SyncCursors> {
  const empty: SyncCursors = { pull: {}, push: {} };
  if (!fs) return empty;
  const text = await fs.readText(CLOUD_SYNC_STATE_FILE).catch(() => null);
  if (!text) return empty;
  try {
    const raw = JSON.parse(text) as Partial<SyncCursors> | null;
    if (!raw || typeof raw !== 'object') return empty;
    const pick = (v: unknown): Record<string, SyncCursorPair> =>
      v && typeof v === 'object' ? (v as Record<string, SyncCursorPair>) : {};
    return { pull: pick(raw.pull), push: pick(raw.push) };
  } catch {
    return empty;
  }
}

export async function writeSyncCursors(fs: CloudFsIO | null, cursors: SyncCursors): Promise<void> {
  if (!fs) return;
  try {
    await fs.writeText(CLOUD_SYNC_STATE_FILE, JSON.stringify(cursors, null, 2) + '\n');
  } catch {
    /* بهترین‌تلاش — cursor کهنه یعنی دورهٔ بعد همان بازه را دوباره می‌خواند (امن) */
  }
}

/** cursor مؤثر pull یک جدول — غایب → جفت اپوک */
export function pullCursorOf(cursors: SyncCursors, table: string): SyncCursorPair {
  const c = cursors.pull[table];
  return c && typeof c.rows === 'string' && typeof c.deleted === 'string' ? c : { ...EPOCH_PAIR };
}

/** cursor مؤثر push یک جدول — غایب → جفت اپوک */
export function pushCursorOf(cursors: SyncCursors, table: string): SyncCursorPair {
  const c = cursors.push[table];
  return c && typeof c.rows === 'string' && typeof c.deleted === 'string' ? c : { ...EPOCH_PAIR };
}

// ─── اعمال echo پاسخ push — همگرایی بازنده ───

/**
 * echo هر جدول: {pk کانونی: ردیف برنده نهایی | null=حذف} — برندهٔ ابر عیناً می‌نشیند
 * (INSERT OR REPLACE با برش به ستون‌های واقعی اسکیما) و null یعنی DELETE. کل echo در یک
 * batch اتمیک — شکست یعنی cursor دست نمی‌خورد (هم‌گامی از سرِ امن).
 */
export async function applyEcho(
  db: DbClient,
  table: string,
  echo: Record<string, unknown | null>,
  columnsCache?: Map<string, string[]>
): Promise<number> {
  const meta = syncTableMeta(table);
  if (!meta || Object.keys(echo).length === 0) return 0;
  let cols = columnsCache?.get(table);
  if (!cols) {
    const info = await db.query<{ name: string }>(`PRAGMA table_info("${table}")`);
    cols = info.map((r) => r.name);
    columnsCache?.set(table, cols);
  }
  const statements: D1PreparedStatement[] = [db.prepare('PRAGMA defer_foreign_keys = ON')];
  let applied = 0;
  for (const [pkValue, winner] of Object.entries(echo)) {
    const parts = pkValue.split('|');
    if (parts.length !== meta.pk.length || parts.some((p) => p === '')) continue; // pk بدشکل — رد
    if (winner === null || winner === undefined) {
      statements.push(
        db.prepare(
          `DELETE FROM "${table}" WHERE ${meta.pk.map((c) => `"${c}" = ?`).join(' AND ')}`,
          parts
        )
      );
      applied += 1;
      continue;
    }
    if (typeof winner !== 'object' || Array.isArray(winner)) continue;
    const row = winner as Record<string, unknown>;
    const colList = cols.map((c) => `"${c}"`).join(', ');
    const placeholders = cols.map(() => '?').join(', '); // IN-bounded: به تعداد ستون‌های schema جدول echo (ستون‌های واقعی ردیف برنده) — متغیر کاربر نیست
    statements.push(
      db.prepare(`INSERT OR REPLACE INTO "${table}" (${colList}) VALUES (${placeholders})`, cols.map((c) => (row[c] === undefined ? null : row[c])))
    );
    applied += 1;
  }
  if (statements.length > 1) {
    try {
      await db.batch(statements);
    } catch (err) {
      throw new ValidationError(`اعمال echo ابر روی جدول «${table}» ناموفق بود: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return applied;
}

// ─── وابستگی‌ها ───

export interface CloudSyncDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
  /** پل فایل‌های ابری — binding CLOUD_FS (adapter)؛ غایب = قابلیت خاموش */
  fs: CloudFsIO | null;
  /** bindingهای محیط — خواندن ENGINE_CLOUD_SECRET از این‌جاست */
  env: Record<string, unknown>;
  /** سرویس پشتیبان موجود — بکاپ پیش از اعمال و کلون با همان export/inspect/restore */
  backup: Pick<BackupService, 'buildExportStream' | 'inspect' | 'restore'> | null;
  /** تزریق تست — پیش‌فرض fetch سراسری */
  fetchCloud?: (input: string, init?: RequestInit) => Promise<Response>;
  /** ساعت تزریقی برای clock_warning (پیش‌فرض Date.now) */
  now?: () => number;
}

/** راز از env — هرگز در لاگ/audit/پاسخ نمی‌رود؛ فقط سرایند Bearer */
export function cloudSecretOf(env: Record<string, unknown> | null | undefined): string | null {
  const raw = env?.ENGINE_CLOUD_SECRET;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

export type CloudSyncRunKind = 'synced' | 'error' | 'offline' | 'in_flight' | 'unconfigured' | 'no_secret';

export interface CloudSyncRunResult {
  kind: CloudSyncRunKind;
  pulled: number;
  pushed: number;
  conflicts_new: number;
  duration_ms: number;
  error: string | null;
}

/** آینهٔ آخرین نتیجه در settings — شکل ثابت UI قرارداد status */
export interface CloudLastSyncMirror {
  at: string;
  result: 'synced' | 'error' | 'offline';
  pulled: number;
  pushed: number;
  conflicts_new: number;
  duration_ms: number;
  error: string | null;
  clock_warning?: boolean;
  schema_match?: boolean | null;
}

async function readLastSyncMirror(db: DbClient): Promise<CloudLastSyncMirror | null> {
  try {
    const row = await db.queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [CLOUD_SYNC_LAST_KEY]);
    if (!row?.value) return null;
    const parsed = JSON.parse(row.value) as CloudLastSyncMirror;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.result !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeLastSyncMirror(db: DbClient, mirror: CloudLastSyncMirror): Promise<void> {
  try {
    await db.execute(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      [CLOUD_SYNC_LAST_KEY, JSON.stringify(mirror)]
    );
  } catch {
    /* بهترین‌تلاش */
  }
}

// ─── single-flight ───

let cloudSyncInFlight = false;

export function isCloudSyncRunning(): boolean {
  return cloudSyncInFlight;
}

// ─── فراخوانی‌های ماشینی ابر (گیت Bearer + X-Device-Id سمت ابر) ───

interface CloudCallCtx {
  deps: CloudSyncDeps;
  config: CloudSyncConfig;
  secret: string;
}

function cloudHeaders(call: CloudCallCtx, jsonBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${call.secret}`, // راز فقط در سرایند — هرگز در بدنه/لاگ
    'x-device-id': call.config.device_id
  };
  if (jsonBody) headers['content-type'] = 'application/json';
  return headers;
}

async function cloudFetch(call: CloudCallCtx, path: string, init?: RequestInit): Promise<Response> {
  const doFetch = call.deps.fetchCloud ?? ((input: string, i?: RequestInit) => fetch(input, i));
  let res: Response;
  try {
    res = await doFetch(`${call.config.url}${path}`, init);
  } catch {
    throw new CloudSyncError('offline', 'اتصال به ابر برقرار نشد — اینترنت یا نشانی ورکر را بررسی کنید');
  }
  if (res.status === 401 || res.status === 403) {
    throw new CloudSyncError('auth', 'احراز نزد ابر ناموفق بود — راز اتصال ابری را به‌روزرسانی کنید');
  }
  if (!res.ok) {
    throw new CloudSyncError('offline', `ابر پاسخ نامعتبر داد (${res.status})`);
  }
  return res;
}

/** state مقصد + مُهر ساعت مرجع از سراند Date پاسخ (InstanceState server_time ندارد) */
async function fetchCloudState(call: CloudCallCtx): Promise<{ appliedMigrations: number | null; serverTimeMs: number | null }> {
  const res = await cloudFetch(call, '/api/instance-sync/state', { method: 'GET', headers: cloudHeaders(call, false) });
  const body = unwrapData(await res.json().catch(() => null));
  const applied = typeof body.applied_migrations === 'number' ? body.applied_migrations : null;
  // ساعت مرجع ابر از سراند استاندارد Date — مبناي clock_warning (انحراف > ۱۲۰ث)
  const dateHeader = res.headers.get('date');
  const serverMs = dateHeader ? Date.parse(dateHeader) : NaN;
  return { appliedMigrations: applied, serverTimeMs: Number.isNaN(serverMs) ? null : serverMs };
}

async function pullFromCloud(call: CloudCallCtx, since: { tables?: Record<string, Partial<SyncCursorPair>> }): Promise<PullResult> {
  const res = await cloudFetch(call, '/api/instance-sync/pull', {
    method: 'POST',
    headers: cloudHeaders(call, true),
    body: JSON.stringify({ since })
  });
  const body = unwrapData(await res.json().catch(() => null));
  if (!body || typeof body.tables !== 'object' || body.tables === null) {
    throw new CloudSyncError('offline', 'پاسخ pull ابر شکل قراردادی ندارد');
  }
  return { tables: body.tables as PullResult['tables'] };
}

async function pushToCloud(call: CloudCallCtx, payload: PushPayload): Promise<PushResult> {
  const res = await cloudFetch(call, '/api/instance-sync/push', {
    method: 'POST',
    headers: cloudHeaders(call, true),
    body: JSON.stringify({ device_id: call.config.device_id, tables: payload.tables ?? {} })
  });
  const body = unwrapData(await res.json().catch(() => null));
  if (!body || typeof body.tables !== 'object' || body.tables === null) {
    throw new CloudSyncError('offline', 'پاسخ push ابر شکل قراردادی ندارد');
  }
  return body as unknown as PushResult;
}

function unwrapData(body: unknown): Record<string, unknown> {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const obj = body as Record<string, unknown>;
    if (obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)) {
      return obj.data as Record<string, unknown>;
    }
    return obj;
  }
  return {};
}

/** شمارش مایگریشن‌های اعمال‌شده محلی از جدول رهگیری موجود (هیچ‌کدام → null = نامعلوم) */
async function readLocalMigrationCount(db: DbClient): Promise<number | null> {
  for (const table of ['_migrations', 'd1_migrations', 'schema_migrations']) {
    try {
      const row = await db.queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM "${table}"`);
      if (row && Number(row.n) > 0) return Number(row.n);
    } catch {
      /* جدول بعدی */
    }
  }
  return null;
}

// ─── بکاپ پیش از اعمال (export سرویس پشتیبان موجود → فایل با چرخش) ───

async function writeCloudBackupFile(
  deps: CloudSyncDeps,
  opts: { kind: 'pre' | 'clone'; includeFiles: boolean; now: () => number }
): Promise<{ name: string; path: string; bytes: number; tables: number }> {
  if (!deps.fs) throw new ValidationError('پل فایل‌های ابری (CLOUD_FS) در دسترس نیست — هم‌گامی فقط در موتور محلی معنا دارد');
  if (!deps.backup) throw new ValidationError('سرویس پشتیبان در دسترس نیست — بکاپ پیش از اعمال ممکن نشد');
  const text = await new Response(deps.backup.buildExportStream(opts.includeFiles)).text();
  // نام با مُهر میلی‌ثانیه + پسوند یونیکد — دو دوره در یک میلی‌ثانیه هم نام یکسان نمی‌گیرند
  // (چرخش ۳فایلی و آزمون چرخش به تمایز قطعی نام‌ها تکیه دارند)
  const name = `cloud-sync-${opts.kind}-${opts.now()}-${crypto.randomUUID().slice(0, 8)}.json`;
  await deps.fs.writeText(name, text);
  let tables = 0;
  try {
    tables = Object.keys(JSON.parse(text).tables ?? {}).length;
  } catch {
    tables = 0;
  }
  return { name, path: `${deps.fs.dir()}/${name}`, bytes: text.length, tables };
}

/** چرخش بکاپ‌های pre — فقط ۳ فایل آخر می‌ماند (بکاپ‌های clone بدون چرخش نگه داشته می‌شوند) */
async function rotateCloudBackups(deps: CloudSyncDeps, keep: number): Promise<number> {
  if (!deps.fs) return 0;
  const names = await deps.fs.list('cloud-sync-pre-').catch(() => []);
  let removed = 0;
  for (const name of names.slice(keep)) {
    await deps.fs.remove(name).catch(() => undefined);
    removed += 1;
  }
  return removed;
}

// ─── دور کامل هم‌گامی ───

/**
 * دور کامل هم‌گامی میز↔ابر. برگشت همیشه JSON آرام است (هرگز throw نمی‌کند) — مسیر
 * run-now و زمان‌بند هر دو همین شکل را مصرف می‌کنند. cursorها فقط پس از تراکنش موفق
 * جلو می‌روند؛ آفلاین بدون ردیف audit (بی‌اسپم) و با آینهٔ نتیجه.
 */
export async function runCloudSync(deps: CloudSyncDeps, trigger: 'manual' | 'auto'): Promise<CloudSyncRunResult> {
  const started = deps.now?.() ?? Date.now();
  const base: CloudSyncRunResult = { kind: 'error', pulled: 0, pushed: 0, conflicts_new: 0, duration_ms: 0, error: null };
  if (cloudSyncInFlight) return { ...base, kind: 'in_flight', error: 'هم‌گام‌سازی در جریان است' };
  cloudSyncInFlight = true;
  // release در «همهٔ» مسیرهای خروج صدا زده می‌شود — گیر کردن پرچم یعنی هم‌گامی برای همیشه in_flight
  const finish = (result: CloudSyncRunResult): CloudSyncRunResult => {
    cloudSyncInFlight = false;
    return { ...result, duration_ms: result.duration_ms > 0 ? result.duration_ms : (deps.now?.() ?? Date.now()) - started };
  };
  try {
    const config = await readCloudConfig(deps.fs);
    if (!config) return finish({ ...base, kind: 'unconfigured', error: 'اتصال ابری تنظیم نشده است' });
    const secret = cloudSecretOf(deps.env);
    if (!secret) return finish({ ...base, kind: 'no_secret', error: 'راز اتصال ابری در پوسته ذخیره نشده است' });
    const call: CloudCallCtx = { deps, config, secret };
    deps.logger.info('cloud.sync.start', { trigger, url: config.url, device_id: config.device_id });
    const columnsCache = new Map<string, string[]>();

    // ① state — schema_match (شمارش مایگریشن‌ها) + clock_warning (سراند Date؛ انحراف > ۱۲۰ث)
    const state = await fetchCloudState(call);
    const nowMs = deps.now?.() ?? Date.now();
    const clockWarning =
      state.serverTimeMs !== null && Math.abs(nowMs - state.serverTimeMs) > CLOUD_SYNC_MAX_CLOCK_DRIFT_MS;
    const localMigrations = await readLocalMigrationCount(deps.db);
    const schemaMatch =
      localMigrations !== null && state.appliedMigrations !== null ? localMigrations === state.appliedMigrations : null;
    if (schemaMatch === false) {
      return finish(
        await finishWithMirror(
          deps,
          {
            kind: 'error',
            error: 'نسخهٔ اسکیما با ابر هم‌خوان نیست — یک سو را به‌روزرسانی کنید',
            pulled: 0,
            pushed: 0,
            conflicts_new: 0,
            clockWarning,
            schemaMatch
          },
          started
        )
      );
    }

    const cursors = await readSyncCursors(deps.fs);
    let pulled = 0;
    let pushed = 0;
    let conflictsNew = 0;

    // ② pull چانکی از ابر — همهٔ جداول قرارداد در یک فراخوانی (سقف/برش سمت هستهٔ سرویس)
    for (let guard = 0; guard < 2_000; guard += 1) {
      const since: { tables: Record<string, Partial<SyncCursorPair>> } = { tables: {} };
      for (const meta of syncTableList()) {
        since.tables[meta] = pullCursorOf(cursors, meta);
      }
      const cloud = await pullFromCloud(call, since);
      const tables: NonNullable<PushPayload['tables']> = {};
      const payload: PushPayload = { tables };
      let items = 0;
      for (const [table, result] of Object.entries(cloud.tables)) {
        const rows = Array.isArray(result.rows) ? result.rows : [];
        const deleted = Array.isArray(result.deleted) ? result.deleted : [];
        items += rows.length + deleted.length;
        if (rows.length + deleted.length > 0) {
          tables[table] = { rows, deleted: deleted.map((d) => ({ pk: d.pk, deleted_at: d.deleted_at, device_id: d.device_id })) };
        }
      }
      if (items === 0) break;
      // ③ بکاپ پیش از اعمال — فقط وقتی اعمالی در کار است؛ شکست بکاپ = توقف اعمال
      if (pulled === 0) {
        await writeCloudBackupFile(deps, { kind: 'pre', includeFiles: false, now: deps.now ?? Date.now });
        await rotateCloudBackups(deps, CLOUD_SYNC_BACKUP_KEEP);
      }
      // ④ اعمال با سرویس پوش محلی (FWW + دفتر تعارض + echo سمت گیرنده) — هستهٔ سرویس
      const applied = await localPushService(deps.db, config.device_id, payload);
      for (const [table, outcome] of Object.entries(applied.tables)) {
        conflictsNew += outcome.conflicts;
        if (outcome.rejected.length > 0) {
          deps.logger.warn('cloud.sync.pull_rejected', { table, rejected: outcome.rejected.length });
        }
      }
      pulled += items;
      // cursor فقط پس از اعمال موفق جلو می‌رود — next_cursors قرارداد هستهٔ سرویس
      for (const [table, result] of Object.entries(cloud.tables)) {
        const next = result.next_cursors;
        if (next && typeof next.rows === 'string' && typeof next.deleted === 'string') {
          cursors.pull[table] = next;
        }
      }
      await writeSyncCursors(deps.fs, cursors);
    }

    // ⑤ push چانکی ردیف‌های تازهٔ محلی — خواندن با هستهٔ سرویس (برش گروه کامل مُهر)
    for (let guard = 0; guard < 2_000; guard += 1) {
      const localSince: { tables?: Record<string, Partial<SyncCursorPair>> } = { tables: {} };
      for (const meta of syncTableList()) {
        localSince.tables![meta] = pushCursorOf(cursors, meta);
      }
      const local = await localPull(deps.db, localSince);
      const tables: NonNullable<PushPayload['tables']> = {};
      const payload: PushPayload = { tables };
      let items = 0;
      for (const [table, result] of Object.entries(local.tables)) {
        const rows = Array.isArray(result.rows) ? result.rows : [];
        const deleted = Array.isArray(result.deleted) ? result.deleted : [];
        items += rows.length + deleted.length;
        if (rows.length + deleted.length > 0) {
          tables[table] = { rows, deleted: deleted.map((d) => ({ pk: d.pk, deleted_at: d.deleted_at, device_id: config.device_id })) };
        }
      }
      if (items === 0) break;
      const cloudResult = await pushToCloud(call, payload);
      // ⑥ اعمال echo (همگرایی بازنده) — برندهٔ نهایی ابر عیناً می‌نشیند؛ null یعنی حذف
      for (const [table, outcome] of Object.entries(cloudResult.tables)) {
        const appliedEcho = await applyEcho(deps.db, table, outcome.echo, columnsCache);
        conflictsNew += outcome.conflicts;
        if (outcome.rejected.length > 0) {
          deps.logger.warn('cloud.sync.push_rejected', { table, rejected: outcome.rejected.length });
        }
        void appliedEcho;
      }
      pushed += items;
      // cursor فقط پس از push+echo موفق جلو می‌رود — next_cursors خوانش محلی
      for (const [table, result] of Object.entries(local.tables)) {
        const next = result.next_cursors;
        if (next && typeof next.rows === 'string' && typeof next.deleted === 'string') {
          cursors.push[table] = next;
        }
      }
      await writeSyncCursors(deps.fs, cursors);
    }

    // ⑦ آینهٔ نتیجه + audit بدون هیچ secret
    const result = finish(
      await finishWithMirror(
        deps,
        { kind: 'synced', error: null, pulled, pushed, conflicts_new: conflictsNew, clockWarning, schemaMatch },
        started
      )
    );
    deps.logger.info('cloud.sync.done', { trigger, pulled, pushed, conflicts_new: conflictsNew });
    return result;
  } catch (err) {
    if (err instanceof CloudSyncError && err.kind === 'offline') {
      // آفلاین بی‌اسپم: نتیجهٔ صریح + آینه، بدون ردیف audit
      const offline = finish(
        await finishWithMirror(
          deps,
          { kind: 'offline', error: err.message, pulled: 0, pushed: 0, conflicts_new: 0, clockWarning: undefined, schemaMatch: undefined },
          started
        )
      );
      deps.logger.info('cloud.sync.offline', { trigger, reason: err.message });
      return offline;
    }
    const message = err instanceof Error ? err.message : String(err);
    deps.logger.warn('cloud.sync.failed', { trigger, error: message });
    return finish(
      await finishWithMirror(
        deps,
        { kind: 'error', error: message, pulled: 0, pushed: 0, conflicts_new: 0, clockWarning: undefined, schemaMatch: undefined },
        started
      )
    );
  }
}

// فهرست نام جدول‌های قرارداد — از فهرست سفید هستهٔ سرویس (منبع واحد؛ import استاتیک بالای فایل)
const SYNC_TABLE_NAMES: string[] = MACHINE_SYNC_TABLES.map((m) => m.table);

/** فهرست نام جدول‌های قرارداد */
function syncTableList(): string[] {
  return SYNC_TABLE_NAMES;
}

/**
 * بستن دوره با نوشتن آینهٔ آخرین نتیجه (settings) + ردیف audit «cloud.sync».
 * آفلاین audit نمی‌گیرد (بی‌اسپم)؛ synced/error می‌گیرند. هیچ مقدار secret در هیچ ردیفی نیست.
 * duration_ms از آغاز دور (startedMs) تا همین‌جا اندازه گرفته و در آینه هم می‌نشیند.
 */
async function finishWithMirror(
  deps: CloudSyncDeps,
  input: {
    kind: 'synced' | 'error' | 'offline';
    error: string | null;
    pulled: number;
    pushed: number;
    conflicts_new: number;
    clockWarning?: boolean;
    schemaMatch?: boolean | null;
  },
  startedMs: number
): Promise<CloudSyncRunResult> {
  const duration_ms = (deps.now?.() ?? Date.now()) - startedMs;
  const previous = await readLastSyncMirror(deps.db).catch(() => null);
  const mirror: CloudLastSyncMirror = {
    at: new Date(deps.now?.() ?? Date.now()).toISOString(),
    result: input.kind,
    pulled: input.pulled,
    pushed: input.pushed,
    conflicts_new: input.conflicts_new,
    duration_ms,
    error: input.error,
    // نامعلوم (آفلاین/خطای زودرس) → مقدار پیشین حفظ می‌شود تا پنل آخرین دانش معتبر را بدهد
    clock_warning: input.clockWarning ?? previous?.clock_warning ?? false,
    schema_match: input.schemaMatch !== undefined ? input.schemaMatch : previous?.schema_match ?? null
  };
  await writeLastSyncMirror(deps.db, mirror);
  if (input.kind !== 'offline') {
    try {
      await deps.audit.log({
        actorId: 'system',
        action: CLOUD_SYNC_AUDIT_ACTION,
        resourceType: 'cloud-sync',
        resourceId: input.kind,
        changes: {
          result: { from: null, to: input.kind },
          pulled: { from: null, to: input.pulled },
          pushed: { from: null, to: input.pushed },
          conflicts_new: { from: null, to: input.conflicts_new }
        }
      });
    } catch {
      /* audit بهترین‌تلاش */
    }
  }
  return {
    kind: input.kind,
    pulled: input.pulled,
    pushed: input.pushed,
    conflicts_new: input.conflicts_new,
    duration_ms,
    error: input.error
  };
}

// ─── کلون ابر→میز (سند طراحی §۲-۲) ───

export interface CloneOutcome {
  ok: true;
  tables: number;
  rows: number;
  backup_path: string;
}

/**
 * کلون ابر→میز: state مقصد → export واقعی /api/backup/export با Bearer → inspect →
 * بکاپ کامل محلی cloud-sync-clone-* (بدون چرخش) → restore تراکنشی با منطق بازیابی موجود →
 * ریست cursor به مُهر مقصد (سراند Date پاسخ state) → audit «cloud.clone». بدون confirm
 * روی DB غیر-خالی → ConflictError (۴۰۹ فارسی در مسیر).
 */
export async function cloneFromCloud(
  deps: CloudSyncDeps,
  opts: { confirm: boolean }
): Promise<CloneOutcome> {
  const config = await readCloudConfig(deps.fs);
  if (!config) throw new ValidationError('اتصال ابری تنظیم نشده است');
  const secret = cloudSecretOf(deps.env);
  if (!secret) throw new ValidationError('راز اتصال ابری در پوسته ذخیره نشده است');
  const call: CloudCallCtx = { deps, config, secret };

  // ① state مقصد — دسترس‌پذیری + ساعت مرجع (سراند Date) برای ریست cursor
  const state = await fetchCloudState(call);
  const serverTime = state.serverTimeMs !== null ? new Date(state.serverTimeMs).toISOString() : new Date(deps.now?.() ?? Date.now()).toISOString();

  // ② گارد تأیید — کلون هرگز روی دیتای محلی غیر-خالی بی‌پرس‌وپاسخ نیست (سند §۲-۲)
  let localRows = 0;
  for (const t of ['students', 'staff', 'appointments']) {
    try {
      const row = await deps.db.queryOne<{ c: number }>(`SELECT COUNT(*) AS c FROM "${t}"`);
      localRows += Number(row?.c ?? 0);
    } catch {
      /* جدول غایب = صفر */
    }
  }
  if (localRows > 0 && opts.confirm !== true) {
    throw new ConflictError(
      'روی دیتای محلی غیر-خالی کلون فقط با تأیید صریح انجام می‌شود — دیتای فعلی با بکاپ جایگزین خواهد شد'
    );
  }

  // ③ export واقعی از ابر با Bearer (همان endpoint پنل پشتیبان سمت ابر)
  const res = await cloudFetch(call, '/api/backup/export', { method: 'GET', headers: cloudHeaders(call, false) });
  const text = await res.text();
  let envelope: unknown;
  try {
    envelope = JSON.parse(text);
  } catch {
    throw new ValidationError('خروجی ابر JSON معتبر نیست — کلون متوقف شد');
  }

  // ④ inspect — اعتبارسنجی قالب gh-backup + هم‌خوانی اسکیما با همان منطق پنل بازیابی
  if (!deps.backup) throw new ValidationError('سرویس پشتیبان در دسترس نیست — کلون ممکن نشد');
  const summary = await deps.backup.inspect(envelope);
  if (!summary.schemaCompatible) {
    throw new ValidationError('خروجی ابر با اسکیمای محلی هم‌خوان نیست — کلون متوقف شد', { problems: summary.problems });
  }

  // ⑤ بکاپ کامل محلی پیش از جایگزینی — بدون چرخش (همیشه هر فایل پیشین باقی می‌ماند)
  const backup = await writeCloudBackupFile(deps, { kind: 'clone', includeFiles: true, now: deps.now ?? Date.now });

  // ⑥ restore تراکنشی با منطق بازیابی موجود (جایگزینی کامل جداول در batchهای اتمیک)
  const report = await deps.backup.restore({ staffId: 'system' }, envelope, { confirmed: true });

  // ⑦ ریست cursor به مُهر مقصد — ردیف‌های تازه‌نشسته دوباره پوش نمی‌شوند
  const cursors: SyncCursors = { pull: {}, push: {} };
  for (const meta of syncTableList()) {
    cursors.pull[meta] = { rows: serverTime, deleted: serverTime };
    cursors.push[meta] = { rows: serverTime, deleted: serverTime };
  }
  await writeSyncCursors(deps.fs, cursors);

  // ⑧ audit بی‌راز
  try {
    await deps.audit.log({
      actorId: 'system',
      action: CLOUD_CLONE_AUDIT_ACTION,
      resourceType: 'cloud-sync',
      resourceId: backup.name,
      changes: {
        tables: { from: null, to: report.tables.length },
        rows: { from: null, to: report.totalRows }
      }
    });
  } catch {
    /* audit بهترین‌تلاش */
  }
  deps.logger.info('cloud.clone.done', { tables: report.tables.length, rows: report.totalRows, backup: backup.name });
  return { ok: true, tables: report.tables.length, rows: report.totalRows, backup_path: backup.path };
}

// ─── حذف اتصال — cursorها عمداً باقی می‌مانند (اتصال دوباره از سرِ امن) ───

export async function unlinkCloudConfig(deps: CloudSyncDeps, actorId: string): Promise<void> {
  if (!deps.fs) throw new ValidationError('پل فایل‌های ابری در دسترس نیست');
  await deps.fs.remove(CLOUD_CONFIG_FILE);
  try {
    await deps.audit.log({
      actorId,
      action: CLOUD_UNLINK_AUDIT_ACTION,
      resourceType: 'cloud-sync',
      resourceId: CLOUD_CONFIG_FILE,
      changes: { unlinked: { from: null, to: true } }
    });
  } catch {
    /* audit بهترین‌تلاش */
  }
  deps.logger.info('cloud.unlink.done', { actorId });
}

// ─── وضعیت قرارداد UI ───

export interface CloudSyncStatus {
  configured: boolean;
  url: string | null;
  device_id: string | null;
  secret_present: boolean;
  running: boolean;
  interval_ms: number | null;
  last_sync: null | {
    at: string;
    result: 'synced' | 'error' | 'offline';
    pulled: number;
    pushed: number;
    conflicts_new: number;
    duration_ms: number;
    error: string | null;
  };
  conflicts_total: number;
  clock_warning: boolean;
  schema_match: boolean | null;
}

export async function buildCloudSyncStatus(deps: CloudSyncDeps): Promise<CloudSyncStatus> {
  const config = await readCloudConfig(deps.fs).catch(() => null);
  const mirror = await readLastSyncMirror(deps.db).catch(() => null);
  let conflictsTotal = 0;
  try {
    const row = await deps.db.queryOne<{ c: number }>('SELECT COUNT(*) AS c FROM _sync_conflicts');
    conflictsTotal = Number(row?.c ?? 0);
  } catch {
    conflictsTotal = 0;
  }
  return {
    configured: Boolean(config),
    url: config?.url ?? null,
    device_id: config?.device_id ?? null,
    secret_present: cloudSecretOf(deps.env) !== null,
    running: cloudSyncInFlight,
    interval_ms: config?.interval_ms ?? null,
    last_sync: mirror
      ? {
          at: mirror.at,
          result: mirror.result,
          pulled: mirror.pulled,
          pushed: mirror.pushed,
          conflicts_new: mirror.conflicts_new,
          duration_ms: mirror.duration_ms,
          error: mirror.error
        }
      : null,
    conflicts_total: conflictsTotal,
    clock_warning: mirror?.clock_warning === true,
    schema_match: mirror?.schema_match ?? null
  };
}

/** فهرست پشتیبان‌های ابری محلی — pre (چرخشی) + clone (بی‌چرخش) */
export async function listCloudBackups(
  deps: CloudSyncDeps
): Promise<{ dir: string; backups: Array<{ name: string; kind: 'pre' | 'clone' }> }> {
  if (!deps.fs) return { dir: '', backups: [] };
  const [pres, clones] = await Promise.all([
    deps.fs.list('cloud-sync-pre-').catch(() => []),
    deps.fs.list('cloud-sync-clone-').catch(() => [])
  ]);
  return {
    dir: deps.fs.dir(),
    backups: [...pres.map((name) => ({ name, kind: 'pre' as const })), ...clones.map((name) => ({ name, kind: 'clone' as const }))]
  };
}

// ─── زمان‌بند دوره‌ای بوت ───

/**
 * holder محیط — bindingهای worker (CLOUD_FS/ENGINE_CLOUD_SECRET) در زمان بوت isolate
 * موجود نیستند؛ نخستین درخواست آن‌ها را همین‌جا ضبط می‌کند و تیک‌های بعدی از همین
 * آخرین env مصرف می‌کنند (الگوی کش ماژول-سطح — مثل baleTokenCache در src/index.ts).
 */
const capturedEnvHolder: { env: Record<string, unknown> | null } = { env: null };

export function captureCloudEnv(env: unknown): void {
  if (env && typeof env === 'object') capturedEnvHolder.env = env as Record<string, unknown>;
}

let schedulerArmed = false;

/**
 * زمان‌بند هم‌گامی دوره‌ای — فقط یک‌بار بر فرایند (createApp بر هر درخواست صدا زده می‌شود؛
 * پرچم ماژولِ دوباره‌کاری جلوی انباشت تایمر را می‌گیرد) و فقط وقتی پیکربندی + راز حاضرند.
 * گارد env تست: در vitest/آزمون هیچ تایمری ساخته نمی‌شود — ریشه‌ای جلوی تداخل زمان‌بند با
 * سناریوهای تست گرفته می‌شود (درس موج قبل ④).
 */
export function startCloudSyncScheduler(
  makeDeps: (env: Record<string, unknown>) => CloudSyncDeps,
  logger: Logger
): void {
  if (schedulerArmed) return;
  schedulerArmed = true;
  if (process.env.VITEST || process.env.NODE_ENV === 'test') {
    logger.info('cloud.sync.scheduler.disabled', { reason: 'محیط تست — بدون تایمر' });
    return;
  }
  const schedule = (ms: number) => {
    const t = setTimeout(() => {
      void tick().catch(() => undefined);
    }, Math.max(CLOUD_SYNC_MIN_INTERVAL_MS, ms));
    if (typeof t.unref === 'function') t.unref(); // هرگز جلوی خاموشی تمیز فرایند را نگیرد
  };
  const tick = async (): Promise<void> => {
    const env = capturedEnvHolder.env;
    if (!env) {
      schedule(CLOUD_SYNC_DEFAULT_INTERVAL_MS);
      return;
    }
    const deps = makeDeps(env);
    try {
      const config = await readCloudConfig(deps.fs);
      if (!config || !cloudSecretOf(env)) {
        schedule(CLOUD_SYNC_DEFAULT_INTERVAL_MS); // پیکربندی/راز حاضر نیست — دورهٔ بعد دوباره
        return;
      }
      await runCloudSync(deps, 'auto');
      const fresh = await readCloudConfig(deps.fs);
      schedule(fresh?.interval_ms ?? CLOUD_SYNC_DEFAULT_INTERVAL_MS);
    } catch (err) {
      logger.warn('cloud.sync.tick_failed', { error: err instanceof Error ? err.message : String(err) });
      schedule(CLOUD_SYNC_DEFAULT_INTERVAL_MS);
    }
  };
  schedule(CLOUD_SYNC_DEFAULT_INTERVAL_MS);
  logger.info('cloud.sync.scheduler.armed', {});
}

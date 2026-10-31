import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import { ValidationError } from '@core/errors';
import { APP_VERSION } from '@core/version';
import {
  SETTING_KEYS,
  BACKUP_MAX_DESTINATIONS,
  BACKUP_MAX_SEND_BYTES,
  BACKUP_CHAT_ID_RE
} from '@core/shared';
import { sendBaleDocument } from '@domain/exercise-bank/routes';
import type { SendResult } from '@core/notify/types';

// ─── مکانیک پشتیبان‌گیری و بازیابی () + ارسال به آیدی بله () ───
// قالب فایل: gh-backup v1 (JSON با پاکت) — همهٔ جداول دیتابیس به‌جز جدول‌های سیستمی
// بازیابی = جایگزینی کامل هر جدول در یک تراکنش (delete + insert در یک batch اتمیک)
// ترتیب جداول: توپولوژیک بر اساس کلیدهای خارجی واقعی (PRAGMA foreign_key_list)
// : خروجی همان پاکت به‌صورت فایل با متد sendDocument ربات بله به مقصدهای
// انتخابی (آیدی عددی بله) فرستاده می‌شود؛ مقصدها و تنظیم ارسال خودکار شبانه در
// جدول settings (کلیدهای backup_destinations / backup_auto_send) ذخیره می‌شوند.

export const BACKUP_FORMAT = 'gh-backup';
export const BACKUP_FORMAT_VERSION = 1;

// جدول‌های سیستمی که هرگز در بازیابی دست نمی‌خورند
// (d1_migrations = تاریخچهٔ مهاجرت‌های خود D1 — بازگرداندن نسخهٔ کهنه‌اش
// باعث می‌شود «d1 migrations apply» بعدی سعی کند مهاجرت‌های اعمال‌شده را دوباره بزند)
const SKIP_RESTORE_TABLES = new Set(['schema_migrations', 'd1_migrations']);
// جدول نگهداری بایت فایل‌های پیوستی (سنگین‌ترین جدول — به‌صورت اختیاری در پشتیبان می‌آید)
export const FILES_TABLE = 'exercise_file_chunks';

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_REQUEST_BYTES = 60 * 1024 * 1024; // سقف حجم فایل پشتیبان هنگام بازیابی
const PAGE_SIZE = 400; // صفحهٔ خواندن ردیف‌ها هنگام خروجی گرفتن
const FILES_PAGE_SIZE = 4; // ردیف‌های جدول فایل‌ها تا ~۲ مگابایت هرکدام‌اند — صفحهٔ کوچک تا یک کوئری سنگین نشود
const MAX_STATEMENTS_PER_BATCH = 30; // تعداد دستور در هر batch درج
const MAX_BATCH_PARAM_BYTES = 2 * 1024 * 1024; // حدود حجم پارامترهای هر batch
const MAX_COLUMNS = 90; // زیر سقف ۱۰۰ پارامتر D1 در هر دستور

export interface BackupTableData {
  row_count?: number;
  rows: Record<string, unknown>[];
}

export interface BackupEnvelope {
  format: string;
  format_version: number;
  app_version?: string;
  created_at?: string;
  include_files?: boolean;
  excluded_tables?: string[];
  tables: Record<string, BackupTableData>;
}

export interface BackupStatus {
  version: string;
  tableCount: number;
  totalRows: number;
  tables: { name: string; rows: number }[];
  recent: { action: string; resource_id: string; created_at: string; changes: string | null }[];
}

export interface BackupSummary {
  format: string;
  format_version: number;
  app_version: string;
  created_at: string;
  include_files: boolean;
  tableCount: number;
  totalRows: number;
  tables: { name: string; rows: number }[];
  schemaCompatible: boolean;
  problems: string[];
}

export interface RestoreReport {
  ok: true;
  durationMs: number;
  totalRows: number;
  tables: { name: string; restoredRows: number; skippedColumns: string[] }[];
  warnings: string[];
}

// ─── ارسال پشتیبان به آیدی بله ───

export interface BackupDestination {
  id: string;
  label: string;
  chat_id: string;
  active: boolean;
}

export interface AutoSendConfig {
  enabled: boolean;
  destination_ids: string[];
  include_files: boolean;
}

export interface DeliveryConfig {
  bot_ready: boolean;
  destinations: BackupDestination[];
  auto_send: AutoSendConfig;
}

export interface SendDestinationResult {
  id: string;
  label: string;
  chat_id: string;
  ok: boolean;
  error?: string;
  message_id?: string;
}

export interface SendReport {
  ok: boolean;
  filename: string;
  size_bytes: number;
  include_files: boolean;
  sent: number;
  failed: number;
  results: SendDestinationResult[];
}

export type BackupDocumentSender = (opts: {
  chatId: string;
  filename: string;
  bytes: Uint8Array;
  caption?: string;
}) => Promise<SendResult>;

export interface ScheduledAutoSendOutcome {
  skipped: boolean;
  reason?: 'disabled' | 'no_destination' | 'no_bot';
  report?: SendReport;
}

function assertIdent(name: string): string {
  if (!IDENT_RE.test(name)) throw new ValidationError(`نام جدول غیرمجاز است: ${name.slice(0, 40)}`);
  return name;
}

// ارقام فارسی/عربی → لاتین (برای آیدی بله که کاربر ممکن است با کیبورد فارسی بنویسد)
const FA_AR_DIGITS = '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩';
export function normalizeDigits(input: string): string {
  return input.replace(/[۰-۹٠-٩]/g, (ch) => String(FA_AR_DIGITS.indexOf(ch) % 10));
}

function toByteView(v: unknown): Uint8Array | null {
  if (v instanceof Uint8Array) return v;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  if (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'number')) {
    return Uint8Array.from(v as number[]);
  }
  return null;
}

function encodeValue(v: unknown): unknown {
  const bytes = toByteView(v);
  if (bytes) {
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode(...bytes.subarray(i, i + CH));
    return btoa(bin);
  }
  return v ?? null;
}

interface TableLevel {
  tables: string[];
  merged: boolean; // چرخهٔ FK — باید در یک batch واحد بازیابی شوند
}

export interface BackupService {
  getStatus(): Promise<BackupStatus>;
  exportTableNames(includeFiles: boolean): Promise<string[]>;
  buildExportStream(includeFiles: boolean): ReadableStream<Uint8Array>;
  logExport(actor: { staffId: string }, includeFiles: boolean): Promise<void>;
  inspect(input: unknown): Promise<BackupSummary>;
  restore(actor: { staffId: string }, input: unknown, opts: { confirmed: boolean }): Promise<RestoreReport>;
  // ارسال به آیدی بله
  getDelivery(): Promise<DeliveryConfig>;
  saveDelivery(actor: { staffId: string }, input: unknown): Promise<DeliveryConfig>;
  sendBackup(actor: { staffId: string }, input: unknown): Promise<SendReport>;
  runScheduledAutoSend(): Promise<ScheduledAutoSendOutcome>;
}

export function createBackupService(deps: {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
  baleToken?: string | null;
  sender?: BackupDocumentSender | null;
}): BackupService {
  const { db, audit, logger, baleToken, sender } = deps;

  // ─── خواندن/نوشتن تنظیمات ارسال ───

  async function readSetting<T>(key: string, fallback: T): Promise<T> {
    try {
      const row = await db.queryOne<{ value: string }>(`SELECT value FROM settings WHERE key = ?`, [key]);
      if (!row?.value) return fallback;
      return (JSON.parse(row.value) as T) ?? fallback;
    } catch {
      return fallback;
    }
  }

  async function writeSetting(key: string, value: unknown, updatedBy: string): Promise<void> {
    await db.query(
      `INSERT INTO settings (key, value, updated_by, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value, updated_by = excluded.updated_by, updated_at = datetime('now')`,
      [key, JSON.stringify(value), updatedBy]
    );
  }

  function sanitizeDestinations(input: unknown): BackupDestination[] {
    if (!Array.isArray(input)) throw new ValidationError('لیست مقصدها نامعتبر است');
    if (input.length > BACKUP_MAX_DESTINATIONS) {
      throw new ValidationError(`بیشتر از ${BACKUP_MAX_DESTINATIONS} مقصد نمی‌توانید ذخیره کنید`);
    }
    const seenIds = new Set<string>();
    const seenChats = new Set<string>();
    return input.map((raw) => {
      const d = (raw ?? {}) as Record<string, unknown>;
      const label = typeof d.label === 'string' ? d.label.trim() : '';
      const chatId = normalizeDigits(typeof d.chat_id === 'string' ? d.chat_id.trim() : '');
      if (!label || label.length > 60) {
        throw new ValidationError('هر مقصد باید یک نام کوتاه داشته باشد (حداکثر ۶۰ نویسه)');
      }
      if (!BACKUP_CHAT_ID_RE.test(chatId)) {
        throw new ValidationError(
          `آیدی بله «${chatId.slice(0, 24) || 'خالی'}» معتبر نیست — آیدی بله عددی است (مثال: ۱۲۳۴۵۶۷۸۹)`
        );
      }
      const id = typeof d.id === 'string' && d.id.length > 0 ? d.id : crypto.randomUUID();
      if (seenIds.has(id)) throw new ValidationError('شناسهٔ مقصد تکراری است');
      seenIds.add(id);
      if (seenChats.has(chatId)) {
        throw new ValidationError(`آیدی «${chatId}» دوبار وارد شده است`);
      }
      seenChats.add(chatId);
      return { id, label, chat_id: chatId, active: d.active !== false };
    });
  }

  function sanitizeAutoSend(input: unknown, destinations: BackupDestination[]): AutoSendConfig {
    const raw = (input ?? {}) as Record<string, unknown>;
    const ids = Array.isArray(raw.destination_ids)
      ? raw.destination_ids.filter((x): x is string => typeof x === 'string')
      : [];
    const known = new Set(destinations.map((d) => d.id));
    if (ids.some((id) => !known.has(id))) {
      throw new ValidationError('مقصدهای ارسال خودکار باید از مقصدهای ذخیره‌شده انتخاب شوند');
    }
    return {
      enabled: raw.enabled === true,
      destination_ids: ids,
      include_files: raw.include_files === true
    };
  }

  function resolveSender(): BackupDocumentSender | null {
    if (sender) return sender;
    if (!baleToken) return null;
    return (opts) =>
      sendBaleDocument({
        token: baleToken,
        chatId: opts.chatId,
        filename: opts.filename,
        bytes: opts.bytes,
        caption: opts.caption,
        mime: 'application/json'
      });
  }

  function backupStamp(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
  }

  async function collectExport(includeFiles: boolean): Promise<{ bytes: Uint8Array; filename: string }> {
    const stream = service.buildExportStream(includeFiles);
    const buf = await new Response(stream).arrayBuffer();
    const bytes = new Uint8Array(buf);
    if (bytes.byteLength > BACKUP_MAX_SEND_BYTES) {
      throw new ValidationError(
        'حجم فایل پشتیبان برای ارسال به بله زیاد است (سقف ۴۸ مگابایت) — گزینهٔ «همراه‌کردن فایل‌های پیوستی» را خاموش کنید'
      );
    }
    return { bytes, filename: `backup-${backupStamp()}.json` };
  }

  function buildCaption(): string {
    const when = new Date().toISOString().slice(0, 16).replace('T', ' ');
    return `پشتیبان سامانه — ${when} (UTC) — نسخهٔ ${APP_VERSION}`;
  }

  async function sendToDestinations(
    chosen: BackupDestination[],
    includeFiles: boolean
  ): Promise<SendReport> {
    const senderFn = resolveSender();
    if (!senderFn) {
      throw new ValidationError('توکن ربات بله تنظیم نشده است — بدون آن ارسال پشتیبان به آیدی ممکن نیست');
    }
    const { bytes, filename } = await collectExport(includeFiles);
    const caption = buildCaption();
    const results: SendDestinationResult[] = [];
    for (const d of chosen) {
      const r = await senderFn({ chatId: d.chat_id, filename, bytes, caption });
      results.push({
        id: d.id,
        label: d.label,
        chat_id: d.chat_id,
        ok: r.ok,
        error: r.error,
        message_id: r.externalId
      });
    }
    const sent = results.filter((r) => r.ok).length;
    return {
      ok: sent > 0,
      filename,
      size_bytes: bytes.byteLength,
      include_files: includeFiles,
      sent,
      failed: results.length - sent,
      results
    };
  }

  async function listTables(): Promise<string[]> {
    // ⚠️ : جدول داخلی _cf_KV (متعلق به خود D1) روی پروداکشن در sqlite_master هست؛
    // کوئری زدن روی آن از داخل Worker با «D1_ERROR: not authorized: SQLITE_AUTH» رد می‌شود
    // (از wrangler/REST مجاز است — فقط binding داخل Worker محافظت می‌شود).
    // همین امر پنل پشتیبان (status)، خروجی (export) و بازیابی (inspect) را ۵۰۰ می‌کرد.
    // پس جدول‌های سیستمی sqlite_% و _cf_% همیشه حذف می‌شوند.
    const rows = await db.query<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table'
       AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name`
    );
    return rows.map((r) => r.name);
  }

  async function tableColumns(table: string): Promise<string[]> {
    assertIdent(table);
    const rows = await db.query<{ name: string }>(`PRAGMA table_info("${table}")`);
    return rows.map((r) => r.name);
  }

  async function rowCount(table: string): Promise<number> {
    assertIdent(table);
    const row = await db.queryOne<{ c: number }>(`SELECT COUNT(*) AS c FROM "${table}"`);
    return Number(row?.c ?? 0);
  }

  async function hasSelfReference(table: string): Promise<boolean> {
    const fks = await db.query<{ table: string }>(`PRAGMA foreign_key_list("${table}")`);
    return fks.some((f) => String(f.table) === table);
  }

  async function topoLevels(tables: string[]): Promise<TableLevel[]> {
    const refs = new Map<string, string[]>();
    for (const t of tables) {
      const fks = await db.query<{ table: string }>(`PRAGMA foreign_key_list("${t}")`);
      refs.set(t, fks.map((f) => String(f.table)).filter((r) => r !== t && tables.includes(r)));
    }
    const levels: TableLevel[] = [];
    const placed = new Set<string>();
    let remaining = [...tables];
    while (remaining.length > 0) {
      const ready = remaining.filter((t) => (refs.get(t) ?? []).every((r) => placed.has(r)));
      if (ready.length === 0) {
        // چرخهٔ کلید خارجی — همهٔ باقی‌مانده باید در یک batch بازیابی شوند
        levels.push({ tables: remaining, merged: true });
        break;
      }
      levels.push({ tables: ready, merged: false });
      ready.forEach((t) => placed.add(t));
      remaining = remaining.filter((t) => !placed.has(t));
    }
    return levels;
  }

  function parseEnvelope(input: unknown): BackupEnvelope {
    if (!input || typeof input !== 'object') {
      throw new ValidationError('فایل پشتیبان خوانده نشد — محتوای JSON معتبر نیست');
    }
    const env = input as Record<string, unknown>;
    const wrapped = env.backup !== undefined ? env.backup : env; // هم {backup:{…}} و هم خود پاکت
    if (typeof wrapped !== 'object' || wrapped === null) {
      throw new ValidationError('ساختار فایل پشتیبان شناخته نشد');
    }
    const e = wrapped as Record<string, unknown>;
    if (e.format !== BACKUP_FORMAT) {
      throw new ValidationError('این فایل پشتیبان سامانه نیست (قالب gh-backup نیست)');
    }
    if (e.format_version !== BACKUP_FORMAT_VERSION) {
      throw new ValidationError(`نسخهٔ قالب پشتیبان پشتیبانی نمی‌شود: ${String(e.format_version)}`);
    }
    if (!e.tables || typeof e.tables !== 'object' || Array.isArray(e.tables)) {
      throw new ValidationError('بخش جداول فایل پشتیبان ناقص است');
    }
    for (const name of Object.keys(e.tables as Record<string, unknown>)) {
      assertIdent(name);
      const t = (e.tables as Record<string, unknown>)[name];
      if (!t || typeof t !== 'object' || !Array.isArray((t as BackupTableData).rows)) {
        throw new ValidationError(`دادهٔ جدول «${name}» در فایل پشتیبان ناقص است`);
      }
    }
    return wrapped as unknown as BackupEnvelope;
  }

  async function buildSummary(input: unknown): Promise<BackupSummary> {
    const env = parseEnvelope(input);
    const current = await listTables();
    const fileTables = Object.keys(env.tables);
    const problems: string[] = [];
    const excluded = env.excluded_tables ?? [];
    const missingInFile = current.filter(
      (t) => !SKIP_RESTORE_TABLES.has(t) && !excluded.includes(t) && env.tables[t] === undefined
    );
    const unknownInFile = fileTables.filter((t) => !current.includes(t));
    if (missingInFile.length > 0) {
      problems.push(`این جدول‌ها در فایل پشتیبان نیستند: ${missingInFile.join('، ')}`);
    }
    if (unknownInFile.length > 0) {
      problems.push(`این جدول‌ها در پایگاه دادهٔ فعلی وجود ندارند (نسخهٔ اسکیما تفاوت دارد): ${unknownInFile.join('، ')}`);
    }
    // پیش‌اعتبارسنجی ستون‌های الزامی (NOT NULL بدون پیش‌فرض) — اگر در فایل نیستند،
    // درج وسط کار شکست می‌خورد؛ همین حالا با پیام روشن رد می‌کنیم تا پایگاه داده دست‌نخورده بماند
    for (const name of fileTables) {
      if (SKIP_RESTORE_TABLES.has(name) || !current.includes(name)) continue;
      const info = await db.query<{ name: string; notnull: number; dflt_value: unknown }>(
        `PRAGMA table_info("${name}")`
      );
      const required = info
        .filter((c) => c.notnull === 1 && (c.dflt_value === null || c.dflt_value === undefined))
        .map((c) => c.name);
      if (required.length === 0) continue;
      const missing = new Set<string>();
      for (const row of env.tables[name]?.rows ?? []) {
        for (const col of required) if (!(col in (row as Record<string, unknown>))) missing.add(col);
      }
      if (missing.size > 0) {
        problems.push(
          `جدول «${name}»: این ستون‌های الزامی در ردیف‌های فایل نیست (${[...missing].join('، ')}) — فایل از نسخهٔ قدیمی‌تری است`
        );
      }
    }
    const tables = fileTables.map((name) => ({
      name,
      rows: (env.tables[name]?.rows ?? []).length
    }));
    return {
      format: env.format,
      format_version: env.format_version,
      app_version: env.app_version ?? '—',
      created_at: env.created_at ?? '—',
      include_files: Boolean(env.include_files),
      tableCount: tables.length,
      totalRows: tables.reduce((s, t) => s + t.rows, 0),
      tables,
      schemaCompatible: problems.length === 0,
      problems
    };
  }

  async function insertTableRows(
    table: string,
    data: BackupTableData,
    warnings: string[]
  ): Promise<{ restoredRows: number; skippedColumns: string[] }> {
    assertIdent(table);
    const cols = await tableColumns(table);
    if (cols.length > MAX_COLUMNS) {
      throw new ValidationError(`جدول «${table}» ${cols.length} ستون دارد — بیش از سقف درج تک‌ردیفی`);
    }
    const fileExtra = new Set<string>();
    for (const row of data.rows) {
      for (const k of Object.keys(row)) if (!cols.includes(k)) fileExtra.add(k);
    }
    if (fileExtra.size > 0) {
      warnings.push(`جدول «${table}»: ستون‌های ناشناختهٔ فایل نادیده گرفته شد (${[...fileExtra].join('، ')})`);
    }
    if (data.rows.length === 0) return { restoredRows: 0, skippedColumns: [...fileExtra] };

    const colList = cols.map((c) => `"${c}"`).join(', ');
    const placeholders = cols.map(() => '?').join(', ');
    const insertSql = `INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`;
    const selfRef = await hasSelfReference(table);

    let batch: D1PreparedStatement[] = [db.prepare('PRAGMA defer_foreign_keys = ON')];
    let paramBytes = 0;
    let restored = 0;

    const flush = async () => {
      if (batch.length <= 1) return;
      try {
        await db.batch(batch);
      } catch (err) {
        logger.error('backup.restore.batch_failed', {
          table,
          statements: batch.length,
          error: err instanceof Error ? err.message : String(err)
        });
        throw new ValidationError(
          `بازیابی جدول «${table}» ناموفق بود: ${err instanceof Error ? err.message : String(err)}`,
          { table }
        );
      }
      batch = [db.prepare('PRAGMA defer_foreign_keys = ON')];
      paramBytes = 0;
    };

    for (const row of data.rows) {
      const params = cols.map((c) => encodeValue(row[c]));
      batch.push(db.prepare(insertSql, params));
      paramBytes += JSON.stringify(params).length;
      restored += 1;
      const stmtCount = batch.length - 1; // منهای PRAGMA
      // جدول خودارجاع باید همهٔ ردیف‌هایش در یک batch بماند (ارجاع به هم نوع‌ها)
      if (!selfRef && (stmtCount >= MAX_STATEMENTS_PER_BATCH || paramBytes >= MAX_BATCH_PARAM_BYTES)) {
        await flush();
      }
    }
    await flush();

    return { restoredRows: restored, skippedColumns: [...fileExtra] };
  }

  const service: BackupService = {
    async getStatus() {
      const tables = await listTables();
      const withCounts: { name: string; rows: number }[] = [];
      // دفاع دوم: اگر جدولی به هر دلیل خوانا نبود، پنل نباید ۵۰۰ بدهد —
      // همان جدول با هشدار جا می‌ماند و بقیهٔ آمار سالم نمایش داده می‌شود
      for (const t of tables) {
        try {
          withCounts.push({ name: t, rows: await rowCount(t) });
        } catch (err) {
          logger.warn('backup.status.rowcount_failed', {
            table: t,
            err: err instanceof Error ? err.message : String(err)
          });
        }
      }
      const recent = await db.query<{ action: string; resource_id: string; created_at: string; changes: string | null }>(
        `SELECT action, resource_id, created_at, changes FROM audit_log
         WHERE action LIKE 'backup.%' ORDER BY created_at DESC, id DESC LIMIT 5`
      );
      return {
        version: APP_VERSION,
        tableCount: withCounts.length,
        totalRows: withCounts.reduce((s, t) => s + t.rows, 0),
        tables: withCounts,
        recent
      };
    },

    async exportTableNames(includeFiles: boolean) {
      const tables = await listTables();
      return includeFiles ? tables : tables.filter((t) => t !== FILES_TABLE);
    },

    buildExportStream(includeFiles: boolean) {
      const encoder = new TextEncoder();
      const excluded = includeFiles ? [] : [FILES_TABLE];

      // مولد صفحه‌به‌صفحه — هر «pull» فقط یک گام جلو می‌رود تا صف استریم
      // (و حافظهٔ Worker) همیشه کوچک بماند، حتی برای فایل پشتیبان صد مگابایتی
      async function* exportGen(): AsyncGenerator<string> {
        const allTables = await listTables();
        const tables = allTables.filter((t) => !excluded.includes(t));
        const head = JSON.stringify({
          format: BACKUP_FORMAT,
          format_version: BACKUP_FORMAT_VERSION,
          app_version: APP_VERSION,
          created_at: new Date().toISOString(),
          include_files: includeFiles,
          excluded_tables: excluded
        });
        yield `${head.slice(0, -1)},"tables":{`;
        for (let i = 0; i < tables.length; i++) {
          const t = tables[i];
          const count = await rowCount(t);
          yield `${i > 0 ? ',' : ''}"${t}":{"row_count":${count},"rows":[`;
          let emitted = 0;
          const page = t === FILES_TABLE ? FILES_PAGE_SIZE : PAGE_SIZE;
          for (let offset = 0; ; offset += page) {
            const rows = await db.query<Record<string, unknown>>(
              `SELECT * FROM "${t}" LIMIT ${page} OFFSET ${offset}`
            );
            if (rows.length === 0) break;
            for (const r of rows) {
              const clean: Record<string, unknown> = {};
              for (const [k, v] of Object.entries(r)) clean[k] = encodeValue(v);
              yield `${emitted > 0 ? ',' : ''}${JSON.stringify(clean)}`;
              emitted += 1;
            }
            if (rows.length < page) break;
          }
          yield ']}';
        }
        yield '}}';
      }

      const it = exportGen();
      return new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const { value, done } = await it.next();
            if (done) controller.close();
            else controller.enqueue(encoder.encode(value));
          } catch (err) {
            logger.error('backup.export.failed', { error: err instanceof Error ? err.message : String(err) });
            controller.error(err);
          }
        },
        cancel() {
          void it.return(undefined);
        }
      });
    },

    async inspect(input: unknown) {
      return buildSummary(input);
    },

    async logExport(actor, includeFiles) {
      try {
        await audit.log({
          actorId: actor.staffId,
          action: 'backup.export',
          resourceType: 'backup',
          resourceId: new Date().toISOString(),
          changes: { include_files: { from: null, to: includeFiles } }
        });
      } catch (err) {
        logger.warn('backup.export.audit_failed', { err: err instanceof Error ? err.message : String(err) });
      }
    },

    async restore(actor, input, opts) {
      const started = Date.now();
      if (!opts?.confirmed) {
        throw new ValidationError('بازیابی فقط با تأیید صریح انجام می‌شود (confirm لازم است)');
      }
      const summary = await buildSummary(input);
      if (!summary.schemaCompatible) {
        throw new ValidationError(
          'این فایل پشتیبان با نسخهٔ فعلی پایگاه داده هم‌خوان نیست — بازیابی متوقف شد',
          { problems: summary.problems }
        );
      }
      const env = parseEnvelope(input);
      const target = Object.keys(env.tables).filter((t) => !SKIP_RESTORE_TABLES.has(t));

      const warnings: string[] = [];
      const reportTables: RestoreReport['tables'] = [];
      let totalRows = 0;

      // ── فاز ۱: خالی‌کردن همهٔ جدول‌های هدف در یک تراکنش واحد ──
      // چون تا پایان همین batch همهٔ جدول‌ها خالی می‌شوند، هیچ ردیف کهنی نمی‌ماند
      // که به ردیف حذف‌شدهٔ یک جدول والد ارجاع بدهد — ریشهٔ خطای
      // «FOREIGN KEY constraint failed» در بازیابی دادهٔ واقعی همین بود:
      // حذف+درجِ هر جدول جداگانه بود و فرزندان کهن به درج‌های chunk بعدیِ والد برمی‌خوردند.
      const wipe: D1PreparedStatement[] = [db.prepare('PRAGMA defer_foreign_keys = ON')];
      for (const t of target) wipe.push(db.prepare(`DELETE FROM "${assertIdent(t)}"`));
      try {
        await db.batch(wipe);
      } catch (err) {
        logger.error('backup.restore.wipe_failed', {
          tables: target.length,
          error: err instanceof Error ? err.message : String(err)
        });
        throw new ValidationError(
          `پاک‌سازی داده‌های فعلی برای بازیابی ناموفق بود: ${err instanceof Error ? err.message : String(err)}`
        );
      }

      // ── فاز ۲: درج ردیف‌ها در ترتیب توپولوژیک (والد قبل از فرزند) ──
      const levels = await topoLevels(target);
      for (const level of levels) {
        if (level.merged && level.tables.length > 1) {
          // چرخهٔ FK — همهٔ درج‌ها در یک batch با تعویق کلید خارجی
          const batch: D1PreparedStatement[] = [db.prepare('PRAGMA defer_foreign_keys = ON')];
          for (const t of level.tables) {
            const cols = await tableColumns(t);
            const colList = cols.map((c) => `"${c}"`).join(', ');
            const placeholders = cols.map(() => '?').join(', ');
            for (const row of env.tables[t]?.rows ?? []) {
              batch.push(
                db.prepare(
                  `INSERT INTO "${t}" (${colList}) VALUES (${placeholders})`,
                  cols.map((c) => encodeValue(row[c]))
                )
              );
              totalRows += 1;
            }
            reportTables.push({ name: t, restoredRows: (env.tables[t]?.rows ?? []).length, skippedColumns: [] });
          }
          try {
            await db.batch(batch);
          } catch (err) {
            throw new ValidationError(
              `بازیابی جداول درهم‌پیوسته ناموفق بود: ${err instanceof Error ? err.message : String(err)}`
            );
          }
          continue;
        }
        for (const t of level.tables) {
          const res = await insertTableRows(t, env.tables[t] ?? { rows: [] }, warnings);
          totalRows += res.restoredRows;
          reportTables.push({ name: t, restoredRows: res.restoredRows, skippedColumns: res.skippedColumns });
        }
      }

      const durationMs = Date.now() - started;
      await audit.log({
        actorId: actor.staffId,
        action: 'backup.restore',
        resourceType: 'backup',
        resourceId: env.created_at ?? '—',
        changes: { tables: { from: null, to: reportTables.length }, rows: { from: null, to: totalRows } }
      });
      logger.info('backup.restore.done', { tables: reportTables.length, rows: totalRows, ms: durationMs });
      return { ok: true, durationMs, totalRows, tables: reportTables, warnings };
    },

    // ─── ارسال پشتیبان به آیدی بله (مقصد انتخابی) ───

    async getDelivery(): Promise<DeliveryConfig> {
      const destinations = await readSetting<BackupDestination[]>(SETTING_KEYS.BACKUP_DESTINATIONS, []);
      const auto = await readSetting<Partial<AutoSendConfig>>(SETTING_KEYS.BACKUP_AUTO_SEND, {});
      return {
        bot_ready: Boolean(sender || baleToken),
        destinations,
        auto_send: {
          enabled: auto.enabled === true,
          destination_ids: Array.isArray(auto.destination_ids) ? auto.destination_ids : [],
          include_files: auto.include_files === true
        }
      };
    },

    async saveDelivery(actor, input) {
      const raw = (input ?? {}) as Record<string, unknown>;
      const destinations = sanitizeDestinations(raw.destinations ?? []);
      const auto = sanitizeAutoSend(raw.auto_send, destinations);
      await writeSetting(SETTING_KEYS.BACKUP_DESTINATIONS, destinations, actor.staffId);
      await writeSetting(SETTING_KEYS.BACKUP_AUTO_SEND, auto, actor.staffId);
      try {
        await audit.log({
          actorId: actor.staffId,
          action: 'backup.delivery_update',
          resourceType: 'backup',
          resourceId: 'delivery',
          changes: {
            destinations: { from: null, to: destinations.length },
            auto_send: { from: null, to: auto.enabled ? 'on' : 'off' }
          }
        });
      } catch (err) {
        logger.warn('backup.delivery.audit_failed', { err: err instanceof Error ? err.message : String(err) });
      }
      return {
        bot_ready: Boolean(sender || baleToken),
        destinations,
        auto_send: auto
      };
    },

    async sendBackup(actor, input): Promise<SendReport> {
      const raw = (input ?? {}) as Record<string, unknown>;
      const ids = Array.isArray(raw.destinations)
        ? raw.destinations.filter((x): x is string => typeof x === 'string')
        : [];
      if (ids.length === 0) {
        throw new ValidationError('حداقل یک مقصد (آیدی بله) را انتخاب کنید');
      }
      const includeFiles = raw.include_files === true;
      const destinations = await readSetting<BackupDestination[]>(SETTING_KEYS.BACKUP_DESTINATIONS, []);
      const chosen = destinations.filter((d) => ids.includes(d.id));
      if (chosen.length !== ids.length) {
        throw new ValidationError('برخی مقصدهای انتخابی پیدا نشدند — لیست مقصدها را ذخیره کنید و دوباره تلاش کنید');
      }
      const inactive = chosen.filter((d) => !d.active).map((d) => d.label);
      if (inactive.length > 0) {
        throw new ValidationError(`این مقصدها غیرفعال‌اند و ارسال نمی‌شوند: ${inactive.join('، ')}`);
      }
      const report = await sendToDestinations(chosen, includeFiles);
      try {
        await audit.log({
          actorId: actor.staffId,
          action: 'backup.send',
          resourceType: 'backup',
          resourceId: report.filename,
          changes: {
            sent: { from: null, to: report.sent },
            failed: { from: null, to: report.failed },
            include_files: { from: null, to: includeFiles }
          }
        });
      } catch (err) {
        logger.warn('backup.send.audit_failed', { err: err instanceof Error ? err.message : String(err) });
      }
      logger.info('backup.send.done', {
        sent: report.sent,
        failed: report.failed,
        bytes: report.size_bytes
      });
      return report;
    },

    async runScheduledAutoSend(): Promise<ScheduledAutoSendOutcome> {
      const auto = await readSetting<Partial<AutoSendConfig>>(SETTING_KEYS.BACKUP_AUTO_SEND, {});
      if (auto.enabled !== true) return { skipped: true, reason: 'disabled' };
      const destinations = await readSetting<BackupDestination[]>(SETTING_KEYS.BACKUP_DESTINATIONS, []);
      const chosen = destinations.filter(
        (d) => (auto.destination_ids ?? []).includes(d.id) && d.active
      );
      if (chosen.length === 0) return { skipped: true, reason: 'no_destination' };
      const includeFiles = auto.include_files === true;
      const report = await sendToDestinations(chosen, includeFiles);
      try {
        await audit.log({
          actorId: 'system',
          action: 'backup.auto_send',
          resourceType: 'backup',
          resourceId: report.filename,
          changes: {
            sent: { from: null, to: report.sent },
            failed: { from: null, to: report.failed }
          }
        });
      } catch (err) {
        logger.warn('backup.auto.audit_failed', { err: err instanceof Error ? err.message : String(err) });
      }
      logger.info('backup.auto.done', { sent: report.sent, failed: report.failed });
      return { skipped: false, report };
    }
  };

  return service;
}

export { MAX_REQUEST_BYTES, SKIP_RESTORE_TABLES };

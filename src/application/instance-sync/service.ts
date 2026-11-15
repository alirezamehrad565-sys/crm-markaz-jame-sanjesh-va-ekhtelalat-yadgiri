/**
 * هستهٔ هم‌گامی دوسویه instance-sync (فاز B — docs/rust/server-cloud-update-design.md §۲-۴)
 *
 * سه عملیات قراردادی — هر دو سو (ابر D1 و موتور محلی میز) همین کد را با باندل مرکزی سرو می‌کنند:
 *   • instanceState(db, deviceId) — وضعیت برای GET /state: cursorهای دو-محوره از _sync_state +
 *     تعداد مایگریشن‌های اعمال‌شده از جدول رهگیری موجود (d1_migrations خود D1 — در هارنس/نصب
 *     دستی غایب است → null؛ هم‌الگوی countSafe در @app/health).
 *   • pull(db, since) — ردیف‌های updated_at > cursor (سقف ۵۰۰ با برش «گروه کامل مُهر»: ردیف‌های
 *     هم‌مُهرِ مرز هیچ‌وقت نصفه تحویل نمی‌شوند تا داوری در هر دو سو روی همان ورودی بماند) +
 *     تومب‌استون‌های deleted_at > cursor + next_cursors تک‌سویه (cursor هرگز عقب نمی‌رود).
 *   • push(db, deviceId, payload) — اعمال FWW با داور winner.ts؛ تعارض هرگز بی‌سروصدا نیست:
 *     بازنده در _sync_conflicts با payload کامل ثبت می‌شود؛ پاسخ echo[جدول][pk] = «وضعیت نهایی
 *     برنده سمت گیرنده» (null = حذف نهایی) — فرستنده با همان همگرا می‌شود.
 *
 * قواعد امنیتی/سازگاری:
 *   • مقادیر فقط با bind — نام جدول/ستون از ثابت SYNC_TABLES و PRAGMA table_info می‌آید (هرگز از بدنه).
 *   • جدول بیرون SYNC_TABLES = رد صریح (مرز امنیتی؛ فهرست سفید §۲-۴).
 *   • کل payload در یک تراکنش اعمال می‌شود (db.transaction → یک batch اتمی) — شکست = بدون
 *     تغییر cursor (هم‌گامی از سرِ امن؛ §۲-۴).
 *   • مُهرِ سینکی صریح می‌آید و triggerها حفظش می‌کنند؛ INSERT OR REPLACE با recursive_triggers
 *     خاموش (پیش‌فرض SQLite/D1) تومب‌استون جعلی نمی‌سازد — دود: scripts/smoke-instance-sync.mjs.
 */
import type { DbClient } from '@core/db';
import { SYNC_TABLES, syncTableMeta, syncPkValueOfRow, EPOCH_STAMP } from './tables';
import { rowWinner, stampHashWinner, syncHash, tombstoneCanonical, parseCursorPair } from './winner';
import type { WinnerRow } from './winner';

// ─── سقف‌های قراردادی ───

/** سقف ردیف/تومب‌استون به‌ازای هر جدول در هر pull — برش روی مرز «گروه کامل مُهر» */
export const PULL_MAX_ROWS_PER_TABLE = 500;
/** سقف payload بازنده در _sync_conflicts — بزرگ‌تر با نشان برش ذخیره می‌شود */
export const CONFLICT_PAYLOAD_MAX_BYTES = 64 * 1024;
/** شکل شناسهٔ نمونه (device_id) — هر نصب یک UUID در dataDir دارد (§۲-۴) */
export const DEVICE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,63}$/;

// ─── شکل دادهٔ قرارداد ───

export interface SyncCursorPair {
  rows: string;
  deleted: string;
}

export interface PullSince {
  tables?: Record<string, Partial<SyncCursorPair>>;
}

export interface PullDeletedItem {
  table_name: string;
  pk: string;
  deleted_at: string;
  device_id: string | null;
}

export interface PullTableResult {
  rows: Record<string, unknown>[];
  deleted: PullDeletedItem[];
  next_cursors: SyncCursorPair;
}

export interface PullResult {
  tables: Record<string, PullTableResult>;
}

export interface PushTombstone {
  pk: string;
  deleted_at: string;
  device_id?: string | null;
}

export interface PushTablePayload {
  rows?: Record<string, unknown>[];
  deleted?: PushTombstone[];
}

export interface PushPayload {
  tables?: Record<string, PushTablePayload>;
}

export interface PushRejection {
  pk: string;
  reason: string;
}

export interface PushTableOutcome {
  /** وضعیت نهایی برنده سمت گیرنده — null = حذف نهایی (الزام همگرایی §۲-۴) */
  echo: Record<string, unknown | null>;
  conflicts: number;
  upserts: number;
  rejected: PushRejection[];
}

export interface PushResult {
  device_id: string;
  tables: Record<string, PushTableOutcome>;
  /** مجموع ردیف/تومب‌استون‌های اعمال‌شده — برای شمارش per-table در کارت وضعیت */
  applied: number;
}

export interface InstanceState {
  device_id: string | null;
  applied_migrations: number | null;
  /** cursor دو-محوره هر جدول به‌ازای هر سو (pull = آنچه از همتا گرفته‌ایم، push = آنچه فرستاده‌ایم) */
  cursors: Record<string, { pull: SyncCursorPair; push: SyncCursorPair }>;
  table_count: number;
}

interface PushWrite {
  sql: string;
  params: unknown[];
}

type Row = Record<string, unknown>;

// ─── ابزارهای کوچک ───

const nowIso = (): string => new Date().toISOString();

/** گارد شناسهٔ SQL — نام‌ها از ثابت مولد می‌آیند؛ این فقط سپر دفاع در عمق است */
function assertSafeIdent(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`شناسهٔ نامعتبر برای SQL: ${name}`);
  return name;
}

/** نرمال‌سازی مقدار برای bind — هم‌قرارداد normalizeParam هارنس (D1 بولین نمی‌پذیرد) */
function bindValue(v: unknown): string | number | bigint | null {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'bigint') return v;
  return String(v); // آرایه/شیئ/تاریخ → رشته (ستون‌های JSON دامنه)
}

/** فرادادهٔ ستون‌ها از PRAGMA — «نام ستون‌ها هرگز از بدنهٔ درخواست نمی‌آید» */
interface ColumnMeta {
  name: string;
  notnull: number;
  dflt: unknown;
  pk: number;
}

async function columnsOf(db: DbClient, table: string): Promise<ColumnMeta[]> {
  const rows = await db.query<{ name: string; notnull: number; dflt_value: unknown; pk: number }>(
    `PRAGMA table_info(${assertSafeIdent(table)})`
  );
  return rows.map((r) => ({ name: r.name, notnull: Number(r.notnull), dflt: r.dflt_value, pk: Number(r.pk) }));
}

function maxStamp(current: string, values: string[]): string {
  return values.reduce((m, v) => (v > m ? v : m), current);
}

/** برش payload بازنده به سقف ۶۴KB با نشان برش — JSON کامل تا سقف؛ بعد از آن head + نشان */
export function truncateLoserPayload(json: string): string {
  if (Buffer.byteLength(json, 'utf8') <= CONFLICT_PAYLOAD_MAX_BYTES) return json;
  const marker = JSON.stringify({ __truncated: true, full_bytes: Buffer.byteLength(json, 'utf8') });
  const budget = CONFLICT_PAYLOAD_MAX_BYTES - Buffer.byteLength(marker, 'utf8') - 64;
  let head = json.slice(0, Math.max(budget, 0));
  while (Buffer.byteLength(head, 'utf8') > budget) head = head.slice(0, Math.floor(head.length * 0.9));
  return JSON.stringify({ __truncated: true, full_bytes: Buffer.byteLength(json, 'utf8'), head });
}

/** خوانش وضعیت برای GET /state — cursorها از _sync_state، مایگریشن‌ها از جدول رهگیری موجود */
export async function instanceState(db: DbClient, deviceId: string | null): Promise<InstanceState> {
  const rows = await db.query<{ table_name: string; pull_cursor: string; push_cursor: string }>(
    `SELECT table_name, pull_cursor, push_cursor FROM _sync_state`
  );
  const cursors: Record<string, { pull: SyncCursorPair; push: SyncCursorPair }> = {};
  for (const meta of SYNC_TABLES) {
    const rec = rows.find((r) => r.table_name === meta.table);
    cursors[meta.table] = {
      pull: parseCursorPair(rec?.pull_cursor),
      push: parseCursorPair(rec?.push_cursor)
    };
  }
  // d1_migrations = تاریخچهٔ خود D1؛ در نصب‌های دستی/هارنس غایب است → null (هم‌الگوی countSafe)
  let appliedMigrations: number | null = null;
  try {
    const rec = await db.queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM d1_migrations`);
    appliedMigrations = rec ? Number(rec.n) : null;
  } catch {
    appliedMigrations = null;
  }
  return { device_id: deviceId, applied_migrations: appliedMigrations, cursors, table_count: SYNC_TABLES.length };
}

// ─── pull — تحویل تغییرات به همتا ───

/**
 * گروه کامل مُهر: اگر بچ دقیقاً روی سقف برید، همهٔ ردیف‌های هم‌مُهرِ آخرین مُهر کامل می‌شوند تا
 * داوری همتا روی همان مجموعهٔ قطعی برقرار بماند (ترتیب درون‌گروهی بین دو سو قابل‌فرض نیست).
 */
async function completeStampGroup(db: DbClient, table: string, stampCol: string, pkOrder: string, rows: Row[]): Promise<Row[]> {
  if (rows.length !== PULL_MAX_ROWS_PER_TABLE) return rows;
  const lastStamp = rows[rows.length - 1][stampCol];
  if (typeof lastStamp !== 'string') return rows;
  const group = await db.query<Row>(
    `SELECT * FROM ${assertSafeIdent(table)} WHERE ${assertSafeIdent(stampCol)} = ? ORDER BY ${pkOrder} ASC`,
    [lastStamp]
  );
  return [...rows.filter((r) => r[stampCol] !== lastStamp), ...group];
}

export async function pull(db: DbClient, since: PullSince): Promise<PullResult> {
  const out: Record<string, PullTableResult> = {};
  for (const meta of SYNC_TABLES) {
    const table = assertSafeIdent(meta.table);
    const pkOrder = meta.pk.map(assertSafeIdent).join(', ');
    const sincePair = since.tables?.[meta.table];
    const cursorRows = typeof sincePair?.rows === 'string' ? sincePair.rows : EPOCH_STAMP;
    const cursorDeleted = typeof sincePair?.deleted === 'string' ? sincePair.deleted : EPOCH_STAMP;

    const rows = await db.query<Row>(
      `SELECT * FROM ${table} WHERE updated_at IS NOT NULL AND updated_at > ? ORDER BY updated_at ASC, ${pkOrder} ASC LIMIT ?`,
      [cursorRows, PULL_MAX_ROWS_PER_TABLE]
    );
    const completed = await completeStampGroup(db, table, 'updated_at', pkOrder, rows);

    let deletedRows = await db.query<PullDeletedItem>(
      `SELECT table_name, pk, deleted_at, device_id FROM _sync_deleted WHERE table_name = ? AND deleted_at > ? ORDER BY deleted_at ASC, pk ASC LIMIT ?`,
      [meta.table, cursorDeleted, PULL_MAX_ROWS_PER_TABLE]
    );
    if (deletedRows.length === PULL_MAX_ROWS_PER_TABLE) {
      const lastStamp = deletedRows[deletedRows.length - 1].deleted_at;
      const group = await db.query<PullDeletedItem>(
        `SELECT table_name, pk, deleted_at, device_id FROM _sync_deleted WHERE table_name = ? AND deleted_at = ? ORDER BY pk ASC`,
        [meta.table, lastStamp]
      );
      deletedRows = [...deletedRows.filter((r) => r.deleted_at !== lastStamp), ...group];
    }

    out[meta.table] = {
      rows: completed,
      deleted: deletedRows,
      next_cursors: {
        rows: maxStamp(cursorRows, completed.map((r) => String(r.updated_at ?? ''))),
        deleted: maxStamp(cursorDeleted, deletedRows.map((r) => r.deleted_at))
      }
    };
  }
  return { tables: out };
}

// ─── push — اعمال payload همتا با داوری FWW ───

function wherePk(pk: string[]): string {
  return pk.map((c) => `${assertSafeIdent(c)} = ?`).join(' AND ');
}

/** خواندن ردیف محلی با pk کانونی */
async function fetchRow(db: DbClient, table: string, pk: string[], pkValue: string): Promise<Row | null> {
  const parts = syncPkValueSplitSafe(pkValue, pk);
  if (!parts) return null;
  const rows = await db.query<Row>(
    `SELECT * FROM ${assertSafeIdent(table)} WHERE ${wherePk(pk)}`,
    parts.map(bindValue)
  );
  return rows[0] ?? null;
}

/** شکستن pk کانونی — تعداد اجزا باید دقیقاً بخورد (گرهٔ قرارداد '|') */
function syncPkValueSplitSafe(pkValue: string, pk: string[]): string[] | null {
  const parts = pkValue.split('|');
  if (parts.length !== pk.length || parts.some((p) => p === '')) return null;
  return parts;
}

async function localTombstone(db: DbClient, table: string, pkValue: string): Promise<{ pk: string; deleted_at: string; device_id: string | null } | null> {
  return db.queryOne<{ pk: string; deleted_at: string; device_id: string | null }>(
    `SELECT pk, deleted_at, device_id FROM _sync_deleted WHERE table_name = ? AND pk = ?`,
    [table, pkValue]
  );
}

function conflictWrite(input: {
  table: string;
  pkValue: string;
  winnerSide: string;
  winnerStamp: string | null;
  loserStamp: string | null;
  rule: string;
  loserJson: string;
  deviceId: string;
}): PushWrite {
  return {
    sql: `INSERT INTO _sync_conflicts (table_name, pk, winner_side, winner_updated_at, loser_updated_at, resolved_at, detail, loser_payload, device_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      input.table,
      input.pkValue,
      input.winnerSide,
      input.winnerStamp,
      input.loserStamp,
      nowIso(),
      JSON.stringify({ rule: input.rule, table: input.table, pk: input.pkValue }),
      truncateLoserPayload(input.loserJson),
      input.deviceId
    ]
  };
}

/** UPSERT ردیف برنده — مُهر صریح می‌آید؛ trigger فقط مُهرِ تهیِ نویسندهٔ دستی را پر می‌کند */
function upsertRowWrite(table: string, columns: ColumnMeta[], pk: string[], row: Row): PushWrite {
  const cols = columns.map((c) => assertSafeIdent(c.name));
  const pkSet = new Set(pk);
  const conflictTarget = pk.map(assertSafeIdent).join(', ');
  const updateSet = columns
    .filter((c) => !pkSet.has(c.name))
    .map((c) => `${assertSafeIdent(c.name)} = excluded.${assertSafeIdent(c.name)}`)
    .join(', ');
  const placeholders = cols.map(() => '?').join(', '); // IN-bounded: به تعداد ستون‌های schema جدول (PRAGMA) — فهرست متغیر کاربر نیست
  return {
    sql: `INSERT INTO ${assertSafeIdent(table)} (${cols.join(', ')}) VALUES (${placeholders})
          ON CONFLICT(${conflictTarget}) DO UPDATE SET ${updateSet}`,
    params: cols.map((c) => bindValue(row[c]))
  };
}

/** REPLACE ردیف برنده وقتی مُهر برنده با مُهر محلی یکی است — UPDATE-trigger در این حالت
 *  مُهر را بازنویسی می‌کرد؛ recursive_triggers خاموش یعنی REPLACE نه تومب‌استون جعلی می‌سازد
 *  نه trigger حذف را می‌راند (دود بند ⑦ smoke-instance-sync). */
function replaceRowWrite(table: string, columns: ColumnMeta[], row: Row): PushWrite {
  const cols = columns.map((c) => assertSafeIdent(c.name));
  const placeholders = cols.map(() => '?').join(', '); // IN-bounded: به تعداد ستون‌های schema جدول (PRAGMA) — فهرست متغیر کاربر نیست
  return {
    sql: `INSERT OR REPLACE INTO ${assertSafeIdent(table)} (${cols.join(', ')}) VALUES (${placeholders})`,
    params: cols.map((c) => bindValue(row[c]))
  };
}

function deleteRowWrite(table: string, pk: string[], pkValue: string): PushWrite {
  return { sql: `DELETE FROM ${assertSafeIdent(table)} WHERE ${wherePk(pk)}`, params: syncPkValueSplitSafe(pkValue, pk)!.map(bindValue) };
}

function tombstoneUpsertWrite(item: { table: string; pk: string; deleted_at: string; device_id: string | null }): PushWrite {
  return {
    sql: `INSERT INTO _sync_deleted (table_name, pk, deleted_at, device_id) VALUES (?, ?, ?, ?)
          ON CONFLICT(table_name, pk) DO UPDATE SET deleted_at = excluded.deleted_at, device_id = excluded.device_id`,
    params: [item.table, item.pk, item.deleted_at, item.device_id]
  };
}

/** حذف تومب‌استون (باززنده‌سازی) — pk کانونی همان ستون pk جدول _sync_deleted است */
function tombstoneDeleteWrite(table: string, pkValue: string): PushWrite {
  return { sql: `DELETE FROM _sync_deleted WHERE table_name = ? AND pk = ?`, params: [table, pkValue] };
}

/** اعمال کل payload در یک تراکنش — خوانش‌ها اول، نوشتن‌ها یک‌جا (اتمی per-payload) */
export async function push(db: DbClient, deviceId: string, payload: PushPayload): Promise<PushResult> {
  const result: PushResult = { device_id: deviceId, tables: {}, applied: 0 };
  const writes: PushWrite[] = [];

  for (const meta of SYNC_TABLES) {
    const tablePayload = payload.tables?.[meta.table];
    const outcome: PushTableOutcome = { echo: {}, conflicts: 0, upserts: 0, rejected: [] };
    result.tables[meta.table] = outcome;
    if (!tablePayload || (!tablePayload.rows?.length && !tablePayload.deleted?.length)) continue;

    const table = assertSafeIdent(meta.table);
    const columns = await columnsOf(db, table);
    const colNames = new Set(columns.map((c) => c.name));
    const requiredCols = columns.filter((c) => c.notnull === 1 && c.pk === 0 && c.dflt === null).map((c) => c.name);

    // ─── فاز خوانش/داوری (بدون نوشتن) ───
    for (const raw of tablePayload.rows ?? []) {
      if (typeof raw !== 'object' || raw === null) {
        outcome.rejected.push({ pk: '?', reason: 'ROW_INVALID' });
        continue;
      }
      const row = raw as Row;
      const pkValue = syncPkValueOfRow(row, meta.pk);
      if (pkValue.split('|').length !== meta.pk.length || pkValue.split('|').some((p) => p === '')) {
        outcome.rejected.push({ pk: pkValue || '?', reason: 'PK_NAKAMEL' });
        continue;
      }
      const unknownCol = Object.keys(row).find((k) => !colNames.has(k));
      if (unknownCol) {
        outcome.rejected.push({ pk: pkValue, reason: `COLUMN_NASHENAKHTE:${unknownCol}` });
        continue;
      }
      const missingRequired = requiredCols.find((c) => row[c] === undefined || row[c] === null);
      if (missingRequired) {
        outcome.rejected.push({ pk: pkValue, reason: `STOON_ELZAMI:${missingRequired}` });
        continue;
      }

      const local = await fetchRow(db, meta.table, meta.pk, pkValue);
      const localTomb = await localTombstone(db, meta.table, pkValue);
      if (local !== null) {
        // ردیف موجود — داوری rowWinner؛ هر بازنده (هر دو سو) ثبت می‌شود؛ هیچ‌چیز بی‌سروصدا نمی‌افتد
        const side = await rowWinner(local as WinnerRow, row as WinnerRow);
        const sameHash = (await syncHash(local)) === (await syncHash(row));
        if (side === 'b') {
          if (sameHash) {
            outcome.echo[pkValue] = row; // محتوای یکسان — فقط همگرایی echo، بدون نوشتن و بدون تعارض
            continue;
          }
          writes.push(conflictWrite({
            table: meta.table, pkValue, winnerSide: 'remote',
            winnerStamp: (row.updated_at as string | null) ?? null,
            loserStamp: (local.updated_at as string | null) ?? null,
            rule: 'rowWinner', loserJson: JSON.stringify(local), deviceId
          }));
          outcome.conflicts += 1;
          const stampsEqual =
            typeof row.updated_at === 'string' && typeof local.updated_at === 'string' && row.updated_at === local.updated_at;
          writes.push(stampsEqual ? replaceRowWrite(meta.table, columns, row) : upsertRowWrite(meta.table, columns, meta.pk, row));
          if (localTomb) writes.push(tombstoneDeleteWrite(meta.table, pkValue));
          outcome.echo[pkValue] = row;
          outcome.upserts += 1;
        } else {
          if (!sameHash) {
            writes.push(conflictWrite({
              table: meta.table, pkValue, winnerSide: 'local',
              winnerStamp: (local.updated_at as string | null) ?? null,
              loserStamp: (row.updated_at as string | null) ?? null,
              rule: 'rowWinner', loserJson: JSON.stringify(row), deviceId
            }));
            outcome.conflicts += 1;
          }
          outcome.echo[pkValue] = local; // برندهٔ نهایی همان وضعیت محلی است
        }
      } else if (localTomb !== null) {
        // تومب‌استون محلی در برابر ردیف وارده — داور مُهر: زودترتشکیل‌شده می‌ماند
        const tombEntity = { stamp: localTomb.deleted_at, hash: await syncHash(tombstoneCanonical(meta.table, pkValue, localTomb.deleted_at)) };
        const rowEntity = { stamp: (row.updated_at as string | null) ?? null, hash: await syncHash(row) };
        if (stampHashWinner(tombEntity, rowEntity) === 'a') {
          outcome.echo[pkValue] = null; // حذف نهایی می‌ماند
        } else {
          writes.push(replaceRowWrite(meta.table, columns, row));
          writes.push(tombstoneDeleteWrite(meta.table, pkValue)); // باززنده‌سازی — تومب‌استون محلی کنار می‌رود
          outcome.echo[pkValue] = row;
          outcome.upserts += 1;
        }
      } else {
        // ردیف تازه برای گیرنده — مستقیم می‌نشیند (FWW: اولین وضعیت دیده‌شده همین است)
        writes.push(replaceRowWrite(meta.table, columns, row));
        outcome.echo[pkValue] = row;
        outcome.upserts += 1;
      }
    }

    // ─── تومب‌استون‌های وارده ───
    for (const item of tablePayload.deleted ?? []) {
      if (!item || typeof item.pk !== 'string' || item.pk === '' || typeof item.deleted_at !== 'string') {
        outcome.rejected.push({ pk: item?.pk ?? '?', reason: 'TOMB_INVALID' });
        continue;
      }
      if (syncPkValueSplitSafe(item.pk, meta.pk) === null) {
        outcome.rejected.push({ pk: item.pk, reason: 'PK_NAKHANI' });
        continue;
      }
      const localTomb = await localTombstone(db, meta.table, item.pk);
      const local = await fetchRow(db, meta.table, meta.pk, item.pk);
      const incomingTomb = { table_name: meta.table, pk: item.pk, deleted_at: item.deleted_at };
      const incomingEntity = { stamp: item.deleted_at, hash: await syncHash(incomingTomb) };

      if (local !== null) {
        const rowEntity = { stamp: (local.updated_at as string | null) ?? null, hash: await syncHash(local) };
        if (stampHashWinner(incomingEntity, rowEntity) === 'a') {
          // حذف همتا برنده است: ردیف حذف می‌شود؛ trigger تومب‌استون می‌سازد و ما مُهر همتا را
          // کانونی می‌کنیم (بازنویسی به deleted_at همتا تا داوری در دو سو یکسان بماند)
          writes.push(conflictWrite({
            table: meta.table, pkValue: item.pk, winnerSide: 'tombstone',
            winnerStamp: item.deleted_at,
            loserStamp: (local.updated_at as string | null) ?? null,
            rule: 'stampHashWinner', loserJson: JSON.stringify(local), deviceId
          }));
          outcome.conflicts += 1;
          writes.push(deleteRowWrite(meta.table, meta.pk, item.pk));
          writes.push(tombstoneUpsertWrite({ table: meta.table, pk: item.pk, deleted_at: item.deleted_at, device_id: item.device_id ?? null }));
          outcome.echo[item.pk] = null;
          outcome.upserts += 1;
        } else {
          writes.push(conflictWrite({
            table: meta.table, pkValue: item.pk, winnerSide: 'row',
            winnerStamp: (local.updated_at as string | null) ?? null,
            loserStamp: item.deleted_at,
            rule: 'stampHashWinner', loserJson: JSON.stringify(incomingTomb), deviceId
          }));
          outcome.conflicts += 1;
          outcome.echo[item.pk] = local; // ردیفِ زودترتشکیل‌شده زنده می‌ماند
        }
      } else if (localTomb !== null) {
        // دو تومب‌استون — کهن‌تر (مُهر کوچک‌تر) کانونی می‌ماند
        const localEntity = { stamp: localTomb.deleted_at, hash: await syncHash(tombstoneCanonical(meta.table, item.pk, localTomb.deleted_at)) };
        if (stampHashWinner(incomingEntity, localEntity) === 'a') {
          writes.push(tombstoneUpsertWrite({ table: meta.table, pk: item.pk, deleted_at: item.deleted_at, device_id: item.device_id ?? null }));
        }
        outcome.echo[item.pk] = null;
      } else {
        writes.push(tombstoneUpsertWrite({ table: meta.table, pk: item.pk, deleted_at: item.deleted_at, device_id: item.device_id ?? null }));
        outcome.echo[item.pk] = null;
        outcome.upserts += 1;
      }
    }
    result.applied += outcome.upserts;
  }

  // ─── فاز نوشتن — یک تراکنش اتمی؛ شکست = بدون cursor دست‌خورده (سرِ امن) ───
  if (writes.length > 0) {
    await db.transaction(async (tx) => {
      for (const w of writes) await tx.execute(w.sql, w.params);
    });
  }
  return result;
}

/** گارد جدول برای مسیرها: نام بیرون فهرست سفید = null (رد صریح در مسیر با پیام فارسی) */
export function syncTableOf(table: string) {
  return syncTableMeta(table) ?? null;
}

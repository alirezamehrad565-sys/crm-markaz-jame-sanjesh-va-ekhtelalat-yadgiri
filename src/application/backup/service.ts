import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import { ValidationError } from '@core/errors';
import { APP_VERSION, APP_MILESTONE } from '@core/version';

// ─── مکانیک پشتیبان‌گیری و بازیابی (m179) ───
// قالب فایل: gh-backup v1 (JSON با پاکت) — همهٔ جداول دیتابیس به‌جز جدول‌های سیستمی
// بازیابی = جایگزینی کامل هر جدول در یک تراکنش (delete + insert در یک batch اتمیک)
// ترتیب جداول: توپولوژیک بر اساس کلیدهای خارجی واقعی (PRAGMA foreign_key_list)

export const BACKUP_FORMAT = 'gh-backup';
export const BACKUP_FORMAT_VERSION = 1;

// جدول‌های سیستمی که هرگز در بازیابی دست نمی‌خورند
const SKIP_RESTORE_TABLES = new Set(['schema_migrations']);
// جدول نگهداری بایت فایل‌های پیوستی (سنگین‌ترین جدول — به‌صورت اختیاری در پشتیبان می‌آید)
export const FILES_TABLE = 'exercise_file_chunks';

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_REQUEST_BYTES = 60 * 1024 * 1024; // سقف حجم فایل پشتیبان هنگام بازیابی
const PAGE_SIZE = 400; // صفحهٔ خواندن ردیف‌ها هنگام خروجی گرفتن
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
  milestone?: string;
  created_at?: string;
  include_files?: boolean;
  excluded_tables?: string[];
  tables: Record<string, BackupTableData>;
}

export interface BackupStatus {
  version: string;
  milestone: string;
  tableCount: number;
  totalRows: number;
  tables: { name: string; rows: number }[];
  recent: { action: string; resource_id: string; created_at: string; changes: string | null }[];
}

export interface BackupSummary {
  format: string;
  format_version: number;
  app_version: string;
  milestone: string;
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

function assertIdent(name: string): string {
  if (!IDENT_RE.test(name)) throw new ValidationError(`نام جدول غیرمجاز است: ${name.slice(0, 40)}`);
  return name;
}

function encodeValue(v: unknown): unknown {
  if (v instanceof Uint8Array) {
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < v.length; i += CH) bin += String.fromCharCode(...v.subarray(i, i + CH));
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
}

export function createBackupService(deps: {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
}): BackupService {
  const { db, audit, logger } = deps;

  async function listTables(): Promise<string[]> {
    const rows = await db.query<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
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
    const tables = fileTables.map((name) => ({
      name,
      rows: (env.tables[name]?.rows ?? []).length
    }));
    return {
      format: env.format,
      format_version: env.format_version,
      app_version: env.app_version ?? '—',
      milestone: env.milestone ?? '—',
      created_at: env.created_at ?? '—',
      include_files: Boolean(env.include_files),
      tableCount: tables.length,
      totalRows: tables.reduce((s, t) => s + t.rows, 0),
      tables,
      schemaCompatible: problems.length === 0,
      problems
    };
  }

  async function restoreTable(
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
    const colList = cols.map((c) => `"${c}"`).join(', ');
    const placeholders = cols.map(() => '?').join(', ');
    const insertSql = `INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`;
    const selfRef = await hasSelfReference(table);

    // گروه اول: پاک‌سازی + اولین بخش درج‌ها در یک تراکنش اتمیک
    let batch: D1PreparedStatement[] = [db.prepare('PRAGMA defer_foreign_keys = ON')];
    batch.push(db.prepare(`DELETE FROM "${table}"`));
    let paramBytes = 0;
    let restored = 0;

    const flush = async (isLast = false) => {
      if (batch.length <= 1 && !isLast) return;
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
      if (!selfRef && (stmtCount >= MAX_STATEMENTS_PER_BATCH || paramBytes >= MAX_BATCH_PARAM_BYTES)) {
        await flush();
      }
    }
    await flush(true);

    return { restoredRows: restored, skippedColumns: [...fileExtra] };
  }

  const service: BackupService = {
    async getStatus() {
      const tables = await listTables();
      const withCounts: { name: string; rows: number }[] = [];
      for (const t of tables) withCounts.push({ name: t, rows: await rowCount(t) });
      const recent = await db.query<{ action: string; resource_id: string; created_at: string; changes: string | null }>(
        `SELECT action, resource_id, created_at, changes FROM audit_log
         WHERE action LIKE 'backup.%' ORDER BY created_at DESC, id DESC LIMIT 5`
      );
      return {
        version: APP_VERSION,
        milestone: APP_MILESTONE,
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
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const push = (s: string) => controller.enqueue(encoder.encode(s));
          try {
            const allTables = await listTables();
            const tables = allTables.filter((t) => !excluded.includes(t));
            const head = JSON.stringify({
              format: BACKUP_FORMAT,
              format_version: BACKUP_FORMAT_VERSION,
              app_version: APP_VERSION,
              milestone: APP_MILESTONE,
              created_at: new Date().toISOString(),
              include_files: includeFiles,
              excluded_tables: excluded
            });
            push(`${head.slice(0, -1)},"tables":{`);
            for (let i = 0; i < tables.length; i++) {
              const t = tables[i];
              const count = await rowCount(t);
              push(`${i > 0 ? ',' : ''}"${t}":{"row_count":${count},"rows":[`);
              for (let offset = 0; ; offset += PAGE_SIZE) {
                const rows = await db.query<Record<string, unknown>>(
                  `SELECT * FROM "${t}" LIMIT ${PAGE_SIZE} OFFSET ${offset}`
                );
                if (rows.length === 0) break;
                for (let r = 0; r < rows.length; r++) {
                  const clean: Record<string, unknown> = {};
                  for (const [k, v] of Object.entries(rows[r])) clean[k] = encodeValue(v);
                  push(`${r > 0 || offset > 0 ? ',' : ''}${JSON.stringify(clean)}`);
                }
                if (rows.length < PAGE_SIZE) break;
              }
              push(']}');
            }
            push('}}');
            controller.close();
          } catch (err) {
            logger.error('backup.export.failed', { error: err instanceof Error ? err.message : String(err) });
            controller.error(err);
          }
        }
      });
      return stream;
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

      const levels = await topoLevels(target);
      for (const level of levels) {
        if (level.merged && level.tables.length > 1) {
          // چرخهٔ FK — همه در یک batch
          const batch: D1PreparedStatement[] = [db.prepare('PRAGMA defer_foreign_keys = ON')];
          const projected: { table: string; cols: string[]; rows: Record<string, unknown>[] }[] = [];
          for (const t of level.tables) {
            const cols = await tableColumns(t);
            batch.push(db.prepare(`DELETE FROM "${t}"`));
            projected.push({ table: t, cols, rows: env.tables[t]?.rows ?? [] });
          }
          for (const p of projected) {
            const colList = p.cols.map((c) => `"${c}"`).join(', ');
            const placeholders = p.cols.map(() => '?').join(', ');
            for (const row of p.rows) {
              batch.push(
                db.prepare(
                  `INSERT INTO "${p.table}" (${colList}) VALUES (${placeholders})`,
                  p.cols.map((c) => encodeValue(row[c]))
                )
              );
              totalRows += 1;
            }
            reportTables.push({ name: p.table, restoredRows: p.rows.length, skippedColumns: [] });
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
          const res = await restoreTable(t, env.tables[t] ?? { rows: [] }, warnings);
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
    }
  };

  return service;
}

export { MAX_REQUEST_BYTES, SKIP_RESTORE_TABLES };

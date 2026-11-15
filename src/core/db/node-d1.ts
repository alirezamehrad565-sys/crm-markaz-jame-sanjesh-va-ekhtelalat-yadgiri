/**
 * درایور D1-سازگارِ پروداکشن روی node:sqlite — بستر سلف‌هاست (Docker/سرور شخصی)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 *
 * طرح مرجع: docs/DOCKERIZE.md §۳-۱ — همان اینترفیس D1Database (prepare/bind/all/first/run/batch)
 * تا هیچ خط کد اپلیکیشن عوض نشود. منطق از MockD1 (src/test/mock-d1.ts) با این تفاوت‌های عملیاتی:
 *   • فایل واقعی SQLite با WAL + foreign_keys=ON + busy_timeout=5000
 *   • پارامتر Uint8Array به‌صورت BLOB بایند می‌شود (نه base64 — parity با D1 واقعی)
 *   • بازگشت meta.changes/last_row_id مطابق D1 (عدد، نه bigint)
 *
 * انتخاب درایور در نقطهٔ ورود سرور (server/node-main.ts) انجام می‌شود؛ باند Cloudflare
 * (D1 واقعی از طریق wrangler) کاملاً دست‌نخورده می‌ماند.
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

type SqliteModule = typeof import('node:sqlite');

function loadSqlite(): SqliteModule {
  const mod = (process as unknown as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule?.(
    'node:sqlite'
  ) as SqliteModule | undefined;
  if (!mod) {
    // fallback برای فرایندهایی که getBuiltinModule ندارند (Node <21)
    try {
      const require = createRequire(import.meta.url);
      return require('node:sqlite') as SqliteModule;
    } catch {
      throw new Error('node:sqlite در این نسخه Node در دسترس نیست (نیاز: >=22.5)');
    }
  }
  return mod;
}

const { DatabaseSync } = loadSqlite();

export type DatabaseSyncInstance = import('node:sqlite').DatabaseSync;

type BoundValue = string | number | bigint | Uint8Array | null;

function normalizeParam(p: unknown): BoundValue {
  if (p === undefined) return null;
  if (typeof p === 'boolean') return p ? 1 : 0;
  if (p === null || typeof p === 'string' || typeof p === 'number' || typeof p === 'bigint') {
    return p;
  }
  if (p instanceof Uint8Array) return Buffer.from(p); // BLOB — parity با رفتار D1 واقعی
  throw new TypeError(`پارامتر غیرقابل bind برای NodeD1: ${typeof p}`);
}

function isRowReturning(sql: string): boolean {
  return /^\s*(SELECT|WITH|PRAGMA|EXPLAIN)/i.test(sql);
}

export class NodeD1PreparedStatement {
  constructor(
    private readonly store: DatabaseSyncInstance,
    private readonly sql: string,
    private readonly params: unknown[]
  ) {}

  bind(...params: unknown[]): NodeD1PreparedStatement {
    return new NodeD1PreparedStatement(this.store, this.sql, params);
  }

  /** @internal برای batch بدون ساخت مجدد statement */
  private execSync(): { rows: Record<string, unknown>[]; changes: number } {
    const stmt = this.store.prepare(this.sql);
    const params = this.params.map(normalizeParam);
    if (isRowReturning(this.sql)) {
      const rows = stmt.all(...params) as Record<string, unknown>[];
      return { rows, changes: 0 };
    }
    const info = stmt.run(...params);
    return { rows: [], changes: Number(info.changes) };
  }

  async all<T>(): Promise<{ results: T[]; meta: Record<string, unknown> }> {
    const { rows } = this.execSync();
    return { results: rows as T[], meta: { duration: 0, changes: 0 } };
  }

  async first<T>(colName?: string): Promise<T | null> {
    const { rows } = this.execSync();
    const first = rows[0];
    if (first === undefined) return null;
    if (colName !== undefined) return (first[colName] as T) ?? null;
    return first as T;
  }

  async run(): Promise<{ success: boolean; meta: { changes: number; last_row_id: number; duration: number } }> {
    const stmt = this.store.prepare(this.sql);
    const params = this.params.map(normalizeParam);
    const info = stmt.run(...params);
    return {
      success: true,
      meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid), duration: 0 }
    };
  }

  async raw(): Promise<unknown[]> {
    const { rows } = this.execSync();
    return rows.map((r) => Object.values(r));
  }
}

export class NodeD1 {
  private constructor(private readonly store: DatabaseSyncInstance) {}

  /** باز کردن (در صورت نیاز ساخت) دیتابیس فایلی با تنظیمات پروداکشن */
  static open(dbPath: string): NodeD1 {
    mkdirSync(path.dirname(dbPath), { recursive: true });
    const store = new DatabaseSync(dbPath);
    store.exec('PRAGMA journal_mode = WAL;');
    store.exec('PRAGMA synchronous = NORMAL;');
    store.exec('PRAGMA foreign_keys = ON;');
    store.exec('PRAGMA busy_timeout = 5000;');
    return new NodeD1(store);
  }

  prepare(sql: string): NodeD1PreparedStatement {
    return new NodeD1PreparedStatement(this.store, sql, []);
  }

  async batch(statements: NodeD1PreparedStatement[]): Promise<Array<{ success: boolean; meta: Record<string, unknown> }>> {
    if (statements.length === 0) return [];
    const results: Array<{ success: boolean; meta: Record<string, unknown> }> = [];
    this.store.exec('BEGIN IMMEDIATE');
    try {
      for (const stmt of statements) {
        const { changes } = (
          stmt as unknown as { execSync(): { rows: Record<string, unknown>[]; changes: number } }
        ).execSync();
        results.push({ success: true, meta: { changes, rows_affected: changes, duration: 0 } });
      }
      this.store.exec('COMMIT');
      return results;
    } catch (err) {
      this.store.exec('ROLLBACK');
      throw err;
    }
  }

  /** دسترسی خام (بکاپ/بازیابی/import) — خارج از اینترفیس D1 */
  get rawStore(): DatabaseSyncInstance {
    return this.store;
  }

  /** بستن تمیز دیتابیس (خاموشی نرم سرور) */
  close(): void {
    try {
      this.store.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    } catch {
      // بستن نباید به‌خاطر checkpoint خطا بدهد
    }
    this.store.close();
  }
}

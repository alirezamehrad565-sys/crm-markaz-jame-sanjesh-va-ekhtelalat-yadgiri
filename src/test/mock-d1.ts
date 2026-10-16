/**
 * D1 درون‌حافظه‌ای برای تست‌ها
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// ماک D1Database روی node:sqlite — برای تست‌های یکپارچه بدون Miniflare
// فقط همان سطح APIای که اپ استفاده می‌کند را پیاده می‌کند:
// prepare(sql) → bind(...params) → all / first / run
// batch(stmts) — اتمیک (BEGIN/COMMIT؛ خطا → ROLLBACK)
// پارامترها: boolean → 1/0 و undefined → null (رفتار نزدیک به D1)
// نکته: node:sqlite با process.getBuiltinModule بارگذاری می‌شود تا vite/vitest
// آن را bundle نکند (import ایستای node:sqlite در vitest resolve نمی‌شود).

type SqliteModule = typeof import('node:sqlite');

function loadSqlite(): SqliteModule {
  const mod = (process as unknown as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule?.(
    'node:sqlite'
  ) as SqliteModule | undefined;
  if (!mod) throw new Error('node:sqlite در این نسخه Node در دسترس نیست (نیاز: >=22.5)');
  return mod;
}

const { DatabaseSync } = loadSqlite();

/** کلاس DatabaseSync برای هارنس (ساخت DB در حافظه) */
export { DatabaseSync };

/** تایپ نمونهٔ DatabaseSync (بدون تداخل value/type) */
export type DatabaseSyncInstance = import('node:sqlite').DatabaseSync;

type BoundValue = string | number | bigint | null;

function normalizeParam(p: unknown): BoundValue {
  if (p === undefined) return null;
  if (typeof p === 'boolean') return p ? 1 : 0;
  if (p === null || typeof p === 'string' || typeof p === 'number' || typeof p === 'bigint') {
    return p;
  }
  // بافر/آرایه بایت — در این پروژه استفاده نمی‌شود؛ محافظت:
  if (p instanceof Uint8Array) return Buffer.from(p).toString('base64');
  throw new TypeError(`پارامتر غیرقابل bind برای D1 ماک: ${typeof p}`);
}

function isRowReturning(sql: string): boolean {
  return /^\s*(SELECT|WITH|PRAGMA|EXPLAIN)/i.test(sql);
}

export class MockD1PreparedStatement {
  constructor(
    private readonly store: import('node:sqlite').DatabaseSync,
    private readonly sql: string,
    private readonly params: unknown[]
  ) {}

  bind(...params: unknown[]): MockD1PreparedStatement {
    return new MockD1PreparedStatement(this.store, this.sql, params);
  }

  /** اجرای همگام — برای batch داخلی هم استفاده می‌شود */
  private execSync(): { rows: Record<string, unknown>[]; changes: number | bigint } {
    const stmt = this.store.prepare(this.sql);
    const params = this.params.map(normalizeParam);
    if (isRowReturning(this.sql)) {
      const rows = stmt.all(...params) as Record<string, unknown>[];
      return { rows, changes: 0 };
    }
    const info = stmt.run(...params);
    return { rows: [], changes: info.changes };
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

  async run(): Promise<{ success: boolean; meta: { changes: number | bigint; last_row_id: number | bigint; duration: number } }> {
    const stmt = this.store.prepare(this.sql);
    const params = this.params.map(normalizeParam);
    const info = stmt.run(...params);
    return {
      success: true,
      meta: { changes: info.changes, last_row_id: info.lastInsertRowid, duration: 0 }
    };
  }

  async raw(): Promise<unknown[]> {
    const { rows } = this.execSync();
    return rows.map((r) => Object.values(r));
  }
}

export class MockD1 {
  constructor(private readonly store: import('node:sqlite').DatabaseSync) {}

  prepare(sql: string): MockD1PreparedStatement {
    return new MockD1PreparedStatement(this.store, sql, []);
  }

  async batch(statements: MockD1PreparedStatement[]): Promise<Array<{ success: boolean; meta: Record<string, unknown> }>> {
    if (statements.length === 0) return [];
    const results: Array<{ success: boolean; meta: Record<string, unknown> }> = [];
    this.store.exec('BEGIN IMMEDIATE');
    try {
      for (const stmt of statements) {
        // execSync خصوصی است — با cast امن به آن دسترسی داریم تا batch اتمیک بماند
        const { changes } = (
          stmt as unknown as { execSync(): { rows: Record<string, unknown>[]; changes: number | bigint } }
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

  /** دسترسی خام برای fixture/_assert در تست‌ها */
  get rawStore(): import('node:sqlite').DatabaseSync {
    return this.store;
  }
}

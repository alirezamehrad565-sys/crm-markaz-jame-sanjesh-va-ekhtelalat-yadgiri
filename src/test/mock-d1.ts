type SqliteModule = typeof import('node:sqlite');

function loadSqlite(): SqliteModule {
  const mod = (process as unknown as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule?.(
    'node:sqlite'
  ) as SqliteModule | undefined;
  if (!mod) throw new Error('node:sqlite در این نسخه Node در دسترس نیست (نیاز: >=22.5)');
  return mod;
}

const { DatabaseSync } = loadSqlite();

export { DatabaseSync };

export type DatabaseSyncInstance = import('node:sqlite').DatabaseSync;

type BoundValue = string | number | bigint | null;

function normalizeParam(p: unknown): BoundValue {
  if (p === undefined) return null;
  if (typeof p === 'boolean') return p ? 1 : 0;
  if (p === null || typeof p === 'string' || typeof p === 'number' || typeof p === 'bigint') {
    return p;
  }
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

  get rawStore(): import('node:sqlite').DatabaseSync {
    return this.store;
  }
}

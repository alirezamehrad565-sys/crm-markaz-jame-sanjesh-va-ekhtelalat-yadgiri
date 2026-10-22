import type { Logger } from '@core/logger';

export interface DbClient {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  queryOne<T>(sql: string, params?: unknown[]): Promise<T | null>;
  execute(sql: string, params?: unknown[]): Promise<D1Result>;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
  transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T>;
}

export function createDb(d1: D1Database, logger?: Logger): DbClient {
  const base: DbClient = {
    async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      const stmt = d1.prepare(sql).bind(...params);
      const res = await stmt.all<T>();
      return res.results ?? [];
    },

    async queryOne<T>(sql: string, params: unknown[] = []): Promise<T | null> {
      const rows = await base.query<T>(sql, params);
      return rows.length > 0 ? rows[0] : null;
    },

    async execute(sql: string, params: unknown[] = []): Promise<D1Result> {
      return d1.prepare(sql).bind(...params).run();
    },

    async batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
      if (statements.length === 0) return [];
      return d1.batch(statements);
    },

    async transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T> {
      const statements: D1PreparedStatement[] = [];

      const tx: DbClient = {
        query: <T>(sql: string, params: unknown[] = []) => base.query<T>(sql, params),
        queryOne: <T>(sql: string, params: unknown[] = []) => base.queryOne<T>(sql, params),
        execute: (sql, params = []) => {
          statements.push(d1.prepare(sql).bind(...params));
          return Promise.resolve({ success: true, meta: {} } as unknown as D1Result);
        },
        batch: (stmts) => {
          statements.push(...stmts);
          return Promise.resolve([]);
        },
        transaction: <U>(fn2: (tx2: DbClient) => Promise<U>): Promise<U> => fn2(tx)
      };

      const result = await fn(tx);

      if (statements.length > 0) {
        try {
          await d1.batch(statements);
        } catch (err) {
          logger?.error('transaction.batch.failed', {
            statementCount: statements.length,
            error: err instanceof Error ? err.message : 'unknown'
          });
          throw err;
        }
      }
      return result;
    }
  };

  return base;
}

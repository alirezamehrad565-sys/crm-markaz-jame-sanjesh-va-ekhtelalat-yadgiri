// ۱.۲۶.۴ — ۴-۲: آرشیو پشتیبان تأییدشده + GET /api/backup/download (قرارداد frozen)
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Hono } from 'hono';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
// @ts-expect-error — ماژول plain mjs موتور
import { applyMigrations } from '../../../../scripts/engine/apply-migrations.mjs';
// @ts-expect-error — ماژول plain mjs موتور
import { d1SqlitePath } from '../../../../scripts/engine/engine-paths.mjs';
import { createBackupService } from '@app/backup/service';
import { registerBackupRoutes } from '@app/backup/routes';
import type { AppHono, AppBindings, AppVariables } from '@core/shared';
import type { DbClient } from '@core/db';

/** DbClient واقعی روی node:sqlite — هم‌سطح ماک D1 مخزن (query/queryOne/execute) */
function sqliteDb(dbPath: string): DbClient {
  const raw = new DatabaseSync(dbPath);
  const toRows = <T>(rows: unknown[]): T[] => rows as T[];
  return {
    async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      if (sql.startsWith('SELECT') || sql.startsWith('PRAGMA')) {
        return toRows<T>(raw.prepare(sql).all(...(params as never[])));
      }
      raw.prepare(sql).run(...(params as never[]));
      return [];
    },
    async queryOne<T>(sql: string, params: unknown[] = []): Promise<T | null> {
      const row = raw.prepare(sql).get(...(params as never[]));
      return (row as T) ?? null;
    },
    async execute(sql: string, params: unknown[] = []): Promise<D1Result> {
      raw.prepare(sql).run(...(params as never[]));
      return { success: true, meta: {} } as unknown as D1Result;
    },
    prepare(sql: string, params: unknown[] = []) {
      throw new Error('batch path not used in archive tests');
    },
    async batch(): Promise<D1Result[]> {
      return [];
    },
    async transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T> {
      return fn(sqliteDb(dbPath));
    }
  } as unknown as DbClient;
}

const fakeAudit = {
  log: async (): Promise<void> => undefined,
  logInTransaction: async (): Promise<void> => undefined,
  pruneOld: async (): Promise<number> => 0
};
const fakeLogger = {
  debug: () => {}, info: () => {}, warn: () => {}, error: () => {},
  child: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, child: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }) })
};

let dataDir: string;
let dbPath: string;

beforeAll(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'backup-archive-'));
  dbPath = d1SqlitePath(dataDir);
  applyMigrations(dbPath);
  const db = new DatabaseSync(dbPath);
  db.prepare(`INSERT INTO settings (key, value) VALUES ('probe', '"x"')`).run();
  db.close();
});
afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

function buildApp(service: unknown): AppHono {
  const app = new Hono<{ Bindings: AppBindings; Variables: AppVariables }>() as AppHono;
  app.use('/api/*', async (c, next) => {
    c.set('authContext', { staffId: 'm1', email: 'm@x', role: 'manager', displayName: 'مدیر' });
    await next();
  });
  registerBackupRoutes(app, service as never);
  return app;
}

describe('آرشیو محلی آخرین پشتیبان تأییدشده (۴-۲)', () => {
  it('archiveLatest پاکت gh-backup تأییدشده را نگه می‌دارد و getArchivedBackup می‌دهد', async () => {
    const service = createBackupService({ db: sqliteDb(dbPath), audit: fakeAudit as never, logger: fakeLogger as never });
    const outcome = await service.archiveLatest({ staffId: 'system' });
    expect(outcome.archived).toBe(true);
    const archived = await service.getArchivedBackup();
    expect(archived).not.toBeNull();
    expect(archived!.createdAt).toBeTruthy();
    const envelope = JSON.parse(new TextDecoder().decode(archived!.bytes));
    expect(envelope.format).toBe('gh-backup');
    expect(envelope.format_version).toBe(1);
    expect(Object.keys(envelope.tables).length).toBeGreaterThan(0);
  });

  it('GET /api/backup/download → octet-stream با نام قراردادی backup-<UTCts>.db', async () => {
    const service = createBackupService({ db: sqliteDb(dbPath), audit: fakeAudit as never, logger: fakeLogger as never });
    const app = buildApp(service);
    const res = await app.request('/api/backup/download');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/octet-stream');
    const disp = res.headers.get('content-disposition') ?? '';
    expect(disp).toMatch(/^attachment; filename="backup-\d{14}\.db"$/);
  });

  it('هیچ پشتیبانی ممکن نشد → ۴۰۴ با پاکت قراردادی NO_BACKUP', async () => {
    const app = buildApp({
      getArchivedBackup: async () => null,
      archiveLatest: async () => ({ archived: false, bytes: 0, reason: 'error' })
    });
    const res = await app.request('/api/backup/download');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: 'NO_BACKUP', message: 'پشتیبانی موجود نیست' });
  });
});

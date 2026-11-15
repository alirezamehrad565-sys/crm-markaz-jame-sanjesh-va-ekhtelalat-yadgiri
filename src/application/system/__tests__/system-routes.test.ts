// ۱.۲۶.۴ — ۴-۲: سه endpoint نجات — restart + restart-status + بستهٔ خطا (zip بدون dep)
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { AppHono, AppVariables, AppBindings } from '@core/shared';
import { registerSystemRoutes, registerSystemPublicRoutes } from '@app/system/routes';
import { buildStoreZip, zipText } from '@app/system/zip';
import { buildErrorPackage } from '@app/system/error-package';
import type { DbClient } from '@core/db';

/* فک DbClient سبک برای مسیرهای آزمون — فقط queryOne/query/execute لازم است */
function fakeDb(rows: Record<string, unknown> = {}): DbClient {
  const kv = new Map<string, string>();
  const asDb = {
    async query<T>(sql: string): Promise<T[]> {
      if (sql.includes('FROM audit_log')) return (rows.audit ?? []) as T[];
      if (sql.includes('FROM client_errors')) return (rows.clientErrors ?? []) as T[];
      return [] as T[];
    },
    async queryOne<T>(sql: string, params: unknown[] = []): Promise<T | null> {
      // پرس‌وجوهای settings پارامتری‌اند (WHERE key = ?) — با پارامتر تطبیق می‌دهیم
      if (sql.includes('FROM settings')) {
        const key = typeof params[0] === 'string' ? params[0] : '';
        // شکل واقعی ردیف settings: { value: <JSON رشته‌ای> } — میرور و صف رویدادها هر دو
        if (key === 'nodesync:status-mirror-v1') return (rows.mirror ? { value: JSON.stringify(rows.mirror) } : null) as T;
        if (key === 'sys_human_events') return (rows.humanEvents ? { value: JSON.stringify(rows.humanEvents) } : null) as T;
        if (kv.has(key)) return { value: kv.get(key) } as T;
        return null;
      }
      if (sql.includes('COUNT(*) AS n FROM client_errors')) return ({ n: rows.pendingCount ?? 0 } as T);
      return null;
    },
    async execute(sql: string, params: unknown[] = []): Promise<D1Result> {
      // نگهدارندهٔ سادهٔ settings در حافظه — نوشتنِ مُهر باید در خواندن restart-status دیده شود
      if (sql.includes('INSERT INTO settings') && typeof params[0] === 'string') {
        kv.set(params[0], String(params[1] ?? ''));
      }
      return { success: true, meta: {} } as unknown as D1Result;
    },
    prepare() {
      throw new Error('not needed');
    },
    async batch(): Promise<D1Result[]> {
      return [];
    },
    async transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T> {
      return fn(asDb as unknown as DbClient);
    }
  } as unknown as DbClient;
  return asDb;
}

const fakeAudit = {
  log: async (): Promise<void> => undefined
};

function buildApp(deps: Parameters<typeof registerSystemRoutes>[1]): AppHono {
  const app = new Hono<{ Bindings: AppBindings; Variables: AppVariables }>() as AppHono;
  app.use('/api/*', async (c, next) => {
    c.set('authContext', { staffId: 'm1', email: 'm@x', role: 'manager', displayName: 'مدیر' });
    await next();
  });
  registerSystemPublicRoutes(app, deps);
  registerSystemRoutes(app, deps);
  return app;
}

describe('POST /api/system/restart — مُهر خروج عمدی', () => {
  it('نخستین درخواست → {ok,scheduled} و دومین → already:true', async () => {
    const calls: string[] = [];
    const app = buildApp({
      db: fakeDb(),
      audit: {
        log: async (e: { action: string }) => { calls.push(e.action); },
        logInTransaction: async (): Promise<void> => undefined,
        pruneOld: async (): Promise<number> => 0
      },
      logger: { warn: () => {}, info: () => {}, error: () => {}, debug: () => {}, child: () => ({ warn: () => {}, info: () => {}, error: () => {}, debug: () => {}, child: () => ({ warn: () => {}, info: () => {}, error: () => {}, debug: () => {}, child: () => { throw new Error('x'); } }) }) } as never,
      envName: 'test'
    });
    const r1 = await app.request('/api/system/restart', { method: 'POST' });
    expect(r1.status).toBe(200);
    const j1 = await r1.json();
    expect(j1).toEqual({ ok: true, scheduled: true });
    const r2 = await app.request('/api/system/restart', { method: 'POST' });
    expect(await r2.json()).toEqual({ ok: true, scheduled: true, already: true });
    expect(calls.filter((a) => a === 'system.restart_request').length).toBe(2);

    // restart-status (مسیر عمومی ناظر) مُهر درون‌حافظه را می‌بیند
    const st = await app.request('/api/system/restart-status');
    expect(await st.json()).toEqual({ ok: true, scheduled: true });
  });
});

describe('GET /api/support/error-package — بستهٔ zip سبک', () => {
  it('سازندهٔ zip امضاهای PK و ساختار درست دارد', () => {
    const bytes = buildStoreZip([
      { name: 'a.txt', data: zipText('سلام دنیا') },
      { name: 'status.json', data: zipText(JSON.stringify({ ok: true })) }
    ]);
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(bytes[2]).toBe(0x03);
    expect(bytes[3]).toBe(0x04);
    const text = Buffer.from(bytes).toString('latin1');
    expect(text).toContain('PK\x01\x02'); // central directory
    expect(text).toContain('PK\x05\x06'); // EOCD
    expect(bytes.length).toBeGreaterThan(100);
  });

  it('بستهٔ خطا: status.json با نسخه‌ها + دم رویدادها + readme فارسی', async () => {
    const db = fakeDb({
      mirror: { version: { client: '1.26.4', center: '9.9.9-center', compatible: true }, push_watermark: null },
      humanEvents: [{ ts: '2026-11-14T00:00:00Z', source: 'engine', msg: 'رویداد آزمونی' }],
      pendingCount: 7
    });
    const pkg = await buildErrorPackage(db, { envName: 'test' });
    expect(pkg.filename).toMatch(/^error-package-\d{8}-\d{6}\.zip$/);
    const text = Buffer.from(pkg.bytes).toString('latin1');
    expect(text).toContain('status.json');
    expect(text).toContain('human-events.txt');
    expect(text).toContain('audit-tail.txt');
    expect(text).toContain('readme.txt');
    expect(pkg.status.center_version).toBe('9.9.9-center');
    expect(pkg.status.pending_push).toBeGreaterThan(0);
  });
});

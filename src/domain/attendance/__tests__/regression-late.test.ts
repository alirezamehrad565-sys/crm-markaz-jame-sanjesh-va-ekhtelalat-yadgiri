// ۱.۲۷.۶۰ — رگرسیون نقد پرونده روی مهاجرت‌های واقعی (نه خواندن متن کد):
// CHECK جدول appointment_students مقدار late را می‌پذیرد (نقص ۱)، گارد زمانی جلسهٔ آینده را می‌بندد
// و برگشت به «در انتظار» برای اصلاح پذیرفته است (نقص ۲).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
// @ts-expect-error — ماژول plain mjs موتور
import { applyMigrations } from '../../../../scripts/engine/apply-migrations.mjs';
// @ts-expect-error — ماژول plain mjs موتور
import { d1SqlitePath } from '../../../../scripts/engine/engine-paths.mjs';
import { createAttendanceService } from '@domain/attendance';
import { ValidationError } from '@core/errors';
import type { DbClient } from '@core/db';

/** DbClient واقعی روی node:sqlite — هم‌سطح الگوی backup-archive.test.ts */
function sqliteDb(dbPath: string): DbClient {
  const raw = new DatabaseSync(dbPath);
  try { raw.exec('PRAGMA foreign_keys = OFF'); } catch { /* نسخه‌های قدیمی node:sqlite */ }
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
    async execute(sql: string, params: unknown[] = []): Promise<unknown> {
      raw.prepare(sql).run(...(params as never[]));
      return { success: true, meta: {} };
    },
    async transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T> {
      return fn(sqliteDb(dbPath));
    }
  } as unknown as DbClient;
}

const fakeAudit = { log: async (): Promise<void> => undefined, logInTransaction: async (): Promise<void> => undefined, pruneOld: async (): Promise<number> => 0 };
const fakeLogger = { child: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }) };

let dataDir: string;
let dbPath: string;

beforeAll(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'att-late-regression-'));
  dbPath = d1SqlitePath(dataDir);
  applyMigrations(dbPath);
});
afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

const actor = { staffId: 'm1', email: 'm@x', role: 'manager', displayName: 'مدیر' } as never;

async function seedAppointment(db: DbClient, id: string, startIso: string): Promise<void> {
  await db.execute(
    `INSERT INTO appointments (id, staff_id, start_at, end_at, status, created_by) VALUES (?, 'st1', ?, ?, 'scheduled', 'm1')`,
    [id, startIso, new Date(Date.parse(startIso) + 45 * 60000).toISOString()]
  );
  await db.execute(`INSERT INTO appointment_students (appointment_id, student_id) VALUES (?, 'su1')`, [id]);
}

describe('رگرسیون نقد پرونده — حضور دانش‌آموز با مهاجرت‌های واقعی', () => {
  it('۱) «حضور با تأخیر» (late) روی جدول واقعی ثبت می‌شود — دیگر ۵۰۰ نیست (نقص ۱)', async () => {
    const db = sqliteDb(dbPath);
    await seedAppointment(db, 'a-past', new Date(Date.now() - 86_400_000).toISOString());
    const svc = createAttendanceService({ db, audit: fakeAudit as never, logger: fakeLogger as never });
    const out = await svc.mark('a-past', 'su1', 'late', undefined, actor);
    expect(out.status).toBe('late');
  });

  it('۲) ثبت حضور برای جلسهٔ برگزارنشده رد می‌شود — پیام روشن (نقص ۲)', async () => {
    const db = sqliteDb(dbPath);
    await seedAppointment(db, 'a-future', new Date(Date.now() + 5 * 86_400_000).toISOString());
    const svc = createAttendanceService({ db, audit: fakeAudit as never, logger: fakeLogger as never });
    await expect(svc.mark('a-future', 'su1', 'present', undefined, actor)).rejects.toBeInstanceOf(ValidationError);
  });

  it('۳) برگرداندن حضور به «در انتظار» برای اصلاح اشتباه پذیرفته می‌شود (نقص ۲)', async () => {
    const db = sqliteDb(dbPath);
    await seedAppointment(db, 'a-revert', new Date(Date.now() - 3_600_000).toISOString());
    const svc = createAttendanceService({ db, audit: fakeAudit as never, logger: fakeLogger as never });
    await svc.mark('a-revert', 'su1', 'absent', undefined, actor);
    const out = await svc.mark('a-revert', 'su1', 'pending', undefined, actor);
    expect(out.status).toBe('pending');
  });
});

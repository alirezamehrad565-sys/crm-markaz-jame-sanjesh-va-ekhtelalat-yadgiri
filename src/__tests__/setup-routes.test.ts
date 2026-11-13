/**
 * v1.26.0 — آزمون ماژول «راه‌اندازی نخست»: getSetupStatus + completeSetup
 * با فِیک DbClient (SQL مورد استفادهٔ همین ماژول) — بدون D1 واقعی.
 */
import { describe, expect, it } from 'vitest';
import { completeSetup, getSetupStatus, DEMO_STAFF_IDS } from '../application/setup/routes.js';
import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';

interface StaffRow { id: string; active: number; password_hash: string | null; username: string | null }

function fakeDb(): DbClient & { staff: Map<string, StaffRow>; settings: Map<string, string> } {
  const staff = new Map<string, StaffRow>();
  for (const id of DEMO_STAFF_IDS) {
    staff.set(id, { id, active: 1, password_hash: 'pbkdf2$demo', username: id.slice(-3) });
  }
  const settings = new Map<string, string>();
  const db = {
    staff,
    settings,
    async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      const s = sql.toLowerCase();
      if (s.includes('update staff')) {
        const [hash, _at, id] = params as [string, string, string];
        const row = staff.get(id as string);
        const out: T[] = [];
        if (row && row.active === 1) {
          row.active = 0;
          row.password_hash = hash;
          void _at;
          out.push({ id } as T);
        }
        return out;
      }
      if (s.includes('insert into settings')) {
        const [key, value] = params as [string, string];
        settings.set(key, value);
        return [];
      }
      return [];
    },
    async queryOne<T>(sql: string, params: unknown[] = []): Promise<T | null> {
      const s = sql.toLowerCase();
      if (s.includes('from settings where key')) {
        const key = params[0] as string;
        if (!settings.has(key)) return null;
        return { value: settings.get(key) } as unknown as T;
      }
      if (s.includes('count(*) as n from staff')) {
        const ids = params as string[];
        let n = 0;
        for (const row of staff.values()) {
          if (row.active === 1 && !ids.includes(row.id)) n += 1;
        }
        return { n } as unknown as T;
      }
      if (s.includes('select id from staff where id')) {
        const row = staff.get(params[0] as string);
        return row ? ({ id: row.id } as unknown as T) : null;
      }
      return null;
    },
    async execute(): Promise<D1Result> {
      return { success: true, meta: {} } as D1Result;
    },
    prepare(): D1PreparedStatement {
      throw new Error('prepare در این آزمون استفاده نمی‌شود');
    },
    async batch(): Promise<D1Result[]> {
      return [];
    },
    async transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T> {
      return fn(db);
    }
  };
  return db as unknown as DbClient & { staff: Map<string, StaffRow>; settings: Map<string, string> };
}

function fakeAudit(): AuditWriter & { entries: string[] } {
  const entries: string[] = [];
  return {
    entries,
    async log(entry: { action: string }) {
      entries.push(entry.action);
    }
  } as unknown as AuditWriter & { entries: string[] };
}

function fakeLogger(): Logger {
  const base = {
    debug() {}, info() {}, warn() {}, error() {},
    child(): Logger {
      return fakeLogger();
    }
  };
  return base as unknown as Logger;
}

describe('راه‌اندازی نخست — وضعیت و بستن حساب نمایشی', () => {
  it('پایگاه تازه: initialized=false و demo_active=true', async () => {
    const db = fakeDb();
    const st = await getSetupStatus(db);
    expect(st.initialized).toBe(false);
    expect(st.demo_active).toBe(true);
  });

  it('کارمند واقعی فعال → initialized=true حتی بدون پرچم settings', async () => {
    const db = fakeDb();
    db.staff.set('11111111-1111-4111-8111-111111111111', {
      id: '11111111-1111-4111-8111-111111111111',
      active: 1,
      password_hash: 'pbkdf2$real',
      username: 'real'
    });
    const st = await getSetupStatus(db);
    expect(st.initialized).toBe(true);
    expect(st.demo_active).toBe(false);
  });

  it('completeSetup(close_demo): سه حساب نمایشی بسته می‌شوند + پرچم + audit؛ بار دوم ۴۰۹', async () => {
    const db = fakeDb();
    const audit = fakeAudit();
    const out = await completeSetup({ db, audit, logger: fakeLogger() }, true);
    expect(out.demo_locked).toBe(3);
    for (const id of DEMO_STAFF_IDS) {
      const row = db.staff.get(id);
      expect(row?.active).toBe(0);
      expect(row?.password_hash).not.toBe('pbkdf2$demo'); // هش تصادفی تازه
    }
    expect(db.settings.get('setup_completed')).toBe('1');
    expect(audit.entries.filter((a) => a === 'setup.demo_locked')).toHaveLength(3);
    expect(audit.entries).toContain('setup.completed');

    await expect(completeSetup({ db, audit, logger: fakeLogger() }, true)).rejects.toThrow(/قبلاً کامل شده/);
  });

  it('بدون close_demo فقط پرچم می‌نشیند و حساب نمایشی می‌ماند', async () => {
    const db = fakeDb();
    const audit = fakeAudit();
    const out = await completeSetup({ db, audit, logger: fakeLogger() }, false);
    expect(out.demo_locked).toBe(0);
    expect(db.staff.get(DEMO_STAFF_IDS[0])?.active).toBe(1);
    expect(db.settings.get('setup_completed')).toBe('1');
  });

  it('idهای نمایشی دقیقاً همان سه seed هستند (manager/secretary/therapist)', () => {
    expect(DEMO_STAFF_IDS).toHaveLength(3);
    expect(DEMO_STAFF_IDS[0].endsWith('0301')).toBe(true);
    expect(DEMO_STAFF_IDS[1].endsWith('0302')).toBe(true);
    expect(DEMO_STAFF_IDS[2].endsWith('0303')).toBe(true);
  });
});

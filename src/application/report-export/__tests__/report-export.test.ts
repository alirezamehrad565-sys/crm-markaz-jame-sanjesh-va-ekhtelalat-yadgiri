import { describe, it, expect } from 'vitest';
import { createReportExportService, reportNoOf, jalaliYearOfIso, sha256Hex } from '../service';
import type { AuthContext } from '@core/shared';
import type { DbClient } from '@core/db';

/* موج ۳ طرح ارتقای پرونده (طرح C) — قطعی‌سازی خروجی: snapshot-first با شمارهٔ سالانه/هش/امضا.
   دیتابیس فیک است؛ تمرکز روی قرارداد قطعی‌سازی، راستی‌آزمایی هش و رفتار رقابت شماره. */

const actor = {
  staffId: 'st1',
  email: 'x@center.test',
  role: 'therapist',
  displayName: 'دکتر رضا'
} as never as AuthContext;

function makeDeps() {
  const stored: Array<Record<string, unknown>> = [];
  let pendingOther = 0; // ردیفی که «نویسندهٔ دیگر» بین شمارش و درج اضافه می‌کند (شبیه‌سازی رقابت)
  let failFirstWithUnique = false;
  const db = {
    async query() {
      return stored.map((r) => ({ ...r }));
    },
    async queryOne(sql: string, params?: unknown[]) {
      if (String(sql).includes('COUNT(*)')) return { n: stored.length + pendingOther };
      const id = String(params?.[1] ?? '');
      const row = stored.find((r) => r.id === id);
      return row ? { ...row } : null;
    },
    async execute(_sql: string, params: unknown[]) {
      if (failFirstWithUnique) {
        failFirstWithUnique = false;
        pendingOther = 1; // نویسندهٔ دیگر 0001 را گرفت
        throw new Error('UNIQUE constraint failed: report_snapshots.report_no');
      }
      stored.push({
        id: params[0],
        student_id: params[1],
        template_key: params[2],
        path_id: params[3],
        period_from: null,
        period_to: null,
        sections_json: params[6],
        content_hash: params[7],
        report_no: params[8],
        signed_by: params[9],
        signed_name: params[10],
        signed_role: params[11],
        created_at: '2026-11-22T10:00:00Z'
      });
      return { success: true, meta: { changes: 1 } };
    }
  };
  const auditLog: Array<{ action: string; resourceId: string }> = [];
  const deps = {
    db: db as unknown as DbClient,
    audit: { log: async (e: { action: string; resourceId: string }) => { auditLog.push(e); }, logInTransaction: async () => {}, pruneOld: async () => 0 },
    buildReport: async () => ({ pathway: { studentId: 's1', targetTitle: 'دقت شنیداری' } }),
    now: () => new Date('2026-11-22T10:00:00Z')
  };
  return { deps, stored, auditLog, simulateUniqueRace: () => { failFirstWithUnique = true; } };
}

describe('ابزارهای قطعی‌سازی — توابع خالص', () => {
  it('reportNoOf — سال جلالی + ترتیب چهاررقمی', () => {
    expect(reportNoOf(1405, 1)).toBe('1405-0001');
    expect(reportNoOf(1405, 47)).toBe('1405-0047');
  });

  it('jalaliYearOfIso — تهران مبنای تقویم مرکز است', () => {
    expect(jalaliYearOfIso('2025-10-07T06:30:00Z')).toBe(1404); // ۱۵ مهر ۱۴۰۴
    expect(jalaliYearOfIso('2026-11-22T10:00:00Z')).toBe(1405);
  });

  it('sha256Hex — قطعی، ۶۴ رقم، متفاوت با محتوای متفاوت', async () => {
    const h = await sha256Hex('{"a":1}');
    expect(h).toHaveLength(64);
    expect(await sha256Hex('{"a":1}')).toBe(h);
    expect(await sha256Hex('{"a":2}')).not.toBe(h);
  });
});

describe('createReportExportService — snapshot-first (طرح C)', () => {
  it('create — شمارهٔ سالانه + هش واقعی محتوا + امضا + audit append-only', async () => {
    const { deps, auditLog } = makeDeps();
    const svc = createReportExportService(deps);
    const rec = await svc.create('s1', { pathId: 'p1' }, actor);
    expect(rec.reportNo).toBe('1405-0001');
    expect(rec.hashVerified).toBe(true);
    expect(rec.signedName).toBe('دکتر رضا');
    expect(rec.templateKey).toBe('pathway_report');
    expect(rec.contentHash).toBe(await sha256Hex(JSON.stringify(rec.sections)));
    expect(auditLog).toHaveLength(1);
    expect(auditLog[0].action).toBe('report.snapshot.created');
  });

  it('create — گزارشِ پروندهٔ دیگر NotFound می‌دهد (نشت بین پرونده‌ها بسته است)', async () => {
    const { deps } = makeDeps();
    const svc = createReportExportService(deps);
    await expect(svc.create('s2', { pathId: 'p1' }, actor)).rejects.toThrow();
  });

  it('getOne — بازتولید عین محتوا: هش در لحظهٔ خواندن بازمحاسبه و تأیید می‌شود', async () => {
    const { deps } = makeDeps();
    const svc = createReportExportService(deps);
    const rec = await svc.create('s1', { pathId: 'p1' }, actor);
    const got = await svc.getOne('s1', rec.id);
    expect(got.hashVerified).toBe(true);
    expect(got.reportNo).toBe(rec.reportNo);
    expect(got.sections).toEqual(rec.sections);
    await expect(svc.getOne('s1', 'nope')).rejects.toThrow();
  });

  it('رقابت شماره — UNIQUE باعث شمارش دوباره و شمارهٔ بعدی می‌شود (تا ۳ تلاش)', async () => {
    const { deps, simulateUniqueRace } = makeDeps();
    simulateUniqueRace(); // نویسندهٔ دیگر بین شمارش و درج، 0001 را می‌گیرد
    const svc = createReportExportService(deps);
    const rec = await svc.create('s1', { pathId: 'p1' }, actor);
    expect(rec.reportNo).toBe('1405-0002');
  });

  it('list — فهرست اسناد پرونده، بدون ردیف پروندهٔ دیگر', async () => {
    const { deps } = makeDeps();
    const svc = createReportExportService(deps);
    await svc.create('s1', { pathId: 'p1' }, actor);
    const items = await svc.list('s1');
    expect(items).toHaveLength(1);
    expect(items[0].studentId).toBe('s1');
  });
});

// آزمون‌های نگه‌داری audit_log (ف۴ طرح ارتقا — P1-4): حذف ردیف‌های کهنه از کرون شبانه
// زمینه: جدول audit_log از 0001 بدون هیچ DELETE دوره‌ای ساخته شده بود و بی‌کران رشد می‌کرد —
// پاکسازی فقط از مسیر writer.pruneOld (کرون digest) مجاز است؛ هرگز مسیر درخواست نیست.
// هم‌سبک e2e-client-errors.test.ts (آزمون pruneOld) — ردیف کهنه با فرمت هم‌قرارداد datetime('now') درج می‌شود.
// توجه: مایگریشن 0041 دو ردیف seed در audit_log دارد — ادعاها همیشه نسبی (بر اساس شناسه) نوشته شده‌اند.
import { describe, it, expect } from 'vitest';
import { createTestApp } from '../../../test/harness';
import { createDb } from '@core/db';
import { createAuditWriter, parseAuditRetentionDays, AUDIT_RETENTION_DAYS_DEFAULT } from '../writer';
import type { AuditWriter } from '../writer';

/** درج مستقیم ردیف audit با مُهر کهنه — فرمت 'YYYY-MM-DD HH:MM:SS' (قرارداد ستون created_at جدول 0001) */
async function insertAuditAt(db: ReturnType<typeof createDb>, id: string, ageDays: number): Promise<void> {
  const stamp = new Date(Date.now() - ageDays * 24 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  await db.execute(
    `INSERT INTO audit_log (id, actor_id, action, resource_type, resource_id, changes, created_at)
     VALUES (?, 'system', 'test.action', 'test', 'row', NULL, '${stamp}')`,
    [id]
  );
}

async function auditIds(db: ReturnType<typeof createDb>): Promise<string[]> {
  const rows = await db.query<{ id: string }>('SELECT id FROM audit_log ORDER BY created_at, id');
  return rows.map((r) => r.id);
}

function writerOf(days: number | undefined, db: ReturnType<typeof createDb>): AuditWriter {
  return createAuditWriter(db, days === undefined ? undefined : { retentionDays: days });
}

describe('نگه‌داری audit_log — pruneOld با سقف پیش‌فرض ۱۸۰ روز', () => {
  it('ردیف‌های کهنه‌تر از ۱۸۰ روز حذف می‌شوند و تازه‌ها می‌مانند — تعداد حذف‌شده برمی‌گردد', async () => {
    const A = createTestApp();
    const db = createDb(A.env.DB as never);
    const audit = writerOf(undefined, db); // بدون opts — پیش‌فرض ۱۸۰ روز
    await insertAuditAt(db, 'old-181', 181); // کهنه — باید حذف شود
    await insertAuditAt(db, 'old-200', 200); // کهنه‌تر — باید حذف شود
    await insertAuditAt(db, 'recent-1', 1); // تازه — باید بماند
    await insertAuditAt(db, 'recent-179', 179); // هنوز داخل سقف — باید بماند
    const deleted = await audit.pruneOld();
    expect(deleted).toBe(2);
    const ids = await auditIds(db);
    expect(ids).toContain('recent-1');
    expect(ids).toContain('recent-179');
    expect(ids).not.toContain('old-181');
    expect(ids).not.toContain('old-200');
  });

  it('مرز برش: ردیف دقیقاً روی خطِ حذف می‌ماند («قدیم‌تر از» سقف حذف می‌شود نه «هم‌سن»)', async () => {
    // تصمیم قراردادی: cutoff = now − N روز و شرط created_at < cutoff (سخت‌گیری هم‌سوی client_errors/rum)؛
    // پس ردیفی که دقیقاً هم‌مقدار cutoff است داخل نگه‌داری می‌ماند — رفتار مرزی صریح و آزمون‌شده
    const A = createTestApp();
    const db = createDb(A.env.DB as never);
    const audit = writerOf(180, db);
    const cutoff = new Date(Date.now() - 180 * 24 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
    await db.execute(
      `INSERT INTO audit_log (id, actor_id, action, resource_type, resource_id, changes, created_at)
       VALUES ('on-boundary', 'system', 'test.action', 'test', 'row', NULL, '${cutoff}')`,
      []
    );
    await insertAuditAt(db, 'one-day-older', 181);
    const deleted = await audit.pruneOld();
    expect(deleted).toBe(1);
    expect(await auditIds(db)).toEqual(expect.arrayContaining(['on-boundary']));
    expect(await auditIds(db)).not.toContain('one-day-older');
  });

  it('سقف صفر یعنی پاکسازی خاموش — هیچ حذفی انجام نمی‌شود و تعداد صفر برمی‌گردد', async () => {
    const A = createTestApp();
    const db = createDb(A.env.DB as never);
    const audit = writerOf(0, db);
    await insertAuditAt(db, 'ancient-400', 400);
    await insertAuditAt(db, 'ancient-1000', 1000);
    const before = await auditIds(db);
    const deleted = await audit.pruneOld();
    expect(deleted).toBe(0);
    expect(await auditIds(db)).toEqual(before); // هیچ ردیفی دست نخورد — حتی seedهای مایگریشن
  });

  it('سقف کوتاه‌تر (مثلاً ۹۰) هم درست برش می‌زند — سقف هنگام ساخت نویسنده بسته می‌شود', async () => {
    const A = createTestApp();
    const db = createDb(A.env.DB as never);
    const audit = writerOf(90, db);
    await insertAuditAt(db, 'old-100', 100);
    await insertAuditAt(db, 'keep-10', 10);
    expect(await audit.pruneOld()).toBe(1);
    const ids = await auditIds(db);
    expect(ids).toContain('keep-10');
    expect(ids).not.toContain('old-100');
  });

  it('نوشتن معمولی (log) پس از فعال‌سازی pruneOld دست‌نخورده است — همان نویسنده هر دو کار را می‌کند', async () => {
    const A = createTestApp();
    const db = createDb(A.env.DB as never);
    const audit = writerOf(undefined, db);
    await audit.log({ actorId: 'm1', action: 'appointment.create', resourceType: 'appointment', resourceId: 'a-1' });
    const row = await db.queryOne<{ action: string }>('SELECT action FROM audit_log WHERE resource_id = ?', ['a-1']);
    expect(row?.action).toBe('appointment.create');
  });
});

describe('نگه‌داری audit_log — تفسیر env اختیاری AUDIT_LOG_RETENTION_DAYS', () => {
  it('نبود مقدار → پیش‌فرض ۱۸۰', () => {
    expect(parseAuditRetentionDays(undefined)).toBe(AUDIT_RETENTION_DAYS_DEFAULT);
    expect(parseAuditRetentionDays(null)).toBe(AUDIT_RETENTION_DAYS_DEFAULT);
    expect(parseAuditRetentionDays('')).toBe(AUDIT_RETENTION_DAYS_DEFAULT);
    expect(AUDIT_RETENTION_DAYS_DEFAULT).toBe(180);
  });

  it('رشتهٔ عددی env می‌پذیرد («۹۰» لاتین، با فاصله) — خروجی عدد صحیح', () => {
    expect(parseAuditRetentionDays('90')).toBe(90);
    expect(parseAuditRetentionDays(' 90 ')).toBe(90);
    expect(parseAuditRetentionDays(90)).toBe(90);
    expect(parseAuditRetentionDays('30.9')).toBe(30); // برش به صحیح
  });

  it('مقدار «0» یعنی خاموش — به‌جای پیش‌فرض، صفر برمی‌گردد', () => {
    expect(parseAuditRetentionDays('0')).toBe(0);
    expect(parseAuditRetentionDays(0)).toBe(0);
  });

  it('مقدار نامعتبر (غیرعددی/منفی/NaN) به پیش‌فرض ۱۸۰ برمی‌گردد — هرگز قرمز نمی‌شود', () => {
    expect(parseAuditRetentionDays('abc')).toBe(180);
    expect(parseAuditRetentionDays('-5')).toBe(180);
    expect(parseAuditRetentionDays(-5)).toBe(180);
    expect(parseAuditRetentionDays(Number.NaN)).toBe(180);
    expect(parseAuditRetentionDays(Infinity)).toBe(180);
  });
});

// آزمون‌های گزارش رشد جدول‌ها (ف۴ — بهداشت داده): شمارش روزانهٔ idempotent با مُهر ۲۴ساعته + خواندن فقط‌مدیر
// زمینه: COUNT(*) همهٔ جدول‌ها هرگز نباید در مسیر درخواست رخ دهد — فقط کرون digest؛
// گزارش فقط snapshotها را می‌خواند و برچسب سیاست نگه‌داری می‌دهد («بی‌سیاست» = جدولِ بی‌خط‌مشی، کارکرد اصلی گزارش).
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, asRole, Api } from '../../test/harness';
import { createDb } from '@core/db';
import { createGrowthService, GROWTH_SNAPSHOT_SEAL_KEY, GROWTH_TABLE_SELF } from '../growth/service';
import { silentLogger } from '../../test/harness';
import type { Logger } from '@core/logger';
import type { DbClient } from '@core/db';

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

const logger: Logger = silentLogger('growth-it');

function ymdOffset(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

async function clearSeal(db: DbClient): Promise<void> {
  await db.execute(`DELETE FROM settings WHERE key = '${GROWTH_SNAPSHOT_SEAL_KEY}'`);
}

/** درج دستی snapshot کهنه برای ساخت تاریخچهٔ دلتا */
async function injectSnapshot(db: DbClient, table: string, date: string, count: number): Promise<void> {
  await db.execute(
    `INSERT INTO table_growth_snapshots (snapshot_date, table_name, row_count, captured_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(snapshot_date, table_name) DO UPDATE SET row_count = excluded.row_count, captured_at = excluded.captured_at`,
    [date, table, count, `${date}T23:00:00.000Z`]
  );
}

describe('گزارش رشد — شمارش روزانه (کرون digest)', () => {
  it('همهٔ جدول‌های کاربری را شمارش می‌کند و خودش/sqlite_/_cf_ را بیرون می‌گذارد', async () => {
    const A = createTestApp();
    const db = createDb(A.env.DB as never);
    const svc = createGrowthService({ db, logger });
    const res = await svc.captureDaily();
    expect(res.skipped).toBe(false);
    expect(res.tables).toBeGreaterThan(50); // ~۹۰ جدول مایگریشن‌ها — حداقلِ منطقی

    const snaps = await db.query<{ table_name: string; snapshot_date: string; row_count: number }>(
      'SELECT table_name, snapshot_date, row_count FROM table_growth_snapshots'
    );
    const names = snaps.map((s) => s.table_name);
    expect(names).not.toContain(GROWTH_TABLE_SELF);
    expect(names.every((n) => !n.startsWith('sqlite_'))).toBe(true);
    expect(names.every((n) => !n.startsWith('_cf_'))).toBe(true);
    // شمارش واقعی هم‌خوان — نمونهٔ عینی: جدول staff از seed
    const staffLive = await db.queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM staff');
    expect(snaps.find((s) => s.table_name === 'staff')?.row_count).toBe(staffLive?.n ?? -1);
    // همهٔ snapshotها هم‌تاریخ امروز
    expect(new Set(snaps.map((s) => s.snapshot_date)).size).toBe(1);
  });

  it('مُهر ۲۴ساعته: اجرای دوم همان روز رد می‌شود — صفر شمارش تازه', async () => {
    const A = createTestApp();
    const db = createDb(A.env.DB as never);
    const svc = createGrowthService({ db, logger });
    const first = await svc.captureDaily();
    expect(first.skipped).toBe(false);
    const second = await svc.captureDaily();
    expect(second.skipped).toBe(true);
    expect(second.reason).toBe('sealed');
    expect(second.tables).toBe(0);
    expect(second.last_snapshot_at).toBeTruthy();
  });

  it('idempotent هم‌روز: پس از پاک‌شدن مُهر، اجرای دوباره فقط بازنویسی می‌کند — نه ردیف تکراری', async () => {
    const A = createTestApp();
    const db = createDb(A.env.DB as never);
    const svc = createGrowthService({ db, logger });
    await svc.captureDaily();
    const afterFirst = await db.queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM table_growth_snapshots');
    await clearSeal(db);
    // یک ردیف واقعی اضافه کنیم تا شمارشِ بازنویسی تغییر کند — UPSERT باید عدد تازه را بنشیند
    await db.execute(
      `INSERT INTO students (id, national_id, first_name, last_name, gender, grade, school_id)
       VALUES ('student-growth-1', '9876543210', 'نام', 'خانواده', 'male', 'سوم', '10000000-0000-0000-0000-000000000001')`
    ).catch(() => undefined);
    const second = await svc.captureDaily();
    expect(second.skipped).toBe(false);
    const afterSecond = await db.queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM table_growth_snapshots');
    expect(afterSecond?.n).toBe(afterFirst?.n); // تعداد ردیف‌ها ثابت — فقط مقادیر همان روز بازنویسی شده‌اند
    // شمارش جدول students باید عدد تازه را گرفته باشد
    const studentsLive = await db.queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM students');
    const snap = await db.queryOne<{ row_count: number }>(
      `SELECT row_count FROM table_growth_snapshots WHERE table_name = 'students'`
    );
    expect(snap?.row_count).toBe(studentsLive?.n ?? -1);
  });

  it('مُهر در settings ثبت می‌شود (growth.last_snapshot_at — هم‌الگوی مُهرهای cp-sync)', async () => {
    const A = createTestApp();
    const db = createDb(A.env.DB as never);
    const svc = createGrowthService({ db, logger });
    await svc.captureDaily();
    const row = await db.queryOne<{ value: string; updated_by: string }>(
      'SELECT value, updated_by FROM settings WHERE key = ?',
      [GROWTH_SNAPSHOT_SEAL_KEY]
    );
    expect(row?.updated_by).toBe('growth-cron');
    const parsed: unknown = JSON.parse(row?.value ?? 'null');
    expect(typeof parsed).toBe('string');
    expect(Number.isNaN(Date.parse(parsed as string))).toBe(false);
  });
});

describe('گزارش رشد — خواندن GET /api/growth/report (فقط‌مدیر)', () => {
  let A: ReturnType<typeof createTestApp>;

  beforeAll(async () => {
    A = createTestApp();
    const db = createDb(A.env.DB as never);
    const svc = createGrowthService({ db, logger });
    await svc.captureDaily();
    // تاریخچهٔ ساختگی جدول students: ۳۵روز پیش ۱۰۰، ۱۰روز پیش ۱۵۰ — امروز از capture (شمارش واقعی seed+۱)
    await injectSnapshot(db, 'students', ymdOffset(35), 100);
    await injectSnapshot(db, 'students', ymdOffset(10), 150);
    // جدول game_links فقط یک snapshot قدیمی ۳۵روزه دارد — مبنای ۷روز ندارد
    await injectSnapshot(db, 'rum_events', ymdOffset(3), 5); // فقط در پنجرهٔ ۷روز — مبنای کهنه ندارد
  });

  it('مدیر گزارش کامل می‌گیرد — دلتاها، میانگین روزانه، شمارش زنده و برچسب سیاست', async () => {
    const mgr = await asRole(A, 'manager');
    const res = await mgr.get('/api/growth/report');
    expect(res.status).toBe(200);
    expect(res.cacheControl).toBe('no-store');
    const data = dataOf<{ generated_at: string; last_snapshot_at: string | null; snapshot_days: number; tables: Array<{
      table_name: string; policy: string; latest_count: number | null; latest_date: string | null;
      delta_7d: number | null; delta_30d: number | null; avg_daily: number | null; live_count: number | null;
    }> }>(res);

    expect(data.snapshot_days).toBe(4); // امروز + سه تاریخ تزریقی متمایز (۳۵/۱۰/۳ روز پیش)
    expect(data.last_snapshot_at).toBeTruthy();

    const students = data.tables.find((t) => t.table_name === 'students');
    expect(students).toBeTruthy();
    expect(students!.latest_date).toBe(ymdOffset(0)); // تازه‌ترین snapshot = امروز (capture)
    const studentsLive = (await (A.db as unknown as { queryOne<T>(s: string): Promise<{ n: number } | null> }).queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM students')) as { n: number } | null;
    expect(students!.live_count).toBe(studentsLive?.n ?? null);
    // دلتاها نسبت به مبناهای تزریقی
    expect(students!.delta_7d).toBe(students!.latest_count! - 150); // مبنای ۷روز = snapshot ۱۰روز پیش
    expect(students!.delta_30d).toBe(students!.latest_count! - 100); // مبنای ۳۰روز = snapshot ۳۵روز پیش
    expect(students!.avg_daily).toBeCloseTo((students!.latest_count! - 150) / 10, 1); // فاصلهٔ ۱۰ روزه

    // جدولی که فقط snapshot داخل ۷روز دارد — مبنای کهنه ندارد → هر دو دلتا null
    const rum = data.tables.find((t) => t.table_name === 'rum_events');
    expect(rum!.delta_7d).toBeNull();
    expect(rum!.delta_30d).toBeNull();
    expect(rum!.avg_daily).toBeNull();
    // تازه‌ترین snapshot همان شمارش امروزِ capture است (تزریقِ ۳روز پیش جایگزین نشده)
    const rumLive = await A.db.prepare('SELECT COUNT(*) AS n FROM rum_events').first<{ n: number }>();
    expect(rum!.latest_count).toBe(Number(rumLive?.n ?? -1));

    // جدول game_links فقط snapshot کهنه دارد؛ امروزی ندارد → latest همان کهنه است ولی دلتا null (مبنای کهنه‌تر ندارد)
    // توجه: inject نکردیم؛ فقط تزریقی‌های بالا
  });

  it('برچسب سیاست: جدول‌های شناخته‌شده دقیق و بی‌سیاست‌ها اول گزارش می‌آیند', async () => {
    const mgr = await asRole(A, 'manager');
    const data = dataOf<{ tables: Array<{ table_name: string; policy: string; live_count: number | null; latest_count: number | null }> }>(
      await mgr.get('/api/growth/report')
    );
    const byName = new Map(data.tables.map((t) => [t.table_name, t.policy]));
    expect(byName.get('audit_log')).toBe('۱۸۰ روز');
    expect(byName.get('rum_events')).toBe('۹۰ روز');
    expect(byName.get('client_errors')).toBe('۹۰ روز');
    expect(byName.get('network_content')).toBe('فقط-افزودنی');
    expect(byName.get('game_links')).toBe('پاکسازی دوره‌ای');
    expect(byName.get('game_preview_tokens')).toBe('پاکسازی دوره‌ای');
    expect(byName.get(GROWTH_TABLE_SELF)).toBe('بازنویسی روزانه (خودپایش)');
    // جدول‌های بی‌خط‌مشی واقعی مخزن — کارکرد اصلی گزارش: لو دادن «بی‌سیاست»
    expect(byName.get('students')).toBe('بی‌سیاست');
    expect(byName.get('appointments')).toBe('بی‌سیاست');
    // ترتیب: همهٔ بی‌سیاست‌ها پیش از شناخته‌شده‌ها
    const firstKnown = data.tables.findIndex((t) => t.policy !== 'بی‌سیاست');
    expect(firstKnown).toBeGreaterThan(0);
    expect(data.tables.slice(firstKnown).every((t) => t.policy !== 'بی‌سیاست')).toBe(true);
    // خودِ جدول شمارش هم در گزارش هست (با شمارش زنده، بی‌snapshot تاریخی)
    const selfRow = data.tables.find((t) => t.table_name === GROWTH_TABLE_SELF);
    expect(selfRow).toBeTruthy();
    expect(selfRow!.live_count).toBeGreaterThan(0);
    expect(selfRow!.latest_count).toBeNull(); // شمارش خودش را در snapshot نمی‌گیرد
  });

  it('درمانگر ۴۰۳ و بی‌احراز ۴۰۱ می‌گیرد', async () => {
    const ther = await asRole(A, 'therapist');
    expect((await ther.get('/api/growth/report')).status).toBe(403);
    const anon = new Api(A);
    expect((await anon.get('/api/growth/report')).status).toBe(401);
  });
});

import { describe, it, expect } from 'vitest';
import { createTestApp, asRole, MANAGER_ID, ALI_ID } from '../../../test/harness';
import { BACKUP_FORMAT } from '../service';
import { APP_VERSION, APP_MILESTONE } from '../../../core/version';

describe('پشتیبان‌گیری — وضعیت و خروجی', () => {
  it('وضعیت جداول را با تعداد ردیف برمی‌گرداند', async () => {
    const t = createTestApp();
    const api = await asRole(t, 'manager');
    const res = await api.get('/api/backup/status');
    expect(res.status).toBe(200);
    const data = (res.body as { data: { tableCount: number; totalRows: number; version: string; tables: { name: string; rows: number }[] } }).data;
    expect(data.version).toBe(APP_VERSION);
    expect(data.tableCount).toBeGreaterThan(30);
    const staff = data.tables.find((x) => x.name === 'staff');
    expect(staff?.rows).toBeGreaterThan(0);
  });

  it('خروجی پشتیبان قالب gh-backup با پاکت کامل دارد', async () => {
    const t = createTestApp();
    const api = await asRole(t, 'manager');
    const res = await api.get('/api/backup/export');
    expect(res.status).toBe(200);
    const env = res.body as unknown as { format: string; format_version: number; app_version: string; milestone: string; tables: Record<string, { row_count: number; rows: unknown[] }> };
    expect(env.format).toBe(BACKUP_FORMAT);
    expect(env.format_version).toBe(1);
    expect(env.app_version).toBe(APP_VERSION);
    expect(env.milestone).toBe(APP_MILESTONE);
    expect(env.tables.students.row_count).toBeGreaterThan(0);
    expect(Array.isArray(env.tables.students.rows)).toBe(true);
  });

  it('به‌طور پیش‌فرض جدول بایت فایل‌ها را حذف می‌کند و با include_files=1 می‌آورد', async () => {
    const t = createTestApp();
    const api = await asRole(t, 'manager');
    const light = (await api.get('/api/backup/export')).body as unknown as { tables: Record<string, unknown>; include_files: boolean };
    expect(light.include_files).toBe(false);
    expect(light.tables.exercise_file_chunks).toBeUndefined();
    const full = (await api.get('/api/backup/export?include_files=1')).body as unknown as { tables: Record<string, unknown>; include_files: boolean };
    expect(full.include_files).toBe(true);
    expect(full.tables.exercise_file_chunks).toBeDefined();
  });

  it('درمانگر و ناظر به پشتیبان‌گیری دسترسی ندارند', async () => {
    const t = createTestApp();
    const therapist = await asRole(t, 'therapist');
    expect((await therapist.get('/api/backup/status')).status).toBe(403);
    expect((await therapist.get('/api/backup/export')).status).toBe(403);
    const secretary = await asRole(t, 'secretary');
    expect((await secretary.post('/api/backup/restore', { confirm: true })).status).toBe(403);
  });
});

describe('پشتیبان‌گیری — بررسی فایل (inspect)', () => {
  it('خلاصهٔ فایل سالم را تأیید می‌کند', async () => {
    const t = createTestApp();
    const api = await asRole(t, 'manager');
    const backup = (await api.get('/api/backup/export')).body;
    const res = await api.post('/api/backup/inspect', backup);
    expect(res.status).toBe(200);
    const data = (res.body as { data: { schemaCompatible: boolean; tableCount: number; totalRows: number; problems: string[] } }).data;
    expect(data.schemaCompatible).toBe(true);
    expect(data.problems).toHaveLength(0);
    expect(data.totalRows).toBeGreaterThan(0);
  });

  it('فایل خراب یا غریبه را رد می‌کند', async () => {
    const t = createTestApp();
    const api = await asRole(t, 'manager');
    expect((await api.post('/api/backup/inspect', { hello: 1 })).status).toBe(400);
    expect((await api.post('/api/backup/inspect', { format: 'other-tool', tables: {} })).status).toBe(400);
    const bad = { format: BACKUP_FORMAT, format_version: 1, tables: { students: { rows: [] } } };
    const res = await api.post('/api/backup/inspect', bad);
    expect(res.status).toBe(200);
    const data = (res.body as { data: { schemaCompatible: boolean; problems: string[] } }).data;
    expect(data.schemaCompatible).toBe(false);
    expect(data.problems.join(' ')).toContain('در فایل پشتیبان نیستند');
  });
});

describe('پشتیبان‌گیری — بازیابی کامل (چرخهٔ رفت‌وبرگشت)', () => {
  it('دادهٔ حذف‌شده را برمی‌گرداند و دادهٔ تازه را پاک می‌کند (شناسه‌ها ثابت)', async () => {
    const t = createTestApp();
    const manager = await asRole(t, 'manager');

    // ۱) دادهٔ اولیه: یک دانش‌آموز ثبت می‌شود
    const before = await manager.get('/api/students');
    const studentsBefore = (before.body as { data: unknown[] }).data;
    expect(studentsBefore.length).toBeGreaterThan(0);

    // ۲) پشتیبان گرفته می‌شود
    const backup = (await manager.get('/api/backup/export')).body;

    // ۳) تخریب عمدی: همهٔ دانش‌آموزان حذف + یک ردیف تازه اضافه
    t.sql.exec("DELETE FROM students");
    t.sql.exec("INSERT INTO students (id, national_id, first_name, last_name, gender, grade, school_id, guardian_name, guardian_relation, guardian_phone, created_at) VALUES ('99999999-0000-0000-0000-000000000009', '1111111111', 'تازه', 'واردشده', 'male', 'اول', '10000000-0000-0000-0000-000000000001', 'ولی', 'father', '09120000000', datetime('now'))");
    const wiped = await manager.get('/api/students');
    expect((wiped.body as { data: unknown[] }).data).toHaveLength(1);

    // ۴) بازیابی فایل پشتیبان
    const res = await manager.post('/api/backup/restore', { backup, confirm: true });
    expect(res.status).toBe(200);
    const report = (res.body as { data: { ok: boolean; totalRows: number; tables: { name: string; restoredRows: number }[] } }).data;
    expect(report.ok).toBe(true);
    expect(report.totalRows).toBeGreaterThan(0);

    // ۵) داده‌ها دقیقاً مثل لحظهٔ پشتیبان برگشته‌اند
    const after = await manager.get('/api/students');
    expect((after.body as { data: unknown[] }).data).toEqual(studentsBefore);
    const ghosts = t.sql.prepare("SELECT COUNT(*) AS c FROM students WHERE id = '99999999-0000-0000-0000-000000000009'").get() as { c: number };
    expect(ghosts.c).toBe(0);

    // ۶) رویداد بازیابی در دفتر ثبت آمده
    const audits = t.sql.prepare("SELECT COUNT(*) AS c FROM audit_log WHERE action = 'backup.restore'").get() as { c: number };
    expect(audits.c).toBe(1);
  });

  it('بدون تأیید صریح بازیابی نمی‌کند', async () => {
    const t = createTestApp();
    const manager = await asRole(t, 'manager');
    const backup = (await manager.get('/api/backup/export')).body;
    expect((await manager.post('/api/backup/restore', { backup })).status).toBe(400);
    expect((await manager.post('/api/backup/restore', { backup, confirm: false })).status).toBe(400);
    // دیتابیس دست‌نخورده مانده
    const students = await manager.get('/api/students');
    expect((students.body as { data: unknown[] }).data.length).toBeGreaterThan(0);
  });

  it('ناهم‌خوانی اسکیما را رد می‌کند و هیچ چیزی را پاک نمی‌کند', async () => {
    const t = createTestApp();
    const manager = await asRole(t, 'manager');
    const backup = (await manager.get('/api/backup/export')).body as { tables: Record<string, unknown> };
    // جدولی از فایل حذف می‌شود
    const broken = JSON.parse(JSON.stringify(backup));
    delete broken.tables.waitlist;
    const res = await manager.post('/api/backup/restore', { backup: broken, confirm: true });
    expect(res.status).toBe(400);
    const msg = (res.body as { message?: string }).message ?? '';
    expect(msg).toContain('هم‌خوان نیست');
    const students = await manager.get('/api/students');
    expect((students.body as { data: unknown[] }).data.length).toBeGreaterThan(0);
  });

  it('چرخهٔ کلید خارجی (جداول درهم‌پیوسته) را هم بازیابی می‌کند', async () => {
    const t = createTestApp();
    // دو جدول موقت با ارجاع دوطرفه — مسیر «ادغام چرخه» را آزمایش می‌کند
    t.sql.exec(`
      CREATE TABLE zz_cycle_a (id TEXT PRIMARY KEY, b_id TEXT NOT NULL REFERENCES zz_cycle_b(id));
      CREATE TABLE zz_cycle_b (id TEXT PRIMARY KEY, a_id TEXT NOT NULL REFERENCES zz_cycle_a(id));
      BEGIN;
      PRAGMA defer_foreign_keys = ON;
      INSERT INTO zz_cycle_a (id, b_id) VALUES ('a1', 'b1');
      INSERT INTO zz_cycle_b (id, a_id) VALUES ('b1', 'a1');
      COMMIT;
    `);
    const manager = await asRole(t, 'manager');
    const backup = (await manager.get('/api/backup/export')).body;

    t.sql.exec('BEGIN; PRAGMA defer_foreign_keys = ON; DELETE FROM zz_cycle_a; DELETE FROM zz_cycle_b; COMMIT;'); // چرخه — با تأخیر FK
    expect((t.sql.prepare('SELECT COUNT(*) AS c FROM zz_cycle_a').get() as { c: number }).c).toBe(0);

    const res = await manager.post('/api/backup/restore', { backup, confirm: true });
    expect(res.status).toBe(200);
    expect((t.sql.prepare('SELECT COUNT(*) AS c FROM zz_cycle_a').get() as { c: number }).c).toBe(1);
    expect((t.sql.prepare('SELECT COUNT(*) AS c FROM zz_cycle_b').get() as { c: number }).c).toBe(1);
  });

  it('بازیابی سبک (بدون جدول فایل‌ها) ردیف‌های فایل را دست نمی‌زند', async () => {
    const t = createTestApp();
    t.sql.exec(`
      INSERT INTO exercise_file_chunks (key, seq, content) VALUES ('k-test', 0, x'414243');
    `);
    const manager = await asRole(t, 'manager');
    const light = (await manager.get('/api/backup/export')).body; // بدون include_files
    const res = await manager.post('/api/backup/restore', { backup: light, confirm: true });
    expect(res.status).toBe(200);
    const chunks = t.sql.prepare("SELECT COUNT(*) AS c FROM exercise_file_chunks WHERE key = 'k-test'").get() as { c: number };
    expect(chunks.c).toBe(1);
  });
});

describe('پشتیبان‌گیری — ستون‌های ناشناخته', () => {
  it('ردیف‌های فایل با ستون اضافه را با پروجکشن ستونی درج می‌کند', async () => {
    const t = createTestApp();
    const manager = await asRole(t, 'manager');
    const backup = (await manager.get('/api/backup/export')) as unknown as { body: { tables: Record<string, { rows: Record<string, unknown>[] }> } };
    // ستون خیالی به اولین ردیف تنظیمات اضافه می‌شود — بازیابی نباید بشکند
    const tags = backup.body.tables.tags;
    if (tags.rows.length > 0) tags.rows[0].__future_column = 'x';
    const res = await manager.post('/api/backup/restore', { backup: backup.body, confirm: true });
    expect(res.status).toBe(200);
    const report = (res.body as { data: { warnings: string[] } }).data;
    expect(report.warnings.join(' ')).toContain('__future_column');
  });
});

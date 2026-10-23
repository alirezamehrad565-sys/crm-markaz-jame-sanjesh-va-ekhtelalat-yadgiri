import { describe, it, expect } from 'vitest';
import { createTestApp, asRole, silentLogger } from '../../../test/harness';
import { createServices } from '@app/api-routing';
import { createAuditWriter } from '@core/audit';
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

// ─── m181 — رگرسیون‌های دیباگ روی دادهٔ واقعی پروداکشن ───

describe('پشتیبان‌گیری — رگرسیون‌های بازیابی واقعی (m181)', () => {
  it('جدول والدِ چندچانکه (بیش از ۳۰ ردیف) با فرزندِ ارجاع‌دهنده به چانک بعدی بازیابی می‌شود', async () => {
    // ریشهٔ خطای «FOREIGN KEY constraint failed» در پروداکشن: کد قدیم DELETE+INSERT
    // هر جدول را جداگانه می‌کرد؛ فرزندان قدیمی به والدِ حذف‌شدهٔ چانک بعدی برمی‌خوردند.
    const t = createTestApp();
    t.sql.exec(`
      CREATE TABLE zz_many_parent (id TEXT PRIMARY KEY, label TEXT NOT NULL);
      CREATE TABLE zz_many_child (id TEXT PRIMARY KEY, parent_id TEXT NOT NULL REFERENCES zz_many_parent(id));
    `);
    const inserts: string[] = [];
    for (let i = 1; i <= 35; i++) {
      inserts.push(`INSERT INTO zz_many_parent (id, label) VALUES ('p${String(i).padStart(2, '0')}', 'والد ${i}');`);
    }
    // فرزند به ردیف ۳۳ ارجاع دارد — بیرون از چانک اولِ ۳۰تایی
    inserts.push(`INSERT INTO zz_many_child (id, parent_id) VALUES ('c1', 'p33');`);
    t.sql.exec(inserts.join('\n'));

    const manager = await asRole(t, 'manager');
    const backup = (await manager.get('/api/backup/export')).body;
    const res = await manager.post('/api/backup/restore', { backup, confirm: true });
    expect(res.status).toBe(200);
    expect((t.sql.prepare('SELECT COUNT(*) AS c FROM zz_many_parent').get() as { c: number }).c).toBe(35);
    expect((t.sql.prepare('SELECT COUNT(*) AS c FROM zz_many_child').get() as { c: number }).c).toBe(1);
  });

  it('تاریخچهٔ مهاجرت‌های D1 (d1_migrations) در بازیابی دست نمی‌خورد', async () => {
    const t = createTestApp();
    t.sql.exec(`
      CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL);
      INSERT INTO d1_migrations (name) VALUES ('0001_initial.sql');
      INSERT INTO d1_migrations (name) VALUES ('0002_notifications.sql');
    `);
    const manager = await asRole(t, 'manager');
    const backup = (await manager.get('/api/backup/export')).body;
    // بعد از پشتیبان، یک مهاجرت جدید «اعمال» می‌شود
    t.sql.exec(`INSERT INTO d1_migrations (name) VALUES ('0003_new_migration.sql');`);
    const res = await manager.post('/api/backup/restore', { backup, confirm: true });
    expect(res.status).toBe(200);
    const rows = t.sql.prepare('SELECT name FROM d1_migrations ORDER BY id').all() as { name: string }[];
    // مهاجرت‌های قدیمی حفظ می‌شوند (پشتیبان) و مهاجرتِ بعد از پشتیبان هم پاک نمی‌شود (skip)
    expect(rows.map((r) => r.name)).toContain('0002_notifications.sql');
    expect(rows.map((r) => r.name)).toContain('0003_new_migration.sql');
  });

  it('آیدی بله با ارقام فارسی پذیرفته و لاتین ذخیره می‌شود', async () => {
    const t = createTestApp();
    const manager = await asRole(t, 'manager');
    const res = await manager.put('/api/backup/delivery', {
      destinations: [{ id: '', label: 'مدیر مرکز', chat_id: '۱۲۳۴۵۶۷۸۹', active: true }],
      auto_send: { enabled: false, destination_ids: [], include_files: false }
    });
    expect(res.status).toBe(200);
    const data = (res.body as { data: { destinations: { chat_id: string }[] } }).data;
    expect(data.destinations[0].chat_id).toBe('123456789');
  });

  it('فایل ناقص (ستون الزامی غایب) را قبل از هر نوشتنی رد می‌کند', async () => {
    const t = createTestApp();
    const manager = await asRole(t, 'manager');
    const backup = (await manager.get('/api/backup/export')) as unknown as { body: { tables: Record<string, { rows: Record<string, unknown>[] }> } };
    // national_id در students «NOT NULL بدون پیش‌فرض» است — حذفش یعنی فایل ناقص
    const students = backup.body.tables.students;
    expect(students.rows.length).toBeGreaterThan(0);
    delete students.rows[0].national_id;

    const inspect = await manager.post('/api/backup/inspect', backup.body);
    expect(inspect.status).toBe(200);
    const summary = (inspect.body as { data: { schemaCompatible: boolean; problems: string[] } }).data;
    expect(summary.schemaCompatible).toBe(false);
    expect(summary.problems.join(' ')).toContain('national_id');

    const res = await manager.post('/api/backup/restore', { backup: backup.body, confirm: true });
    expect(res.status).toBe(400);
    // دیتابیس دست‌نخورده مانده باشد
    const after = await manager.get('/api/students');
    expect((after.body as { data: unknown[] }).data.length).toBeGreaterThan(0);
  });
});

// ─── m180 — ارسال پشتیبان به آیدی بله (مقصد انتخابی) ───

describe('ارسال پشتیبان به بله — مقصدها', () => {
  it('فهرست مقصدهای خالی را با bot_ready=false برمی‌گرداند', async () => {
    const t = createTestApp();
    const manager = await asRole(t, 'manager');
    const res = await manager.get('/api/backup/delivery');
    expect(res.status).toBe(200);
    const data = (res.body as { data: { bot_ready: boolean; destinations: unknown[]; auto_send: { enabled: boolean; destination_ids: string[] } } }).data;
    expect(data.bot_ready).toBe(false);
    expect(data.destinations).toHaveLength(0);
    expect(data.auto_send.enabled).toBe(false);
  });

  it('مقصدها را ذخیره می‌کند و دوباره می‌خواند (انتخابی)', async () => {
    const t = createTestApp();
    const manager = await asRole(t, 'manager');
    const save = await manager.put('/api/backup/delivery', {
      destinations: [
        { id: 'd1', label: 'مدیر مرکز', chat_id: '123456789', active: true },
        { label: 'دفتر', chat_id: '987654321', active: false }
      ],
      auto_send: { enabled: true, destination_ids: ['d1'], include_files: false }
    });
    expect(save.status).toBe(200);
    const saved = (save.body as { data: { destinations: { id: string; label: string; chat_id: string; active: boolean }[]; auto_send: { enabled: boolean } } }).data;
    expect(saved.destinations).toHaveLength(2);
    expect(saved.destinations[0].id).toBe('d1');
    expect(saved.destinations[1].id).toBeTruthy(); // id خودکار ساخته شد
    expect(saved.destinations[1].active).toBe(false);
    expect(saved.auto_send.enabled).toBe(true);

    const read = await manager.get('/api/backup/delivery');
    const again = (read.body as { data: { destinations: unknown[]; auto_send: { destination_ids: string[] } } }).data;
    expect(again.destinations).toHaveLength(2);
    expect(again.auto_send.destination_ids).toEqual(['d1']);

    const audits = t.sql.prepare("SELECT COUNT(*) AS c FROM audit_log WHERE action = 'backup.delivery_update'").get() as { c: number };
    expect(audits.c).toBe(1);
  });

  it('آیدی غیرعددی، آیدی تکراری و بدون نام را رد می‌کند', async () => {
    const t = createTestApp();
    const manager = await asRole(t, 'manager');
    expect(
      (await manager.put('/api/backup/delivery', { destinations: [{ label: 'بدون آیدی', chat_id: 'abc@x', active: true }] })).status
    ).toBe(400);
    expect(
      (await manager.put('/api/backup/delivery', { destinations: [{ label: 'الف', chat_id: '12', active: true }] })).status
    ).toBe(400);
    expect((await manager.put('/api/backup/delivery', { destinations: [{ chat_id: '123456789' }] })).status).toBe(400);
    expect(
      (await manager.put('/api/backup/delivery', {
        destinations: [
          { id: 'a', label: 'الف', chat_id: '123456789' },
          { id: 'b', label: 'ب', chat_id: '123456789' }
        ]
      })).status
    ).toBe(400);
    expect(
      (await manager.put('/api/backup/delivery', { destinations: Array.from({ length: 11 }, (_, i) => ({ id: `x${i}`, label: `م${i}`, chat_id: `12345678${i}` })) })).status
    ).toBe(400);
  });

  it('درمانگر و منشی به تنظیمات ارسال دسترسی ندارند', async () => {
    const t = createTestApp();
    const therapist = await asRole(t, 'therapist');
    expect((await therapist.get('/api/backup/delivery')).status).toBe(403);
    expect((await therapist.put('/api/backup/delivery', { destinations: [] })).status).toBe(403);
    const secretary = await asRole(t, 'secretary');
    expect((await secretary.post('/api/backup/send', { destinations: ['x'] })).status).toBe(403);
  });
});

describe('ارسال پشتیبان به بله — مکانیک ارسال', () => {
  function fakeSender(calls: { chatId: string; filename: string; bytes: Uint8Array; caption?: string }[]) {
    return async (opts: { chatId: string; filename: string; bytes: Uint8Array; caption?: string }) => {
      calls.push(opts);
      return { ok: true, externalId: `msg-${calls.length}` };
    };
  }

  it('فایل پشتیبان را فقط به مقصدهای انتخاب‌شده می‌فرستد و گزارش می‌دهد', async () => {
    const calls: { chatId: string; filename: string; bytes: Uint8Array; caption?: string }[] = [];
    const t = createTestApp(undefined, { backupDocumentSender: fakeSender(calls) });
    const manager = await asRole(t, 'manager');

    await manager.put('/api/backup/delivery', {
      destinations: [
        { id: 'd1', label: 'مدیر', chat_id: '111111111', active: true },
        { id: 'd2', label: 'دفتر', chat_id: '222222222', active: true }
      ]
    });

    const res = await manager.post('/api/backup/send', { destinations: ['d2'] });
    expect(res.status).toBe(200);
    const report = (res.body as { data: { ok: boolean; sent: number; failed: number; results: { chat_id: string; ok: boolean; message_id?: string }[]; size_bytes: number; filename: string } }).data;
    expect(report.ok).toBe(true);
    expect(report.sent).toBe(1);
    expect(report.failed).toBe(0);
    expect(report.results[0].chat_id).toBe('222222222');
    expect(report.results[0].message_id).toBe('msg-1');
    expect(report.size_bytes).toBeGreaterThan(0);
    expect(report.filename).toMatch(/^backup-\d{8}-\d{4}\.json$/);

    expect(calls).toHaveLength(1);
    expect(calls[0].chatId).toBe('222222222');
    // فایل ارسالی همان قالب gh-backup است
    const env = JSON.parse(new TextDecoder().decode(calls[0].bytes)) as { format: string };
    expect(env.format).toBe(BACKUP_FORMAT);
    expect(calls[0].caption).toContain('پشتیبان سامانه');

    const audits = t.sql.prepare("SELECT COUNT(*) AS c FROM audit_log WHERE action = 'backup.send'").get() as { c: number };
    expect(audits.c).toBe(1);
  });

  it('بدون انتخاب مقصد یا با مقصد ناشناخته رد می‌کند', async () => {
    const calls: { chatId: string; filename: string; bytes: Uint8Array; caption?: string }[] = [];
    const t = createTestApp(undefined, { backupDocumentSender: fakeSender(calls) });
    const manager = await asRole(t, 'manager');
    expect((await manager.post('/api/backup/send', { destinations: [] })).status).toBe(400);
    expect((await manager.post('/api/backup/send', {})).status).toBe(400);
    expect((await manager.post('/api/backup/send', { destinations: ['nope'] })).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('بدون توکن ربات، خطای روشن فارسی می‌دهد', async () => {
    const t = createTestApp(); // بدون sender و بدون baleToken
    const manager = await asRole(t, 'manager');
    await manager.put('/api/backup/delivery', { destinations: [{ id: 'd1', label: 'مدیر', chat_id: '111111111' }] });
    const res = await manager.post('/api/backup/send', { destinations: ['d1'] });
    expect(res.status).toBe(400);
    expect((res.body as { message?: string }).message).toContain('توکن ربات بله');
  });

  it('خطای شبکهٔ بله برای یک مقصد، بقیه را متوقف نمی‌کند', async () => {
    const t = createTestApp(undefined, {
      backupDocumentSender: async (opts) => (opts.chatId === '111111111' ? { ok: false, error: 'BALE_500: boom' } : { ok: true, externalId: 'm9' })
    });
    const manager = await asRole(t, 'manager');
    await manager.put('/api/backup/delivery', {
      destinations: [
        { id: 'd1', label: 'خراب', chat_id: '111111111', active: true },
        { id: 'd2', label: 'سالم', chat_id: '222222222', active: true }
      ]
    });
    const res = await manager.post('/api/backup/send', { destinations: ['d1', 'd2'] });
    expect(res.status).toBe(200);
    const report = (res.body as { data: { ok: boolean; sent: number; failed: number; results: { chat_id: string; ok: boolean; error?: string }[] } }).data;
    expect(report.sent).toBe(1);
    expect(report.failed).toBe(1);
    expect(report.results[0].ok).toBe(false);
    expect(report.results[0].error).toContain('BALE_500');
    expect(report.results[1].ok).toBe(true);
  });
});

describe('پشتیبان خودکار شبانه (m180)', () => {
  function fakeSender(calls: { chatId: string }[]) {
    return async (opts: { chatId: string }) => {
      calls.push({ chatId: opts.chatId });
      return { ok: true, externalId: 'auto-1' };
    };
  }

  it('خاموش = هیچ‌چیز نمی‌فرستد', async () => {
    const calls: { chatId: string }[] = [];
    const t = createTestApp(undefined, { backupDocumentSender: fakeSender(calls) });
    const services = createServices({
      db: t.db,
      audit: createAuditWriter(t.db),
      logger: silentLogger('test'),
      teamDomain: 'test'
    });
    const out = await services.backup.runScheduledAutoSend();
    expect(out.skipped).toBe(true);
    expect(out.reason).toBe('disabled');
    expect(calls).toHaveLength(0);
  });

  it('روشن = به مقصدهای انتخاب‌شده فعال می‌فرستد و در دفتر ثبت می‌کند', async () => {
    const calls: { chatId: string }[] = [];
    const t = createTestApp(undefined, { backupDocumentSender: fakeSender(calls) });
    const manager = await asRole(t, 'manager');
    const put = await manager.put('/api/backup/delivery', {
      destinations: [
        { id: 'd1', label: 'مدیر', chat_id: '111111111', active: true },
        { id: 'd2', label: 'خاموش', chat_id: '222222222', active: false }
      ],
      auto_send: { enabled: true, destination_ids: ['d1', 'd2'], include_files: false }
    });
    expect(put.status).toBe(200);

    const services = createServices({
      db: t.db,
      audit: createAuditWriter(t.db),
      logger: silentLogger('test'),
      teamDomain: 'test',
      backupDocumentSender: fakeSender(calls)
    });
    const out = await services.backup.runScheduledAutoSend();
    expect(out.skipped).toBe(false);
    expect(out.report?.sent).toBe(1); // مقصد غیرفعال حذف شد
    expect(out.report?.results[0].chat_id).toBe('111111111');
    expect(calls).toHaveLength(1);

    const audits = t.sql.prepare("SELECT COUNT(*) AS c FROM audit_log WHERE action = 'backup.auto_send'").get() as { c: number };
    expect(audits.c).toBe(1);
  });

  it('روشن بدون مقصد فعال = skip', async () => {
    const calls: { chatId: string }[] = [];
    const t = createTestApp(undefined, { backupDocumentSender: fakeSender(calls) });
    const manager = await asRole(t, 'manager');
    await manager.put('/api/backup/delivery', {
      destinations: [{ id: 'd1', label: 'مدیر', chat_id: '111111111', active: false }],
      auto_send: { enabled: true, destination_ids: ['d1'] }
    });
    const services = createServices({
      db: t.db,
      audit: createAuditWriter(t.db),
      logger: silentLogger('test'),
      teamDomain: 'test'
    });
    const out = await services.backup.runScheduledAutoSend();
    expect(out.skipped).toBe(true);
    expect(out.reason).toBe('no_destination');
    expect(calls).toHaveLength(0);
  });
});

// ─── m182 — جدول داخلی _cf_KV (D1) نباید پشتیبان‌گیری را ۵۰۰ کند ───
// روی پروداکشن، D1 جدول داخلی _cf_KV را در sqlite_master دارد و هر کوئری روی آن
// از داخل Worker با «not authorized: SQLITE_AUTH» رد می‌شود. همین امر status/export/
// inspect را ۵۰۰ می‌کرد (پنل پشتیبان روی پروداکشن باز نمی‌شد).
describe('پشتیبان‌گیری در حضور جدول داخلی _cf_KV (m182)', () => {
  function plantCfKv(t: ReturnType<typeof createTestApp>): void {
    t.sql.exec('CREATE TABLE _cf_KV (key TEXT PRIMARY KEY, value BLOB)');
    t.sql.exec("INSERT INTO _cf_KV (key, value) VALUES ('probe', x'00')");
  }

  it('وضعیت با _cf_KV هم ۲۰۰ برمی‌گرداند و جدول سیستمی را نشان نمی‌دهد', async () => {
    const t = createTestApp();
    plantCfKv(t);
    const api = await asRole(t, 'manager');
    const res = await api.get('/api/backup/status');
    expect(res.status).toBe(200);
    const data = (res.body as { data: { tables: { name: string }[] } }).data;
    expect(data.tables.find((x) => x.name === '_cf_KV')).toBeUndefined();
    expect(data.tables.find((x) => x.name === 'staff')).toBeDefined();
  });

  it('خروجی پشتیبان هرگز _cf_KV را شامل نمی‌شود', async () => {
    const t = createTestApp();
    plantCfKv(t);
    const api = await asRole(t, 'manager');
    const res = await api.get('/api/backup/export');
    expect(res.status).toBe(200);
    const env = res.body as unknown as { tables: Record<string, unknown> };
    expect(env.tables._cf_KV).toBeUndefined();
  });

  it('inspect فایل بدون _cf_KV را در پایگاه‌دادهٔ دارای _cf_KV سازگار می‌داند', async () => {
    const t = createTestApp();
    plantCfKv(t);
    const api = await asRole(t, 'manager');
    const backup = (await api.get('/api/backup/export')).body;
    const res = await api.post('/api/backup/inspect', backup);
    expect(res.status).toBe(200);
    const data = (res.body as { data: { schemaCompatible: boolean; problems: string[] } }).data;
    expect(data.schemaCompatible).toBe(true);
    expect(data.problems).toHaveLength(0);
  });

  it('چرخهٔ رفت‌وبرگشت کامل با _cf_KV حاضر سالم است', async () => {
    const t = createTestApp();
    plantCfKv(t);
    const manager = await asRole(t, 'manager');
    const backup = (await manager.get('/api/backup/export')).body;
    t.sql.exec("DELETE FROM students");
    const res = await manager.post('/api/backup/restore', { backup, confirm: true });
    expect(res.status).toBe(200);
    const after = await manager.get('/api/students');
    expect((after.body as { data: unknown[] }).data.length).toBeGreaterThan(0);
    // جدول سیستمی دست نخورده باقی مانده باشد
    const kv = t.sql.prepare("SELECT COUNT(*) AS c FROM _cf_KV").get() as { c: number };
    expect(kv.c).toBe(1);
  });
});

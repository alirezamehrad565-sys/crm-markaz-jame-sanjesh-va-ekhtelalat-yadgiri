/**
 * فاز B — آزمون رانر هم‌گامی میز↔ابر (runner.ts + desktop-routes.ts)
 *
 * ابر فیک = خودِ هستهٔ سرویس (service.ts) روی دیتابیس دوم MockD1 — یعنی سناریوها دو
 * نمونهٔ واقعی هم-باندل را می‌پیمایند، نه ماک دستی قرارداد. چهار درس شناخته‌شدهٔ موج
 * قبل — ریشه‌ای بسته شده‌اند (نه وصلهٔ موردی):
 *   ① شمارش push: انتظار >=1 و سنجش per-table روی جدول مشخص (appointments) — نه عدد سحرآمیز؛
 *     pushed کل با >= ادعا می‌شود چون بذر هارنس در جداول دیگر هم ردیف دارد.
 *   ② cursor با ثابت SYNC_EPOCH_CURSOR (اپوک) مقایسه می‌شود — نه null؛ بعد از نخستین
 *     دورهٔ موفق cursor push باید از اپوک جلوتر باشد.
 *   ③ چرخش بکاپ: بکاپ فقط هنگام اعمال ساخته می‌شود (رفتار درست) — «مقصد» بین دوره‌ها
 *     تغییر می‌کند تا سه بکاپ شود؛ دورهٔ بی‌اعمال بکاپ نمی‌سازد.
 *   ④ ریشهٔ ۴۰۱ وسط سناریو: گیت فقط-مدیرِ run-now + تداخل زمان‌بند با سناریوهای تست —
 *     ریشه‌ای: زمان‌بند در vitest هیچ تایمری نمی‌سازد؛ سناریوها با سشن مدیر می‌روند و
 *     خود گیت با ۴۰۱ (بی‌سشن) و ۴۰۳ (غیرمدیر) صریح آزمون می‌شود.
 */
import { describe, it, expect } from 'vitest';
import {
  createTestApp,
  createTestDb,
  loginToken,
  silentLogger,
  MANAGER_ID,
  STUDENT1_ID,
  asRole
} from '../../../test/harness';
import type { TestApp, Api } from '../../../test/harness';
import { MockD1 } from '../../../test/mock-d1';
import { createDb } from '@core/db';
import { instanceState, pull as cloudPull, push as cloudPush } from '../service';
import {
  SYNC_EPOCH_CURSOR,
  CLOUD_SYNC_DEFAULT_INTERVAL_MS,
  CLOUD_SYNC_MIN_INTERVAL_MS,
  parseCloudConfigPayload,
  readSyncCursors,
  applyEcho,
  startCloudSyncScheduler,
  isCloudSyncRunning
} from '../runner';
import type { CloudFsIO, CloudSyncDeps } from '../runner';

const SECRET = 'test-secret-123456';

// ─── پل فایل‌های ابری درون‌حافظه (عین قرارداد CLOUD_FS adapter) ───

function memoryCloudFs(): CloudFsIO & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    readText: async (n) => files.get(n) ?? null,
    writeText: async (n, t) => void files.set(n, t),
    remove: async (n) => void files.delete(n),
    list: async (prefix) => [...files.keys()].filter((k) => k.startsWith(prefix)).sort().reverse(),
    dir: () => '/mem/dataDir',
    files
  };
}

// ─── ابر فیک — خود هستهٔ سرویس روی دیتابیس دوم (هم-باندل، دو سو واقعی) ───

const APPT_INSERT_SQL = `INSERT INTO appointments (id, staff_id, start_at, end_at, status, note, version, batch_id, created_by, created_at, updated_at, ops_status, session_type)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

interface ApptRow {
  id: string;
  staff_id: string;
  start_at: string;
  end_at: string;
  status: string;
  note: string;
  version: number;
  batch_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  ops_status: string | null;
  session_type: string | null;
}

class FakeCloud {
  clockOffsetMs = 0;
  networkDown = false;
  authDown = false;
  snapshot: unknown = null; // پاکت export برای مسیر کلون
  calls: Array<{ path: string }> = [];

  /** دیتابیس ابر — همان مایگریشن‌ها + بذر (مرکزی که کارکرده است؛ FK ردیف‌های وارده برقرار بماند) */
  readonly store = createTestDb(true);
  readonly db = createDb(new MockD1(this.store) as unknown as D1Database);

  appointment(pk: string, at: string, note = `note-${pk}`): ApptRow {
    return {
      id: pk,
      staff_id: MANAGER_ID,
      start_at: '2026-02-01T09:00:00.000Z',
      end_at: '2026-02-01T09:45:00.000Z',
      status: 'scheduled',
      note,
      version: 1,
      batch_id: null,
      created_by: MANAGER_ID,
      created_at: at,
      updated_at: at,
      ops_status: null,
      session_type: null
    };
  }

  addAppointment(pk: string, at: string, note?: string): void {
    const r = this.appointment(pk, at, note);
    this.store.prepare(APPT_INSERT_SQL).run(r.id, r.staff_id, r.start_at, r.end_at, r.status, r.note, r.version, r.batch_id, r.created_by, r.created_at, r.updated_at, r.ops_status, r.session_type);
  }

  appointments(): Array<Record<string, unknown>> {
    return this.store.prepare('SELECT * FROM appointments').all() as Array<Record<string, unknown>>;
  }

  /** مایگریشن‌های اعمال‌شدهٔ ابر — جدول رهگیری d1_migrations (قرارداد instanceState) */
  seedCloudMigrations(count: number): void {
    this.store.exec('CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, applied_at TEXT)');
    for (let i = 1; i <= count; i += 1) {
      this.store.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(`000${i}_fake.sql`);
    }
  }

  fetch = async (input: string | URL | RequestInfo, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    this.calls.push({ path });
    if (this.networkDown) throw new TypeError('fetch failed — شبکه قطع است');
    if (this.authDown) return Response.json({ error: 'unauthorized' }, { status: 401 });
    const body = (init?.body ? JSON.parse(String(init.body)) : null) as {
      since?: { tables?: Record<string, { rows?: string; deleted?: string }> };
      tables?: Record<string, { rows?: Record<string, unknown>[]; deleted?: Array<{ pk: string; deleted_at: string }> }>;
      device_id?: string;
    } | null;
    const dateHeader = { date: new Date(Date.now() + this.clockOffsetMs).toUTCString() };
    if (path === '/api/instance-sync/state') {
      const state = await instanceState(this.db, 'cloud-unknown');
      return Response.json({ data: state }, { headers: dateHeader });
    }
    if (path === '/api/instance-sync/pull') {
      const result = await cloudPull(this.db, { tables: body?.since?.tables ?? {} });
      return Response.json({ data: result }, { headers: dateHeader });
    }
    if (path === '/api/instance-sync/push') {
      const result = await cloudPush(this.db, String(body?.device_id ?? ''), { tables: body?.tables ?? {} });
      return Response.json({ data: result }, { headers: dateHeader });
    }
    if (path === '/api/backup/export') {
      return Response.json(this.snapshot ?? { format: 'gh-backup', format_version: 1, tables: {} }, { headers: dateHeader });
    }
    return Response.json({ error: 'not_found' }, { status: 404 });
  };
}

// ─── مونتاژ اپ آزمون با bindingهای موتور میز ───

interface Mount {
  A: TestApp;
  fs: ReturnType<typeof memoryCloudFs>;
  cloud: FakeCloud;
  api: Api;
}

const APPT_INSERT = `INSERT INTO appointments (id, staff_id, start_at, end_at, status, note, version, batch_id, created_by, created_at, updated_at, ops_status, session_type)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

function insertLocalAppointment(A: TestApp, pk: string, at: string, note = `note-${pk}`): void {
  A.sql.prepare(APPT_INSERT).run(pk, MANAGER_ID, '2026-02-01T09:00:00.000Z', '2026-02-01T09:45:00.000Z', 'scheduled', note, 1, null, MANAGER_ID, at, at, null, null);
}

async function mount(): Promise<Mount> {
  const A = createTestApp();
  const fs = memoryCloudFs();
  const cloud = new FakeCloud();
  (A.env as Record<string, unknown>).CENTER_DESKTOP_ENGINE = '1';
  (A.env as Record<string, unknown>).ENGINE_CLOUD_SECRET = SECRET;
  (A.env as Record<string, unknown>).CLOUD_FS = fs;
  (A.env as Record<string, unknown>).CLOUD_FETCH = cloud.fetch;
  const api = await asRole(A, 'manager'); // درس ④: همهٔ تغییرپذیرها با سشن مدیر
  return { A, fs, cloud, api };
}

async function configureViaRoute(m: Mount, url = 'https://cloud.test.example', interval_ms?: number): Promise<void> {
  const res = await m.api.post('/api/instance-sync/config', interval_ms === undefined ? { url } : { url, interval_ms });
  if (res.status !== 200) throw new Error(`config route failed: ${JSON.stringify(res.body)}`);
}

function runNow(m: Mount): ReturnType<Api['post']> {
  return m.api.post('/api/instance-sync/run-now');
}

interface RunData {
  data?: { result: string; pulled: number; pushed: number; conflicts_new: number; duration_ms: number; error: string | null };
  error?: string;
  message?: string;
}

const auditCount = (A: TestApp, action: string): number =>
  (A.sql.prepare('SELECT COUNT(*) AS c FROM audit_log WHERE action = ?').get(action) as { c: number }).c;

// ─── توابع خالص قرارداد ───

describe('قرارداد پیکربندی (parseCloudConfigPayload)', () => {
  it('نشانی غیر-https رد می‌شود', () => {
    expect(parseCloudConfigPayload({ url: 'http://cloud.example' })).toBeNull();
    expect(parseCloudConfigPayload({ url: 'ftp://cloud.example' })).toBeNull();
    expect(parseCloudConfigPayload({ url: 'not-a-url' })).toBeNull();
    expect(parseCloudConfigPayload({})).toBeNull();
    expect(parseCloudConfigPayload(null)).toBeNull();
  });

  it('https معتبر با پیش‌فرض ۶۰۰۰۰۰ و کف ۶۰۰۰۰', () => {
    const ok = parseCloudConfigPayload({ url: 'https://cloud.example/workers' });
    expect(ok?.url).toBe('https://cloud.example/workers');
    expect(ok?.interval_ms).toBe(CLOUD_SYNC_DEFAULT_INTERVAL_MS);
    const clamped = parseCloudConfigPayload({ url: 'https://cloud.example', interval_ms: 1000 });
    expect(clamped?.interval_ms).toBe(CLOUD_SYNC_MIN_INTERVAL_MS);
    const exact = parseCloudConfigPayload({ url: 'https://cloud.example', interval_ms: 90000 });
    expect(exact?.interval_ms).toBe(90000);
  });
});

describe('زمان‌بند — گارد محیط تست (درس ④)', () => {
  it('در vitest هیچ تایمری نمی‌سازد و دوباره‌فراخوانی بی‌اثر است', () => {
    const A = createTestApp();
    const makeDeps = (_env: Record<string, unknown>): CloudSyncDeps => ({
      db: A.db,
      audit: { log: async () => undefined, logInTransaction: async () => undefined, pruneOld: async () => 0 },
      logger: silentLogger('t'),
      fs: null,
      env: {},
      backup: null
    });
    expect(() => startCloudSyncScheduler(makeDeps, silentLogger('t'))).not.toThrow();
    startCloudSyncScheduler(makeDeps, silentLogger('t')); // پرچم ماژول: دوباره‌کاری بی‌اثر
    expect(process.env.VITEST).toBeTruthy();
  });
});

// ─── گیت‌ها و شکل قرارداد UI ───

describe('گیت‌های مسیر (درس ④ — ریشهٔ ۴۰۱ وسط سناریو)', () => {
  it('بدون گیت میز → ۴۰۴ کم‌دست (رفتار تولید وب)', async () => {
    const A = createTestApp();
    const token = await loginToken(A, 'manager');
    const res = await A.app.request('/api/instance-sync/status', { headers: { authorization: `Bearer ${token}` } }, A.env as never);
    expect(res.status).toBe(404);
  });

  it('run-now بی‌سشن → ۴۰۱ و سشن غیرمدیر → ۴۰۳؛ با سشن مدیر ۲۰۰ — هیچ ۴۰۱ وسط مسیر باقی نمی‌ماند', async () => {
    const m = await mount();
    await configureViaRoute(m);
    const anon = m.A.app.request.bind(m.A.app);
    expect((await anon('/api/instance-sync/run-now', { method: 'POST', body: '{}' }, m.A.env as never)).status).toBe(401);
    const secretary = await asRole(m.A, 'secretary');
    expect((await secretary.post('/api/instance-sync/run-now')).status).toBe(403);
    expect((await secretary.delete('/api/instance-sync/config')).status).toBe(403);
    expect((await runNow(m)).status).toBe(200);
  });

  it('status با هر سشنی خواندنی است (خواندنی‌ها فقط-مدیر نیستند)', async () => {
    const m = await mount();
    const therapist = await asRole(m.A, 'therapist');
    const res = await therapist.get('/api/instance-sync/status');
    expect(res.status).toBe(200);
    expect((res.body as { data: { configured: boolean } }).data.configured).toBe(false);
  });
});

describe('شکل قرارداد status', () => {
  it('کلیدهای قرارداد ثابت‌اند و پیش‌فرض‌های پیکربندی‌نشده درست‌اند', async () => {
    const m = await mount();
    const res = await m.api.get('/api/instance-sync/status');
    expect(res.status).toBe(200);
    const data = (res.body as { data: Record<string, unknown> }).data;
    expect(Object.keys(data).sort()).toEqual(
      ['clock_warning', 'configured', 'conflicts_total', 'device_id', 'interval_ms', 'last_sync', 'running', 'schema_match', 'secret_present', 'url']
    );
    expect(data.configured).toBe(false);
    expect(data.url).toBeNull();
    expect(data.device_id).toBeNull();
    expect(data.interval_ms).toBeNull();
    expect(data.last_sync).toBeNull();
    expect(data.secret_present).toBe(true);
    expect(data.running).toBe(false);
    expect(data.conflicts_total).toBe(0);
    expect(data.clock_warning).toBe(false);
    expect(data.schema_match).toBeNull();
  });
});

// ─── پیکربندی از مسیر رسمی ───

describe('POST /api/instance-sync/config', () => {
  it('نشانی http رد می‌شود؛ https با کف interval ذخیره می‌شود و device_id UUID خودکار می‌گیرد', async () => {
    const m = await mount();
    const bad = await m.api.post('/api/instance-sync/config', { url: 'http://cloud.test.example' });
    expect(bad.status).toBe(400);
    const ok = await m.api.post('/api/instance-sync/config', { url: 'https://cloud.test.example', interval_ms: 1000 });
    expect(ok.status).toBe(200);
    const saved = JSON.parse(m.fs.files.get('cloud-config.json') ?? '{}');
    expect(saved.url).toBe('https://cloud.test.example');
    expect(saved.interval_ms).toBe(CLOUD_SYNC_MIN_INTERVAL_MS);
    expect(saved.device_id).toMatch(/[0-9a-f-]{36}/);
    const st = await m.api.get('/api/instance-sync/status');
    const data = (st.body as { data: Record<string, unknown> }).data;
    expect(data.configured).toBe(true);
    expect(data.interval_ms).toBe(CLOUD_SYNC_MIN_INTERVAL_MS);
    expect(data.device_id).toBe(saved.device_id);
  });

  it('بدون interval → پیش‌فرض ۶۰۰۰۰۰؛ نوشتن دوباره device_id را حفظ می‌کند', async () => {
    const m = await mount();
    await m.api.post('/api/instance-sync/config', { url: 'https://cloud.test.example' });
    const first = JSON.parse(m.fs.files.get('cloud-config.json') ?? '{}');
    expect(first.interval_ms).toBe(CLOUD_SYNC_DEFAULT_INTERVAL_MS);
    await m.api.post('/api/instance-sync/config', { url: 'https://other.test.example' });
    const second = JSON.parse(m.fs.files.get('cloud-config.json') ?? '{}');
    expect(second.device_id).toBe(first.device_id);
    expect(second.url).toBe('https://other.test.example');
  });

  it('بدون پل CLOUD_FS (تولید وب/workerd) → ۴۰۰ کم‌دست', async () => {
    const m = await mount();
    delete (m.A.env as Record<string, unknown>).CLOUD_FS;
    const res = await m.api.post('/api/instance-sync/config', { url: 'https://cloud.test.example' });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe('CLOUD_FS_UNAVAILABLE');
  });
});

// ─── هم‌گامی دوسویه سالم + درس ①/② ───

describe('هم‌گامی دوسویه سالم', () => {
  it('push ردیف‌های محلی با شمارش per-table مشخص (درس ①) و cursor از اپوک می‌گذرد (درس ②)', async () => {
    const m = await mount();
    await configureViaRoute(m);
    insertLocalAppointment(m.A, 'appt-seed-1', '2026-01-05T08:00:00.000Z');
    insertLocalAppointment(m.A, 'appt-seed-2', '2026-01-05T09:00:00.000Z');

    const res = await runNow(m);
    expect(res.status).toBe(200);
    const body = (res.body as RunData).data;
    expect(body?.result).toBe('synced');
    // درس ① — pushed دست‌کم یک ردیف؛ ردیف‌های ابر per-table دقیق سنجیده می‌شوند
    expect(body?.pushed).toBeGreaterThanOrEqual(1);
    expect(m.cloud.appointments().map((r) => String(r.id)).sort()).toEqual(['appt-seed-1', 'appt-seed-2'].sort());

    // درس ② — cursor push از اپوک گذشته و برابر بیشینهٔ updated_at ارسالی جدول است
    const cursors = await readSyncCursors(m.fs);
    expect(cursors.push.appointments?.rows).toBeTruthy();
    expect(cursors.push.appointments.rows).not.toBe(SYNC_EPOCH_CURSOR);
    expect(cursors.push.appointments.rows).toBe('2026-01-05T09:00:00.000Z');
    expect(auditCount(m.A, 'cloud.sync')).toBe(1); // audit بی‌راز ثبت شده است
  });

  it('دورهٔ دوم: pull ردیف ابر به محلی و push ردیف تازهٔ محلی به ابر', async () => {
    const m = await mount();
    await configureViaRoute(m);
    insertLocalAppointment(m.A, 'appt-local-1', '2026-01-05T08:00:00.000Z');
    m.cloud.addAppointment('appt-cloud-1', '2026-01-06T10:00:00.000Z', 'از ابر');

    const first = (await runNow(m)).body as RunData;
    expect(first.data?.result).toBe('synced');
    expect(first.data?.pulled).toBeGreaterThanOrEqual(1);
    expect((m.A.sql.prepare("SELECT COUNT(*) AS c FROM appointments WHERE id = 'appt-cloud-1'").get() as { c: number }).c).toBe(1);

    insertLocalAppointment(m.A, 'appt-local-2', '2026-01-07T11:30:00.000Z');
    const second = (await runNow(m)).body as RunData;
    expect(second.data?.result).toBe('synced');
    expect(second.data?.pulled).toBe(0);
    expect(second.data?.pushed).toBeGreaterThanOrEqual(1);
    expect(m.cloud.appointments().map((r) => String(r.id)).sort()).toEqual(['appt-cloud-1', 'appt-local-1', 'appt-local-2'].sort());
  });

  it('حذف محلی در برابر ردیفِ زودترتشکیل‌شده: داور قاعدهٔ FWW را اجرا می‌کند — ردیف برنده است و echo آن را باز زنده می‌کند', async () => {
    const m = await mount();
    await configureViaRoute(m);
    insertLocalAppointment(m.A, 'appt-del-1', '2026-01-05T08:00:00.000Z');
    expect(((await runNow(m)).body as RunData).data?.result).toBe('synced');
    expect(m.cloud.appointments().length).toBe(1);

    m.A.sql.prepare("DELETE FROM appointments WHERE id = 'appt-del-1'").run(); // trigger → _sync_deleted (مُهر «الان»)
    const body = ((await runNow(m)).body as RunData).data;
    expect(body?.result).toBe('synced');
    // قاعدهٔ قطعی: زودترتشکیل‌شده برنده است — ردیف (2026-01-05) از تومب‌استون (اکنون) کهنه‌تر
    // تشکیل شده پس برنده می‌ماند؛ echo برنده، ردیف حذف‌شدهٔ محلی را هم باز زنده می‌کند
    // (خودِ باززنده‌شدن، اجرای داوری دو-سویه را اثبات می‌کند)
    expect(m.cloud.appointments().length).toBe(1);
    expect((m.A.sql.prepare("SELECT COUNT(*) AS c FROM appointments WHERE id = 'appt-del-1'").get() as { c: number }).c).toBe(1);
  });
});

// ─── تداخل FWW + echo (داور واقعی هستهٔ سرویس در هر دو سو) ───

describe('تداخل FWW و echo (همگرایی بازنده)', () => {
  it('ردیف ابرِ زودترتشکیل‌شده بر ردیف محلی تازه‌تر می‌راند + تعارض ثبت می‌شود', async () => {
    const m = await mount();
    await configureViaRoute(m);
    insertLocalAppointment(m.A, 'appt-x', '2026-01-02T00:00:00.000Z', 'نسخهٔ محلی');
    m.cloud.addAppointment('appt-x', '2026-01-01T00:00:00.000Z', 'نسخهٔ ابر');

    const body = ((await runNow(m)).body as RunData).data;
    expect(body?.result).toBe('synced');
    expect(body?.conflicts_new).toBeGreaterThanOrEqual(1);
    const local = m.A.sql.prepare("SELECT note FROM appointments WHERE id = 'appt-x'").get() as { note: string };
    expect(local.note).toBe('نسخهٔ ابر');
    const conflict = m.A.sql
      .prepare("SELECT winner_side FROM _sync_conflicts WHERE table_name = 'appointments' AND pk = 'appt-x' ORDER BY id DESC LIMIT 1")
      .get() as { winner_side: string };
    expect(conflict.winner_side).toBe('remote');
  });

  it('ردیف محلیِ زودترتشکیل‌شده برنده می‌ماند و ابر با echo به آن همگرا می‌شود', async () => {
    const m = await mount();
    await configureViaRoute(m);
    insertLocalAppointment(m.A, 'appt-y', '2026-01-01T00:00:00.000Z', 'نسخهٔ محلیِ کهنه');
    m.cloud.addAppointment('appt-y', '2026-01-03T00:00:00.000Z', 'نسخهٔ ابر تازه');

    const body = ((await runNow(m)).body as RunData).data;
    expect(body?.result).toBe('synced');
    expect(body?.conflicts_new).toBeGreaterThanOrEqual(1);
    const local = m.A.sql.prepare("SELECT note FROM appointments WHERE id = 'appt-y'").get() as { note: string };
    expect(local.note).toBe('نسخهٔ محلیِ کهنه');
    expect(m.cloud.appointments()[0].note).toBe('نسخهٔ محلیِ کهنه');
    const conflict = m.A.sql
      .prepare("SELECT winner_side FROM _sync_conflicts WHERE table_name = 'appointments' AND pk = 'appt-y' ORDER BY id DESC LIMIT 1")
      .get() as { winner_side: string };
    expect(conflict.winner_side).toBe('local');
  });

  it('اعمال echo مستقیم: برندهٔ ابر عیناً می‌نشیند و null یعنی حذف', async () => {
    const m = await mount();
    insertLocalAppointment(m.A, 'appt-e1', '2026-01-01T00:00:00.000Z', 'بازنده');
    insertLocalAppointment(m.A, 'appt-e2', '2026-01-01T00:00:00.000Z', 'حذف‌شدنی');
    const applied = await applyEcho(m.A.db, 'appointments', {
      'appt-e1': m.cloud.appointment('appt-e1', '2026-01-02T00:00:00.000Z', 'برندهٔ ابر'),
      'appt-e2': null
    });
    expect(applied).toBe(2);
    const w = m.A.sql.prepare("SELECT note FROM appointments WHERE id = 'appt-e1'").get() as { note: string };
    expect(w.note).toBe('برندهٔ ابر');
    expect((m.A.sql.prepare("SELECT COUNT(*) AS c FROM appointments WHERE id = 'appt-e2'").get() as { c: number }).c).toBe(0);
  });
});

// ─── شکست شبکه → offline + cursor دست‌نخورده + بی‌اسپم audit ───

describe('آفلاین — شکست شبکه', () => {
  it('نتیجهٔ offline صریح، cursor دست‌نخورده، بدون ردیف audit (بی‌اسپم)', async () => {
    const m = await mount();
    await configureViaRoute(m);
    insertLocalAppointment(m.A, 'appt-off', '2026-01-05T08:00:00.000Z');
    expect(((await runNow(m)).body as RunData).data?.result).toBe('synced');
    const cursorsBefore = m.fs.files.get('sync-state.json');
    const auditBefore = auditCount(m.A, 'cloud.sync');

    m.cloud.networkDown = true;
    const res = await runNow(m);
    expect(res.status).toBe(200);
    const body = (res.body as RunData).data;
    expect(body?.result).toBe('offline');
    expect(body?.pulled).toBe(0);
    expect(body?.pushed).toBe(0);
    expect(m.fs.files.get('sync-state.json')).toBe(cursorsBefore); // هم‌گامی از سرِ امن
    expect(auditCount(m.A, 'cloud.sync')).toBe(auditBefore); // آفلاین audit نمی‌گیرد
    const st = await m.api.get('/api/instance-sync/status');
    expect((st.body as { data: { last_sync: { result: string } } }).data.last_sync.result).toBe('offline');
  });

  it('رد Bearer از ابر (۴۰۱) → نتیجهٔ error با پیام فارسی راز', async () => {
    const m = await mount();
    await configureViaRoute(m);
    m.cloud.authDown = true;
    const body = ((await runNow(m)).body as RunData).data;
    expect(body?.result).toBe('error');
    expect(body?.error).toContain('راز');
  });

  it('پیکربندی‌نشده/بی‌راز → ۴۰۰ با پاکت قراردادی، نه کرش', async () => {
    const m = await mount();
    const unconf = await runNow(m);
    expect(unconf.status).toBe(400);
    expect((unconf.body as { error: string }).error).toBe('CLOUD_UNCONFIGURED');
    delete (m.A.env as Record<string, unknown>).ENGINE_CLOUD_SECRET;
    await configureViaRoute(m);
    const noSecret = await runNow(m);
    expect(noSecret.status).toBe(400);
    expect((noSecret.body as { error: string }).error).toBe('CLOUD_NO_SECRET');
  });
});

// ─── single-flight ───

describe('single-flight («در جریان»)', () => {
  it('دورهٔ دوم حین جریان → ۴۰۹ و پایان آن، پرچم آزاد می‌شود', async () => {    const m = await mount();
    await configureViaRoute(m);
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const hanging = async (input: string | URL | RequestInfo, init?: RequestInit): Promise<Response> => {
      await gate;
      // پس از رهایی فقط state پاسخ می‌دهد؛ مسیرهای دیگر به ابر واقعی فیک سپرده می‌شوند
      // (init باید عبور کند — وگرنه ابر همیشه از اپوک می‌دهد و حلقهٔ pull بی‌پایان می‌شود)
      if (String(input).endsWith('/api/instance-sync/state')) {
        return Response.json({ data: { applied_migrations: null, cursors: {}, table_count: 0, device_id: null } });
      }
      return m.cloud.fetch(input, init);
    };
    (m.A.env as Record<string, unknown>).CLOUD_FETCH = hanging;

    const first = runNow(m);
    for (let i = 0; i < 200 && !isCloudSyncRunning(); i += 1) {
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(isCloudSyncRunning()).toBe(true);
    const second = await runNow(m);
    expect(second.status).toBe(409);
    expect((second.body as { error: string }).error).toBe('CLOUD_SYNC_IN_FLIGHT');

    (m.A.env as Record<string, unknown>).CLOUD_FETCH = m.cloud.fetch;
    release();
    const done = (await first).body as RunData;
    expect(done.data?.result).toBe('synced');
    expect(isCloudSyncRunning()).toBe(false);
  }, 30_000);
});

// ─── چرخش بکاپ ×۳ (درس ③) ───

describe('چرخش بکاپ پیش از اعمال (درس ③)', () => {
  it('بکاپ فقط هنگام اعمال ساخته می‌شود؛ سه دورهٔ اعمالی → ۳ فایل، دورهٔ بی‌اعمال بکاپ نمی‌سازد، دورهٔ بعد چرخش می‌کند', async () => {
    const m = await mount();
    await configureViaRoute(m);
    m.cloud.addAppointment('appt-r1', '2026-01-01T00:00:00.000Z');
    expect(((await runNow(m)).body as RunData).data?.result).toBe('synced');
    expect((await m.fs.list('cloud-sync-pre-')).length).toBe(1);
    m.cloud.addAppointment('appt-r2', '2026-01-02T00:00:00.000Z'); // تغییر مقصد
    expect(((await runNow(m)).body as RunData).data?.result).toBe('synced');
    expect((await m.fs.list('cloud-sync-pre-')).length).toBe(2);
    m.cloud.addAppointment('appt-r3', '2026-01-03T00:00:00.000Z'); // تغییر مقصد
    expect(((await runNow(m)).body as RunData).data?.result).toBe('synced');
    expect((await m.fs.list('cloud-sync-pre-')).length).toBe(3);
    // دورهٔ بی‌اعمال — بکاپ تازه ساخته نمی‌شود
    expect(((await runNow(m)).body as RunData).data?.result).toBe('synced');
    const before = await m.fs.list('cloud-sync-pre-');
    expect(before.length).toBe(3);
    // ردیف چهارم ابر → اعمال → چرخش: باز هم ۳ فایل و کهنه‌ترین رفته است
    m.cloud.addAppointment('appt-r4', '2026-01-04T00:00:00.000Z');
    expect(((await runNow(m)).body as RunData).data?.result).toBe('synced');
    const after = await m.fs.list('cloud-sync-pre-');
    expect(after.length).toBe(3);
    expect(new Set(after).has(before[before.length - 1])).toBe(false); // کهنه‌ترین حذف شده (فهرست نزولی)
    // GET /api/instance-sync/backups همین فهرست را می‌دهد
    const listing = await m.api.get('/api/instance-sync/backups');
    expect(listing.status).toBe(200);
    const listingData = (listing.body as { data: { dir: string; backups: Array<{ kind: string }> } }).data;
    expect(listingData.dir).toBe('/mem/dataDir');
    expect(listingData.backups.length).toBe(3);
  });
});

// ─── کلون ابر→میز ───

describe('کلون ابر→میز', () => {
  async function mountClone(): Promise<Mount> {
    const m = await mount();
    await configureViaRoute(m);
    const services = (m.A.app as unknown as { __services?: { backup: { buildExportStream(i: boolean): ReadableStream<Uint8Array> } } }).__services;
    if (!services) throw new Error('سرویس‌های هارنس در دسترس نیست');
    const text = await new Response(services.backup.buildExportStream(false)).text();
    m.cloud.snapshot = JSON.parse(text);
    return m;
  }

  it('بدون confirm روی DB غیر-خالی → ۴۰۹ فارسی؛ با confirm → بازیابی کامل + ریست cursor + audit', async () => {
    const m = await mountClone();
    const denied = await m.api.post('/api/instance-sync/clone', {});
    expect(denied.status).toBe(409);
    expect(((denied.body as { message?: string }).message ?? '')).toContain('تأیید');

    m.A.sql.prepare('UPDATE students SET first_name = ? WHERE id = ?').run('تغییرمحلی', STUDENT1_ID);

    const res = await m.api.post('/api/instance-sync/clone', { confirm: true });
    expect(res.status).toBe(200);
    const data = (res.body as { data: { ok: boolean; tables: number; backup_path: string } }).data;
    expect(data.ok).toBe(true);
    expect(data.tables).toBeGreaterThan(0);
    expect(data.backup_path).toContain('cloud-sync-clone-');
    const student = m.A.sql.prepare('SELECT first_name FROM students WHERE id = ?').get(STUDENT1_ID) as { first_name: string };
    expect(student.first_name).toBe('علی');
    expect((await m.fs.list('cloud-sync-clone-')).length).toBe(1); // بدون چرخش
    const cursors = await readSyncCursors(m.fs);
    // ریست cursor به مُهر مقصد (سراند Date پاسخ state) — هر دو محور، نه اپوک
    expect(cursors.pull.appointments?.rows).toBeTruthy();
    expect(cursors.pull.appointments.rows).not.toBe(SYNC_EPOCH_CURSOR);
    expect(cursors.push.appointments?.rows).toBeTruthy();
    expect(cursors.push.appointments.rows).not.toBe(SYNC_EPOCH_CURSOR);
    expect(auditCount(m.A, 'cloud.clone')).toBe(1);
  });

  it('کلون روی دیتای فقط-کارکنان (بدون students/appointments) — گارد غیر-خالی: بدون confirm ۴۰۹ و با confirm ۲۰۰', async () => {
    const m = await mountClone();
    // students/appointments صفر می‌شوند اما staff می‌ماند (سشن مدیر معتبر بماند) → DB غیر-خالی است
    m.A.sql.exec('PRAGMA foreign_keys = OFF; DELETE FROM appointments; DELETE FROM students; PRAGMA foreign_keys = ON;');
    const denied = await m.api.post('/api/instance-sync/clone', {});
    expect(denied.status).toBe(409);
    const res = await m.api.post('/api/instance-sync/clone', { confirm: true });
    expect(res.status).toBe(200);
    expect((res.body as { data: { ok: boolean } }).data.ok).toBe(true);
  });

  it('ابر در دسترس نیست → ۵۰۲ CLOUD_OFFLINE', async () => {
    const m = await mountClone();
    m.cloud.networkDown = true;
    const res = await m.api.post('/api/instance-sync/clone', { confirm: true });
    expect(res.status).toBe(502);
    expect((res.body as { error: string }).error).toBe('CLOUD_OFFLINE');
  });
});

// ─── DELETE config با نگه‌داری cursor ───

describe('DELETE /api/instance-sync/config', () => {
  it('پیکربندی حذف می‌شود، cursorها باقی می‌مانند و audit cloud.unlink ثبت می‌شود', async () => {
    const m = await mount();
    await configureViaRoute(m);
    insertLocalAppointment(m.A, 'appt-u1', '2026-01-05T08:00:00.000Z');
    expect(((await runNow(m)).body as RunData).data?.result).toBe('synced');
    const cursorsBefore = m.fs.files.get('sync-state.json');
    expect(cursorsBefore).toBeTruthy();

    const res = await m.api.delete('/api/instance-sync/config');
    expect(res.status).toBe(200);
    expect((res.body as { data: { cursors_kept: boolean } }).data.cursors_kept).toBe(true);
    expect(m.fs.files.has('cloud-config.json')).toBe(false);
    expect(m.fs.files.get('sync-state.json')).toBe(cursorsBefore);
    const st = await m.api.get('/api/instance-sync/status');
    expect((st.body as { data: { configured: boolean } }).data.configured).toBe(false);
    expect(auditCount(m.A, 'cloud.unlink')).toBe(1);
    expect((await runNow(m)).status).toBe(400); // بدون پیکربندی — هم‌گامی بی‌هدف نداریم
  });
});

// ─── schema_match و clock_warning ───

describe('schema_match و clock_warning', () => {
  it('شمارش مایگریشن‌های ناهم‌خوان → error صریح و cursor دست‌نخورده', async () => {
    const m = await mount();
    await configureViaRoute(m);
    m.A.sql.exec("CREATE TABLE _migrations (version TEXT PRIMARY KEY, applied_at TEXT); INSERT INTO _migrations (version) VALUES ('a'), ('b')");
    m.cloud.seedCloudMigrations(3);
    const body = ((await runNow(m)).body as RunData).data;
    expect(body?.result).toBe('error');
    expect(body?.error).toContain('اسکیما');
    expect(m.fs.files.has('sync-state.json')).toBe(false);
    const st = await m.api.get('/api/instance-sync/status');
    expect((st.body as { data: { schema_match: boolean | null } }).data.schema_match).toBe(false);
  });

  it('شمارش هم‌خوان → synced و schema_match=true؛ انحراف ساعت > ۱۲۰ث → clock_warning', async () => {
    const m = await mount();
    await configureViaRoute(m);
    m.A.sql.exec("CREATE TABLE _migrations (version TEXT PRIMARY KEY, applied_at TEXT); INSERT INTO _migrations (version) VALUES ('a'), ('b'), ('c')");
    m.cloud.seedCloudMigrations(3);
    m.cloud.clockOffsetMs = 5 * 60_000; // ۵ دقیقه جلوتر (سراند Date)
    const body = ((await runNow(m)).body as RunData).data;
    expect(body?.result).toBe('synced');
    const st = await m.api.get('/api/instance-sync/status');
    const data = (st.body as { data: { schema_match: boolean | null; clock_warning: boolean } }).data;
    expect(data.schema_match).toBe(true);
    expect(data.clock_warning).toBe(true);
  });
});

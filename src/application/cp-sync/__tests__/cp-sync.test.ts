/**
 * گیت قرارداد cp-sync اعلان‌ها — قرارداد m1.5 (cp-node-announcement-sync.md)
 * همهٔ تست‌ها با fetch ساختگی و MockD1 همگام — بدون شبکهٔ واقعی.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestApp,
  MANAGER_ID,
  silentLogger,
  type TestApp
} from '../../../test/harness';
import { createLogger } from '@core/logger';
import {
  buildCpSyncConfig,
  syncCpAnnouncements,
  cpSyncOpportunistic,
  shouldAttemptCpSync,
  stampCpSyncAttempt,
  CP_SYNC_SETTINGS_KEY,
  CP_SYNC_ATTEMPT_KEY,
  CP_ID_PREFIX
} from '../announcements';

const CP_URL = 'https://network-control-plane.sanjeshm.workers.dev/api/node/announcements/sync';

const FULL_ENV = {
  CP_SYNC_URL: CP_URL,
  CP_NODE_CODE: 'demo-a',
  CP_NODE_KEY: 'ck_live_test_key',
  CP_SYNC_STAFF_ID: MANAGER_ID
};

interface CpItem {
  id: string;
  title: string;
  body: string;
  show_login: boolean;
  show_panel: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
}

function cpItem(over: Partial<CpItem> = {}): CpItem {
  return {
    id: `${CP_ID_PREFIX}aaaa0001-0000-4000-8000-000000000001`,
    title: 'به‌روزرسانی شبکه امشب',
    body: 'نسخهٔ ۱.۵ امشب روی نودها اعمال می‌شود.',
    show_login: true,
    show_panel: true,
    active: true,
    created_at: '2026-11-07T14:24:48.967Z',
    updated_at: '2026-11-07T14:24:48.967Z',
    ...over
  };
}

function fetchReturning(items: CpItem[], serverTime = '2026-11-07T14:30:00.000Z') {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const fn = (async (url: string | URL, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url: String(url), headers });
    return new Response(JSON.stringify({ data: { server_time: serverTime, items } }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }) as typeof fetch & { calls: Array<{ url: string; headers: Record<string, string> }> };
  fn.calls = calls;
  return fn;
}

function fetchStatus(status: number) {
  return (async () =>
    new Response(JSON.stringify({ error: 'UNAUTHORIZED_NODE' }), { status })) as typeof fetch;
}

async function listAnnouncements(A: TestApp): Promise<Array<Record<string, unknown>>> {
  return A.db.query<Record<string, unknown>>('SELECT * FROM announcements ORDER BY id');
}

describe('cp-sync: کلید خاموش (kill switch)', () => {
  it.each([
    ['بدون CP_SYNC_URL', { ...FULL_ENV, CP_SYNC_URL: '' }],
    ['بدون CP_NODE_CODE', { ...FULL_ENV, CP_NODE_CODE: '   ' }],
    ['بدون CP_NODE_KEY', { ...FULL_ENV, CP_NODE_KEY: undefined }],
    ['بدون CP_SYNC_STAFF_ID', { ...FULL_ENV, CP_SYNC_STAFF_ID: null }]
  ])('%s → disabled و هیچ fetch ای زده نمی‌شود', async (_name, env) => {
    const A = createTestApp();
    const f = fetchReturning([cpItem()]);
    const res = await syncCpAnnouncements({
      db: A.db,
      logger: silentLogger('it'),
      config: buildCpSyncConfig(env as Record<string, string | undefined | null>),
      fetchFn: f
    });
    expect(res.status).toBe('disabled');
    expect(f.calls).toHaveLength(0);
    expect(await listAnnouncements(A)).toHaveLength(0);
  });
});

describe('cp-sync: مسیر خوش‌فرض (pull + UPSERT)', () => {
  let A: TestApp;
  beforeAll(() => {
    A = createTestApp();
  });

  it('دو اعلان cp- را با هویت staff تعیین‌شده درج می‌کند؛ بولین‌ها ۰/۱ می‌شوند', async () => {
    const f = fetchReturning([
      cpItem(),
      cpItem({ id: 'cp-aaaa0002-0000-4000-8000-000000000002', title: 'قطعی کوتاه', show_login: true, show_panel: false })
    ]);
    const res = await syncCpAnnouncements({
      db: A.db,
      logger: silentLogger('it'),
      config: buildCpSyncConfig(FULL_ENV),
      fetchFn: f
    });
    expect(res.status).toBe('ok');
    expect(res.applied).toBe(2);
    expect(res.received).toBe(2);

    const rows = await listAnnouncements(A);
    expect(rows).toHaveLength(2);
    const first = rows.find((r) => r.id === 'cp-aaaa0001-0000-4000-8000-000000000001')!;
    expect(first.title).toBe('به‌روزرسانی شبکه امشب');
    expect(first.show_login).toBe(1);
    expect(first.show_panel).toBe(1);
    expect(first.bot_sent_staff).toBe(0);
    expect(first.bot_sent_families).toBe(0);
    expect(first.created_by).toBe(MANAGER_ID);
    const second = rows.find((r) => r.id === 'cp-aaaa0002-0000-4000-8000-000000000002')!;
    expect(second.show_panel).toBe(0);
  });

  it('هدرهای قرارداد: X-CP-Node-Code + Bearer + X-CP-Node-Version', async () => {
    // app ایزوله — تا «آخرین سینک موفقِ» تست قبلی در URL این تست since نسازد
    const B = createTestApp();
    const f = fetchReturning([]);
    await syncCpAnnouncements({
      db: B.db,
      logger: silentLogger('it'),
      config: buildCpSyncConfig(FULL_ENV),
      fetchFn: f
    });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].headers['X-CP-Node-Code']).toBe('demo-a');
    expect(f.calls[0].headers['Authorization']).toBe('Bearer ck_live_test_key');
    expect(f.calls[0].headers['X-CP-Node-Version']).toBeTruthy();
    expect(f.calls[0].url).toBe(CP_URL); // بدون سینک قبلی: بدون since
  });

  it('سینک دوم since = آخرین سینک موفق − ۶۰ ثانیه را می‌فرستد و settings ثبت می‌شود', async () => {
    const f1 = fetchReturning([], '2026-11-07T14:30:00.000Z');
    await syncCpAnnouncements({
      db: A.db,
      logger: silentLogger('it'),
      config: buildCpSyncConfig(FULL_ENV),
      fetchFn: f1
    });
    const stored = await A.db.queryOne<{ value: string }>(
      'SELECT value FROM settings WHERE key = ?',
      [CP_SYNC_SETTINGS_KEY]
    );
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!.value)).toBe('2026-11-07T14:30:00.000Z');

    const f2 = fetchReturning([]);
    await syncCpAnnouncements({
      db: A.db,
      logger: silentLogger('it'),
      config: buildCpSyncConfig(FULL_ENV),
      fetchFn: f2
    });
    expect(f2.calls[0].url).toContain('since=');
    expect(decodeURIComponent(f2.calls[0].url.split('since=')[1])).toBe('2026-11-07T14:29:00.000Z');
  });
});

describe('cp-sync: قانون طلایی و ترتیب', () => {
  it('آیتم بدون پیشوند cp- هرگز نوشته نمی‌شود حتی اگر CP بفرستد', async () => {
    const A = createTestApp();
    const f = fetchReturning([cpItem({ id: 'local-should-not-apply', title: 'محلی ساختگی' })]);
    const res = await syncCpAnnouncements({
      db: A.db,
      logger: silentLogger('it'),
      config: buildCpSyncConfig(FULL_ENV),
      fetchFn: f
    });
    expect(res.status).toBe('ok');
    expect(res.applied).toBe(0);
    expect(await listAnnouncements(A)).toHaveLength(0);
  });

  it('اعلان محلی مدیر با UPSERT گارددار بازنویسی نمی‌شود (لایهٔ SQL)', async () => {
    const A = createTestApp();
    // اعلان محلی با id خودِ آن در پاسخ CP — فقط گارد SQL باید جلویش را بگیرد
    A.db.execute(
      `INSERT INTO announcements (id, title, body, show_login, show_panel, active, created_by, created_at, updated_at)
       VALUES ('announcement-local-1', 'اعلان خود مرکز', 'متن مدیر', 1, 1, 1, ?, '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z')`,
      [MANAGER_ID]
    );
    // شبیه‌سازی: اگر روزی CP id بدون پیشوند فرستاد و فیلتر JS دور زده شد، گارد SQL می‌ایستد
    const countBefore = (await listAnnouncements(A)).length;
    const f = fetchReturning([cpItem({ id: 'announcement-local-1', title: 'بازنویسی ممنوع' })]);
    const res = await syncCpAnnouncements({
      db: A.db,
      logger: silentLogger('it'),
      config: buildCpSyncConfig(FULL_ENV),
      fetchFn: f
    });
    expect(res.status).toBe('ok');
    expect(res.applied).toBe(0);
    const rows = await listAnnouncements(A);
    expect(rows).toHaveLength(countBefore);
    expect(rows[0].title).toBe('اعلان خود مرکز'); // دست‌نخورده
  });

  it('ترتیب اعمال قدیمی→جدید است — جدیدترین updated_at برنده می‌شود (CP نزولی می‌فرستد)', async () => {
    const A = createTestApp();
    const id = 'cp-aaaa0003-0000-4000-8000-000000000003';
    const f = fetchReturning([
      cpItem({ id, title: 'نسخهٔ جدیدتر', body: 'متن نهایی', updated_at: '2026-11-07T16:00:00.000Z' }),
      cpItem({ id, title: 'نسخهٔ قدیمی‌تر', body: 'متن کهنه', updated_at: '2026-11-07T15:00:00.000Z' })
    ]);
    const res = await syncCpAnnouncements({
      db: A.db,
      logger: silentLogger('it'),
      config: buildCpSyncConfig(FULL_ENV),
      fetchFn: f
    });
    expect(res.status).toBe('ok');
    expect(res.applied).toBe(2); // همان id دوبار اعمال شد
    const row = await A.db.queryOne<Record<string, unknown>>('SELECT * FROM announcements WHERE id = ?', [id]);
    expect(row!.title).toBe('نسخهٔ جدیدتر');
    expect(row!.body).toBe('متن نهایی');
  });

  it('active:false = بایگانی است، حذف فیزیکی نه', async () => {
    const A = createTestApp();
    const id = 'cp-aaaa0004-0000-4000-8000-000000000004';
    const f1 = fetchReturning([cpItem({ id })]);
    await syncCpAnnouncements({ db: A.db, logger: silentLogger('it'), config: buildCpSyncConfig(FULL_ENV), fetchFn: f1 });
    const f2 = fetchReturning([cpItem({ id, active: false, updated_at: '2026-11-07T18:00:00.000Z' })]);
    await syncCpAnnouncements({ db: A.db, logger: silentLogger('it'), config: buildCpSyncConfig(FULL_ENV), fetchFn: f2 });
    const row = await A.db.queryOne<Record<string, unknown>>('SELECT * FROM announcements WHERE id = ?', [id]);
    expect(row).not.toBeNull(); // هنوز هست
    expect(row!.active).toBe(0); // فقط بایگانی
  });

  it('UPSERT پرچم‌های ارسال بات محلی را دست نمی‌زند', async () => {
    const A = createTestApp();
    const id = 'cp-aaaa0005-0000-4000-8000-000000000005';
    const f1 = fetchReturning([cpItem({ id })]);
    await syncCpAnnouncements({ db: A.db, logger: silentLogger('it'), config: buildCpSyncConfig(FULL_ENV), fetchFn: f1 });
    A.db.execute('UPDATE announcements SET bot_sent_staff = 1, bot_sent_families = 1 WHERE id = ?', [id]);
    const f2 = fetchReturning([cpItem({ id, title: 'ویرایش CP', updated_at: '2026-11-07T17:00:00.000Z' })]);
    await syncCpAnnouncements({ db: A.db, logger: silentLogger('it'), config: buildCpSyncConfig(FULL_ENV), fetchFn: f2 });
    const row = await A.db.queryOne<Record<string, unknown>>('SELECT * FROM announcements WHERE id = ?', [id]);
    expect(row!.title).toBe('ویرایش CP');
    expect(row!.bot_sent_staff).toBe(1); // حفظ شد
    expect(row!.bot_sent_families).toBe(1);
  });
});

describe('cp-sync: خطاها هرگز کرش نمی‌کنند', () => {
  it('۴۰۱ CP → error و هیچ ردیفی نوشته نمی‌شود', async () => {
    const A = createTestApp();
    const res = await syncCpAnnouncements({
      db: A.db,
      logger: silentLogger('it'),
      config: buildCpSyncConfig(FULL_ENV),
      fetchFn: fetchStatus(401)
    });
    expect(res.status).toBe('error');
    expect(res.detail).toBe('http_401');
    expect(await listAnnouncements(A)).toHaveLength(0);
  });

  it('خطای شبکه (fetch پرتاب) → error و دورهٔ بعد تلاش می‌شود', async () => {
    const A = createTestApp();
    const boom = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const res = await syncCpAnnouncements({
      db: A.db,
      logger: silentLogger('it'),
      config: buildCpSyncConfig(FULL_ENV),
      fetchFn: boom
    });
    expect(res.status).toBe('error');
    expect(await listAnnouncements(A)).toHaveLength(0);
    expect(await A.db.queryOne('SELECT 1 FROM settings WHERE key = ?', [CP_SYNC_SETTINGS_KEY])).toBeNull();
  });

  it('payload نامعتبر (بدون data) → error و هیچ چیزی اعمال نمی‌شود', async () => {
    const A = createTestApp();
    const bad = (async () => new Response(JSON.stringify({ items: [] }), { status: 200 })) as typeof fetch;
    const res = await syncCpAnnouncements({
      db: A.db,
      logger: silentLogger('it'),
      config: buildCpSyncConfig(FULL_ENV),
      fetchFn: bad
    });
    expect(res.status).toBe('error');
    expect(res.detail).toBe('payload_invalid');
    expect(await listAnnouncements(A)).toHaveLength(0);
  });

  it('CP_SYNC_STAFF_ID ناموجود → error شفاف staff_missing و هیچ درجی', async () => {
    const A = createTestApp();
    const res = await syncCpAnnouncements({
      db: A.db,
      logger: silentLogger('it'),
      config: buildCpSyncConfig({ ...FULL_ENV, CP_SYNC_STAFF_ID: 'no-such-staff' }),
      fetchFn: fetchReturning([cpItem()])
    });
    expect(res.status).toBe('error');
    expect(res.detail).toBe('staff_missing');
    expect(await listAnnouncements(A)).toHaveLength(0);
  });
});

describe('cp-sync: دروازهٔ فرصت‌طلب (جای کرون پنجم روی پلن Free)', () => {
  it('env ناقص → skipped با صفر خواندنی (هیچ اثری در settings نمی‌گذارد)', async () => {
    const A = createTestApp();
    const res = await cpSyncOpportunistic({
      db: A.db,
      logger: silentLogger('it'),
      config: buildCpSyncConfig({ CP_SYNC_URL: CP_URL }), // بقیه خالی
      fetchFn: fetchReturning([])
    });
    expect(res.status).toBe('skipped');
    expect(await A.db.queryOne('SELECT 1 FROM settings WHERE key = ?', [CP_SYNC_ATTEMPT_KEY])).toBeNull();
  });

  it('تلاش تازه (< ۱۵ دقیقه) → skipped و fetch زده نمی‌شود', async () => {
    const A = createTestApp();
    const now = new Date('2026-11-07T15:00:00.000Z');
    await stampCpSyncAttempt(A.db, new Date('2026-11-07T14:50:00.000Z')); // فقط ۱۰ دقیقه قبل
    const f = fetchReturning([cpItem()]);
    const res = await cpSyncOpportunistic({
      db: A.db,
      logger: silentLogger('it'),
      config: buildCpSyncConfig(FULL_ENV),
      fetchFn: f,
      now: () => now
    });
    expect(res.status).toBe('skipped');
    expect(f.calls).toHaveLength(0);
  });

  it('گذشتهٔ ۱۵ دقیقه → مُهر تلاش می‌خورد و سینک اجرا می‌شود', async () => {
    const A = createTestApp();
    const now = new Date('2026-11-07T15:00:00.000Z');
    await stampCpSyncAttempt(A.db, new Date('2026-11-07T14:44:00.000Z')); // ۱۶ دقیقه قبل
    const f = fetchReturning([cpItem()]);
    const res = await cpSyncOpportunistic({
      db: A.db,
      logger: silentLogger('it'),
      config: buildCpSyncConfig(FULL_ENV),
      fetchFn: f,
      now: () => now
    });
    expect(res.status).toBe('ok');
    expect(f.calls).toHaveLength(1);
    const attempt = await A.db.queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [CP_SYNC_ATTEMPT_KEY]);
    expect(JSON.parse(attempt!.value)).toBe('2026-11-07T15:00:00.000Z');
  });

  it('Service Binding CP → همان قرارداد از طریق binding.fetch می‌گذرد (بدون fetch عمومی)', async () => {
    const A = createTestApp();
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const binding = {
      fetch: (async (url: string | URL, init?: RequestInit) => {
        calls.push({ url: String(url), headers: (init?.headers ?? {}) as Record<string, string> });
        return new Response(
          JSON.stringify({ data: { server_time: '2026-11-07T14:30:00.000Z', items: [cpItem()] } }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }) as Fetcher['fetch']
    } as Fetcher;
    const res = await syncCpAnnouncements({
      db: A.db,
      logger: silentLogger('it'),
      config: buildCpSyncConfig(FULL_ENV),
      binding
    });
    expect(res.status).toBe('ok');
    expect(res.applied).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].headers['X-CP-Node-Code']).toBe('demo-a');
    expect(calls[0].headers['Authorization']).toBe('Bearer ck_live_test_key');
    expect(calls[0].url).toContain('/api/node/announcements/sync');
    const rows = await listAnnouncements(A);
    expect(rows).toHaveLength(1);
  });

  it('خطای شبکه در دروازهٔ فرصت‌طلب هم مُهر می‌خورد (تا سیل تلاش نشود) و error برمی‌گردد', async () => {
    const A = createTestApp();
    const boom = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const res = await cpSyncOpportunistic({
      db: A.db,
      logger: silentLogger('it'),
      config: buildCpSyncConfig(FULL_ENV),
      fetchFn: boom
    });
    expect(res.status).toBe('error');
    const attempt = await A.db.queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [CP_SYNC_ATTEMPT_KEY]);
    expect(attempt).not.toBeNull();
  });

  it('shouldAttemptCpSync: مرز دقیق ۱۵ دقیقه و مقدار خراب', () => {
    const now = new Date('2026-11-07T15:00:00.000Z');
    expect(shouldAttemptCpSync(null, now)).toBe(true);
    expect(shouldAttemptCpSync('garbage', now)).toBe(true);
    expect(shouldAttemptCpSync('2026-11-07T14:45:00.000Z', now)).toBe(true); // دقیقاً ۱۵ دقیقه
    expect(shouldAttemptCpSync('2026-11-07T14:45:00.500Z', now)).toBe(false); // ۵۰۰ms کمتر
  });
});

describe('cp-sync: لاگ قراردادی', () => {
  it('رویداد announcement.cp_sync با n درست لاگ می‌شود', async () => {
    const A = createTestApp();
    const seen: Array<{ scope: string; event: string; fields: Record<string, unknown> }> = [];
    const base = createLogger('sync');
    const logger = {
      ...base,
      child(sub: string) {
        const inner = base.child(sub);
        return {
          ...inner,
          info: (event: string, fields?: Record<string, unknown>) => seen.push({ scope: sub, event, fields: fields ?? {} }),
          warn: inner.warn,
          error: inner.error,
          debug: inner.debug,
          child: inner.child
        };
      }
    };
    const f = fetchReturning([cpItem()]);
    const res = await syncCpAnnouncements({ db: A.db, logger, config: buildCpSyncConfig(FULL_ENV), fetchFn: f });
    expect(res.status).toBe('ok');
    const hit = seen.find((s) => s.event === 'announcement.cp_sync');
    expect(hit).toBeTruthy();
    expect(hit!.scope).toBe('cp-sync');
    expect(hit!.fields.n).toBe(1);
  });
});

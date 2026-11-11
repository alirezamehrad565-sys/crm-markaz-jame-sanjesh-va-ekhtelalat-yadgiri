/**
 * گیت‌های قرارداد سینک کتابخانهٔ شبکه (۱.۲۵.۴۶ — محور دوم غنی‌سازی شبکه)
 * سند مرجع: docs/cp-node-content-hub.md
 *  ۱) خاموشی کامل بدون env  ۲) گیت ۱۵دقیقه‌ای با مُهر مشترک
 *  ۳) pull: فقط پیشوند cp-content- (لایهٔ JS) + UPSERT + بایگانی active:false
 *  ۴) push: فقط status='queued' محلی؛ موفقیت → submitted؛ خطا → صف دست‌نخورده
 *  ۵) استقلال: خطای push مانع pull نیست و برعکس
 *  ۶) ۴۰۴ CP (درگاه هنوز نیست) = warn و تلاش دورهٔ بعد — کرش ممنوع
 */
import { describe, it, expect } from 'vitest';
import { createTestApp, silentLogger } from '../../../test/harness';
import {
  buildCpContentConfig,
  runCpContentCycle,
  cpContentOpportunistic,
  shouldRunCpContent,
  CP_CONTENT_ATTEMPT_KEY,
  CP_CONTENT_SYNC_KEY,
  CP_CONTENT_PUSH_KEY,
  CP_CONTENT_PULL_MAX,
  CP_CONTENT_BATCH_MAX
} from '../sync';
import type { DbClient } from '@core/db';

const NODE_ENV = {
  CP_SYNC_URL: 'https://network-control-plane.sanjeshm.workers.dev/announcements/sync',
  CP_NODE_CODE: 'sanjesh-center',
  CP_NODE_KEY: 'node-key-1',
  CP_SYNC_STAFF_ID: '00000000-0000-0000-0000-000000000001'
};

function configOf(env: Partial<typeof NODE_ENV> = NODE_ENV) {
  return buildCpContentConfig(env);
}

type FetchCall = { url: string; init: RequestInit };

function makeFetch(responder: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  const fn: typeof fetch = async (url: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(url), init: (init ?? {}) as RequestInit };
    calls.push(call);
    return responder(call.url, call.init);
  };
  return { calls, fn };
}

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

const CP_ITEM_BASE = {
  // 1.25.48 m6 — شکل قرارداد واقعی CP (docs/cp-content-sharing.md)
  kind: 'exercise' as 'exercise' | 'card' | 'document' | 'plan' | 'doc' | 'clearbook',
  title: 'بستهٔ برگزیدهٔ دقت دیداری',
  summary: 'خلاصهٔ برگزیده',
  body: 'متن کامل برگزیده',
  tags: ['دقت دیداری'],
  subcategory: null as string | null,
  author_name: 'سمیرا محمدی' as string | null,
  co_author_name: null as string | null,
  file_name: 'dokat.pdf' as string | null,
  file_size: 2048 as number | null,
  external_url: null as string | null,
  quality: { score: { score: 39, refs: 3, uses: 12, refScore: 15, useScore: 24, formulaVersion: 1, source: 'client', generatedAt: '2026-11-01T10:00:00Z' } } as Record<string, unknown> | null,
  status: 'approved' as 'collected' | 'approved' | 'rejected' | 'retired' | 'published',
  source_center_code: 'sanjesh-center' as string | null,
  source_center_name: 'مرکز سنجش' as string | null,
  created_at: '2026-11-01T10:00:00.000Z'
};

function cpItem(overrides: Partial<typeof CP_ITEM_BASE> & { id: string; updated_at: string }) {
  return { ...CP_ITEM_BASE, ...overrides };
}

async function insertLocalQueued(db: DbClient, id: string, title = 'بستهٔ محلی مرکز'): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO network_content (id, kind, title, summary, body, tags, origin, status, submitted_at, created_by, created_at, updated_at)
     VALUES (?, 'exercise', ?, 'خلاصهٔ محلی', 'متن محلی', '["خانه"]', 'local', 'queued', ?, '00000000-0000-0000-0000-000000000001', ?, ?)`,
    [id, title, now, now, now]
  );
}

async function insertLocalDraft(db: DbClient, id: string, title: string): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO network_content (id, kind, title, summary, body, tags, origin, status, created_by, created_at, updated_at)
     VALUES (?, 'exercise', ?, 'خلاصهٔ محلی', 'متن محلی', '[]', 'local', 'draft', '00000000-0000-0000-0000-000000000001', ?, ?)`,
    [id, title, now, now]
  );
}

describe('قرارداد خاموشی و گیت', () => {
  it('بدون env کامل → status=disabled و صفر fetch', async () => {
    const db = createTestApp().db;
    const { calls, fn } = makeFetch(() => okJson({ data: { server_time: '2026-11-01T00:00:00.000Z', items: [] } }));
    const res = await runCpContentCycle({ db, logger: silentLogger('t'), config: configOf({}), fetchFn: fn });
    expect(res.status).toBe('disabled');
    expect(calls.length).toBe(0);
  });

  it('گیت ۱۵دقیقه‌ای — تلاش دوم در فاصلهٔ کوتاه → skipped', async () => {
    expect(shouldRunCpContent(null, new Date())).toBe(true);
    const now = new Date();
    const stamp = new Date(now.getTime() - 5 * 60_000).toISOString();
    expect(shouldRunCpContent(stamp, now)).toBe(false);
    const stampOld = new Date(now.getTime() - 16 * 60_000).toISOString();
    expect(shouldRunCpContent(stampOld, now)).toBe(true);
  });

  it('دورهٔ دوم بلافاصله → skipped و مُهر attempt در settings', async () => {
    const db = createTestApp().db;
    const { calls, fn } = makeFetch(() => okJson({ data: { server_time: '2026-11-01T00:00:00.000Z', items: [] } }));
    const deps = { db, logger: silentLogger('t'), config: configOf(), fetchFn: fn };
    const first = await runCpContentCycle(deps);
    expect(first.status).toBe('ok');
    const second = await runCpContentCycle(deps);
    expect(second.status).toBe('skipped');
    const stampRow = await db.queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [CP_CONTENT_ATTEMPT_KEY]);
    expect(stampRow).toBeTruthy();
    // دورهٔ اول فقط pull را fetch می‌کند (push با صف خالی بدون fetch برمی‌گردد)؛ دورهٔ دوم skipped
    expect(calls.length).toBe(1);
  });

  it('فرصت‌طلب بدون env کامل → skipped بدون هیچ خواندنی', async () => {
    const db = createTestApp().db;
    const res = await cpContentOpportunistic({ db, logger: silentLogger('t'), config: configOf({ CP_SYNC_URL: '' }) });
    expect(res).toEqual({ status: 'skipped' });
  });
});

describe('قرارداد pull برگزیده‌ها', () => {
  it('فقط ردیف‌های cp-content- اعمال می‌شوند؛ آیتم بی‌پیشوند دور ریخته می‌شود و مُهر sync ثبت می‌شود', async () => {
    const db = createTestApp().db;
    const { calls, fn } = makeFetch(() =>
      okJson({
        data: {
          server_time: '2026-11-05T12:00:00.000Z',
          items: [
            cpItem({ id: 'cp-content-aaaa1111-1111-4111-8111-111111111111', updated_at: '2026-11-01T10:00:00.000Z' }),
            cpItem({ id: 'local-9999', updated_at: '2026-11-01T11:00:00.000Z', title: 'تلاش برای بازنویسی محلی' }),
            cpItem({ id: 'cp-content-aaaa2222-2222-4222-8222-222222222222', kind: 'plan', title: 'طرح برگزیدهٔ دوم', updated_at: '2026-11-02T10:00:00.000Z' })
          ]
        }
      })
    );
    const res = await runCpContentCycle({ db, logger: silentLogger('t'), config: configOf(), fetchFn: fn });
    expect(res.status).toBe('ok');
    expect(res.applied).toBe(2);

    const pullUrl = calls.find((c) => c.init.method === 'GET')?.url ?? '';
    expect(pullUrl.startsWith('https://network-control-plane.sanjeshm.workers.dev/api/node/content/sync')).toBe(true);
    expect(pullUrl).not.toContain('since='); // اولین دوره بدون سینک موفق قبلی

    const rows = await db.query<{ id: string; origin: string; status: string; source_center: string | null; author_name: string | null; quality: string | null }>(
      `SELECT id, origin, status, source_center, author_name, quality FROM network_content ORDER BY id`
    );
    expect(rows.map((r) => r.id)).toEqual([
      'cp-content-aaaa1111-1111-4111-8111-111111111111',
      'cp-content-aaaa2222-2222-4222-8222-222222222222'
    ]);
    expect(rows.every((r) => r.origin === 'cp' && r.status === 'published')).toBe(true);
    const stamp = await db.queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [CP_CONTENT_SYNC_KEY]);
    expect(stamp?.value).toBe(JSON.stringify('2026-11-05T12:00:00.000Z'));
  });

  it('دورهٔ بعد با since برگشتی می‌آید و UPSERT همان ردیف را تازه می‌کند؛ active:false بایگانی است نه حذف', async () => {
    const db = createTestApp().db;
    const id = 'cp-content-bbbb1111-1111-4111-8111-111111111111';
    let round = 0;
    const { calls, fn } = makeFetch(() => {
      round += 1;
      if (round === 1) {
        return okJson({ data: { server_time: '2026-11-05T12:00:00.000Z', items: [cpItem({ id, updated_at: '2026-11-01T10:00:00.000Z' })] } });
      }
      return okJson({
        data: {
          server_time: '2026-11-06T12:00:00.000Z',
          items: [cpItem({ id, updated_at: '2026-11-06T09:00:00.000Z', title: 'عنوان ویرایش‌شدهٔ شبکه', status: 'retired' as const })]
        }
      });
    });
    const deps = { db, logger: silentLogger('t'), config: configOf(), fetchFn: fn };
    await runCpContentCycle(deps);
    // مُهر sync دور اول → دورهٔ دوم باید since داشته باشد؛ با گیت ۱۵دقیقه‌ای override صفر
    await db.execute(
      `UPDATE settings SET value = ? WHERE key = ?`,
      [JSON.stringify('2026-11-05T12:00:00.000Z'), CP_CONTENT_ATTEMPT_KEY]
    );
    const second = await runCpContentCycle({ ...deps, minIntervalMs: 0 });
    expect(second.status).toBe('ok');

    const pullUrls = calls.filter((c) => c.init.method === 'GET').map((c) => c.url);
    expect(pullUrls[1]).toContain('since=');
    const row = await db.queryOne<{ title: string; active: number; status: string }>(
      'SELECT title, active, status FROM network_content WHERE id = ?',
      [id]
    );
    expect(row?.title).toBe('عنوان ویرایش‌شدهٔ شبکه');
    expect(row?.active).toBe(0); // بایگانی — حذف فیزیکی ممنوع
    expect(row?.status).toBe('published');
  });

  it('ردیف محلی هرگز از مسیر pull تغییر نمی‌کند (حتی اگر CP چنین آیتمی بفرستد — فیلتر JS)', async () => {
    const db = createTestApp().db;
    await insertLocalDraft(db, '11111111-2222-4333-8444-555555555555', 'بستهٔ محلیِ دست‌نخورده'); // draft تا push آن را نبرد
    const { fn } = makeFetch(() =>
      okJson({
        data: {
          server_time: '2026-11-05T12:00:00.000Z',
          items: [cpItem({ id: '11111111-2222-4333-8444-555555555555', updated_at: '2026-11-01T10:00:00.000Z', title: 'رونویسی مخرب' })]
        }
      })
    );
    const res = await runCpContentCycle({ db, logger: silentLogger('t'), config: configOf(), fetchFn: fn });
    expect(res.applied).toBe(0);
    const row = await db.queryOne<{ title: string; origin: string; status: string }>(
      'SELECT title, origin, status FROM network_content WHERE id = ?',
      ['11111111-2222-4333-8444-555555555555']
    );
    expect(row?.title).toBe('بستهٔ محلیِ دست‌نخورده');
    expect(row?.origin).toBe('local');
    expect(row?.status).toBe('draft');
  });
});

describe('قرارداد push همرسانی‌ها', () => {
  it('فقط status=queued محلی push می‌شود؛ موفقیت → submitted و مُهر push', async () => {
    const db = createTestApp().db;
    await insertLocalQueued(db, '88888888-1111-4111-8111-111111111111', 'بستهٔ ارسالی یک');
    await insertLocalQueued(db, '88888888-2222-4222-8222-222222222222', 'بستهٔ ارسالی دو');
    await db.execute(
      `INSERT INTO network_content (id, kind, title, origin, status, created_by, created_at, updated_at)
       VALUES ('88888888-3333-4333-8333-333333333333', 'doc', 'پیش‌نویس نمی‌رود', 'local', 'draft', '00000000-0000-0000-0000-000000000001', '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z')`
    );

    const { calls, fn } = makeFetch((url) => {
      expect(url.endsWith('/api/node/content/submit') || url.includes('/api/node/content/sync')).toBe(true);
      return okJson({ data: { server_time: '2026-11-05T12:00:00.000Z', items: [] } });
    });
    const res = await runCpContentCycle({ db, logger: silentLogger('t'), config: configOf(), fetchFn: fn });
    expect(res.status).toBe('ok');
    expect(res.pushed).toBe(2);

    const post = calls.find((c) => c.init.method === 'POST');
    expect(post).toBeDefined();
    expect(post?.url).toBe('https://network-control-plane.sanjeshm.workers.dev/api/node/content/submit');
    const headers = post?.init.headers as Record<string, string>;
    expect(headers['X-CP-Node-Code']).toBe('sanjesh-center');
    expect(headers.Authorization).toBe('Bearer node-key-1');
    const body = JSON.parse(String(post?.init.body)) as { items: Array<{ id: string; kind: string }> };
    expect(body.items.map((i) => i.id).sort()).toEqual([
      '88888888-1111-4111-8111-111111111111',
      '88888888-2222-4222-8222-222222222222'
    ]);
    expect(body.items.every((i) => i.kind === 'exercise')).toBe(true);

    const statuses = await db.query<{ id: string; status: string }>(
      `SELECT id, status FROM network_content WHERE id LIKE '88888888-%' ORDER BY id`
    );
    expect(statuses.map((r) => r.status)).toEqual(['submitted', 'submitted', 'draft']);

    const pushStamp = await db.queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [CP_CONTENT_PUSH_KEY]);
    expect(pushStamp).toBeTruthy();
  });

  it('push خطا (500) → صف دست‌نخورده، ولی pull مستقل اجرا می‌شود؛ pull خطا هم push را باطل نمی‌کند', async () => {
    const db = createTestApp().db;
    await insertLocalQueued(db, '99999999-1111-4111-8111-111111111111', 'می‌ماند در صف');
    let round = 0;
    const { fn } = makeFetch((url) => {
      round += 1;
      if (url.includes('/api/node/content/submit')) return new Response('no', { status: 500 });
      return okJson({ data: { server_time: '2026-11-05T12:00:00.000Z', items: [cpItem({ id: 'cp-content-cccc1111-1111-4111-8111-111111111111', updated_at: '2026-11-01T10:00:00.000Z' })] } });
    });
    const res = await runCpContentCycle({ db, logger: silentLogger('t'), config: configOf(), fetchFn: fn });
    expect(res.status).toBe('error');
    expect(res.detail).toContain('http_500');
    expect(res.pushed ?? 0).toBe(0);
    expect(res.applied).toBe(1); // pull مستقل موفق شد

    const row = await db.queryOne<{ status: string }>('SELECT status FROM network_content WHERE id = ?', ['99999999-1111-4111-8111-111111111111']);
    expect(row?.status).toBe('queued'); // دورهٔ بعد دوباره تلاش می‌شود
    void round;
  });

  it('۴۰۴ از CP (درگاه هنوز نیست) = error و کرش نمی‌کند — استقلال کامل نود', async () => {
    const db = createTestApp().db;
    const { fn } = makeFetch(() => new Response('error code: 1042', { status: 404 }));
    const res = await runCpContentCycle({ db, logger: silentLogger('t'), config: configOf(), fetchFn: fn });
    expect(res.status).toBe('error');
    expect(res.detail).toContain('http_404');
    const rows = await db.query<{ id: string }>('SELECT id FROM network_content');
    expect(rows.length).toBe(0);
  });
});

describe('رفع CP-1 — سقف صفحهٔ pull جدا از دستهٔ push (۱.۲۵.۶۷)', () => {
  it('پاسخ ۱۰۰ آیتمی (سقف قرارداد §۵) کامل اعمال می‌شود — سقف قدیمیِ ۲۰ دیگر گلوگاه نیست', async () => {
    const db = createTestApp().db;
    const items = Array.from({ length: 100 }, (_, i) =>
      cpItem({
        id: `cp-content-dddd${String(i).padStart(4, '0')}-1111-4111-8111-111111111111`,
        updated_at: '2026-11-01T10:00:00.000Z'
      })
    );
    const { fn } = makeFetch(() => okJson({ data: { server_time: '2026-11-05T12:00:00.000Z', items } }));
    const res = await runCpContentCycle({ db, logger: silentLogger('t'), config: configOf(), fetchFn: fn });
    expect(res.status).toBe('ok');
    expect(res.applied).toBe(100);
  });

  it('پاسخ ۱۰۱ آیتمی → payload_invalid و مُهر sync پیش نمی‌رود (دور بی‌نهایت گیت‌دار ماند)', async () => {
    const db = createTestApp().db;
    const items = Array.from({ length: 101 }, (_, i) =>
      cpItem({
        id: `cp-content-eeee${String(i).padStart(4, '0')}-1111-4111-8111-111111111111`,
        updated_at: '2026-11-01T10:00:00.000Z'
      })
    );
    const { fn } = makeFetch(() => okJson({ data: { server_time: '2026-11-05T12:00:00.000Z', items } }));
    const res = await runCpContentCycle({ db, logger: silentLogger('t'), config: configOf(), fetchFn: fn });
    expect(res.status).toBe('error');
    expect(res.detail).toContain('payload_invalid');
    const stamp = await db.queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [CP_CONTENT_SYNC_KEY]);
    expect(stamp).toBeFalsy(); // مُهر فقط روی موفقیت پیش می‌رود
  });

  it('ثابت‌های جهت‌دار: PULL=۱۰۰ قراردادی، PUSH=۲۰ دستهٔ همرسانی', () => {
    expect(CP_CONTENT_PULL_MAX).toBe(100);
    expect(CP_CONTENT_BATCH_MAX).toBe(20);
  });
});

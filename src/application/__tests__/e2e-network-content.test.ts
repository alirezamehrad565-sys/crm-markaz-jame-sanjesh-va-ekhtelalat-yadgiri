/**
 * e2e کتابخانهٔ شبکه (۱.۲۵.۴۶ — محور دوم غنی‌سازی شبکه)
 * مسیرهای /api/network-content — خواندن: مدیر+منشی، نوشتن: فقط مدیر.
 * ردیف‌های origin='cp' هرگز از این مسیرها ساخته/تغییر نمی‌کنند (فقط سینک).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, asRole, MANAGER_ID, type TestApp } from '../../test/harness';
import type { Api } from '../../test/harness';
import { createNetworkContentService } from '@domain/network-content';
import { createAuditWriter } from '@core/audit';
import { ConflictError, NotFoundError } from '@core/errors';

let app: TestApp;
let api: Api; // مدیر
let secretary: Api;
let therapist: Api;

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}
function metaOf(res: { body: unknown }): NcMeta {
  return (res.body as { meta: NcMeta }).meta;
}

interface NcItem {
  id: string;
  kind: string;
  kindLabel: string;
  title: string;
  tags: string[];
  origin: string;
  status: string;
  sourceCenter: string | null;
  submittedAt: string | null;
}

interface NcMeta {
  hasMore: boolean;
  counts: { local: number; network: number };
}

beforeAll(async () => {
  app = createTestApp();
  api = await asRole(app, 'manager');
  secretary = await asRole(app, 'secretary');
  therapist = await asRole(app, 'therapist');
});

describe('POST /api/network-content — ساخت و صف همرسانی', () => {
  it('بدون توکن → 401', async () => {
    const res = await app.app.request('/api/network-content', { method: 'POST', body: '{}' }, app.env as never);
    expect(res.status).toBe(401);
  });

  it('درمانگر (نقش غیرمدیر) → 403', async () => {
    const res = await therapist.post('/api/network-content', {
      kind: 'exercise',
      title: 'بستهٔ تمرین دقت دیداری'
    });
    expect(res.status).toBe(403);
  });

  it('منشی فقط می‌خواند — نوشتن → 403', async () => {
    const res = await secretary.post('/api/network-content', { kind: 'doc', title: 'آیین‌نامهٔ مرکز' });
    expect(res.status).toBe(403);
    const res2 = await secretary.get('/api/network-content');
    expect(res2.status).toBe(200);
  });

  it('عنوان خیلی کوتاه → 400', async () => {
    const res = await api.post('/api/network-content', { kind: 'exercise', title: 'x' });
    expect(res.status).toBe(400);
  });

  it('kind نامعتبر → 400', async () => {
    const res = await api.post('/api/network-content', { kind: 'video', title: 'عنوان معتبر' });
    expect(res.status).toBe(400);
  });

  it('مدیر با queue_now=true می‌سازد → وضعیت queued و submitted_at ثبت می‌شود', async () => {
    const res = await api.post('/api/network-content', {
      kind: 'exercise',
      title: 'بستهٔ تمرین تقویت دقت دیداری — پایهٔ دوم',
      summary: 'ده کارت تمرین برای تقویت دقت دیداری در خانه',
      body: 'مرحلهٔ اول: …\nمرحلهٔ دوم: …',
      tags: ['دقت دیداری', 'پایهٔ دوم'],
      queue_now: true
    });
    expect(res.status).toBe(201);
    const rec = dataOf<NcItem>(res);
    expect(rec.origin).toBe('local');
    expect(rec.status).toBe('queued');
    expect(rec.submittedAt).toBeTruthy();
    expect(rec.tags).toEqual(['دقت دیداری', 'پایهٔ دوم']);
    expect(rec.kindLabel).toBe('تمرین / کارت آماده');
  });

  it('ساخت پیش‌نویس (بدون queue_now) → draft و بعد صف و کنارگذاری', async () => {
    const created = await api.post('/api/network-content', {
      kind: 'plan',
      title: 'طرح درمان هشت‌جلسه‌ای — نارساخوانی'
    });
    expect(created.status).toBe(201);
    const draft = dataOf<NcItem>(created);
    expect(draft.status).toBe('draft');
    const id = draft.id;

    const queued = await api.post(`/api/network-content/${id}/queue`);
    expect(queued.status).toBe(200);
    expect(dataOf<NcItem>(queued).status).toBe('queued');

    const again = await api.post(`/api/network-content/${id}/queue`);
    expect(again.status).toBe(409); // فقط draft/withdrawn قابل صف‌کردن است

    const wd = await api.post(`/api/network-content/${id}/withdraw`);
    expect(wd.status).toBe(200);
    expect(dataOf<NcItem>(wd).status).toBe('withdrawn');
  });
});

describe('GET /api/network-content — فهرست، فیلتر و شمارنده‌ها', () => {
  it('origin=local ردیف withdrawn را پنهان می‌کند ولی origin=cp فقط فعال‌ها را می‌آورد', async () => {
    const local = await api.get('/api/network-content?origin=local');
    expect(local.status).toBe(200);
    const items = dataOf<NcItem[]>(local);
    expect(items.every((r) => r.origin === 'local' && r.status !== 'withdrawn')).toBe(true);
    expect(metaOf(local).counts.local).toBeGreaterThanOrEqual(1);

    const cp = await api.get('/api/network-content?origin=cp');
    expect(dataOf<NcItem[]>(cp)).toEqual([]); // سینک CP در این آزمون اجرا نشده
  });

  it('فیلتر kind و جست‌وجوی q', async () => {
    const byKind = await api.get('/api/network-content?origin=local&kind=exercise');
    expect(dataOf<NcItem[]>(byKind).every((r) => r.kind === 'exercise')).toBe(true);
    const byQ = await api.get('/api/network-content?origin=local&q=دقت دیداری');
    expect(dataOf<NcItem[]>(byQ).length).toBeGreaterThanOrEqual(1);
  });

  it('گت ردیف‌های cp روی تغییر محلی — سرویس مستقیم: withdraw → 409 (ردیف cp ساختن با SQL مستقیم)', async () => {
    // ردیف cp را مستقیم می‌سازیم (فقط مسیر سینک در پروداکشن این کار را می‌کند)
    await app.db.execute(
      `INSERT INTO network_content (id, kind, title, summary, body, tags, origin, status, source_center, active, created_at, updated_at)
       VALUES ('cp-content-11111111-1111-4111-8111-111111111111', 'plan', 'طرح برگزیدهٔ شبکه', 'خلاصه', 'متن', '[]', 'cp', 'published', 'sanjesh-center', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
    );
    const list = await api.get('/api/network-content?origin=cp');
    const cpItems = dataOf<NcItem[]>(list);
    expect(cpItems.length).toBe(1);
    expect(cpItems[0].sourceCenter).toBe('sanjesh-center');
    expect(metaOf(list).counts.network).toBe(1);

    // لایهٔ دفاع اول در مسیر: شناسهٔ پیشونددار cp-content- اصلاً UUID نیست → 400 در دروازه
    const id = cpItems[0].id;
    expect(await api.post(`/api/network-content/${id}/withdraw`)).toMatchObject({ status: 400 });
    expect(await api.post(`/api/network-content/${id}/queue`)).toMatchObject({ status: 400 });

    // لایهٔ دوم در سرویس: ردیف origin='cp' حتی با UUID معتبر هم قابل تغییر نیست
    const svc = createNetworkContentService({ db: app.db, audit: createAuditWriter(app.db) });
    await expect(svc.withdraw({ id: MANAGER_ID }, '11111111-2222-4333-8444-555555555555')).rejects.toBeInstanceOf(NotFoundError); // آیتم ناموجود
    await app.db.execute(
      `INSERT INTO network_content (id, kind, title, origin, status, active, created_at, updated_at)
       VALUES ('22222222-3333-4333-8444-555555555555', 'doc', 'ردیف cp با UUID', 'cp', 'published', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
    );
    await expect(svc.withdraw({ id: MANAGER_ID }, '22222222-3333-4333-8444-555555555555')).rejects.toBeInstanceOf(ConflictError);
    await expect(svc.queue({ id: MANAGER_ID }, '22222222-3333-4333-8444-555555555555')).rejects.toBeInstanceOf(ConflictError);
  });

  it('ممیزیت ممیزی — ردیف محلی در audit_log ثبت شده است', async () => {
    const rows = app.sql
      .prepare(`SELECT COUNT(*) AS c FROM audit_log WHERE action LIKE 'network_content.%'`)
      .get() as { c: number };
    expect(rows.c).toBeGreaterThanOrEqual(3); // create + queue + withdraw
    void MANAGER_ID;
  });
});

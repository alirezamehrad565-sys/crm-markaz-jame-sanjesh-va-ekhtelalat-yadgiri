import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, asRole, Api, MANAGER_ID } from '../../test/harness';
import { createAuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import { createChunkedD1ObjectStore } from '@core/storage';
import { createClearbookService } from '@domain/clearbook';
import { jalaliToGregorianYmd } from '@core/shared';

function silentLogger(scope = 'it'): Logger {
  const base: Logger = {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    child: (sub) => silentLogger(`${scope}.${sub}`)
  };
  return base;
}

const PNG_BYTES = new TextEncoder().encode('%PNG-fake-clearbook-photo');
const PDF_BYTES = new TextEncoder().encode('%PDF-fake-clearbook-document');

function makeFile(bytes: Uint8Array, name: string, type: string): File {
  return new File([bytes as unknown as ArrayBuffer], name, { type });
}

async function postForm(api: Api, path: string, form: FormData): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = api['token'] as string | null;
  if (token) headers['authorization'] = `Bearer ${token}`;
  const res = await api['testApp'].app.request(path, { method: 'POST', headers, body: form }, api['testApp'].env as never);
  let parsed: unknown = null;
  const text = await res.text();
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  return { status: res.status, body: parsed };
}

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

const MEHR_1_1404 = jalaliToGregorianYmd(1404, 7, 1); // ۲۰۲۵-۰۹-۲۳
const MEHR_7_1404 = jalaliToGregorianYmd(1404, 7, 7);
const ABAN_30_1404 = jalaliToGregorianYmd(1404, 8, 30);
const FARVARDIN_1_1405 = jalaliToGregorianYmd(1405, 1, 1);

describe('کلر بوک مرکز — RBAC', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;
  let secretary: Api;
  let therapist: Api;

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
    secretary = await asRole(A, 'secretary');
    therapist = await asRole(A, 'therapist');
  });

  it('خواندن برای درمانگر و مهمان ممنوع است (۴۰۳/۴۰۱) — کلر بوک فقط دفتر مرکز', async () => {
    expect((await therapist.get('/api/clearbook/entries')).status).toBe(403);
    expect((await therapist.get('/api/clearbook/plans')).status).toBe(403);
    expect((await new Api(A).get('/api/clearbook/entries')).status).toBe(401);
    expect((await manager.get('/api/clearbook/entries')).status).toBe(200);
    expect((await secretary.get('/api/clearbook/plans')).status).toBe(200);
  });

  it('نوشتن برای درمانگر ممنوع است', async () => {
    expect(
      (await therapist.post('/api/clearbook/entries', { title: 'رویداد', event_date: MEHR_1_1404 })).status
    ).toBe(403);
    expect(
      (
        await therapist.post('/api/clearbook/plans', {
          title: 'فاز',
          from_date: MEHR_1_1404
        })
      ).status
    ).toBe(403);
  });
});

describe('کلر بوک مرکز — تقویم اجرایی', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
  });

  it('ایجاد فاز با بازهٔ نامعتبر رد می‌شود (تا قبل از از)', async () => {
    const bad = await manager.post('/api/clearbook/plans', {
      title: 'فاز وارونه',
      from_date: ABAN_30_1404,
      to_date: MEHR_1_1404
    });
    expect(bad.status).toBe(400);
  });

  it('قالب استاندارد ۱۲ فاز را درج می‌کند — تاریخ‌ها شمسی درست به میلادی تبدیل شده‌اند', async () => {
    const seed = await manager.post('/api/clearbook/plans/seed-template', { start_year: 1404 });
    expect(seed.status).toBe(201);
    expect(dataOf<{ count: number }>(seed).count).toBe(12);

    const plans = dataOf<PlanView[]>(await manager.get('/api/clearbook/plans'));
    expect(plans).toHaveLength(12);
    const first = plans.find((p) => p.title === 'سازمان‌دهی و هماهنگی اولیه');
    expect(first).toBeDefined();
    expect(first!.fromDate).toBe(MEHR_1_1404);
    expect(first!.toDate).toBe(MEHR_7_1404);
    expect(first!.status).toBe('planned');
    expect(first!.tag).toBe('سازمان‌دهی');
    expect(first!.evidence.count).toBe(0);

    // درج دوباره در همان بازه تعارض دارد
    const again = await manager.post('/api/clearbook/plans/seed-template', { start_year: 1404 });
    expect(again.status).toBe(409);
  });

  it('کپی تقویم برای سال بعد — تاریخ‌ها یک سال شمسی جابه‌جا و وضعیت‌ها «برنامه‌ریزی‌شده» می‌شوند', async () => {
    // یکی از فازهای ۱۴۰۴ را «در جریان» می‌کنیم — در کپی باید به planned برگردد
    const plans = dataOf<PlanView[]>(await manager.get('/api/clearbook/plans'));
    const target = plans[0];
    await manager.patch(`/api/clearbook/plans/${target.id}`, { status: 'active' });

    const copy = await manager.post('/api/clearbook/plans/copy', { from_year: 1404, to_year: 1405 });
    expect(copy.status).toBe(201);
    expect(dataOf<{ count: number }>(copy).count).toBe(12);

    const plans1405 = dataOf<PlanView[]>(await manager.get('/api/clearbook/plans'));
    const copied = plans1405.find((p) => p.title === 'سازمان‌دهی و هماهنگی اولیه' && p.id !== target.id);
    expect(copied).toBeDefined();
    expect(copied!.fromDate).toBe(jalaliToGregorianYmd(1405, 7, 1));
    expect(copied!.status).toBe('planned');

    // کپی دوباره در سال مقصد تعارض دارد
    const again = await manager.post('/api/clearbook/plans/copy', { from_year: 1404, to_year: 1405 });
    expect(again.status).toBe(409);
  });

  it('به‌روزرسانی وضعیت فاز و حذف فاز — رویدادهای متصل فقط لینکشان پاک می‌شود', async () => {
    const plans = dataOf<PlanView[]>(await manager.get('/api/clearbook/plans'));
    const lone = await manager.post('/api/clearbook/plans', {
      title: 'فاز آزمایشی حذف',
      from_date: FARVARDIN_1_1405,
      to_date: jalaliToGregorianYmd(1405, 1, 31),
      tag: 'آزمایش'
    });
    expect(lone.status).toBe(201);
    const plan = dataOf<PlanView>(lone);

    const entry = await manager.post('/api/clearbook/entries', {
      title: 'فعالیت متصل به فاز',
      event_date: FARVARDIN_1_1405,
      plan_id: plan.id,
      tags: ['آزمایش']
    });
    expect(entry.status).toBe(201);

    const patched = await manager.patch(`/api/clearbook/plans/${plan.id}`, { status: 'done' });
    expect(dataOf<PlanView>(patched).status).toBe('done');

    const del = await manager.delete(`/api/clearbook/plans/${plan.id}`);
    expect(del.status).toBe(200);

    const entries = dataOf<EntryView[]>(await manager.get('/api/clearbook/entries?tag=آزمایش'));
    const still = entries.find((e) => e.title === 'فعالیت متصل به فاز');
    expect(still).toBeDefined();
    expect(still!.planId).toBeNull(); // فقط لینک پاک شده، خود رویداد باقی است

    // مرتب‌سازی دستی
    const reorder = await manager.post('/api/clearbook/plans/reorder', { ids: plans.map((p) => p.id).reverse() });
    expect(reorder.status).toBe(200);
  });
});

interface PlanView {
  id: string;
  title: string;
  fromDate: string;
  toDate: string | null;
  status: string;
  tag: string | null;
  evidence: { count: number; thumbs: { entryId: string; fileId: string }[] };
}

interface EntryView {
  id: string;
  planId: string | null;
  title: string;
  eventDate: string;
  tags: string[];
  attachments: { id: string; filename: string; mime: string; size: number; kind: string; caption: string | null }[];
}

describe('کلر بوک مرکز — رویدادها و پیوست‌ها', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;
  let secretary: Api;
  let therapist: Api;
  let planId: string;

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
    secretary = await asRole(A, 'secretary');
    therapist = await asRole(A, 'therapist');
    const plan = await manager.post('/api/clearbook/plans', {
      title: 'شروع سنجش بدو ورود',
      from_date: MEHR_1_1404,
      to_date: ABAN_30_1404,
      tag: 'سنجش بدو ورود'
    });
    planId = dataOf<PlanView>(plan).id;
  });

  async function makeEntry(title: string, overrides: Record<string, unknown> = {}): Promise<EntryView> {
    const res = await manager.post('/api/clearbook/entries', {
      title,
      event_date: MEHR_7_1404,
      tags: ['سنجش بدو ورود'],
      plan_id: planId,
      ...overrides
    });
    expect(res.status).toBe(201);
    return dataOf<EntryView>(res);
  }

  it('ایجاد رویداد با برچسب تکراری — برچسب‌ها یکدست و بدون تکرار ذخیره می‌شوند', async () => {
    const entry = await makeEntry('جلسه هماهنگی با اداره', { tags: ['سنجش بدو ورود', 'سنجش  بدو ورود ', 'جلسه'] });
    expect(entry.tags.sort()).toEqual(['جلسه', 'سنجش بدو ورود']);
  });

  it('فیلتر بازهٔ زمانی + برچسب + جستجو + فاز', async () => {
    await makeEntry('کارگاه آموزش آموزگاران', { event_date: ABAN_30_1404, tags: ['کارگاه'], plan_id: null });
    await makeEntry('بازدید مهدکودک', { event_date: FARVARDIN_1_1405, tags: ['بازدید'] });

    const autumn = dataOf<EntryView[]>(await manager.get(`/api/clearbook/entries?from=${MEHR_1_1404}&to=${ABAN_30_1404}`));
    expect(autumn.map((e) => e.title)).toContain('جلسه هماهنگی با اداره');
    expect(autumn.map((e) => e.title)).not.toContain('بازدید مهدکودک');

    const byTag = dataOf<EntryView[]>(await manager.get('/api/clearbook/entries?tag=کارگاه'));
    expect(byTag).toHaveLength(1);
    expect(byTag[0].title).toBe('کارگاه آموزش آموزگاران');

    const byQ = dataOf<EntryView[]>(await manager.get('/api/clearbook/entries?q=آموزگاران'));
    expect(byQ).toHaveLength(1);

    const byPlan = dataOf<EntryView[]>(await manager.get(`/api/clearbook/entries?plan_id=${planId}`));
    expect(byPlan.every((e) => e.planId === planId)).toBe(true);
    expect(byPlan.length).toBeGreaterThanOrEqual(2);

    // فیلتر برچسب بی‌معنا خالی برمی‌گردد نه خطا
    expect((await manager.get('/api/clearbook/entries?tag=ناموجود')).status).toBe(200);
  });

  it('برچسب‌ها و سال‌ها برای فیلترهای خط زمانی آماده می‌شوند', async () => {
    const tags = dataOf<{ tag: string; count: number }[]>(await manager.get('/api/clearbook/tags'));
    expect(tags.find((t) => t.tag === 'سنجش بدو ورود')?.count).toBeGreaterThanOrEqual(1);
    const years = dataOf<number[]>(await manager.get('/api/clearbook/years'));
    expect(years).toContain(1404); // سال تحصیلی: فروردین ۱۴۰۵ هم زیر ۱۴۰۴ می‌نشیند
    expect(years).not.toContain(1405);
  });

  it('آپلود چندفایلی multipart — عکس (image) و سند (doc) در یک درخواست؛ دانلود inline/attachment درست', async () => {
    const entry = await makeEntry('رویداد با پیوست');
    const form = new FormData();
    form.append('files', makeFile(PNG_BYTES, 'aks-jashn.png', 'image/png'));
    form.append('files', makeFile(PDF_BYTES, 'gozaresh.pdf', 'application/pdf'));
    const up = await postForm(manager, `/api/clearbook/entries/${entry.id}/files`, form);
    expect(up.status).toBe(201);
    const rec = dataOf<EntryView>(up);
    expect(rec.attachments).toHaveLength(2);
    const img = rec.attachments.find((a) => a.filename === 'aks-jashn.png')!;
    const doc = rec.attachments.find((a) => a.filename === 'gozaresh.pdf')!;
    expect(img.kind).toBe('image');
    expect(doc.kind).toBe('doc');

    const headers = { authorization: `Bearer ${(manager as unknown as { token: string }).token}` };
    const dlImg = await A.app.request(`/api/clearbook/entries/${entry.id}/files/${img.id}`, { headers }, A.env as never);
    expect(dlImg.status).toBe(200);
    expect(await dlImg.text()).toBe('%PNG-fake-clearbook-photo');
    expect(dlImg.headers.get('content-disposition')).toContain('inline'); // عکس برای <img> آماده است

    const dlDoc = await A.app.request(`/api/clearbook/entries/${entry.id}/files/${doc.id}`, { headers }, A.env as never);
    expect(dlDoc.headers.get('content-disposition')).toContain('attachment');

    // درمانگر فایل را نمی‌تواند ببیند
    const therHeaders = { authorization: `Bearer ${(therapist as unknown as { token: string }).token}` };
    const blocked = await A.app.request(`/api/clearbook/entries/${entry.id}/files/${img.id}`, { headers: therHeaders }, A.env as never);
    expect(blocked.status).toBe(403);
  });

  it('کپشن اختیاری عکس — ثبت، ویرایش و حذف', async () => {
    const entry = await makeEntry('رویداد کپشن‌دار');
    const form = new FormData();
    form.append('files', makeFile(PNG_BYTES, 'aks.png', 'image/png'));
    const up = await postForm(manager, `/api/clearbook/entries/${entry.id}/files`, form);
    const fileId = dataOf<EntryView>(up).attachments[0].id;

    const setCap = await manager.patch(`/api/clearbook/entries/${entry.id}/files/${fileId}`, { caption: 'موقع اجرای کارگاه' });
    expect(setCap.status).toBe(200);
    expect(dataOf<EntryView>(setCap).attachments[0].caption).toBe('موقع اجرای کارگاه');

    const clearCap = await manager.patch(`/api/clearbook/entries/${entry.id}/files/${fileId}`, { caption: null });
    expect(dataOf<EntryView>(clearCap).attachments[0].caption).toBeNull();

    // منشی هم مجاز است؛ درمانگر ممنوع
    const secForm = new FormData();
    secForm.append('files', makeFile(PNG_BYTES, 's.png', 'image/png'));
    expect((await postForm(secretary, `/api/clearbook/entries/${entry.id}/files`, secForm)).status).toBe(201);
    expect((await therapist.patch(`/api/clearbook/entries/${entry.id}/files/${fileId}`, { caption: 'x' })).status).toBe(403);
  });

  it('نوع نامجاز رد می‌شود', async () => {
    const entry = await makeEntry('رویداد فایل بد');
    const form = new FormData();
    form.append('files', makeFile(new TextEncoder().encode('MZ-fake'), 'setup.exe', 'application/x-msdownload'));
    const up = await postForm(manager, `/api/clearbook/entries/${entry.id}/files`, form);
    expect(up.status).toBe(400);
    expect(JSON.stringify(up.body)).toContain('نوع فایل مجاز نیست');
  });

  it('بارگذاری تکه‌ای فایل بزرگ (۲.۵ مگابایت) — مونتاژ سالم + ناقص ۴۰۹', async () => {
    const entry = await makeEntry('رویداد فایل بزرگ');
    const big = new Uint8Array(Math.floor(2.5 * 1024 * 1024));
    let seed = 123456789;
    for (let i = 0; i < big.length; i += 1) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      big[i] = seed & 0xff;
    }

    const begin = await manager.post(`/api/clearbook/entries/${entry.id}/files/begin`, {
      filename: 'album-bozorg.pdf',
      mime: 'application/pdf',
      size: big.length
    });
    expect(begin.status).toBe(201);
    const fileId = dataOf<{ fileId: string }>(begin).fileId;

    const headers: Record<string, string> = {
      authorization: `Bearer ${(manager as unknown as { token: string }).token}`,
      'content-type': 'application/octet-stream'
    };
    const CHUNK = 1024 * 1024;
    const chunks = Math.ceil(big.length / CHUNK);
    for (let seq = 0; seq < chunks; seq += 1) {
      const piece = big.subarray(seq * CHUNK, Math.min((seq + 1) * CHUNK, big.length));
      const res = await A.app.request(
        `/api/clearbook/entries/${entry.id}/files/${fileId}/chunks/${seq}`,
        { method: 'PUT', headers, body: piece as unknown as BodyInit },
        A.env as never
      );
      expect(res.status).toBe(200);
    }

    const complete = await manager.post(`/api/clearbook/entries/${entry.id}/files/${fileId}/complete`, {});
    expect(complete.status).toBe(200);
    const att = dataOf<EntryView>(complete).attachments.find((a) => a.id === fileId)!;
    expect(att.size).toBe(big.length);

    const svc = createClearbookService({
      db: A.db,
      audit: createAuditWriter(A.db),
      logger: silentLogger('chunk'),
      storage: createChunkedD1ObjectStore(A.db)
    });
    const fetched = await svc.getAttachmentFile(entry.id, fileId);
    expect(fetched).not.toBeNull();
    expect(fetched!.bytes.length).toBe(big.length);
    let same = true;
    for (let i = 0; i < big.length; i += 4096) {
      if (fetched!.bytes[i] !== big[i]) { same = false; break; }
    }
    expect(same).toBe(true);

    // ناقص: فایل تازه با حجم اعلامی بزرگ‌تر ولی تکهٔ کم
    const begin2 = await manager.post(`/api/clearbook/entries/${entry.id}/files/begin`, {
      filename: 'nages.pdf',
      mime: 'application/pdf',
      size: 2 * 1024 * 1024
    });
    const fileId2 = dataOf<{ fileId: string }>(begin2).fileId;
    const res = await A.app.request(
      `/api/clearbook/entries/${entry.id}/files/${fileId2}/chunks/0`,
      { method: 'PUT', headers, body: new Uint8Array(1024 * 1024) as unknown as BodyInit },
      A.env as never
    );
    expect(res.status).toBe(200);
    const incomplete = await manager.post(`/api/clearbook/entries/${entry.id}/files/${fileId2}/complete`, {});
    expect(incomplete.status).toBe(409);
  });

  it('حذف رویداد — پیوست‌ها و قطعه‌های ذخیره‌ساز هم پاک می‌شوند', async () => {
    const entry = await makeEntry('رویداد حذف کامل');
    const form = new FormData();
    form.append('files', makeFile(PDF_BYTES, 'hamrah.pdf', 'application/pdf'));
    const up = await postForm(manager, `/api/clearbook/entries/${entry.id}/files`, form);
    expect(up.status).toBe(201);
    expect(
      (A.sql.prepare('SELECT COUNT(*) AS n FROM exercise_file_chunks WHERE key LIKE ?').get(`clearbook/${entry.id}/%`) as { n: number }).n
    ).toBeGreaterThan(0);

    const del = await manager.delete(`/api/clearbook/entries/${entry.id}`);
    expect(del.status).toBe(200);
    expect((A.sql.prepare('SELECT COUNT(*) AS n FROM clearbook_attachments WHERE entry_id = ?').get(entry.id) as { n: number }).n).toBe(0);
    expect((A.sql.prepare('SELECT COUNT(*) AS n FROM exercise_file_chunks WHERE key LIKE ?').get(`clearbook/${entry.id}/%`) as { n: number }).n).toBe(0);
    expect((A.sql.prepare('SELECT COUNT(*) AS n FROM clearbook_entry_tags WHERE entry_id = ?').get(entry.id) as { n: number }).n).toBe(0);
  });

  it('شواهد فاز — تعداد و بندانگشتی عکس‌ها در فهرست فازها', async () => {
    const entry = await makeEntry('فعالیت با عکس برای شواهد');
    const form = new FormData();
    for (let i = 0; i < 2; i += 1) form.append('files', makeFile(PNG_BYTES, `aks${i}.png`, 'image/png'));
    await postForm(manager, `/api/clearbook/entries/${entry.id}/files`, form);

    const plans = dataOf<PlanView[]>(await manager.get('/api/clearbook/plans'));
    const plan = plans.find((p) => p.id === planId)!;
    expect(plan.evidence.count).toBeGreaterThanOrEqual(1);
    expect(plan.evidence.thumbs.length).toBeGreaterThanOrEqual(1);
    expect(plan.evidence.thumbs.length).toBeLessThanOrEqual(3);
    // دو عکس همین رویداد آخرین بارگذاری‌ها هستند → بالای فهرست بندانگشتی
    expect(plan.evidence.thumbs[0].entryId).toBe(entry.id);
    expect(plan.evidence.thumbs[1].entryId).toBe(entry.id);
  });

  it(' audit — هر تغییر در دفتر رخداد ثبت کرده است', async () => {
    const rows = A.sql
      .prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE action LIKE 'clearbook.%'`)
      .get() as { n: number };
    expect(rows.n).toBeGreaterThan(5);
    const byManager = A.sql
      .prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE action LIKE 'clearbook.%' AND actor_id = ?`)
      .get(MANAGER_ID) as { n: number };
    expect(byManager.n).toBeGreaterThan(5);
  });
});

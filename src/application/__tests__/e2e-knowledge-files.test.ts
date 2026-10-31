import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, asRole, Api } from '../../test/harness';
import { createAuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import { createChunkedD1ObjectStore } from '@core/storage';
import { createKnowledgeService } from '@domain/knowledge';

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

const PNG_BYTES = new TextEncoder().encode('%PNG-fake-article-figure');
const PDF_BYTES = new TextEncoder().encode('%PDF-fake-protocol-document');
const EXE_BYTES = new TextEncoder().encode('MZ-fake-executable');

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

interface FileView {
  id: string;
  filename: string;
  mime: string;
  size: number;
}

interface KnowledgeView {
  id: string;
  title: string;
  published: boolean;
  attachments: FileView[];
}

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

describe('پیوست فایل/تصویر مقالهٔ دانش', () => {
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

  it('آپلود چندفایلی multipart — تصویر + PDF در یک درخواست؛ فهرست‌ها پیوست را نشان می‌دهند', async () => {
    const created = await manager.post('/api/knowledge', {
      title: 'راهنمای ارزیابی نوآموزان',
      body: 'چک‌لیست و نمودار همراه مقاله پیوست شده است.',
      category: 'protocol',
      published: true
    });
    expect(created.status).toBe(201);
    const knId = dataOf<KnowledgeView>(created).id;
    expect(dataOf<KnowledgeView>(created).attachments).toEqual([]);

    const form = new FormData();
    form.append('files', makeFile(PNG_BYTES, 'nemudar.png', 'image/png'));
    form.append('files', makeFile(PDF_BYTES, 'rahnama.pdf', 'application/pdf'));

    const up = await postForm(manager, `/api/knowledge/${knId}/files`, form);
    expect(up.status).toBe(201);
    const rec = dataOf<KnowledgeView>(up);
    expect(rec.attachments).toHaveLength(2);
    expect(rec.attachments[0].filename).toBe('nemudar.png');
    expect(rec.attachments[0].mime).toBe('image/png');
    expect(rec.attachments[1].filename).toBe('rahnama.pdf');

    const manage = dataOf<KnowledgeView[]>(await manager.get('/api/knowledge/manage'));
    expect(manage.find((k) => k.id === knId)?.attachments).toHaveLength(2);
    const pub = dataOf<KnowledgeView[]>(await therapist.get('/api/knowledge'));
    expect(pub.find((k) => k.id === knId)?.attachments).toHaveLength(2);
  });

  it('دانلود تکی پیوست — بایت به‌بایت درست + ۴۰۴ برای شناسهٔ غریبه', async () => {
    const created = await manager.post('/api/knowledge', { title: 'مقالهٔ دانلود', body: 'متن مقاله' });
    const knId = dataOf<KnowledgeView>(created).id;
    const form = new FormData();
    form.append('files', makeFile(PDF_BYTES, 'gharardad.pdf', 'application/pdf'));
    const up = await postForm(manager, `/api/knowledge/${knId}/files`, form);
    const att = dataOf<KnowledgeView>(up).attachments[0];

    const headers = { authorization: `Bearer ${(manager as unknown as { token: string }).token}` };
    const dl = await A.app.request(`/api/knowledge/${knId}/files/${att.id}`, { headers }, A.env as never);
    expect(dl.status).toBe(200);
    expect(await dl.text()).toBe('%PDF-fake-protocol-document');
    expect(dl.headers.get('content-type')).toBe('application/pdf');
    expect(dl.headers.get('content-disposition')).toContain('attachment');

    const bad = await A.app.request(`/api/knowledge/${knId}/files/00000000-0000-4000-8000-0000000000ff`, { headers }, A.env as never);
    expect(bad.status).toBe(404);
  });

  it('دانلود برای همهٔ همکاران احرازشده (درمانگر) آزاد است — مثل خواندن مقاله', async () => {
    const created = await manager.post('/api/knowledge', { title: 'مقالهٔ مشترک', body: 'متن مقاله' });
    const knId = dataOf<KnowledgeView>(created).id;
    const form = new FormData();
    form.append('files', makeFile(PNG_BYTES, 'aks.png', 'image/png'));
    const up = await postForm(manager, `/api/knowledge/${knId}/files`, form);
    const att = dataOf<KnowledgeView>(up).attachments[0];

    const headers = { authorization: `Bearer ${(therapist as unknown as { token: string }).token}` };
    const dl = await A.app.request(`/api/knowledge/${knId}/files/${att.id}`, { headers }, A.env as never);
    expect(dl.status).toBe(200);
    expect(await dl.text()).toBe('%PNG-fake-article-figure');
  });

  it('حذف پیوست — قطعه‌های ذخیرهٔ همان فایل هم پاک می‌شوند', async () => {
    const created = await manager.post('/api/knowledge', { title: 'مقالهٔ حذف پیوست', body: 'متن مقاله' });
    const knId = dataOf<KnowledgeView>(created).id;
    const form = new FormData();
    form.append('files', makeFile(PNG_BYTES, 'yeki.png', 'image/png'));
    form.append('files', makeFile(PDF_BYTES, 'dovi.pdf', 'application/pdf'));
    const up = await postForm(manager, `/api/knowledge/${knId}/files`, form);
    const atts = dataOf<KnowledgeView>(up).attachments;
    expect(atts).toHaveLength(2);

    const del = await manager.delete(`/api/knowledge/${knId}/files/${atts[1].id}`);
    expect(del.status).toBe(200);
    expect(dataOf<KnowledgeView>(del).attachments).toHaveLength(1);
    expect(dataOf<KnowledgeView>(del).attachments[0].filename).toBe('yeki.png');

    const chunks = A.sql.prepare('SELECT COUNT(*) AS n FROM exercise_file_chunks WHERE key LIKE ?').get(`knowledge/${knId}/%`) as { n: number };
    expect(chunks.n).toBe(1); // فقط قطعه‌های پیوست باقی‌مانده
  });

  it('RBAC پیوست — درمانگر آپلود/حذف ندارد (۴۰۳)؛ منشی آپلود دارد؛ مهمان ۴۰۱', async () => {
    const created = await manager.post('/api/knowledge', { title: 'دسترسی پیوست', body: 'متن مقاله' });
    const knId = dataOf<KnowledgeView>(created).id;

    const therForm = new FormData();
    therForm.append('files', makeFile(PNG_BYTES, 't.png', 'image/png'));
    expect((await postForm(therapist, `/api/knowledge/${knId}/files`, therForm)).status).toBe(403);

    const secForm = new FormData();
    secForm.append('files', makeFile(PNG_BYTES, 's.png', 'image/png'));
    const secUp = await postForm(secretary, `/api/knowledge/${knId}/files`, secForm);
    expect(secUp.status).toBe(201);
    const attId = dataOf<KnowledgeView>(secUp).attachments[0].id;

    const anonForm = new FormData();
    anonForm.append('files', makeFile(PNG_BYTES, 'x.png', 'image/png'));
    expect((await postForm(new Api(A), `/api/knowledge/${knId}/files`, anonForm)).status).toBe(401);

    expect((await therapist.delete(`/api/knowledge/${knId}/files/${attId}`)).status).toBe(403);
    expect((await secretary.delete(`/api/knowledge/${knId}/files/${attId}`)).status).toBe(200);
  });

  it('نوع نامجاز (اجرایی) رد می‌شود — همان مرز تمرین‌ها', async () => {
    const created = await manager.post('/api/knowledge', { title: 'مقالهٔ نوع', body: 'متن مقاله' });
    const knId = dataOf<KnowledgeView>(created).id;
    const form = new FormData();
    form.append('files', makeFile(EXE_BYTES, 'setup.exe', 'application/x-msdownload'));
    const up = await postForm(manager, `/api/knowledge/${knId}/files`, form);
    expect(up.status).toBe(400);
    expect(JSON.stringify(up.body)).toContain('نوع فایل مجاز نیست');
  });

  it('سقف تعداد فایل هر بار بارگذاری (۱۰) و هر مقاله (۲۰) — همان تمرین‌ها', async () => {
    const created = await manager.post('/api/knowledge', { title: 'مقالهٔ سقف', body: 'متن مقاله' });
    const knId = dataOf<KnowledgeView>(created).id;

    const many = new FormData();
    for (let i = 0; i < 11; i += 1) many.append('files', makeFile(PNG_BYTES, `f${i}.png`, 'image/png'));
    const up = await postForm(manager, `/api/knowledge/${knId}/files`, many);
    expect(up.status).toBe(400);
    expect(JSON.stringify(up.body)).toContain('حداکثر 10 فایل');

    const svc = createKnowledgeService({
      db: A.db,
      audit: createAuditWriter(A.db),
      logger: silentLogger('cap'),
      storage: createChunkedD1ObjectStore(A.db)
    });
    const actor = { staffId: '00000000-0000-0000-0000-000000000001', role: 'manager' } as never;
    const small = (from: number, to: number) =>
      Array.from({ length: to - from }, (_, i) => ({
        filename: `s${from + i}.png`,
        mimeType: 'image/png',
        segments: [PNG_BYTES],
        size: PNG_BYTES.length
      }));
    await svc.addFiles(knId, small(0, 10), actor);
    await svc.addFiles(knId, small(10, 19), actor);
    await expect(
      svc.addFiles(knId, [{ filename: 'over.png', mimeType: 'image/png', segments: [PNG_BYTES], size: PNG_BYTES.length }, { filename: 'over2.png', mimeType: 'image/png', segments: [PNG_BYTES], size: PNG_BYTES.length }], actor)
    ).rejects.toThrow('حداکثر 20 فایل');
  });

  it('بارگذاری پیوستهٔ تکه‌ای فایل بزرگ (۴ مگابایت) — مونتاژ سالم و دانلود درست', async () => {
    const created = await manager.post('/api/knowledge', { title: 'مقالهٔ فایل بزرگ', body: 'راهنمای چندصفحه‌ای' });
    const knId = dataOf<KnowledgeView>(created).id;

    const big = new Uint8Array(4 * 1024 * 1024);
    let seed = 987654321;
    for (let i = 0; i < big.length; i += 1) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      big[i] = seed & 0xff;
    }

    const begin = await manager.post(`/api/knowledge/${knId}/files/begin`, { filename: 'rasane-bozorg.pdf', mime: 'application/pdf', size: big.length });
    expect(begin.status).toBe(201);
    const fileId = dataOf<{ fileId: string }>(begin).fileId;

    const headers: Record<string, string> = {
      authorization: `Bearer ${(manager as unknown as { token: string }).token}`,
      'content-type': 'application/octet-stream'
    };
    for (let seq = 0; seq < 4; seq += 1) {
      const piece = big.subarray(seq * 1024 * 1024, (seq + 1) * 1024 * 1024);
      const res = await A.app.request(`/api/knowledge/${knId}/files/${fileId}/chunks/${seq}`, { method: 'PUT', headers, body: piece as unknown as BodyInit }, A.env as never);
      expect(res.status).toBe(200);
    }

    const complete = await manager.post(`/api/knowledge/${knId}/files/${fileId}/complete`, {});
    expect(complete.status).toBe(200);
    const att = dataOf<KnowledgeView>(complete).attachments;
    expect(att).toHaveLength(1);
    expect(att[0].filename).toBe('rasane-bozorg.pdf');
    expect(att[0].size).toBe(big.length);

    const svc = createKnowledgeService({
      db: A.db,
      audit: createAuditWriter(A.db),
      logger: silentLogger('chunk'),
      storage: createChunkedD1ObjectStore(A.db)
    });
    const fetched = await svc.getAttachmentFile(knId, att[0].id);
    expect(fetched).not.toBeNull();
    expect(fetched!.bytes.length).toBe(big.length);
    let same = true;
    for (let i = 0; i < big.length; i += 4096) {
      if (fetched!.bytes[i] !== big[i]) { same = false; break; }
    }
    expect(same).toBe(true);
  });

  it('تکه‌های ناقص در complete رد می‌شوند (۴۰۹)', async () => {
    const created = await manager.post('/api/knowledge', { title: 'مقالهٔ ناقص', body: 'متن' });
    const knId = dataOf<KnowledgeView>(created).id;
    const begin = await manager.post(`/api/knowledge/${knId}/files/begin`, { filename: 'nages.pdf', mime: 'application/pdf', size: 2 * 1024 * 1024 });
    const fileId = dataOf<{ fileId: string }>(begin).fileId;

    const headers: Record<string, string> = {
      authorization: `Bearer ${(manager as unknown as { token: string }).token}`,
      'content-type': 'application/octet-stream'
    };
    const res = await A.app.request(`/api/knowledge/${knId}/files/${fileId}/chunks/0`, { method: 'PUT', headers, body: new Uint8Array(1024 * 1024) as unknown as BodyInit }, A.env as never);
    expect(res.status).toBe(200);

    const complete = await manager.post(`/api/knowledge/${knId}/files/${fileId}/complete`, {});
    expect(complete.status).toBe(409);
  });

  it('حذف مقاله — پیوست‌های آن هم از ذخیره‌ساز پاک می‌شوند', async () => {
    const created = await manager.post('/api/knowledge', { title: 'مقالهٔ حذف کامل', body: 'متن' });
    const knId = dataOf<KnowledgeView>(created).id;
    const form = new FormData();
    form.append('files', makeFile(PDF_BYTES, 'hamrah.pdf', 'application/pdf'));
    const up = await postForm(manager, `/api/knowledge/${knId}/files`, form);
    expect(up.status).toBe(201);
    expect((A.sql.prepare('SELECT COUNT(*) AS n FROM exercise_file_chunks WHERE key LIKE ?').get(`knowledge/${knId}/%`) as { n: number }).n).toBeGreaterThan(0);

    const del = await manager.delete(`/api/knowledge/${knId}`);
    expect(del.status).toBe(200);
    expect((A.sql.prepare('SELECT COUNT(*) AS n FROM knowledge_attachments WHERE knowledge_id = ?').get(knId) as { n: number }).n).toBe(0);
    expect((A.sql.prepare('SELECT COUNT(*) AS n FROM exercise_file_chunks WHERE key LIKE ?').get(`knowledge/${knId}/%`) as { n: number }).n).toBe(0);
  });
});

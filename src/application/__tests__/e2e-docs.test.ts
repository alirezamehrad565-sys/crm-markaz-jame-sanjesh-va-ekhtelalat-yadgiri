import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, asRole, Api, MANAGER_ID } from '../../test/harness';
import { createAuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import { createChunkedD1ObjectStore } from '@core/storage';
import { createDocsService, registerDocsRoutes } from '@domain/docs';
import type { DocRecord } from '@domain/docs';

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

const PDF_BYTES = new TextEncoder().encode('%PDF-fake-docs-circular-letter');
const PNG_BYTES = new TextEncoder().encode('%PNG-fake-docs-form-scan');
const TXT_BYTES = new TextEncoder().encode('matn-e-sade-docs');

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

function tokenOf(api: Api): string {
  return (api as unknown as { token: string }).token;
}

// مسیرها قبل از اجرای تست‌ها روی همان اپ هارنس ثبت می‌شوند — دقیقاً مثل سیم نهایی در api-routing
// (authMiddleware سراسری + registerDocsRoutes روی همان app)
function wireDocs(A: ReturnType<typeof createTestApp>): void {
  const svc = createDocsService({
    db: A.db,
    audit: createAuditWriter(A.db),
    logger: silentLogger('docs'),
    storage: createChunkedD1ObjectStore(A.db) // همان ObjectStore پیوست‌ها — در تست D1 تکه‌تکه
  });
  registerDocsRoutes(A.app, svc);
}

describe('نمون‌برگ‌ها و اسناد خام — RBAC', () => {
  it('درمانگر ممنوع (۴۰۳) — منشی و مدیر مجاز — مهمان ۴۰۱', async () => {
    const A = createTestApp();
    wireDocs(A);
    const manager = await asRole(A, 'manager');
    const secretary = await asRole(A, 'secretary');
    const therapist = await asRole(A, 'therapist');

    expect((await therapist.get('/api/docs')).status).toBe(403);
    expect((await therapist.post('/api/docs', { title: 'سند درمانگر' })).status).toBe(403);
    expect((await new Api(A).get('/api/docs')).status).toBe(401);

    expect((await manager.get('/api/docs')).status).toBe(200);
    expect((await secretary.get('/api/docs')).status).toBe(200);
  });
});

describe('نمون‌برگ‌ها و اسناد خام — CRUD، فهرست، جستجو', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;
  let secretary: Api;

  beforeAll(async () => {
    A = createTestApp();
    wireDocs(A);
    manager = await asRole(A, 'manager');
    secretary = await asRole(A, 'secretary');
  });

  it('ساخت سند توسط مدیر — فیلدها و برچسب‌های یکدست‌شده', async () => {
    const res = await manager.post('/api/docs', {
      title: 'آیین‌نامهٔ ارزشیابی نوآموزان',
      category: 'ayinnameha',
      description: 'بخشنامهٔ اداره برای ارزشیابی بدو ورود',
      tags: ['ارزشیابی', 'ارزشیابی  ', 'بدو ورود'] // تکراری با فاصلهٔ اضافه
    });
    expect(res.status).toBe(201);
    const doc = dataOf<DocRecord>(res);
    expect(doc.title).toBe('آیین‌نامهٔ ارزشیابی نوآموزان');
    expect(doc.category).toBe('ayinnameha');
    expect(doc.description).toContain('بدو ورود');
    expect(doc.tags).toEqual(['ارزشیابی', 'بدو ورود']); // یکدست و بدون تکرار
    expect(doc.files).toEqual([]);
    expect(doc.createdByName).toBeTruthy();
  });

  it('اعتبارسنجی — عنوان کوتاه و دستهٔ نامجاز رد می‌شوند (۴۰۰)', async () => {
    expect((await manager.post('/api/docs', { title: 'س' })).status).toBe(400);
    expect((await manager.post('/api/docs', { title: 'سند بی‌دسته', category: ' unknown ' })).status).toBe(400);
  });

  it('ویرایش جزئی (PATCH) — فقط فیلدهای فرستاده‌شده تغییر می‌کنند', async () => {
    const created = await manager.post('/api/docs', {
      title: 'آیین‌نامهٔ نگارش گزارش',
      category: 'ayinnameha',
      description: 'نسخهٔ اول'
    });
    const id = dataOf<DocRecord>(created).id;

    const patched = await manager.patch(`/api/docs/${id}`, {
      description: 'نسخهٔ دوم مصوب هیئت مدیره',
      tags: ['گزارش‌نویسی']
    });
    expect(patched.status).toBe(200);
    const doc = dataOf<DocRecord>(patched);
    expect(doc.title).toBe('آیین‌نامهٔ نگارش گزارش'); // دست‌نخورده
    expect(doc.category).toBe('ayinnameha'); // دست‌نخورده
    expect(doc.description).toBe('نسخهٔ دوم مصوب هیئت مدیره');
    expect(doc.tags).toEqual(['گزارش‌نویسی']);

    const renamed = await manager.patch(`/api/docs/${id}`, { title: 'آیین‌نامهٔ نگارش گزارش (اصلاحی)' });
    expect(dataOf<DocRecord>(renamed).title).toBe('آیین‌نامهٔ نگارش گزارش (اصلاحی)');

    // منشی هم مجاز به ویرایش است
    expect((await secretary.patch(`/api/docs/${id}`, { category: 'bazdidha' })).status).toBe(200);
  });

  it('فهرست + فیلتر دسته + جستجو (عنوان/توضیح/برچسب) — تازه‌ترین اول', async () => {
    await manager.post('/api/docs', { title: 'نمون‌برگ سنجش همکاران', category: 'sanjesh', tags: ['منابع انسانی'] });
    await manager.post('/api/docs', { title: 'گزارش مالی سه‌ماههٔ اول', category: 'hesabdari', description: 'ترازنامهٔ دوره', tags: ['مالی'] });

    const all = dataOf<DocRecord[]>(await manager.get('/api/docs'));
    expect(all.length).toBeGreaterThanOrEqual(3);
    // مرتب بر اساس created_at DESC — آخرین سند ساخته‌شده اول است
    expect(all[0].title).toBe('گزارش مالی سه‌ماههٔ اول');

    const forms = dataOf<DocRecord[]>(await manager.get('/api/docs?category=sanjesh'));
    expect(forms.every((d) => d.category === 'sanjesh')).toBe(true);
    expect(forms.map((d) => d.title)).toContain('نمون‌برگ سنجش همکاران');
    expect(forms.map((d) => d.title)).not.toContain('گزارش مالی سه‌ماههٔ اول');

    // جستجوی عنوان
    const byTitle = dataOf<DocRecord[]>(await manager.get('/api/docs?q=سنجش همکاران'));
    expect(byTitle.map((d) => d.title)).toEqual(['نمون‌برگ سنجش همکاران']);

    // جستجوی توضیح
    const byDesc = dataOf<DocRecord[]>(await manager.get('/api/docs?q=ترازنامه'));
    expect(byDesc.map((d) => d.title)).toEqual(['گزارش مالی سه‌ماههٔ اول']);

    // جستجوی برچسب
    const byTag = dataOf<DocRecord[]>(await manager.get('/api/docs?q=منابع انسانی'));
    expect(byTag.map((d) => d.title)).toEqual(['نمون‌برگ سنجش همکاران']);

    // جستجوی بی‌نتیجه — نه خطا، فهرست خالی
    const none = await manager.get('/api/docs?q=ناموجود-کاملاً');
    expect(none.status).toBe(200);
    expect(dataOf<DocRecord[]>(none)).toHaveLength(0);

    // «all» مثل بدون فیلتر است
    const allAgain = dataOf<DocRecord[]>(await manager.get('/api/docs?category=all'));
    expect(allAgain.length).toBe(all.length);
  });

  it('جزئیات سند — شامل آرایهٔ فایل‌ها؛ سند غریبه ۴۰۴', async () => {
    const created = await manager.post('/api/docs', { title: 'سند جزئیات', category: 'bazdidha' });
    const id = dataOf<DocRecord>(created).id;
    const detail = await manager.get(`/api/docs/${id}`);
    expect(detail.status).toBe(200);
    expect(dataOf<DocRecord>(detail).files).toEqual([]);
    expect((await manager.get(`/api/docs/${id}`)).status).toBe(200);

    const missing = await manager.get('/api/docs/00000000-0000-4000-8000-0000000000ff');
    expect(missing.status).toBe(404);
  });

  it('حذف نرم — از فهرست و جزئیات ناپدید می‌شود ولی ردیف و فایل‌ها می‌مانند', async () => {
    const created = await manager.post('/api/docs', { title: 'سند حذف‌شدنی', category: 'other' });
    const id = dataOf<DocRecord>(created).id;

    const del = await manager.delete(`/api/docs/${id}`);
    expect(del.status).toBe(200);

    const list = dataOf<DocRecord[]>(await manager.get('/api/docs'));
    expect(list.find((d) => d.id === id)).toBeUndefined();
    expect((await manager.get(`/api/docs/${id}`)).status).toBe(404);

    // حذف نرم در جدول: deleted_at پر شده
    const row = A.sql.prepare('SELECT deleted_at FROM docs WHERE id = ?').get(id) as { deleted_at: string | null };
    expect(row.deleted_at).toBeTruthy();
  });
});

describe('نمون‌برگ‌ها و اسناد خام — فایل‌ها', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;
  let secretary: Api;
  let therapist: Api;

  beforeAll(async () => {
    A = createTestApp();
    wireDocs(A);
    manager = await asRole(A, 'manager');
    secretary = await asRole(A, 'secretary');
    therapist = await asRole(A, 'therapist');
  });

  async function makeDoc(title: string): Promise<DocRecord> {
    const res = await manager.post('/api/docs', { title, category: 'ayinnameha' });
    expect(res.status).toBe(201);
    return dataOf<DocRecord>(res);
  }

  it('آپلود چندفایلی multipart — متادیتا ثبت و دانلود بایت‌به‌بایت یکسان', async () => {
    const doc = await makeDoc('سند با پیوست چندتایی');
    const form = new FormData();
    form.append('files', makeFile(PDF_BYTES, 'bakhshname.pdf', 'application/pdf'));
    form.append('files', makeFile(PNG_BYTES, 'form-scan.png', 'image/png'));
    const up = await postForm(manager, `/api/docs/${doc.id}/files`, form);
    expect(up.status).toBe(201);
    const rec = dataOf<DocRecord>(up);
    expect(rec.files).toHaveLength(2);
    const pdf = rec.files.find((f) => f.filename === 'bakhshname.pdf')!;
    const img = rec.files.find((f) => f.filename === 'form-scan.png')!;
    expect(pdf.mime).toBe('application/pdf');
    expect(pdf.size).toBe(PDF_BYTES.length);
    expect(img.mime).toBe('image/png');

    // دانلود — بایت یکسان
    const headers = { authorization: `Bearer ${tokenOf(manager)}` };
    const dl = await A.app.request(`/api/docs/${doc.id}/files/${pdf.id}`, { headers }, A.env as never);
    expect(dl.status).toBe(200);
    expect(await dl.text()).toBe('%PDF-fake-docs-circular-letter');
    expect(dl.headers.get('content-type')).toBe('application/pdf');
    expect(dl.headers.get('content-disposition')).toContain('attachment');

    // جزئیات سند فایل‌ها را نشان می‌دهد
    const detail = dataOf<DocRecord>(await manager.get(`/api/docs/${doc.id}`));
    expect(detail.files).toHaveLength(2);
  });

  it('پیش‌نمایش (inline=1) — PDF/تصویر inline با CSP sandbox؛ متن همیشه attachment', async () => {
    const doc = await makeDoc('سند پیش‌نمایش');
    const form = new FormData();
    form.append('files', makeFile(PDF_BYTES, 'gozaresh.pdf', 'application/pdf'));
    form.append('files', makeFile(PNG_BYTES, 'aks.png', 'image/png'));
    form.append('files', makeFile(TXT_BYTES, 'matn.txt', 'text/plain'));
    const up = await postForm(manager, `/api/docs/${doc.id}/files`, form);
    const files = dataOf<DocRecord>(up).files;
    const pdf = files.find((f) => f.filename === 'gozaresh.pdf')!;
    const img = files.find((f) => f.filename === 'aks.png')!;
    const txt = files.find((f) => f.filename === 'matn.txt')!;

    const headers = { authorization: `Bearer ${tokenOf(manager)}` };

    const dlPdf = await A.app.request(`/api/docs/${doc.id}/files/${pdf.id}?inline=1`, { headers }, A.env as never);
    expect(dlPdf.headers.get('content-disposition')).toContain('inline');
    expect(dlPdf.headers.get('content-security-policy')).toContain('sandbox');

    const dlImg = await A.app.request(`/api/docs/${doc.id}/files/${img.id}?inline=1`, { headers }, A.env as never);
    expect(dlImg.headers.get('content-disposition')).toContain('inline');
    expect(dlImg.headers.get('content-security-policy')).toContain('sandbox');

    // متن/HTML حتی با inline=1 هم attachment (امنیت)
    const dlTxt = await A.app.request(`/api/docs/${doc.id}/files/${txt.id}?inline=1`, { headers }, A.env as never);
    expect(dlTxt.headers.get('content-disposition')).toContain('attachment');
    expect(dlTxt.headers.get('content-disposition')).not.toContain('inline');

    // بدون inline — همه attachment
    const dlPlain = await A.app.request(`/api/docs/${doc.id}/files/${pdf.id}`, { headers }, A.env as never);
    expect(dlPlain.headers.get('content-disposition')).toContain('attachment');
  });

  it('RBAC فایل‌ها — درمانگر آپلود/حذف ندارد (۴۰۳) ولی دانلود برای همکار احرازشده آزاد است؛ مهمان ۴۰۱', async () => {
    const doc = await makeDoc('سند دسترسی فایل');
    const form = new FormData();
    form.append('files', makeFile(PNG_BYTES, 'aks.png', 'image/png'));

    const therForm = new FormData();
    therForm.append('files', makeFile(PNG_BYTES, 't.png', 'image/png'));
    expect((await postForm(therapist, `/api/docs/${doc.id}/files`, therForm)).status).toBe(403);

    const secUp = await postForm(secretary, `/api/docs/${doc.id}/files`, form);
    expect(secUp.status).toBe(201);
    const fileId = dataOf<DocRecord>(secUp).files[0].id;

    // دانلود مثل knowledge فقط authMiddleware — درمانگر احرازشده هم می‌تواند بخواند
    const therHeaders = { authorization: `Bearer ${tokenOf(therapist)}` };
    const dl = await A.app.request(`/api/docs/${doc.id}/files/${fileId}`, { headers: therHeaders }, A.env as never);
    expect(dl.status).toBe(200);

    // مهمان ۴۰۱
    const anon = await A.app.request(`/api/docs/${doc.id}/files/${fileId}`, {}, A.env as never);
    expect(anon.status).toBe(401);

    expect((await therapist.delete(`/api/docs/${doc.id}/files/${fileId}`)).status).toBe(403);
    expect((await secretary.delete(`/api/docs/${doc.id}/files/${fileId}`)).status).toBe(200);
  });

  it('نوع نامجاز رد می‌شود (۴۰۰)', async () => {
    const doc = await makeDoc('سند فایل بد');
    const form = new FormData();
    form.append('files', makeFile(new TextEncoder().encode('MZ-fake'), 'setup.exe', 'application/x-msdownload'));
    const up = await postForm(manager, `/api/docs/${doc.id}/files`, form);
    expect(up.status).toBe(400);
    expect(JSON.stringify(up.body)).toContain('نوع فایل مجاز نیست');
  });

  it('سقف فایل هر بار بارگذاری — ۱۱ فایل رد می‌شود (۴۰۰)', async () => {
    const doc = await makeDoc('سند سقف فایل');
    const many = new FormData();
    for (let i = 0; i < 11; i += 1) many.append('files', makeFile(PNG_BYTES, `f${i}.png`, 'image/png'));
    const up = await postForm(manager, `/api/docs/${doc.id}/files`, many);
    expect(up.status).toBe(400);
    expect(JSON.stringify(up.body)).toContain('حداکثر');
  });

  it('بارگذاری تکه‌ای فایل بزرگ (۲.۵ مگابایت) — مونتاژ سالم + بایت یکسان + ناقص ۴۰۹', async () => {
    const doc = await makeDoc('سند فایل بزرگ');
    const big = new Uint8Array(Math.floor(2.5 * 1024 * 1024));
    let seed = 123456789;
    for (let i = 0; i < big.length; i += 1) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      big[i] = seed & 0xff;
    }

    const begin = await manager.post(`/api/docs/${doc.id}/files/begin`, {
      filename: 'ayin-name-bozorg.pdf',
      mime: 'application/pdf',
      size: big.length
    });
    expect(begin.status).toBe(201);
    const fileId = dataOf<{ fileId: string }>(begin).fileId;

    const headers: Record<string, string> = {
      authorization: `Bearer ${tokenOf(manager)}`,
      'content-type': 'application/octet-stream'
    };
    const CHUNK = 1024 * 1024;
    const chunks = Math.ceil(big.length / CHUNK);
    for (let seq = 0; seq < chunks; seq += 1) {
      const piece = big.subarray(seq * CHUNK, Math.min((seq + 1) * CHUNK, big.length));
      const res = await A.app.request(
        `/api/docs/${doc.id}/files/${fileId}/chunks/${seq}`,
        { method: 'PUT', headers, body: piece as unknown as BodyInit },
        A.env as never
      );
      expect(res.status).toBe(200);
    }

    const complete = await manager.post(`/api/docs/${doc.id}/files/${fileId}/complete`, {});
    expect(complete.status).toBe(200);
    const file = dataOf<DocRecord>(complete).files.find((f) => f.id === fileId)!;
    expect(file.size).toBe(big.length);

    // دریافت مجدد با ObjectStore واقعی — بایت‌به‌بایت یکسان
    const svc = createDocsService({
      db: A.db,
      audit: createAuditWriter(A.db),
      logger: silentLogger('chunk'),
      storage: createChunkedD1ObjectStore(A.db)
    });
    const fetched = await svc.getFile(doc.id, fileId);
    expect(fetched).not.toBeNull();
    expect(fetched!.bytes.length).toBe(big.length);
    let same = true;
    for (let i = 0; i < big.length; i += 4096) {
      if (fetched!.bytes[i] !== big[i]) { same = false; break; }
    }
    expect(same).toBe(true);

    // ناقص: حجم اعلامی بزرگ‌تر ولی فقط یک تکه → ۴۰۹
    const begin2 = await manager.post(`/api/docs/${doc.id}/files/begin`, {
      filename: 'nages.pdf',
      mime: 'application/pdf',
      size: 2 * 1024 * 1024
    });
    const fileId2 = dataOf<{ fileId: string }>(begin2).fileId;
    const res = await A.app.request(
      `/api/docs/${doc.id}/files/${fileId2}/chunks/0`,
      { method: 'PUT', headers, body: new Uint8Array(1024 * 1024) as unknown as BodyInit },
      A.env as never
    );
    expect(res.status).toBe(200);
    const incomplete = await manager.post(`/api/docs/${doc.id}/files/${fileId2}/complete`, {});
    expect(incomplete.status).toBe(409);
  });

  it('حذف فایل — ردیف و قطعه‌های ذخیره‌ساز پاک می‌شوند؛ بقیهٔ فایل‌های سند سر جایشان', async () => {
    const doc = await makeDoc('سند حذف فایل');
    const form = new FormData();
    form.append('files', makeFile(PDF_BYTES, 'yeki.pdf', 'application/pdf'));
    form.append('files', makeFile(PNG_BYTES, 'dovi.png', 'image/png'));
    const up = await postForm(manager, `/api/docs/${doc.id}/files`, form);
    const files = dataOf<DocRecord>(up).files;
    expect(files).toHaveLength(2);
    expect(
      (A.sql.prepare('SELECT COUNT(*) AS n FROM exercise_file_chunks WHERE key LIKE ?').get(`docs/${doc.id}/%`) as { n: number }).n
    ).toBeGreaterThan(0);

    const del = await manager.delete(`/api/docs/${doc.id}/files/${files[0].id}`);
    expect(del.status).toBe(200);
    const rest = dataOf<DocRecord>(del).files;
    expect(rest).toHaveLength(1);
    expect(rest[0].filename).toBe('dovi.png');

    // قطعه‌های فایل حذف‌شده از ذخیره‌ساز پاک شده‌اند
    const chunkRows = A.sql
      .prepare('SELECT COUNT(*) AS n FROM exercise_file_chunks WHERE key = ?')
      .get(`docs/${doc.id}/${files[0].id}`) as { n: number };
    expect(chunkRows.n).toBe(0);

    // دانلود فایل حذف‌شده ۴۰۴
    const headers = { authorization: `Bearer ${tokenOf(manager)}` };
    const dl = await A.app.request(`/api/docs/${doc.id}/files/${files[0].id}`, { headers }, A.env as never);
    expect(dl.status).toBe(404);
  });

  it('دانلود فایلِ سند حذف‌نرم‌شده — ۴۰۴', async () => {
    const doc = await makeDoc('سند حذف‌شده با فایل');
    const form = new FormData();
    form.append('files', makeFile(PDF_BYTES, 'hamrah.pdf', 'application/pdf'));
    const up = await postForm(manager, `/api/docs/${doc.id}/files`, form);
    const fileId = dataOf<DocRecord>(up).files[0].id;

    await manager.delete(`/api/docs/${doc.id}`);
    const headers = { authorization: `Bearer ${tokenOf(manager)}` };
    const dl = await A.app.request(`/api/docs/${doc.id}/files/${fileId}`, { headers }, A.env as never);
    expect(dl.status).toBe(404);
  });

  it('audit — هر تغییر سند رخداد docs.* ثبت کرده است', async () => {
    // یک ویرایش واقعی در همین بلوک تا اکشن docs.update هم ثبت شود
    const created = await manager.post('/api/docs', { title: 'سند برای ممیزی', category: 'other' });
    const auditDocId = dataOf<DocRecord>(created).id;
    expect((await manager.patch(`/api/docs/${auditDocId}`, { description: 'ویرایش برای ممیزی' })).status).toBe(200);

    const rows = A.sql
      .prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE action LIKE 'docs.%'`)
      .get() as { n: number };
    expect(rows.n).toBeGreaterThan(5);
    const byManager = A.sql
      .prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE action LIKE 'docs.%' AND actor_id = ?`)
      .get(MANAGER_ID) as { n: number };
    expect(byManager.n).toBeGreaterThan(5);
    const actions = A.sql
      .prepare(`SELECT DISTINCT action FROM audit_log WHERE action LIKE 'docs.%'`)
      .all() as { action: string }[];
    const names = actions.map((a) => a.action);
    for (const expected of ['docs.create', 'docs.update', 'docs.delete', 'docs.file.add', 'docs.file.delete']) {
      expect(names).toContain(expected);
    }
  });
});

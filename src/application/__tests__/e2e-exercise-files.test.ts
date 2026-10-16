/**
 * تست‌های e2e — -exercise-files
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// e2e--exercise-files.test.ts — پیوست‌های چندگانهٔ تمرین
// چند فایل برای هر تمرین (multipart باینری) + ویدیو + سقف ۵۰ مگابایت آداپترمحور
// + دانلود/حذف تکی + ارتقای فایل اصلی + توکن امضاشدهٔ پیوست + آداپتر D1 تکه‌تکه

import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, asRole, Api, WEBHOOK_SECRET } from '../../test/harness';
import { createAuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import { createDb } from '@core/db';
import { createChunkedD1ObjectStore, createD1ObjectStore } from '@core/storage';
import type { ObjectStore } from '@core/storage';
import { createExerciseBankService } from '@domain/exercise-bank';
import { MAX_EXERCISE_PANEL_FILE_BYTES } from '@core/shared';

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

const PNG_BYTES = new TextEncoder().encode('%PNG-fake-worksheet-image');
const MP4_BYTES = new TextEncoder().encode('%MP4-fake-home-video-instruction');
const HTML_BYTES = new TextEncoder().encode('<html><body>کاربرگ</body></html>');

function makeFile(bytes: Uint8Array, name: string, type: string): File {
  return new File([bytes as unknown as ArrayBuffer], name, { type });
}

/** درخواست multipart خام به اپ — FormData مستقیم (بدون Content-Type دستی) */
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

interface ExerciseView {
  id: string;
  title: string;
  published: boolean;
  file: { filename: string; mime: string; size: number } | null;
  files: FileView[];
}

describe('پیوست‌های چندگانهٔ تمرین', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;
  let therapist: Api;

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
    therapist = await asRole(A, 'therapist');
  });

  it('meta — سقف‌های آداپتر (۵۰ مگابایت / ۱۰ فایل) منتشر می‌شود', async () => {
    const res = await manager.get('/api/exercises/meta');
    expect(res.status).toBe(200);
    const data = (res.body as { data: { storage: string; limits: { maxFileBytes: number; maxFilesPerUpload: number } } }).data;
    expect(data.limits.maxFileBytes).toBe(MAX_EXERCISE_PANEL_FILE_BYTES);
    expect(data.limits.maxFilesPerUpload).toBe(10);
  });

  it('بارگذاری چندفایلی multipart — تصویر + ویدیو در یک درخواست؛ فایل اصلی = اولین', async () => {
    const created = await manager.post('/api/exercises', { title: 'تمرین حروف با ویدیو', format: 'worksheet', published: true });
    expect(created.status).toBe(201);
    const exId = (created.body as { data: ExerciseView }).data.id;

    const form = new FormData();
    form.append('files', makeFile(PNG_BYTES, 'carbarg.png', 'image/png'));
    form.append('files', makeFile(MP4_BYTES, 'ammoresh-video.mp4', 'video/mp4'));

    const up = await postForm(manager, `/api/exercises/${exId}/files`, form);
    expect(up.status).toBe(201);
    const rec = (up.body as { data: ExerciseView }).data;
    expect(rec.files).toHaveLength(2);
    expect(rec.files[0].filename).toBe('carbarg.png');
    expect(rec.files[1].filename).toBe('ammoresh-video.mp4');
    expect(rec.files[1].mime).toBe('video/mp4');
    // فایل اصلی = اولین پیوست (سازگاری بات/لینک خانواده)
    expect(rec.file?.filename).toBe('carbarg.png');

    // آینهٔ ستون‌های file_* روی exercises
    const row = A.sql.prepare('SELECT file_name, file_key FROM exercises WHERE id = ?').get(exId) as { file_name: string; file_key: string };
    expect(row.file_name).toBe('carbarg.png');
    expect(row.file_key).toBe(`exercise/${exId}/${rec.files[0].id}`);
  });

  it('ویدیو با نوع خالی مرورگر — از پسوند تشخیص داده می‌شود', async () => {
    const created = await manager.post('/api/exercises', { title: 'تمرین mkv بدون نوع', published: true });
    const exId = (created.body as { data: ExerciseView }).data.id;
    const form = new FormData();
    form.append('files', makeFile(MP4_BYTES, 'klip.mkv', '')); // برخی مرورگرها نوع خالی می‌دهند
    const up = await postForm(manager, `/api/exercises/${exId}/files`, form);
    expect(up.status).toBe(201);
    const rec = (up.body as { data: ExerciseView }).data;
    expect(rec.files[0].mime).toBe('video/x-matroska');
  });

  it('دانلود تکی پیوست با شناسه — بایت به‌بایت درست + ۴۰۴ برای شناسهٔ غریبه', async () => {
    const created = await manager.post('/api/exercises', { title: 'دانلود تکی', published: true });
    const exId = (created.body as { data: ExerciseView }).data.id;
    const form = new FormData();
    form.append('files', makeFile(HTML_BYTES, 'sheet.html', 'text/html'));
    form.append('files', makeFile(PNG_BYTES, 'pic.png', 'image/png'));
    const up = await postForm(manager, `/api/exercises/${exId}/files`, form);
    const rec = (up.body as { data: ExerciseView }).data;

    const headers: Record<string, string> = { authorization: `Bearer ${(manager as unknown as { token: string }).token}` };
    const dl = await A.app.request(`/api/exercises/${exId}/files/${rec.files[1].id}`, { headers }, A.env as never);
    expect(dl.status).toBe(200);
    const text = await dl.text();
    expect(text).toBe('%PNG-fake-worksheet-image');
    expect(dl.headers.get('content-type')).toBe('image/png');

    const bad = await A.app.request(`/api/exercises/${exId}/files/00000000-0000-4000-8000-0000000000ff`, { headers }, A.env as never);
    expect(bad.status).toBe(404);
  });

  it('حذف پیوست غیراصلی — بقیه سر جایشان', async () => {
    const created = await manager.post('/api/exercises', { title: 'حذف غیراصلی', published: true });
    const exId = (created.body as { data: ExerciseView }).data.id;
    const form = new FormData();
    form.append('files', makeFile(PNG_BYTES, 'a.png', 'image/png'));
    form.append('files', makeFile(MP4_BYTES, 'b.mp4', 'video/mp4'));
    const up = await postForm(manager, `/api/exercises/${exId}/files`, form);
    const rec = (up.body as { data: ExerciseView }).data;

    const del = await manager.delete(`/api/exercises/${exId}/files/${rec.files[1].id}`);
    expect(del.status).toBe(200);
    const after = (del.body as { data: ExerciseView }).data;
    expect(after.files).toHaveLength(1);
    expect(after.files[0].filename).toBe('a.png');
    expect(after.file?.filename).toBe('a.png');

    // قطعه‌های ذخیرهٔ فایل حذف‌شده هم پاک شده‌اند
    const chunks = A.sql.prepare('SELECT COUNT(*) AS n FROM exercise_file_chunks WHERE key = ?').get(`exercise/${exId}/${rec.files[1].id}`) as { n: number };
    expect(chunks.n).toBe(0);
  });

  it('حذف فایل اصلی — قدیمی‌ترین پیوست بعدی ارتقا می‌یابد', async () => {
    const created = await manager.post('/api/exercises', { title: 'ارتقای اصلی', published: true });
    const exId = (created.body as { data: ExerciseView }).data.id;
    const form = new FormData();
    form.append('files', makeFile(PNG_BYTES, 'first.png', 'image/png'));
    form.append('files', makeFile(MP4_BYTES, 'second.mp4', 'video/mp4'));
    form.append('files', makeFile(HTML_BYTES, 'third.html', 'text/html'));
    const up = await postForm(manager, `/api/exercises/${exId}/files`, form);
    const rec = (up.body as { data: ExerciseView }).data;

    const del = await manager.delete(`/api/exercises/${exId}/files/${rec.files[0].id}`);
    expect(del.status).toBe(200);
    const after = (del.body as { data: ExerciseView }).data;
    expect(after.files).toHaveLength(2);
    expect(after.file?.filename).toBe('second.mp4');
    const row = A.sql.prepare('SELECT file_name FROM exercises WHERE id = ?').get(exId) as { file_name: string };
    expect(row.file_name).toBe('second.mp4');
  });

  it('لینک عمومی با توکنِ پیوست مشخص — هر فایل لینک خودش را می‌گیرد', async () => {
    const created = await manager.post('/api/exercises', { title: 'لینک هر فایل', published: true });
    const exId = (created.body as { data: ExerciseView }).data.id;
    const form = new FormData();
    form.append('files', makeFile(PNG_BYTES, 'one.png', 'image/png'));
    form.append('files', makeFile(MP4_BYTES, 'two.mp4', 'video/mp4'));
    const up = await postForm(manager, `/api/exercises/${exId}/files`, form);
    const rec = (up.body as { data: ExerciseView }).data;

    // سرویس مستقیم برای توکن (downloadSecret هم‌گام با هارنس)
    const svc = createExerciseBankService({
      db: A.db,
      audit: createAuditWriter(A.db),
      logger: silentLogger('token'),
      storage: createChunkedD1ObjectStore(A.db),
      downloadSecret: WEBHOOK_SECRET
    });

    const t2 = await svc.mintDownloadToken(exId, rec.files[1].id);
    const dl2 = await A.app.request(`/public/exercise-files/${exId}?token=${t2}`, {}, A.env as never);
    expect(dl2.status).toBe(200);
    expect(await dl2.text()).toBe('%MP4-fake-home-video-instruction');

    const t1 = await svc.mintDownloadToken(exId, rec.files[0].id);
    const dl1 = await A.app.request(`/public/exercise-files/${exId}?token=${t1}`, {}, A.env as never);
    expect(dl1.status).toBe(200);
    expect(await dl1.text()).toBe('%PNG-fake-worksheet-image');

    // توکن بدون پیوست = فایل اصلی
    const tMain = await svc.mintDownloadToken(exId);
    const dlMain = await A.app.request(`/public/exercise-files/${exId}?token=${tMain}`, {}, A.env as never);
    expect(dlMain.status).toBe(200);
    expect(await dlMain.text()).toBe('%PNG-fake-worksheet-image');
  });

  it('RBAC — درمانگر اجازهٔ افزودن فایل دارد؛ مهمان ۴۰۱', async () => {
    const created = await manager.post('/api/exercises', { title: 'دسترسی نقش‌ها', published: true });
    const exId = (created.body as { data: ExerciseView }).data.id;
    const form = new FormData();
    form.append('files', makeFile(PNG_BYTES, 't.png', 'image/png'));

    const asTherapist = await postForm(therapist, `/api/exercises/${exId}/files`, form);
    expect(asTherapist.status).toBe(201);

    const anonForm = new FormData();
    anonForm.append('files', makeFile(PNG_BYTES, 'x.png', 'image/png'));
    const anon = await postForm(new Api(A), `/api/exercises/${exId}/files`, anonForm);
    expect(anon.status).toBe(401);
  });

  it('سقف حجم آداپترمحور است — سرویس با سقف کوچک، فایل درشت را رد می‌کند', async () => {
    const tiny: ObjectStore = {
      name: 'd1',
      maxObjectBytes: 10,
      put: async () => undefined,
      get: async () => null,
      delete: async () => undefined
    };
    const svc = createExerciseBankService({
      db: A.db,
      audit: createAuditWriter(A.db),
      logger: silentLogger('tiny'),
      storage: tiny,
      downloadSecret: WEBHOOK_SECRET
    });
    const created = await svc.create({ title: 'سقف کوچک', format: 'worksheet', published: true }, { staffId: '00000000-0000-0000-0000-000000000001', role: 'manager' } as never);
    await expect(
      svc.addFiles(created.id, [{ filename: 'big.png', mimeType: 'image/png', segments: [new Uint8Array(11)], size: 11 }], {
        staffId: '00000000-0000-0000-0000-000000000001',
        role: 'manager'
      } as never)
    ).rejects.toThrow('حجم فایل بیش از');
  });

  it('آداپتر تکه‌تکه — فایل بزرگ‌تر از یک قطعه (۲ قطعه) سالم ذخیره/خوانده می‌شود', async () => {
    const svc = createExerciseBankService({
      db: A.db,
      audit: createAuditWriter(A.db),
      logger: silentLogger('chunk'),
      storage: createChunkedD1ObjectStore(A.db),
      downloadSecret: WEBHOOK_SECRET
    });
    // الگوی شبه‌تصادفی قطعی — ۴ مگابایت (۳ قطعهٔ ۱.۵MB)
    const big = new Uint8Array(4 * 1024 * 1024);
    let seed = 123456789;
    for (let i = 0; i < big.length; i += 1) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      big[i] = seed & 0xff;
    }
    const actor = { staffId: '00000000-0000-0000-0000-000000000001', role: 'manager' } as never;
    const ex = await svc.create({ title: 'فایل چندقطعه‌ای', format: 'worksheet', published: true }, actor);
    const rec = await svc.addFiles(ex.id, [{ filename: 'big.mp4', mimeType: 'video/mp4', segments: [big], size: big.length }], actor);
    expect(rec.files).toHaveLength(1);

    const chunks = A.sql.prepare('SELECT COUNT(*) AS n FROM exercise_file_chunks WHERE key = ?').get(rec.files[0].id ? `exercise/${ex.id}/${rec.files[0].id}` : '') as { n: number };
    expect(chunks.n).toBe(3);

    const fetched = await svc.getAttachmentFile(ex.id, rec.files[0].id);
    expect(fetched).not.toBeNull();
    expect(fetched!.bytes.length).toBe(big.length);
    let same = true;
    for (let i = 0; i < big.length; i += 4096) {
      if (fetched!.bytes[i] !== big[i]) { same = false; break; }
    }
    expect(same).toBe(true);
  });

  it('مسیر قدیمی putFile (JSON) — تعویض فایل اصلی روی پیوست اول در‌جا', async () => {
    const created = await manager.post('/api/exercises', { title: 'تعویض قدیمی', published: true });
    const exId = (created.body as { data: ExerciseView }).data.id;
    const form = new FormData();
    form.append('files', makeFile(PNG_BYTES, 'old.png', 'image/png'));
    await postForm(manager, `/api/exercises/${exId}/files`, form);

    const b64 = Buffer.from('%PDF-replaced-content').toString('base64');
    const rep = await manager.put(`/api/exercises/${exId}/file`, {
      filename: 'new.pdf',
      mime_type: 'application/pdf',
      content_b64: b64
    });
    expect(rep.status).toBe(200);
    const rec = (rep.body as { data: ExerciseView }).data;
    expect(rec.files).toHaveLength(1);
    expect(rec.files[0].filename).toBe('new.pdf');
    expect(rec.file?.mime).toBe('application/pdf');

    // قطعه‌های ذخیرهٔ همین تمرین — بعد از تعویض فقط محتوای جدید (۱ قطعهٔ کوچک)
    const cnt = A.sql.prepare(
      "SELECT COUNT(*) AS n FROM exercise_file_chunks WHERE key LIKE ?"
    ).get(`exercise/${exId}/%`) as { n: number };
    expect(cnt.n).toBe(1);
  });

  it('ذخیرهٔ سادهٔ D1 (تست‌ها/dev) — سقف ۵۱۲ کیلوبایت باقی می‌ماند', async () => {
    const svc = createExerciseBankService({
      db: A.db,
      audit: createAuditWriter(A.db),
      logger: silentLogger('plain'),
      storage: createD1ObjectStore(A.db),
      downloadSecret: WEBHOOK_SECRET
    });
    expect(svc.limits.maxFileBytes).toBe(512 * 1024);
  });
});

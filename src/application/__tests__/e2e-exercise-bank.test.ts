/**
 * تست‌های e2e — exercise-bank
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// e2e-exercise-bank.test.ts — بانک تمرین از پنل
// CRUD کامل + فیلتر برچسب + دانلود کارکنان + لینک امضاشدهٔ خانواده + اعتبارسنجی + RBAC

import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestApp,
  Api,
  asRole,
  createStudent,
  makeNationalId,
  TAG_DISORDER_1,
  TAG_GRADE_5,
  WEBHOOK_SECRET
} from '../../test/harness';
import { createAuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import { createDb } from '@core/db';
import { createD1ObjectStore } from '@core/storage';
import { createExerciseBankService } from '@domain/exercise-bank';

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

const PDF_B64 = Buffer.from('%PDF-1.4 test worksheet content').toString('base64');

describe('بانک تمرین: پنل، فایل، برچسب، لینک خانواده', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;
  let therapist: Api;
  let secretary: Api;
  let exerciseId = '';
  let directService: ReturnType<typeof createExerciseBankService>;

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
    therapist = await asRole(A, 'therapist');
    secretary = await asRole(A, 'secretary');
    directService = createExerciseBankService({
      db: A.db,
      audit: createAuditWriter(A.db),
      logger: silentLogger('direct'),
      storage: createD1ObjectStore(A.db),
      downloadSecret: WEBHOOK_SECRET
    });
  });

  it('meta: دسته‌های برچسب seed و ذخیرهٔ d1', async () => {
    const res = await manager.get('/api/exercises/meta');
    expect(res.status).toBe(200);
    const data = (res.body as { data: { storage: string; categories: { disorder: unknown[]; grade: unknown[] } } }).data;
    expect(data.storage).toBe('d1');
    expect(data.categories.disorder.length).toBeGreaterThan(0);
    expect(data.categories.grade.length).toBeGreaterThan(0);
  });

  it('ساخت تمرین با فایل + دو برچسب (اختلال + پایه)', async () => {
    const res = await manager.post('/api/exercises', {
      title: 'تمرین حروف نقطه‌دار',
      description: 'هر ردیف را دو بار بخوانید.',
      format: 'worksheet',
      tag_ids: [TAG_DISORDER_1, TAG_GRADE_5],
      published: true,
      file: { filename: 'کاربرگ نقطه‌دار.pdf', mime_type: 'application/pdf', content_b64: PDF_B64 }
    });
    expect(res.status).toBe(201);
    const ex = (res.body as { data: { id: string; file: { filename: string; mime: string }; tags: { id: string }[]; published: boolean } }).data;
    exerciseId = ex.id;
    expect(ex.file).not.toBeNull();
    expect(ex.file!.filename).toBe('کاربرگ نقطه‌دار.pdf');
    expect(ex.tags.map((t) => t.id).sort()).toEqual([TAG_DISORDER_1, TAG_GRADE_5].sort());
    expect(ex.published).toBe(true);
  });

  it('فهرست + فیلتر برچسب و جستجو', async () => {
    const all = await manager.get('/api/exercises');
    expect(all.status).toBe(200);
    const items = (all.body as { data: { items: { id: string }[]; total: number } }).data;
    expect(items.items.map((i) => i.id)).toContain(exerciseId);

    const byTag = await manager.get(`/api/exercises?tag_id=${TAG_GRADE_5}`);
    expect((byTag.body as { data: { items: { id: string }[] } }).data.items.map((i) => i.id)).toContain(exerciseId);

    const byOtherTag = await manager.get('/api/exercises?tag_id=aaaaaaaa-0000-4000-8000-000000000009');
    expect((byOtherTag.body as { data: { items: unknown[] } }).data.items).toHaveLength(0);

    const byQ = await manager.get('/api/exercises?q=' + encodeURIComponent('نقطه‌دار'));
    expect((byQ.body as { data: { items: { id: string }[] } }).data.items.map((i) => i.id)).toContain(exerciseId);
  });

  it('ویرایش: عنوان/انتشار/برچسب‌ها (پیش‌نویس = از فهرست published حذف)', async () => {
    const patch = await manager.patch(`/api/exercises/${exerciseId}`, {
      title: 'تمرین حروف نقطه‌دار — نسخهٔ ۲',
      published: false,
      tag_ids: [TAG_DISORDER_1]
    });
    expect(patch.status).toBe(200);
    const ex = (patch.body as { data: { title: string; published: boolean; tags: { id: string }[] } }).data;
    expect(ex.title).toContain('نسخهٔ ۲');
    expect(ex.published).toBe(false);
    expect(ex.tags).toHaveLength(1);

    const publishedOnly = await manager.get('/api/exercises?published=true');
    expect((publishedOnly.body as { data: { items: { id: string }[] } }).data.items.map((i) => i.id)).not.toContain(exerciseId);

    // برگشت به انتشار
    await manager.patch(`/api/exercises/${exerciseId}`, { published: true });
  });

  it('تعویض فایل با PUT و دانلود کارکنان با بایت درست', async () => {
    const htmlB64 = Buffer.from('<html><body>کاربرگ HTML</body></html>').toString('base64');
    const put = await manager.put(`/api/exercises/${exerciseId}/file`, {
      filename: 'کاربرگ تعاملی.html',
      mime_type: 'text/html',
      content_b64: htmlB64
    });
    expect(put.status).toBe(200);
    const ex = (put.body as { data: { file: { filename: string; mime: string } } }).data;
    expect(ex.file!.filename).toBe('کاربرگ تعاملی.html');
    expect(ex.file!.mime).toBe('text/html');

    const file = await manager.get(`/api/exercises/${exerciseId}/file`);
    expect(file.status).toBe(200);
    expect(file.body).toBe('<html><body>کاربرگ HTML</body></html>');

    // دانلود بدون توکن — 401 (authMiddleware روی /api/*)
    const raw = await new Api(A).get(`/api/exercises/${exerciseId}/file`);
    expect(raw.status).toBe(401);
  });

  it('لینک امضاشدهٔ خانواده: معتبر ۲۰۰ / دستکاری‌شده ۴۰۴ / غیرمنتشر ۴۰۴', async () => {
    const token = await directService.mintDownloadToken(exerciseId);

    const ok = await A.app.request(`/public/exercise-files/${exerciseId}?token=${token}`, {}, A.env as never);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toContain('text/html');
    const text = await ok.text();
    expect(text).toContain('کاربرگ HTML');

    const tampered = await A.app.request(`/public/exercise-files/${exerciseId}?token=${token}x`, {}, A.env as never);
    expect(tampered.status).toBe(404);

    const wrongId = await A.app.request(`/public/exercise-files/${exerciseId.slice(0, -1)}0?token=${token}`, {}, A.env as never);
    expect(wrongId.status).toBe(404);

    // غیرمنتشر → مسیر عمومی بسته
    await manager.patch(`/api/exercises/${exerciseId}`, { published: false });
    const hidden = await A.app.request(`/public/exercise-files/${exerciseId}?token=${token}`, {}, A.env as never);
    expect(hidden.status).toBe(404);
    await manager.patch(`/api/exercises/${exerciseId}`, { published: true });
  });

  it('اعتبارسنجی: MIME ممنوع / حجم بالا / عنوان کوتاه → ۴۰۰', async () => {
    const badMime = await manager.post('/api/exercises', {
      title: 'تمرین زپ',
      format: 'worksheet',
      file: { filename: 'a.zip', mime_type: 'application/zip', content_b64: PDF_B64 }
    });
    expect(badMime.status).toBe(400);

    const bigB64 = Buffer.alloc(513 * 1024).toString('base64');
    const bigFile = await manager.post('/api/exercises', {
      title: 'تمرین بزرگ',
      format: 'worksheet',
      file: { filename: 'big.pdf', mime_type: 'application/pdf', content_b64: bigB64 }
    });
    expect(bigFile.status).toBe(400);

    const shortTitle = await manager.post('/api/exercises', { title: 'ت', format: 'worksheet' });
    expect(shortTitle.status).toBe(400);
  });

  it('RBAC: هر سه نقش می‌نویسند؛ بدون توکن ۴۰۱', async () => {
    const byTherapist = await therapist.post('/api/exercises', { title: 'تمرین درمانگر', format: 'game' });
    expect(byTherapist.status).toBe(201);

    const bySecretary = await secretary.post('/api/exercises', { title: 'تمرین منشی', format: 'instruction' });
    expect(bySecretary.status).toBe(201);

    const anon = await new Api(A).get('/api/exercises');
    expect(anon.status).toBe(401);
  });

  it('ثبت تکلیف از سرویس + فهرست تکلیف‌های تمرین', async () => {
    const created = await createStudent(manager, { first_name: 'رضا', last_name: 'تمرینی' });
    const student = { id: created.id };

    const assigned = await directService.assign(
      { exerciseId, studentId: student.id, assignedBy: '00000000-0000-0000-0000-000000000002', via: 'bot', note: null },
      { staffId: 'bale-bot', email: 'bale-bot@system.local', role: 'manager', displayName: 'بات بله' }
    );
    expect(assigned.exerciseTitle).toContain('حروف نقطه‌دار');
    expect(assigned.studentName).toBe('رضا تمرینی');
    expect(assigned.via).toBe('bot');

    const list = await manager.get(`/api/exercises/${exerciseId}/assignments`);
    expect(list.status).toBe(200);
    expect((list.body as { data: { id: string }[] }).data.map((r) => r.id)).toContain(assigned.id);

    // تمرین ناموجود / دانش‌آموز ناموجود
    await expect(
      directService.assign(
        { exerciseId: 'ffffffff-ffff-4fff-8fff-ffffffffffff', studentId: student.id, assignedBy: 'x', via: 'bot' },
        { staffId: 'bale-bot', email: 'b@l', role: 'manager', displayName: 'b' }
      )
    ).rejects.toMatchObject({ status: 404 });
  });

  it('حذف نرم: از فهرست می‌رود؛ getById نال؛ file ۴۰۴', async () => {
    const create = await secretary.post('/api/exercises', { title: 'تمرین موقت حذف', format: 'worksheet' });
    const id = (create.body as { data: { id: string } }).data.id;

    const del = await manager.delete(`/api/exercises/${id}`);
    expect(del.status).toBe(200);

    const gone = await manager.get(`/api/exercises/${id}`);
    expect(gone.status).toBe(404);

    const list = await manager.get('/api/exercises');
    expect((list.body as { data: { items: { id: string }[] } }).data.items.map((i) => i.id)).not.toContain(id);
  });
});

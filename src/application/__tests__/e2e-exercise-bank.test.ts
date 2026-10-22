import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestApp,
  Api,
  asRole,
  createStudent,
  makeNationalId,
  ALI_ID,
  MANAGER_ID,
  MARYAM_ID,
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

    const otherExerciseId = (exerciseId[0] === 'a' ? 'b' : 'a') + exerciseId.slice(1);
    const wrongId = await A.app.request(`/public/exercise-files/${otherExerciseId}?token=${token}`, {}, A.env as never);
    expect(wrongId.status).toBe(404);

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

describe('بانک تمرین: مالکیت (owner_staff_id بسته + reassign فقط-مدیر)', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;
  let therapist: Api;
  let exerciseId = '';

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
    therapist = await asRole(A, 'therapist');
    const res = await manager.post('/api/exercises', { title: 'شمارش برعکس (مالکیت)', format: 'worksheet' });
    expect(res.status).toBe(201);
    exerciseId = (res.body as { data: { id: string; createdBy: string } }).data.id;
  });

  it('رگرسیون THE-bug: PATCH با owner_staff_id در payload مالکیت (createdBy) را تغییر نمی‌دهد', async () => {
    const before = await manager.get(`/api/exercises/${exerciseId}`);
    const createdBefore = (before.body as { data: { createdBy: string } }).data.createdBy;

    const patch = await manager.patch(`/api/exercises/${exerciseId}`, {
      title: 'شمارش برعکس (مالکیت) — ویرایش ساده',
      owner_staff_id: ALI_ID
    });
    expect(patch.status).toBe(200);
    const after = (patch.body as { data: { createdBy: string } }).data.createdBy;
    expect(after).toBe(createdBefore);

    const reread = await manager.get(`/api/exercises/${exerciseId}`);
    expect((reread.body as { data: { createdBy: string } }).data.createdBy).toBe(createdBefore);

    const audits = A.sql.prepare(
      `SELECT COUNT(*) AS cnt FROM audit_log WHERE action = 'exercise.reassigned' AND resource_id = ?`
    ).get(exerciseId) as { cnt: number };
    expect(audits.cnt).toBe(0);
  });

  it('reassign توسط مدیر: createdBy عوض می‌شود + سطر audit با from/to/reason', async () => {
    const res = await manager.post(`/api/exercises/${exerciseId}/reassign`, {
      staffId: ALI_ID,
      reason: 'ثبت زیر نشست مشترک — مالک واقعی درمانگر است'
    });
    expect(res.status).toBe(200);
    const body = res.body as { data: { createdBy: string }; unchanged?: boolean };
    expect(body.data.createdBy).toBe(ALI_ID);
    expect(body.unchanged).toBeUndefined(); // تغییر واقعی — پرچم بدون‌عمل ندارد

    const viaGet = await manager.get(`/api/exercises/${exerciseId}`);
    expect((viaGet.body as { data: { createdBy: string } }).data.createdBy).toBe(ALI_ID);

    const audit = A.sql.prepare(
      `SELECT actor_id, changes FROM audit_log WHERE action = 'exercise.reassigned' AND resource_id = ? ORDER BY rowid DESC LIMIT 1`
    ).get(exerciseId) as { actor_id: string; changes: string };
    expect(audit.actor_id).toBe(MANAGER_ID);
    const changes = JSON.parse(audit.changes) as { createdBy: { from: string; to: string }; reason?: { to: string } };
    expect(changes.createdBy.from).toBe(MANAGER_ID);
    expect(changes.createdBy.to).toBe(ALI_ID);
    expect(changes.reason?.to).toContain('نشست مشترک');
  });

  it('reassign برای درمانگر ۴۰۳ است', async () => {
    const res = await therapist.post(`/api/exercises/${exerciseId}/reassign`, { staffId: MARYAM_ID });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'FORBIDDEN' });
  });

  it('reassign با همان مالک فعلی: ۲۰۰ بدون‌عمل (unchanged) و بدون سطر audit تازه', async () => {
    const before = A.sql.prepare(
      `SELECT COUNT(*) AS cnt FROM audit_log WHERE action = 'exercise.reassigned' AND resource_id = ?`
    ).get(exerciseId) as { cnt: number };

    const res = await manager.post(`/api/exercises/${exerciseId}/reassign`, { staffId: ALI_ID });
    expect(res.status).toBe(200);
    const body = res.body as { data: { createdBy: string }; unchanged?: boolean };
    expect(body.unchanged).toBe(true);
    expect(body.data.createdBy).toBe(ALI_ID);

    const after = A.sql.prepare(
      `SELECT COUNT(*) AS cnt FROM audit_log WHERE action = 'exercise.reassigned' AND resource_id = ?`
    ).get(exerciseId) as { cnt: number };
    expect(after.cnt).toBe(before.cnt); // سطر تازه ندارد
  });

  it('reassign: تمرین ناموجود ۴۰۴ و کارمند ناموجود/غیرفعال ۴۰۴', async () => {
    const unknownEx = await manager.post('/api/exercises/ffffffff-ffff-4fff-8fff-ffffffffffff/reassign', { staffId: ALI_ID });
    expect(unknownEx.status).toBe(404);

    const unknownStaff = await manager.post(`/api/exercises/${exerciseId}/reassign`, {
      staffId: 'ffffffff-ffff-4fff-8fff-ffffffffffff'
    });
    expect(unknownStaff.status).toBe(404);
  });
});

describe('بانک تمرین: هم‌ساز تمرین (co_created_by — سازندهٔ دوم)', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;
  let therapist: Api;

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
    therapist = await asRole(A, 'therapist');
  });

  it('ساخت با هم‌ساز: coCreatedBy در پاسخ ثبت می‌شود', async () => {
    const res = await manager.post('/api/exercises', {
      title: 'تمرین تیمی هم‌سازدار',
      format: 'worksheet',
      co_created_by: ALI_ID
    });
    expect(res.status).toBe(201);
    const ex = (res.body as { data: { id: string; createdBy: string; coCreatedBy: string | null } }).data;
    expect(ex.createdBy).toBe(MANAGER_ID);
    expect(ex.coCreatedBy).toBe(ALI_ID);

    const viaGet = await manager.get(`/api/exercises/${ex.id}`);
    expect((viaGet.body as { data: { coCreatedBy: string | null } }).data.coCreatedBy).toBe(ALI_ID);
  });

  it('هم‌ساز = خودِ سازنده ۴۰۰ و کارمند ناموجود ۴۰۴', async () => {
    const selfCo = await manager.post('/api/exercises', {
      title: 'تمرین هم‌سازِ خودم',
      format: 'worksheet',
      co_created_by: MANAGER_ID
    });
    expect(selfCo.status).toBe(400);

    const ghost = await manager.post('/api/exercises', {
      title: 'تمرین هم‌ساز ناموجود',
      format: 'worksheet',
      co_created_by: 'ffffffff-ffff-4fff-8fff-ffffffffffff'
    });
    expect(ghost.status).toBe(404);
  });

  it('ویرایش: هم‌ساز تغییر می‌کند و با null برداشته می‌شود؛ مالکیت (createdBy) ثابت می‌ماند', async () => {
    const res = await therapist.post('/api/exercises', { title: 'روخوانی واژه‌ها', format: 'instruction' });
    const ex = (res.body as { data: { id: string; createdBy: string } }).data;

    const set = await therapist.patch(`/api/exercises/${ex.id}`, { co_created_by: MARYAM_ID });
    expect(set.status).toBe(200);
    expect((set.body as { data: { coCreatedBy: string | null } }).data.coCreatedBy).toBe(MARYAM_ID);

    const clear = await therapist.patch(`/api/exercises/${ex.id}`, { co_created_by: null });
    expect(clear.status).toBe(200);
    expect((clear.body as { data: { coCreatedBy: string | null } }).data.coCreatedBy).toBeNull();

    const reread = await manager.get(`/api/exercises/${ex.id}`);
    const body = (reread.body as { data: { createdBy: string; coCreatedBy: string | null } }).data;
    expect(body.createdBy).toBe(ALI_ID);
    expect(body.coCreatedBy).toBeNull();
  });

  it('هم‌ساز نباید خودِ سازندهٔ فعلی باشد (ویرایش) — ۴۰۰', async () => {
    const res = await therapist.post('/api/exercises', { title: 'دقت و تمرکز — مازید', format: 'game' });
    const ex = (res.body as { data: { id: string } }).data;
    const patch = await therapist.patch(`/api/exercises/${ex.id}`, { co_created_by: ALI_ID });
    expect(patch.status).toBe(400);
  });
});

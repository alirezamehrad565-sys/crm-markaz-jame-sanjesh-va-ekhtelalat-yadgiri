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

  it('نوع کارت «تکلیف» (homework — ): ساخت + فیلتر format', async () => {
    const hw = await therapist.post('/api/exercises', {
      title: 'تکلیف روخوانی ده‌دقیقه‌ای',
      description: 'روزی ده دقیقه روخوانی + ثبت زمان توسط خانواده.',
      format: 'homework',
      published: true
    });
    expect(hw.status).toBe(201);
    const created = (hw.body as { data: { id: string; format: string } }).data;
    expect(created.format).toBe('homework');

    const byFormat = await therapist.get('/api/exercises?format=homework');
    const items = (byFormat.body as { data: { items: { id: string; format: string }[] } }).data.items;
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.format === 'homework')).toBe(true);
    expect(items.map((i) => i.id)).toContain(created.id);

    const emptyFormat = await therapist.get('/api/exercises?format=nothing');
    expect((emptyFormat.body as { data: { items: unknown[] } }).data.items).toHaveLength(0);
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

describe('درخت هدف کتابخانهٔ کارت () — پیوند، فیلتر و شمارنده', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;
  let focusId = '';

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
  });

  it('ساخت کارت با پیوند هدف (حوزه + مهارت) — focus مرتب و در رکورد برمی‌گردد', async () => {
    const res = await manager.post('/api/exercises', {
      title: 'ماز عدد — حافظهٔ فعال',
      format: 'game',
      focus: ['ef_inhibition', 'memory_working', 'memory']
    });
    expect(res.status).toBe(201);
    const ex = (res.body as { data: { id: string; focus: string[] } }).data;
    focusId = ex.id;
    expect(ex.focus).toEqual(['memory', 'memory_working', 'ef_inhibition']); // ترتیب درخت
  });

  it('فیلتر focus: مهارت، حوزه (گسترش به زیرشاخه) و ستون', async () => {
    const bySkill = await manager.get('/api/exercises?focus=memory_working');
    expect((bySkill.body as { data: { items: { id: string }[] } }).data.items.map((i) => i.id)).toContain(focusId);

    const byDomain = await manager.get('/api/exercises?focus=memory');
    expect((byDomain.body as { data: { items: { id: string }[] } }).data.items.map((i) => i.id)).toContain(focusId);

    const byPillar = await manager.get('/api/exercises?focus=info');
    expect((byPillar.body as { data: { items: { id: string }[] } }).data.items.map((i) => i.id)).toContain(focusId);

    const byOther = await manager.get('/api/exercises?focus=lang_phonology');
    expect((byOther.body as { data: { items: { id: string }[] } }).data.items.map((i) => i.id)).not.toContain(focusId);

    const emptyKey = await manager.get('/api/exercises?focus=');
    expect(emptyKey.status).toBe(200);
  });

  it('کلید ناشناخته در ساخت → ۴۰۰ فارسی؛ سقف ۸ پیوند → ۴۰۰', async () => {
    const bad = await manager.post('/api/exercises', { title: 'کارت ناشناخته', focus: ['not_a_key'] });
    expect(bad.status).toBe(400);
    const msg = JSON.stringify(bad.body);
    expect(msg).toContain('درخت هدف');

    const many = await manager.post('/api/exercises', {
      title: 'کارت پرموضوع',
      focus: ['memory_working', 'memory_visual', 'memory_auditory', 'memory_sequence', 'memory_longterm', 'memory_shortterm', 'attention_sustained', 'attention_selective', 'attention_divided']
    });
    expect(many.status).toBe(400);
  });

  it('ویرایش focus جایگزین کامل می‌کند؛ بدون focus بدون تغییر می‌ماند', async () => {
    const set = await manager.patch(`/api/exercises/${focusId}`, { focus: ['lang_phonology'] });
    expect(set.status).toBe(200);
    expect((set.body as { data: { focus: string[] } }).data.focus).toEqual(['lang_phonology']);

    const clear = await manager.patch(`/api/exercises/${focusId}`, { focus: [] });
    expect(clear.status).toBe(200);
    expect((clear.body as { data: { focus: string[] } }).data.focus).toEqual([]);

    const touch = await manager.patch(`/api/exercises/${focusId}`, { focus: ['memory_working'], published: true });
    expect(touch.status).toBe(200);
    const noTouch = await manager.patch(`/api/exercises/${focusId}`, { title: 'ماز عدد — حافظهٔ فعال (ویرایش عنوان)' });
    expect(noTouch.status).toBe(200);
    expect((noTouch.body as { data: { focus: string[] } }).data.focus).toEqual(['memory_working']); // دست‌نخورده
  });

  it('meta درخت واحد و شمارنده را برمی‌گرداند — backfill برچسب «حافظهٔ فعال» از seed (: بدون کلیدهای legacy)', async () => {
    const res = await manager.get('/api/exercises/meta');
    expect(res.status).toBe(200);
    const data = (res.body as { data: { taxonomyTree: { key: string; domains: unknown[] }[]; focusFacets: Record<string, number> } }).data;
    const info = data.taxonomyTree.find((p) => p.key === 'info')!;
    const exec = data.taxonomyTree.find((p) => p.key === 'exec')!;
    expect(info.domains.length).toBe(8);
    expect(exec.domains.length).toBe(4);
    expect((data.focusFacets['memory_working'] ?? 0)).toBeGreaterThanOrEqual(1); // کارت ساخته‌شده در همین describe + backfill
  });

  it('حذف نرم: کارتِ حذف‌شده از فیلتر focus و شمارنده خارج می‌شود', async () => {
    const res = await manager.post('/api/exercises', { title: 'کارت موقتی برای حذف', focus: ['spatial_maze'] });
    const ex = (res.body as { data: { id: string } }).data;
    const before = await manager.get('/api/exercises?focus=spatial_maze');
    expect((before.body as { data: { total: number } }).data.total).toBe(1);

    await manager.delete(`/api/exercises/${ex.id}`);
    const after = await manager.get('/api/exercises?focus=spatial_maze');
    expect((after.body as { data: { total: number } }).data.total).toBe(0);
  });
});

describe('ستون اختلال‌ها () — خانواده، فیلتر اجتماع و شمارندهٔ distinct', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;
  let dyslexiaCardId = '';
  let oddCardId = '';
  const TAG_ODD = 'aaaaaaaa-0000-4000-8000-00000000000a'; // رفتاری و نافرمانی (ODD) — seed مهاجرت 0042

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
  });

  it('ساخت دو کارت با برچسب دو خانوادهٔ متفاوت (یادگیری / رفتار)', async () => {
    const read = await manager.post('/api/exercises', {
      title: 'روخوانی واژه‌های دشوار — کارت اختلال',
      format: 'worksheet',
      tag_ids: [TAG_DISORDER_1],
      published: true
    });
    expect(read.status).toBe(201);
    dyslexiaCardId = (read.body as { data: { id: string } }).data.id;

    const behavior = await manager.post('/api/exercises', {
      title: 'قرارداد رفتاری کلاسی — کارت اختلال',
      format: 'instruction',
      tag_ids: [TAG_ODD],
      published: true
    });
    expect(behavior.status).toBe(201);
    oddCardId = (behavior.body as { data: { id: string } }).data.id;
  });

  it('فیلتر disorder: کلید خانواده → همهٔ اعضا؛ شناسهٔ برچسب → خودش؛ اجتماع چند انتخاب', async () => {
    const byFam = await manager.get('/api/exercises?disorder=fam_learning');
    const famItems = (byFam.body as { data: { items: { id: string }[] } }).data.items;
    expect(famItems.map((i) => i.id)).toContain(dyslexiaCardId);
    expect(famItems.map((i) => i.id)).not.toContain(oddCardId); // خانوادهٔ دیگر

    const byFamBehavior = await manager.get('/api/exercises?disorder=fam_behavior');
    const behaviorItems = (byFamBehavior.body as { data: { items: { id: string }[] } }).data.items;
    expect(behaviorItems.map((i) => i.id)).toContain(oddCardId);
    expect(behaviorItems.map((i) => i.id)).not.toContain(dyslexiaCardId);

    const byId = await manager.get(`/api/exercises?disorder=${TAG_DISORDER_1}`);
    expect((byId.body as { data: { items: { id: string }[] } }).data.items.map((i) => i.id)).toContain(dyslexiaCardId);

    // اجتماع: خانوادهٔ یادگیری + برچسب ODD → هر دو کارت
    const union = await manager.get(`/api/exercises?disorder=fam_learning,${TAG_ODD}`);
    const unionItems = (union.body as { data: { items: { id: string }[] } }).data.items;
    expect(unionItems.map((i) => i.id)).toContain(dyslexiaCardId);
    expect(unionItems.map((i) => i.id)).toContain(oddCardId);

    // کلید ناشناخته → بدون شرط، همان‌طور که focus کلید ناشناخته را نادیده می‌گیرد
    const unknown = await manager.get('/api/exercises?disorder=fam_nope');
    expect(unknown.status).toBe(200);
  });

  it('meta: ستون اختلال‌ها در درخت واحد — خانواده‌ها با برچسب‌های seed و disorderFacets شمارندهٔ distinct', async () => {
    const res = await manager.get('/api/exercises/meta');
    expect(res.status).toBe(200);
    const data = (res.body as { data: { taxonomyTree: { key: string; domains: { key: string; leaves: { key: string; fa: string; tagId?: string }[] }[] }[]; disorderFacets: Record<string, number> } }).data;
    const pillar = data.taxonomyTree.find((p) => p.key === 'disorder')!;
    const keys = pillar.domains.map((d) => d.key);
    expect(keys).toContain('fam_learning');
    expect(keys).toContain('fam_behavior');
    expect(keys).toContain('fam_attention');
    expect(keys).toContain('fam_language');
    expect(keys).toContain('fam_development');
    const learning = pillar.domains.find((d) => d.key === 'fam_learning')!;
    expect(learning.leaves.some((l) => l.tagId === TAG_DISORDER_1)).toBe(true);
    expect(learning.leaves.every((l) => l.fa.length > 0 && typeof l.tagId === 'string' && l.tagId.length > 0)).toBe(true);
    // هر کارت فقط یک برچسب از خانواده دارد → شمارندهٔ distinct = ۱ برای هر دو
    expect(data.disorderFacets['fam_learning']).toBeGreaterThanOrEqual(1);
    expect(data.disorderFacets['fam_behavior']).toBeGreaterThanOrEqual(1);
    expect(keys).not.toContain('fam_other'); // همهٔ برچسب‌های seed شناخته‌اند
  });

  it('meta: taxonomyTree درخت واحد چهارستونه — بدون کلیدهای legacy ()', async () => {
    const res = await manager.get('/api/exercises/meta');
    expect(res.status).toBe(200);
    const data = (res.body as {
      data: {
        taxonomyTree: { key: string; source: 'focus' | 'tag'; domains: { key: string; leaves: { key: string; tagId?: string }[] }[] }[];
        focusTree?: unknown;
        disorderTree?: unknown;
      }
    }).data;
    // ترتیب محصول: پردازش اطلاعات، کارکردهای اجرایی، اختلال‌ها، پایه تحصیلی
    expect(data.taxonomyTree.map((p) => p.key)).toEqual(['info', 'exec', 'disorder', 'grade']);
    expect(data.taxonomyTree[0].source).toBe('focus');
    expect(data.taxonomyTree[1].source).toBe('focus');
    expect(data.taxonomyTree[2].source).toBe('tag');
    expect(data.taxonomyTree[3].source).toBe('tag');
    // ستون علمی: حوزهٔ حافظه با برگ کلید هدف — بدون tagId
    const memory = data.taxonomyTree[0].domains.find((d) => d.key === 'memory')!;
    expect(memory.leaves.some((l) => l.key === 'memory_working' && !l.tagId)).toBe(true);
    // ستون‌های برچسبی: برگ = شناسهٔ برچسب واقعی دیتابیس (همان شناسه‌ای که در tag_ids نوشته می‌شود)
    const disorderLeaves = data.taxonomyTree[2].domains.flatMap((d) => d.leaves);
    expect(disorderLeaves.length).toBeGreaterThan(0);
    expect(disorderLeaves.every((l) => typeof l.tagId === 'string' && l.tagId.length > 0)).toBe(true);
    expect(disorderLeaves.some((l) => l.tagId === TAG_DISORDER_1)).toBe(true);
    const gradeLeaves = data.taxonomyTree[3].domains.flatMap((d) => d.leaves);
    expect(gradeLeaves.length).toBeGreaterThan(0);
    expect(gradeLeaves.some((l) => l.tagId === TAG_GRADE_5)).toBe(true);
    // کلیدهای legacy از payload حذف شدند
    expect(data.focusTree).toBeUndefined();
    expect(data.disorderTree).toBeUndefined();
  });

  it('فیلتر disorder با فیلترهای دیگر جمع می‌شود (published + type)', async () => {
    const draft = await manager.post('/api/exercises', {
      title: 'کارت پیش‌نویس اختلال',
      format: 'game',
      tag_ids: [TAG_DISORDER_1],
      published: false
    });
    const draftId = (draft.body as { data: { id: string } }).data.id;

    const pubOnly = await manager.get('/api/exercises?disorder=fam_learning&published=true');
    const items = (pubOnly.body as { data: { items: { id: string }[] } }).data.items;
    expect(items.map((i) => i.id)).toContain(dyslexiaCardId);
    expect(items.map((i) => i.id)).not.toContain(draftId);
  });

  it('حذف نرم: کارتِ حذف‌شده از فیلتر خانواده خارج و شمارنده یکی کم می‌شود', async () => {
    // شمارندهٔ قبل — اپ seed کارت‌های 0043 با برچسب اختلال هم دارد؛ پس کاهش یک‌واحدی معیار درست است
    const metaBefore = await manager.get('/api/exercises/meta');
    const before = (metaBefore.body as { data: { disorderFacets: Record<string, number> } }).data.disorderFacets['fam_behavior'] ?? 0;

    await manager.delete(`/api/exercises/${oddCardId}`);
    const after = await manager.get('/api/exercises?disorder=fam_behavior');
    const items = (after.body as { data: { items: { id: string }[] } }).data.items;
    expect(items.map((i) => i.id)).not.toContain(oddCardId);

    const metaAfter = await manager.get('/api/exercises/meta');
    const afterCount = (metaAfter.body as { data: { disorderFacets: Record<string, number> } }).data.disorderFacets['fam_behavior'] ?? 0;
    expect(afterCount).toBe(before - 1);
  });
});

describe('ستون پایه تحصیلی () — دو دورهٔ باقی‌مانده، «سایر پایه‌ها» و فیلتر', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;
  let primaryCardId = ''; // کارت با برچسب «پنجم» → دورهٔ دبستان
  let otherCardId = ''; // کارت با برچسب پایهٔ خارج دامنه → «سایر پایه‌ها»
  let otherTagId = ''; // برچسب grade سفارشی — عضو هیچ دورهٔ کد نیست
  // هفتم — seed قدیم 0006؛ مهاجرت 0084 () شش برچسب متوسطه را از DB حذف کرده است
  const TAG_ODD = 'aaaaaaaa-0000-4000-8000-00000000000a'; // رفتاری و نافرمانی (ODD)

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
  });

  it('ساخت دو کارت: برچسب دورهٔ دبستان (پنجم) و برچسب پایهٔ خارج دامنه', async () => {
    const primary = await manager.post('/api/exercises', {
      title: 'روخوانی پایهٔ پنجم — کارت پایه',
      format: 'worksheet',
      tag_ids: [TAG_DISORDER_1, TAG_GRADE_5],
      published: true
    });
    expect(primary.status).toBe(201);
    primaryCardId = (primary.body as { data: { id: string } }).data.id;

    const tag = await manager.post('/api/tags', { name: 'کاردانشی', category: 'grade' });
    expect(tag.status).toBe(201);
    otherTagId = (tag.body as { data: { id: string } }).data.id;

    const other = await manager.post('/api/exercises', {
      title: 'راهنمای هنرستان — کارت پایهٔ خارج دامنه',
      format: 'instruction',
      tag_ids: [TAG_ODD, otherTagId],
      published: true
    });
    expect(other.status).toBe(201);
    otherCardId = (other.body as { data: { id: string } }).data.id;
  });

  it('فیلتر grade: کلید دوره → اعضا؛ شناسهٔ برچسب → خودش؛ اجتماع؛ کلید دورهٔ حذف‌شده نادیده', async () => {
    const byBand = await manager.get('/api/exercises?grade=band_primary');
    const primaryItems = (byBand.body as { data: { items: { id: string }[] } }).data.items;
    expect(primaryItems.map((i) => i.id)).toContain(primaryCardId);
    expect(primaryItems.map((i) => i.id)).not.toContain(otherCardId); // خارج این دوره

    // دورهٔ بدون کارت — خالی (پیش‌دبستانی)
    const byPreschool = await manager.get('/api/exercises?grade=band_preschool');
    expect((byPreschool.body as { data: { items: { id: string }[] } }).data.items).toEqual([]);

    const byId = await manager.get(`/api/exercises?grade=${TAG_GRADE_5}`);
    expect((byId.body as { data: { items: { id: string }[] } }).data.items.map((i) => i.id)).toContain(primaryCardId);

    const byOtherId = await manager.get(`/api/exercises?grade=${otherTagId}`);
    const otherItems = (byOtherId.body as { data: { items: { id: string }[] } }).data.items;
    expect(otherItems.map((i) => i.id)).toContain(otherCardId);
    expect(otherItems.map((i) => i.id)).not.toContain(primaryCardId);

    // اجتماع: دبستان + سایر پایه‌ها → هر دو کارت
    const union = await manager.get(`/api/exercises?grade=band_primary,${otherTagId}`);
    const unionItems = (union.body as { data: { items: { id: string }[] } }).data.items;
    expect(unionItems.map((i) => i.id)).toContain(primaryCardId);
    expect(unionItems.map((i) => i.id)).toContain(otherCardId);

    // کلید دورهٔ حذف‌شده (متوسطه) دیگر کلید معتبر نیست → نادیده → بدون شرط پایه
    const legacyBand = await manager.get('/api/exercises?grade=band_middle');
    expect(legacyBand.status).toBe(200);
    const legacyItems = (legacyBand.body as { data: { items: { id: string }[] } }).data.items;
    expect(legacyItems.map((i) => i.id)).toContain(primaryCardId);
    expect(legacyItems.map((i) => i.id)).toContain(otherCardId);

    // کلید ناشناخته → بدون شرط، همان‌طور که disorder کلید ناشناخته را نادیده می‌گیرد
    const unknown = await manager.get('/api/exercises?grade=band_nope');
    expect(unknown.status).toBe(200);
  });

  it('جمع ستون‌های درخت واحد: اختلال و پایه هم‌زمان (AND بین ستون‌ها — مثل منو)', async () => {
    const both = await manager.get('/api/exercises?disorder=fam_learning&grade=band_primary');
    const bothItems = (both.body as { data: { items: { id: string }[] } }).data.items;
    expect(bothItems.map((i) => i.id)).toContain(primaryCardId);
    expect(bothItems.map((i) => i.id)).not.toContain(otherCardId); // پایه درست اما خانوادهٔ دیگر

    const narrow = await manager.get('/api/exercises?disorder=fam_behavior&grade=band_primary');
    expect((narrow.body as { data: { items: { id: string }[] } }).data.items).toEqual([]); // هیچ کارتی هر دو شرط ندارد
  });

  it('meta: gradeFacets و درخت واحد بدون دوره‌های متوسطه', async () => {
    const res = await manager.get('/api/exercises/meta');
    expect(res.status).toBe(200);
    const data = (res.body as { data: { gradeFacets: Record<string, number>; taxonomyTree: { key: string; domains: { key: string; leaves: { tagId?: string }[] }[] }[] } }).data;
    // هر کارت فقط یک برچسب از گروه خودش دارد → شمارندهٔ distinct = ۱
    expect(data.gradeFacets['band_primary']).toBeGreaterThanOrEqual(1);
    expect(data.gradeFacets['band_other']).toBeGreaterThanOrEqual(1); // کارت با برچسب خارج دامنه
    expect(data.gradeFacets['band_middle']).toBeUndefined(); // دورهٔ حذف‌شده شمارنده ندارد
    expect(data.gradeFacets['band_high']).toBeUndefined();
    // درخت واحد: ستون پایه با برگ‌های DB واقعی — «پنجم» زیر دورهٔ دبستان
    const gradePillar = data.taxonomyTree.find((p) => p.key === 'grade')!;
    const primary = gradePillar.domains.find((d) => d.key === 'band_primary')!;
    expect(primary.leaves.some((l) => l.tagId === TAG_GRADE_5)).toBe(true);
    // دوره‌های متوسطه در درخت نیستند؛ برچسب خارج دامنه زیر «سایر پایه‌ها»
    expect(gradePillar.domains.some((d) => d.key === 'band_middle')).toBe(false);
    expect(gradePillar.domains.some((d) => d.key === 'band_high')).toBe(false);
    const others = gradePillar.domains.find((d) => d.key === 'band_other')!;
    expect(others.leaves.some((l) => l.tagId === otherTagId)).toBe(true);
  });
});

/**
 * تست‌های e2e — -exercise-packages
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// e2e--exercise-packages.test.ts — بانک تمرین ۲.۰ + اتصال به پروفایل
// بستهٔ تمرینی (CRUD + انتشار) / پیشنهاد برچسب‌محور / بستهٔ تکلیف (batch) / ارسال پنل با لینک امن
// / یادآوری (dedup دقیقه) / گارد تمرین پیش‌نویس / آمار مصرف / RBAC سه نقش

import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, asRole, createStudent } from '../../test/harness';

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

const ADHD_TAG = 'aaaaaaaa-0000-4000-8000-000000000004';

interface PackageRec {
  id: string;
  title: string;
  description: string | null;
  published: boolean;
  tags: { id: string; name: string }[];
  items: { exerciseId: string; exerciseTitle: string; position: number }[];
  sendCount: number;
}

interface ExerciseRec {
  id: string;
  title: string;
  published: boolean;
  assignCount: number;
}

interface BatchRec {
  id: string;
  studentId: string;
  packageId: string | null;
  title: string;
  sentAt: string | null;
  sentCount: number;
  items: {
    assignmentId: string;
    exerciseId: string;
    exerciseTitle: string;
    status: string;
    submission: { id: string; filename: string | null } | null;
  }[];
}

describe('بستهٔ تمرینی: CRUD و انتشار', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Awaited<ReturnType<typeof asRole>>;
  let secretary: Awaited<ReturnType<typeof asRole>>;
  let ex1 = '';
  let ex2 = '';
  let pkgId = '';

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
    secretary = await asRole(A, 'secretary');
    ex1 = dataOf<ExerciseRec>(
      await manager.post('/api/exercises', { title: 'تمرین ماساژ دست', format: 'instruction', tag_ids: [ADHD_TAG] })
    ).id;
    ex2 = dataOf<ExerciseRec>(
      await manager.post('/api/exercises', { title: 'کاربرگ خط‌خطی توجه', format: 'worksheet', tag_ids: [ADHD_TAG] })
    ).id;
  });

  it('منشی بستهٔ دو‌تمرینه با برچسب می‌سازد (همگانی) — ترتیب آیتم‌ها حفظ می‌شود', async () => {
    const res = await secretary.post('/api/exercises/packages', {
      title: 'بستهٔ توجه خانه',
      description: 'روزی ۱۰ دقیقه',
      exercise_ids: [ex1, ex2],
      tag_ids: [ADHD_TAG]
    });
    expect(res.status).toBe(201);
    const pkg = dataOf<PackageRec>(res);
    expect(pkg.title).toBe('بستهٔ توجه خانه');
    expect(pkg.published).toBe(true);
    expect(pkg.items.map((i) => i.exerciseId)).toEqual([ex1, ex2]);
    expect(pkg.tags.some((t) => t.id === ADHD_TAG)).toBe(true);
    pkgId = pkg.id;
  });

  it('بسته با تمرین ناموجود → ۴۰۴؛ بستهٔ بدون تمرین → ۴۰۰', async () => {
    const bad = await manager.post('/api/exercises/packages', {
      title: 'بستهٔ خیالی',
      exercise_ids: ['00000000-0000-4000-8000-0000000000aa']
    });
    expect(bad.status).toBe(404);

    const empty = await manager.post('/api/exercises/packages', { title: 'بستهٔ خالی', exercise_ids: [] });
    expect(empty.status).toBe(400);
  });

  it('ویرایش آیتم‌ها/انتشار + حذف نرم', async () => {
    const upd = await manager.patch(`/api/exercises/packages/${pkgId}`, { published: false });
    expect(upd.status).toBe(200);
    expect(dataOf<PackageRec>(upd).published).toBe(false);

    const back = await manager.patch(`/api/exercises/packages/${pkgId}`, { published: true });
    expect(dataOf<PackageRec>(back).published).toBe(true);

    const tmp = dataOf<PackageRec>(
      await manager.post('/api/exercises/packages', { title: 'بستهٔ موقت', exercise_ids: [ex1] })
    );
    const del = await manager.delete(`/api/exercises/packages/${tmp.id}`);
    expect(del.status).toBe(200);
    const gone = await manager.get(`/api/exercises/packages/${tmp.id}`);
    expect(gone.status).toBe(404);
  });
});

describe('پیشنهاد برچسب‌محور + بستهٔ تکلیف + ارسال پنل', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Awaited<ReturnType<typeof asRole>>;
  let therapist: Awaited<ReturnType<typeof asRole>>;
  let secretary: Awaited<ReturnType<typeof asRole>>;
  let studentId = '';
  let ex1 = '';
  let ex2 = '';
  let draftEx = '';
  let pkgId = '';
  let batchId = '';

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
    therapist = await asRole(A, 'therapist');
    secretary = await asRole(A, 'secretary');
    const s = await createStudent(manager, { first_name: 'آرش', last_name: 'تمرین‌خانه' });
    studentId = s.id;
    A.sql.prepare(`INSERT OR IGNORE INTO student_tags (student_id, tag_id) VALUES (?, ?)`).run(studentId, ADHD_TAG);
    A.sql
      .prepare(
        `INSERT INTO bot_links (id, code, student_id, chat_id, status, created_by, created_at, updated_at)
         VALUES ('bb000000-7900-4000-8000-000000000001', 'M79CODE1', ?, '9179', 'linked', 'seed', datetime('now'), datetime('now'))`
      )
      .run(studentId);
    ex1 = dataOf<ExerciseRec>(
      await manager.post('/api/exercises', { title: 'بازی چرتکهٔ توجه', format: 'game', tag_ids: [ADHD_TAG] })
    ).id;
    ex2 = dataOf<ExerciseRec>(
      await manager.post('/api/exercises', { title: 'کاربرگ دنبالهٔ عدد', format: 'worksheet', tag_ids: [ADHD_TAG] })
    ).id;
    draftEx = dataOf<ExerciseRec>(
      await manager.post('/api/exercises', { title: 'تمرین پیش‌نویس', format: 'worksheet', published: false })
    ).id;
    pkgId = dataOf<PackageRec>(
      await secretary.post('/api/exercises/packages', {
        title: 'بستهٔ ADHD خانه',
        exercise_ids: [ex1, ex2],
        tag_ids: [ADHD_TAG]
      })
    ).id;
  });

  it('پیشنهاد: تمرین/بستهٔ برچسب‌دار ★ سر فهرست با matched؛ شامل آمار مصرف', async () => {
    const sug = dataOf<{ exercises: { exercise: ExerciseRec; matched: { id: string }[]; score: number }[]; packages: { pkg: PackageRec; score: number }[] }>(
      await therapist.get(`/api/students/${studentId}/exercises/suggest`)
    );
    expect(sug.exercises.length).toBeGreaterThanOrEqual(2);
    expect(sug.exercises[0].score).toBeGreaterThanOrEqual(1);
    expect(sug.exercises[0].matched.some((m) => m.id === ADHD_TAG)).toBe(true);
    expect(sug.exercises.every((s) => s.exercise.published)).toBe(true);
    const top = sug.packages.find((p) => p.pkg.id === pkgId);
    expect(top?.score).toBeGreaterThanOrEqual(1);
  });

  it('بستهٔ تکلیف از بستهٔ آماده → دو تکلیف + آمار مصرف تمرین و بسته بالا می‌رود', async () => {
    const res = await therapist.post(`/api/students/${studentId}/exercises/batches`, {
      package_id: pkgId,
      note: 'روزی ده دقیقه'
    });
    expect(res.status).toBe(201);
    const batch = dataOf<BatchRec>(res);
    expect(batch.packageId).toBe(pkgId);
    expect(batch.items.length).toBe(2);
    expect(batch.items.every((i) => i.status === 'assigned')).toBe(true);
    batchId = batch.id;

    const ex1Rec = dataOf<ExerciseRec>(await manager.get(`/api/exercises/${ex1}`));
    expect(ex1Rec.assignCount).toBe(1);
    const pkg = dataOf<PackageRec>(await manager.get(`/api/exercises/packages/${pkgId}`));
    expect(pkg.sendCount).toBe(1);
  });

  it('تمرین پیش‌نویس در ارسال مستقیم → ۴۰۹؛ دانش‌آموز ناموجود → ۴۰۴', async () => {
    const bad = await therapist.post(`/api/students/${studentId}/exercises/batches`, { exercise_ids: [draftEx] });
    expect(bad.status).toBe(409);
    const ghost = await therapist.post('/api/students/00000000-0000-4000-8000-0000000000bb/exercises/batches', { exercise_ids: [ex1] });
    expect(ghost.status).toBe(404);
  });

  it('ارسال پنل → پیام به چت ولیّ + sent_at؛ دوباره در همان دقیقه → dedup sent=۰ (یادآوری)', async () => {
    const send = await therapist.post(`/api/exercises/batches/${batchId}/send`, {});
    expect(send.status).toBe(200);
    const out = dataOf<{ sent: number; targets: string[] }>(send);
    expect(out.sent).toBeGreaterThanOrEqual(1);
    expect(out.targets).toContain('9179');

    const mine = (await manager.get(`/api/students/${studentId}/exercises/batches`));
    const list = dataOf<BatchRec[]>(mine);
    const found = list.find((b) => b.id === batchId)!;
    expect(found.sentAt).toBeTruthy();
    expect(found.sentCount).toBe(out.sent);

    // یادآوری فوری — dedup دقیقه
    const again = await therapist.post(`/api/exercises/batches/${batchId}/send`, {});
    expect(dataOf<{ sent: number }>(again).sent).toBe(0);
  });

  it('فهرست تب پروفایل — بسته با وضعیت آیتم‌ها؛ منشی هم دسترسی دارد', async () => {
    const list = dataOf<BatchRec[]>(await secretary.get(`/api/students/${studentId}/exercises/batches`));
    const found = list.find((b) => b.id === batchId)!;
    expect(found.title).toBe('بستهٔ ADHD خانه');
    expect(found.items.length).toBe(2);
    expect(found.items.every((i) => i.status === 'assigned')).toBe(true);
  });

  it('بازگشتی خانواده (بات) → وضعیت آیتم done می‌شود و در تب پروفایل دیده می‌شود', async () => {
    const list0 = dataOf<BatchRec[]>(await manager.get(`/api/students/${studentId}/exercises/batches`));
    const assignmentId = list0.find((b) => b.id === batchId)!.items[0].assignmentId;

    // حلقهٔ بازگشت خانواده فقط از مسیر بات است — سرویس مستقیم (الگوی تست )
    const { MockD1 } = await import('../../test/mock-d1');
    const { createDb } = await import('@core/db');
    const { createExerciseBankService } = await import('@domain/exercise-bank');
    const { createAuditWriter } = await import('@core/audit');
    const { createD1ObjectStore } = await import('@core/storage');
    const svc = createExerciseBankService({
      db: createDb(new MockD1(A.sql) as unknown as D1Database),
      audit: createAuditWriter(createDb(new MockD1(A.sql) as unknown as D1Database)),
      logger: { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined, child: () => ({ debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined, child: () => ({ debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined }) }) } as never,
      storage: createD1ObjectStore(createDb(new MockD1(A.sql) as unknown as D1Database)),
      downloadSecret: 'x'
    });
    const b64 = (u8: Uint8Array) => { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s); };
    await svc.addSubmission(
      { assignmentId, studentId, file: { filename: 'kar.jpg', mimeType: 'image/jpeg', contentB64: b64(new Uint8Array([9, 9])) }, note: 'انجام شد' },
      { staffId: 'family', email: 'f@x', role: 'manager', displayName: 'خانواده' }
    );

    const list = dataOf<BatchRec[]>(await manager.get(`/api/students/${studentId}/exercises/batches`));
    const item = list.find((b) => b.id === batchId)!.items.find((i) => i.assignmentId === assignmentId)!;
    expect(item.status).toBe('done');
    expect(item.submission?.filename).toBe('kar.jpg');
  });

  it('RBAC — بدون توکن → ۴۰۱', async () => {
    const { Api } = await import('../../test/harness');
    const anon = await new Api(A).get(`/api/students/${studentId}/exercises/batches`);
    expect(anon.status).toBe(401);
  });
});

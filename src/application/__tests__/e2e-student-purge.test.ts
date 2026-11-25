/**
 * گیت data-003 (۱.۲۷.۸۳، sdt160) — سیاست صریح report_snapshots در حذف دانش‌آموز:
 * حذفِ دانش‌آموزِ بی‌سابقه (مسیر عادی) snapshots را هم پاک می‌کند؛ حذف قطعی force روی
 * پروندهٔ باسابقه هم snapshots را پاک می‌کند؛ و حذفِ رد‌شده (Conflict 409) چیزی پاک نمی‌کند —
 * یعنی snapshot فقط با حذف واقعی پرونده می‌رود (سیاست ثبت‌شده در TABLE_POLICIES).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, asRole, makeNationalId, MANAGER_ID } from '../../test/harness';

/** دانش‌آموز مستقیم از DB — ردیف مادر برای snapshots */
async function createStudent(A: ReturnType<typeof createTestApp>): Promise<string> {
  const id = crypto.randomUUID();
  await A.env.DB.prepare(
    `INSERT INTO students (id, national_id, first_name, last_name) VALUES (?, ?, ?, ?)`
  ).bind(id, makeNationalId(), 'نمونه', 'حذف‌شدنی').run();
  return id;
}

async function seedSnapshot(A: ReturnType<typeof createTestApp>, studentId: string): Promise<void> {
  await A.env.DB.prepare(
    `INSERT INTO report_snapshots (id, student_id, template_key, sections_json, content_hash, report_no)
     VALUES (?, ?, 'pathway_report', '{}', 'deadbeef', ?)`
  ).bind(crypto.randomUUID(), studentId, `1405-T-${crypto.randomUUID().slice(0, 8)}`).run();
}

async function snapshotExists(A: ReturnType<typeof createTestApp>, studentId: string): Promise<boolean> {
  const row = await A.env.DB.prepare(`SELECT id FROM report_snapshots WHERE student_id = ? LIMIT 1`).bind(studentId).first();
  return row !== null;
}

/** سابقهٔ غیرمالی — پیگیری متعلق به پرونده (منابع مالی حتی force را هم می‌بندند — سیاست ثبت‌شده) */
async function seedHistoryRef(A: ReturnType<typeof createTestApp>, studentId: string): Promise<void> {
  await A.env.DB.prepare(
    `INSERT INTO followups (id, entity_type, entity_id, student_id, title, assignee_id, created_by)
     VALUES (?, 'student', ?, ?, 'پیگیری آزمون', ?, ?)`
  ).bind(crypto.randomUUID(), studentId, studentId, MANAGER_ID, MANAGER_ID).run();
}

describe('سیاست report_snapshots در حذف دانش‌آموز (data-003 — ۱.۲۷.۸۳)', () => {
  let A: ReturnType<typeof createTestApp>;

  beforeAll(() => {
    A = createTestApp();
  });

  it('حذف عادیِ دانش‌آموز بی‌سابقه — snapshots هم پاک می‌شوند', async () => {
    const mgr = await asRole(A, 'manager');
    const id = await createStudent(A);
    await seedSnapshot(A, id);
    const res = await mgr.delete(`/api/students/${id}`);
    expect(res.status).toBeLessThan(300);
    expect(await snapshotExists(A, id)).toBe(false);
  });

  it('حذف قطعی force روی پروندهٔ باسابقه — snapshots هم پاک می‌شوند', async () => {
    const mgr = await asRole(A, 'manager');
    const id = await createStudent(A);
    await seedHistoryRef(A, id);
    await seedSnapshot(A, id);
    expect(await snapshotExists(A, id)).toBe(true);
    const res = await mgr.delete(`/api/students/${id}?force=true`);
    expect(res.status).toBeLessThan(300);
    expect(await snapshotExists(A, id)).toBe(false);
  });

  it('حذفِ رد‌شده (سابقه دارد، بدون force → ۴۰۹) — چیزی پاک نمی‌شود', async () => {
    const mgr = await asRole(A, 'manager');
    const id = await createStudent(A);
    await seedHistoryRef(A, id);
    await seedSnapshot(A, id);
    const res = await mgr.delete(`/api/students/${id}`);
    expect(res.status).toBe(409);
    expect(await snapshotExists(A, id)).toBe(true);
  });
});

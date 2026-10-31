import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, asRole, createStudent } from '../../test/harness';

// ─── رگرسیون «آدرس عمومی سایت تنظیم نشده»: PUBLIC_BASE_URL خالی نباید ارسال چک‌لیست را بشکند ───
// ریشهٔ باگ پروداکشن: PUBLIC_BASE_URL = "" در wrangler.toml → buildEnv رشتهٔ خالی را پاس می‌داد
// → mintFillLink خطای ConflictError «آدرس عمومی سایت تنظیم نشده است» می‌داد.

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

async function seedChecklistWithLinkedFamily(
  A: ReturnType<typeof createTestApp>,
  manager: Awaited<ReturnType<typeof asRole>>,
  therapist: Awaited<ReturnType<typeof asRole>>
) {
  const s = await createStudent(manager, { first_name: 'علی', last_name: 'آدرس‌عمومی' });
  A.sql
    .prepare(
      `INSERT INTO bot_links (id, code, student_id, chat_id, status, created_by, created_at, updated_at)
       VALUES ('bb000000-9800-4000-8000-000000000001', 'M98LINK1', ?, '9801', 'linked', 'seed', datetime('now'), datetime('now'))`
    )
    .run(s.id);
  const types = dataOf<Array<{ id: string; key: string }>>(
    await manager.get('/api/case-events/types?active=true')
  );
  const sldReadId = types.find((t) => t.key === 'ce-sld-read-v1')!.id;
  const ev = await therapist.post(`/api/students/${s.id}/case-events`, {
    eventTypeId: sldReadId,
    values: {},
    draft: false
  });
  expect(ev.status).toBe(201);
  return dataOf<{ id: string }>(ev).id;
}

describe('PUBLIC_BASE_URL خالی/فاصله‌دار = تنظیم‌نشده', () => {
  it('رشتهٔ خالی: ارسال چک‌لیست → ۴۰۹ با پیام راهنمای آدرس عمومی (رفتار صریح، نه لینک خراب)', async () => {
    const A = createTestApp(undefined, { publicBaseUrl: '' });
    const manager = await asRole(A, 'manager');
    const therapist = await asRole(A, 'therapist');
    const eventId = await seedChecklistWithLinkedFamily(A, manager, therapist);

    const res = await therapist.post(`/api/case-events/${eventId}/send`, { audience: 'family' });
    expect(res.status).toBe(409);
    expect((res.body as { message: string }).message).toContain('آدرس عمومی');
  });

  it('رشتهٔ فاصله‌دار: همان ۴۰۹ صریح', async () => {
    const A = createTestApp(undefined, { publicBaseUrl: '   ' });
    const manager = await asRole(A, 'manager');
    const therapist = await asRole(A, 'therapist');
    const eventId = await seedChecklistWithLinkedFamily(A, manager, therapist);

    const res = await therapist.post(`/api/case-events/${eventId}/send`, { audience: 'family' });
    expect(res.status).toBe(409);
    expect((res.body as { message: string }).message).toContain('آدرس عمومی');
  });

  it('صدور لینک معلم (teacher-link) هم با آدرس خالی ۴۰۹ می‌گیرد', async () => {
    const A = createTestApp(undefined, { publicBaseUrl: '' });
    const manager = await asRole(A, 'manager');
    const therapist = await asRole(A, 'therapist');
    const eventId = await seedChecklistWithLinkedFamily(A, manager, therapist);

    const res = await therapist.post(`/api/case-events/${eventId}/teacher-link`, {
      teacher_name: 'خانم آزمون'
    });
    expect(res.status).toBe(409);
    expect((res.body as { message: string }).message).toContain('آدرس عمومی');
  });
});

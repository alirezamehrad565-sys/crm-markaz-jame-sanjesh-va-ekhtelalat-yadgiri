import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, asRole, Api } from '../../test/harness';

// ─── دسترسی درمانگر برای ساخت لینک دعوت خانواده و معلم ───
// درمانگر می‌تواند کد/لینک اتصال بسازد (خانواده + معلم کلاس) و نام‌کاربری بات را بخواند؛
// لغو کد و درون‌ریزی همچنان در انحصار دفتر (مدیر/منشی) است.

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

const SCHOOL_ID = '10000000-0000-0000-0000-000000000001'; // دبستان شهید مطهری (seed)
const STUDENT_ID = '20000000-0000-0000-0000-000000000001'; // علی محمدی (seed)

describe('دسترسی درمانگر — لینک دعوت خانواده و معلم', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;
  let therapist: Api;
  let classId: string;

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
    therapist = await asRole(A, 'therapist');
    classId = dataOf<{ id: string }>(
      await manager.post('/api/classes', { school_id: SCHOOL_ID, name: 'پنجم الف', teacher_name: 'خانم رضایی', teacher_phone: '09131234567' })
    ).id;
  });

  it('درمانگر برای خانوادهٔ دانش‌آموز لینک اتصال می‌سازد (کد ۶ نویسه‌ای)', async () => {
    const res = await therapist.post('/api/notifications/links', { student_id: STUDENT_ID });
    expect(res.status).toBe(201);
    const link = dataOf<{ id: string; code: string; deepLink: string | null }>(res);
    expect(link.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(link.id).toBeTruthy();
  });

  it('درمانگر برای معلم کلاس کد اتصال می‌سازد', async () => {
    const res = await therapist.post('/api/notifications/class-links', { class_id: classId });
    expect(res.status).toBe(201);
    const link = dataOf<{ id: string; code: string }>(res);
    expect(link.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });

  it('درمانگر نام‌کاربری بات را می‌خواند (برای ساخت لینک دعوت)', async () => {
    const res = await therapist.get('/api/notifications/bot-username');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
  });

  it('لغو کد معلم همچنان در انحصار دفتر است (درمانگر ۴۰۳)', async () => {
    const link = dataOf<{ id: string }>(await manager.post('/api/notifications/class-links', { class_id: classId }));
    expect((await therapist.delete(`/api/notifications/class-links/${link.id}`)).status).toBe(403);
    expect((await manager.delete(`/api/notifications/class-links/${link.id}`)).status).toBe(200);
  });

  it('درمانگر لینک همکار (staff-link) نمی‌سازد', async () => {
    expect((await therapist.post('/api/notifications/staff-links', { staff_id: '00000000-0000-0000-0000-000000000003' })).status).toBe(403);
  });
});

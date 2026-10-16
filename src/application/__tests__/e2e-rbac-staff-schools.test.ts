/**
 * تست‌های e2e — rbac-staff-schools
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// e2e-rbac-staff-schools.test.ts — تفکیک نقش‌ها
// تنظیم کارکنان (حساب‌ها) و ساختار مدارس/کلاس‌ها فقط مدیر — معلم/منشی 403؛ خواندن آزاد

import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, asRole, makeNationalId } from '../../test/harness';

describe('تنظیم کارکنان فقط مدیر', () => {
  let A: ReturnType<typeof createTestApp>;

  beforeAll(async () => {
    A = createTestApp();
  });

  it('درمانگر و منشی — ساخت/ویرایش کارمند 403', async () => {
    const ther = await asRole(A, 'therapist');
    const sec = await asRole(A, 'secretary');

    const body = {
      full_name: 'کارمند تازه',
      phone: '09121119999',
      national_id: makeNationalId(),
      username: `t${Date.now()}`,
      password: '1234',
      role: 'therapist'
    };

    expect((await ther.post('/api/staff', body)).status).toBe(403);
    expect((await sec.post('/api/staff', body)).status).toBe(403);

    const list = await sec.get('/api/staff');
    expect(list.status).toBe(200);
    const target = (list.body as { data: Array<{ id: string }> }).data[0];

    expect((await ther.patch(`/api/staff/${target.id}`, { full_name: 'هک' })).status).toBe(403);
    expect((await sec.patch(`/api/staff/${target.id}`, { full_name: 'هک' })).status).toBe(403);
    expect((await sec.post(`/api/staff/${target.id}/deactivate`)).status).toBe(403);
  });

  it('مدیر — ساخت کارمند 201 و فعال/غیرفعال مجاز', async () => {
    const mgr = await asRole(A, 'manager');
    const created = await mgr.post('/api/staff', {
      full_name: 'کارمند مدیر',
      phone: '09121119888',
      national_id: makeNationalId(),
      username: `m${Date.now()}`,
      password: '1234',
      role: 'secretary'
    });
    expect(created.status).toBe(201);
    const id = (created.body as { data: { id: string } }).data.id;
    expect((await mgr.post(`/api/staff/${id}/deactivate`)).status).toBe(200);
    expect((await mgr.post(`/api/staff/${id}/activate`)).status).toBe(200);
  });
});

describe('ساختار مدارس/کلاس‌ها فقط مدیر', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: Api;
  let sec: Api;

  interface Api {
    get(url: string): Promise<{ status: number; body: unknown }>;
    post(url: string, body?: unknown): Promise<{ status: number; body: unknown }>;
    patch(url: string, body?: unknown): Promise<{ status: number; body: unknown }>;
  }

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
    sec = await asRole(A, 'secretary');
  });

  it('منشی/درمانگر — ساخت مدرسه و کلاس 403؛ خواندن آزاد', async () => {
    const ther = await asRole(A, 'therapist');
    const schoolBody = { name: `مدرسهٔ ${Date.now()}`, kind: 'school' };

    expect((await sec.post('/api/schools', schoolBody)).status).toBe(403);
    expect((await ther.post('/api/schools', schoolBody)).status).toBe(403);

    // خواندن آزاد — فرم‌ها به لیست مدارس/کلاس‌ها نیاز دارند
    expect((await ther.get('/api/schools')).status).toBe(200);
    expect((await sec.get('/api/classes')).status).toBe(200);

    const schools = (await mgr.get('/api/schools')).body as { data: Array<{ id: string }> };
    const classBody = { school_id: schools.data[0].id, name: `کلاس ${Date.now()}` };
    expect((await sec.post('/api/classes', classBody)).status).toBe(403);
    expect((await ther.post('/api/classes', classBody)).status).toBe(403);
  });

  it('مدیر — ساخت مدرسه و کلاس مجاز؛ ویرایش هم فقط مدیر', async () => {
    const created = await mgr.post('/api/schools', { name: `مدرسهٔ مدیر ${Date.now()}`, kind: 'school' });
    expect(created.status).toBe(201);
    const school = (created.body as { data: { id: string } }).data;

    expect((await sec.patch(`/api/schools/${school.id}`, { name: 'تغییر منشی' })).status).toBe(403);
    expect((await mgr.patch(`/api/schools/${school.id}`, { name: 'تغییر مدیر' })).status).toBe(200);

    const cls = await mgr.post('/api/classes', { school_id: school.id, name: 'کلاس مدیر', teacher_name: 'معلم مدرسه' });
    expect(cls.status).toBe(201);
    expect((await sec.post(`/api/classes/${(cls.body as { data: { id: string } }).data.id}/deactivate`)).status).toBe(403);
  });
});

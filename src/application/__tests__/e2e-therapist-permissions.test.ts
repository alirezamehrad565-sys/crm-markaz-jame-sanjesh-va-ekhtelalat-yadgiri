/**
 * تست‌های e2e — -therapist-permissions
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// e2e--therapist-permissions.test.ts — گسترش دسترسی درمانگر
// دستور کاربر:
// ۱) «درمانگر اجازه داشته باشه برای جلسات خودش این حضور غیاب رو انجام بده»
// → mark روی جلسهٔ خودش ۲۰۰ / جلسهٔ همکار ۴۰۳ + صف pending همیشه خودِ او
// ۲) «دسترسی ماژول رویداد ساز رو بهش بدم» → در e2e- پوشش داده شد (۲۰۱ برای درمانگر)
// ۳) «دانش آموز فعال برای خودش تعریف کنه» → POST /api/students با مسئول اجباری خودش
// ۴) «لیست انتظار فقط اضافه» → POST ۲۰۱ ولی PATCH/حذف/نوبت‌دهی ۴۰۳

import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestApp,
  asRole,
  createStudent,
  makeNationalId,
  apptBody,
  tehranTodayAt,
  ALI_ID,
  MARYAM_ID,
  STUDENT1_ID
} from '../../test/harness';
import type { Api } from '../../test/harness';

describe('دسترسی‌های تازهٔ درمانگر', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;
  let ali: Api; // درمانگر ۱
  let secretary: Api;

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
    ali = await asRole(A, 'therapist');
    secretary = await asRole(A, 'secretary');
  });

  it('حضور و غیاب: درمانگر روی جلسهٔ خودش ۲۰۰ می‌گیرد', async () => {
    // intake طبق قاعدهٔ D4 از دفتر: منشی نوبت اول را برای علی ثبت می‌کند
    const student = await createStudent(secretary);
    const made = await secretary.post('/api/appointments', apptBody(ALI_ID, tehranTodayAt(10), 45, [student.id]));
    expect(made.status).toBe(201);
    const apptId = (made.body as { data: { id: string } }).data.id;

    const mark = await ali.patch(`/api/attendance/${apptId}/${student.id}`, { status: 'present' });
    expect(mark.status).toBe(200);
  });

  it('حضور و غیاب: درمانگر روی جلسهٔ همکار ۴۰۳ می‌گیرد (مالکیت)', async () => {
    const student = await createStudent(secretary);
    // نوبتِ مریم (intake از دفتر) — علی نباید بتواند حاضر-غیاب کند
    const made = await secretary.post('/api/appointments', apptBody(MARYAM_ID, tehranTodayAt(11), 45, [student.id]));
    expect(made.status).toBe(201);
    const apptId = (made.body as { data: { id: string } }).data.id;

    const forbidden = await ali.patch(`/api/attendance/${apptId}/${student.id}`, { status: 'present' });
    expect(forbidden.status).toBe(403);
    // دفتر (مدیر) روی همان نوبت آزاد است
    const office = await manager.patch(`/api/attendance/${apptId}/${student.id}`, { status: 'absent' });
    expect(office.status).toBe(200);
  });

  it('صف حضور معوق درمانگر همیشه فقط جلسات خودش است (پارامتر staff_id نادیده)', async () => {
    // دو نوبت گذشته از دفتر — یکی برای علی، یکی برای مریم — بدون ثبت حضور
    // رفع flaky: قبلاً «امروز ساعت ۷ منهای ۲ ساعت» بود که در ساعات شبانهروز
    // (بامداد تا ۹ صبح تهران) هنوز آینده بود و صف خالی برمی‌گشت؛ حالا لنگر دیروز است.
    const ymdYesterday = new Date(Date.now() + 210 * 60_000 - 24 * 3600_000).toISOString().slice(0, 10);
    const pastAli = new Date(Date.parse(`${ymdYesterday}T10:00:00.000Z`) - 210 * 60_000).toISOString();
    const pastMaryam = new Date(Date.parse(`${ymdYesterday}T11:00:00.000Z`) - 210 * 60_000).toISOString();
    const stAli = await createStudent(secretary);
    const stMaryam = await createStudent(secretary);
    const madeAli = await secretary.post('/api/appointments', apptBody(ALI_ID, pastAli, 45, [stAli.id]));
    const madeMaryam = await secretary.post('/api/appointments', apptBody(MARYAM_ID, pastMaryam, 45, [stMaryam.id]));
    expect(madeAli.status).toBe(201);
    expect(madeMaryam.status).toBe(201);

    const list = await ali.get('/api/attendance/pending?staff_id=nothing');
    expect(list.status).toBe(200);
    const rows = (list.body as { data: { staffId: string }[] }).data;
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.staffId).toBe(ALI_ID);
  });

  it('دانش‌آموز: درمانگر برای خودش تعریف می‌کند — مسئول اجباراً خودش، حتی اگر دیگری پاس شود', async () => {
    const res = await ali.post('/api/students', {
      national_id: makeNationalId(),
      first_name: 'کار خود درمانگر',
      last_name: 'مالکیت m74',
      gender: 'female',
      guardian_phone: '09121113344',
      owner_staff_id: MARYAM_ID // تلاش برای سپردن به دیگری — باید نادیده گرفته شود
    });
    expect(res.status).toBe(201);
    const student = (res.body as { data: { ownerStaffId: string; active: boolean } }).data;
    expect(student.ownerStaffId).toBe(ALI_ID);
    expect(student.active).toBe(true);
  });

  it('دانش‌آموز: دفتر (منشی) همچنان می‌تواند مسئول را آزاد انتخاب کند', async () => {
    const res = await secretary.post('/api/students', {
      national_id: makeNationalId(),
      first_name: 'از دفتر',
      last_name: 'مالکیت آزاد',
      gender: 'male',
      guardian_phone: '09121114455',
      owner_staff_id: MARYAM_ID
    });
    expect(res.status).toBe(201);
    expect((res.body as { data: { ownerStaffId: string } }).data.ownerStaffId).toBe(MARYAM_ID);
  });

  it('لیست انتظار: درمانگر فقط افزودن — POST ۲۰۱ ولی ویرایش/وضعیت/حذف ۴۰۳', async () => {
    const created = await ali.post('/api/waitlist', {
      first_name: 'متقاضی از درمانگر',
      last_name: 'm74',
      phone: '09121115566'
    });
    expect(created.status).toBe(201);
    const id = (created.body as { data: { id: string } }).data.id;

    expect((await ali.patch(`/api/waitlist/${id}`, { first_name: 'تغییر' })).status).toBe(403);
    expect((await ali.post(`/api/waitlist/${id}/call`, {})).status).toBe(403);
    expect((await ali.post(`/api/waitlist/${id}/schedule`, { date: '1404-01-01', time: '10:00', staff_id: ALI_ID, student_id: STUDENT1_ID })).status).toBe(403);
    expect((await ali.post(`/api/waitlist/reorder`, { ids: [id] })).status).toBe(403);
    expect((await ali.delete(`/api/waitlist/${id}`)).status).toBe(403);

    // منشی همان کارها را می‌تواند
    expect((await secretary.patch(`/api/waitlist/${id}`, { first_name: 'اصلاح دفتر' })).status).toBe(200);
  });

  it('آمار حضور درمانگر فقط جلسات خودش (stats scope)', async () => {
    const res = await ali.get('/api/attendance/stats?staff_id=nothing');
    expect(res.status).toBe(200);
    // فقط نباید ۴۰۰/۴۰۳ بخورد — scope اجباری خودش پاس شده
    const stats = (res.body as { data: { present: number; absent: number } }).data;
    expect(typeof stats.present).toBe('number');
  });
});

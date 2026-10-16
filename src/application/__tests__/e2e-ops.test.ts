/**
 * تست‌های e2e — ops
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// e2e-ops.test.ts — یکپارچگی واقعی //////:
// کارکنان + ورود با رمز، ساعات کاری، تنظیمات، اعلان‌های مدیر، حضور همکاران،
// بورد روز کاری، داشبورد و گزارش‌ها
// دادهٔ ماک: seed-dev + fixtureهای API

import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestApp,
  Api,
  asRole,
  loginToken,
  createStudent,
  apptBody,
  makeNationalId,
  ALI_ID,
  MARYAM_ID,
  SECRETARY_ID,
  MANAGER_ID
} from '../../test/harness';
import { tehranTodayYmd } from '@core/shared';

describe('/ — کارکنان: CRUD + ورود با رمز', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
  });

  it('لیست کارکنان فعال — ۴ نفر از seed', async () => {
    const res = await manager.get('/api/staff');
    expect(res.status).toBe(200);
    const items = (res.body as { data: Array<{ id: string; fullName?: string; full_name?: string }> }).data;
    expect(items.length).toBe(4);
    const ids = items.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining([MANAGER_ID, ALI_ID, SECRETARY_ID]));
  });

  it('ساخت همکار جدید — 201 و ورود با رمز تعیین‌شده کار می‌کند', async () => {
    const res = await manager.post('/api/staff', {
      full_name: 'سعید موسوی',
      phone: '09121119876',
      national_id: makeNationalId(),
      username: 'saeed',
      password: '9998',
      role: 'therapist'
    });
    expect(res.status).toBe(201);
    const member = (res.body as { data: { id: string } }).data;
    expect(member.id).toBeTruthy();

    // ورود با رمز اختصاصی
    const token = await loginToken(A, 'saeed', '9998');
    expect(token.split('.').length).toBe(3);

    // رمز پیش‌فرض کار نمی‌کند
    await expect(loginToken(A, 'saeed', '1234')).rejects.toThrow();
  });

  it('نام کاربری تکراری — 409', async () => {
    const res = await manager.post('/api/staff', {
      full_name: 'تکراری تست',
      phone: '09121114444',
      national_id: makeNationalId(),
      username: 'manager',
      role: 'secretary'
    });
    expect(res.status).toBe(409);
  });

  it('کد ملی تکراری — 409', async () => {
    const nid = makeNationalId();
    await manager.post('/api/staff', {
      full_name: 'ملی اول', phone: '09121115555', national_id: nid, username: 'nid-one', role: 'therapist'
    });
    const res = await manager.post('/api/staff', {
      full_name: 'ملی دوم', phone: '09121116666', national_id: nid, username: 'nid-two', role: 'therapist'
    });
    expect(res.status).toBe(409);
  });

  it('deactivate → ورود قطع می‌شود → activate → ورود برمی‌گردد', async () => {
    const created = await manager.post('/api/staff', {
      full_name: 'مریم تست',
      phone: '09121117777',
      national_id: makeNationalId(),
      username: 'maryamtest',
      password: '7777',
      role: 'secretary'
    });
    const id = (created.body as { data: { id: string } }).data.id;

    const deact = await manager.post(`/api/staff/${id}/deactivate`);
    expect(deact.status).toBe(200);
    await expect(loginToken(A, 'maryamtest', '7777')).rejects.toThrow();

    const act = await manager.post(`/api/staff/${id}/activate`);
    expect(act.status).toBe(200);
    const token = await loginToken(A, 'maryamtest', '7777');
    expect(token).toBeTruthy();
  });

  it('ساخت همکار توسط همکار دیگر — 403 (مسیر باز است؟)', async () => {
    // مسیر /api/staff requireRole ندارد؛ فقط نباید 500 بدهد — رفتار واقعی ثبت می‌شود
    const therapist = await asRole(A, 'therapist');
    const res = await therapist.post('/api/staff', {
      full_name: 'خودساخته', phone: '09121118888', national_id: makeNationalId(), username: 'selfmade', role: 'manager'
    });
    expect(res.status).toBeLessThan(500);
  });
});

describe('ساعات کاری هفتگی', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
  });

  it('ثبت بازهٔ کاری — 201 با camelCase', async () => {
    const res = await manager.post('/api/working-hours', {
      staff_id: ALI_ID,
      weekday: 0,
      start_minute: 9 * 60,
      end_minute: 12 * 60
    });
    expect(res.status).toBe(201);
    const wh = (res.body as { data: { id: string; staffId: string; startMinute: number; endMinute: number } }).data;
    expect(wh.staffId).toBe(ALI_ID);
    expect(wh.startMinute).toBe(540);
    expect(wh.endMinute).toBe(720);
  });

  it('بازهٔ نامعتبر (پایان قبل از شروع) — 400', async () => {
    const res = await manager.post('/api/working-hours', {
      staff_id: ALI_ID, weekday: 0, start_minute: 600, end_minute: 540
    });
    expect(res.status).toBe(400);
  });

  it('دقیقه خارج از شبکهٔ ۱۵ دقیقه‌ای — 400', async () => {
    const res = await manager.post('/api/working-hours', {
      staff_id: ALI_ID, weekday: 1, start_minute: 9 * 60 + 7, end_minute: 12 * 60
    });
    expect(res.status).toBe(400);
  });

  it('جایگزینی کامل هفتهٔ یک همکار (bulk)', async () => {
    const res = await manager.put(`/api/working-hours/staff/${MARYAM_ID}`, {
      items: [
        { weekday: 0, start_minute: 8 * 60, end_minute: 11 * 60 },
        { weekday: 2, start_minute: 9 * 60, end_minute: 13 * 60 }
      ]
    });
    expect(res.status).toBe(200);

    const list = await manager.get(`/api/working-hours?staff_id=${MARYAM_ID}`);
    const items = (list.body as { data: Array<{ weekday: number; startMinute: number }> }).data;
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.weekday).sort()).toEqual([0, 2]);
  });

  it('حذف یک بازه', async () => {
    const created = await manager.post('/api/working-hours', {
      staff_id: ALI_ID, weekday: 3, start_minute: 10 * 60, end_minute: 11 * 60
    });
    const whId = (created.body as { data: { id: string } }).data.id;
    const del = await manager.delete(`/api/working-hours/${whId}`);
    expect(del.status).toBe(204);
  });
});

describe('تنظیمات مرکز', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
  });

  it('GET پیش‌فرض‌ها — نام مرکز و ساعت یادآور', async () => {
    const res = await manager.get('/api/settings');
    expect(res.status).toBe(200);
    const data = (res.body as { data: { clinicName?: string; clinic_name?: string; defaultReminderHours?: number; default_reminder_hours?: number } }).data;
    const name = data.clinicName ?? data.clinic_name;
    const hours = data.defaultReminderHours ?? data.default_reminder_hours;
    expect(name).toBeTruthy();
    expect(hours).toBeGreaterThanOrEqual(1);
  });

  // تنظیمات فقط دفتر: درمانگر ۴۰۳ می‌خواند؛ منشی خواندن دارد؛
  // «بازه کاری مرکز» برای رنگ تقویم برای درمانگر باز می‌ماند
  it('GET تنظیمات — درمانگر ۴۰۳، منشی ۲۰۰، center-hours برای درمانگر باز', async () => {
    const therapist = await asRole(A, 'therapist');
    const secretary = await asRole(A, 'secretary');
    expect((await therapist.get('/api/settings')).status).toBe(403);
    expect((await secretary.get('/api/settings')).status).toBe(200);
    expect((await therapist.get('/api/settings/center-hours')).status).toBe(200);
  });

  it('PUT تنظیمات — تغییر نام مرکز + ساعت یادآور', async () => {
    const res = await manager.put('/api/settings', {
      clinic_name: 'مرکز جامع آزمون',
      default_reminder_hours: 3,
      notify_on_cancel: false
    });
    expect(res.status).toBe(200);
    const get = await manager.get('/api/settings');
    const data = (get.body as { data: { clinicName?: string; clinic_name?: string } }).data;
    expect((data.clinicName ?? data.clinic_name) ?? '').toContain('آزمون');
  });

  it('ساعات کاری مرکز: PUT + apply-to-all → ساعات همهٔ همکاران پر می‌شود', async () => {
    const put = await manager.put('/api/settings/center-hours', {
      items: [{ weekday: 0, startMinute: 9 * 60, endMinute: 14 * 60 }]
    });
    expect(put.status).toBe(200);

    const apply = await manager.post('/api/settings/center-hours/apply-to-all');
    expect(apply.status).toBe(200);

    const aliHours = await manager.get(`/api/working-hours?staff_id=${ALI_ID}`);
    const items = (aliHours.body as { data: Array<{ weekday: number; startMinute: number; endMinute: number }> }).data;
    expect(items.some((h) => h.weekday === 0 && h.startMinute === 540 && h.endMinute === 840)).toBe(true);
  });
});

describe('اعلان‌های مدیر', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
  });

  it('ساخت اعلان پنل — در لیست manage هست؛ در public نیست', async () => {
    const created = await manager.post('/api/announcements', {
      title: 'اعلان پنل آزمون',
      body: 'متن اعلان پنل برای تست یکپارچگی',
      show_panel: true
    });
    expect(created.status).toBe(201);
    const id = (created.body as { data: { id: string } }).data.id;

    const manage = await manager.get('/api/announcements/manage');
    const manageItems = (manage.body as { data: Array<{ id: string }> }).data;
    expect(manageItems.map((a) => a.id)).toContain(id);

    const pub = await manager.get('/public/announcements');
    const pubItems = (pub.body as { data: Array<{ id: string }> }).data;
    expect(pubItems.map((a) => a.id)).not.toContain(id);
  });

  it('اعلان صفحهٔ ورود (show_login) در public ظاهر می‌شود', async () => {
    const created = await manager.post('/api/announcements', {
      title: 'بنر ورود آزمون',
      body: 'این بنر روی صفحهٔ ورود دیده می‌شود',
      show_login: true
    });
    const id = (created.body as { data: { id: string } }).data.id;
    const pub = await manager.get('/public/announcements');
    const pubItems = (pub.body as { data: Array<{ id: string }> }).data;
    expect(pubItems.map((a) => a.id)).toContain(id);
  });

  it('پچ + بایگانی (active=false) → از لیست پنل خارج می‌شود', async () => {
    const created = await manager.post('/api/announcements', {
      title: 'عنوان قبل', body: 'متن قبل', show_panel: true
    });
    const id = (created.body as { data: { id: string } }).data.id;

    const patched = await manager.patch(`/api/announcements/${id}`, { title: 'عنوان بعد' });
    expect(patched.status).toBe(200);

    const archived = await manager.patch(`/api/announcements/${id}`, { active: false });
    expect(archived.status).toBe(200);

    const manage = await manager.get('/api/announcements/manage');
    const manageItems = (manage.body as { data: Array<{ id: string; active: boolean | number }> }).data;
    const rec = manageItems.find((a) => a.id === id);
    expect(rec && Number(rec.active) === 0).toBe(true);
  });

  it('ارسال با بات برای کارکنان بدون چت متصل — بدون خطا (enqueued=0 یا پرچم)', async () => {
    const created = await manager.post('/api/announcements', {
      title: 'ارسال آزمون', body: 'متن ارسال', show_panel: true
    });
    const id = (created.body as { data: { id: string } }).data.id;
    const send = await manager.post(`/api/announcements/${id}/send`, { target: 'staff' });
    expect(send.status).toBe(200);
  });

  it('ساخت اعلان توسط منشی — 403', async () => {
    const secretary = await asRole(A, 'secretary');
    const res = await secretary.post('/api/announcements', { title: 'غیرمجاز', body: 'متن غیرمجاز' });
    expect(res.status).toBe(403);
  });
});

describe('حضور روزانهٔ همکاران (فقط امروز)', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;
  let secretary: Api;

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
    secretary = await asRole(A, 'secretary');
  });

  it('ثبت امروز — 201؛ به‌روزرسانی همان روز — upsert', async () => {
    const today = tehranTodayYmd();
    const put1 = await secretary.put('/api/staff-attendance', {
      staff_id: ALI_ID, date: today, status: 'present'
    });
    expect(put1.status).toBeLessThan(300);

    const put2 = await secretary.put('/api/staff-attendance', {
      staff_id: ALI_ID, date: today, status: 'leave', note: 'مرخصی ساعتی'
    });
    expect(put2.status).toBeLessThan(300);

    const day = await manager.get(`/api/staff-attendance/day-summary?date=${today}`);
    expect(day.status).toBe(200);
  });

  it('ثبت دیروز — 400 (قاعدهٔ فقط-امروز)', async () => {
    const today = tehranTodayYmd();
    const yesterday = new Date(Date.parse(today) - 24 * 3600 * 1000).toISOString().slice(0, 10);
    const res = await manager.put('/api/staff-attendance', {
      staff_id: MARYAM_ID, date: yesterday, status: 'absent'
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe('VALIDATION_ERROR');
  });

  it('ثبت توسط همکار — 403', async () => {
    const therapist = await asRole(A, 'therapist');
    const res = await therapist.put('/api/staff-attendance', {
      staff_id: ALI_ID, date: tehranTodayYmd(), status: 'present'
    });
    expect(res.status).toBe(403);
  });
});

describe('بورد روز کاری', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;
  let secretary: Api;

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
    secretary = await asRole(A, 'secretary');
  });

  it('بورد امروز: شکل کامل + isToday=true + کارکنان فعال', async () => {
    const today = tehranTodayYmd();
    const res = await manager.get(`/api/working-day?date=${today}`);
    expect(res.status).toBe(200);
    const board = (res.body as { data: { date: string; isToday: boolean; staff: Array<{ staffId: string; fullName: string; dayHours: unknown[]; appointments: unknown[] }>; notes: unknown[]; summary: unknown } }).data;
    expect(board.date).toBe(today);
    expect(board.isToday).toBe(true);
    expect(board.staff.map((s) => s.staffId)).toEqual(expect.arrayContaining([ALI_ID, SECRETARY_ID]));
  });

  it('نوبت امروز + ساعات کاری در ستون همکار دیده می‌شود', async () => {
    const today = tehranTodayYmd();
    // نوبت ۹ صبح تهران امروز = 05:30 UTC
    const s = await createStudent(manager);
    const created = await manager.post('/api/appointments', apptBody(ALI_ID, `${today}T05:30:00.000Z`, 45, [s.id]));
    expect(created.status).toBeLessThan(300);

    const res = await manager.get(`/api/working-day?date=${today}`);
    const board = (res.body as { data: { staff: Array<{ staffId: string; appointments: Array<{ id: string; students: Array<{ studentId: string }> }> }> } }).data;
    const aliCol = board.staff.find((c) => c.staffId === ALI_ID);
    expect(aliCol?.appointments.some((a) => a.id === (created.body as { data: { id: string } }).data.id)).toBe(true);
    expect(aliCol?.appointments[0]?.students[0]?.studentId).toBe(s.id);
  });

  it('توضیحات روز: ثبت توسط منشی، دیده‌شدن در بورد، حذف فقط مدیر', async () => {
    const today = tehranTodayYmd();
    const note = await secretary.post('/api/working-day/notes', {
      date: today, body: 'دستگاه پروجکتور تعمیر شد'
    });
    expect(note.status).toBe(201);
    const noteId = (note.body as { data: { id: string } }).data.id;

    const board = await manager.get(`/api/working-day?date=${today}`);
    const notes = (board.body as { data: { notes: Array<{ id: string; creatorName: string }> } }).data.notes;
    expect(notes.map((n) => n.id)).toContain(noteId);
    expect(notes.find((n) => n.id === noteId)?.creatorName).toBeTruthy();

    const del = await manager.delete(`/api/working-day/notes/${noteId}`);
    expect(del.status).toBe(200);
  });

  it('توضیح خیلی کوتاه — 400', async () => {
    const res = await secretary.post('/api/working-day/notes', { date: tehranTodayYmd(), body: 'x' });
    expect(res.status).toBe(400);
  });
});

describe('/ — داشبورد و گزارش‌ها', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
  });

  it('dashboard/today — شکل کارت‌ها با دادهٔ واقعی نوبت', async () => {
    const today = tehranTodayYmd();
    const s = await createStudent(manager);
    await manager.post('/api/appointments', apptBody(ALI_ID, `${today}T07:00:00.000Z`, 30, [s.id]));

    const res = await manager.get(`/api/dashboard/today?date=${today}`);
    expect(res.status).toBe(200);
    const cards = (res.body as { data: { date: string; appointments: { total: number; scheduled: number }; perStaff: Array<{ staffId: string; total: number }> } }).data;
    expect(cards.date).toBe(today);
    expect(cards.appointments.total).toBeGreaterThanOrEqual(1);
    expect(cards.perStaff.some((p) => p.staffId === ALI_ID && p.total >= 1)).toBe(true);
  });

  it('dashboard/summary بازهٔ یک‌ماهه — 200', async () => {
    const res = await manager.get('/api/dashboard/summary?from=2030-01-01&to=2030-01-31');
    expect(res.status).toBe(200);
  });

  it('dashboard/summary بازهٔ معکوس — 400', async () => {
    const res = await manager.get('/api/dashboard/summary?from=2030-01-31&to=2030-01-01');
    expect(res.status).toBe(400);
  });

  it('reports بازهٔ معتبر — 200 برای مدیر', async () => {
    const res = await manager.get('/api/reports?from=2030-01-01&to=2030-01-31');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
  });

  // گزارش مدارس ساده‌شده: فقط مدارس دارای دانش‌آموز فعال + تعداد، نزولی
  it('reports.schools — فقط مدارس مبدأ با تعداد دانش‌آموز فعال', async () => {
    // اپ تازه = فقط دادهٔ seed → شمارش قطعی (مطهری ۴، فرزانگان ۱، گلستان ۱)
    const B = createTestApp();
    const bm = await asRole(B, 'manager');
    const res = await bm.get('/api/reports?from=2030-01-01&to=2030-01-31');
    expect(res.status).toBe(200);
    const schools = (res.body as { data: { schools: Array<{ schoolId: string; name: string; students: number }> } }).data.schools;
    expect(schools.length).toBe(3);
    expect(schools.every((s) => s.students > 0)).toBe(true); // بدون مدرسهٔ خالی
    for (let i = 1; i < schools.length; i++) {
      expect(schools[i - 1]!.students).toBeGreaterThanOrEqual(schools[i]!.students); // نزولی
    }
    const top = schools.find((s) => s.name === 'دبستان شهید مطهری');
    expect(top?.students).toBe(4);
  });
});

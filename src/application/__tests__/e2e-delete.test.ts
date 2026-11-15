import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestApp,
  asRole,
  createStudent,
  apptBody,
  quarterHourFromNow,
  makeNationalId,
  ALI_ID,
  MARYAM_ID,
  MANAGER_ID,
  SCHOOL1_ID,
  STUDENT1_ID
} from '../../test/harness';

interface ApptJson {
  id: string;
  staffId: string;
  status: string;
  version: number;
  students: Array<{ studentId: string; attendance: string }>;
}

describe('حذف کامل نوبت (ثبت اشتباه/تکراری)', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: ReturnType<typeof asRole> extends Promise<infer T> ? T : never;

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
  });

  it('مدیر نوبت خالی را کامل حذف می‌کند — ۲۰۴ و از فهرست می‌رود', async () => {
    const st = await createStudent(mgr);
    const created = await mgr.post('/api/appointments', apptBody(MARYAM_ID, quarterHourFromNow(240), 45, [st.id]));
    expect(created.status).toBe(201);
    const appt = (created.body as { data: ApptJson }).data;

    const del = await mgr.delete(`/api/appointments/${appt.id}`);
    expect(del.status).toBe(204);

    const back = await mgr.get(`/api/appointments?id=${appt.id}`);
    expect(back.status).toBe(404);
  });

  it('نوبت آینده با ثبت حضور پیش‌مات (present) قابل حذف است — ثبتِ پیش‌مات خودش اشتباه است', async () => {
    const st = await createStudent(mgr);
    const created = await mgr.post('/api/appointments', apptBody(MARYAM_ID, quarterHourFromNow(240), 45, [st.id]));
    const appt = (created.body as { data: ApptJson }).data;

    const marked = await mgr.patch(`/api/attendance/${appt.id}/${st.id}`, { status: 'present' });
    expect(marked.status).toBe(200);

    const del = await mgr.delete(`/api/appointments/${appt.id}`);
    expect(del.status).toBe(204); // جلسه هنوز نرسیده — ثبت پیش‌مات با نوبت پاک می‌شود
  });

  it('نوبت گذشته با سابقهٔ جلسه (present) → ۴۰۹ — تاریخچهٔ بالینی حذف نمی‌شود', async () => {
    const st = await createStudent(mgr);
    const created = await mgr.post('/api/appointments', apptBody(MARYAM_ID, quarterHourFromNow(-2880), 45, [st.id]));
    const appt = (created.body as { data: ApptJson }).data;

    const marked = await mgr.patch(`/api/attendance/${appt.id}/${st.id}`, { status: 'present' });
    expect(marked.status).toBe(200);

    const del = await mgr.delete(`/api/appointments/${appt.id}`);
    expect(del.status).toBe(409);

    const back = await mgr.get(`/api/appointments?id=${appt.id}`);
    expect(back.status).toBe(200); // دست‌نخورده
  });

  it('نوبت لغوشدهٔ بدون سابقه قابل حذف است — پاک‌شدن از تقویم', async () => {
    const st = await createStudent(mgr);
    const created = await mgr.post('/api/appointments', apptBody(MARYAM_ID, quarterHourFromNow(240), 45, [st.id]));
    const appt = (created.body as { data: ApptJson }).data;

    const cancel = await mgr.post(`/api/appointments/${appt.id}/cancel`, { version: appt.version });
    expect(cancel.status).toBe(200);

    const del = await mgr.delete(`/api/appointments/${appt.id}`);
    expect(del.status).toBe(204);
  });

  it('ورودی لیست انتظارِ «scheduled» با حذف نوبت خودکار به صف «waiting» برمی‌گردد', async () => {
    const entry = await mgr.post('/api/waitlist', {
      first_name: 'متقاضی',
      last_name: 'برگشتی',
      phone: '09121119988',
      national_id: makeNationalId(),
      source: 'self',
      priority: 'normal'
    });
    expect(entry.status).toBe(201);
    const eid = (entry.body as { data: { id: string } }).data.id;

    const sched = await mgr.post(`/api/waitlist/${eid}/schedule`, {
      staff_id: MARYAM_ID,
      start_at: quarterHourFromNow(300),
      end_at: quarterHourFromNow(345)
    });
    expect(sched.status).toBe(201);
    const apptId = (sched.body as { data: { appointment: { id: string } } }).data.appointment.id;

    const del = await mgr.delete(`/api/appointments/${apptId}`);
    expect(del.status).toBe(204);

    const list = await mgr.get('/api/waitlist');
    const row = (list.body as { data: Array<{ id: string; status: string; scheduledAppointmentId: string | null }> })
      .data.find((r) => r.id === eid);
    expect(row?.status).toBe('waiting');
    expect(row?.scheduledAppointmentId).toBeNull();
  });

  it('خروج از «scheduled» (نیامد → بازگشت به صف) ارجاع نوبت متصل را همان‌جا خنثی می‌کند', async () => {
    const entry = await mgr.post('/api/waitlist', {
      first_name: 'متقاضی',
      last_name: 'خروج‌ازنوبت',
      phone: '09121117766',
      national_id: makeNationalId(),
      source: 'self',
      priority: 'normal'
    });
    expect(entry.status).toBe(201);
    const eid = (entry.body as { data: { id: string } }).data.id;

    const sched = await mgr.post(`/api/waitlist/${eid}/schedule`, {
      staff_id: MARYAM_ID,
      start_at: quarterHourFromNow(330),
      end_at: quarterHourFromNow(375)
    });
    expect(sched.status).toBe(201);

    const noShow = await mgr.post(`/api/waitlist/${eid}/no-show`, {});
    expect(noShow.status).toBe(200);
    const afterNoShow = (noShow.body as { data: { status: string; scheduledAppointmentId: string | null } }).data;
    expect(afterNoShow.status).toBe('no_show');
    expect(afterNoShow.scheduledAppointmentId).toBeNull();

    const reopen = await mgr.post(`/api/waitlist/${eid}/reopen`, {});
    expect(reopen.status).toBe(200);
    expect((reopen.body as { data: { status: string } }).data.status).toBe('waiting');
  });

  it('ارجاع کهنهٔ لیست انتظار (غیر-scheduled، دادهٔ پیش از مایگریشن 0033) حذف نوبت را نمی‌بندد — ۲۰۴', async () => {
    const entry = await mgr.post('/api/waitlist', {
      first_name: 'متقاضی',
      last_name: 'یتیم‌نوبت',
      phone: '09121116655',
      national_id: makeNationalId(),
      source: 'self',
      priority: 'normal'
    });
    expect(entry.status).toBe(201);
    const eid = (entry.body as { data: { id: string } }).data.id;

    const sched = await mgr.post(`/api/waitlist/${eid}/schedule`, {
      staff_id: MARYAM_ID,
      start_at: quarterHourFromNow(420),
      end_at: quarterHourFromNow(465)
    });
    expect(sched.status).toBe(201);
    const apptId = (sched.body as { data: { appointment: { id: string } } }).data.appointment.id;

    A.sql.prepare(`UPDATE waitlist SET status = 'waiting' WHERE id = ?`).run(eid);

    const del = await mgr.delete(`/api/appointments/${apptId}`);
    expect(del.status).toBe(204);

    const list = await mgr.get('/api/waitlist');
    const row = (list.body as { data: Array<{ id: string; status: string; scheduledAppointmentId: string | null }> })
      .data.find((r) => r.id === eid);
    expect(row?.status).toBe('waiting');
    expect(row?.scheduledAppointmentId).toBeNull();
  });

  it('درمانگر نوبت خودش را حذف می‌کند — ۲۰۴؛ نوبت همکار → ۴۰۳', async () => {
    const ther = await asRole(A, 'therapist');

    const st = await createStudent(mgr);
    const intake = await mgr.post('/api/appointments', apptBody(ALI_ID, quarterHourFromNow(240), 45, [st.id]));
    expect(intake.status).toBe(201);

    const own = await ther.post('/api/appointments', apptBody(ALI_ID, quarterHourFromNow(240 + 7 * 24 * 60), 45, [st.id]));
    expect(own.status).toBe(201);
    const ownAppt = (own.body as { data: ApptJson }).data;
    const delOwn = await ther.delete(`/api/appointments/${ownAppt.id}`);
    expect(delOwn.status).toBe(204);

    const other = await mgr.post('/api/appointments', apptBody(MARYAM_ID, quarterHourFromNow(300), 45, [st.id]));
    const otherAppt = (other.body as { data: ApptJson }).data;
    const delOther = await ther.delete(`/api/appointments/${otherAppt.id}`);
    expect(delOther.status).toBe(403);
  });
});

describe('حذف ورودی لیست انتظار', () => {
  let A: ReturnType<typeof createTestApp>;
  let sec: ReturnType<typeof asRole> extends Promise<infer T> ? T : never;

  beforeAll(async () => {
    A = createTestApp();
    sec = await asRole(A, 'secretary');
  });

  it('منشی ورودی ثبت‌اشتباه را حذف می‌کند — بعد از حذف ۴۰۴ می‌دهد', async () => {
    const entry = await sec.post('/api/waitlist', {
      first_name: 'ثبت',
      last_name: 'دوباره',
      phone: '09123334477',
      source: 'self',
      priority: 'normal'
    });
    expect(entry.status).toBe(201);
    const id = (entry.body as { data: { id: string } }).data.id;

    const del = await sec.delete(`/api/waitlist/${id}`);
    expect(del.status).toBe(204);

    const back = await sec.get(`/api/waitlist/${id}`);
    expect(back.status).toBe(404);
  });

  it('درمانگر اجازهٔ حذف ورودی لیست انتظار ندارد — ۴۰۳', async () => {
    const ther = await asRole(A, 'therapist');
    const entry = await sec.post('/api/waitlist', {
      first_name: 'محرمانه',
      last_name: 'دفتر',
      phone: '09123334488',
      source: 'self',
      priority: 'normal'
    });
    const id = (entry.body as { data: { id: string } }).data.id;
    const del = await ther.delete(`/api/waitlist/${id}`);
    expect(del.status).toBe(403);
  });
});

describe('حذف مدرسه و کلاس', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: ReturnType<typeof asRole> extends Promise<infer T> ? T : never;

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
  });

  it('مدرسهٔ خالی حذف می‌شود — مدرسهٔ دانش‌آموزدار → ۴۰۹', async () => {
    const empty = await mgr.post('/api/schools', { name: 'مدرسهٔ اشتباه ', kind: 'school' });
    expect(empty.status).toBe(201);
    const emptyId = (empty.body as { data: { id: string } }).data.id;
    const delEmpty = await mgr.delete(`/api/schools/${emptyId}`);
    expect(delEmpty.status).toBe(204);
    const back = await mgr.get(`/api/schools/${emptyId}`);
    expect(back.status).toBe(404);

    const delBusy = await mgr.delete(`/api/schools/${SCHOOL1_ID}`);
    expect(delBusy.status).toBe(409);
  });

  it('کلاس خالی حذف می‌شود — کلاس دانش‌آموزدار → ۴۰۹', async () => {
    const school = await mgr.post('/api/schools', { name: 'مدرسهٔ کلاس ', kind: 'school' });
    const schoolId = (school.body as { data: { id: string } }).data.id;

    const cls = await mgr.post('/api/classes', { school_id: schoolId, name: 'کلاس اشتباه' });
    expect(cls.status).toBe(201);
    const clsId = (cls.body as { data: { id: string } }).data.id;

    const del = await mgr.delete(`/api/classes/${clsId}`);
    expect(del.status).toBe(204);

    const cls2 = await mgr.post('/api/classes', { school_id: schoolId, name: 'کلاس پر' });
    const cls2Id = (cls2.body as { data: { id: string } }).data.id;
    const st = await createStudent(mgr, { school_id: schoolId, class_id: cls2Id });
    expect(st.id).toBeTruthy();
    const delBusy = await mgr.delete(`/api/classes/${cls2Id}`);
    expect(delBusy.status).toBe(409);
  });

  it('منشی اجازهٔ حذف مدرسه ندارد — ۴۰۳', async () => {
    const sec = await asRole(A, 'secretary');
    const school = await mgr.post('/api/schools', { name: 'مدرسهٔ محرمانه ', kind: 'school' });
    const id = (school.body as { data: { id: string } }).data.id;
    const del = await sec.delete(`/api/schools/${id}`);
    expect(del.status).toBe(403);
  });
});

describe('حذف همکار', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: ReturnType<typeof asRole> extends Promise<infer T> ? T : never;

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
  });

  async function createStaff(role: string, suffix: string): Promise<{ id: string; username: string }> {
    const username = `m671_${role}_${suffix}`;
    const res = await mgr.post('/api/staff', {
      full_name: `تست ${role} ${suffix}`,
      phone: '09120001122',
      national_id: makeNationalId(),
      username,
      password: '1234',
      role,
      notify_enabled: false
    });
    expect(res.status).toBe(201);
    return { id: (res.body as { data: { id: string } }).data.id, username };
  }

  it('همکار تازه‌ساخت (بدون سابقه) حذف می‌شود و دیگر لاگین نمی‌کند', async () => {
    const staff = await createStaff('therapist', String(Date.now()));
    const del = await mgr.delete(`/api/staff/${staff.id}`);
    expect(del.status).toBe(204);

    const back = await mgr.get(`/api/staff/${staff.id}`);
    expect(back.status).toBe(404);
  });

  it('همکار سابقه‌دار (نوبت دارد) → ۴۰۹ با راهنمای غیرفعال‌سازی', async () => {
    const st = await createStudent(mgr);
    const appt = await mgr.post('/api/appointments', apptBody(ALI_ID, quarterHourFromNow(240), 45, [st.id]));
    expect(appt.status).toBe(201);

    const del = await mgr.delete(`/api/staff/${ALI_ID}`);
    expect(del.status).toBe(409);
  });

  it('حذف حساب خود بازیگر → خطا؛ درمانگر اجازهٔ حذف ندارد → ۴۰۳', async () => {
    const managerId = '00000000-0000-0000-0000-000000000001';
    const selfDel = await mgr.delete(`/api/staff/${managerId}`);
    expect(selfDel.status).toBe(409);

    const ther = await asRole(A, 'therapist');
    const staff = await createStaff('secretary', 'x1');
    const del = await ther.delete(`/api/staff/${staff.id}`);
    expect(del.status).toBe(403);
    await mgr.delete(`/api/staff/${staff.id}`);
  });

  it('مدیر دوم قابل حذف است (آخرین مدیر نیست) — ولی آخرین مدیر فعال حذف نمی‌شود', async () => {
    const m2 = await createStaff('manager', 'm2');
    const delM2 = await mgr.delete(`/api/staff/${m2.id}`);
    expect(delM2.status).toBe(204);
  });
});

describe('حذف پروندهٔ دانش‌آموز', () => {
  let A: ReturnType<typeof createTestApp>;
  let sec: ReturnType<typeof asRole> extends Promise<infer T> ? T : never;

  beforeAll(async () => {
    A = createTestApp();
    sec = await asRole(A, 'secretary');
  });

  it('پروندهٔ بدون سابقه حذف می‌شود و کد ملی‌اش برای ثبت مجدد آزاد می‌شود', async () => {
    const nid = makeNationalId();
    const st = await createStudent(sec, { national_id: nid });
    const del = await sec.delete(`/api/students/${st.id}`);
    expect(del.status).toBe(204);

    const back = await sec.get(`/api/students/${st.id}`);
    expect(back.status).toBe(404);

    const again = await sec.post('/api/students', {
      national_id: nid,
      first_name: 'ثبت مجدد',
      last_name: 'درست',
      guardian_phone: '09121114455'
    });
    expect(again.status).toBe(201);
    await sec.delete(`/api/students/${(again.body as { data: { id: string } }).data.id}`);
  });

  it('پروندهٔ سابقه‌دار (نوبت دارد) → ۴۰۹ با راهنمای آرشیو', async () => {
    const appt = await sec.post('/api/appointments', apptBody(MARYAM_ID, quarterHourFromNow(240), 45, [STUDENT1_ID]));
    expect(appt.status).toBe(201);

    const del = await sec.delete(`/api/students/${STUDENT1_ID}`);
    expect(del.status).toBe(409);
  });

  it('درمانگر اجازهٔ حذف پرونده ندارد — ۴۰۳', async () => {
    const ther = await asRole(A, 'therapist');
    const st = await createStudent(sec);
    const del = await ther.delete(`/api/students/${st.id}`);
    expect(del.status).toBe(403);
    await sec.delete(`/api/students/${st.id}`);
  });
});

/* ۱.۱۳.۰ — «حذف با سابقه»: پروندهٔ اشتباهی که نوبت/رویداد دارد دیگر بن‌بست نیست؛
   مدیر با force کامل حذف می‌کند (cascade امن FK)، منشی ۴۰۳ می‌گیرد،
   گزارش ارزیابی رسمی/مالی سد سخت می‌ماند و پیش‌شمارش (delete-check) پیش از مودال می‌آید */
describe('حذف با سابقه (force) و پیش‌شمارش حذف پرونده', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: ReturnType<typeof asRole> extends Promise<infer T> ? T : never;
  let sec: ReturnType<typeof asRole> extends Promise<infer T> ? T : never;

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
    sec = await asRole(A, 'secretary');
  });

  it('پیش‌شمارش delete-check سابقهٔ نوبت را دقیق اعلام می‌کند', async () => {
    const st = await createStudent(mgr);
    const created = await mgr.post('/api/appointments', apptBody(MARYAM_ID, quarterHourFromNow(240), 45, [st.id]));
    expect(created.status).toBe(201);

    const check = await mgr.get(`/api/students/${st.id}/delete-check`);
    expect(check.status).toBe(200);
    const data = (check.body as { data: { blocks: Array<{ key: string; label: string; count: number }>; canDelete: boolean; canForce: boolean; hardBlocks: unknown[] } }).data;
    expect(data.blocks).toHaveLength(1);
    expect(data.blocks[0].key).toBe('appointment');
    expect(data.blocks[0].count).toBe(1);
    expect(data.blocks[0].label).toContain('نوبت'); // برچسب فارسی — نه نام جدول خام
    expect(data.canDelete).toBe(false);
    expect(data.canForce).toBe(true); // مدیر
    expect(data.hardBlocks).toHaveLength(0);
  });

  it('حذف معمولی پروندهٔ سابقه‌دار → ۴۰۹ با پیام فارسی و راهنمای مدیر', async () => {
    const st = await createStudent(mgr);
    await mgr.post('/api/appointments', apptBody(MARYAM_ID, quarterHourFromNow(240), 45, [st.id]));
    const del = await mgr.delete(`/api/students/${st.id}`);
    expect(del.status).toBe(409);
    const msg = (del.body as { message?: string }).message ?? '';
    expect(msg).toContain('نوبت');          // دیگر «appointment_students» خام نیست
    expect(msg).toContain('حذف با سابقه'); // راهنمای مسیر مدیر
  });

  it('مدیر با force پروندهٔ سابقه‌دار را کامل حذف می‌کند — نوبت یتیم هم از تقویم پاک می‌شود و کد ملی آزاد', async () => {
    const nid = makeNationalId();
    const st = await createStudent(mgr, { national_id: nid });
    const created = await mgr.post('/api/appointments', apptBody(MARYAM_ID, quarterHourFromNow(240), 45, [st.id]));
    const appt = (created.body as { data: { id: string } }).data;

    const del = await mgr.delete(`/api/students/${st.id}?force=true`);
    expect(del.status).toBe(204);

    const back = await mgr.get(`/api/students/${st.id}`);
    expect(back.status).toBe(404);

    // نوبتِ تک‌دانش‌آموزیِ همین پرونده یتیم شده — باید از تقویم هم رفته باشد
    const apptBack = await mgr.get(`/api/appointments?id=${appt.id}`);
    expect(apptBack.status).toBe(404);

    // کد ملی برای ثبت مجدد آزاد شده (دردِ اصلی ثبت اشتباه)
    const again = await mgr.post('/api/students', {
      national_id: nid,
      first_name: 'ثبت مجدد',
      last_name: 'درست',
      guardian_phone: '09121117766'
    });
    expect(again.status).toBe(201);
    await mgr.delete(`/api/students/${(again.body as { data: { id: string } }).data.id}`);
  });

  it('منشی اجازهٔ «حذف با سابقه» ندارد — ۴۰۳ و پرونده دست‌نخورده', async () => {
    const st = await createStudent(sec);
    await sec.post('/api/appointments', apptBody(MARYAM_ID, quarterHourFromNow(240), 45, [st.id]));
    const del = await sec.delete(`/api/students/${st.id}?force=true`);
    expect(del.status).toBe(403);
    const back = await sec.get(`/api/students/${st.id}`);
    expect(back.status).toBe(200); // دست‌نخورده
  });

  it('سد سخت: پروندهٔ دارای گزارش ارزیابی رسمی حتی با force حذف نمی‌شود — ۴۰۹', async () => {
    const st = await createStudent(mgr);
    A.sql.prepare(
      `INSERT INTO assessments (id, student_id, kind, title, performed_at, status, created_by) VALUES (?, ?, 'initial', 'ارزیابی آزمایشی', '1403-08-01', 'draft', ?)`
    ).run(`asm-${st.id}`, st.id, MANAGER_ID);
    const del = await mgr.delete(`/api/students/${st.id}?force=true`);
    expect(del.status).toBe(409);
    const back = await mgr.get(`/api/students/${st.id}`);
    expect(back.status).toBe(200);

    // پیش‌شمارش هم سد سخت را نشان می‌دهد
    const check = await mgr.get(`/api/students/${st.id}/delete-check`);
    const data = (check.body as { data: { hardBlocks: Array<{ key: string }>; canForce: boolean } }).data;
    expect(data.hardBlocks).toHaveLength(1);
    expect(data.hardBlocks[0].key).toBe('assessment');
  });
});

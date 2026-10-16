/**
 * تست‌های e2e — teacher-booking
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// e2e-teacher-booking.test.ts — فاز ۵: نوبت‌دهی مستقیم معلم + منشی ناظر
// گارد محدوده در لایهٔ service (نه requireRole مسیر): مدیر/منشی همهٔ نوبت‌ها؛
// درمانگر فقط نوبت‌های خودش و فقط دانش‌آموزانِ خودش (اشتقاق D4 از سابقهٔ نوبت)
// + endpoint دانش‌آموزان من (badge پذیرش از پروجکشن ) + گارد ساعات کاری

import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestApp,
  Api,
  asRole,
  loginToken,
  createStudent,
  makeNationalId,
  apptBody,
  quarterHourFromNow,
  ALI_ID,
  MARYAM_ID
} from '../../test/harness';

interface ApptBody {
  id: string;
  staffId: string;
  status: string;
  version: number;
}

function apptOf(res: { body: unknown }): ApptBody {
  return (res.body as { data: ApptBody }).data;
}

interface MyStudentBody {
  id: string;
  firstName: string;
  lastName: string;
  waitStatus: 'waiting' | 'admitted' | null;
  guardianPhone: string | null;
}

async function myStudents(api: Api): Promise<MyStudentBody[]> {
  const res = await api.get('/api/appointments/my-students');
  expect(res.status).toBe(200);
  return (res.body as { data: MyStudentBody[] }).data;
}

async function waitStatus(api: Api, studentId: string, awaiting: boolean, extra: Record<string, unknown> = {}) {
  return api.post(`/api/students/${studentId}/wait-status`, { awaiting, ...extra });
}

describe('فاز ۵ — گارد محدودهٔ نوشتن نوبت', () => {
  let A: ReturnType<typeof createTestApp>;
  let ali: Api;
  let sec: Api;
  let mgr: Api;
  let maryam: Api;

  beforeAll(async () => {
    A = createTestApp();
    ali = await asRole(A, 'therapist'); // ALI_ID
    sec = await asRole(A, 'secretary');
    mgr = await asRole(A, 'manager');
    maryam = new Api(A, await loginToken(A, 'maryam'));
  });

  it('درمانگر برای همکار دیگر — ساخت 403', async () => {
    const st = await createStudent(sec);
    const res = await ali.post('/api/appointments', apptBody(MARYAM_ID, quarterHourFromNow(90), 45, [st.id]));
    expect(res.status).toBe(403);
  });

  it('درمانگر برای خودش با دانش‌آموزِ بی‌سابقه — 403 (D4: فقط دانش‌آموزان خودش)', async () => {
    const st = await createStudent(sec); // هنوز هیچ نوبتی با ali ندارد
    const res = await ali.post('/api/appointments', apptBody(ALI_ID, quarterHourFromNow(90), 45, [st.id]));
    expect(res.status).toBe(403);
    expect((res.body as { message: string }).message).toContain('دانش‌آموزانِ خودِ او');
  });

  it('مسیر کامل: intake منشی → سابقه → درمانگر برای خودش 201', async () => {
    const st = await createStudent(sec);

    // intake توسط منشی — نوبت اول با ali (بدون محدودیت)
    const intake = await sec.post('/api/appointments', apptBody(ALI_ID, quarterHourFromNow(90), 45, [st.id]));
    expect(intake.status).toBe(201);

    // حالا ali می‌تواند جلسهٔ بعدی همان دانش‌آموز را خودش ثبت کند
    const next = await ali.post('/api/appointments', apptBody(ALI_ID, quarterHourFromNow(90 + 7 * 24 * 60), 45, [st.id]));
    expect(next.status).toBe(201);
    expect(apptOf(next).staffId).toBe(ALI_ID);
  });

  it('جابه‌جایی: نوبت خودش 200 — نوبت همکار 403', async () => {
    const st = await createStudent(sec);
    await sec.post('/api/appointments', apptBody(ALI_ID, quarterHourFromNow(120), 45, [st.id]));
    const mine = apptOf(await ali.post('/api/appointments', apptBody(ALI_ID, quarterHourFromNow(240), 45, [st.id])));
    const moved = await ali.patch(`/api/appointments/${mine.id}/move`, {
      start_at: quarterHourFromNow(300),
      version: mine.version
    });
    expect(moved.status).toBe(200);

    const others = apptOf(
      await sec.post('/api/appointments', apptBody(MARYAM_ID, quarterHourFromNow(360), 45, [st.id]))
    );
    const hack = await ali.patch(`/api/appointments/${others.id}/move`, {
      start_at: quarterHourFromNow(400),
      version: others.version
    });
    expect(hack.status).toBe(403);
  });

  it('مدت/لغو/برگردانی نوبت همکار — همه 403؛ برای خودش مجاز', async () => {
    const st = await createStudent(sec);

    // نوبت maryam (بازیگر منشی؛ بدون محدودیت)
    const hers = apptOf(await sec.post('/api/appointments', apptBody(MARYAM_ID, quarterHourFromNow(150), 45, [st.id])));

    // resize نوبت همکار
    const r1 = await ali.patch(`/api/appointments/${hers.id}/resize`, {
      end_at: new Date(Date.parse(quarterHourFromNow(150)) + 60 * 60000).toISOString(),
      version: hers.version
    });
    expect(r1.status).toBe(403);

    // cancel نوبت همکار
    const r2 = await ali.post(`/api/appointments/${hers.id}/cancel`, { version: hers.version });
    expect(r2.status).toBe(403);

    // منشی لغو می‌کند؛ ali برگردانی هم 403
    const canceled = await sec.post(`/api/appointments/${hers.id}/cancel`, { version: hers.version });
    expect(canceled.status).toBe(200);
    const r3 = await ali.post(`/api/appointments/${hers.id}/restore`, { version: apptOf(canceled).version });
    expect(r3.status).toBe(403);

    // update note نوبت همکار
    const r4 = await ali.patch(`/api/appointments/${hers.id}`, { note: 'هک', version: apptOf(canceled).version });
    expect(r4.status).toBe(403);

    // برای خودش: لغو + برگردانی مجاز (دانش‌آموز با سابقهٔ نوبت با ali)
    const stAli = await createStudent(sec);
    await sec.post('/api/appointments', apptBody(ALI_ID, quarterHourFromNow(450), 45, [stAli.id]));
    const mine = apptOf(await ali.post('/api/appointments', apptBody(ALI_ID, quarterHourFromNow(480), 45, [stAli.id])));
    const c = await ali.post(`/api/appointments/${mine.id}/cancel`, { version: mine.version });
    expect(c.status).toBe(200);
    const rs = await ali.post(`/api/appointments/${mine.id}/restore`, { version: apptOf(c).version });
    expect(rs.status).toBe(200);
  });

  it('افزودن/حذف دانش‌آموز: درمانگر در نوبت خودش فقط دانش‌آموزِ خودش؛ منشی بدون محدودیت', async () => {
    const st = await createStudent(sec);
    await sec.post('/api/appointments', apptBody(ALI_ID, quarterHourFromNow(540), 45, [st.id]));
    const mine = apptOf(await ali.post('/api/appointments', apptBody(ALI_ID, quarterHourFromNow(600), 45, [st.id])));

    const stranger = await createStudent(sec); // بی‌سابقه با ali
    const add1 = await ali.post(`/api/appointments/${mine.id}/students`, { student_id: stranger.id });
    expect(add1.status).toBe(403);

    const add2 = await ali.post(`/api/appointments/${mine.id}/students`, { student_id: st.id });
    expect(add2.status).toBe(409); // قبلاً در نوبت هست — گارد رد شد، قاعدهٔ duplicate

    // حذف از نوبت خودش — مجاز
    const mine2 = apptOf(await ali.post('/api/appointments', apptBody(ALI_ID, quarterHourFromNow(660), 45, [st.id])));
    const del = await ali.delete(`/api/appointments/${mine2.id}/students/${st.id}`);
    expect(del.status).toBe(204);

    // منشی به نوبت maryam دانش‌آموزِ دلخواه اضافه می‌کند — مجاز (intake)
    const hers = apptOf(await sec.post('/api/appointments', apptBody(MARYAM_ID, quarterHourFromNow(720), 45, [stranger.id])));
    const add3 = await sec.post(`/api/appointments/${hers.id}/students`, { student_id: st.id });
    expect(add3.status).toBe(204);
  });

  it('copy-week: درمانگر فقط هفتهٔ خودش؛ بدون staff_id هم 403', async () => {
    const src = '2030-01-07'; // دوشنبه
    const dst = '2030-01-14';

    const hack = await ali.post('/api/appointments/copy-week', {
      source_monday: src, target_monday: dst, staff_id: MARYAM_ID, dry_run: true
    });
    expect(hack.status).toBe(403);

    const all = await ali.post('/api/appointments/copy-week', {
      source_monday: src, target_monday: dst, dry_run: true
    });
    expect(all.status).toBe(403);

    const own = await ali.post('/api/appointments/copy-week', {
      source_monday: src, target_monday: dst, staff_id: ALI_ID, dry_run: true
    });
    expect(own.status).toBe(200);
  });

  it('undo دستهٔ کپی دیگران — درمانگر 403', async () => {
    // منشی برای maryam یک هفته کپی می‌کند؛ ali دست به برگردانی نمی‌زند
    const st = await createStudent(sec);
    await sec.post('/api/appointments', apptBody(MARYAM_ID, '2030-01-07T08:00:00.000Z', 45, [st.id]));
    const copy = await sec.post('/api/appointments/copy-week', {
      source_monday: '2030-01-07', target_monday: '2030-01-14', staff_id: MARYAM_ID, dry_run: false
    });
    expect(copy.status).toBe(200);
    const batchId = (copy.body as { data: { batchId: string } }).data.batchId;
    expect(batchId).toBeTruthy();

    const hack = await ali.post(`/api/appointments/copy-week/${batchId}/undo`);
    expect(hack.status).toBe(403);

    const ok = await sec.post(`/api/appointments/copy-week/${batchId}/undo`);
    expect(ok.status).toBe(200);
  });

  it('مدیر/منشی بدون محدودیت — ساخت برای هر همکار 201 (نقش ناظر + intake)', async () => {
    const st = await createStudent(sec);
    const a1 = await sec.post('/api/appointments', apptBody(MARYAM_ID, quarterHourFromNow(800), 45, [st.id]));
    expect(a1.status).toBe(201);
    const a2 = await mgr.post('/api/appointments', apptBody(ALI_ID, quarterHourFromNow(840), 45, [st.id]));
    expect(a2.status).toBe(201);
  });
});

describe('فاز ۵ — دانش‌آموزان من (my-students)', () => {
  let A: ReturnType<typeof createTestApp>;
  let sec: Api;
  let mgr: Api;
  let freshTher: Api;

  beforeAll(async () => {
    A = createTestApp();
    sec = await asRole(A, 'secretary');
    mgr = await asRole(A, 'manager');
    // همکار تازه — هیچ سابقهٔ نوبتی ندارد
    const created = await mgr.post('/api/staff', {
      full_name: 'همکار تازه',
      phone: '09121117777',
      national_id: makeNationalId(),
      username: `fresh${Date.now()}`,
      password: '1234',
      role: 'therapist'
    });
    expect(created.status).toBe(201);
    const username = (created.body as { data: { username: string } }).data.username;
    freshTher = new Api(A, await loginToken(A, username));
  });

  it('معلم بی‌سابقه — لیست خالی؛ خروجی نسبت به خود بازیگر است (منشی هم خالی)', async () => {
    expect(await myStudents(freshTher)).toEqual([]);
    expect(await myStudents(sec)).toEqual([]);
  });

  it('بعد از intake + جلسهٔ ثابت — دانش‌آموز در لیست معلم با badge پذیرش کامل', async () => {
    const st = await createStudent(sec);

    // هنوز در لیست نیست
    expect((await myStudents(freshTher)).find((s) => s.id === st.id)).toBeUndefined();

    // جریان: تیک منتظر دریافت خدمت → intake → پذیرش با حضور
    await waitStatus(sec, st.id, true, { source: 'school', service_type: 'کاردرمانی' });
    const therId = await staffIdOf(A, freshTher);
    const created = await sec.post('/api/appointments', apptBody(therId, quarterHourFromNow(90), 45, [st.id]));
    expect(created.status).toBe(201);
    const apptId = (created.body as { data: { id: string } }).data.id;

    // حالا در لیست است ولی هنوز «منتظر» است
    const before = (await myStudents(freshTher)).find((s) => s.id === st.id);
    expect(before?.waitStatus).toBe('waiting');

    // حضور «حاضر» → پذیرش خودکار → ورودی از لیست انتظار پاک می‌شود
    const mark = await sec.patch(`/api/attendance/${apptId}/${st.id}`, { status: 'present' });
    expect(mark.status).toBe(200);

    // دانش‌آموز همچنان در لیست معلم است (سابقهٔ جلسه) ولی دیگر badge وضعیت انتظار ندارد
    const list = await myStudents(freshTher);
    const admitted = list.find((s) => s.id === st.id);
    expect(admitted).toBeTruthy();
    expect(admitted?.waitStatus).toBeNull();
  });
});

/** یافتن staffId از پروفایل /api/me */
async function staffIdOf(A: ReturnType<typeof createTestApp>, api: Api): Promise<string> {
  const me = await api.get('/api/me');
  return (me.body as { data: { staffId: string } }).data.staffId;
}

describe('فاز ۵ — گارد ساعات کاری', () => {
  let A: ReturnType<typeof createTestApp>;
  let ali: Api;
  let sec: Api;

  beforeAll(async () => {
    A = createTestApp();
    ali = await asRole(A, 'therapist');
    sec = await asRole(A, 'secretary');
  });

  it('درمانگر برای خودش — POST 201 و replaceWeek 200', async () => {
    const add = await ali.post('/api/working-hours', {
      staff_id: ALI_ID, weekday: 6, start_minute: 8 * 60, end_minute: 10 * 60
    });
    expect(add.status).toBe(201);

    const week = await ali.put(`/api/working-hours/staff/${ALI_ID}`, {
      items: [{ weekday: 6, start_minute: 8 * 60, end_minute: 12 * 60 }]
    });
    expect(week.status).toBe(200);
  });

  it('درمانگر برای همکار — POST/PUT/DELETE همه 403', async () => {
    const add = await ali.post('/api/working-hours', {
      staff_id: MARYAM_ID, weekday: 6, start_minute: 9 * 60, end_minute: 11 * 60
    });
    expect(add.status).toBe(403);

    const week = await ali.put(`/api/working-hours/staff/${MARYAM_ID}`, {
      items: [{ weekday: 6, start_minute: 9 * 60, end_minute: 11 * 60 }]
    });
    expect(week.status).toBe(403);

    // بازهٔ maryam توسط منشی ساخته می‌شود؛ ali اجازهٔ حذف ندارد
    const made = await sec.post('/api/working-hours', {
      staff_id: MARYAM_ID, weekday: 5, start_minute: 9 * 60, end_minute: 11 * 60
    });
    expect(made.status).toBe(201);
    const rangeId = (made.body as { data: { id: string } }).data.id;
    const del = await ali.delete(`/api/working-hours/${rangeId}`);
    expect(del.status).toBe(403);
  });

  it('منشی برای همکار — بدون تغییر 201 (نقش ناظر/مدیریت مرکز)', async () => {
    const add = await sec.post('/api/working-hours', {
      staff_id: MARYAM_ID, weekday: 4, start_minute: 13 * 60, end_minute: 15 * 60
    });
    expect(add.status).toBe(201);
  });
});

// ─────────────── گارد محدودهٔ خواندن تقویم ───────────────
// تقویم مرکزی نوبت‌دهی ابزار پذیرش است؛ درمانگر فقط برنامهٔ خودش را می‌بیند —
// حتی با فراخوانی مستقیم API (لیست بدون staff_id یا staff_id همکار = فقط خودش / 403)

describe('گارد محدودهٔ خواندن نوبت‌ها (درمانگر فقط برنامهٔ خودش)', () => {
  let A: ReturnType<typeof createTestApp>;
  let ali: Api;
  let sec: Api;
  let mgr: Api;

  beforeAll(async () => {
    A = createTestApp();
    ali = await asRole(A, 'therapist');
    sec = await asRole(A, 'secretary');
    mgr = await asRole(A, 'manager');
  });

  it('لیست بدون staff_id — درمانگر فقط نوبت‌های خودش را می‌بیند (نه همکاران)', async () => {
    const st = await createStudent(sec);
    await sec.post('/api/appointments', apptBody(ALI_ID, quarterHourFromNow(1000), 45, [st.id]));
    await sec.post('/api/appointments', apptBody(MARYAM_ID, quarterHourFromNow(1100), 45, [st.id]));

    const res = await ali.get('/api/appointments');
    expect(res.status).toBe(200);
    const items = (res.body as { data: ApptBody[] }).data;
    expect(items.length).toBeGreaterThan(0);
    for (const a of items) expect(a.staffId).toBe(ALI_ID);
  });

  it('لیست با staff_id همکار — 403؛ با staff_id خودش — 200', async () => {
    const hack = await ali.get(`/api/appointments?staff_id=${MARYAM_ID}`);
    expect(hack.status).toBe(403);

    const ok = await ali.get(`/api/appointments?staff_id=${ALI_ID}`);
    expect(ok.status).toBe(200);
    const items = (ok.body as { data: ApptBody[] }).data;
    for (const a of items) expect(a.staffId).toBe(ALI_ID);
  });

  it('getById نوبت همکار — 403؛ نوبت خودش — 200', async () => {
    const st = await createStudent(sec);
    const hers = apptOf(await sec.post('/api/appointments', apptBody(MARYAM_ID, quarterHourFromNow(1200), 45, [st.id])));
    const mine = apptOf(await sec.post('/api/appointments', apptBody(ALI_ID, quarterHourFromNow(1300), 45, [st.id])));

    const hack = await ali.get(`/api/appointments?id=${hers.id}`);
    expect(hack.status).toBe(403);

    const ok = await ali.get(`/api/appointments?id=${mine.id}`);
    expect(ok.status).toBe(200);
    expect(apptOf(ok).id).toBe(mine.id);
  });

  // بازگردانی به دستور کاربر: دفتر (مدیر/منشی) تقویم مرکزی را می‌بیند — همهٔ دسترسی‌ها
  // و ماژول‌ها برای مدیر/منشی؛ لیست دفتر شامل نوبت‌های همهٔ همکاران و getById هم باز است
  it('دفتر (مدیر/منشی) — GET تقویم 200 و شامل نوبت‌های همهٔ همکاران (بازگردانی )', async () => {
    const mgrRes = await mgr.get('/api/appointments');
    expect(mgrRes.status).toBe(200);
    const items = (mgrRes.body as { data: ApptBody[] }).data;
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((a) => a.staffId === ALI_ID)).toBe(true);
    expect(items.some((a) => a.staffId === MARYAM_ID)).toBe(true);

    const secRes = await sec.get('/api/appointments');
    expect(secRes.status).toBe(200);

    // getById نوبت همکار برای دفتر هم باز است (فقط درمانگر scope می‌خورد)
    const other = items.find((a) => a.staffId === MARYAM_ID);
    if (other) {
      const one = await mgr.get(`/api/appointments?id=${other.id}`);
      expect(one.status).toBe(200);
    }
  });
});

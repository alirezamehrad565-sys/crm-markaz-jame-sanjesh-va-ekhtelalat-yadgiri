import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestApp,
  Api,
  asRole,
  createStudent,
  apptBody,
  quarterHourFromNow,
  makeNationalId,
  ALI_ID,
  MARYAM_ID
} from '../../test/harness';

interface StudentRow {
  id: string;
  firstName: string;
  lastName: string;
  active: boolean;
  ownerStaffId: string | null;
  ownerName: string | null;
  waitStatus: string | null;
}

function rowsOf(res: { body: unknown }): StudentRow[] {
  return (res.body as { data: StudentRow[] }).data;
}

describe('آرشیو (دیتابیس دانش‌آموزان نیاز ویژهٔ شهر)', () => {
  let A: ReturnType<typeof createTestApp>;
  let sec: Api;

  beforeAll(async () => {
    A = createTestApp();
    sec = await asRole(A, 'secretary');
  });

  it('ثبت مستقیم در آرشیو — archived=true → active=0؛ فقط در فهرست active=false دیده می‌شود', async () => {
    const created = await sec.post('/api/students', {
      national_id: makeNationalId(),
      first_name: 'آرشیوی',
      last_name: 'شهرستانی',
      guardian_phone: '09123334455',
      archived: true
    });
    expect(created.status).toBe(201);
    const st = (created.body as { data: StudentRow }).data;
    expect(st.active).toBe(false);

    const archive = await sec.get('/api/students?active=false&page_size=200');
    expect(rowsOf(archive).find((r) => r.id === st.id)).toBeTruthy();

    const active = await sec.get('/api/students?active=true&page_size=200');
    expect(rowsOf(active).find((r) => r.id === st.id)).toBeUndefined();
  });

  it('بازگشت از آرشیو به چرخهٔ مرکز — activate → فعال می‌شود', async () => {
    const st = await createStudent(sec, { archived: true });
    const act = await sec.post(`/api/students/${st.id}/activate`);
    expect(act.status).toBe(200);
    expect((act.body as { data: { active: boolean } }).data.active).toBe(true);

    const active = await sec.get('/api/students?active=true&page_size=200');
    expect(rowsOf(active).find((r) => r.id === st.id)).toBeTruthy();
  });
});

describe('مسئول پرونده در لحظهٔ تعریف', () => {
  let A: ReturnType<typeof createTestApp>;
  let sec: Api;

  beforeAll(async () => {
    A = createTestApp();
    sec = await asRole(A, 'secretary');
  });

  it('owner_staff_id در ساخت پرونده ثبت می‌شود (بدون ثبت مجدد در پروفایل)', async () => {
    const st = await createStudent(sec, { owner_staff_id: ALI_ID });
    const fresh = await sec.get(`/api/students/${st.id}`);
    const body = (fresh.body as { data: StudentRow }).data;
    expect(body.ownerStaffId).toBe(ALI_ID);
    expect(body.ownerName).toBeTruthy();
  });

  it('مسئول نامعتبر (غیرفعال/ناشناخته) → ۴۰۴', async () => {
    const res = await sec.post('/api/students', {
      national_id: makeNationalId(),
      first_name: 'بی‌مسئول',
      last_name: 'نامعتبر',
      guardian_phone: '09123334466',
      owner_staff_id: '99999999-9999-9999-9999-999999999999'
    });
    expect(res.status).toBe(404);
  });

  it('نوبت‌دهی از لیست انتظار برای متقاضیِ بدون پرونده — مسئول پرونده = درمانگر نوبت اول', async () => {
    const nid = makeNationalId();
    const entry = await sec.post('/api/waitlist', {
      first_name: 'نوبت‌گیر',
      last_name: 'تازه‌وارد',
      phone: '09123445566',
      national_id: nid,
      source: 'self',
      priority: 'normal'
    });
    expect(entry.status).toBe(201);
    const eid = (entry.body as { data: { id: string } }).data.id;

    const sched = await sec.post(`/api/waitlist/${eid}/schedule`, {
      staff_id: MARYAM_ID,
      start_at: quarterHourFromNow(300),
      end_at: quarterHourFromNow(345)
    });
    expect(sched.status).toBe(201);
    const student = (sched.body as { data: { student: { id: string; ownerStaffId: string | null } } }).data.student;
    expect(student.ownerStaffId).toBe(MARYAM_ID);
  });
});

describe('مرز «لیست دانش‌آموزهای هر معلم» روی GET /api/students', () => {
  let A: ReturnType<typeof createTestApp>;
  let sec: Api;
  let ali: Api;
  let ownedByAli: string; // مسئول پرونده = علی (بدون هیچ جلسه)
  let historyWithAli: string; // سابقهٔ جلسه با علی
  let maryamsOnly: string; // هیچ ربطی به علی ندارد

  beforeAll(async () => {
    A = createTestApp();
    sec = await asRole(A, 'secretary');
    ali = await asRole(A, 'therapist');

    const owned = await createStudent(sec, { owner_staff_id: ALI_ID });
    ownedByAli = owned.id;

    const hist = await createStudent(sec);
    const appt = await sec.post('/api/appointments', apptBody(ALI_ID, quarterHourFromNow(390), 45, [hist.id]));
    expect(appt.status).toBe(201);
    historyWithAli = hist.id;

    const other = await createStudent(sec, { owner_staff_id: MARYAM_ID });
    maryamsOnly = other.id;
  });

  it('درمانگر فقط پرونده‌های مسئولِ خودش یا با سابقهٔ جلسه با خودش را می‌بیند', async () => {
    const res = await ali.get('/api/students?page_size=200');
    expect(res.status).toBe(200);
    const rows = rowsOf(res);
    const ids = new Set(rows.map((r) => r.id));
    expect(ids.has(ownedByAli)).toBe(true); // مسئول پرونده
    expect(ids.has(historyWithAli)).toBe(true); // سابقهٔ جلسه
    expect(ids.has(maryamsOnly)).toBe(false); // بی‌ربط به علی
  });

  it('دفتر کل مرکز را می‌بیند و می‌تواند به‌ازای هر همکار فیلتر کند', async () => {
    const all = await sec.get('/api/students?page_size=200');
    const ids = new Set(rowsOf(all).map((r) => r.id));
    expect(ids.has(ownedByAli)).toBe(true);
    expect(ids.has(maryamsOnly)).toBe(true);

    const byOwner = await sec.get(`/api/students?owner_id=${MARYAM_ID}&page_size=200`);
    const rows = rowsOf(byOwner);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.ownerStaffId).toBe(MARYAM_ID);
  });

  it('پس از پذیرش (حضور «حاضر») پرونده در لیست درمانگر باقی می‌ماند — بدون badge انتظار', async () => {
    const st = await createStudent(sec, { owner_staff_id: ALI_ID });
    const appt = await sec.post('/api/appointments', apptBody(ALI_ID, quarterHourFromNow(450), 45, [st.id]));
    const apptId = (appt.body as { data: { id: string } }).data.id;

    const mark = await sec.patch(`/api/attendance/${apptId}/${st.id}`, { status: 'present' });
    expect(mark.status).toBe(200);

    const res = await ali.get('/api/students?page_size=200');
    const row = rowsOf(res).find((r) => r.id === st.id);
    expect(row).toBeTruthy();
    expect(row?.waitStatus).toBeNull();
  });
});

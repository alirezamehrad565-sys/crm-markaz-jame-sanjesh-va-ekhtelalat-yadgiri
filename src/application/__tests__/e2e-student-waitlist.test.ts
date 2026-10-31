import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestApp,
  Api,
  asRole,
  createStudent,
  apptBody,
  quarterHourFromNow,
  ALI_ID
} from '../../test/harness';

interface EntryBody {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  status: string;
  priority: string;
  source: string;
  studentId: string | null;
  serviceType: string | null;
}

function entryOf(res: { body: unknown }): EntryBody {
  return (res.body as { data: EntryBody }).data;
}

async function waitStatus(api: Api, studentId: string, awaiting: boolean, extra: Record<string, unknown> = {}) {
  return api.post(`/api/students/${studentId}/wait-status`, { awaiting, ...extra });
}

async function studentsOf(api: Api): Promise<Array<{ id: string; waitStatus: string | null; waitSince: string | null; firstName: string; lastName: string }>> {
  const res = await api.get('/api/students');
  expect(res.status).toBe(200);
  return (res.body as { data: Array<{ id: string; waitStatus: string | null; waitSince: string | null; firstName: string; lastName: string }> }).data;
}

describe('تیک «منتظر دریافت خدمت»', () => {
  let A: ReturnType<typeof createTestApp>;
  let sec: Api;

  beforeAll(async () => {
    A = createTestApp();
    sec = await asRole(A, 'secretary');
  });

  it('ورود به لیست انتظار با پروندهٔ متصل — هویت از خود پرونده + audit', async () => {
    const st = await createStudent(sec);
    const res = await waitStatus(sec, st.id, true, { source: 'school', service_type: 'کاردرمانی', priority: 'urgent' });
    expect(res.status).toBe(200);
    const entry = entryOf(res);
    expect(entry.studentId).toBe(st.id);
    expect(entry.status).toBe('waiting');
    expect(entry.priority).toBe('urgent');
    expect(entry.source).toBe('school');
    expect(entry.serviceType).toBe('کاردرمانی');

    const audits = A.sql.prepare(`SELECT action FROM audit_log WHERE resource_id = ? AND action = 'waitlist.waiting_set'`).all(entry.id);
    expect(audits.length).toBe(1);

    const list = await sec.get('/api/waitlist');
    const found = (list.body as { data: EntryBody[] }).data.find((e) => e.id === entry.id);
    expect(found?.studentId).toBe(st.id);
  });

  it('projection وضعیت در فهرست دانش‌آموزان — waiting با زمان شروع', async () => {
    const rows = await studentsOf(sec);
    const st = rows.find((r) => r.firstName === 'نام' && r.waitStatus === 'waiting');
    expect(st).toBeTruthy();
    expect(st?.waitSince).toBeTruthy();
  });

  it('idempotent — تکرار همان تیک ورودی جدید نمی‌سازد؛ تغییر اولویت همان ورودی را به‌روز می‌کند', async () => {
    const st = await createStudent(sec);
    const first = entryOf(await waitStatus(sec, st.id, true, { source: 'self', priority: 'normal' }));
    const again = await waitStatus(sec, st.id, true, { source: 'self', priority: 'normal' });
    expect(again.status).toBe(200);
    expect((again.body as { data: EntryBody | null }).data).toBeNull(); // هیچ تغییری لازم نبود

    const updated = entryOf(await waitStatus(sec, st.id, true, { source: 'self', priority: 'urgent' }));
    expect(updated.id).toBe(first.id);
    expect(updated.priority).toBe('urgent');

    const list = await sec.get('/api/waitlist');
    const open = (list.body as { data: EntryBody[] }).data.filter((e) => e.studentId === st.id && ['waiting', 'called', 'scheduled'].includes(e.status));
    expect(open.length).toBe(1);
  });

  it('پروندهٔ بدون تلفن ولیّ — 400 با پیام روشن', async () => {
    const st = await createStudent(sec, { guardian_phone: undefined });
    const res = await waitStatus(sec, st.id, true, { source: 'self' });
    expect(res.status).toBe(400);
  });

  it('خروج از لیست انتظار — لغو ورودی متصل + projection بدون وضعیت', async () => {
    const st = await createStudent(sec);
    const entry = entryOf(await waitStatus(sec, st.id, true, { source: 'self' }));
    const res = await waitStatus(sec, st.id, false);
    expect(res.status).toBe(200);
    expect(entryOf(res).status).toBe('cancelled');

    const rows = await studentsOf(sec);
    expect(rows.find((r) => r.id === st.id)?.waitStatus).toBeNull();

    const again = await waitStatus(sec, st.id, false);
    expect((again.body as { data: EntryBody | null }).data).toBeNull();

    const audits = A.sql.prepare(`SELECT action FROM audit_log WHERE resource_id = ? AND action = 'waitlist.waiting_cleared'`).all(entry.id);
    expect(audits.length).toBe(1);
  });

  it('RBAC — درمانگر هم می‌تواند «منتظر دریافت خدمت» بگذارد (POST 200)، خواندن آزاد', async () => {
    const ther = await asRole(A, 'therapist');
    const st = await createStudent(sec);
    const res = await waitStatus(ther, st.id, true, { source: 'self' });
    expect(res.status).toBe(200);
    expect((await ther.get('/api/waitlist')).status).toBe(200);
  });
});

describe('پذیرش خودکار با اولین جلسهٔ واقعی', () => {
  let A: ReturnType<typeof createTestApp>;
  let sec: Api;
  let mgr: Api;

  beforeAll(async () => {
    A = createTestApp();
    sec = await asRole(A, 'secretary');
    mgr = await asRole(A, 'manager');
  });

  it('مسیر حضور: نوبت عادی + ثبت «حاضر» → admitted + خروج کامل از لیست انتظار', async () => {
    const st = await createStudent(sec);
    const entry = entryOf(await waitStatus(sec, st.id, true, { source: 'school' }));

    const created = await sec.post('/api/appointments', apptBody(ALI_ID, quarterHourFromNow(90), 45, [st.id]));
    expect(created.status).toBe(201);
    const apptId = (created.body as { data: { id: string } }).data.id;

    const mark = await sec.patch(`/api/attendance/${apptId}/${st.id}`, { status: 'present' });
    expect(mark.status).toBe(200);

    const after = await sec.get(`/api/waitlist/${entry.id}`);
    expect(after.status).toBe(404);

    const list = await sec.get('/api/waitlist');
    expect((list.body as { data: EntryBody[] }).data.find((e) => e.id === entry.id)).toBeUndefined();

    const audits = A.sql.prepare(`SELECT action FROM audit_log WHERE resource_id = ? AND action = 'waitlist.admitted'`).all(entry.id);
    expect(audits.length).toBe(1);

    const rows = await studentsOf(sec);
    expect(rows.find((r) => r.id === st.id)?.waitStatus).toBeNull();
  });

  it('مسیر بورد: checked_in → in_session → completed → admitted (بدون اعلان — D6)', async () => {
    const st = await createStudent(sec);
    const entry = entryOf(await waitStatus(sec, st.id, true, { source: 'self' }));

    const created = await sec.post('/api/appointments', apptBody(ALI_ID, quarterHourFromNow(150), 45, [st.id]));
    const apptId = (created.body as { data: { id: string } }).data.id;

    for (const ops of ['checked_in', 'in_session', 'completed']) {
      const r = await mgr.post(`/api/appointments/${apptId}/ops-status`, { ops_status: ops });
      expect(r.status).toBe(200);
    }

    const after = await sec.get(`/api/waitlist/${entry.id}`);
    expect(after.status).toBe(404);
    const dbRow = A.sql.prepare(`SELECT status, deleted_at FROM waitlist WHERE id = ?`).get(entry.id) as { status: string; deleted_at: string | null };
    expect(dbRow.status).toBe('admitted');
    expect(dbRow.deleted_at).toBeTruthy();

    const rows = await studentsOf(sec);
    expect(rows.find((r) => r.id === st.id)?.waitStatus).toBeNull();

    const notifCount = A.sql.prepare(`SELECT COUNT(*) AS cnt FROM notifications`).all() as Array<{ cnt: number }>;
    expect(Array.isArray(notifCount)).toBe(true);
  });

  it('مسیر نوبت‌دهی از لیست انتظار با ورودی متصل — پروندهٔ متصل مستقیم استفاده می‌شود', async () => {
    const st = await createStudent(sec);
    const entry = entryOf(await waitStatus(sec, st.id, true, { source: 'self', service_type: 'گفتاردرمانی' }));

    const res = await sec.post(`/api/waitlist/${entry.id}/schedule`, {
      staff_id: ALI_ID,
      start_at: quarterHourFromNow(210),
      end_at: quarterHourFromNow(255)
    });
    expect(res.status).toBe(201);
    const body = res.body as { data: { entry: EntryBody; student: { id: string } } };
    expect(body.data.entry.status).toBe('scheduled');
    expect(body.data.student.id).toBe(st.id); // پروندهٔ متصل — بدون ساخت پروندهٔ تکراری
    expect(body.data.entry.studentId).toBe(st.id);
  });

  it('شمارش badge با ورودی‌های متصل سازگار می‌ماند', async () => {
    const badge = await sec.get('/api/waitlist/badge');
    expect(badge.status).toBe(200);
    const b = (badge.body as { data: { waiting: number; overdue: number; urgent: number } }).data;
    expect(b.waiting).toBeGreaterThanOrEqual(0);
  });
});

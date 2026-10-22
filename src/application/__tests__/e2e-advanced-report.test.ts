import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, Api, asRole, createStudent, apptBody, ALI_ID } from '../../test/harness';

let manager: Api;
let secretary: Api;
let therapist: Api;

beforeAll(async () => {
  const A = createTestApp();
  manager = await asRole(A, 'manager');
  secretary = await asRole(A, 'secretary');
  therapist = await asRole(A, 'therapist');
});

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

const FROM = '2026-09-01';
const TO = '2026-12-01';

describe('RBAC و شکل پاسخ', () => {
  it('R1: مدیر/منشی 200 — درمانگر 403', async () => {
    expect((await manager.get(`/api/reports/advanced?from=${FROM}&to=${TO}`)).status).toBe(200);
    expect((await secretary.get(`/api/reports/advanced?from=${FROM}&to=${TO}`)).status).toBe(200);
    expect((await therapist.get(`/api/reports/advanced?from=${FROM}&to=${TO}`)).status).toBe(403);
  });

  it('R2: شکل کامل پاسخ — weeks با هفتهٔ خالی، همهٔ بخش‌ها', async () => {
    const A = createTestApp();
    const m = await asRole(A, 'manager');
    const adv = dataOf<{
      from: string; to: string; generatedAt: string;
      weeks: { weekStart: string; sessions: number; completed: number; cancelled: number; attendanceRate: number | null }[];
      waitlist: Record<string, unknown>;
      assessments: Record<string, unknown>;
      sessionNotes: Record<string, unknown>;
      followups: Record<string, unknown>;
      committee: Record<string, unknown>;
    }>(await m.get(`/api/reports/advanced?from=${FROM}&to=${TO}`));
    expect(adv.from).toBe(FROM);
    expect(adv.to).toBe(TO);
    expect(adv.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(adv.weeks.length).toBeGreaterThanOrEqual(12); // سه ماه = ~۱۳ هفته
    expect(adv.weeks[0].weekStart).toBeTruthy();
    expect(adv.waitlist).toHaveProperty('conversionRate');
    expect(adv.assessments).toHaveProperty('coverageRate');
    expect(adv.sessionNotes).toHaveProperty('coverageRate');
    expect(adv.followups).toHaveProperty('completionRate');
    expect(adv.committee).toHaveProperty('approvalRate');
  });

  it('R3: اعتبارسنجی بازه — بدون from → 400', async () => {
    expect((await manager.get('/api/reports/advanced')).status).toBe(400);
  });
});

describe('محاسبات با دادهٔ واقعی', () => {
  it('R4: روند هفتگی از نوبت واقعی + پوشش گزارش جلسه', async () => {
    const A = createTestApp();
    const m = await asRole(A, 'manager');
    const t = await asRole(A, 'therapist'); // خواندن لیست با درمانگرِ صاحب برنامه (: دفتر هم مجاز است)
    const st = await createStudent(m);

    await m.post('/api/appointments', apptBody(ALI_ID, '2026-10-03T06:00:00.000Z', 45, [st.id]));
    await m.post('/api/appointments', apptBody(ALI_ID, '2026-10-05T06:00:00.000Z', 45, [st.id]));

    const appts = dataOf<{ id: string; students: { studentId: string }[] }[]>(
      await t.get(`/api/appointments?from=2026-10-01T00:00:00.000Z&to=2026-10-10T23:59:59.999Z`)
    );
    const appt = appts.find((a) => a.students?.length > 0);
    if (!appt) throw new Error('نوبت با دانش‌آموز پیدا نشد');
    await m.put(`/api/appointments/${appt.id}/students/${appt.students[0].studentId}/note`, {
      session_note: 'جلسهٔ نخست — گزارش آزمایشی',
      next_action: 'none'
    });

    const adv = dataOf<{
      weeks: { weekStart: string; sessions: number; completed: number; cancelled: number }[];
      sessionNotes: { sessions: number; withNote: number; coverageRate: number | null };
    }>(await m.get(`/api/reports/advanced?from=${FROM}&to=${TO}`));
    const totalSessions = adv.weeks.reduce((s, w) => s + w.sessions, 0);
    expect(totalSessions).toBeGreaterThanOrEqual(2);
    expect(adv.sessionNotes.sessions).toBeGreaterThanOrEqual(2);
    expect(adv.sessionNotes.withNote).toBeGreaterThanOrEqual(1);
    expect(adv.sessionNotes.coverageRate).toBeGreaterThan(0);
  });

  it('R5: قیف لیست انتظار — پذیرش واقعی از مسیر attendance observer و میانگین انتظار از audit', async () => {
    const A = createTestApp();
    const m = await asRole(A, 'manager');
    const t = await asRole(A, 'therapist'); // خواندن لیست با درمانگرِ صاحب برنامه (: دفتر هم مجاز است)
    const st = await createStudent(m);

    await m.post(`/api/students/${st.id}/wait-status`, { awaiting: true, source: 'school', priority: 'normal' });
    await m.post('/api/appointments', apptBody(ALI_ID, '2026-10-06T06:00:00.000Z', 45, [st.id]));
    const appts = dataOf<{ id: string; students: { id: string }[] }[]>(
      await t.get(`/api/appointments?from=2026-10-01T00:00:00.000Z&to=2026-10-10T23:59:59.999Z`)
    );
    const appt = appts.find((a) => a.students?.length > 0);
    if (!appt) throw new Error('نوبت با دانش‌آموز پیدا نشد');
    await m.patch(`/api/attendance/${appt.id}/${st.id}`, { status: 'present' });

    const wl = await m.post('/api/waitlist', {
      first_name: 'متقاضی',
      last_name: 'ریجکت‌شده',
      phone: '09123334455',
      source: 'self'
    });
    const wlId = dataOf<{ id: string }>(wl).id;
    await m.post(`/api/waitlist/${wlId}/reject`, { reason: 'غیرقابل تماس' });

    const adv = dataOf<{
      waitlist: { total: number; open: number; admitted: number; rejected: number; avgWaitDays: number | null; conversionRate: number | null };
    }>(await m.get(`/api/reports/advanced?from=${FROM}&to=${TO}`));
    expect(adv.waitlist.admitted).toBeGreaterThanOrEqual(1);
    expect(adv.waitlist.rejected).toBeGreaterThanOrEqual(1);
    expect(adv.waitlist.avgWaitDays).not.toBeNull();
    expect(adv.waitlist.conversionRate).not.toBeNull();
    expect(adv.waitlist.conversionRate).toBeGreaterThan(0);
  });

  it('R6: کمیسیون برگزارشده با مصوبات در تحلیل ظاهر می‌شود', async () => {
    const A = createTestApp();
    const m = await asRole(A, 'manager');
    const st = await createStudent(m);
    A.sql
      .prepare(
        `INSERT INTO committee_meetings (id, title, meeting_date, status, created_by, created_at, updated_at)
         VALUES (?, ?, ?, 'held', ?, datetime('now'), datetime('now'))`
      )
      .run('cm-r6', 'کمیسیون تحلیل', '2026-10-07', ALI_ID);
    A.sql
      .prepare(
        `INSERT INTO committee_items (id, meeting_id, student_id, topic, decision_status, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'approved', ?, datetime('now'), datetime('now'))`
      )
      .run('ci-r6', 'cm-r6', st.id, 'موضوع تحلیل', ALI_ID);

    const adv = dataOf<{ committee: { heldMeetings: number; itemsTotal: number; approved: number; approvalRate: number | null } }>(
      await m.get(`/api/reports/advanced?from=${FROM}&to=${TO}`)
    );
    expect(adv.committee.heldMeetings).toBeGreaterThanOrEqual(1);
    expect(adv.committee.itemsTotal).toBeGreaterThanOrEqual(1);
    expect(adv.committee.approved).toBeGreaterThanOrEqual(1);
    expect(adv.committee.approvalRate).toBe(1);
  });

  it('R7: پوشش گزارش پرونده — دانش‌آموز با رویداد پیش‌نویس', async () => {
    const A = createTestApp();
    const m = await asRole(A, 'manager');
    const st = await createStudent(m);
    const typeRes = await m.get('/api/case-events/types?active=true');
    const types = (typeRes.body as { data: Array<{ id: string; category: string }> }).data;
    const sessionType = types.find((t) => t.category === 'session')?.id
      ?? dataOf<{ id: string }>(await m.post('/api/case-events/types', { title: 'گزارش R7', category: 'session', fields: [{ key: 'x', label: 'x', type: 'text' }] })).id;
    await m.post(`/api/students/${st.id}/case-events`, {
      eventTypeId: sessionType,
      draft: true,
      values: {}
    });
    const adv = dataOf<{ assessments: { activeStudents: number; withAny: number; withFinal: number } }>(
      await m.get(`/api/reports/advanced?from=${FROM}&to=${TO}`)
    );
    expect(adv.assessments.activeStudents).toBeGreaterThanOrEqual(1);
    expect(adv.assessments.withAny).toBeGreaterThanOrEqual(1);
    expect(adv.assessments.withFinal).toBe(0); // پیش‌نویس — جزو withFinal نیست
  });
});

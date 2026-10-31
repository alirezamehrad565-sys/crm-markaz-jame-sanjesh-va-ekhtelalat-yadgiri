import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestApp,
  Api,
  asRole,
  apptBody,
  quarterHourFromNow,
  createStudent,
  ALI_ID,
  STUDENT1_ID
} from '../../test/harness';

interface TimelineEventResponse {
  at: string;
  kind: string;
  title: string;
  subtitle?: string | null;
  actor?: string | null;
  ref?: { type: string; id: string } | null;
}

interface TimelineResponse {
  data: TimelineEventResponse[];
  nextAction: { type: string; at: string | null; title: string; id: string } | null;
  meta: { hasMore: boolean };
}

function bodyOf(res: { body: unknown }): TimelineResponse {
  return res.body as TimelineResponse;
}

const URL = (studentId: string, q = '') => `/api/students/${studentId}/timeline${q ? `?${q}` : ''}`;

describe('فاز ۶ — تایم‌لاین دانش‌آموز', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: Api;
  let sec: Api;
  let ali: Api;
  let studentId: string;

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
    sec = await asRole(A, 'secretary');
    ali = await asRole(A, 'therapist');
    const st = await createStudent(mgr, { first_name: 'تایم‌لاین', last_name: 'آزمونی' });
    studentId = st.id;
  });

  it('پرونده تشکیل شد — اولین رویداد با بازیگر واقعی؛ 404 برای پروندهٔ ناشناخته', async () => {
    const res = await mgr.get(URL(studentId));
    expect(res.status).toBe(200);
    const body = bodyOf(res);
    const created = body.data.find((e) => e.kind === 'student_created');
    expect(created).toBeTruthy();
    expect(created!.actor).toBe('مدیر مرکز');
    expect(created!.ref?.id).toBe(studentId);
    expect(created!.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/);

    const missing = await mgr.get('/api/students/99999999-9999-9999-9999-999999999999/timeline');
    expect(missing.status).toBe(404);
  });

  it('whitelist §11.2 — student.update در audit هست ولی هرگز در تایم‌لاین نمی‌آید', async () => {
    await mgr.patch(`/api/students/${studentId}`, { guardian_name: 'ولی به‌روزشده' });
    const auditRows = A.sql
      .prepare(`SELECT COUNT(*) AS cnt FROM audit_log WHERE resource_type = 'student' AND resource_id = ? AND action = 'student.update'`)
      .get(studentId) as { cnt: number };
    expect(auditRows.cnt).toBeGreaterThan(0);

    const body = bodyOf(await mgr.get(URL(studentId)));
    expect(body.data.every((e) => e.kind !== 'student_updated')).toBe(true);
    expect(body.data.find((e) => e.kind === 'student_created')).toBeTruthy();
  });

  it('خواندن آزاد برای همهٔ نقش‌های داخلی', async () => {
    expect((await sec.get(URL(studentId))).status).toBe(200);
    expect((await ali.get(URL(studentId))).status).toBe(200);
  });

  it('نوبت → رویداد appointment در start_at؛ جابه‌جایی → appointment_moved با از/به', async () => {
    const apptRes = await mgr.post('/api/appointments', apptBody(ALI_ID, quarterHourFromNow(2880), 45, [studentId]));
    expect(apptRes.status).toBe(201);
    const appt = (apptRes.body as { data: { id: string; startAt: string } }).data;

    const body = bodyOf(await mgr.get(URL(studentId, 'kinds=appointment')));
    const ev = body.data.find((e) => e.ref?.id === appt.id);
    expect(ev).toBeTruthy();
    expect(ev!.kind).toBe('appointment');
    expect(ev!.title).toBe('نوبت جلسه');
    expect(ev!.subtitle).toContain('دکتر علی رضایی');
    expect(ev!.at).toBe(appt.startAt);

    const moveRes = await ali.patch(`/api/appointments/${appt.id}/move`, {
      version: (apptRes.body as { data: { version: number } }).data.version,
      start_at: quarterHourFromNow(4320)
    });
    expect(moveRes.status).toBe(200);

    const body2 = bodyOf(await mgr.get(URL(studentId, 'kinds=appointment,appointment_moved')));
    const moved = body2.data.find((e) => e.kind === 'appointment_moved' && e.ref?.id === appt.id);
    expect(moved).toBeTruthy();
    expect(moved!.subtitle).toMatch(/از .+ به .+/);
    expect(moved!.actor).toBe('دکتر علی رضایی');

    const bodyAll = bodyOf(await mgr.get(URL(studentId)));
    expect(bodyAll.nextAction?.type).toBe('appointment');
    expect(bodyAll.nextAction?.id).toBe(appt.id);
  });

  it('گزارش جلسه → session_note.created؛ هوک follow_up → followup.created با عنوان', async () => {
    const apptRes = await mgr.post('/api/appointments', apptBody(ALI_ID, quarterHourFromNow(90), 45, [studentId]));
    const appt = (apptRes.body as { data: { id: string } }).data;

    const put = await ali.put(`/api/appointments/${appt.id}/students/${studentId}/note`, {
      session_note: 'گزارش آزمون تایم‌لاین — پیشرفت ملموس بود.',
      next_action: 'follow_up'
    });
    expect(put.status).toBe(200);

    const body = bodyOf(await mgr.get(URL(studentId, 'kinds=session_note,followup')));
    const noteEv = body.data.find((e) => e.kind === 'session_note');
    expect(noteEv).toBeTruthy();
    expect(noteEv!.title).toBe('گزارش جلسه ثبت شد');
    expect(noteEv!.actor).toBe('دکتر علی رضایی');

    const fuEv = body.data.find((e) => e.kind === 'followup' && e.title === 'پیگیری ایجاد شد');
    expect(fuEv).toBeTruthy();
    expect(fuEv!.subtitle).toContain('پیگیری');

    await ali.put(`/api/appointments/${appt.id}/students/${studentId}/note`, {
      session_note: 'گزارش آزمون تایم‌لاین — به‌روزرسانی.',
      next_action: 'follow_up'
    });
    const body2 = bodyOf(await mgr.get(URL(studentId, 'kinds=session_note')));
    expect(body2.data.some((e) => e.title === 'گزارش جلسه به‌روزرسانی شد')).toBe(true);
  });

  it('case-status — فقط منشی/مدیر؛ no-op بدون audit؛ رویداد با از/به', async () => {
    const forbidden = await ali.patch(`/api/students/${studentId}/case-status`, { case_status: 'in_intervention' });
    expect(forbidden.status).toBe(403);

    const bad = await sec.patch(`/api/students/${studentId}/case-status`, { case_status: 'unknown_state' });
    expect(bad.status).toBe(400);

    const auditCount = () =>
      (A.sql.prepare(`SELECT COUNT(*) AS cnt FROM audit_log WHERE action = 'student.case_status.changed' AND resource_id = ?`).get(studentId) as { cnt: number }).cnt;

    const before = auditCount();
    const ok = await sec.patch(`/api/students/${studentId}/case-status`, { case_status: 'in_intervention' });
    expect(ok.status).toBe(200);
    expect((ok.body as { data: { caseStatus: string } }).data.caseStatus).toBe('in_intervention');
    expect(auditCount()).toBe(before + 1);

    const again = await sec.patch(`/api/students/${studentId}/case-status`, { case_status: 'in_intervention' });
    expect(again.status).toBe(200);
    expect(auditCount()).toBe(before + 1);

    const body = bodyOf(await mgr.get(URL(studentId, 'kinds=case_status')));
    const ev = body.data.find((e) => e.kind === 'case_status');
    expect(ev).toBeTruthy();
    expect(ev!.subtitle).toBe('از «—» به «در مداخله»');
    expect(ev!.actor).toBe('زهرا کریمی');
  });

  it('گزارش ساخت‌یافتهٔ جلسه → رویداد case_event روی تایم‌لاین', async () => {
    const created = await mgr.post('/api/case-events/types', { title: 'گزارش جلسهٔ تایم‌لاین ', category: 'session', fields: [{ key: 'g', label: 'g', type: 'text' }] });
    expect(created.status).toBe(201);
    const sessionType = (created.body as { data: { id: string } }).data;
    const res = await mgr.post(`/api/students/${studentId}/case-events`, {
      eventTypeId: sessionType.id,
      values: {}
    });
    expect(res.status).toBe(201);

    const body = bodyOf(await mgr.get(URL(studentId, 'kinds=case_event')));
    const ev = body.data.find((e) => e.kind === 'case_event');
    expect(ev).toBeTruthy();
  });

  it('پیام sent خانواده → رویداد notification؛ pending/failed هرگز', async () => {
    A.sql
      .prepare(
        `INSERT INTO notifications (id, channel, template, student_id, payload, status, sent_at, created_at, updated_at)
         VALUES ('ntf-sent-1', 'bale', 'appointment_reminder', ?, '{}', 'sent', '2025-10-01T08:00:00.000Z', '2025-10-01T07:00:00.000Z', '2025-10-01T08:00:00.000Z')`
      )
      .run(studentId);
    A.sql
      .prepare(
        `INSERT INTO notifications (id, channel, template, student_id, payload, status, created_at, updated_at)
         VALUES ('ntf-pending-1', 'bale', 'appointment_reminder', ?, '{}', 'pending', '2025-10-02T07:00:00.000Z', '2025-10-02T07:00:00.000Z')`
      )
      .run(studentId);

    const body = bodyOf(await mgr.get(URL(studentId, 'kinds=notification')));
    const evs = body.data.filter((e) => e.kind === 'notification');
    expect(evs).toHaveLength(1);
    expect(evs[0].title).toBe('یادآوری نوبت به خانواده ارسال شد');
    expect(evs[0].subtitle).toContain('بات بله');
  });

  it('برچسب‌ها → رویداد tags با +/−', async () => {
    const tagRes = await mgr.post('/api/tags', { name: `برچسب تایم‌لاین ${Date.now()}`, category: 'disorder' });
    const tagId = (tagRes.body as { data: { id: string } }).data.id;
    const put = await mgr.put(`/api/students/${studentId}/tags`, { tag_ids: [tagId] });
    expect(put.status).toBe(200);

    const body = bodyOf(await mgr.get(URL(studentId, 'kinds=tags')));
    const ev = body.data.find((e) => e.kind === 'tags');
    expect(ev).toBeTruthy();
    expect(ev!.subtitle).toMatch(/\+۱/);
  });

  it('فیلتر from/to و صفحه‌بندی limit/offset با hasMore', async () => {
    const all = bodyOf(await mgr.get(URL(studentId)));
    const newestAt = all.data[0]?.at;
    expect(newestAt).toBeTruthy();

    const limited = bodyOf(await mgr.get(URL(studentId, 'limit=1')));
    expect(limited.data).toHaveLength(1);
    expect(limited.data[0].at).toBe(newestAt);
    expect(limited.meta.hasMore).toBe(true);

    const second = bodyOf(await mgr.get(URL(studentId, 'limit=1&offset=1')));
    expect(second.data[0].at).toBe(all.data[1].at);

    const fromFuture = bodyOf(await mgr.get(URL(studentId, 'from=2099-01-01T00:00:00Z')));
    expect(fromFuture.data).toHaveLength(0);
  });
});

describe('فاز ۶ — «اقدام بعدی» پروفایل (§14)', () => {
  it('بدون نوبت آینده — بازترین پیگیری باز (معوق اول)', async () => {
    const A2 = createTestApp();
    const mgr2 = await asRole(A2, 'manager');
    const st = await createStudent(mgr2);

    const fuRes = await mgr2.post('/api/followups', {
      entity_type: 'student',
      entity_id: st.id,
      student_id: st.id,
      title: 'تماس با خانواده برای ارزیابی',
      assignee_id: '00000000-0000-0000-0000-000000000004',
      due_at: '2020-05-01T00:00:00.000Z'
    });
    expect(fuRes.status).toBe(201);

    const body = bodyOf(await mgr2.get(URL(st.id)));
    expect(body.nextAction?.type).toBe('followup');
    expect(body.nextAction?.title).toContain('تماس با خانواده');
    expect(body.nextAction?.at).toBe('2020-05-01T00:00:00.000Z');
  });

  it('هیچ اقدامی → nextAction=null', async () => {
    const A2 = createTestApp();
    const mgr2 = await asRole(A2, 'manager');
    const st = await createStudent(mgr2);
    const body = bodyOf(await mgr2.get(URL(st.id)));
    expect(body.nextAction).toBeNull();
  });
});

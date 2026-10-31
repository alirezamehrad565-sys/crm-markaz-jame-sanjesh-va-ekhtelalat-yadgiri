import { describe, it, expect, beforeAll } from 'vitest';
import { computeBatchSendAt } from '../notify/batch'; // — خنثی‌سازی بمب زمانی اعلان‌ها
import {
  createTestApp,
  Api,
  asRole,
  createStudent,
  apptBody,
  quarterHourFromNow,
  WEBHOOK_SECRET,
  ALI_ID,
  MARYAM_ID,
  STUDENT1_ID,
  STUDENT2_ID,
  STUDENT3_ID,
  SCHOOL1_ID
} from '../../test/harness';

const MONDAY_SRC = '2030-01-07';
const MONDAY_DST = '2030-01-14';

async function botUpdate(A: ReturnType<typeof createTestApp>, text: string, chatId = 90125) {
  return A.app.request(
    `/webhook/bale/${WEBHOOK_SECRET}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ update_id: 1, message: { chat: { id: chatId }, text } })
    },
    A.env as never
  );
}

describe('چرخهٔ حیات نوبت + موتور تعارض', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;
  let therapist: Api;
  let s1: string;
  let s2: string;
  let s3: string;

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
    therapist = await asRole(A, 'therapist');
    s1 = (await createStudent(manager)).id;
    s2 = (await createStudent(manager)).id;
    s3 = (await createStudent(manager)).id;
  });

  it('ساخت نوبت با دانش‌آموز — 201 با version=1', async () => {
    const res = await manager.post('/api/appointments', apptBody(ALI_ID, '2030-01-07T08:00:00.000Z', 45, [s1]));
    expect(res.status).toBe(201);
    const data = (res.body as { data: { id: string; version: number; status: string; students: unknown[] } }).data;
    expect(data.version).toBe(1);
    expect(data.status).toBe('scheduled');
    expect(data.students).toHaveLength(1);
  });

  it('نوبت بدون دانش‌آموز — 400 با پیام قاعده', async () => {
    const res = await manager.post('/api/appointments', apptBody(ALI_ID, '2030-01-07T13:00:00.000Z', 45));
    expect(res.status).toBe(400);
    expect((res.body as { message: string }).message).toContain('حداقل یک دانش‌آموز');
  });

  it('نوبت با ۲ دانش‌آموز — attendance=pending برای هر دو', async () => {
    const res = await manager.post('/api/appointments', apptBody(ALI_ID, '2030-01-07T10:00:00.000Z', 30, [STUDENT1_ID, STUDENT2_ID]));
    expect(res.status).toBe(201);
    const data = (res.body as { data: { students: Array<{ studentId: string; attendance: string }> } }).data;
    expect(data.students).toHaveLength(2);
    expect(data.students.every((x) => x.attendance === 'pending')).toBe(true);
  });

  it('هم‌پوشانی نوبت همان همکار — 201 ولی با هشدار نرم تعارض (طراحی )', async () => {
    const res = await therapist.post('/api/appointments', apptBody(ALI_ID, '2030-01-07T10:15:00.000Z', 30, [STUDENT1_ID]));
    expect(res.status).toBe(201);
    const warnings = (res.body as { warnings?: unknown[] }).warnings;
    expect(Array.isArray(warnings)).toBe(true);
    expect(warnings!.length).toBeGreaterThanOrEqual(1);
  });

  it('هم‌پوشانی با همکار دیگر — مجاز (تعارض فقط درون-همکار است)', async () => {
    const res = await manager.post('/api/appointments', apptBody(MARYAM_ID, '2030-01-07T10:15:00.000Z', 30, [s3]));
    expect(res.status).toBe(201);
  });

  it('مدت نامعتبر (۱۰ دقیقه) — 400', async () => {
    const res = await manager.post('/api/appointments', apptBody(ALI_ID, '2030-01-07T13:00:00.000Z', 10, [s1]));
    expect(res.status).toBe(400);
  });

  it('move با version قدیمی — 409، سپس move درست — version+1', async () => {
    const created = await manager.post('/api/appointments', apptBody(ALI_ID, '2030-01-08T08:00:00.000Z', 45, [s1]));
    const appt = (created.body as { data: { id: string; version: number } }).data;

    const stale = await manager.patch(`/api/appointments/${appt.id}/move`, {
      start_at: '2030-01-08T09:00:00.000Z',
      version: 99
    });
    expect(stale.status).toBe(409);

    const good = await manager.patch(`/api/appointments/${appt.id}/move`, {
      start_at: '2030-01-08T09:00:00.000Z',
      version: appt.version
    });
    expect(good.status).toBe(200);
    const moved = (good.body as { data: { version: number; startAt: string } }).data;
    expect(moved.version).toBe(appt.version + 1);
    expect(moved.startAt).toBe('2030-01-08T09:00:00.000Z');
  });

  it('move خارج از شبکهٔ ۱۵ دقیقه‌ای — 400', async () => {
    const created = await manager.post('/api/appointments', apptBody(ALI_ID, '2030-01-08T12:00:00.000Z', 30, [s1]));
    const appt = (created.body as { data: { id: string; version: number } }).data;
    const res = await manager.patch(`/api/appointments/${appt.id}/move`, {
      start_at: '2030-01-08T12:07:00.000Z',
      version: appt.version
    });
    expect(res.status).toBe(400);
  });

  it('resize + cancel + restore کامل', async () => {
    const created = await manager.post('/api/appointments', apptBody(MARYAM_ID, '2030-01-09T08:00:00.000Z', 45, [s2]));
    const a = (created.body as { data: { id: string; version: number } }).data;

    const resized = await manager.patch(`/api/appointments/${a.id}/resize`, {
      end_at: '2030-01-09T09:15:00.000Z',
      version: a.version
    });
    expect(resized.status).toBe(200);
    const v2 = (resized.body as { data: { version: number } }).data.version;

    const cancelled = await manager.post(`/api/appointments/${a.id}/cancel`, { version: v2 });
    expect(cancelled.status).toBe(200);
    const c = (cancelled.body as { data: { version: number; status: string } }).data;
    expect(c.status).toBe('cancelled');

    const cancelAgain = await manager.post(`/api/appointments/${a.id}/cancel`, { version: c.version });
    expect(cancelAgain.status).toBe(409);

    const restored = await manager.post(`/api/appointments/${a.id}/restore`, { version: c.version });
    expect(restored.status).toBe(200);
    expect(((restored.body as { data: { status: string } }).data).status).toBe('scheduled');
  });

  it('add/remove دانش‌آموز + جلوگیری از تکرار (409)', async () => {
    const created = await manager.post('/api/appointments', apptBody(ALI_ID, '2030-01-09T11:00:00.000Z', 30, [s1]));
    const id = (created.body as { data: { id: string } }).data.id;

    const add = await manager.post(`/api/appointments/${id}/students`, { student_id: STUDENT3_ID });
    expect(add.status).toBe(204);
    const addDup = await manager.post(`/api/appointments/${id}/students`, { student_id: STUDENT3_ID });
    expect(addDup.status).toBe(409);

    const rm = await manager.delete(`/api/appointments/${id}/students/${STUDENT3_ID}`);
    expect(rm.status).toBe(204);
  });

  it('copy-week از دوشنبه به دوشنبهٔ بعد + undo آن', async () => {
    const c1 = await manager.post('/api/appointments', apptBody(ALI_ID, '2030-01-07T06:00:00.000Z', 30, [s1]));
    const c2 = await manager.post('/api/appointments', apptBody(MARYAM_ID, '2030-01-08T06:00:00.000Z', 30, [s2]));
    expect(c1.status).toBe(201);
    expect(c2.status).toBe(201);

    const dry = await manager.post('/api/appointments/copy-week', {
      source_monday: MONDAY_SRC,
      target_monday: MONDAY_DST,
      staff_id: ALI_ID, // کپی را فقط هفتهٔ ALI می‌گیریم تا با نمای خوددرمانگر راستی‌آزمایی شود
      dry_run: true
    });
    expect(dry.status).toBe(200);

    const copy = await manager.post('/api/appointments/copy-week', {
      source_monday: MONDAY_SRC,
      target_monday: MONDAY_DST,
      staff_id: ALI_ID
    });
    expect(copy.status).toBe(200);
    const result = copy.body as { data: { batchId: string | null; copied: number; dryRun: boolean } };
    const batchId = result.data.batchId;
    expect(batchId).toBeTruthy();
    expect(result.data.copied).toBeGreaterThanOrEqual(2);

    const list = await therapist.get('/api/appointments?from=2030-01-14T00:00:00.000Z&to=2030-01-20T23:59:59.999Z');
    const items = (list.body as { data: Array<{ batchId: string | null }> }).data;
    expect(items.filter((x) => x.batchId === batchId)).toHaveLength(result.data.copied);

    const undo = await manager.post(`/api/appointments/copy-week/${batchId}/undo`);
    expect(undo.status).toBe(200);
    const after = await therapist.get('/api/appointments?from=2030-01-14T00:00:00.000Z&to=2030-01-20T23:59:59.999Z');
    const afterItems = (after.body as { data: Array<{ batchId: string | null }> }).data;
    expect(afterItems.filter((x) => x.batchId === batchId)).toHaveLength(0);
  });

  it('لیست نوبت‌ها با فیلتر staff_id و بازهٔ زمانی (نمای خود درمانگر)', async () => {
    const res = await therapist.get(`/api/appointments?staff_id=${ALI_ID}&from=2030-01-07T00:00:00.000Z&to=2030-01-09T23:59:59.999Z`);
    expect(res.status).toBe(200);
    const items = (res.body as { data: Array<{ staffId: string; startAt: string }> }).data;
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items.every((x) => x.staffId === ALI_ID)).toBe(true);
  });

  it('endpoint دیباگ تعارض — /api/conflicts و /api/conflicts/check', async () => {
    const res = await manager.get(`/api/conflicts?staff_id=${ALI_ID}&from=2030-01-01T00:00:00.000Z&to=2030-02-01T00:00:00.000Z`);
    expect(res.status).toBe(200);

    const check = await manager.post('/api/conflicts/check', {
      staff_id: ALI_ID,
      start_at: '2030-01-07T10:15:00.000Z',
      end_at: '2030-01-07T10:45:00.000Z'
    });
    expect(check.status).toBe(200);
    const data = check.body as { data: unknown[] };
    expect(Array.isArray(data.data) ? data.data.length : 1).toBeGreaterThanOrEqual(1);
  });
});

describe('حضور و غیاب دانش‌آموز + اعلان هوشمند غیبت', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
  });

  it('ثبت حاضر/غایب + لیست معوق + آمار', async () => {
    const s1 = await createStudent(manager);
    const s2 = await createStudent(manager);
    const past = '2026-10-05T06:00:00.000Z'; // امروز صبح تهران — گذشته
    const created = await manager.post('/api/appointments', apptBody(ALI_ID, past, 30, [s1.id, s2.id]));
    const appt = (created.body as { data: { id: string } }).data;

    const markPresent = await manager.patch(`/api/attendance/${appt.id}/${s1.id}`, { status: 'present' });
    expect(markPresent.status).toBe(200);

    const markAbsent = await manager.patch(`/api/attendance/${appt.id}/${s2.id}`, { status: 'absent', note: 'بدون اطلاع' });
    expect(markAbsent.status).toBe(200);

    const pending = await manager.get('/api/attendance/pending');
    expect(pending.status).toBe(200);
    const pendingItems = (pending.body as { data: Array<{ appointmentId: string; studentId: string }> }).data;
    expect(pendingItems.some((x) => x.appointmentId === appt.id)).toBe(false);

    const stats = await manager.get(`/api/attendance/stats?staff_id=${ALI_ID}&from=2026-10-01T00:00:00.000Z&to=2026-10-31T23:59:59.999Z`);
    expect(stats.status).toBe(200);
    const st = (stats.body as { data: { present: number; absent: number } }).data;
    expect(st.present).toBeGreaterThanOrEqual(1);
    expect(st.absent).toBeGreaterThanOrEqual(1);
  });

  it('ثبت حضور روی نوبت لغوشده — 400', async () => {
    const s = await createStudent(manager);
    const created = await manager.post('/api/appointments', apptBody(ALI_ID, '2030-01-10T08:00:00.000Z', 30, [s.id]));
    const appt = (created.body as { data: { id: string; version: number } }).data;
    await manager.post(`/api/appointments/${appt.id}/cancel`, { version: appt.version });

    const res = await manager.patch(`/api/attendance/${appt.id}/${s.id}`, { status: 'present' });
    expect(res.status).toBe(400);
  });

  it('غیبت → اعلان attendance_absent به خانوادهٔ متصل (prefs با channel bale)', async () => {
    const s = await createStudent(manager);
    const prefs = await manager.put(`/api/notifications/prefs/${s.id}`, {
      channel: 'bale',
      chat_id: 'family-chat-1'
    });
    expect(prefs.status).toBe(200);

    const past = '2026-10-05T05:00:00.000Z';
    const created = await manager.post('/api/appointments', apptBody(ALI_ID, past, 30, [s.id]));
    const appt = (created.body as { data: { id: string } }).data;

    const mark = await manager.patch(`/api/attendance/${appt.id}/${s.id}`, { status: 'absent' });
    expect(mark.status).toBe(200);

    const list = await manager.get('/api/notifications?student_id=' + s.id);
    const items = (list.body as { data: Array<{ template: string; status: string; recipient: string | null }> }).data;
    const absentNotifs = items.filter((n) => n.template === 'attendance_absent');
    expect(absentNotifs.length).toBeGreaterThanOrEqual(1);
    expect(absentNotifs.every((n) => n.status === 'sent')).toBe(true);
    expect(absentNotifs[0].recipient).toBe('family-chat-1');
  });
});

describe('// — صف اعلان‌ها، یادآورها و وب‌هوک بات', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
  });

  it('ساخت نوبت → اعلان appointment_created برای خانواده + معلم (staff link متصل)', async () => {
    const link = await manager.post('/api/notifications/staff-links', { staff_id: ALI_ID });
    expect(link.status).toBe(201);
    const code = (link.body as { data: { code: string } }).data.code;
    const hooked = await botUpdate(A, `/link ${code}`, 5150);
    expect(hooked.status).toBe(200);
    const hookBody = (await hooked.json()) as { handled: boolean; reply: string };
    expect(hookBody.handled).toBe(true);
    expect(hookBody.reply).toContain('اتصال');

    const s = await createStudent(manager);
    await manager.put(`/api/notifications/prefs/${s.id}`, { channel: 'internal', chat_id: 'internal-chat-9' });

    const startIso = quarterHourFromNow(3 * 24 * 60);
    const expectDraft =
      computeBatchSendAt({ nowIso: new Date().toISOString(), appointmentStartIso: startIso, batchHour: 18 }) !== null;
    const created = await manager.post('/api/appointments', apptBody(ALI_ID, startIso, 45, [s.id]));
    expect(created.status).toBe(201);
    const apptId = (created.body as { data: { id: string } }).data.id;

    const list = await manager.get(`/api/notifications?appointment_id=${apptId}`);
    const items = (list.body as { data: Array<{ template: string; status: string; recipient: string | null; sendAt: string | null }> }).data;
    const templates = items.map((n) => n.template);
    expect(templates).toContain('appointment_created');
    if (expectDraft) {
      expect(items.some((n) => n.template === 'appointment_created' && n.recipient === 'internal-chat-9' && n.status === 'pending' && n.sendAt)).toBe(true);
      expect(items.some((n) => n.template === 'staff_appointment_created' && n.recipient === '5150' && n.status === 'pending' && n.sendAt)).toBe(true);
    } else {
      expect(items.some((n) => n.template === 'appointment_created' && n.recipient === 'internal-chat-9' && n.status === 'sent')).toBe(true);
      expect(items.some((n) => n.template === 'staff_appointment_created' && n.recipient === '5150' && n.status === 'sent')).toBe(true);
    }
  });

  it('یادآورها: enqueue + idempotency کامل (اجرای دوم duplicates)', async () => {
    const s = await createStudent(manager);
    await manager.put(`/api/notifications/prefs/${s.id}`, { channel: 'internal', chat_id: 'remind-chat', reminder_hours_before: 2 });

    const created = await manager.post('/api/appointments', apptBody(MARYAM_ID, quarterHourFromNow(3 * 60), 30, [s.id]));
    expect(created.status).toBe(201);

    const run1 = await manager.post('/api/notifications/reminders/enqueue');
    expect(run1.status).toBe(200);
    const sum1 = (run1.body as { data: { enqueued: number; duplicates: number } }).data;
    expect(sum1.enqueued).toBeGreaterThanOrEqual(1);
    expect(sum1.duplicates).toBe(0);

    const run2 = await manager.post('/api/notifications/reminders/enqueue');
    const sum2 = (run2.body as { data: { enqueued: number; duplicates: number } }).data;
    expect(sum2.enqueued).toBe(0);
    expect(sum2.duplicates).toBe(sum1.enqueued);
  });

  it('stats و dispatch — dispatch فوری‌ها را خالی می‌کند؛ پیش‌نویس‌های آینده می‌مانند', async () => {
    const stats1 = await manager.get('/api/notifications/stats');
    expect(stats1.status).toBe(200);
    const s1 = (stats1.body as { data: Record<string, number> }).data;
    expect(typeof s1.pending).toBe('number');

    const outbox1 = await manager.get('/api/notifications/outbox');
    expect(outbox1.status).toBe(200);
    const ob1 = (outbox1.body as { data: { drafts: Array<{ sendAt: string | null }> } }).data;
    const futureDrafts = ob1.drafts.filter((d) => d.sendAt && Date.parse(d.sendAt) > Date.now()).length;

    const dispatch = await manager.post('/api/notifications/dispatch');
    expect(dispatch.status).toBe(200);

    const stats2 = await manager.get('/api/notifications/stats');
    const s2 = (stats2.body as { data: { pending: number } }).data;
    expect(s2.pending).toBe(futureDrafts);
  });

  it('وب‌هوک: /start و /myid پاسخ می‌گیرند، پیام غیردستوری نادیده گرفته می‌شود', async () => {
    const start = await botUpdate(A, '/start', 6001);
    const startBody = (await start.json()) as { handled: boolean; reply: string | null };
    expect(startBody.handled).toBe(true);
    expect(startBody.reply).toBeTruthy();

    const myid = await botUpdate(A, '/myid', 6002);
    const myidBody = (await myid.json()) as { reply: string };
    expect(myidBody.reply).toContain('6002');

    const plain = await botUpdate(A, 'سلام خوبی', 6003);
    const plainBody = (await plain.json()) as { handled: boolean; reply: string | null };
    expect(plainBody.handled).toBe(false);
    expect(plainBody.reply).toBeNull();
  });

  it('گزارش معلم: کلاس + لینک معلم + گزارش → اعلان queued', async () => {
    const school = await manager.post('/api/schools', { name: 'دبستان گزارش‌آزمون', kind: 'school' });
    const schoolId = (school.body as { data: { id: string } }).data.id;
    const cls = await manager.post('/api/classes', {
      school_id: schoolId,
      name: 'کلاس گزارش',
      teacher_name: 'خانم معلم',
      teacher_phone: '09121115500'
    });
    const classId = (cls.body as { data: { id: string } }).data.id;

    const clink = await manager.post('/api/notifications/class-links', { class_id: classId });
    expect(clink.status).toBe(201);
    const code = (clink.body as { data: { code: string } }).data.code;
    const hooked = await botUpdate(A, `/link ${code}`, 7100);
    expect(hooked.status).toBe(200);
    const hookBody = (await hooked.json()) as { reply: string };
    expect(hookBody.reply).toContain('اتصال');

    const s = await createStudent(manager, { school_id: schoolId });
    const patched = await manager.patch(`/api/students/${s.id}`, { class_id: classId });
    expect(patched.status).toBe(200);
    expect(((patched.body as { data: { classId: string | null } }).data).classId).toBe(classId);

    const report = await manager.post('/api/notifications/teacher-report', {
      student_id: s.id,
      text: 'پیشرفت خوبی در خواندن دارد.'
    });
    expect(report.status).toBe(201);
    const rdata = (report.body as { data: { enqueued: number; className: string } }).data;
    expect(rdata.enqueued).toBe(1);
    expect(rdata.className).toBe('کلاس گزارش');

    const list = await manager.get('/api/notifications?student_id=' + s.id);
    const items = (list.body as { data: Array<{ template: string; recipient: string | null }> }).data;
    expect(items.some((n) => n.template === 'teacher_report' && n.recipient === '7100')).toBe(true);
  });

  it('گزارش معلم برای دانش‌آموز بی‌کلاس — 409 با پیام راهنما', async () => {
    const s = await createStudent(manager);
    const res = await manager.post('/api/notifications/teacher-report', { student_id: s.id, text: 'گزارش بی‌کلاس' });
    expect(res.status).toBe(409);
  });
});

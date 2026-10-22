import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestApp,
  Api,
  asRole,
  apptBody,
  quarterHourFromNow,
  ALI_ID,
  MARYAM_ID,
  STUDENT1_ID
} from '../../test/harness';

interface NoteBody {
  appointmentId: string;
  studentId: string;
  sessionNote: string | null;
  nextAction: string | null;
}

function noteOf(res: { body: unknown }): NoteBody {
  return (res.body as { data: NoteBody }).data;
}

async function createAppt(api: Api, staffId = ALI_ID) {
  const res = await api.post('/api/appointments', apptBody(staffId, quarterHourFromNow(90), 45, [STUDENT1_ID]));
  expect(res.status).toBe(201);
  return (res.body as { data: { id: string; version: number } }).data;
}

const URL = (apptId: string, studentId = STUDENT1_ID) => `/api/appointments/${apptId}/students/${studentId}/note`;

function auditRows(A: ReturnType<typeof createTestApp>, apptId: string, studentId = STUDENT1_ID) {
  return A.sql
    .prepare(`SELECT action, changes FROM audit_log WHERE resource_id = ? AND action LIKE 'session_note.%' ORDER BY rowid`)
    .all(`${apptId}/${studentId}`) as Array<{ action: string; changes: string | null }>;
}

describe('فاز ۲ — قواعد نویسنده و خواندن', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: Api;
  let sec: Api;
  let ali: Api;

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
    sec = await asRole(A, 'secretary');
    ali = await asRole(A, 'therapist');
  });

  it('نوشتن توسط همکارِ همان نوبت — 200 و بازتاب در GET و نوبت', async () => {
    const appt = await createAppt(mgr, ALI_ID);
    const res = await ali.put(URL(appt.id), {
      session_note: 'گزارش جلسه اول — پاسخ‌دهی خوب بود، والد در جریان پیشرفت قرار گرفت.',
      next_action: 'next_appointment'
    });
    expect(res.status).toBe(200);
    const saved = noteOf(res);
    expect(saved.sessionNote).toContain('پاسخ‌دهی خوب');
    expect(saved.nextAction).toBe('next_appointment');

    const read = await sec.get(URL(appt.id));
    expect(read.status).toBe(200);
    expect(noteOf(read).sessionNote).toContain('پاسخ‌دهی خوب');

    const ap = await ali.get(`/api/appointments?id=${appt.id}`);
    const st = (ap.body as { data: { students: Array<{ sessionNote?: string | null; nextAction?: string | null }> } }).data.students[0];
    expect(st.sessionNote).toContain('پاسخ‌دهی خوب');
    expect(st.nextAction).toBe('next_appointment');
  });

  it('قاعدهٔ نویسنده — منشی 403؛ درمانگرِ غیرمالک 403؛ مدیر مجاز', async () => {
    const appt = await createAppt(mgr, ALI_ID);

    const bySec = await sec.put(URL(appt.id), { session_note: 'منشی نمی‌نویسد', next_action: 'none' });
    expect(bySec.status).toBe(403);

    const appt2 = await createAppt(mgr, MARYAM_ID);
    const byOtherTherapist = await ali.put(URL(appt2.id), { session_note: 'غیرمالک', next_action: 'none' });
    expect(byOtherTherapist.status).toBe(403);

    const byMgr = await mgr.put(URL(appt.id), { session_note: 'ثبت مدیر', next_action: 'contact' });
    expect(byMgr.status).toBe(200);
    expect(noteOf(byMgr).nextAction).toBe('contact');
  });

  it('خواندن آزاد برای همهٔ نقش‌های داخلی — منشی و درمانگر 200', async () => {
    const appt = await createAppt(mgr, ALI_ID);
    await ali.put(URL(appt.id), { session_note: 'خواندنی', next_action: 'follow_up' });

    expect((await sec.get(URL(appt.id))).status).toBe(200);
    expect((await ali.get(URL(appt.id))).status).toBe(200);
    expect((await mgr.get(URL(appt.id))).status).toBe(200);
  });
});

describe('فاز ۲ — اعتبارسنجی و حالت‌های خطا', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: Api;
  let sec: Api;
  let ali: Api;

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
    sec = await asRole(A, 'secretary');
    ali = await asRole(A, 'therapist');
  });

  it('سقف ۲۰۰۰ نویسه — 2001 رد (400)، 2000 قبول', async () => {
    const appt = await createAppt(mgr);
    const tooLong = await mgr.put(URL(appt.id), { session_note: 'ا'.repeat(2001), next_action: 'none' });
    expect(tooLong.status).toBe(400);

    const ok = await mgr.put(URL(appt.id), { session_note: 'ا'.repeat(2000), next_action: 'none' });
    expect(ok.status).toBe(200);
  });

  it('مقدار نامعتبر next_action — 400', async () => {
    const appt = await createAppt(mgr);
    const res = await mgr.put(URL(appt.id), { session_note: 'متن', next_action: 'bogus' });
    expect(res.status).toBe(400);
  });

  it('نوبت لغوشده گزارش نمی‌گیرد — 409؛ خواندنش همچنان آزاد', async () => {
    const appt = await createAppt(mgr);
    await mgr.put(URL(appt.id), { session_note: 'قبل از لغو', next_action: 'none' });
    const cancel = await mgr.post(`/api/appointments/${appt.id}/cancel`, { version: appt.version });
    expect(cancel.status).toBe(200);

    const write = await mgr.put(URL(appt.id), { session_note: 'بعد از لغو', next_action: 'none' });
    expect(write.status).toBe(409);

    const read = await mgr.get(URL(appt.id));
    expect(read.status).toBe(200);
    expect(noteOf(read).sessionNote).toBe('قبل از لغو');
  });

  it('404 — نوبت ناموجود و دانش‌آموزِ خارج از نوبت', async () => {
    const appt = await createAppt(mgr);
    const noStudent = await mgr.put(`/api/appointments/${appt.id}/students/00000000-0000-0000-0000-00000000dead/note`, {
      session_note: 'x', next_action: 'none'
    });
    expect(noStudent.status).toBe(404);

    const noAppt = await mgr.put('/api/appointments/00000000-0000-0000-0000-00000000dead/students/' + STUDENT1_ID + '/note', {
      session_note: 'x', next_action: 'none'
    });
    expect(noAppt.status).toBe(404);
  });
});

describe('فاز ۲ — audit، idempotent و پاک کردن', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: Api;
  let sec: Api;
  let ali: Api;

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
    sec = await asRole(A, 'secretary');
    ali = await asRole(A, 'therapist');
  });

  it('audit created/updated — بدون متن گزارش (PII §20)؛ همان محتوا no-op', async () => {
    const appt = await createAppt(mgr);
    const text = 'متن محرمانهٔ گزارش که نباید در audit بیاید';

    await mgr.put(URL(appt.id), { session_note: text, next_action: 'follow_up' });
    await mgr.put(URL(appt.id), { session_note: text + ' ادامه', next_action: 'follow_up' });

    const rows = auditRows(A, appt.id);
    expect(rows.map((r) => r.action)).toEqual(['session_note.created', 'session_note.updated']);

    for (const r of rows) {
      expect(r.changes).not.toContain('متن محرمانه');
      const changes = JSON.parse(r.changes ?? '{}') as { session_note?: { from: number; to: number } };
      expect(typeof changes.session_note?.to).toBe('number');
    }

    const again = await mgr.put(URL(appt.id), { session_note: text + ' ادامه', next_action: 'follow_up' });
    expect(again.status).toBe(200);
    expect(auditRows(A, appt.id)).toHaveLength(2);
  });

  it('پاک کردن: متن خالی + none → NULL در DB؛ و version نوبت ثابت می‌ماند', async () => {
    const appt = await createAppt(mgr);
    await mgr.put(URL(appt.id), { session_note: 'موجود', next_action: 'referral' });

    const cleared = await mgr.put(URL(appt.id), { session_note: '', next_action: 'none' });
    expect(cleared.status).toBe(200);
    expect(noteOf(cleared).sessionNote).toBeNull();
    expect(noteOf(cleared).nextAction).toBeNull();

    const raw = A.sql
      .prepare(`SELECT session_note, next_action FROM appointment_students WHERE appointment_id = ? AND student_id = ?`)
      .get(appt.id, STUDENT1_ID) as { session_note: string | null; next_action: string | null };
    expect(raw.session_note).toBeNull();
    expect(raw.next_action).toBeNull();

    const ap = await ali.get(`/api/appointments?id=${appt.id}`);
    expect((ap.body as { data: { version: number } }).data.version).toBe(appt.version);
  });

  it('فاز ۳ — هوک جلسه→پیگیری: ورود به follow_up در همان تراکنش پیگیری می‌سازد (مسئول = نویسنده، مهلت پیش‌فرض)', async () => {
    const appt = await createAppt(mgr, ALI_ID);
    const res = await ali.put(URL(appt.id), { session_note: 'نیاز به پیگیری تلفنی از خانواده', next_action: 'follow_up' });
    expect(res.status).toBe(200);
    expect(noteOf(res).nextAction).toBe('follow_up');

    const list = await sec.get(`/api/followups?entity_type=appointment&entity_id=${appt.id}`);
    expect(list.status).toBe(200);
    const items = (list.body as { data: Array<{ id: string; assigneeId: string; studentId: string | null; status: string; dueAt: string | null; title: string }> }).data;
    expect(items).toHaveLength(1);
    expect(items[0].assigneeId).toBe(ALI_ID); // مسئول = نویسندهٔ گزارش
    expect(items[0].studentId).toBe(STUDENT1_ID);
    expect(items[0].status).toBe('open');
    expect(items[0].dueAt).toBeTruthy(); // مهلت پیش‌فرض +۷ روز
    expect(items[0].title).toContain('علی'); // نام دانش‌آموز در عنوان

    const created = A.sql
      .prepare(`SELECT resource_id FROM audit_log WHERE action = 'followup.created' AND resource_type = 'followup'`)
      .all() as Array<{ resource_id: string }>;
    expect(created.some((r) => r.resource_id === items[0].id)).toBe(true);
  });

  it('فاز ۳ — دوباره‌سازی: تکرار همان گزارش/تغییر متن با follow_up پیگیری جدید نمی‌سازد؛ خروج از follow_up پیگیری را تغییر نمی‌دهد؛ ورود دوباره پیگیری دوم می‌سازد', async () => {
    const appt = await createAppt(mgr, ALI_ID);
    const count = async () => {
      const list = await sec.get(`/api/followups?entity_type=appointment&entity_id=${appt.id}`);
      return (list.body as { data: unknown[] }).data.length;
    };

    await ali.put(URL(appt.id), { session_note: 'گزارش اول', next_action: 'follow_up' });
    expect(await count()).toBe(1);

    await ali.put(URL(appt.id), { session_note: 'گزارش اول', next_action: 'follow_up' });
    expect(await count()).toBe(1);

    await ali.put(URL(appt.id), { session_note: 'گزارش اول — ادامه', next_action: 'follow_up' });
    expect(await count()).toBe(1);

    await ali.put(URL(appt.id), { session_note: 'گزارش اول — ادامه', next_action: 'none' });
    expect(await count()).toBe(1);

    await ali.put(URL(appt.id), { session_note: 'گزارش دوم', next_action: 'follow_up' });
    expect(await count()).toBe(2);
  });
});

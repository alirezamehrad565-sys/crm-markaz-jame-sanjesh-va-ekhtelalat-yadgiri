import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestApp,
  Api,
  asRole,
  createStudent,
  apptBody,
  quarterHourFromNow,
  WEBHOOK_SECRET,
  ALI_ID,
  STUDENT1_ID,
  MARYAM_ID,
  STUDENT2_ID
} from '../../test/harness';

type Update = Record<string, unknown>;

interface BotResponse {
  ok: boolean;
  handled: boolean;
  sent: boolean | null;
  reply: string | null;
  buttons: { text: string; callbackData: string }[][] | null;
}

async function bot(A: ReturnType<typeof createTestApp>, raw: Update): Promise<BotResponse> {
  const res = await A.app.request(
    `/webhook/bale/${WEBHOOK_SECRET}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(raw)
    },
    A.env as never
  );
  return (await res.json()) as BotResponse;
}

const tx = (t: string, chatId: number): Update => ({ update_id: 1, message: { chat: { id: chatId }, text: t } });

const CHAT_MGR = 7401;
const CHAT_ALI = 7402;
const CHAT_PARENT = 7403;
const CHAT_NONE = 7499;

const MANAGER_NID = '3672818690';
const ALI_NID = '3149977797';

describe('لیست انتظار ↔ اعلان لغو نوبت (m184: منوی بات حذف شد)', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');

    expect((await bot(A, tx(MANAGER_NID, CHAT_MGR))).reply).toContain('اتصال انجام شد');
    expect((await bot(A, tx(ALI_NID, CHAT_ALI))).reply).toContain('اتصال انجام شد');

    const s = await createStudent(manager, { guardian_phone: '09125550099' });
    expect((await bot(A, tx(s.nationalId, CHAT_PARENT))).reply).toContain('اتصال انجام شد');

    // متقاضیان باز لیست انتظار — شرط اعلان «نوبت خالی شد» (در m184 فهرست‌برداری از بات حذف شد ولی اعلان باقی است)
    const w1 = await manager.post('/api/waitlist', {
      first_name: 'حسین', last_name: 'رضایی‌مبارکه', phone: '09123330011',
      source: 'self', priority: 'normal', service_type: 'گفتاردرمانی'
    });
    expect(w1.status).toBe(201);
    const w2 = await manager.post('/api/waitlist', {
      first_name: 'زهرا', last_name: 'حسینی‌فر', phone: '09123330012',
      source: 'school', priority: 'urgent', service_type: 'کاردرمانی'
    });
    expect(w2.status).toBe(201);
  });

  it('لغو نوبت → «نوبت خالی شد» فقط به chat دفتر (مدیر/منشی متصل)؛ همکار نمی‌گیرد', async () => {
    const a1 = await manager.post('/api/appointments', apptBody(ALI_ID, quarterHourFromNow(30), 45, [STUDENT1_ID]));
    expect(a1.status).toBe(201);
    const appt = (a1.body as { data: { id: string; version: number } }).data;

    const cancel = await manager.post(`/api/appointments/${appt.id}/cancel`, { version: appt.version });
    expect(cancel.status).toBe(200);

    const list = await manager.get(`/api/notifications?appointment_id=${appt.id}&limit=50`);
    expect(list.status).toBe(200);
    const rows = (list.body as { data: { recipient: string | null; template: string; appointmentId: string | null }[] }).data
      .filter((r) => r.template === 'waitlist_slot_freed');
    const forAppt = rows.filter((r) => r.appointmentId === appt.id);
    expect(forAppt.length).toBeGreaterThanOrEqual(1);
    const recipients = forAppt.map((r) => r.recipient);
    expect(recipients).toContain(String(CHAT_MGR));
    expect(recipients).not.toContain(String(CHAT_ALI));
    expect(recipients).not.toContain(String(CHAT_PARENT));
  });

  it('dedup: لغوی دوبارهٔ همان نوبت (restore+cancel) پیام تکراری نمی‌سازد', async () => {
    const a1 = await manager.post('/api/appointments', apptBody(MARYAM_ID, quarterHourFromNow(60), 45, [STUDENT2_ID]));
    expect(a1.status).toBe(201);
    const appt = (a1.body as { data: { id: string; version: number } }).data;

    const c1 = await manager.post(`/api/appointments/${appt.id}/cancel`, { version: appt.version });
    expect(c1.status).toBe(200);

    const list1 = await manager.get(`/api/notifications?appointment_id=${appt.id}&limit=50`);
    const count1 = (list1.body as { data: { template: string }[] }).data.filter((r) => r.template === 'waitlist_slot_freed').length;
    expect(count1).toBeGreaterThanOrEqual(1);

    const restore = await manager.post(`/api/appointments/${appt.id}/restore`, { version: appt.version + 1 });
    expect(restore.status).toBe(200);
    const c2 = await manager.post(`/api/appointments/${appt.id}/cancel`, { version: appt.version + 2 });
    expect(c2.status).toBe(200);

    const list2 = await manager.get(`/api/notifications?appointment_id=${appt.id}&limit=50`);
    const rows2 = (list2.body as { data: { appointmentId: string | null; recipient: string | null; template: string }[] }).data
      .filter((r) => r.template === 'waitlist_slot_freed');
    const forAppt2 = rows2.filter((r) => r.appointmentId === appt.id);
    expect(forAppt2.filter((r) => r.recipient === String(CHAT_MGR)).length).toBe(1);
  });

  it('پرچم خاموش: notify_waitlist=false → لغو بعدی اعلان لیست انتظار نمی‌سازد', async () => {
    const put = await manager.put('/api/settings', { notify_waitlist: false });
    expect(put.status).toBe(200);
    const settings = (put.body as { data: { notifyWaitlist: boolean } }).data;
    expect(settings.notifyWaitlist).toBe(false);

    const a1 = await manager.post('/api/appointments', apptBody(ALI_ID, quarterHourFromNow(120), 45, [STUDENT1_ID]));
    expect(a1.status).toBe(201);
    const appt = (a1.body as { data: { id: string; version: number } }).data;
    const cancel = await manager.post(`/api/appointments/${appt.id}/cancel`, { version: appt.version });
    expect(cancel.status).toBe(200);

    const list2 = await manager.get(`/api/notifications?appointment_id=${appt.id}&limit=50`);
    const rows2 = (list2.body as { data: { appointmentId: string | null; template: string }[] }).data;
    expect(rows2.filter((r) => r.template === 'waitlist_slot_freed').length).toBe(0);

    const restore = await manager.put('/api/settings', { notify_waitlist: true });
    expect((restore.body as { data: { notifyWaitlist: boolean } }).data.notifyWaitlist).toBe(true);
  });

  it('لیست انتظار خالی → لغو نوبت اعلان «خالی شد» نمی‌سازد', async () => {
    const list = await manager.get('/api/waitlist?status=waiting&limit=200');
    const rows = (list.body as { data: { id: string; status: string }[] }).data;
    for (const r of rows) {
      if (r.status === 'waiting' || r.status === 'called') {
        await manager.post(`/api/waitlist/${r.id}/cancel`);
      }
    }
    const badge = await manager.get('/api/waitlist/badge');
    const openCount = (badge.body as { data: { waiting: number } }).data.waiting;
    expect(openCount).toBe(0);

    const a1 = await manager.post('/api/appointments', apptBody(ALI_ID, quarterHourFromNow(180), 45, [STUDENT1_ID]));
    const appt = (a1.body as { data: { id: string; version: number } }).data;
    await manager.post(`/api/appointments/${appt.id}/cancel`, { version: appt.version });

    const list2 = await manager.get(`/api/notifications?appointment_id=${appt.id}&limit=50`);
    const rows2 = (list2.body as { data: { appointmentId: string | null; template: string }[] }).data;
    expect(rows2.filter((r) => r.template === 'waitlist_slot_freed').length).toBe(0);
  });
});

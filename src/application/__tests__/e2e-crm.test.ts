import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, WEBHOOK_SECRET, asRole, createStudent, loginToken, Api, apptBody, quarterHourFromNow, makeNationalId } from '../../test/harness';
import type { TestApp } from '../../test/harness';
import { computeBatchSendAt, tehranTodayBatchInstant } from '../notify/batch';

type Update = Record<string, unknown>;
type A = ReturnType<typeof createTestApp>;

interface BotResponse {
  ok: boolean;
  handled: boolean;
  sent: boolean | null;
  reply: string | null;
  buttons: { text: string; callbackData: string }[][] | null;
  keyboard: string[][] | null;
}

async function bot(A: A, raw: Update): Promise<BotResponse> {
  const res = await A.app.request(
    `/webhook/bale/${WEBHOOK_SECRET}`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(raw) },
    A.env as never
  );
  return (await res.json()) as BotResponse;
}

const tx = (t: string, chatId: number, updateId = 1): Update => ({
  update_id: updateId,
  message: { chat: { id: chatId }, text: t }
});

const CHAT_FAMILY = 7701;
const CHAT_HIJACKER = 7702;
const CHAT_TEACHER = 7703;
const CHAT_STAFF = 7704;
const CHAT_SUPERVISOR = 7705;
const CHAT_NONE = 7799;

const ALI_NID = '3149977797'; // درمانگر seed (علی)
const MANAGER_NID = '3672818690';

describe('computeBatchSendAt (خالص)', () => {
  const BATCH = 18;

  it('ساعت ۱۰ صبح + نوبت ۳ روز بعد → پیش‌نویس امروز ۱۸:۰۰ تهران', () => {
    const nowIso = '2030-01-07T06:30:00.000Z';
    const sendAt = computeBatchSendAt({
      nowIso,
      appointmentStartIso: '2030-01-10T08:00:00.000Z',
      batchHour: BATCH
    });
    expect(sendAt).not.toBeNull();
    const expected = tehranTodayBatchInstant(Date.parse(nowIso), BATCH);
    expect(sendAt).toBe(new Date(expected).toISOString());
    expect(sendAt).toBe('2030-01-07T14:30:00.000Z');
  });

  it('نوبت امروز ۲۰:۰۰ (۲ ساعت بعد از ساعت ارسال) → فوری', () => {
    const sendAt = computeBatchSendAt({
      nowIso: '2030-01-07T06:30:00.000Z',
      appointmentStartIso: '2030-01-07T16:30:00.000Z', // 20:00 تهران
      batchHour: BATCH
    });
    expect(sendAt).toBeNull();
  });

  it('ساعت ارسال گذشته (الان ۱۹ تهران) → فوری', () => {
    const sendAt = computeBatchSendAt({
      nowIso: '2030-01-07T15:30:00.000Z', // 19:00 تهران
      appointmentStartIso: '2030-01-10T08:00:00.000Z',
      batchHour: BATCH
    });
    expect(sendAt).toBeNull();
  });

  it('نوبت فردا صبح زود (کمتر از ۱۲ ساعت بعد از ساعت ارسال) → فوری', () => {
    const sendAt = computeBatchSendAt({
      nowIso: '2030-01-07T06:30:00.000Z',
      appointmentStartIso: '2030-01-08T01:00:00.000Z', // فردا 04:30 تهران — فقط ۱۰.۵ ساعت بعد از ۱۸:۰۰
      batchHour: BATCH
    });
    expect(sendAt).toBeNull();
  });
});

describe('بات نقش‌محور CRM + قفل اتصال + ناظر اداره', () => {
  let A: A;
  let manager: Api;
  let studentNid: string;
  let guardianPhone: string;

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');

    const s = await createStudent(manager, { guardian_phone: '09127770011' });
    studentNid = s.nationalId;
    guardianPhone = '09127770011';
  });

  it('قفل اتصال دوم: والد اول وصل می‌شود؛ تلاش دوم با همان شماره رد و audit می‌شود', async () => {
    const ok1 = await bot(A, tx(guardianPhone, CHAT_FAMILY, 101));
    expect(ok1.reply).toContain('اتصال');

    const hijack = await bot(A, tx(guardianPhone, CHAT_HIJACKER, 102));
    expect(hijack.reply).toContain('متصل است');

    const sid = findStudentId(A);
    const prefs = await manager.get(`/api/notifications/prefs/${sid}`);
    const chatId = ((prefs.body as { data: { chatId: string | null } }).data).chatId;
    expect(chatId).toBe(String(CHAT_FAMILY));

    const denied = A.sql.prepare(
      `SELECT COUNT(*) AS n FROM audit_log WHERE action = 'notification.bot.family_link_denied'`
    ).get() as { n: number };
    expect(denied.n).toBeGreaterThanOrEqual(1);
  });

  it('اتصال دوم با کد ملی دانش‌آموز هم رد می‌شود', async () => {
    const hijack2 = await bot(A, tx(studentNid, CHAT_HIJACKER, 103));
    expect(hijack2.reply).toContain('متصل است');
  });

  it('بات مهمان: «شماره تماس» بدون تنظیم → پیام ثبت‌نشده؛ بعد از PUT تنظیمات → شماره می‌آید', async () => {
    const before = await bot(A, tx('شماره تماس', CHAT_NONE, 201));
    expect(before.reply).toContain('ثبت نشده');

    const put = await manager.put('/api/settings', { clinic_phone: '07154562000' });
    expect(put.status).toBe(200);

    const after = await bot(A, tx('شماره تماس', CHAT_NONE, 202));
    expect(after.reply).toContain('07154562000');
  });

  it('بات مهمان: «فایل‌های آموزشی» → راهنمای دانلود (بدون PUBLIC_BASE_URL)', async () => {
    const res = await bot(A, tx('فایل‌های آموزشی', CHAT_NONE, 203));
    expect(res.reply).toContain('آموزشی');
  });

  it('ثبت نوبت آینده → پیش‌نویس در صندوق؛ رهاسازی فوری از API → ارسال', async () => {
    const s = await createStudent(manager, { guardian_phone: '09127770033' });
    await manager.put(`/api/notifications/prefs/${s.id}`, { channel: 'internal', chat_id: 'internal-chat-' });

    const startIso = quarterHourFromNow(5 * 24 * 60);
    const created = await manager.post('/api/appointments', apptBody('00000000-0000-0000-0000-000000000002', startIso, 30, [s.id]));
    expect(created.status).toBe(201);
    const apptId = ((created.body as { data: { id: string } }).data).id;

    const outbox = await manager.get('/api/notifications/outbox');
    expect(outbox.status).toBe(200);
    const ob = (outbox.body as { data: { drafts: Array<{ id: string; template: string; sendAt: string | null; appointmentId: string | null }> } }).data;
    const expectDraft =
      computeBatchSendAt({ nowIso: new Date().toISOString(), appointmentStartIso: startIso, batchHour: 18 }) !== null;
    const draft = ob.drafts.find((d) => d.template === 'appointment_created' && d.appointmentId === apptId);
    if (expectDraft) {
      expect(draft).toBeTruthy();
      expect(draft?.sendAt).toBeTruthy();
    } else {
      expect(draft).toBeUndefined(); // فوری ارسال شد — پیش‌نویسی نیست
    }

    const therapist = await asRole(A, 'therapist');
    const tRes = await therapist.get('/api/notifications/outbox');
    expect(tRes.status).toBe(403);

    if (draft) {
      const released = await manager.post(`/api/notifications/${draft.id}/release`);
      expect(released.status).toBe(200);
      expect(((released.body as { data: { status: string } }).data).status).toBe('sent');
    }

    const retry = await manager.post('/api/notifications/failed/retry');
    expect(retry.status).toBe(200);
  });

  it('ناظر: ساخت حساب فقط با نام کاربری و رمز (بدون کد ملی/تلفن) → ۲۰۱', async () => {
    // حساب ناظر فقط نام کاربری + رمز؛ بدون checksum کد ملی
    const create = await manager.post('/api/staff', {
      full_name: 'ناظر سبک ',
      username: 'sup-lite220',
      role: 'supervisor'
    });
    expect(create.status).toBe(201);
    const member = ((create.body as { data: { role: string; nationalId: string | null; phone: string | null } }).data);
    expect(member.role).toBe('supervisor');
    expect(member.nationalId).toBeNull();
    expect(member.phone).toBeNull();

    // نقش‌های دیگر همچنان کد ملی/تلفن می‌خواهند
    const noNid = await manager.post('/api/staff', {
      full_name: 'درمانگر بدون کد ملی',
      phone: '09127770055',
      username: 'th-no-nid-220',
      role: 'therapist'
    });
    expect(noNid.status).toBe(400);
    const details = ((noNid.body as { details?: Array<{ path: string }> }).details ?? []).map((d) => d.path);
    expect(details).toContain('national_id');
  });

  it('ناظر: همهٔ GETها باز، هر متد نوشتنی ۴۰۳ + audit', async () => {
    const create = await manager.post('/api/staff', {
      full_name: 'ناظر اداره ',
      phone: '09127770044',
      national_id: makeNationalId(),
      username: 'supervisor62',
      role: 'supervisor'
    });
    expect(create.status).toBe(201);
    const member = ((create.body as { data: { role: string } }).data);
    expect(member.role).toBe('supervisor'); // نقش مؤثر از COALESCE(role_ext, role)

    const token = await loginToken(A, 'supervisor62');
    const sup = new Api(A, token);

    const dash = await sup.get('/api/dashboard/summary?from=2026-10-01&to=2026-10-11');
    expect(dash.status).toBe(200);

    // همهٔ GETها باز شدند (گیت فقط متد نوشتنی را رد می‌کند)
    const students = await sup.get('/api/students');
    expect(students.status).toBe(200);

    // گاردِ نقشِ سرِ خودِ روت بالاتر از گیت ناظر می‌ماند (تنظیمات: مدیر/منشی)
    const settings = await sup.get('/api/settings');
    expect(settings.status).toBe(403);

    const write = await sup.post('/api/appointments', {});
    expect(write.status).toBe(403);

    const denied = A.sql.prepare(
      `SELECT COUNT(*) AS n FROM audit_log WHERE action = 'supervisor.denied'`
    ).get() as { n: number };
    expect(denied.n).toBeGreaterThanOrEqual(1);
  });

});

function findStudentId(testApp: A): string {
  const rows = testApp.sql.prepare(
    `SELECT id FROM students WHERE guardian_phone = '09127770011' AND active = 1 LIMIT 1`
  ).all() as Array<{ id: string }>;
  return rows[0].id;
}

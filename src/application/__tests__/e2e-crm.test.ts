/**
 * تست‌های e2e — -crm
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// e2e--crm.test.ts — بات نقش‌محور CRM + موتور «ساعت ارسال» + قفل اتصال خانواده + ناظر اداره
// ۱) computeBatchSendAt (خالص): آینده→پیش‌نویس، نزدیک/گذشته→فوری
// ۲) قفل اتصال دوم خانواده — تصاحبهٔ اعلان با شمارهٔ ولیّ رد می‌شود + audit
// ۳) صندوق اعلان‌ها (Outbox): RBAC + رهاسازی فوری + تلاش دوبارهٔ ناموفق‌ها
// ۴) بات: «شماره تماس» / «فایل‌های آموزشی» / «دانش‌آموزان من» / «اعلان‌های در صف» / «گزارش KPI»
// ۵) ناظر اداره: داشبورد تجمیعی بله، بقیه ۴۰۳ + audit supervisor.*
// ۶) تنظیمات: clinic_phone و notify_batch_hour
// اپ واقعی Hono + migrations واقعی + webhook بله با secret تست

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

// chatها: 7701 والد اول | 7702 تلاش تصاحبه | 7703 معلم | 7704 همکار | 7705 ناظر | 7799 مهمان
const CHAT_FAMILY = 7701;
const CHAT_HIJACKER = 7702;
const CHAT_TEACHER = 7703;
const CHAT_STAFF = 7704;
const CHAT_SUPERVISOR = 7705;
const CHAT_NONE = 7799;

const ALI_NID = '3149977797'; // درمانگر seed (علی)
const MANAGER_NID = '3672818690';

// ───────────── ۱) موتور «ساعت ارسال» — خالص ─────────────

describe('computeBatchSendAt (خالص)', () => {
  const BATCH = 18;

  it('ساعت ۱۰ صبح + نوبت ۳ روز بعد → پیش‌نویس امروز ۱۸:۰۰ تهران', () => {
    // ۱۰:۰۰ تهران = 06:30Z — روز ثابت برای قطعیت: 2030-01-07 (شنبه)
    const nowIso = '2030-01-07T06:30:00.000Z';
    const sendAt = computeBatchSendAt({
      nowIso,
      appointmentStartIso: '2030-01-10T08:00:00.000Z',
      batchHour: BATCH
    });
    expect(sendAt).not.toBeNull();
    const expected = tehranTodayBatchInstant(Date.parse(nowIso), BATCH);
    expect(sendAt).toBe(new Date(expected).toISOString());
    // ۱۸:۰۰ تهران = 14:30Z
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

// ───────────── بقیهٔ — یکپارچه ─────────────

describe('بات نقش‌محور CRM + قفل اتصال + ناظر اداره', () => {
  let A: A;
  let manager: Api;
  let studentNid: string;
  let guardianPhone: string;

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');

    // دانش‌آموز با کد ملی/تلفن ولیّ معتبر برای سناریوی اتصال خانواده
    const s = await createStudent(manager, { guardian_phone: '09127770011' });
    studentNid = s.nationalId;
    guardianPhone = '09127770011';
  });

  it('قفل اتصال دوم: والد اول وصل می‌شود؛ تلاش دوم با همان شماره رد و audit می‌شود', async () => {
    const ok1 = await bot(A, tx(guardianPhone, CHAT_FAMILY, 101));
    expect(ok1.reply).toContain('اتصال');

    const hijack = await bot(A, tx(guardianPhone, CHAT_HIJACKER, 102));
    expect(hijack.reply).toContain('متصل است');

    // chat_id در prefs بازنویسی نشده — همچنان والد اول
    const sid = findStudentId(A);
    const prefs = await manager.get(`/api/notifications/prefs/${sid}`);
    const chatId = ((prefs.body as { data: { chatId: string | null } }).data).chatId;
    expect(chatId).toBe(String(CHAT_FAMILY));

    // audit: یک family_link_denied
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

  it('معلم متصل: «دانش‌آموزان من» → فهرست کلاس با وضعیت پرونده', async () => {
    const school = ((await manager.post('/api/schools', { name: 'دبستان آزمون m62', kind: 'school', gender_type: 'male' })).body as { data: { id: string } }).data;
    const cls = ((await manager.post('/api/classes', { school_id: school.id, name: 'پنجم الف', teacher_name: 'معلم آزمون m62' })).body as { data: { id: string } }).data;
    await createStudent(manager, { school_id: school.id, class_id: cls.id, guardian_phone: '09127770022' });

    const code = (((await manager.post('/api/notifications/class-links', { class_id: cls.id })).body as { data: { code: string } }).data).code;
    const linked = await bot(A, tx(`/link ${code}`, CHAT_TEACHER, 301));
    expect(linked.reply).toContain('اتصال');

    const res = await bot(A, tx('دانش‌آموزان من', CHAT_TEACHER, 302));
    expect(res.reply).toContain('دانش‌آموزان کلاس پنجم الف');
    expect(res.reply).toContain('•');
  });

  it('والد متصل: «دانش‌آموزان من» → رد (فقط معلم کلاس)؛ مهمان → راهنما', async () => {
    const parent = await bot(A, tx('دانش‌آموزان من', CHAT_FAMILY, 303));
    expect(parent.reply).toContain('فقط برای معلمان');

    const guest = await bot(A, tx('دانش‌آموزان من', CHAT_NONE, 304));
    expect(guest.reply).toContain('راهنما');
  });

  it('والد متصل: «اعلان‌های در صف» → رد؛ همکار مرکز → شمارش صف', async () => {
    const parent = await bot(A, tx('اعلان‌های در صف', CHAT_FAMILY, 403));
    expect(parent.reply).toContain('فقط برای همکاران');

    // اتصال درمانگر (علی) روی chat همکار
    const staffRes = await bot(A, tx(ALI_NID, CHAT_STAFF, 401));
    expect(staffRes.reply).toContain('اتصال');

    const outbox = await bot(A, tx('اعلان‌های در صف', CHAT_STAFF, 402));
    expect(outbox.reply).toContain('صف اعلان‌های مرکز');
    expect(outbox.reply).toContain('پیش‌نویس');
  });

  it('ثبت نوبت آینده → پیش‌نویس در صندوق؛ رهاسازی فوری از API → ارسال', async () => {
    const s = await createStudent(manager, { guardian_phone: '09127770033' });
    await manager.put(`/api/notifications/prefs/${s.id}`, { channel: 'internal', chat_id: 'internal-chat-m62' });

    const startIso = quarterHourFromNow(5 * 24 * 60);
    const created = await manager.post('/api/appointments', apptBody('00000000-0000-0000-0000-000000000002', startIso, 30, [s.id]));
    expect(created.status).toBe(201);
    const apptId = ((created.body as { data: { id: string } }).data).id;

    // در صندوق، پیش‌نویس با send_at آینده
    const outbox = await manager.get('/api/notifications/outbox');
    expect(outbox.status).toBe(200);
    const ob = (outbox.body as { data: { drafts: Array<{ id: string; template: string; sendAt: string | null; appointmentId: string | null }> } }).data;
    // خنثی‌سازی بمب زمانی: اگر ساعت ارسال امروز (پیش‌فرض ۱۸ تهران) گذشته باشد،
    // اعلان ثبت نوبت عمداً «فوری» می‌رود و پیش‌نویس نمی‌ماند — پیش‌بینی با همان تابع pure
    const expectDraft =
      computeBatchSendAt({ nowIso: new Date().toISOString(), appointmentStartIso: startIso, batchHour: 18 }) !== null;
    const draft = ob.drafts.find((d) => d.template === 'appointment_created' && d.appointmentId === apptId);
    if (expectDraft) {
      expect(draft).toBeTruthy();
      expect(draft?.sendAt).toBeTruthy();
    } else {
      expect(draft).toBeUndefined(); // فوری ارسال شد — پیش‌نویسی نیست
    }

    // RBAC — درمانگر ۴۰۳
    const therapist = await asRole(A, 'therapist');
    const tRes = await therapist.get('/api/notifications/outbox');
    expect(tRes.status).toBe(403);

    // رهاسازی فوری → sent (فقط وقتی پیش‌نویس وجود دارد)
    if (draft) {
      const released = await manager.post(`/api/notifications/${draft.id}/release`);
      expect(released.status).toBe(200);
      expect(((released.body as { data: { status: string } }).data).status).toBe('sent');
    }

    // تلاش دوبارهٔ ناموفق‌ها — ۲۰۰ با عدد
    const retry = await manager.post('/api/notifications/failed/retry');
    expect(retry.status).toBe(200);
  });

  it('ناظر اداره: ساخت حساب با نقش ناظر → فقط داشبورد تجمیعی؛ بقیه ۴۰۳ + audit', async () => {
    const create = await manager.post('/api/staff', {
      full_name: 'ناظر اداره m62',
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

    const students = await sup.get('/api/students');
    expect(students.status).toBe(403);

    const settings = await sup.get('/api/settings');
    expect(settings.status).toBe(403);

    const write = await sup.post('/api/appointments', {});
    expect(write.status).toBe(403);

    const denied = A.sql.prepare(
      `SELECT COUNT(*) AS n FROM audit_log WHERE action = 'supervisor.denied'`
    ).get() as { n: number };
    expect(denied.n).toBeGreaterThanOrEqual(3);
  });

  it('بات ناظر: «گزارش KPI» → گزارش تجمیعی؛ درمانگر → رد؛ مدیر → گزارش می‌بیند', async () => {
    const supRes = await bot(A, tx(MANAGER_NID, CHAT_SUPERVISOR, 501));
    expect(supRes.reply).toContain('اتصال');

    const kpi = await bot(A, tx('گزارش KPI', CHAT_SUPERVISOR, 502));
    expect(kpi.reply).toContain('KPI');
    expect(kpi.reply).toContain('نوبت');

    // اتصال درمانگر روی chat جدید + رد KPI
    const ali2 = await bot(A, tx(ALI_NID, 7706, 503));
    expect(ali2.reply).toContain('اتصال');
    const denied = await bot(A, tx('گزارش KPI', 7706, 504));
    expect(denied.reply).toContain('فقط برای ناظر');
  });

  it('تنظیمات: notify_batch_hour ذخیره و خوانده می‌شود', async () => {
    const put = await manager.put('/api/settings', { notify_batch_hour: 20 });
    expect(put.status).toBe(200);
    const get = await manager.get('/api/settings');
    const data = (get.body as { data: { notifyBatchHour: number } }).data;
    expect(data.notifyBatchHour).toBe(20);
    // بازگرداندن پیش‌فرض برای بقیهٔ تست‌ها
    await manager.put('/api/settings', { notify_batch_hour: 18 });
  });
});

function findStudentId(testApp: A): string {
  const rows = testApp.sql.prepare(
    `SELECT id FROM students WHERE guardian_phone = '09127770011' AND active = 1 LIMIT 1`
  ).all() as Array<{ id: string }>;
  return rows[0].id;
}

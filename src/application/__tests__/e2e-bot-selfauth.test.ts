/**
 * تست‌های e2e — bot-selfauth
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// e2e-bot-selfauth.test.ts — ورود خودکار بات با کد ملی/شماره تلفن
// «نوبت‌های من» برای والد و همکار + لغو دومرحله‌ای نوبت توسط همکار + اعلان خودکار خانواده
// دادهٔ ماک: seed-dev + دانش‌آموزان ساخته‌شده از API

import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestApp,
  Api,
  asRole,
  createStudent,
  apptBody,
  quarterHourFromNow,
  makeNationalId,
  WEBHOOK_SECRET,
  ALI_ID,
  MARYAM_ID
} from '../../test/harness';

type Update = Record<string, unknown>;

interface BotResponse {
  ok: boolean;
  handled: boolean;
  sent: boolean | null;
  reply: string | null;
  buttons: { text: string; callbackData: string }[][] | null;
}

/** ارسال آپدیت خام بله به webhook */
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
const cb = (data: string, chatId: number): Update => ({
  update_id: 2,
  callback_query: { id: 9, data, message: { chat: { id: chatId } } }
});

// chatها: 7001 همکار (علی) | 7002 والد دو فرزند | 7003 بدون اتصال | 7004 والد تک (لغو) | 7005 والد تک (کد ملی)
const CHAT_STAFF = 7001;
const CHAT_PARENT2 = 7002;
const CHAT_NONE = 7003;
const CHAT_PARENT_A = 7004;
const CHAT_PARENT_B = 7005;

describe('ورود خودکار بات با کد ملی/شماره تلفن', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
  });

  it('همکار با کد ملی فارسی متصل می‌شود — staff_bot_links با status=linked', async () => {
    // علی رضایی: national_id = 3149977797 (seed)
    const res = await bot(A, tx('۳۱۴۹۹۷۷۷۹۷', CHAT_STAFF));
    expect(res.handled).toBe(true);
    expect(res.reply).toContain('اتصال انجام شد');
    expect(res.reply).toContain('علی رضایی');
    expect(res.reply).toContain('همکار');

    const rows = A.sql.prepare(`SELECT chat_id, status FROM staff_bot_links WHERE staff_id = ?`).all(ALI_ID) as Array<{ chat_id: string; status: string }>;
    expect(rows.some((r) => r.chat_id === '7001' && r.status === 'linked')).toBe(true);
  });

  it('اتصال تکراری idempotent است — ردیف اضافه ساخته نمی‌شود', async () => {
    await bot(A, tx('3149977797', CHAT_STAFF));
    const rows = A.sql.prepare(`SELECT id FROM staff_bot_links WHERE staff_id = ? AND chat_id = '7001'`).all(ALI_ID) as unknown[];
    expect(rows).toHaveLength(1);
  });

  it('شناسه ناموجود → پیام «پیدا نشد» + قالب غلط → پیام قالب', async () => {
    const nf = await bot(A, tx(makeNationalId(), CHAT_NONE));
    expect(nf.handled).toBe(true);
    expect(nf.reply).toContain('پیدا نشد');

    const inv = await bot(A, tx('02112345678', CHAT_NONE));
    expect(inv.reply).toContain('قالب');
  });

  it('«نوبت‌های من» بدون اتصال → راهنما', async () => {
    const res = await bot(A, tx('نوبت‌های من', CHAT_NONE));
    expect(res.reply).toContain('راهنمای بات');
    expect(res.buttons).toBeNull();
  });

  it('همکار «نوبت‌های من» می‌گیرد — نوبت آینده با دکمهٔ لغو (ask:<id>)', async () => {
    const s = await createStudent(manager);
    const created = await manager.post('/api/appointments', apptBody(ALI_ID, quarterHourFromNow(120), 45, [s.id]));
    expect(created.status).toBe(201);
    const apptId = (created.body as { data: { id: string } }).data.id;

    const res = await bot(A, tx('نوبت‌های من', CHAT_STAFF));
    expect(res.reply).toContain('نوبت‌های پیش‌روی شما');
    expect(res.buttons).not.toBeNull();
    const flat = res.buttons!.flat();
    expect(flat.some((b) => b.callbackData === `ask:${apptId}` && b.text.includes('لغو'))).toBe(true);

    // /today هم مثل قبل برای chat متصل کار می‌کند (رگرسیون)
    const today = await bot(A, tx('/today', CHAT_STAFF));
    expect(today.reply).toContain('برنامه امروز');
  });

  it('لغو دومرحله‌ای: ask → پرسش تأیید با دکمه cancel:<id>', async () => {
    const s = await createStudent(manager);
    const created = await manager.post('/api/appointments', apptBody(ALI_ID, quarterHourFromNow(240), 30, [s.id]));
    const apptId = (created.body as { data: { id: string } }).data.id;

    const ask = await bot(A, cb(`ask:${apptId}`, CHAT_STAFF));
    expect(ask.reply).toContain('لغو این نوبت');
    expect(ask.reply).toContain('اطلاع داده می‌شود');
    expect(ask.buttons!.flat().some((b) => b.callbackData === `cancel:${apptId}` && b.text.includes('لغو'))).toBe(true);
  });

  it('لغو دومرحله‌ای: do → نوبت لغو می‌شود و اعلان به همکار و خانواده می‌رود', async () => {
    const s = await createStudent(manager);
    await manager.put(`/api/notifications/prefs/${s.id}`, { channel: 'internal', chat_id: 'parent-internal-1' });
    const created = await manager.post('/api/appointments', apptBody(ALI_ID, quarterHourFromNow(300), 30, [s.id]));
    const apptId = (created.body as { data: { id: string } }).data.id;

    const res = await bot(A, cb(`cancel:${apptId}`, CHAT_STAFF));
    expect(res.reply).toContain('نوبت لغو شد');
    expect(res.reply).toContain('به خانواده اطلاع داده شد');

    const row = A.sql.prepare(`SELECT status, version FROM appointments WHERE id = ?`).get(apptId) as { status: string; version: number };
    expect(row.status).toBe('cancelled');
    expect(row.version).toBe(2);

    const notifs = await manager.get(`/api/notifications?appointment_id=${apptId}`);
    const items = (notifs.body as { data: Array<{ template: string; recipient: string | null }> }).data;
    expect(items.some((n) => n.template === 'staff_appointment_cancelled' && n.recipient === '7001')).toBe(true);
    expect(items.some((n) => n.template === 'appointment_cancelled' && n.recipient === 'parent-internal-1')).toBe(true);
  });

  it('لغو دوباره همان نوبت → پیام «تعلق ندارد/موجود نیست»', async () => {
    const s = await createStudent(manager);
    const created = await manager.post('/api/appointments', apptBody(ALI_ID, quarterHourFromNow(360), 30, [s.id]));
    const apptId = (created.body as { data: { id: string } }).data.id;

    const first = await bot(A, cb(`cancel:${apptId}`, CHAT_STAFF));
    expect(first.reply).toContain('نوبت لغو شد');
    const second = await bot(A, cb(`cancel:${apptId}`, CHAT_STAFF));
    expect(second.reply).toContain('تعلق ندارد');
  });

  it('chat والد نمی‌تواند نوبت همکار را لغو کند', async () => {
    const kid = await createStudent(manager);
    const linked = await bot(A, tx(kid.nationalId, CHAT_PARENT_A));
    expect(linked.reply).toContain('اتصال انجام شد');

    const s = await createStudent(manager);
    const created = await manager.post('/api/appointments', apptBody(ALI_ID, quarterHourFromNow(480), 30, [s.id]));
    const apptId = (created.body as { data: { id: string } }).data.id;

    const res = await bot(A, cb(`cancel:${apptId}`, CHAT_PARENT_A));
    expect(res.reply).toContain('تعلق ندارد');
  });

  it('والد با شماره تلفن مشترک — دو فرزند با هم متصل می‌شوند (bot_links + prefs)', async () => {
    const kid1 = await createStudent(manager, { first_name: 'پویا', last_name: 'امیدی', guardian_phone: '09351112233' });
    const kid2 = await createStudent(manager, { first_name: 'پریا', last_name: 'امیدی', guardian_phone: '09351112233' });

    const res = await bot(A, tx('۰۹۳۵۱۱۱۲۲۳۳', CHAT_PARENT2));
    expect(res.reply).toContain('اتصال انجام شد');
    expect(res.reply).toContain('پویا امیدی');
    expect(res.reply).toContain('پریا امیدی');

    const links = A.sql.prepare(`SELECT student_id FROM bot_links WHERE chat_id = '7002' AND status = 'linked'`).all() as Array<{ student_id: string }>;
    const linked = links.map((l) => l.student_id);
    expect(linked).toContain(kid1.id);
    expect(linked).toContain(kid2.id);

    const prefs = A.sql.prepare(`SELECT student_id, chat_id, reminders_enabled FROM notification_prefs WHERE chat_id = '7002'`).all() as Array<{ student_id: string; chat_id: string; reminders_enabled: number }>;
    expect(prefs.filter((p) => p.reminders_enabled === 1).map((p) => p.student_id)).toEqual(expect.arrayContaining([kid1.id, kid2.id]));
  });

  it('والد «نوبت‌های من» — نوبت هر دو فرزند با نام متخصص و برچسب «فرزند:» و بدون دکمه', async () => {
    const kids = A.sql.prepare(`SELECT student_id FROM bot_links WHERE chat_id = '7002' AND status = 'linked'`).all() as Array<{ student_id: string }>;
    expect(kids).toHaveLength(2);

    const c1 = await manager.post('/api/appointments', apptBody(MARYAM_ID, quarterHourFromNow(600), 45, [kids[0].student_id]));
    const c2 = await manager.post('/api/appointments', apptBody(ALI_ID, quarterHourFromNow(700), 45, [kids[1].student_id]));
    expect(c1.status).toBe(201);
    expect(c2.status).toBe(201);

    const res = await bot(A, tx('نوبت‌های من', CHAT_PARENT2));
    expect(res.reply).toContain('نوبت‌های پیش‌روی شما');
    expect(res.reply).toContain('مریم احمدی');
    expect(res.reply).toContain('دکتر علی رضایی');
    expect(res.reply).toContain('فرزند:');
    expect(res.reply).toContain('دفتر مرکز');
    expect(res.buttons).toBeNull();
  });

  it('نوبت جدید برای فرزند متصل → اعلان created به همان chat والد (صف)', async () => {
    const kid = (A.sql.prepare(`SELECT student_id FROM bot_links WHERE chat_id = '7002' AND status = 'linked' LIMIT 1`).get() as { student_id: string }).student_id;
    const created = await manager.post('/api/appointments', apptBody(ALI_ID, quarterHourFromNow(800), 30, [kid]));
    const apptId = (created.body as { data: { id: string } }).data.id;

    const notifs = await manager.get(`/api/notifications?appointment_id=${apptId}`);
    const items = (notifs.body as { data: Array<{ template: string; recipient: string | null }> }).data;
    expect(items.some((n) => n.template === 'appointment_created' && n.recipient === '7002')).toBe(true);
  });

  it('اتصال والد با کد ملی دانش‌آموز هم کار می‌کند (تک پرونده)', async () => {
    const kid = await createStudent(manager, { first_name: 'آرش', last_name: 'صادقی', guardian_phone: '09354445566' });
    const res = await bot(A, tx(kid.nationalId, CHAT_PARENT_B));
    expect(res.reply).toContain('اتصال انجام شد');
    expect(res.reply).toContain('آرش صادقی');
  });
});

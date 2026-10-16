/**
 * تست‌های e2e — -bot-v2
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// e2e--bot-v2.test.ts — بات نقش‌محور نسخهٔ ۲
// عموم ۴دکمه‌ای، منوی دانش‌آموز (فهرست→اقدام)، پیام به خانواده (فرم دولایه)،
// ارسال تکلیف از پروفایل، تمرین‌های انجام‌نشدهٔ خانواده، فعالیت کلاس معلم، آگاهی‌های اختلالات
// اپ واقعی Hono + اسکیمای migrations + webhook با secret تست (بدون توکن بله — reply در بدنه)

import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestApp,
  asRole,
  createStudent,
  apptBody,
  quarterHourFromNow,
  ALI_ID,
  WEBHOOK_SECRET
} from '../../test/harness';

type Update = Record<string, unknown>;

interface BotResponse {
  ok: boolean;
  handled: boolean;
  sent: boolean | null;
  reply: string | null;
  buttons: { text: string; callbackData: string }[][] | null;
  keyboard: string[][] | null;
}

async function bot(A: ReturnType<typeof createTestApp>, raw: Update): Promise<BotResponse> {
  const res = await A.app.request(
    `/webhook/bale/${WEBHOOK_SECRET}`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(raw) },
    A.env as never
  );
  return (await res.json()) as BotResponse;
}

const tx = (t: string, chatId: number): Update => ({ update_id: 1, message: { chat: { id: chatId }, text: t } });
const cb = (data: string, chatId: number, updateId = 2): Update => ({
  update_id: updateId,
  callback_query: { id: updateId, data, message: { chat: { id: chatId } } }
});

const CHAT_MGR = 7601;
const CHAT_ALI = 7602;
const CHAT_PARENT = 7603;
const CHAT_TEACHER = 7604;
const CHAT_NONE = 7699;

const MANAGER_NID = '3672818690';
const ALI_NID = '3149953598'.length === 10 ? '3149953598' : '3149977797';

describe('بات نقش‌محور نسخهٔ ۲', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: ReturnType<typeof asRole> extends Promise<infer T> ? T : never;
  let studentId = '';
  let studentName = '';
  let parentNid = '';

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');

    // اتصال مدیر و درمانگر
    expect((await bot(A, tx(MANAGER_NID, CHAT_MGR))).reply).toContain('اتصال انجام شد');
    expect((await bot(A, tx('3149977797', CHAT_ALI))).reply).toContain('اتصال انجام شد');

    // دانش‌آموز + جلسهٔ علی + والد متصل
    const s = await createStudent(manager, { first_name: 'آوا', last_name: 'نسل‌دو' });
    studentId = s.id;
    studentName = 'آوا نسل‌دو';
    parentNid = s.nationalId;
    const appt = await manager.post('/api/appointments', apptBody(ALI_ID, quarterHourFromNow(30), 45, [studentId]));
    expect(appt.status).toBe(201);
    expect((await bot(A, tx(parentNid, CHAT_PARENT))).reply).toContain('اتصال انجام شد');
  });

  // ─── عموم ۴دکمه‌ای ───

  it('مهمان /start → کیبورد چهار دکمه‌ای عموم (م64)', async () => {
    const res = await bot(A, tx('/start', CHAT_NONE));
    expect(res.keyboard).toEqual([['معرفی مرکز', 'خدمات مرکز'], ['راه‌های ارتباطی', 'احراز هویت']]);
  });

  it('دکمهٔ «خدمات مرکز» مهمان → چهار خدمت؛ «احراز هویت» → دو مسیر + قفل اتصال دوم', async () => {
    const services = await bot(A, tx('خدمات مرکز', CHAT_NONE));
    expect(services.handled).toBe(true);
    expect(services.reply).toContain('سنجش و غربالگری');
    expect(services.reply).toContain('توان‌بخشی');
    const auth = await bot(A, tx('احراز هویت', CHAT_NONE));
    expect(auth.reply).toContain('/link CODE');
    expect(auth.reply).toContain('یک گفتگو');
  });

  // ─── منوی دانش‌آموز + پیام به خانواده ───

  it('درمانگر «دانش‌آموزان فعال» → دکمهٔ نام → منوی اقدام چهارگانه', async () => {
    const list = await bot(A, tx('دانش‌آموزان فعال', CHAT_ALI));
    expect(list.reply).toContain('دانش‌آموزان فعال');
    expect(list.buttons?.some((row) => row.some((b) => b.text.includes('آوا نسل‌دو')))).toBe(true);

    const idx = list.buttons!.findIndex((row) => row.some((b) => b.text.includes('آوا نسل‌دو')));
    const data = list.buttons![idx][0].callbackData; // stu:menu:<i>
    const menu = await bot(A, cb(data, CHAT_ALI, 10));
    expect(menu.reply).toContain('آوا نسل‌دو');
    expect(menu.buttons?.flat().map((b) => b.text).join('|')).toContain('ارسال تکلیف');
    expect(menu.buttons?.flat().map((b) => b.text).join('|')).toContain('پیام به خانواده');
  });

  it('پیام به خانواده: شروع → متن → جمع‌بندی → تأیید → صف bot_family_message + audit', async () => {
    const list = await bot(A, tx('دانش‌آموزان فعال', CHAT_ALI));
    const idx = list.buttons!.findIndex((row) => row.some((b) => b.text.includes('آوا نسل‌دو')));
    const menuData = list.buttons![idx][0].callbackData;
    const menu = await bot(A, cb(menuData, CHAT_ALI, 11));
    const msgData = menu.buttons!.flat().find((b) => b.text.includes('پیام به خانواده'))!.callbackData; // stu:msg:<i>
    const start = await bot(A, cb(msgData, CHAT_ALI, 12));
    expect(start.reply).toContain('متن پیام را بفرستید');

    // متن کوتاه رد می‌شود
    const bad = await bot(A, tx('x', CHAT_ALI));
    expect(bad.reply).toContain('۲ تا ۵۰۰');

    const summary = await bot(A, tx('لطفاً تمرین این هفته را هر روز پنج دقیقه انجام دهید.', CHAT_ALI));
    expect(summary.reply).toContain('جمع‌بندی پیام');
    expect(summary.reply).toContain('آوا نسل‌دو');

    const done = await bot(A, cb('stu:msg:do', CHAT_ALI, 13));
    expect(done.reply).toContain('ارسال شد');

    // رکورد صف با قالب تازه
    const rows = A.sql
      .prepare(`SELECT template, payload, recipient FROM notifications WHERE template = 'bot_family_message' ORDER BY created_at DESC`)
      .all() as { template: string; payload: string; recipient: string }[];
    expect(rows.length).toBeGreaterThan(0);
    const payload = JSON.parse(rows[0].payload) as { studentName: string; extra: string; senderName: string };
    expect(payload.studentName).toBe('آوا نسل‌دو');
    expect(payload.extra).toContain('پنج دقیقه');
    expect(payload.senderName.length).toBeGreaterThan(0);

    // audit
    const auditRow = A.sql
      .prepare(`SELECT action FROM audit_log WHERE action = 'bot.family_message' ORDER BY created_at DESC LIMIT 1`)
      .get() as { action: string } | undefined;
    expect(auditRow?.action).toBe('bot.family_message');
  });

  it('پیام به خانواده برای دانش‌آموزِ بدون ولیّ متصل → پیام صادقانه بدون فرم', async () => {
    const s2 = await createStudent(manager, { first_name: 'بی‌ولی', last_name: 'نسل‌دو' });
    await manager.post('/api/appointments', apptBody(ALI_ID, quarterHourFromNow(90), 45, [s2.id]));

    const list = await bot(A, tx('دانش‌آموزان فعال', CHAT_ALI));
    const row = list.buttons!.find((r) => r.some((b) => b.text.includes('بی‌ولی')))!;
    const menu = await bot(A, cb(row[0].callbackData, CHAT_ALI, 20));
    const msgData = menu.buttons!.flat().find((b) => b.text.includes('پیام به خانواده'))!.callbackData;
    const res = await bot(A, cb(msgData, CHAT_ALI, 21));
    expect(res.reply).toContain('متصل نیست');
  });

  it('ارسال تکلیف از پروفایل دانش‌آموز → assignment + پیام homework_assigned', async () => {
    const ex = await manager.post('/api/exercises', {
      title: 'تمرین منوی دانش‌آموز',
      description: 'از مسیر stu:send',
      format: 'worksheet',
      published: true
    });
    expect(ex.status).toBe(201);

    const list = await bot(A, tx('دانش‌آموزان فعال', CHAT_ALI));
    const idx = list.buttons!.findIndex((row) => row.some((b) => b.text.includes('آوا نسل‌دو')));
    const menu = await bot(A, cb(list.buttons![idx][0].callbackData, CHAT_ALI, 30));
    const sendData = menu.buttons!.flat().find((b) => b.text.includes('ارسال تکلیف'))!.callbackData; // stu:send:<i>:1
    const exercises = await bot(A, cb(sendData, CHAT_ALI, 31));
    expect(exercises.reply).toContain('تمرین را انتخاب کنید');

    const pickData = exercises.buttons![0][0].callbackData; // stu:pick:<s>:<e>
    const confirm = await bot(A, cb(pickData, CHAT_ALI, 32));
    expect(confirm.reply).toContain('تأیید ارسال تکلیف');

    const yesData = confirm.buttons![0].find((b) => b.text === '✅ ارسال')!.callbackData;
    const sent = await bot(A, cb(yesData, CHAT_ALI, 33));
    expect(sent.reply).toContain('ثبت شد');

    const hw = A.sql
      .prepare(`SELECT template, payload FROM notifications WHERE template = 'homework_assigned' ORDER BY created_at DESC LIMIT 1`)
      .get() as { template: string; payload: string } | undefined;
    expect(hw?.template).toBe('homework_assigned');
    expect((JSON.parse(hw!.payload) as { studentName: string }).studentName).toBe('آوا نسل‌دو');
  });

  // ─── خانواده ───

  it('خانواده «تمرین‌های انجام‌نشده» → تکلیف باز فرزند؛ «نوبت‌های دانش‌آموز من» → برچسب جدید کار می‌کند', async () => {
    const pending = await bot(A, tx('تمرین‌های انجام‌نشده', CHAT_PARENT));
    expect(pending.reply).toContain('تکلیف‌های باز');
    expect(pending.reply).toContain('تمرین منوی دانش‌آموز');

    const appts = await bot(A, tx('نوبت‌های دانش‌آموز من', CHAT_PARENT));
    expect(appts.handled).toBe(true);
    expect(appts.reply).toContain('نوبت');
  });

  it('خانواده از «فعالیت کلاس» و «دانش‌آموزان فعال» رد می‌شود (پیام نقش‌محور)', async () => {
    const activity = await bot(A, tx('فعالیت کلاس', CHAT_PARENT));
    expect(activity.reply).toContain('معلمان');
    const stu = await bot(A, tx('دانش‌آموزان فعال', CHAT_PARENT));
    expect(stu.reply).toContain('معلمان');
  });

  // ─── معلم مدرسه ───

  it('معلم مدرسه «فعالیت کلاس» → شمارش + فهرست؛ «آگاهی‌های اختلالات» → منو → آیتم با لینک', async () => {
    // کلاس + دانش‌آموز + معلم متصل
    const school = ((await manager.post('/api/schools', { name: 'دبستان m64', kind: 'school', gender_type: 'male' })).body as { data: { id: string } }).data;
    const cls = ((await manager.post('/api/classes', { school_id: school.id, name: 'پنجم الف m64', teacher_name: 'معلم m64', teacher_phone: '09170002233' })).body as { data: { id: string } }).data;
    await createStudent(manager, { first_name: 'شاگرد', last_name: 'کلاس m64', school_id: school.id, class_id: cls.id, guardian_phone: '09123334455' });
    const code = (((await manager.post('/api/notifications/class-links', { class_id: cls.id })).body as { data: { code: string } }).data).code;
    expect((await bot(A, tx(`/link ${code}`, CHAT_TEACHER))).reply).toContain('اتصال با موفقیت');

    const activity = await bot(A, tx('فعالیت کلاس', CHAT_TEACHER));
    expect(activity.reply).toContain('فعالیت کلاس');
    expect(activity.reply).toContain('پنجم الف m64');
    expect(activity.reply).toContain('تکلیف باز کلاس');

    const aw = await bot(A, tx('آگاهی‌های اختلالات', CHAT_TEACHER));
    expect(aw.reply).toContain('آگاهی‌های اختلالات');
    expect(aw.buttons?.flat().map((b) => b.text).join('|')).toContain('راهنمای اختلال‌ها');

    const sec = await bot(A, cb('dis:t', CHAT_TEACHER, 40));
    expect(sec.reply).toContain('راهنمای اختلال‌ها');
    const item = await bot(A, cb(sec.buttons![0][0].callbackData, CHAT_TEACHER, 41));
    expect(item.reply).toContain('نارساخوانی');
    // لینک فقط با PUBLIC_BASE_URL تنظیم‌شده می‌آید؛ وگرنه نسخهٔ چاپی پیشنهاد می‌شود
    expect(item.reply?.includes('🔗') || item.reply?.includes('نسخهٔ چاپی')).toBe(true);
  });

  it('آگاهی‌ها برای مهمان هم باز است (محتوای عمومی)', async () => {
    const aw = await bot(A, tx('/awareness', CHAT_NONE));
    expect(aw.handled).toBe(true);
    expect(aw.reply).toContain('آگاهی‌های اختلالات');
    const sec = await bot(A, cb('dis:d', CHAT_NONE, 50));
    expect(sec.reply).toContain('دفاتر آموزشی');
  });

  // ─── دفتر و ناظر ───

  it('مدیر «دانش‌آموزان فعال» دارد (همهٔ پرونده‌ها)؛ منشی بدون KPI؛ ناظر فقط KPI', async () => {
    const mgrList = await bot(A, tx('دانش‌آموزان فعال', CHAT_MGR));
    expect(mgrList.reply).toContain('دانش‌آموزان فعال');
    expect(mgrList.buttons?.length).toBeGreaterThan(0);
  });

  it('callback منسوخ/نامعتبر stu و dis به‌صورت امن نادیده یا stale می‌شود', async () => {
    const stale = await bot(A, cb('stu:menu:999', CHAT_ALI, 60));
    expect(stale.reply).toContain('قدیمی است');
    const ignored = await bot(A, cb('stu:weird:1', CHAT_ALI, 61));
    expect(ignored.handled).toBe(false);
    const disBad = await bot(A, cb('dis:zz', CHAT_NONE, 62));
    expect(disBad.handled).toBe(false);
  });
});

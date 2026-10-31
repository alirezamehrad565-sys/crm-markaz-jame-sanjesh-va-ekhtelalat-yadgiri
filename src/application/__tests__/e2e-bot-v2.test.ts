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

    expect((await bot(A, tx(MANAGER_NID, CHAT_MGR))).reply).toContain('اتصال انجام شد');
    expect((await bot(A, tx('3149977797', CHAT_ALI))).reply).toContain('اتصال انجام شد');

    const s = await createStudent(manager, { first_name: 'آوا', last_name: 'نسل‌دو' });
    studentId = s.id;
    studentName = 'آوا نسل‌دو';
    parentNid = s.nationalId;
    const appt = await manager.post('/api/appointments', apptBody(ALI_ID, quarterHourFromNow(30), 45, [studentId]));
    expect(appt.status).toBe(201);
    expect((await bot(A, tx(parentNid, CHAT_PARENT))).reply).toContain('اتصال انجام شد');
  });

  it('مهمان /start → کیبورد عموم ( + فایل‌های آموزشی )', async () => {
    const res = await bot(A, tx('/start', CHAT_NONE));
    expect(res.keyboard).toEqual([['معرفی مرکز', 'خدمات مرکز'], ['راه‌های ارتباطی', 'احراز هویت'], ['فایل‌های آموزشی']]);
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

  it('خانواده «تمرین‌های انجام‌نشده» → تکلیف باز فرزند (ثبت از پنل — )؛ «نوبت‌های دانش‌آموز من» کار می‌کند', async () => {
    const ex = await manager.post('/api/exercises', {
      title: 'تمرین منوی دانش‌آموز',
      description: 'ثبت از پنل — ',
      format: 'worksheet',
      published: true
    });
    expect(ex.status).toBe(201);
    const exId = (ex.body as { data: { id: string } }).data.id;
    const batch = await manager.post(`/api/students/${studentId}/exercises/batches`, { exercise_ids: [exId] });
    expect(batch.status).toBe(201);
    const pending = await bot(A, tx('تمرین‌های انجام‌نشده', CHAT_PARENT));
    expect(pending.reply).toContain('تکلیف‌های باز');
    expect(pending.reply).toContain('تمرین منوی دانش‌آموز');

    const appts = await bot(A, tx('نوبت‌های دانش‌آموز من', CHAT_PARENT));
    expect(appts.handled).toBe(true);
    expect(appts.reply).toContain('نوبت');
  });

  it('خانواده از «فعالیت کلاس» رد می‌شود؛ «دانش‌آموزان فعال» دیگر دکمه نیست ()', async () => {
    const activity = await bot(A, tx('فعالیت کلاس', CHAT_PARENT));
    expect(activity.reply).toContain('معلمان');
    const stu = await bot(A, tx('دانش‌آموزان فعال', CHAT_PARENT));
    expect(stu.handled).toBe(false);
  });

  it('معلم مدرسه «فعالیت کلاس» → شمارش + فهرست؛ «آگاهی‌های اختلالات» → منو → آیتم با لینک', async () => {
    const school = ((await manager.post('/api/schools', { name: 'دبستان ', kind: 'school', gender_type: 'male' })).body as { data: { id: string } }).data;
    const cls = ((await manager.post('/api/classes', { school_id: school.id, name: 'پنجم الف ', teacher_name: 'معلم ', teacher_phone: '09170002233' })).body as { data: { id: string } }).data;
    await createStudent(manager, { first_name: 'شاگرد', last_name: 'کلاس ', school_id: school.id, class_id: cls.id, guardian_phone: '09123334455' });
    const code = (((await manager.post('/api/notifications/class-links', { class_id: cls.id })).body as { data: { code: string } }).data).code;
    expect((await bot(A, tx(`/link ${code}`, CHAT_TEACHER))).reply).toContain('اتصال با موفقیت');

    const activity = await bot(A, tx('فعالیت کلاس', CHAT_TEACHER));
    expect(activity.reply).toContain('فعالیت کلاس');
    expect(activity.reply).toContain('پنجم الف ');
    expect(activity.reply).toContain('تکلیف باز کلاس');

    const aw = await bot(A, tx('آگاهی‌های اختلالات', CHAT_TEACHER));
    expect(aw.reply).toContain('آگاهی‌های اختلالات');
    expect(aw.buttons?.flat().map((b) => b.text).join('|')).toContain('راهنمای اختلال‌ها');

    const sec = await bot(A, cb('dis:t', CHAT_TEACHER, 40));
    expect(sec.reply).toContain('راهنمای اختلال‌ها');
    const item = await bot(A, cb(sec.buttons![0][0].callbackData, CHAT_TEACHER, 41));
    expect(item.reply).toContain('نارساخوانی');
    expect(item.reply?.includes('🔗') || item.reply?.includes('نسخهٔ چاپی')).toBe(true);
  });

  it('آگاهی‌ها برای مهمان هم باز است (محتوای عمومی)', async () => {
    const aw = await bot(A, tx('/awareness', CHAT_NONE));
    expect(aw.handled).toBe(true);
    expect(aw.reply).toContain('آگاهی‌های اختلالات');
    const sec = await bot(A, cb('dis:d', CHAT_NONE, 50));
    expect(sec.reply).toContain('دفاتر آموزشی');
  });

  it('مدیر «بانک تمرین» دارد؛ «دانش‌آموزان فعال» دیگر دکمهٔ بات نیست ()', async () => {
    const mgrRoot = await bot(A, tx('بانک تمرین', CHAT_MGR));
    expect(mgrRoot.reply).toContain('کارت‌های آمادهٔ مرکز'); // ورودی «بانک تمرین» هم پذیرفته می‌شود
    const mgrList = await bot(A, tx('دانش‌آموزان فعال', CHAT_MGR));
    expect(mgrList.handled).toBe(false);
  });

  it('callback منسوخ stu و نامعتبر dis به‌صورت امن نادیده می‌شود ()', async () => {
    const ignored = await bot(A, cb('stu:menu:999', CHAT_ALI, 60));
    expect(ignored.handled).toBe(false);
    const disBad = await bot(A, cb('dis:zz', CHAT_NONE, 62));
    expect(disBad.handled).toBe(false);
  });
});

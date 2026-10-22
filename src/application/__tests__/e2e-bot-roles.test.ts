import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestApp,
  Api,
  asRole,
  createStudent,
  apptBody,
  tehranTodayAt,
  WEBHOOK_SECRET,
  ALI_ID,
  MARYAM_ID,
  STUDENT1_ID,
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

const CHAT_MGR = 7201;
const CHAT_ALI = 7202;
const CHAT_SEC = 7203;
const CHAT_PARENT = 7204;
const CHAT_NONE = 7299;

const MANAGER_NID = '3672818690';
const ALI_NID = '3149977797';
const SECRETARY_NID = '1566009243';

describe('بات نقش‌آگاه: راهنمای نقش‌محور، /search، «برنامهٔ مرکز»', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');

    expect((await bot(A, tx(MANAGER_NID, CHAT_MGR))).reply).toContain('اتصال انجام شد');
    expect((await bot(A, tx(ALI_NID, CHAT_ALI))).reply).toContain('اتصال انجام شد');
    expect((await bot(A, tx(SECRETARY_NID, CHAT_SEC))).reply).toContain('اتصال انجام شد');

    const s = await createStudent(manager, { guardian_phone: '09125550088' });
    const linkParent = await bot(A, tx(s.nationalId, CHAT_PARENT));
    expect(linkParent.reply).toContain('اتصال انجام شد');
  });

  it('/help بدون اتصال → راهنمای مهمان (مسیر ورود)', async () => {
    const res = await bot(A, tx('/help', CHAT_NONE));
    expect(res.handled).toBe(true);
    expect(res.reply).toContain('پس از اتصال');
    expect(res.reply).toContain('/link CODE');
  });

  it('/help مدیر و منشی → منوی دفتر (/search + برنامه مرکز + وضعیت مرکز)', async () => {
    for (const chat of [CHAT_MGR, CHAT_SEC]) {
      const res = await bot(A, tx('/help', chat));
      expect(res.reply).toContain('مدیر/منشی');
      expect(res.reply).toContain('/search نام');
      expect(res.reply).toContain('برنامه مرکز');
      expect(res.reply).toContain('وضعیت مرکز');
    }
  });

  it('/help متخصص → منوی همکار با منوی دانش‌آموز؛ وضعیت مرکز ندارد', async () => {
    const res = await bot(A, tx('/help', CHAT_ALI));
    expect(res.reply).toContain('همکار (متخصص)');
    expect(res.reply).toContain('دانش‌آموزان فعال');
    expect(res.reply).toContain('پیام به خانواده');
    expect(res.reply).not.toContain('وضعیت مرکز');
    expect(res.reply).not.toContain('برنامه مرکز');
  });

  it('/help والد → منوی خانواده؛ جستجو و پیگیری ندارد', async () => {
    const res = await bot(A, tx('/help', CHAT_PARENT));
    expect(res.reply).toContain('والدین');
    expect(res.reply).toContain('حضور فرزند');
    expect(res.reply).not.toContain('/search');
    expect(res.reply).not.toContain('پیگیری');
  });

  it('دستور ناشناخته هم راهنمای نقش‌محور می‌گیرد', async () => {
    const none = await bot(A, tx('/xyz', CHAT_NONE));
    expect(none.reply).toContain('پس از اتصال');

    const mgr = await bot(A, tx('/xyz', CHAT_MGR));
    expect(mgr.reply).toContain('مدیر/منشی');
  });

  it('/search بدون اتصال → راهنمای مهمان؛ والد → پیام انکار', async () => {
    const none = await bot(A, tx('/search محمدی', CHAT_NONE));
    expect(none.reply).toContain('پس از اتصال');

    const parent = await bot(A, tx('/search محمدی', CHAT_PARENT));
    expect(parent.reply).toContain('فقط برای همکاران مرکز است');
  });

  it('/search مدیر → دانش‌آموز seed پیدا می‌شود (نام + پایه، بدون PII)', async () => {
    const res = await bot(A, tx('/search محمدی', CHAT_MGR));
    expect(res.reply).toContain('جستجوی «محمدی»');
    expect(res.reply).toContain('علی محمدی');
    expect(res.reply).not.toMatch(/0012345679/); // کد ملی در بات نمی‌آید
  });

  it('/search متخصص → همان مرز همکاران (پنل را آینه می‌کند)', async () => {
    const res = await bot(A, tx('/search کریمی', CHAT_ALI));
    expect(res.reply).toContain('سارا کریمی');
  });

  it('/search بدون نتیجه → پیام یافت نشدن؛ پرس‌وجوی خیلی کوتاه → راهنما', async () => {
    const empty = await bot(A, tx('/search ززززز', CHAT_MGR));
    expect(empty.reply).toContain('یافت نشد');

    const short = await bot(A, tx('/search م', CHAT_MGR));
    expect(short.reply).toContain('راهنمای بات');
  });

  it('«برنامه مرکز» متخصص/والد → پیام انکار', async () => {
    const ali = await bot(A, tx('/center', CHAT_ALI));
    expect(ali.reply).toContain('فقط برای مدیر و منشی است');

    const parent = await bot(A, tx('برنامه مرکز', CHAT_PARENT));
    expect(parent.reply).toContain('فقط برای مدیر و منشی است');
  });

  it('«برنامه مرکز» مدیر → نوبت‌های امروز همهٔ همکاران با نام دانش‌آموز؛ لغوشده برچسب دارد', async () => {
    const a1 = await manager.post('/api/appointments', apptBody(ALI_ID, tehranTodayAt(9, 0), 45, [STUDENT1_ID]));
    expect(a1.status).toBe(201);
    const appt1 = (a1.body as { data: { id: string; version: number } }).data;

    const a2 = await manager.post('/api/appointments', apptBody(MARYAM_ID, tehranTodayAt(10, 0), 45, [STUDENT2_ID]));
    expect(a2.status).toBe(201);
    const appt2 = (a2.body as { data: { id: string; version: number } }).data;
    const cancel = await manager.post(`/api/appointments/${appt2.id}/cancel`, { version: appt2.version });
    expect(cancel.status).toBe(200);

    const res = await bot(A, tx('/center', CHAT_MGR));
    expect(res.reply).toContain('برنامهٔ مرکز');
    expect(res.reply).toContain('دکتر علی رضایی');
    expect(res.reply).toContain('علی محمدی');
    expect(res.reply).toContain('مریم احمدی');
    expect(res.reply).toContain('(لغوشده)');
    expect(res.buttons).toBeNull();
  });

  it('«برنامه مرکز» منشی → همان دید دفتر؛ روز خالی → پیام خالی بودن', async () => {
    const res = await bot(A, tx('/center', CHAT_SEC));
    expect(res.reply).toContain('دکتر علی رضایی');
  });
});

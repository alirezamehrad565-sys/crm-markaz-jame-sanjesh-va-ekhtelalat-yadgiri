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

describe('بات نقش‌آگاه: راهنمای نقش‌محور ()', () => {
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

  it('/help مدیر و منشی و متخصص → منوی نقش (: فایل‌های آموزشی + قطع اتصال؛ /search ندارد)', async () => {
    for (const chat of [CHAT_MGR, CHAT_SEC, CHAT_ALI]) {
      const res = await bot(A, tx('/help', chat));
      expect(res.reply).toContain('راهنمای بات');
      expect(res.reply).toContain('فایل‌های آموزشی');
      expect(res.reply).toContain('قطع اتصال');
      expect(res.reply).not.toContain('/search');
    }
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

});

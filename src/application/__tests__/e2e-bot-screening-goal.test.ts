/**
 * تست‌های e2e — bot-screening-goal
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// e2e-bot-screening-goal.test.ts — «هدف سنجش» بات بله
// هماهنگی فلوی بات با داشبورد سایت: همان اعداد هدفگذاری غربال — با حفظ کامل
// احراز هویت قبلی (ورود خودکار با کد ملی) و گیت نقش (فقط مدیر/منشی).

import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, asRole, WEBHOOK_SECRET } from '../../test/harness';
import { toJalaliParts, tehranTodayYmd, jalaliToGregorianYmd } from '@core/shared';

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

// chatها: 7301 مدیر | 7302 همکار (علی — درمانگر) | 7303 منشی | 7399 بدون اتصال
const CHAT_MGR = 7301;
const CHAT_ALI = 7302;
const CHAT_SEC = 7303;
const CHAT_NONE = 7399;

// کدهای ملی seed-dev
const MANAGER_NID = '3672818690';
const ALI_NID = '3149977797';
const SECRETARY_NID = '1566009243';

describe('«هدف سنجش» بات: هماهنگ با داشبورد + حفظ احراز هویت و نقش‌ها', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgrApi: Awaited<ReturnType<typeof asRole>>;

  const today = tehranTodayYmd();
  const [gy, gm, gd] = today.split('-').map(Number);
  const j = toJalaliParts(gy, gm, gd);

  beforeAll(async () => {
    A = createTestApp();
    mgrApi = await asRole(A, 'manager');

    // ورود خودکار — همان احراز هویت قبلی، دست‌نخورده
    expect((await bot(A, tx(MANAGER_NID, CHAT_MGR))).reply).toContain('اتصال انجام شد');
    expect((await bot(A, tx(ALI_NID, CHAT_ALI))).reply).toContain('اتصال انجام شد');
    expect((await bot(A, tx(SECRETARY_NID, CHAT_SEC))).reply).toContain('اتصال انجام شد');

    // هدفگذاری: سال + کمپین سفارشی همپوشان (از اول ماه شمسی تا امروز)
    const monthStart = jalaliToGregorianYmd(j.jy, j.jm, 1);
    const put = await mgrApi.put('/api/settings', {
      screening_targets: [
        { year: j.jy, month: null, target: 400, title: 'هدف کل سال' },
        { year: j.jy, month: null, target: 30, title: 'کمپین پاییزه', from: monthStart, to: today }
      ]
    });
    expect(put.status).toBe(200);
  });

  it('مدیر با «هدف سنجش» → همان اعداد داشبورد (اهداف + پیشرفت)', async () => {
    // یک سنجش ثبت می‌شود → هر دو هدف فعال باید ۱ از هدف نشان دهند
    expect((await mgrApi.post('/api/screening', { name: 'بات تستی', tags: [] })).status).toBe(201);

    const res = await bot(A, tx('هدف سنجش', CHAT_MGR));
    expect(res.handled).toBe(true);
    expect(res.reply).toContain('شاخص سنجش');
    expect(res.reply).toContain('هدف کل سال');
    expect(res.reply).toContain('کمپین پاییزه');
    expect(res.reply).toContain('۱ از ۴۰۰');
    expect(res.reply).toContain('۱ از ۳۰');
    // شمارنده‌های سایت هم در پیام است
    expect(res.reply).toContain('امروز');
  });

  it('منشی با /goal → همان پیام (گیت نقش دفتر)', async () => {
    const res = await bot(A, tx('/goal', CHAT_SEC));
    expect(res.handled).toBe(true);
    expect(res.reply).toContain('شاخص سنجش');
  });

  it('درمانگر → پیام انکار نقش‌محور (سیستم نقش‌ها حفظ شده)', async () => {
    const res = await bot(A, tx('/goal', CHAT_ALI));
    expect(res.handled).toBe(true);
    expect(res.reply).toContain('فقط برای مدیر و منشی');
  });

  it('گفتگوی بدون اتصال → راهنمای مهمان (احراز هویت قبلی حفظ شده)', async () => {
    const res = await bot(A, tx('/goal', CHAT_NONE));
    expect(res.handled).toBe(true);
    expect(res.reply).toContain('کد ملی');
  });

  it('کیبورد ثابت مدیر «هدف سنجش» دارد و دکمهٔ متنی همان دستور را اجرا می‌کند', async () => {
    const res = await bot(A, tx('/help', CHAT_MGR));
    expect(res.keyboard).toEqual([
      ['نوبت‌های من', 'پیگیری‌های من'],
      ['برنامه مرکز', 'لیست انتظار'],
      ['وضعیت مرکز', 'هدف سنجش'],
      ['بانک تمرین', 'دانش‌آموزان فعال'],
      ['اعلان‌های در صف', 'گزارش KPI'],
      ['درباره مرکز', 'راهنما']
    ]);
    const byButton = await bot(A, tx('هدف سنجش', CHAT_MGR));
    expect(byButton.reply).toContain('شاخص سنجش');
  });

  it('هدف خالی → پیام «تنظیم نشده» با مسیر تنظیم', async () => {
    const put = await mgrApi.put('/api/settings', { screening_targets: [] });
    expect(put.status).toBe(200);
    const res = await bot(A, tx('/goal', CHAT_MGR));
    expect(res.reply).toContain('هنوز هدفی برای سنجش تنظیم نشده');
    expect(res.reply).toContain('شاخص سنجش');
  });
});

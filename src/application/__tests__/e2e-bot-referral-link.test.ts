import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, WEBHOOK_SECRET } from '../../test/harness';

/* معرفی دانش‌آموز در بات (۱.۲۷.۳۶): دکمهٔ اول کیبورد برای عموم/نقش پایه —
 * ارجاع فقط از لینک فرم وب (خواست کارفرما: پر کردن فرم با دکمه‌های بات سنگین است و حذف شد). */

type Update = Record<string, unknown>;

interface BotResponse {
  ok: boolean;
  handled: boolean;
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

describe('معرفی دانش‌آموز — دکمهٔ اول بات، فقط لینک (۱.۲۷.۳۶)', () => {
  let A: ReturnType<typeof createTestApp>;
  beforeAll(async () => {
    A = createTestApp();
  });

  it('مهمان: /start → «معرفی دانش‌آموز» ردیف اول کیبورد است', async () => {
    const res = await bot(A, tx('/start', 7601));
    expect(res.handled).toBe(true);
    expect(res.keyboard?.[0]).toEqual(['معرفی دانش‌آموز']);
    expect(res.keyboard?.length).toBeGreaterThan(1);
  });

  it('مهمان: دکمهٔ متنی «معرفی دانش‌آموز» → پیام لینک فرم وب (بدون فلو دکمه‌ای)', async () => {
    const res = await bot(A, tx('معرفی دانش‌آموز', 7602));
    expect(res.handled).toBe(true);
    expect(res.reply).toContain('/public/referral');
    expect(res.reply).toContain('رایگان');
    expect(res.buttons == null).toBe(true); // دکمهٔ inline ندارد — فقط لینک
    expect(res.keyboard?.[0]).toEqual(['معرفی دانش‌آموز']);
  });

  it('دستور /referral هم همان پیام لینک را می‌دهد؛ واریانت چسبیدهٔ ZWNJ هم پارس می‌شود', async () => {
    const cmd = await bot(A, tx('/referral', 7603));
    expect(cmd.reply).toContain('/public/referral');
    const glued = await bot(A, tx('معرفی دانشآموز', 7603));
    expect(glued.handled).toBe(true);
    expect(glued.reply).toContain('/public/referral');
  });

  it('بعد از پیام لینک، متن آزاد همچنان نویز است (handled:false) — فلو بسته‌ای وجود ندارد', async () => {
    await bot(A, tx('معرفی دانش‌آموز', 7604));
    const noise = await bot(A, tx('سارا محمدی', 7604));
    expect(noise.handled).toBe(false);
    const stateRows = A.sql.prepare(`SELECT COUNT(*) AS n FROM bot_menu_state WHERE chat_id = ?`).get('7604') as { n: number };
    expect(stateRows.n).toBe(0);
  });

  it('نقش پایه: خانوادهٔ متصل و معلمِ کلاس — «معرفی دانش‌آموز» ردیف اول', async () => {
    const { asRole, createStudent } = await import('../../test/harness');
    const manager = await asRole(A, 'manager');
    const s = await createStudent(manager, { guardian_phone: '09125550444' });
    const fam = await bot(A, tx(s.nationalId, 7605));
    expect(fam.reply).toContain('اتصال انجام شد');
    expect(fam.keyboard?.[0]).toEqual(['معرفی دانش‌آموز']);

    // کلاس: اتصال با کد کلاس — کیبورد کلاس هم دکمهٔ اول را دارد
    const clsRow = A.sql.prepare(`SELECT code FROM class_bot_links LIMIT 1`).get() as { code: string } | undefined;
    if (clsRow) {
      const cls = await bot(A, tx(`/link ${clsRow.code}`, 7606));
      expect(cls.keyboard?.[0]).toEqual(['معرفی دانش‌آموز']);
    }
  });
});

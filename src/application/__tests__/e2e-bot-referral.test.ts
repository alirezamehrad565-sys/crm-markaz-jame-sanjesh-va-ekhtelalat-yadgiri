import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, WEBHOOK_SECRET } from '../../test/harness';

/* فلو بات «معرفی دانش‌آموز» (۱.۲۷.۳۵) — عموم مردم بدون احراز + نقش پایه (خانواده/معلم):
 * منو → نقش → (معلم: مدرسه/پایه/کلاس/تعداد) → نام و موبایل معرف → به‌ازای هر کودک
 * نام → دستهٔ دغدغه → شرح → مرور → ثبت نهایی از مسیر رسمی waitlist.submitReferral. */

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
const cb = (data: string, chatId: number): Update => ({
  update_id: 1,
  callback_query: { message: { chat: { id: chatId } }, data }
});

function stepper(A: ReturnType<typeof createTestApp>) {
  let uid = 9000;
  return async (u: Update): Promise<BotResponse> => {
    uid += 1;
    return bot(A, { ...u, update_id: uid });
  };
}

describe('فلو بات معرفی دانش‌آموز — عموم و نقش پایه (۱.۲۷.۳۵)', () => {
  let A: ReturnType<typeof createTestApp>;
  beforeAll(async () => {
    A = createTestApp();
  });

  it('مهمان: دکمهٔ «معرفی دانش‌آموز» → معرفی با دو دکمهٔ نقش (بدون احراز)', async () => {
    const step = stepper(A);
    const res = await step(tx('معرفی دانش‌آموز', 7501));
    expect(res.handled).toBe(true);
    expect(res.reply).toContain('معرفی دانش‌آموز');
    expect(res.reply).toContain('رایگان');
    expect(res.buttons?.flat().map((b) => b.callbackData)).toEqual(expect.arrayContaining(['rf:role:family', 'rf:role:teacher']));
    const viaCommand = await step(tx('/referral', 7501));
    expect(viaCommand.reply).toContain('معرفی دانش‌آموز');
  });

  it('فلوی خانواده — ارقام فارسی موبایل نرمال و ردیف با کانال bot ثبت می‌شود', async () => {
    const step = stepper(A);
    const C = 7502;
    const start = await step(tx('معرفی دانش‌آموز', C));
    expect(start.reply).toContain('نگرانی');
    const role = await step(cb('rf:role:family', C));
    expect(role.reply).toContain('نام و نام خانوادگی خودتان');
    const name = await step(tx('سارا محمدی', C));
    expect(name.reply).toContain('موبایل');
    const badPhone = await step(tx('12345', C));
    expect(badPhone.reply).toContain('معتبر نیست');
    const phone = await step(tx('۰۹۱۲۳۴۵۶۷۸۹', C));
    expect(phone.reply).toContain('کودک ۱ از ۱');
    const child = await step(tx('آوا رضایی', C));
    expect(child.reply).toContain('آوا رضایی');
    expect(child.buttons?.flat().some((b) => b.callbackData === 'rf:cat:0:speech')).toBe(true);
    const cat = await step(cb('rf:cat:0:speech', C));
    expect(cat.reply).toContain('شرح دغدغه');
    const text = await step(tx('حرف زدن او دیر شروع شده و در کلاس کم‌حرف است', C));
    expect(text.reply).toContain('مرور نهایی');
    expect(text.reply).toContain('سارا محمدی');
    expect(text.reply).toContain('گفتار و زبان');
    const done = await step(cb('rf:do', C));
    expect(done.reply).toContain('ثبت شد');
    const row = A.sql.prepare(`SELECT * FROM waitlist_referrals WHERE token = ?`).get(`bot:${C}`) as {
      channel: string;
      referrer_name: string;
      referrer_phone: string;
      first_name: string;
      concern_category: string | null;
      concern_text: string | null;
      status: string;
    };
    expect(row.channel).toBe('bot');
    expect(row.referrer_name).toBe('سارا محمدی');
    expect(row.referrer_phone).toBe('09123456789');
    expect(row.first_name).toBe('آوا رضایی');
    expect(row.concern_category).toBe('speech');
    expect(row.concern_text).toContain('حرف زدن');
    expect(row.status).toBe('new');
  });

  it('فلوی معلم — مدرسه/پایه/کلاس + دو کودک → دو ردیف با اسنپ‌شات مدرسه', async () => {
    const step = stepper(A);
    const C = 7503;
    await step(tx('معرفی دانش‌آموز', C));
    const role = await step(cb('rf:role:teacher', C));
    expect(role.reply).toContain('مدرسه');
    await step(tx('دبستان شهید بهشتی', C));
    await step(tx('دوم', C));
    await step(tx('۲۱', C));
    const count = await step(cb('rf:count:2', C));
    expect(count.reply).toContain('کودک ۱ از ۲');
    await step(tx('نیما کاظمی', C));
    const cat1 = await step(cb('rf:cat:0:learning_disorder', C));
    expect(cat1.reply).toContain('شرح دغدغه');
    await step(tx('رد', C)); // شرح اختیاری
    const child2 = await step(tx('هستی مرادی', C));
    expect(child2.reply).toContain('هستی مرادی'); // پرسش دستهٔ دغدغهٔ کودک دوم
    await step(cb('rf:cat:1:autism', C));
    const text2 = await step(tx('تماس چشمی کم و سخت‌گیری در تغییر روتین', C));
    expect(text2.reply).toContain('مرور نهایی');
    const done = await step(cb('rf:do', C));
    expect(done.reply).toContain('ثبت شد');
    const rows = A.sql.prepare(`SELECT * FROM waitlist_referrals WHERE token = ? ORDER BY created_at`).all(`bot:${C}`) as Array<{
      first_name: string;
      school_text: string | null;
      concern_category: string | null;
      concern_text: string | null;
      ref_role: string;
    }>;
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.ref_role === 'teacher' && r.school_text === 'دبستان شهید بهشتی')).toBe(true);
    expect(rows[0].first_name).toBe('نیما کاظمی');
    expect(rows[0].concern_category).toBe('learning_disorder');
    expect(rows[0].concern_text).toBeNull();
    expect(rows[1].first_name).toBe('هستی مرادی');
    expect(rows[1].concern_category).toBe('autism');
  });

  it('نام کوتاه پذیرفته نمی‌شود؛ /cancel در میانهٔ فلو لغو می‌کند و منوی مهمان برمی‌گردد', async () => {
    const step = stepper(A);
    const C = 7504;
    await step(tx('معرفی دانش‌آموز', C));
    await step(cb('rf:role:family', C));
    const short = await step(tx('س', C));
    expect(short.reply).toContain('حداقل ۲ نویسه');
    await step(tx('سارا محمدی', C));
    const cancelled = await step(tx('/cancel', C));
    expect(cancelled.reply).toContain('لغو');
    expect(cancelled.keyboard).toEqual([
      ['معرفی مرکز', 'خدمات مرکز'],
      ['راه‌های ارتباطی', 'احراز هویت'],
      ['معرفی دانش‌آموز', 'فایل‌های آموزشی']
    ]);
    const rows = A.sql.prepare(`SELECT COUNT(*) AS n FROM waitlist_referrals WHERE token = ?`).get(`bot:${C}`) as { n: number };
    expect(rows.n).toBe(0);
  });

  it('منوی دیگر در میانهٔ فلو → فلو بسته و خودِ منو اجرا می‌شود؛ انصراف با rf:no هم بسته است', async () => {
    const step = stepper(A);
    const C = 7505;
    await step(tx('معرفی دانش‌آموز', C));
    await step(cb('rf:role:family', C));
    const other = await step(tx('خدمات مرکز', C));
    expect(other.reply).toContain('سنجش و غربالگری');
    const rows = A.sql.prepare(`SELECT COUNT(*) AS n FROM waitlist_referrals WHERE token = ?`).get(`bot:${C}`) as { n: number };
    expect(rows.n).toBe(0);
    // انصراف صریح از صفحهٔ مرور
    await step(tx('معرفی دانش‌آموز', C));
    await step(cb('rf:role:family', C));
    await step(tx('سارا محمدی', C));
    await step(tx('۰۹۱۲۳۴۵۶۷۸۹', C));
    await step(tx('آوا رضایی', C));
    await step(cb('rf:cat:0:other', C));
    const summary = await step(tx('رد', C));
    expect(summary.reply).toContain('مرور نهایی');
    const abort = await step(cb('rf:no', C));
    expect(abort.reply).toContain('لغو');
    const after = A.sql.prepare(`SELECT COUNT(*) AS n FROM waitlist_referrals WHERE token = ?`).get(`bot:${C}`) as { n: number };
    expect(after.n).toBe(0);
  });

  it('کیبورد نقش پایه: خانوادهٔ متصل هم «معرفی دانش‌آموز» دارد (بدون ارجاع در لیست انتظار)', async () => {
    const { asRole, createStudent } = await import('../../test/harness');
    const manager = await asRole(A, 'manager');
    const s = await createStudent(manager, { guardian_phone: '09125550999' });
    const step = stepper(A);
    const link = await step(tx(s.nationalId, 7506));
    expect(link.reply).toContain('اتصال انجام شد');
    expect(link.keyboard).toContainEqual(['معرفی دانش‌آموز', 'فایل‌های آموزشی']);
    // و فرم عمومی وب هم زنده است
    const page = await A.app.request('/public/form/none');
    expect(page.status).toBe(404);
  });
});

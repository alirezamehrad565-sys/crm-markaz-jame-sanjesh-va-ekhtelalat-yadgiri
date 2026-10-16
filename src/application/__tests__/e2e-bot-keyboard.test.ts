/**
 * تست‌های e2e — bot-keyboard
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// e2e-bot-keyboard.test.ts — دکمه‌های ثابت ناوبری بات + «درباره مرکز» + ارتقای رمز PBKDF2
// اپ واقعی Hono + اسکیمای واقعی migrations + webhook بله با secret تست

import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, WEBHOOK_SECRET } from '../../test/harness';

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

// chatها: 7301 همکار (علی) | 7302 مدیر | 7303 والد | 7399 بدون اتصال
const CHAT_ALI = 7301;
const CHAT_MANAGER = 7302;
const CHAT_PARENT = 7303;
const CHAT_NONE = 7399;

// شناسه‌های seed-dev
const ALI_NID = '3149977797';
const MANAGER_NID = '3672818690';

describe('دکمه‌های ثابت ناوبری + دربارهٔ مرکز + ارتقای رمز', () => {
  let A: ReturnType<typeof createTestApp>;

  beforeAll(async () => {
    A = createTestApp();
  });

  it('مهمان: /start خوش‌آمد + کیبورد مهمان (معرفی/خدمات/ارتباطی/احراز هویت) می‌گیرد', async () => {
    const res = await bot(A, tx('/start', CHAT_NONE));
    expect(res.handled).toBe(true);
    expect(res.reply).toContain('خوش آمدید');
    expect(res.keyboard).toEqual([['معرفی مرکز', 'خدمات مرکز'], ['راه‌های ارتباطی', 'احراز هویت']]);
  });

  it('دکمهٔ متنی «معرفی مرکز» (مهمان) → متن کامل دربارهٔ مرکز', async () => {
    const res = await bot(A, tx('معرفی مرکز', CHAT_NONE));
    expect(res.handled).toBe(true);
    expect(res.reply).toContain('دربارهٔ مرکز');
    expect(res.reply).toContain('سنجش و غربالگری');
    expect(res.reply).toContain('توان‌بخشی');
    expect(res.reply).toContain('مداخلهٔ بهنگام رشدی');
    expect(res.keyboard).toEqual([['معرفی مرکز', 'خدمات مرکز'], ['راه‌های ارتباطی', 'احراز هویت']]);
  });

  it('دکمهٔ «خدمات مرکز» (مهمان) → متن چهار خدمت + دکمهٔ «احراز هویت» → راهنمای ورود', async () => {
    const services = await bot(A, tx('خدمات مرکز', CHAT_NONE));
    expect(services.reply).toContain('سنجش و غربالگری');
    expect(services.reply).toContain('مداخلهٔ بهنگام رشدی');
    expect(services.keyboard).toEqual([['معرفی مرکز', 'خدمات مرکز'], ['راه‌های ارتباطی', 'احراز هویت']]);
    const contact = await bot(A, tx('راه‌های ارتباطی', CHAT_NONE));
    expect(contact.reply).toContain('تماس');
    const auth = await bot(A, tx('احراز هویت', CHAT_NONE));
    expect(auth.reply).toContain('کد اتصال');
    expect(auth.reply).toContain('/link CODE');
    expect(auth.keyboard).toEqual([['معرفی مرکز', 'خدمات مرکز'], ['راه‌های ارتباطی', 'احراز هویت']]);
  });

  it('دکمهٔ متنی «درباره ما» و /about هم به همان متن می‌رسد', async () => {
    const viaLabel = await bot(A, tx('درباره ما', CHAT_NONE));
    expect(viaLabel.reply).toContain('دربارهٔ مرکز');
    const viaCommand = await bot(A, tx('/about', CHAT_NONE));
    expect(viaCommand.reply).toContain('دربارهٔ مرکز');
  });

  it('ورود خودکار همکار (درمانگر) → کیبورد نقش درمانگر (: + دانش‌آموزان فعال)', async () => {
    const res = await bot(A, tx(ALI_NID, CHAT_ALI));
    expect(res.reply).toContain('اتصال انجام شد');
    expect(res.keyboard).toEqual([
      ['نوبت‌های من', 'پیگیری‌های من'],
      ['دانش‌آموزان فعال', 'بانک تمرین'],
      ['اعلان‌های در صف'],
      ['درباره مرکز', 'راهنما']
    ]);
  });

  it('ورود خودکار مدیر → کیبورد کامل دفتر (: + دانش‌آموزان فعال، KPI برای مدیر)', async () => {
    const res = await bot(A, tx(MANAGER_NID, CHAT_MANAGER));
    expect(res.reply).toContain('اتصال انجام شد');
    expect(res.keyboard).toEqual([
      ['نوبت‌های من', 'پیگیری‌های من'],
      ['برنامه مرکز', 'لیست انتظار'],
      ['وضعیت مرکز', 'هدف سنجش'],
      ['بانک تمرین', 'دانش‌آموزان فعال'],
      ['اعلان‌های در صف', 'گزارش KPI'],
      ['درباره مرکز', 'راهنما']
    ]);
  });

  it('کیبورد نقش‌محور واقعاً کار می‌کند: دکمهٔ «درباره مرکز» متصلِ درمانگر → پاسخ + کیبورد درمانگر', async () => {
    const res = await bot(A, tx('درباره مرکز', CHAT_ALI));
    expect(res.reply).toContain('دربارهٔ مرکز');
    expect(res.keyboard).toEqual([
      ['نوبت‌های من', 'پیگیری‌های من'],
      ['دانش‌آموزان فعال', 'بانک تمرین'],
      ['اعلان‌های در صف'],
      ['درباره مرکز', 'راهنما']
    ]);
  });

  it('والد متصل → کیبورد والد (نوبت‌های دانش‌آموز من + تمرین‌های انجام‌نشده + چک‌لیست‌های من + حضور فرزند)', async () => {
    const manager = await import('../../test/harness').then((m) => m.asRole(A, 'manager'));
    const { createStudent } = await import('../../test/harness');
    const s = await createStudent(manager, { guardian_phone: '09125550123' });
    const link = await bot(A, tx(s.nationalId, CHAT_PARENT));
    expect(link.reply).toContain('اتصال انجام شد');
    expect(link.keyboard).toEqual([
      ['نوبت‌های دانش‌آموز من', 'تمرین‌های انجام‌نشده'],
      ['چک‌لیست‌های من', 'حضور فرزند'],
      ['درباره مرکز', 'راهنما']
    ]);
  });

  it('رمز legacy SHA-256 در اولین ورود موفق به PBKDF2 ارتقا می‌یابد و ورود بعدی هم سالم است', async () => {
    const { Api } = await import('../../test/harness');

    // حساب دست‌نخورده (در همین فایل با آن login نشده — asRole فقط manager را وارد می‌کند)
    const USERNAME = 'secretary';

    // قبل از ورود: هش legacy (SHA-256 hex ۶۴ نویسه)
    const before = A.sql.prepare('SELECT password_hash FROM staff WHERE username = ?').get(USERNAME) as {
      password_hash: string;
    };
    expect(before.password_hash).toMatch(/^[0-9a-f]{64}$/);

    const api = new Api(A);
    const login1 = await api.post('/api/auth/login', { username: USERNAME, password: '1234' });
    expect(login1.status).toBe(200);

    // بعد از ورود: هش نسخه‌دار PBKDF2
    const after = A.sql.prepare('SELECT password_hash FROM staff WHERE username = ?').get(USERNAME) as {
      password_hash: string;
    };
    expect(after.password_hash.startsWith('pbkdf2$')).toBe(true);
    expect(after.password_hash).not.toBe(before.password_hash);

    // ورود دوم با همان رمز — از مسیر PBKDF2
    const api2 = new Api(A);
    const login2 = await api2.post('/api/auth/login', { username: USERNAME, password: '1234' });
    expect(login2.status).toBe(200);

    // رمز غلط همچنان رد می‌شود
    const api3 = new Api(A);
    const bad = await api3.post('/api/auth/login', { username: USERNAME, password: '0000' });
    expect(bad.status).toBe(401);
  });

  it('هش جدید hashPassword مستقیماً verify می‌شود (pure — بدون مسیر legacy)', async () => {
    const { hashPassword, verifyPassword, isLegacyPasswordHash } = await import('@core/auth');
    const h = await hashPassword('رمز-آزمایشی-۱۲۳');
    expect(isLegacyPasswordHash(h)).toBe(false);
    expect(await verifyPassword('رمز-آزمایشی-۱۲۳', h)).toBe(true);
    expect(await verifyPassword('رمز-غلط', h)).toBe(false);
    // legacy هنوز verify می‌شود
    expect(isLegacyPasswordHash('03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4')).toBe(true);
    expect(await verifyPassword('1234', '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4')).toBe(true);
  });
});

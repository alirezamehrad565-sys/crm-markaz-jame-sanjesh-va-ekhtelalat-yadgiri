import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestApp,
  Api,
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

const CHAT_MGR = 7401;
const CHAT_ALI = 7402;
const CHAT_PARENT = 7404;
const CHAT_CLASS = 7405;
const CHAT_NONE = 7499;

const MANAGER_NID = '3672818690';
const PDF_B64 = Buffer.from('%PDF-1.4 worksheet for bot flow').toString('base64');

describe('بات: بانک تمرین تو‌در‌تو و دریافت فایل (m184: ارسال از بات حذف شد)', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;
  let exerciseId = '';
  let exerciseTitle = 'تمرین خواندن واژه‌های هم‌خانواده';
  let studentId = '';
  let studentName = '';

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');

    expect((await bot(A, tx(MANAGER_NID, CHAT_MGR))).reply).toContain('اتصال انجام شد');
    const ALI_NID = '3149977797'; // کد ملی علی — seed-dev (مطابق e2e-bot-roles)
    expect((await bot(A, tx(ALI_NID, CHAT_ALI))).reply).toContain('اتصال انجام شد');

    const s = await createStudent(manager, { first_name: 'سینا', last_name: 'تمرین‌زاده' });
    studentId = s.id;
    studentName = 'سینا تمرین‌زاده';
    expect((await bot(A, tx(s.nationalId, CHAT_PARENT))).reply).toContain('اتصال انجام شد');

    const appt = await manager.post('/api/appointments', apptBody(ALI_ID, quarterHourFromNow(30), 45, [studentId]));
    expect(appt.status).toBe(201);

    const ex = await manager.post('/api/exercises', {
      title: exerciseTitle,
      description: 'پنج واژه را در جمله بیاورید.',
      format: 'worksheet',
      published: true,
      file: { filename: 'vazheha.pdf', mime_type: 'application/pdf', content_b64: PDF_B64 }
    });
    expect(ex.status).toBe(201);
    exerciseId = (ex.body as { data: { id: string } }).data.id;

    A.sql
      .prepare(
        `INSERT INTO classes (id, school_id, name, active) VALUES ('30000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-000000000001', 'چهارم الف', 1)`
      )
      .run();
    A.sql
      .prepare(
        `UPDATE students SET class_id = '30000000-0000-0000-0000-0000000000c1' WHERE id = ?`
      )
      .run(studentId);
    A.sql
      .prepare(
        `INSERT INTO class_bot_links (id, code, class_id, chat_id, status, created_by, created_at) VALUES ('40000000-0000-0000-0000-0000000000c1', 'CLS123', '30000000-0000-0000-0000-0000000000c1', ?, 'linked', '00000000-0000-0000-0000-000000000001', datetime('now'))`
      )
      .run(String(CHAT_CLASS));
  });

  it('«بانک تمرین» بدون اتصال و برای والد → انکار', async () => {
    const none = await bot(A, tx('بانک تمرین', CHAT_NONE));
    expect(none.reply).toContain('فقط برای همکاران مرکز و معلمان');

    const parent = await bot(A, tx('بانک تمرین', CHAT_PARENT));
    expect(parent.reply).toContain('فقط برای همکاران مرکز و معلمان');

    const parentCb = await bot(A, cb('exb:root', CHAT_PARENT));
    expect(parentCb.reply).toContain('فقط برای همکاران مرکز و معلمان');
  });

  it('/help همکار و معلم کلاس → خط «بانک تمرین» در راهنما', async () => {
    const ali = await bot(A, tx('/help', CHAT_ALI));
    expect(ali.reply).toContain('بانک تمرین');

    const teacher = await bot(A, tx('/help', CHAT_CLASS));
    expect(teacher.reply).toContain('بانک تمرین');
  });

  it('ریشهٔ بانک تمرین برای درمانگر → دکمه‌های مسیر', async () => {
    const res = await bot(A, tx('بانک تمرین', CHAT_ALI));
    expect(res.handled).toBe(true);
    expect(res.reply).toContain('بانک تمرین مرکز');
    expect(res.buttons).not.toBeNull();
    const flat = res.buttons!.flat();
    expect(flat.some((b) => b.callbackData === 'exb:lst:a:0:1')).toBe(true);
    expect(flat.some((b) => b.callbackData === 'exb:cats:d:1')).toBe(true);
  });

  it('همهٔ تمرین‌ها → آیتم → جزئیات با دکمهٔ دریافت فایل (m184)', async () => {
    const list = await bot(A, cb('exb:lst:a:0:1', CHAT_ALI, 11));
    expect(list.buttons!.flat().some((b) => b.text.startsWith(exerciseTitle.slice(0, 20)))).toBe(true);
    const flat = list.buttons!.flat();
    const itemBtn = flat.find((b) => b.callbackData.startsWith('exb:item:'));
    expect(itemBtn).toBeDefined();

    const detail = await bot(A, cb(itemBtn!.callbackData, CHAT_ALI, 12));
    expect(detail.reply).toContain(exerciseTitle);
    expect(detail.reply).toContain('vazheha.pdf');
    expect(detail.buttons!.flat().some((b) => b.callbackData.startsWith('exb:file:'))).toBe(true);
  });

  it('اندیس خارج از state → پیام منوی قدیمی', async () => {
    const stale = await bot(A, cb('exb:item:9', CHAT_ALI, 13));
    expect(stale.reply).toContain('قدیمی');
  });

  it('کلید قطع: exercise_bank_enabled=false → پیام غیرفعال', async () => {
    A.sql
      .prepare(
        `INSERT INTO settings (key, value, updated_by) VALUES ('exercise_bank_enabled', 'false', '00000000-0000-0000-0000-000000000001')`
      )
      .run();
    const res = await bot(A, tx('بانک تمرین', CHAT_ALI));
    expect(res.reply).toContain('غیرفعال');
    A.sql.prepare(`DELETE FROM settings WHERE key = 'exercise_bank_enabled'`).run();
  });
});

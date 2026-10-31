import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestApp,
  Api,
  asRole,
  createStudent,
  apptBody,
  quarterHourFromNow,
  ALI_ID,
  WEBHOOK_SECRET,
  loginToken
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

//  — فرستندهٔ آزمایشی فایل تمرین: ثبت فراخوانی + شکست قابل‌کنترل برای تست ارسال ناقص
const sentFiles: { chatId: string; filename: string }[] = [];
let failingNames: string[] = [];
const stubExerciseFileSender = async (chatId: string, file: { filename: string }): Promise<boolean> => {
  if (failingNames.some((n) => file.filename.includes(n))) return false;
  sentFiles.push({ chatId, filename: file.filename });
  return true;
};

function multipartBody(files: { name: string; mime: string; bytes: Buffer }[]): { body: Buffer; contentType: string } {
  const b = '----exb-upload';
  const parts: Buffer[] = [];
  for (const f of files) {
    parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="files"; filename="${f.name}"\r\nContent-Type: ${f.mime}\r\n\r\n`));
    parts.push(f.bytes);
    parts.push(Buffer.from('\r\n'));
  }
  parts.push(Buffer.from(`--${b}--\r\n`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${b}` };
}

describe('بات: بانک تمرین — ارسال همهٔ فایل‌ها با یک کلیک (؛ جریان تکلیف  حذف شده)', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;
  let exerciseId = '';
  let exerciseTitle = 'تمرین خواندن واژه‌های هم‌خانواده';
  let studentId = '';
  let studentName = '';

  beforeAll(async () => {
    A = createTestApp(undefined, { exerciseFileSender: stubExerciseFileSender });
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
    expect(ali.reply).toContain('کارت‌های آماده'); //  — راهنما به زبان کارت

    const teacher = await bot(A, tx('/help', CHAT_CLASS));
    expect(teacher.reply).toContain('کارت‌های آماده');
  });

  it('ریشهٔ بانک تمرین برای درمانگر → دکمه‌های مسیر', async () => {
    const res = await bot(A, tx('بانک تمرین', CHAT_ALI));
    expect(res.handled).toBe(true);
    expect(res.reply).toContain('کارت‌های آمادهٔ مرکز'); // 
    expect(res.buttons).not.toBeNull();
    const flat = res.buttons!.flat();
    expect(flat.some((b) => b.callbackData === 'exb:lst:a:0:1')).toBe(true);
    expect(flat.some((b) => b.callbackData === 'exb:cats:d:1')).toBe(true);
  });

  // یافتن اندیس تمرین در state بات (مستقل از ترتیب فهرست)
  function exbIdxOf(titlePart: string): number {
    const row = A.sql.prepare(`SELECT payload FROM bot_menu_state WHERE chat_id = ?`).get(String(CHAT_ALI)) as { payload: string } | undefined;
    expect(row).toBeDefined();
    const st = JSON.parse(row!.payload) as { ex?: { id: string; title: string }[] };
    const idx = (st.ex ?? []).findIndex((e) => e.title.includes(titlePart));
    expect(idx).toBeGreaterThanOrEqual(0);
    return idx;
  }

  async function refreshList(updateId: number): Promise<void> {
    const list = await bot(A, cb('exb:lst:a:0:1', CHAT_ALI, updateId));
    expect(list.buttons).not.toBeNull();
  }

  async function addFiles(exId: string, files: { name: string; mime: string; bytes: Buffer }[]): Promise<void> {
    const { body, contentType } = multipartBody(files);
    const token = await loginToken(A, 'manager');
    const up = await A.app.request(
      `/api/exercises/${exId}/files`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': contentType },
        body: new Uint8Array(body)
      },
      A.env as never
    );
    expect([200, 201]).toContain(up.status);
  }

  it('همهٔ تمرین‌ها → یک کلیک روی تمرین → ارسال همهٔ فایل‌ها + جزئیات در دسترس ()', async () => {
    await refreshList(11);
    const idx = exbIdxOf(exerciseTitle);
    const sent = await bot(A, cb(`exb:get:${idx}`, CHAT_ALI, 12));
    expect(sent.reply).toContain(exerciseTitle);
    expect(sent.reply).toContain('ارسال شد'); // تمرین تک‌فایلی → پیام موفق
    expect(sentFiles.some((f) => f.filename === 'vazheha.pdf')).toBe(true);

    const sentFlat = sent.buttons!.flat();
    const infoBtn = sentFlat.find((b) => b.callbackData.startsWith('exb:item:'));
    expect(infoBtn).toBeDefined();

    // جزئیات تمرین همچنان در دسترس است (دریافت تک‌تک فایل‌ها)
    const detail = await bot(A, cb(infoBtn!.callbackData, CHAT_ALI, 13));
    expect(detail.reply).toContain(exerciseTitle);
    expect(detail.reply).toContain('vazheha.pdf');
    expect(detail.buttons!.flat().some((b) => b.callbackData.startsWith('exb:file:'))).toBe(true);
  });

  it('تمرین چندفایلی → یک کلیک → همهٔ فایل‌های پیوست یکجا ارسال می‌شود', async () => {
    const created = await manager.post('/api/exercises', {
      title: 'تمرین چندفایلی م۲۰۰',
      description: 'دو کاربرگ پیوست.',
      format: 'worksheet',
      published: true
    });
    expect(created.status).toBe(201);
    const ex2Id = (created.body as { data: { id: string } }).data.id;
    await addFiles(ex2Id, [
      { name: 'karbarg-1.pdf', mime: 'application/pdf', bytes: Buffer.from('%PDF-1.4 one') },
      { name: 'karbarg-2.pdf', mime: 'application/pdf', bytes: Buffer.from('%PDF-1.4 two') }
    ]);

    await refreshList(21);
    const idx = exbIdxOf('چندفایلی');
    const before = sentFiles.length;
    const sent = await bot(A, cb(`exb:get:${idx}`, CHAT_ALI, 22));
    expect(sent.reply).toContain('تمرین چندفایلی م۲۰۰');
    expect(sent.reply).toContain('هر ۲ فایل تمرین یکجا برایتان ارسال شد');
    expect(sentFiles.slice(before).map((f) => f.filename).sort()).toEqual(['karbarg-1.pdf', 'karbarg-2.pdf']);
  });

  it('ارسال ناقص → شمارندهٔ «X از Y فایل» + راهنمای دریافت جداگانه از جزئیات', async () => {
    const created = await manager.post('/api/exercises', {
      title: 'تمرین ارسال ناقص م۲۰۰',
      format: 'worksheet',
      published: true
    });
    expect(created.status).toBe(201);
    const ex3Id = (created.body as { data: { id: string } }).data.id;
    await addFiles(ex3Id, [
      { name: 'fail-one.pdf', mime: 'application/pdf', bytes: Buffer.from('%PDF-1.4 fail') },
      { name: 'ok-two.pdf', mime: 'application/pdf', bytes: Buffer.from('%PDF-1.4 ok') }
    ]);

    await refreshList(31);
    const idx = exbIdxOf('ارسال ناقص');
    failingNames = ['fail-one'];
    const before = sentFiles.length;
    const sent = await bot(A, cb(`exb:get:${idx}`, CHAT_ALI, 32));
    failingNames = [];
    expect(sent.reply).toContain('۱ از ۲ فایل ارسال شد');
    expect(sent.reply).toContain('جزئیات کارت'); // 
    expect(sentFiles.slice(before).map((f) => f.filename)).toEqual(['ok-two.pdf']);
  });

  it('تمرین بی‌فایل → نمای جزئیات («فایل پیوست ندارد») بدون هیچ ارسالی', async () => {
    const created = await manager.post('/api/exercises', {
      title: 'تمرین بی‌فایل م۲۰۰',
      format: 'game',
      published: true
    });
    expect(created.status).toBe(201);

    await refreshList(41);
    const idx = exbIdxOf('بی‌فایل');
    const before = sentFiles.length;
    const res = await bot(A, cb(`exb:get:${idx}`, CHAT_ALI, 42));
    expect(res.reply).toContain('فایل پیوست ندارد');
    expect(sentFiles.length).toBe(before);
  });

  it('اندیس خارج از state برای exb:get → پیام منوی قدیمی', async () => {
    const stale = await bot(A, cb('exb:get:9', CHAT_ALI, 43));
    expect(stale.reply).toContain('قدیمی');
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

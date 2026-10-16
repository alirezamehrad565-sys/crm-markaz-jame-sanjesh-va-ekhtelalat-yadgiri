/**
 * تست‌های e2e — submission-loop
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// e2e-submission-loop.test.ts — حلقهٔ کامل بازگشت فایل از بات تا پنل و تایم‌لاین
// تکلیف از بات (exb) → خانواده عکس می‌فرستد → auto/extra/pick → ثبت در D1 + اعلان به همکار →
// وضعیت done + audit + تایم‌لاین + دانلود پنل

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
import type { MediaFetcher } from '@core/notify';

type Update = Record<string, unknown>;

interface BotResponse {
  ok: boolean;
  handled: boolean;
  sent: boolean | null;
  reply: string | null;
  buttons: { text: string; callbackData: string }[][] | null;
}

const tx = (t: string, chatId: number): Update => ({ update_id: 1, message: { chat: { id: chatId }, text: t } });
const cb = (data: string, chatId: number, updateId = 2): Update => ({
  update_id: updateId,
  callback_query: { id: updateId, data, message: { chat: { id: chatId } } }
});
const photo = (chatId: number, fileId: string, caption?: string): Update => ({
  update_id: 5,
  message: {
    chat: { id: chatId },
    photo: [
      { file_id: `${fileId}_s`, file_size: 100 },
      { file_id: `${fileId}_b`, file_size: 900 }
    ],
    ...(caption !== undefined ? { caption } : {})
  }
});
const document = (chatId: number, fileId: string, name: string, mime: string): Update => ({
  update_id: 5,
  message: {
    chat: { id: chatId },
    document: { file_id: fileId, file_name: name, mime_type: mime, file_size: 300 }
  }
});

const CHAT_ALI = 7602;
const CHAT_PARENT = 7604;
const CHAT_STRANGER = 7699;

const ALI_NID = '3149977797';

describe('حلقهٔ کامل بازگشت فایل (وبهوک واقعی + fetcher تزریقی)', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;
  let exerciseId = '';
  const exerciseTitle = 'تمرین حلقهٔ بازگشت';
  let studentId = '';
  let studentName = '';
  let fetchCalls: string[] = [];

  function fakeFetcher(): MediaFetcher {
    return {
      available: true,
      fetch: async (fileId: string) => {
        fetchCalls.push(fileId);
        return {
          bytes: new TextEncoder().encode(`jpeg-bytes-of-${fileId}`),
          mime: 'image/jpeg'
        };
      }
    };
  }

  async function bot(raw: Update): Promise<BotResponse> {
    const res = await A.app.request(
      `/webhook/bale/${WEBHOOK_SECRET}`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(raw) },
      A.env as never
    );
    return (await res.json()) as BotResponse;
  }

  /** راه‌رفتن در منوی exb تا ثبت تکلیف برای اولین دانش‌آموز فهرست درمانگر */
  async function sendHomeworkFromBot(): Promise<void> {
    await bot(cb('exb:lst:a:0:1', CHAT_ALI, 100));
    const students = await bot(cb('exb:send:0:1', CHAT_ALI, 101));
    const pick = students.buttons!.flat().find((b) => b.callbackData.startsWith('exb:pick:'));
    expect(pick).toBeDefined();
    const confirm = await bot(cb(pick!.callbackData, CHAT_ALI, 102));
    const yes = confirm.buttons!.flat().find((b) => b.callbackData.startsWith('exb:yes:'));
    expect(yes).toBeDefined();
    const sent = await bot(cb(yes!.callbackData, CHAT_ALI, 103));
    expect(sent.reply).toContain('ثبت شد');
  }

  beforeAll(async () => {
    A = createTestApp(undefined, { mediaFetcher: fakeFetcher() });
    manager = await asRole(A, 'manager');

    // اتصال همکار و والد
    expect((await bot(tx(ALI_NID, CHAT_ALI))).reply).toContain('اتصال انجام شد');

    const s = await createStudent(manager, { first_name: 'نسیم', last_name: 'بازگشتی' });
    studentId = s.id;
    studentName = 'نسیم بازگشتی';
    expect((await bot(tx(s.nationalId, CHAT_PARENT))).reply).toContain('اتصال انجام شد');

    // جلسهٔ علی — دامنهٔ «دانش‌آموزان من» درمانگر
    const appt = await manager.post('/api/appointments', apptBody(ALI_ID, quarterHourFromNow(30), 45, [studentId]));
    expect(appt.status).toBe(201);

    // تمرین منتشرشده
    const ex = await manager.post('/api/exercises', {
      title: exerciseTitle,
      description: 'سه واژه بخوانید.',
      format: 'worksheet',
      published: true
    });
    expect(ex.status).toBe(201);
    exerciseId = (ex.body as { data: { id: string } }).data.id;

    // تکلیف اول از بات
    await sendHomeworkFromBot();
  });

  it('والد عکس می‌فرستد → پیوست خودکار (auto) به تکلیف باز', async () => {
    fetchCalls.length = 0;
    const res = await bot(photo(CHAT_PARENT, 'FILE-1', 'صفحهٔ اول را حل کرد'));
    expect(res.handled).toBe(true);
    expect(res.reply).toContain('دریافت شد');
    expect(res.reply).toContain(exerciseTitle);

    // بزرگ‌ترین سایز دانلود شد
    expect(fetchCalls).toEqual(['FILE-1_b']);

    // رکورد بازگشت
    const subs = A.sql
      .prepare(`SELECT assignment_id, student_id, file_name, file_mime, source_chat_id, note FROM exercise_submissions`)
      .all() as { assignment_id: string; student_id: string; file_name: string; file_mime: string; source_chat_id: string; note: string }[];
    expect(subs).toHaveLength(1);
    expect(subs[0].student_id).toBe(studentId);
    expect(subs[0].file_mime).toBe('image/jpeg');
    expect(subs[0].source_chat_id).toBe(String(CHAT_PARENT));
    expect(subs[0].note).toBe('صفحهٔ اول را حل کرد');

    // تکلیف done شد
    const asg = A.sql
      .prepare(`SELECT status FROM exercise_assignments WHERE exercise_id = ?`)
      .all(exerciseId) as { status: string }[];
    expect(asg[0].status).toBe('done');

    // اعلان بازگشت به علی (کانال internal — بدون توکن بله) با dedup
    const notes = A.sql
      .prepare(`SELECT template, status, recipient, dedup_key FROM notifications WHERE template = 'homework_returned'`)
      .all() as { template: string; status: string; recipient: string; dedup_key: string }[];
    expect(notes.length).toBeGreaterThanOrEqual(1);
    expect(notes.some((n) => n.recipient === String(CHAT_ALI) && n.dedup_key.startsWith('hwret:'))).toBe(true);
  });

  it('سند PDF بعدی بدون تکلیف باز → پیوست به همان تکلیف (پنجرهٔ ۴۸ ساعت)', async () => {
    const res = await bot(document(CHAT_PARENT, 'FILE-2', 'باقی-صفحات.pdf', 'application/pdf'));
    expect(res.reply).toContain('دریافت شد');

    const subs = A.sql
      .prepare(`SELECT id, file_name, file_mime FROM exercise_submissions ORDER BY created_at, id`)
      .all() as { id: string; file_name: string; file_mime: string }[];
    expect(subs).toHaveLength(2);
    // هر دو ردیف موجودند (ترتیب created_at ثانیه‌ای است — با some چک می‌کنیم)
    expect(subs.some((s) => s.file_name === 'باقی-صفحات.pdf' && s.file_mime === 'application/pdf')).toBe(true);
    expect(subs.some((s) => s.file_mime === 'image/jpeg')).toBe(true);
  });

  it('تکلیف بدون پیام والد — رکورد کامل فایل در ObjectStore (D1) قابل دانلود از پنل', async () => {
    const list = await manager.get('/api/exercises/submissions?limit=50');
    expect(list.status).toBe(200);
    const items = (list.body as { data: { id: string; studentName: string; exerciseTitle: string; file: { filename: string } | null }[] }).data;
    expect(items.length).toBe(2);
    expect(items[0].studentName).toBe(studentName);
    expect(items[0].exerciseTitle).toBe(exerciseTitle);

    const dl = await manager.req('GET', `/api/exercises/submissions/${items[0].id}/file`);
    expect(dl.status).toBe(200);
    const text = typeof dl.body === 'string' ? dl.body : '';
    expect(text.length).toBeGreaterThan(0);
  });

  it('چند تکلیف باز → منوی انتخاب (sub:pick) → پیوست به انتخاب خانواده', async () => {
    // دو تمرین جدید + دو تکلیف → والد دو تکلیف باز دارد → منو
    const ex2 = await manager.post('/api/exercises', {
      title: 'تمرین دوم حلقه',
      format: 'game',
      published: true
    });
    expect(ex2.status).toBe(201);
    await sendHomeworkFromBot();
    const ex3 = await manager.post('/api/exercises', {
      title: 'تمرین سوم حلقه',
      format: 'instruction',
      published: true
    });
    expect(ex3.status).toBe(201);
    await sendHomeworkFromBot();

    // دو تکلیف باز → والد عکس می‌فرستد → منو
    const menu = await bot(photo(CHAT_PARENT, 'FILE-3'));
    expect(menu.reply).toContain('کدام تکلیف');
    expect(menu.buttons).not.toBeNull();
    expect(menu.buttons!.flat().filter((b) => b.callbackData.startsWith('sub:pick:'))).toHaveLength(2);
    const pickBtn = menu.buttons!.flat().find((b) => b.callbackData.startsWith('sub:pick:'));
    expect(pickBtn).toBeDefined();

    const done = await bot(cb(pickBtn!.callbackData, CHAT_PARENT, 20));
    expect(done.reply).toContain('دریافت شد');

    const subs = A.sql.prepare(`SELECT COUNT(*) AS c FROM exercise_submissions`).get() as { c: number };
    expect(subs.c).toBe(3);
  });

  it('دکمهٔ pick قدیمی بعد از ثبت → پیام فهرست قدیمی و دوباره‌ثبت نمی‌شود', async () => {
    const stale = await bot(cb('sub:pick:0', CHAT_PARENT, 21));
    expect(stale.reply).toContain('قدیمی');
    const subs = A.sql.prepare(`SELECT COUNT(*) AS c FROM exercise_submissions`).get() as { c: number };
    expect(subs.c).toBe(3);
  });

  it('chat بدون اتصال → پاسخ اتصال؛ والد بدون تکلیف در پنجره → پیام «تکلیف بازی ندارید»', async () => {
    const stranger = await bot(photo(CHAT_STRANGER, 'FILE-X'));
    expect(stranger.reply).toContain('متصل نیست');

    // همهٔ تکلیف‌های باقی‌مانده را قطعی می‌بندیم (مستقل از ترتیب فهرست)
    A.sql.prepare(`UPDATE exercise_assignments SET status = 'done' WHERE status = 'assigned'`).run();
    // بازگشتی‌ها را از پنجره خارج کنیم
    A.sql.prepare(`UPDATE exercise_submissions SET created_at = datetime('now', '-72 hours')`).run();
    const none = await bot(photo(CHAT_PARENT, 'FILE-Y'));
    expect(none.reply).toContain('تکلیف بازی');

    // بازگردانی زمان برای تست‌های بعدی
    A.sql.prepare(`UPDATE exercise_submissions SET created_at = datetime('now')`).run();
  });

  it('کلید قطع exercise_bank_enabled=false → پیام غیرفعال برای رسانه', async () => {
    A.sql
      .prepare(
        `INSERT INTO settings (key, value, updated_by) VALUES ('exercise_bank_enabled', 'false', '00000000-0000-0000-0000-000000000001')`
      )
      .run();
    const res = await bot(photo(CHAT_PARENT, 'FILE-Z'));
    expect(res.reply).toContain('غیرفعال');
    A.sql.prepare(`DELETE FROM settings WHERE key = 'exercise_bank_enabled'`).run();
  });

  it('تایم‌لاین: هم «تکلیف تمرین ارسال شد» و هم «نتیجهٔ تمرین بازگشت»', async () => {
    const res = await manager.get(`/api/students/${studentId}/timeline?kinds=exercise`);
    expect(res.status).toBe(200);
    // قرارداد این endpoint: data خود آرایهٔ رویدادهاست
    const events = (res.body as { data: { kind: string; title: string; subtitle: string | null }[] }).data;
    expect(events.length).toBeGreaterThanOrEqual(5);
    expect(events.every((e) => e.kind === 'exercise')).toBe(true);
    expect(events.some((e) => e.title === 'تکلیف تمرین ارسال شد' && e.subtitle === `تمرین: ${exerciseTitle}`)).toBe(true);
    expect(events.filter((e) => e.title === 'نتیجهٔ تمرین بازگشت')).toHaveLength(3);
  });

  it('متن راهنمای والد خط «ارسال نتیجهٔ تکلیف» را دارد', async () => {
    const res = await bot(tx('/help', CHAT_PARENT));
    expect(res.reply).toContain('ارسال نتیجهٔ تکلیف');
  });
});

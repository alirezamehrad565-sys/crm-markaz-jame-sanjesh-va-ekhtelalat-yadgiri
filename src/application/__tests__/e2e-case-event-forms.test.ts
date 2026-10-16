/**
 * تست‌های e2e — -timeline
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// e2e--timeline.test.ts — تایم‌لاین و گزارش‌نویسی
// فرم‌ساز انواع (RBAC + اعتبارسنجی معنایی)، ثبت رویداد از پنل (پayload + گیت نقش)،
// ویزارد بات رویداد (tl)، چک‌لیست خانواده از بات (clf) با تحلیل، وب‌فرم امن با توکن،
// تصحیح تکلیف (grade) با اعلان خانواده و رویداد تایم‌لاین، مسئول پرونده (owner)
// و نشستن همهٔ رویدادهای جدید روی تایم‌لاین دانش‌آموز.

import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestApp,
  asRole,
  createStudent,
  ALI_ID,
  WEBHOOK_SECRET
} from '../../test/harness';

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

const CHAT_MGR = 7701;
const CHAT_ALI = 7702;
const CHAT_PARENT = 7703;
const CHAT_STRANGER = 7799;

const MANAGER_NID = '3672818690';
const ALI_NID = '3149977797';

describe('فرم‌ساز انواع رویداد (پنل مدیر)', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: ReturnType<typeof asRole> extends Promise<infer T> ? T : never;
  let therapist: ReturnType<typeof asRole> extends Promise<infer T> ? T : never;
  let secretary: ReturnType<typeof asRole> extends Promise<infer T> ? T : never;

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
    therapist = await asRole(A, 'therapist');
    secretary = await asRole(A, 'secretary');
  });

  it('نوع‌های seed روز اول موجودند — شرح‌حال قدیمی غیرفعال (جایگزین: گفت‌وگوی اول)', async () => {
    const res = await manager.get('/api/case-events/types?active=true');
    expect(res.status).toBe(200);
    const keys = (res.body as { data: { key: string; category: string; familyFillable: boolean }[] }).data.map((t) => t.key);
    // «شرح حال» قدیمی با «گفت‌وگوی اول — شرح‌حال کودک» جایگزین و غیرفعال شد
    expect(keys).not.toContain('anamnesis');
    expect(keys).toContain('ce-anamnesis-v2');
    expect(keys).toContain('intervention');
    expect(keys).toContain('home_behavior');
    const behavior = (res.body as { data: { key: string; fields: { scaleMax?: number }[]; bands: { max: number }[] | null; familyFillable: boolean }[] }).data.find((t) => t.key === 'home_behavior')!;
    expect(behavior.fields).toHaveLength(8);
    expect(behavior.fields.every((f) => f.scaleMax === 3)).toBe(true);
    expect(behavior.familyFillable).toBe(true);
    expect(behavior.bands?.length).toBe(3);
  });

  it('ساخت نوع: سه نقش مرکز مجازند (فرم‌ساز همگانی — دستور کاربر) + اعتبارسنجی معنایی', async () => {
    const base = { title: 'گزارش وکسلر', category: 'session', fields: [
      { key: 'viq', label: 'هوش کلامی', type: 'number' },
      { key: 'interp', label: 'تفسیر', type: 'longtext', required: true }
    ] };
    const ok = await manager.post('/api/case-events/types', base);
    expect(ok.status).toBe(201);
    const created = (ok.body as { data: { id: string; key: string; fields: unknown[] } }).data;
    expect(created.key).toMatch(/^t-/);

    // درمانگر ۲۰۱ می‌گیرد؛ — دستور کاربر «دسترسی فرم‌ساز همگانی» → منشی هم ۲۰۱
    const th = await therapist.post('/api/case-events/types', { ...base, title: 'نوع از درمانگر' });
    expect(th.status).toBe(201);
    const sec = await secretary.post('/api/case-events/types', { ...base, title: 'نوع از منشی' });
    expect(sec.status).toBe(201);

    // select با کمتر از دو گزینه → 400
    const bad = await manager.post('/api/case-events/types', {
      title: 'بد', category: 'session', fields: [{ key: 'x', label: 'انتخاب', type: 'select', options: ['فقط یکی'] }]
    });
    expect(bad.status).toBe(400);
    // چک‌لیست با فیلد غیرنمره‌ای → 400
    const bad2 = await manager.post('/api/case-events/types', {
      title: 'بد۲', category: 'checklist', fields: [{ key: 'x', label: 'متن', type: 'text' }]
    });
    expect(bad2.status).toBe(400);
    // غیرفعال‌سازی — منشی هم مجاز
    expect((await manager.post(`/api/case-events/types/${created.id}/deactivate`, {})).status).toBe(200);
    const active = await manager.get('/api/case-events/types?active=true');
    expect((active.body as { data: { id: string }[] }).data.map((t) => t.id)).not.toContain(created.id);
  });
});

describe('ثبت رویداد از پنل + گیت‌ها + تایم‌لاین', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: ReturnType<typeof asRole> extends Promise<infer T> ? T : never;
  let therapist: ReturnType<typeof asRole> extends Promise<infer T> ? T : never;
  let secretary: ReturnType<typeof asRole> extends Promise<infer T> ? T : never;
  let studentId = '';
  let typeIdAnamnesis = '';
  let eventId = '';

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
    therapist = await asRole(A, 'therapist');
    secretary = await asRole(A, 'secretary');
    const s = await createStudent(manager, { first_name: 'آرش', last_name: 'نمونه' });
    studentId = s.id;
    const types = (await manager.get('/api/case-events/types?active=true')).body as { data: { id: string; key: string }[] };
    typeIdAnamnesis = types.data.find((t) => t.key === 'ce-anamnesis-v2')!.id; // — نسخهٔ روایی جدید
  });

  it('فیلد الزامی خالی → ۴۰۰؛ ثبت کامل → ۲۰۱ با payload برچسب‌دار', async () => {
    // منشی ثبت رویداد ندارد (تصمیم ۸ — نویسنده + مدیر)
    const denied = await secretary.post(`/api/students/${studentId}/case-events`, { eventTypeId: typeIdAnamnesis, values: {} });
    expect(denied.status).toBe(403);

    const missing = await therapist.post(`/api/students/${studentId}/case-events`, {
      eventTypeId: typeIdAnamnesis,
      values: { pregnancy_birth: 'سابقهٔ طبیعی' } // chief_complaint الزامی خالی
    });
    expect(missing.status).toBe(400);

    const ok = await therapist.post(`/api/students/${studentId}/case-events`, {
      eventTypeId: typeIdAnamnesis,
      values: {
        source: 'مادر',
        chief_complaint: 'تأخیر در تکلم؛ از سه سالگی توجه خانواده جلب شد.',
        development: 'راه‌رفتن ۱۴ ماهگی'
      }
    });
    expect(ok.status).toBe(201);
    const ev = (ok.body as { data: { id: string; status: string; payload: Record<string, { value: string; label: string }>; summary: string | null; staffName: string | null } }).data;
    eventId = ev.id;
    expect(ev.status).toBe('completed');
    expect(ev.payload.source.label).toBe('این فرم با چه کسی پر شده؟'); // — برچسب روایی فیلد منبع
    expect(ev.payload.chief_complaint.value).toContain('تأخیر در تکلم');
    expect(ev.summary).toContain('مشکل را به زبان خودتان بگویید'); // — برچسب روایی فیلد شکایت
    expect(ev.staffName).toContain('علی');
  });

  it('select خارج از گزینه‌ها → ۴۰۰؛ ویرایش توسط نویسنده؛ منشی/درمانگرِ دیگر ۴۰۳؛ مدیر آزاد', async () => {
    const bad = await therapist.post(`/api/students/${studentId}/case-events`, {
      eventTypeId: typeIdAnamnesis,
      values: { source: 'همسایه', chief_complaint: 'x' }
    });
    expect(bad.status).toBe(400);

    const edit = await therapist.patch(`/api/case-events/${eventId}`, { values: { source: 'هر دو والد', chief_complaint: 'متن ویرایش‌شده' } });
    expect(edit.status).toBe(200);
    expect((edit.body as { data: { payload: Record<string, { value: string }> } }).data.payload.source.value).toBe('هر دو والد');

    // درمانگر دیگری ندارد — secretary هم ۴۰۳ در مسیر
    expect((await secretary.patch(`/api/case-events/${eventId}`, { values: {} })).status).toBe(403);
    const mgrEdit = await manager.patch(`/api/case-events/${eventId}`, { values: { source: 'مادر', chief_complaint: 'مدیر ویرایش کرد' } });
    expect(mgrEdit.status).toBe(200);
  });

  it('لغو رویداد + رویداد لغوشده در تایم‌لاین با زیرنویس لغو', async () => {
    const created = await therapist.post(`/api/students/${studentId}/case-events`, {
      eventTypeId: typeIdAnamnesis,
      values: { source: 'مادر', chief_complaint: 'قرار بود حذف شود' }
    });
    const id2 = (created.body as { data: { id: string } }).data.id;
    const cancel = await therapist.post(`/api/case-events/${id2}/cancel`, {});
    expect(cancel.status).toBe(200);
    // لغو دوباره → ۴۰۹
    expect((await therapist.post(`/api/case-events/${id2}/cancel`, {})).status).toBe(409);

    const tl = await therapist.get(`/api/students/${studentId}/timeline?kinds=case_event`);
    expect(tl.status).toBe(200);
    const events = (tl.body as { data: { title: string; subtitle: string | null }[] }).data;
    expect(events.some((e) => e.title.includes('شرح‌حال'))).toBe(true); // — عنوان روایی
    expect(events.some((e) => e.subtitle === 'رویداد لغو شد')).toBe(true);
  });
});

describe('ویزارد بات رویداد (tl) + چک‌لیست خانواده (clf) + وب‌فرم', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: ReturnType<typeof asRole> extends Promise<infer T> ? T : never;
  let studentId = '';
  let parentNid = '';
  let checklistEventId = '';

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
    const s = await createStudent(manager, { first_name: 'سارینا', last_name: 'ویزارد' });
    studentId = s.id;
    parentNid = s.nationalId;
    // پرونده به درمانگر سپرده می‌شود — دامنهٔ «دانش‌آموزان فعال» بات را پر می‌کند
    const own = await manager.patch(`/api/students/${studentId}/owner`, { owner_staff_id: ALI_ID });
    expect(own.status).toBe(200);
    // اتصال درمانگر، مدیر و والد
    expect((await bot(A, tx(ALI_NID, CHAT_ALI))).reply).toContain('اتصال انجام شد');
    expect((await bot(A, tx(MANAGER_NID, CHAT_MGR))).reply).toContain('اتصال انجام شد');
    expect((await bot(A, tx(parentNid, CHAT_PARENT))).reply).toContain('اتصال انجام شد');
  });

  it('مسیر کامل ویزارد جلسهٔ مداخله: منوی دانش‌آموز → دسته → نوع → فیلدها → ثبت روی تایم‌لاین', async () => {
    const list = await bot(A, tx('دانش‌آموزان فعال', CHAT_ALI));
    const stuBtn = list.buttons!.findIndex((row) => row.some((b) => b.text.includes('سارینا')));
    expect(stuBtn).toBeGreaterThanOrEqual(0);
    const stuCb = list.buttons![stuBtn].find((b) => b.text.includes('سارینا'))!.callbackData;
    const idx = stuCb.split(':')[2];

    const menu = await bot(A, cb(stuCb, CHAT_ALI));
    expect(menu.buttons!.flat().some((b) => b.callbackData === `stu:tl:${idx}`)).toBe(true);

    const cats = await bot(A, cb(`stu:tl:${idx}`, CHAT_ALI));
    expect(cats.reply).toContain('دستهٔ رویداد');

    const types = await bot(A, cb(`tl:types:${idx}:session`, CHAT_ALI));
    const interventionBtn = types.buttons!.flat().find((b) => b.text.includes('گزارش جلسهٔ مداخله'))!;
    expect(interventionBtn).toBeTruthy();
    const startCb = interventionBtn.callbackData;

    const f1 = await bot(A, cb(startCb, CHAT_ALI));
    expect(f1.reply).toContain('هدف جلسه');
    // فیلد متنی — با پیام آزاد
    const f2 = await bot(A, tx('بهبود دامنهٔ توجه با بازی ساختنی', CHAT_ALI));
    expect(f2.reply).toContain('فعالیت‌های انجام‌شده');
    const f3 = await bot(A, tx('سه تمرین تطبیق شکل انجام شد و کودک تا پایان همکاری داشت.', CHAT_ALI));
    expect(f3.reply).toContain('عملکرد کودک');
    const f4 = await bot(A, tx('پیشرفت محسوس نسبت به جلسهٔ قبل؛ تحمل ناکامی بهتر شد.', CHAT_ALI));
    // مشارکت — دکمهٔ نمره (scale 5)
    expect(f4.buttons!.flat().map((b) => b.callbackData)).toContain('tl:opt:4');
    const f5 = await bot(A, cb('tl:opt:4', CHAT_ALI));
    expect(f5.reply).toContain('تکلیف خانه');
    const f6 = await bot(A, cb('tl:skip', CHAT_ALI));
    expect(f6.reply).toContain('توصیه به خانواده');
    const confirm = await bot(A, tx('روزانه ده دقیقه بازی با بلوک‌های رنگی.', CHAT_ALI));
    expect(confirm.reply).toContain('جمع‌بندی');
    expect(confirm.buttons!.flat().some((b) => b.callbackData === 'tl:do')).toBe(true);

    const done = await bot(A, cb('tl:do', CHAT_ALI));
    expect(done.reply).toContain('رویداد ثبت شد');

    // رویداد واقعاً ساخته شده و روی تایم‌لاین است
    const tl = await manager.get(`/api/students/${studentId}/timeline?kinds=case_event`);
    const events = (tl.body as { data: { title: string; subtitle: string | null; actor: string | null }[] }).data;
    const ev = events.find((e) => e.title.includes('گزارش جلسهٔ مداخله'));
    expect(ev).toBeTruthy();
    expect(ev!.subtitle).toContain('هدف جلسه');
    expect(ev!.actor).toContain('علی');
  });

  it('/cancel در میانهٔ ویزارد فرم را لغو می‌کند', async () => {
    const list = await bot(A, tx('دانش‌آموزان فعال', CHAT_ALI));
    const stuCb = list.buttons!.flat().find((b) => b.callbackData.startsWith('stu:menu:'))!.callbackData;
    const idx = stuCb.split(':')[2];
    await bot(A, cb(stuCb, CHAT_ALI));
    await bot(A, cb(`stu:tl:${idx}`, CHAT_ALI));
    const types = await bot(A, cb(`tl:types:${idx}:session`, CHAT_ALI));
    const startCb = types.buttons!.flat().find((b) => b.callbackData.startsWith('tl:start:'))!.callbackData;
    await bot(A, cb(startCb, CHAT_ALI));
    const canceled = await bot(A, tx('/cancel', CHAT_ALI));
    expect(canceled.reply).toContain('لغو شد');
    // فرم دیگر فعال نیست — متن آزاد نادیده
    const after = await bot(A, tx('متن بی‌هدف', CHAT_ALI));
    expect(after.handled === false || after.reply === null).toBe(true);
  });

  it('ثبت چک‌لیست از بات → وضعیت در انتظار خانواده + اعلان به ولیّ + «چک‌لیست‌های من» والد', async () => {
    const list = await bot(A, tx('دانش‌آموزان فعال', CHAT_ALI));
    const stuCb = list.buttons!.flat().find((b) => b.callbackData.startsWith('stu:menu:'))!.callbackData;
    const idx = stuCb.split(':')[2];
    await bot(A, cb(stuCb, CHAT_ALI));
    await bot(A, cb(`stu:tl:${idx}`, CHAT_ALI));
    const types = await bot(A, cb(`tl:types:${idx}:checklist`, CHAT_ALI));
    expect(types.buttons!.flat().some((b) => b.text.includes('مشاهدهٔ رفتار در خانه'))).toBe(true); // — عنوان روایی
    const startCb = types.buttons!.flat().find((b) => b.callbackData.startsWith('tl:start:'))!.callbackData;
    const confirm = await bot(A, cb(startCb, CHAT_ALI));
    expect(confirm.reply).toContain('در انتظار پاسخ خانواده');
    const done = await bot(A, cb('tl:do', CHAT_ALI));
    expect(done.reply).toContain('اطلاع‌رسانی شد');

    // رویداد در انتظار در DB
    const rows = A.sql.prepare(`SELECT id, status FROM case_events WHERE student_id = ? AND status = 'pending_family'`).all(studentId) as { id: string; status: string }[];
    expect(rows).toHaveLength(1);
    checklistEventId = rows[0].id;

    // اعلان به والد ارسال شده (internal channel — رکورد sent)
    const notif = A.sql.prepare(`SELECT template, status FROM notifications WHERE template = 'bot_checklist_assigned' AND student_id = ?`).all(studentId) as { template: string; status: string }[];
    expect(notif.length).toBeGreaterThanOrEqual(1);
    expect(notif[0].status).toBe('sent');

    // خانواده: دکمهٔ کیبورد «چک‌لیست‌های من»
    const mine = await bot(A, tx('چک‌لیست‌های من', CHAT_PARENT));
    expect(mine.reply).toContain('چک‌لیست‌های در انتظار');
    const fillBtn = mine.buttons!.flat().find((b) => b.callbackData === `clf:fill:${checklistEventId}`);
    expect(fillBtn).toBeTruthy();
  });

  it('گیت خانواده: چت غیرمتصل نمی‌تواند چک‌لیست را باز کند', async () => {
    const denied = await bot(A, cb(`clf:fill:${checklistEventId}`, CHAT_STRANGER));
    expect(denied.reply).toContain('متصل');
  });

  it('پر کردن کامل هشت آیتمی در بات → تحلیل امتیاز/باند + اعلان به درمانگر + تایم‌لاین', async () => {
    const start = await bot(A, cb(`clf:fill:${checklistEventId}`, CHAT_PARENT));
    expect(start.reply).toContain('آیتم ۱ از ۸');
    // پاسخ‌ها: ۳،۲،۱،۰،۳،۲،۱،۰ → جمع ۱۲ → باند «نیاز به توجه و پیگیری»
    const answers = [3, 2, 1, 0, 3, 2, 1, 0];
    let last: BotResponse = start;
    for (let i = 0; i < answers.length; i++) {
      last = await bot(A, cb(`clf:a:${answers[i]}`, CHAT_PARENT));
      if (i < answers.length - 1) {
        expect(last.reply).toContain(`آیتم ${['۲', '۳', '۴', '۵', '۶', '۷', '۸'][i]} از ۸`);
      }
    }
    expect(last.reply).toContain('جمع‌بندی');
    const done = await bot(A, cb('clf:do', CHAT_PARENT));
    expect(done.reply).toContain('ثبت شد');

    // وضعیت + تحلیل در DB
    const row = A.sql.prepare(`SELECT status, analysis FROM case_events WHERE id = ?`).get(checklistEventId) as { status: string; analysis: string };
    expect(row.status).toBe('completed');
    const analysis = JSON.parse(row.analysis) as { score: number; band: string; answered: number; total: number };
    expect(analysis.score).toBe(12);
    expect(analysis.band).toBe('نیاز به توجه و پیگیری');
    expect(analysis.answered).toBe(8);

    // اعلان نتیجه به درمانگر ثبت‌کننده (chat ALI)
    const resultNotif = A.sql.prepare(`SELECT template, status FROM notifications WHERE template = 'bot_checklist_result' AND student_id = ?`).all(studentId) as { template: string; status: string }[];
    expect(resultNotif.length).toBeGreaterThanOrEqual(1);

    // تایم‌لاین: رویداد با امتیاز
    const tl = await manager.get(`/api/students/${studentId}/timeline?kinds=case_event`);
    const events = (tl.body as { data: { title: string; subtitle: string | null; actor: string | null }[] }).data;
    const filled = events.find((e) => e.subtitle?.includes('امتیاز'));
    expect(filled).toBeTruthy();
    expect(filled!.subtitle).toContain('۱۲');
    expect(filled!.subtitle).toContain('نیاز به توجه و پیگیری');
    expect(filled!.actor).toBe('خانواده');

    // پر کردن دوباره → چک‌لیست‌های من خالی + clf_fill رد می‌شود
    const mine = await bot(A, tx('چک‌لیست‌های من', CHAT_PARENT));
    expect(mine.reply).toContain('در انتظاری');
    const again = await bot(A, cb(`clf:fill:${checklistEventId}`, CHAT_PARENT));
    expect(again.reply).toContain('قبلاً');
  });

  it('وب‌فرم امن: توکن غلط ۴۰۳، صفحهٔ HTML ۲۰۰، ثبت با توکن درست، تک‌مصرف', async () => {
    // چک‌لیست بلند مصنوعی (بیش از ۸ آیتم) بسازیم تا مسیر وب فعال شود
    const longType = await manager.post('/api/case-events/types', {
      title: 'چک‌لیست بلند آزمایشی',
      category: 'checklist',
      familyFillable: true,
      fields: Array.from({ length: 10 }, (_, i) => ({ key: `i${i + 1}`, label: `آیتم ${i + 1}`, type: 'scale', scaleMax: 3 })),
      bands: [{ max: 10, label: 'مطلوب' }, { max: 20, label: 'توجه' }, { max: 30, label: 'جدی' }]
    });
    expect(longType.status).toBe(201);
    const typeId = (longType.body as { data: { id: string } }).data.id;

    const created = await manager.post(`/api/students/${studentId}/case-events`, { eventTypeId: typeId, values: {} });
    expect(created.status).toBe(201);
    const webEventId = (created.body as { data: { id: string } }).data.id;

    const tokenRow = A.sql.prepare(`SELECT fill_token FROM case_events WHERE id = ?`).get(webEventId) as { fill_token: string };
    expect(tokenRow.fill_token).toBeTruthy();

    // توکن غلط → 403
    const wrong = await A.app.request(`/public/case-events/${webEventId}/fill?token=wrong-token-123`);
    expect(wrong.status).toBe(403);

    // صفحهٔ HTML
    const page = await A.app.request(`/public/case-events/${webEventId}/fill?token=${tokenRow.fill_token}`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('چک‌لیست بلند آزمایشی');
    expect(html).toContain('آیتم 10');

    // POST درست
    const answers: Record<string, number> = {};
    for (let i = 1; i <= 10; i++) answers[`i${i}`] = 2; // جمع ۲۰ → «توجه»
    const post = await A.app.request(`/public/case-events/${webEventId}/fill`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: tokenRow.fill_token, answers })
    });
    expect(post.status).toBe(200);

    // تک‌مصرف — POST دوباره → 409
    const post2 = await A.app.request(`/public/case-events/${webEventId}/fill`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: tokenRow.fill_token, answers })
    });
    expect(post2.status).toBe(409);

    const row = A.sql.prepare(`SELECT status, analysis FROM case_events WHERE id = ?`).get(webEventId) as { status: string; analysis: string };
    expect(row.status).toBe('completed');
    expect((JSON.parse(row.analysis) as { score: number; band: string }).band).toBe('توجه');
  });
});

describe('c — تصحیح تکلیف + مسئول پرونده', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: ReturnType<typeof asRole> extends Promise<infer T> ? T : never;
  let therapist: ReturnType<typeof asRole> extends Promise<infer T> ? T : never;
  let studentId = '';
  let assignmentId = '';

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
    therapist = await asRole(A, 'therapist');
    const s = await createStudent(manager, { first_name: 'کوروش', last_name: 'تصحیح' });
    studentId = s.id;
    // اتصال درمانگر و والد
    expect((await bot(A, tx(ALI_NID, CHAT_ALI))).reply).toContain('اتصال انجام شد');
    expect((await bot(A, tx(s.nationalId, CHAT_PARENT))).reply).toContain('اتصال انجام شد');
    // پرونده به درمانگر سپرده می‌شود (دامنهٔ فهرست بات)
    expect((await manager.patch(`/api/students/${studentId}/owner`, { owner_staff_id: ALI_ID })).status).toBe(200);

    // تمرین + تکلیف از بات درمانگر (همان موتور )
    const ex = await therapist.post('/api/exercises', {
      title: 'کاربرگ تصحیح m65', description: null, format: 'worksheet', published: true
    });
    expect(ex.status).toBe(201);
    const exerciseId = (ex.body as { data: { id: string } }).data.id;

    const list = await bot(A, tx('دانش‌آموزان فعال', CHAT_ALI));
    const stuCb = list.buttons!.flat().find((b) => b.text.includes('کوروش'))!.callbackData;
    const idx = stuCb.split(':')[2];
    await bot(A, cb(stuCb, CHAT_ALI));
    const send = await bot(A, cb(`stu:send:${idx}:1`, CHAT_ALI));
    const pickCb = send.buttons!.flat().find((b) => b.text.includes('کاربرگ تصحیح m65'))!.callbackData;
    await bot(A, cb(pickCb, CHAT_ALI));
    const yes = await bot(A, cb(pickCb.replace('stu:pick:', 'stu:yes:'), CHAT_ALI));
    expect(yes.reply).toContain('ارسال شد');

    const asgRow = A.sql.prepare(`SELECT id FROM exercise_assignments WHERE student_id = ? ORDER BY created_at DESC LIMIT 1`).get(studentId) as { id: string };
    assignmentId = asgRow.id;
  });

  it('تصحیح تکلیف assigned → ۴۰۹؛ پس از بازگشت → corrected + بازخورد + اعلان خانواده', async () => {
    // هنوز done نیست
    const early = await therapist.post(`/api/exercises/assignments/${assignmentId}/grade`, { feedback: 'خیلی خوب بود' });
    expect(early.status).toBe(409);

    // بازگشت خانواده (دامنه — الگوی submissions.test)
    const { MockD1 } = await import('../../test/mock-d1');
    const { createDb } = await import('@core/db');
    const { createExerciseBankService } = await import('@domain/exercise-bank');
    const { createAuditWriter } = await import('@core/audit');
    const { createD1ObjectStore } = await import('@core/storage');
    const svc = createExerciseBankService({
      db: createDb(new MockD1(A.sql) as unknown as D1Database),
      audit: createAuditWriter(createDb(new MockD1(A.sql) as unknown as D1Database)),
      logger: { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined, child: () => ({ debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined, child: () => ({ debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined }) }) } as never,
      storage: createD1ObjectStore(createDb(new MockD1(A.sql) as unknown as D1Database)),
      downloadSecret: 'x'
    });
    const b64 = (u8: Uint8Array) => { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s); };
    await svc.addSubmission(
      { assignmentId, studentId, file: { filename: 'javab.jpg', mimeType: 'image/jpeg', contentB64: b64(new Uint8Array([9, 9])) }, sourceChatId: String(CHAT_PARENT) },
      { staffId: 'family', email: 'f@x', role: 'manager', displayName: 'خانواده' }
    );

    // بازخورد خیلی کوتاه → 400
    const short = await therapist.post(`/api/exercises/assignments/${assignmentId}/grade`, { feedback: 'خ' });
    expect(short.status).toBe(400);

    const ok = await therapist.post(`/api/exercises/assignments/${assignmentId}/grade`, { feedback: 'صفحهٔ اول عالی بود؛ تمرین تطبیق را تکرار کنید.' });
    expect(ok.status).toBe(200);
    const rec = (ok.body as { data: { status: string; feedback: string; gradedByName: string | null } }).data;
    expect(rec.status).toBe('corrected');
    expect(rec.feedback).toContain('عالی');
    expect(rec.gradedByName).toContain('علی');

    // تصحیح دوباره → 409
    expect((await therapist.post(`/api/exercises/assignments/${assignmentId}/grade`, { feedback: 'دوباره' })).status).toBe(409);

    // اعلان homework_graded به والد
    const notif = A.sql.prepare(`SELECT template, status, payload FROM notifications WHERE template = 'homework_graded' AND student_id = ?`).all(studentId) as { template: string; status: string; payload: string }[];
    expect(notif.length).toBeGreaterThanOrEqual(1);
    expect(notif[0].status).toBe('sent');
    expect(notif[0].payload).toContain('عالی');

    // audit فقط طول بازخورد (بدون متن) — §20
    const audits = A.sql.prepare(`SELECT changes FROM audit_log WHERE action = 'exercise.corrected' AND resource_id = ?`).all(assignmentId) as { changes: string }[];
    expect(audits.length).toBe(1);
    expect(audits[0].changes).not.toContain('عالی');

    // تایم‌لاین: «تمرین تصحیح شد»
    const tl = await manager.get(`/api/students/${studentId}/timeline?kinds=exercise`);
    const events = (tl.body as { data: { title: string }[] }).data;
    expect(events.some((e) => e.title === 'تمرین تصحیح شد')).toBe(true);
  });

  it('مسئول پرونده: PATCH فقط منشی/مدیر؛ GET نام را برمی‌گرداند؛ دامنهٔ درمانگر شامل پروندهٔ تحت مسئولیت؛ تایم‌لاین', async () => {
    const denied = await therapist.patch(`/api/students/${studentId}/owner`, { owner_staff_id: ALI_ID });
    expect(denied.status).toBe(403);

    const ok = await manager.patch(`/api/students/${studentId}/owner`, { owner_staff_id: ALI_ID });
    expect(ok.status).toBe(200);
    expect((ok.body as { data: { ownerStaffId: string | null; ownerName: string | null } }).data.ownerName).toContain('علی');

    // هم‌مقدار → no-op بدون audit
    const auditsBefore = (A.sql.prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE action = 'student.owner.changed' AND resource_id = ?`).get(studentId) as { n: number }).n;
    await manager.patch(`/api/students/${studentId}/owner`, { owner_staff_id: ALI_ID });
    const auditsAfter = (A.sql.prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE action = 'student.owner.changed' AND resource_id = ?`).get(studentId) as { n: number }).n;
    expect(auditsAfter).toBe(auditsBefore);

    // دامنهٔ درمانگر: «دانش‌آموزان من» پنل شامل پروندهٔ تحت مسئولیت (بدون سابقهٔ نوبت)
    const mine = await therapist.get('/api/appointments/my-students');
    expect((mine.body as { data: { id: string }[] }).data.map((s) => s.id)).toContain(studentId);

    // فهرست بات هم همین دانش‌آموز را دارد (proندهٔ تحت مسئولیت)
    const list = await bot(A, tx('دانش‌آموزان فعال', CHAT_ALI));
    expect(list.buttons!.flat().some((b) => b.text.includes('کوروش'))).toBe(true);

    // تایم‌لاین: «مسئول پرونده تغییر کرد»
    const tl = await manager.get(`/api/students/${studentId}/timeline`);
    const events = (tl.body as { data: { title: string; subtitle: string | null }[] }).data;
    const ownerEv = events.find((e) => e.title === 'مسئول پرونده تغییر کرد');
    expect(ownerEv).toBeTruthy();
    expect(ownerEv!.subtitle).toContain('علی');

    // برداشتن مسئول
    const clear = await manager.patch(`/api/students/${studentId}/owner`, { owner_staff_id: null });
    expect(clear.status).toBe(200);
    expect((clear.body as { data: { ownerName: string | null } }).data.ownerName).toBeNull();
  });
});

describe('پارس callbackها و قالب‌های جدید', () => {
  it('parseTlCallback / parseClfCallback — معتبر و نامعتبر', async () => {
    const { parseTlCallback, parseClfCallback } = await import('@core/notify/bale/webhook');
    expect(parseTlCallback('tl:cat:2', '100')?.kind).toBe('tl_cat');
    expect(parseTlCallback('tl:types:1:checklist', '100')).toMatchObject({ kind: 'tl_types', stuIdx: 1, cat: 'checklist' });
    expect(parseTlCallback('tl:start:0:3', '100')).toMatchObject({ kind: 'tl_start', stuIdx: 0, typeIdx: 3 });
    expect(parseTlCallback('tl:opt:4', '100')).toMatchObject({ kind: 'tl_opt', value: 4 });
    expect(parseTlCallback('tl:skip', '100')?.kind).toBe('tl_skip');
    expect(parseTlCallback('tl:do', '100')?.kind).toBe('tl_do');
    expect(parseTlCallback('tl:bad', '100')).toBeNull();
    expect(parseClfCallback('clf:fill:6f1a2b3c-1111-4222-8333-444455556666', '200')).toMatchObject({ kind: 'clf_fill' });
    expect(parseClfCallback('clf:fill:short', '200')).toBeNull();
    expect(parseClfCallback('clf:a:3', '200')).toMatchObject({ kind: 'clf_a', value: 3 });
    expect(parseClfCallback('clf:no', '200')?.kind).toBe('clf_no');
  });

  it('قالب‌های bot_checklist_assigned / bot_checklist_result / homework_graded رندر می‌شوند', async () => {
    const { renderTemplate } = await import('@core/notify');
    const assigned = renderTemplate('bot_checklist_assigned', { studentName: 'آوا', formTitle: 'چک‌لیست خواب', extra: 'تعداد آیتم‌ها: ۶', clinicName: 'مرکز' });
    expect(assigned).toContain('چک‌لیست خانگی جدید');
    expect(assigned).toContain('چک‌لیست خواب');
    const result = renderTemplate('bot_checklist_result', { formTitle: 'چک‌لیست خواب', studentName: 'آوا', score: '۱۲', band: 'نیاز به توجه', clinicName: 'مرکز' });
    expect(result).toContain('امتیاز: ۱۲');
    expect(result).toContain('نیاز به توجه');
    const graded = renderTemplate('homework_graded', { exerciseTitle: 'کاربرگ ۲', feedback: 'خیلی خوب بود', clinicName: 'مرکز' });
    expect(graded).toContain('تصحیح شد');
    expect(graded).toContain('خیلی خوب بود');
  });
});

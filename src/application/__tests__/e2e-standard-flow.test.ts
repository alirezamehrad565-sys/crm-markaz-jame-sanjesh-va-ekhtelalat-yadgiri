/**
 * تست‌های e2e — -standard-flow
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// e2e--standard-flow.test.ts — جریان استاندارد پرونده
// ادغام assessments در case-events (seed مهاجرت + وکسلر)، چرخهٔ پیش‌نویس/نهایی‌سازی،
// هوک «اقدام بعدی» (پیگیری خودکار)، گزارش متصل به نوبت (+ batch)،
// نمای چرخهٔ پرونده در بات (تاریخچه/چک‌لیست‌های او/نتایج خانواده) و صفحه‌بندی فهرست.

import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestApp,
  asRole,
  createStudent,
  apptBody,
  quarterHourFromNow,
  ALI_ID,
  WEBHOOK_SECRET
} from '../../test/harness';
import { renderTemplate } from '@core/notify';
import { TIMELINE_KINDS } from '@app/student-timeline';
import { parseBotUpdate } from '@core/notify';

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

const tx = (t: string, chatId: number, updateId = 1): Update => ({ update_id: updateId, message: { chat: { id: chatId }, text: t } });
const cb = (data: string, chatId: number, updateId = 2): Update => ({
  update_id: updateId,
  callback_query: { id: updateId, data, message: { chat: { id: chatId } } }
});

const CHAT_ALI = 8702;
const CHAT_PARENT = 8703;
const ALI_NID = '3149977797';

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

// ───────────── پنل — seedها + چرخهٔ پیش‌نویس + هوک اقدام بعدی ─────────────

describe('کاتالوگ انواع: seed مهاجرت + وکسلر', () => {
  it('types شامل «ارزیابی بالینی (سند قدیم)» و «پروندهٔ وکسلر» است (فرم‌ساز بدون انتشار نسخه)', async () => {
    const A = createTestApp();
    const m = await asRole(A, 'manager');
    const types = dataOf<Array<{ key: string; title: string; category: string; fields: Array<{ key: string }> }>>(
      await m.get('/api/case-events/types')
    );
    const legacy = types.find((t) => t.key === 'legacy_assessment');
    expect(legacy).toBeTruthy();
    expect(legacy!.title).toContain('ارزیابی');
    // فرم قدیمی وکسلر (0042) با 0054 بازنشسته شد — از فهرست حذف است (رفتار فاز بهبود §۱۰.۱)
    const wechsler = types.find((t) => t.key === 'wechsler');
    expect(wechsler).toBeUndefined();
    // فرم مرجع وکسلر ۴ (0050 + تکمیل 0054) فیلدهای واقعی ثبت خام دارد — از جمله «اقدام بعدی»
    const w4 = types.find((t) => t.key === 'ce-wechsler-w4-v1');
    expect(w4).toBeTruthy();
    expect(w4!.fields.some((f) => f.key === 'raw_si')).toBe(true);
    expect(w4!.fields.some((f) => f.key === 'test_date')).toBe(true);
    expect(w4!.fields.some((f) => f.key === 'next_action')).toBe(true);
  });

  it('whitelist تایم‌لاین — kind «assessment» حذف و «case_event/committee» حاضرند', () => {
    expect(TIMELINE_KINDS.includes('assessment' as never)).toBe(false);
    expect(TIMELINE_KINDS.includes('case_event')).toBe(true);
    expect(TIMELINE_KINDS.includes('committee')).toBe(true);
  });
});

describe('چرخهٔ پیش‌نویس/نهایی‌سازی + هوک اقدام بعدی', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: ReturnType<typeof asRole> extends Promise<infer T> ? T : never;
  let therapist: ReturnType<typeof asRole> extends Promise<infer T> ? T : never;
  let studentId = '';
  let wechslerTypeId = '';

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
    therapist = await asRole(A, 'therapist');
    const s = await createStudent(manager, { first_name: 'ارسیا', last_name: 'واستاندارد' });
    studentId = s.id;
    const types = dataOf<Array<{ key: string; id: string }>>(await manager.get('/api/case-events/types?active=true'));
    // فرم قدیمی وکسلر با 0054 بازنشسته شد — چرخهٔ پیش‌نویس/نهایی‌سازی با یک نوع فرم‌سازِ تستی با
    // «اقدام بعدی» الزامی (select شامل «پیگیری») انجام می‌شود؛ رفتار هوک بدون وابستگی به میراث
    const created = dataOf<{ id: string }>(await manager.post('/api/case-events/types', {
      title: 'فرم تست اقدام بعدی',
      category: 'session',
      familyFillable: false,
      fields: [
        { key: 'note', label: 'یادداشت جلسه', type: 'text' },
        { key: 'next_action', label: 'اقدام بعدی', type: 'select', options: ['هیچ', 'پیگیری', 'نوبت بعدی'], required: true }
      ]
    }));
    wechslerTypeId = created.id;
    expect(types.some((t) => t.key === 'ce-wechsler-w4-v1')).toBe(true);
  });

  it('پیش‌نویس: فیلد الزامی خالی می‌ماند → 201 draft', async () => {
    const res = await therapist.post(`/api/students/${studentId}/case-events`, {
      eventTypeId: wechslerTypeId,
      draft: true,
      values: {}
    });
    expect(res.status).toBe(201);
    expect(dataOf<{ status: string }>(res).status).toBe('draft');
  });

  it('نهایی‌سازی با الزامی خالی → 400؛ پس از پر کردن → completed؛ دوباره → 409', async () => {
    const events = dataOf<Array<{ id: string; status: string }>>(
      await manager.get(`/api/students/${studentId}/case-events?limit=50`)
    );
    const draft = events.find((e) => e.status === 'draft')!;
    expect(draft).toBeTruthy();

    const early = await therapist.post(`/api/case-events/${draft.id}/finalize`, {});
    expect(early.status).toBe(400);

    const patch = await therapist.patch(`/api/case-events/${draft.id}`, {
      values: { note: 'جلسهٔ نمونه', next_action: 'پیگیری' }
    });
    expect(patch.status).toBe(200);

    const fin = await therapist.post(`/api/case-events/${draft.id}/finalize`, {});
    expect(fin.status).toBe(200);
    expect(dataOf<{ status: string }>(fin).status).toBe('completed');

    const again = await therapist.post(`/api/case-events/${draft.id}/finalize`, {});
    expect(again.status).toBe(409);
  });

  it('هوک «اقدام بعدی = پیگیری» — پیگیری خودکار متصل به همین رویداد ساخته شد', async () => {
    const fus = dataOf<Array<{ entityType: string; entityId: string; title: string; status: string }>>(
      await manager.get(`/api/followups?student_id=${studentId}&group=all`)
    );
    const hook = fus.find((f) => f.entityType === 'case_event');
    expect(hook).toBeTruthy();
    expect(hook!.title).toContain('پیگیری اقدام بعدی');
    expect(hook!.status === 'open' || hook!.status === 'in_progress').toBe(true);
  });

  it('پیوست گزارش: آپلود → فهرست → حذف (الگوی )', async () => {
    const events = dataOf<Array<{ id: string }>>(
      await manager.get(`/api/students/${studentId}/case-events?limit=50`)
    );
    const evId = events[0]!.id;
    const content = Buffer.from('پروندهٔ وکسلر نمونه').toString('base64');
    const add = await therapist.post(`/api/case-events/${evId}/files`, {
      filename: 'wechsler.pdf',
      mime_type: 'application/pdf',
      content_b64: content
    });
    expect(add.status).toBe(201);
    const fileId = dataOf<{ id: string }>(add).id;

    const list = await manager.get(`/api/case-events/${evId}/files`);
    expect((list.body as { data: unknown[] }).data.length).toBe(1);

    const dl = await therapist.get(`/api/case-events/${evId}/files/${fileId}`);
    expect(dl.status).toBe(200);
    expect(String(dl.body)).toContain('وکسلر');

    const del = await therapist.delete(`/api/case-events/${evId}/files/${fileId}`);
    expect(del.status).toBe(200);
    const after = await manager.get(`/api/case-events/${evId}/files`);
    expect((after.body as { data: unknown[] }).data.length).toBe(0);
  });
});

describe('گزارش متصل به نوبت + batch', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: ReturnType<typeof asRole> extends Promise<infer T> ? T : never;
  let therapist: ReturnType<typeof asRole> extends Promise<infer T> ? T : never;
  let studentId = '';
  let typeId = '';
  let appointmentId = '';

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
    therapist = await asRole(A, 'therapist');
    const s = await createStudent(manager, { first_name: 'بهار', last_name: 'ونوبت' });
    studentId = s.id;
    const types = dataOf<Array<{ key: string; id: string }>>(await manager.get('/api/case-events/types?active=true'));
    typeId = types.find((t) => t.key === 'intervention')!.id;

    // نوبتِ یک ساعت پیش (روی شبکهٔ ۱۵ دقیقه‌ای) با همان دانش‌آموز
    const start = quarterHourFromNow(-60);
    const appt = await manager.post('/api/appointments', apptBody(ALI_ID, start, 45, [studentId]));
    expect(appt.status).toBe(201);
    appointmentId = dataOf<{ id: string }>(appt).id;
  });

  it('ثبت گزارش با appointmentId → فهرست رویدادهای نوبت آن را برمی‌گرداند', async () => {
    const res = await therapist.post(`/api/students/${studentId}/case-events`, {
      eventTypeId: typeId,
      appointmentId,
      values: { goal: 'تقویت توالی حرکتی', activities: 'مسیر مانع‌پیما' }
    });
    expect(res.status).toBe(201);
    const ev = dataOf<{ id: string; appointmentId: string | null }>(res);
    expect(ev.appointmentId).toBe(appointmentId);

    const list = await manager.get(`/api/appointments/${appointmentId}/case-events`);
    expect((list.body as { data: unknown[] }).data.length).toBe(1);
  });

  it('batch by-appointments — نگاشت appointmentId → رویدادها', async () => {
    const res = await manager.get(`/api/case-events/by-appointments?ids=${appointmentId}`);
    expect(res.status).toBe(200);
    const map = (res.body as { data: Record<string, unknown[]> }).data;
    expect(Array.isArray(map[appointmentId])).toBe(true);
    expect(map[appointmentId]!.length).toBe(1);
  });
});

// ───────────── بات — نمای چرخهٔ پرونده + صفحه‌بندی ─────────────

describe('بات: تاریخچه/چک‌لیست‌های او/صفحه‌بندی/نتایج خانواده', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: ReturnType<typeof asRole> extends Promise<infer T> ? T : never;
  let studentId = '';
  let parentNid = '';

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
    const s = await createStudent(manager, { first_name: 'سام', last_name: 'وبات' });
    studentId = s.id;
    parentNid = s.nationalId;
    const own = await manager.patch(`/api/students/${studentId}/owner`, { owner_staff_id: ALI_ID });
    expect(own.status).toBe(200);
    expect((await bot(A, tx(ALI_NID, CHAT_ALI))).reply).toContain('اتصال انجام شد');
    expect((await bot(A, tx(parentNid, CHAT_PARENT))).reply).toContain('اتصال انجام شد');
  });

  async function openMenu(): Promise<{ idx: string }> {
    const list = await bot(A, tx('دانش‌آموزان فعال', CHAT_ALI));
    const stuCb = list.buttons!.flat().find((b) => b.callbackData.startsWith('stu:menu:'))!.callbackData;
    const idx = stuCb.split(':')[2];
    const menu = await bot(A, cb(stuCb, CHAT_ALI, 30));
    expect(menu.buttons!.flat().some((b) => b.callbackData === `stu:hist:${idx}`)).toBe(true);
    expect(menu.buttons!.flat().some((b) => b.callbackData === `stu:ckl:${idx}`)).toBe(true);
    return { idx };
  }

  it('«تاریخچه» — خالی → راهنمای ثبت؛ دکمهٔ ثبت رویداد دارد', async () => {
    const { idx } = await openMenu();
    const h = await bot(A, cb(`stu:hist:${idx}`, CHAT_ALI, 31));
    expect(h.reply).toContain('هنوز رویدادی');
    expect(h.buttons!.flat().some((b) => b.callbackData === `stu:tl:${idx}`)).toBe(true);
  });

  it('«چک‌لیست‌های او» — خالی → راهنمای ساخت؛ پس از ساخت → در انتظار پاسخ', async () => {
    const { idx } = await openMenu();
    const c0 = await bot(A, cb(`stu:ckl:${idx}`, CHAT_ALI, 32));
    expect(c0.reply).toContain('چک‌لیست');

    // ساخت چک‌لیست از ویزارد
    await bot(A, cb(`stu:tl:${idx}`, CHAT_ALI, 33));
    const types = await bot(A, cb(`tl:types:${idx}:checklist`, CHAT_ALI, 34));
    const startCb = types.buttons!.flat().find((b) => b.callbackData.startsWith('tl:start:'))!.callbackData;
    await bot(A, cb(startCb, CHAT_ALI, 35));
    const done = await bot(A, cb('tl:do', CHAT_ALI, 36));
    expect(done.reply).toContain('رویداد ثبت شد');

    // ویزارد state را پاک می‌کند — فهرست دوباره باز می‌شود (الگوی )
    const relist = await bot(A, tx('دانش‌آموزان فعال', CHAT_ALI, 361));
    const stuCb2 = relist.buttons!.flat().find((b) => b.callbackData.startsWith('stu:menu:'))!.callbackData;
    const idx2 = stuCb2.split(':')[2];
    await bot(A, cb(stuCb2, CHAT_ALI, 362));
    const c1 = await bot(A, cb(`stu:ckl:${idx2}`, CHAT_ALI, 37));
    expect(c1.reply).toContain('در انتظار پاسخ خانواده');
  });

  it('خانواده: «چک‌لیست‌های من» پس از پاسخ → نتیجه با امتیاز در همان فهرست', async () => {
    // والد پاسخ می‌دهد
    const list = await bot(A, tx('چک‌لیست‌های من', CHAT_PARENT));
    const fillBtn = list.buttons!.flat().find((b) => b.callbackData.startsWith('clf:fill:'))!;
    expect(fillBtn).toBeTruthy();
    const eventId = fillBtn.callbackData.split(':')[2];
    await bot(A, cb(fillBtn.callbackData, CHAT_PARENT, 40));
    // ۸ آیتم چک‌لیست رفتار — همه ۰
    for (let i = 0; i < 8; i++) await bot(A, cb('clf:a:0', CHAT_PARENT, 41 + i));
    const sent = await bot(A, cb('clf:do', CHAT_PARENT, 60));
    expect(sent.reply).toContain('پاسخ‌های شما ثبت شد');

    const again = await bot(A, tx('چک‌لیست‌های من', CHAT_PARENT));
    expect(again.reply).toContain('آخرین نتایج');
    expect(again.reply).toContain(eventId.slice(0, 1) === '' ? '—' : 'امتیاز');
  });

  it('صفحه‌بندی «دانش‌آموزان فعال» — stu:list:2 پاسخ می‌دهد (فهرست کوتاه → صفحهٔ ۱ clamp می‌شود)', async () => {
    const parsed = parseBotUpdate(cb('stu:list:2', CHAT_ALI));
    expect(parsed?.kind).toBe('stu_list');
    const p = await bot(A, cb('stu:list:2', CHAT_ALI, 70));
    expect(p.handled).toBe(true);
    expect(p.reply).toContain('دانش‌آموزان فعال');
  });

  it('/cancel وسط «پیام به خانواده» → پیام درست لغو می‌شود (نه پیام لیست انتظار)', async () => {
    const list = await bot(A, tx('دانش‌آموزان فعال', CHAT_ALI));
    const stuCb = list.buttons!.flat().find((b) => b.callbackData.startsWith('stu:menu:'))!.callbackData;
    const idx = stuCb.split(':')[2];
    await bot(A, cb(stuCb, CHAT_ALI, 80));
    await bot(A, cb(`stu:msg:${idx}`, CHAT_ALI, 81));
    const cancel = await bot(A, tx('/cancel', CHAT_ALI, 82));
    expect(cancel.reply).toContain('پیام لغو شد');
  });
});

// ───────────── قالب‌های جدید ─────────────

describe('قالب‌های بات', () => {
  it('bot_family_message_sent — «پیام» نه «تکلیف»', () => {
    const t = renderTemplate('bot_family_message_sent', { studentName: 'سارا', extra: 'به ۱ گفتگو ارسال شد.' });
    expect(t).toContain('پیام شما برای خانوادهٔ «سارا» ارسال شد');
    expect(t).not.toContain('تکلیف');
  });

  it('bot_case_events_disabled — پیام درست برای سرویس رویداد', () => {
    const t = renderTemplate('bot_case_events_disabled', {});
    expect(t).toContain('رویدادها و گزارش‌های پرونده');
    expect(t).not.toContain('بانک تمرین');
  });
});

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
    const wechsler = types.find((t) => t.key === 'wechsler');
    expect(wechsler).toBeUndefined();
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

describe('بات خانواده: «چک‌لیست‌های من» (فلو همکار حذف شد)', () => {
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
    expect((await bot(A, tx(parentNid, CHAT_PARENT))).reply).toContain('اتصال انجام شد');

    const types = (await manager.get('/api/case-events/types?active=true')).body as { data: { id: string; title: string }[] };
    const homeBehavior = types.data.find((x) => x.title.includes('پایش رفتار در خانه'));
    const created = await manager.post(`/api/students/${studentId}/case-events`, { eventTypeId: homeBehavior!.id, values: {} });
    expect(created.status).toBe(201);
  });

  it('خانواده: «چک‌لیست‌های من» → پر کردن هشت آیتمی → نتیجه با امتیاز در همان فهرست', async () => {
    const list = await bot(A, tx('چک‌لیست‌های من', CHAT_PARENT));
    const fillBtn = list.buttons!.flat().find((b) => b.callbackData.startsWith('clf:fill:'))!;
    expect(fillBtn).toBeTruthy();
    const eventId = fillBtn.callbackData.split(':')[2];
    await bot(A, cb(fillBtn.callbackData, CHAT_PARENT, 40));
    for (let i = 0; i < 8; i++) await bot(A, cb('clf:a:0', CHAT_PARENT, 41 + i));
    const sent = await bot(A, cb('clf:do', CHAT_PARENT, 60));
    expect(sent.reply).toContain('پاسخ‌های شما ثبت شد');

    const again = await bot(A, tx('چک‌لیست‌های من', CHAT_PARENT));
    expect(again.reply).toContain('آخرین نتایج');
    expect(again.reply).toContain(eventId.slice(0, 1) === '' ? '—' : 'امتیاز');
  });

  it('/cancel بدون فرم فعال → نادیده (handled=false)', async () => {
    const cancel = await bot(A, tx('/cancel', CHAT_PARENT, 82));
    expect(cancel.handled).toBe(false);
    expect(cancel.reply).toBeNull();
  });
});

describe('قالب‌های بات', () => {
  it('bot_case_events_disabled — پیام درست برای سرویس رویداد', () => {
    const t = renderTemplate('bot_case_events_disabled', {});
    expect(t).toContain('رویدادها و گزارش‌های پرونده');
    expect(t).not.toContain('بانک تمرین');
  });
});

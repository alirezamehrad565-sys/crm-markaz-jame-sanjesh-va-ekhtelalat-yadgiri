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

  it('نوع‌های seed روز اول موجودند — شرح‌حال v2 برای ورودی جدید غیرفعال (جایگزین فعال: نسخهٔ ۳ — T4 m148)', async () => {
    const res = await manager.get('/api/case-events/types?active=true');
    expect(res.status).toBe(200);
    const types = res.body as { data: { key: string; category: string; familyFillable: boolean; fields: unknown[]; active: boolean }[] };
    const keys = types.data.map((t) => t.key);
    expect(keys).not.toContain('anamnesis');
    expect(keys).not.toContain('ce-anamnesis-v2');
    expect(keys).toContain('ce-anamnesis-v3');
    const all = (await manager.get('/api/case-events/types')).body as { data: { key: string; active: boolean }[] };
    const v2 = all.data.find((t) => t.key === 'ce-anamnesis-v2');
    expect(v2).toBeTruthy();
    expect(v2!.active).toBe(false);
    const v3 = types.data.find((t) => t.key === 'ce-anamnesis-v3')!;
    expect(v3.active).toBe(true);
    expect(v3.familyFillable).toBe(false);
    expect(v3.fields).toHaveLength(44);
    const behavior = types.data.find((t) => t.key === 'home_behavior')!;
    expect(behavior.fields).toHaveLength(8);
    expect(behavior.fields.every((f) => (f as { scaleMax?: number }).scaleMax === 3)).toBe(true);
    expect(behavior.familyFillable).toBe(true);
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

    const th = await therapist.post('/api/case-events/types', { ...base, title: 'نوع از درمانگر' });
    expect(th.status).toBe(201);
    const sec = await secretary.post('/api/case-events/types', { ...base, title: 'نوع از منشی' });
    expect(sec.status).toBe(201);

    const bad = await manager.post('/api/case-events/types', {
      title: 'بد', category: 'session', fields: [{ key: 'x', label: 'انتخاب', type: 'select', options: ['فقط یکی'] }]
    });
    expect(bad.status).toBe(400);
    const bad2 = await manager.post('/api/case-events/types', {
      title: 'بد۲', category: 'checklist', fields: [{ key: 'x', label: 'متن', type: 'text' }]
    });
    expect(bad2.status).toBe(400);
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
    typeIdAnamnesis = types.data.find((t) => t.key === 'ce-anamnesis-v3')!.id;
  });

  it('فیلد الزامی خالی → ۴۰۰؛ ثبت کامل → ۲۰۱ با payload برچسب‌دار', async () => {
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
    expect((await therapist.post(`/api/case-events/${id2}/cancel`, {})).status).toBe(409);

    const tl = await therapist.get(`/api/students/${studentId}/timeline?kinds=case_event`);
    expect(tl.status).toBe(200);
    const events = (tl.body as { data: { title: string; subtitle: string | null }[] }).data;
    expect(events.some((e) => e.title.includes('شرح‌حال'))).toBe(true); // — عنوان روایی
    expect(events.some((e) => e.subtitle === 'رویداد لغو شد')).toBe(true);
  });

  it('T4 — نسخهٔ ۲ برای ورودی جدید بسته است (۴۰۹) ولی رویداد قدیمی v2 عیناً در تایم‌لاین و موتور نمایش داده می‌شود', async () => {
    const v2Row = await A.db.queryOne<{ id: string }>(`SELECT id FROM case_event_types WHERE key = 'ce-anamnesis-v2'`);
    expect(v2Row).toBeTruthy();
    await A.db.execute(
      `INSERT INTO case_events (id, event_type_id, student_id, occurred_at, status, payload, summary, created_by)
       VALUES (?, ?, ?, '2026-09-10T07:00:00.000Z', 'completed', ?, 'شرح‌حال قدیمی v2', 'e2e')`,
      [crypto.randomUUID(), v2Row!.id, studentId, JSON.stringify({ chief_complaint: { value: 'افت در همهٔ درس‌ها از مهر', label: 'شکایت اصلی' } })]
    );
    const blocked = await therapist.post(`/api/students/${studentId}/case-events`, {
      eventTypeId: v2Row!.id,
      values: { chief_complaint: 'تلاش برای ثبت v2' }
    });
    expect(blocked.status).toBe(409);

    const ok = await therapist.post(`/api/students/${studentId}/case-events`, {
      eventTypeId: typeIdAnamnesis,
      values: {
        source: 'مادر',
        chief_complaint: 'خواندنش خیلی کند است و صبح‌ها دل‌درد دارد',
        sld_read_concern: 'زیاد — نگران‌کننده',
        attention_concern: 'متوسط',
        morning_somatic: 'گاهی',
        decline_scope: 'بیشترِ درس‌ها افت کرده‌اند',
        absence_level: 'بیش از سه ماه'
      }
    });
    expect(ok.status).toBe(201);

    const insights = await manager.get(`/api/students/${studentId}/clinical-insights`);
    expect(insights.status).toBe(200);
    const body = insights.body as { data: { anamnesisSignals: { key: string; domain: string; source: string; value: number; fa: string }[]; dataCoverage: { seen: string[]; seenTitles: string[] } } };
    const sigKeys = body.data.anamnesisSignals.map((s) => s.key);
    expect(sigKeys).toContain('anam.sld_read');
    expect(sigKeys).toContain('anam.attention');
    expect(sigKeys).toContain('anam.morning_somatic');
    expect(sigKeys).toContain('anam.decline_scope');
    expect(body.data.anamnesisSignals.every((s) => s.source === 'anamnesis' && s.value >= 0 && s.value <= 1)).toBe(true);
    const read = body.data.anamnesisSignals.find((s) => s.key === 'anam.sld_read')!;
    expect(read.domain).toBe('academic');
    expect(read.value).toBe(1);
    expect(read.fa).toContain('خواندن');
    expect(body.data.dataCoverage.seen).toContain('ce-anamnesis-v3');
    expect(body.data.dataCoverage.seen).toContain('ce-anamnesis-v2');
    const tl = await therapist.get(`/api/students/${studentId}/timeline?kinds=case_event`);
    const events = (tl.body as { data: { title: string; subtitle: string | null }[] }).data;
    const v2Event = events.find((e) => e.title.includes('گفت‌وگوی اول — شرح‌حال کودک') && !e.title.includes('نسخهٔ ۳'));
    expect(v2Event).toBeTruthy();
  });
});

describe('چک‌لیست خانواده (clf) + وب‌فرم (m184: ویزارد tl حذف شد)', () => {
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
    const own = await manager.patch(`/api/students/${studentId}/owner`, { owner_staff_id: ALI_ID });
    expect(own.status).toBe(200);
    expect((await bot(A, tx(ALI_NID, CHAT_ALI))).reply).toContain('اتصال انجام شد');
    expect((await bot(A, tx(MANAGER_NID, CHAT_MGR))).reply).toContain('اتصال انجام شد');
    expect((await bot(A, tx(parentNid, CHAT_PARENT))).reply).toContain('اتصال انجام شد');
  });

  it('ثبت چک‌لیست از پنل (m184: فلو بات همکار حذف شد) → وضعیت در انتظار خانواده + «چک‌لیست‌های من» والد', async () => {
    const types = (await manager.get('/api/case-events/types?active=true')).body as { data: { id: string; title: string }[] };
    const homeBehavior = types.data.find((x) => x.title.includes('پایش رفتار در خانه')); // عنوان روایی — migration 0055
    expect(homeBehavior).toBeTruthy();
    const created = await manager.post(`/api/students/${studentId}/case-events`, { eventTypeId: homeBehavior!.id, values: {} });
    expect(created.status).toBe(201);

    const rows = A.sql.prepare(`SELECT id, status FROM case_events WHERE student_id = ? AND status = 'pending_family'`).all(studentId) as { id: string; status: string }[];
    expect(rows).toHaveLength(1);
    checklistEventId = rows[0].id;

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

    const row = A.sql.prepare(`SELECT status, analysis FROM case_events WHERE id = ?`).get(checklistEventId) as { status: string; analysis: string };
    expect(row.status).toBe('completed');
    const analysis = JSON.parse(row.analysis) as { score: number; band: string; answered: number; total: number };
    expect(analysis.score).toBe(12);
    expect(analysis.band).toBe('نیاز به توجه و پیگیری');
    expect(analysis.answered).toBe(8);

    const resultNotif = A.sql.prepare(`SELECT template, status FROM notifications WHERE template = 'bot_checklist_result' AND student_id = ?`).all(studentId) as { template: string; status: string }[];
    expect(resultNotif.length).toBeGreaterThanOrEqual(1);

    const tl = await manager.get(`/api/students/${studentId}/timeline?kinds=case_event`);
    const events = (tl.body as { data: { title: string; subtitle: string | null; actor: string | null }[] }).data;
    const filled = events.find((e) => e.subtitle?.includes('امتیاز'));
    expect(filled).toBeTruthy();
    expect(filled!.subtitle).toContain('۱۲');
    expect(filled!.subtitle).toContain('نیاز به توجه و پیگیری');
    expect(filled!.actor).toBe('خانواده');

    const mine = await bot(A, tx('چک‌لیست‌های من', CHAT_PARENT));
    expect(mine.reply).toContain('در انتظاری');
    const again = await bot(A, cb(`clf:fill:${checklistEventId}`, CHAT_PARENT));
    expect(again.reply).toContain('قبلاً');
  });

  it('وب‌فرم امن: توکن غلط ۴۰۳، صفحهٔ HTML ۲۰۰، ثبت با توکن درست، تک‌مصرف', async () => {
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

    const wrong = await A.app.request(`/public/case-events/${webEventId}/fill?token=wrong-token-123`);
    expect(wrong.status).toBe(403);

    const page = await A.app.request(`/public/case-events/${webEventId}/fill?token=${tokenRow.fill_token}`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('چک‌لیست بلند آزمایشی');
    expect(html).toContain('آیتم 10');

    const answers: Record<string, number> = {};
    for (let i = 1; i <= 10; i++) answers[`i${i}`] = 2; // جمع ۲۰ → «توجه»
    const post = await A.app.request(`/public/case-events/${webEventId}/fill`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: tokenRow.fill_token, answers })
    });
    expect(post.status).toBe(200);

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
    expect((await bot(A, tx(ALI_NID, CHAT_ALI))).reply).toContain('اتصال انجام شد');
    expect((await bot(A, tx(s.nationalId, CHAT_PARENT))).reply).toContain('اتصال انجام شد');
    expect((await manager.patch(`/api/students/${studentId}/owner`, { owner_staff_id: ALI_ID })).status).toBe(200);

    const ex = await therapist.post('/api/exercises', {
      title: 'کاربرگ تصحیح m65', description: null, format: 'worksheet', published: true
    });
    expect(ex.status).toBe(201);
    const exerciseId = (ex.body as { data: { id: string } }).data.id;

    // m184: تکلیف از پنل ثبت می‌شود (فلو «دانش‌آموزان فعال» بات حذف شد)
    const batch = await therapist.post(`/api/students/${studentId}/exercises/batches`, { exercise_ids: [exerciseId] });
    expect(batch.status).toBe(201);

    const asgRow = A.sql.prepare(`SELECT id FROM exercise_assignments WHERE student_id = ? ORDER BY created_at DESC LIMIT 1`).get(studentId) as { id: string };
    assignmentId = asgRow.id;
  });

  it('تصحیح تکلیف assigned → ۴۰۹؛ پس از بازگشت → corrected + بازخورد + اعلان خانواده', async () => {
    const early = await therapist.post(`/api/exercises/assignments/${assignmentId}/grade`, { feedback: 'خیلی خوب بود' });
    expect(early.status).toBe(409);

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

    const short = await therapist.post(`/api/exercises/assignments/${assignmentId}/grade`, { feedback: 'خ' });
    expect(short.status).toBe(400);

    const ok = await therapist.post(`/api/exercises/assignments/${assignmentId}/grade`, { feedback: 'صفحهٔ اول عالی بود؛ تمرین تطبیق را تکرار کنید.' });
    expect(ok.status).toBe(200);
    const rec = (ok.body as { data: { status: string; feedback: string; gradedByName: string | null } }).data;
    expect(rec.status).toBe('corrected');
    expect(rec.feedback).toContain('عالی');
    expect(rec.gradedByName).toContain('علی');

    expect((await therapist.post(`/api/exercises/assignments/${assignmentId}/grade`, { feedback: 'دوباره' })).status).toBe(409);

    const notif = A.sql.prepare(`SELECT template, status, payload FROM notifications WHERE template = 'homework_graded' AND student_id = ?`).all(studentId) as { template: string; status: string; payload: string }[];
    expect(notif.length).toBeGreaterThanOrEqual(1);
    expect(notif[0].status).toBe('sent');
    expect(notif[0].payload).toContain('عالی');

    const audits = A.sql.prepare(`SELECT changes FROM audit_log WHERE action = 'exercise.corrected' AND resource_id = ?`).all(assignmentId) as { changes: string }[];
    expect(audits.length).toBe(1);
    expect(audits[0].changes).not.toContain('عالی');

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

    const auditsBefore = (A.sql.prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE action = 'student.owner.changed' AND resource_id = ?`).get(studentId) as { n: number }).n;
    await manager.patch(`/api/students/${studentId}/owner`, { owner_staff_id: ALI_ID });
    const auditsAfter = (A.sql.prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE action = 'student.owner.changed' AND resource_id = ?`).get(studentId) as { n: number }).n;
    expect(auditsAfter).toBe(auditsBefore);

    const mine = await therapist.get('/api/appointments/my-students');
    expect((mine.body as { data: { id: string }[] }).data.map((s) => s.id)).toContain(studentId);



    const tl = await manager.get(`/api/students/${studentId}/timeline`);
    const events = (tl.body as { data: { title: string; subtitle: string | null }[] }).data;
    const ownerEv = events.find((e) => e.title === 'مسئول پرونده تغییر کرد');
    expect(ownerEv).toBeTruthy();
    expect(ownerEv!.subtitle).toContain('علی');

    const clear = await manager.patch(`/api/students/${studentId}/owner`, { owner_staff_id: null });
    expect(clear.status).toBe(200);
    expect((clear.body as { data: { ownerName: string | null } }).data.ownerName).toBeNull();
  });
});

describe('پارس callbackها و قالب‌های جدید', () => {
  it('parseClfCallback — معتبر و نامعتبر (m184: مسیر tl حذف شد)', async () => {
    const { parseClfCallback } = await import('@core/notify/bale/webhook');
    expect(parseClfCallback('clf:fill:6f1a2b3c-1111-4222-8333-444455556666', '200')).toMatchObject({ kind: 'clf_fill' });
    expect(parseClfCallback('clf:fill:short', '200')).toBeNull();
    expect(parseClfCallback('clf:a:3', '200')).toMatchObject({ kind: 'clf_a', value: 3 });
    expect(parseClfCallback('clf:no', '200')?.kind).toBe('clf_no');
  });

  it('قالب‌های bot_checklist_result / homework_graded رندر می‌شوند', async () => {
    const { renderTemplate } = await import('@core/notify');
    const result = renderTemplate('bot_checklist_result', { formTitle: 'چک‌لیست خواب', studentName: 'آوا', score: '۱۲', band: 'نیاز به توجه', clinicName: 'مرکز' });
    expect(result).toContain('امتیاز: ۱۲');
    expect(result).toContain('نیاز به توجه');
    const graded = renderTemplate('homework_graded', { exerciseTitle: 'کاربرگ ۲', feedback: 'خیلی خوب بود', clinicName: 'مرکز' });
    expect(graded).toContain('تصحیح شد');
    expect(graded).toContain('خیلی خوب بود');
  });
});

describe('m186 — فرم‌های تکی خانواده جای «فرم جامع» (هر فرم = یک رویداد = یک لینک)', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: ReturnType<typeof asRole> extends Promise<infer T> ? T : never;
  let studentId = '';
  const typeIds: Record<string, string> = {};

  const dataOf = <T>(res: { body: unknown }): T => (res.body as { data: T }).data;
  const fieldsOf = (key: string): { key: string; type: string; scaleMax?: number }[] =>
    JSON.parse((A.sql.prepare(`SELECT fields FROM case_event_types WHERE key = ?`).get(key) as { fields: string }).fields);

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
    const s = await createStudent(manager, { first_name: 'امید', last_name: 'تکی‌آزمون' });
    studentId = s.id;
    A.sql
      .prepare(
        `INSERT INTO bot_links (id, code, student_id, chat_id, status, created_by, created_at, updated_at)
         VALUES ('bb000000-7600-4000-8000-000000000501', 'M86T5CODE', ?, '9151', 'linked', 'seed', datetime('now'), datetime('now'))`
      )
      .run(studentId);
    const types = dataOf<Array<{ id: string; key: string }>>(await manager.get('/api/case-events/types?active=true'));
    for (const k of ['ce-snap-iv-p-v1', 'ce-sdq-p-v1', 'ce-scared-p-v1', 'ce-id-adapt-v1']) {
      const t = types.find((x) => x.key === k);
      expect(t, k).toBeTruthy();
      typeIds[k] = t!.id;
    }
    // — دو فرم جامع دیگر در کتابخانه نیست
    expect(types.find((x) => x.key === 'ce-comp-family-v2')).toBeUndefined();
    expect(types.find((x) => x.key === 'ce-comp-teacher-v2')).toBeUndefined();
  });

  it('SNAP-IV والد تکی: ساخت → در انتظار خانواده + توکن؛ صف «در انتظار پاسخ» نشان می‌دهد', async () => {
    const created = await manager.post(`/api/students/${studentId}/case-events`, { eventTypeId: typeIds['ce-snap-iv-p-v1'], values: {} });
    expect(created.status).toBe(201);
    const rec = dataOf<{ id: string; status: string }>(created);
    expect(rec.status).toBe('pending_family');
    const tokenRow = A.sql.prepare(`SELECT fill_token FROM case_events WHERE id = ?`).get(rec.id) as { fill_token: string };
    expect(tokenRow.fill_token).toBeTruthy();

    const pending = dataOf<Array<{ id: string }>>(await manager.get('/api/case-events/pending'));
    expect(pending.some((p) => p.id === rec.id)).toBe(true);
  });

  it('ارسال با بله (خانواده) → sent≥۱ و لینک امن در پیام', async () => {
    const rows = A.sql.prepare(
      `SELECT e.id FROM case_events e JOIN case_event_types t ON t.id = e.event_type_id
        WHERE t.key = 'ce-snap-iv-p-v1' AND e.student_id = ? AND e.status = 'pending_family'`
    ).all(studentId) as { id: string }[];
    const res = await manager.post(`/api/case-events/${rows[0].id}/send`, { audience: 'family' });
    expect(res.status).toBe(200);
    const out = dataOf<{ sent: number; targets: string[] }>(res);
    expect(out.sent).toBeGreaterThanOrEqual(1);
    expect(out.targets).toContain('9151');
  });

  it('وب‌فرم تکی: GET صفحهٔ تک‌فرمی (بدون سربرگ «بخش ۲ از ۵») + POST کامل → تحلیل؛ POST دوباره → ۴۰۹', async () => {
    const created = await manager.post(`/api/students/${studentId}/case-events`, { eventTypeId: typeIds['ce-snap-iv-p-v1'], values: {} });
    const rec = dataOf<{ id: string }>(created);
    const tokenRow = A.sql.prepare(`SELECT fill_token FROM case_events WHERE id = ?`).get(rec.id) as { fill_token: string };
    const page = await A.app.request(`/public/case-events/${rec.id}/fill?token=${tokenRow.fill_token}`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('چک‌لیست توجه و بی‌قراری — فرم خانواده (SNAP-IV)');
    expect(html).not.toContain('بخش ۲ از');
    const answers: Record<string, number> = {};
    for (const f of fieldsOf('ce-snap-iv-p-v1')) answers[f.key] = 1;
    const post = await A.app.request(`/public/case-events/${rec.id}/fill`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: tokenRow.fill_token, answers })
    });
    expect(post.status).toBe(200);
    const analysisRow = A.sql.prepare(`SELECT analysis FROM case_events WHERE id = ?`).get(rec.id) as { analysis: string };
    const a = JSON.parse(analysisRow.analysis) as { score: number; band: string | null; subscaleScores: { id: string; band: string | null }[] };
    expect(a.score).toBe(26);
    expect(a.subscaleScores.map((x) => x.id)).toEqual(['ia', 'hi', 'odd']);
    expect(a.subscaleScores.find((x) => x.id === 'ia')!.band).toBe('در محدودهٔ عادی');

    const post2 = await A.app.request(`/public/case-events/${rec.id}/fill`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: tokenRow.fill_token, answers })
    });
    expect(post2.status).toBe(409);
  });

  it('بات: چک‌لیست بلند خانواده (SNAP-IV ۲۷ آیتمی) در «چک‌لیست‌های من» می‌آید و با لینک وب پاسخ می‌گیرد', async () => {
    const created = await manager.post(`/api/students/${studentId}/case-events`, { eventTypeId: typeIds['ce-sdq-p-v1'], values: {} });
    const rec = dataOf<{ id: string }>(created);
    const mine = await bot(A, tx('چک‌لیست‌های من', 9151));
    expect(mine.reply).toContain('در انتظار پاسخ');
    expect(mine.buttons?.flat().some((b) => b.callbackData === `clf:fill:${rec.id}`)).toBe(true);
    const start = await bot(A, cb(`clf:fill:${rec.id}`, 9151, 5051));
    expect(start.reply).toContain('لینک امن');
    expect(start.reply).toMatch(/https?:\/\//);
    expect(start.reply).not.toContain('فرم جامع'); // — m186: متن بستهٔ جامع دیگر وجود ندارد
  });
});

describe('m172 — FillObserver: نتیجهٔ چک‌لیست خانواده/معلم به درمانگر ثبت‌کننده می‌رسد', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: ReturnType<typeof asRole> extends Promise<infer T> ? T : never;

  interface FillInput {
    eventId: string; studentId: string; staffId: string | null;
    formTitle: string; score: number | null; band: string | null;
    teacherName: string | null; via: 'web' | 'bot';
  }

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
  });

  it('پر کردن وب‌فرم → observer یک‌بار با via=web، نمره و باندمی‌آید؛ staffId ثبت‌کننده است', async () => {
    const services = (A.app as unknown as { __services?: { caseEvents: { setFillObserver: (fn: ((i: FillInput) => Promise<void>) | null) => void } } }).__services;
    expect(services).toBeTruthy();
    const fills: FillInput[] = [];
    services!.caseEvents.setFillObserver(async (i) => { fills.push(i); });

    const s = await createStudent(manager, { first_name: 'نازنین', last_name: 'نتیجه' });
    const studentId = s.id;

    const t = await manager.post('/api/case-events/types', {
      title: 'چک‌لیست ناظر m172',
      category: 'checklist',
      familyFillable: true,
      fields: [
        { key: 'i1', label: 'آیتم یک', type: 'scale', scaleMax: 3 },
        { key: 'i2', label: 'آیتم دو', type: 'scale', scaleMax: 3 }
      ],
      bands: [{ max: 2, label: 'مطلوب' }, { max: 4, label: 'توجه' }, { max: 6, label: 'جدی' }]
    });
    expect(t.status).toBe(201);
    const typeId = (t.body as { data: { id: string } }).data.id;

    const created = await manager.post(`/api/students/${studentId}/case-events`, { eventTypeId: typeId, values: {} });
    expect(created.status).toBe(201);
    const eventId = (created.body as { data: { id: string } }).data.id;

    const row = A.sql.prepare(`SELECT fill_token, staff_id FROM case_events WHERE id = ?`).get(eventId) as { fill_token: string; staff_id: string | null };
    expect(row.fill_token).toBeTruthy();

    expect(fills.length).toBe(0); // — قبل از پاسخ، اعلانی نیست
    const post = await A.app.request(`/public/case-events/${eventId}/fill`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: row.fill_token, answers: { i1: 2, i2: 2 } })
    });
    expect(post.status).toBe(200);

    expect(fills.length).toBe(1); // — دقیقاً یک اعلان
    const f = fills[0];
    expect(f.eventId).toBe(eventId);
    expect(f.via).toBe('web');
    expect(f.score).toBe(4);
    expect(f.band).toBe('توجه');
    expect(f.staffId).toBe(row.staff_id);
    expect(f.formTitle).toContain('m172');
    expect(f.teacherName).toBeNull();
  });

  it('پاسخ معلم (teacher_binding) → observer نام معلم را می‌فرستد', async () => {
    const services = (A.app as unknown as { __services?: { caseEvents: { setFillObserver: (fn: ((i: FillInput) => Promise<void>) | null) => void } } }).__services!;
    const fills: FillInput[] = [];
    services.caseEvents.setFillObserver(async (i) => { fills.push(i); });

    const s = await createStudent(manager, { first_name: 'بهنام', last_name: 'معلم' });
    const studentId = s.id;

    const t = await manager.post('/api/case-events/types', {
      title: 'چک‌لیست معلم m172',
      category: 'checklist',
      familyFillable: true,
      audience: 'teacher',
      fields: [{ key: 'i1', label: 'آیتم یک', type: 'scale', scaleMax: 3 }],
      bands: [{ max: 1, label: 'مطلوب' }, { max: 2, label: 'توجه' }, { max: 3, label: 'جدی' }]
    });
    expect(t.status).toBe(201);
    const typeId = (t.body as { data: { id: string } }).data.id;

    const created = await manager.post(`/api/students/${studentId}/case-events`, { eventTypeId: typeId, values: {} });
    const eventId = (created.body as { data: { id: string } }).data.id;
    const row = A.sql.prepare(`SELECT fill_token FROM case_events WHERE id = ?`).get(eventId) as { fill_token: string };

    // — مقیدکردن معلم به رویداد (مانند لینک معلم)
    A.sql.prepare(`UPDATE case_events SET payload = ? WHERE id = ?`)
      .run(JSON.stringify({ teacher_binding: { name: 'خانم صادقی', teacherId: null } }), eventId);

    const post = await A.app.request(`/public/case-events/${eventId}/fill`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: row.fill_token, answers: { i1: 3 } })
    });
    expect(post.status).toBe(200);

    expect(fills.length).toBe(1);
    expect(fills[0].teacherName).toBe('خانم صادقی');
    expect(fills[0].band).toBe('جدی');
  });
});

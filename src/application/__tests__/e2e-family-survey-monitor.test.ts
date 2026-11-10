/**
 * e2e ۱.۲۵.۵۹ — نظرسنجی رضایت مرکز/درمانگر + پایش در خانهٔ نسخهٔ ۲ (کانون‌های جمع‌بندی)
 * خواستهٔ کارفرما: «فرم نظر سنجی برای عملکرد کیفی مرکز و درمانگر + از دسترسی مدیر بشه از
 * خانواده ها نظر سنجی کرد تو شاخص های عملکردی مرکز استفاده کرد» و «فرم پایش در خانه باید
 * روی جمع بندی های جدید و نهایی در موتور تشخیص بالینی باز طراحی بشه».
 * الگو: e2e-case-event-forms.test.ts — دادهٔ آزمونی محلی، بدون دست‌زدن به تولید.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, asRole, createStudent, WEBHOOK_SECRET } from '../../test/harness';
import { formulateCase } from '@domain/case-formulation';
import { engineFactsOf } from '@domain/clinical-engine';
import type { FormulationEvidence, EvidenceEvent } from '@domain/case-formulation';

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

const CHAT_PARENT1 = 915101;
const CHAT_PARENT2 = 915102;
const CHAT_PARENT3 = 915103;

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

interface SurveyItem {
  id: string;
  studentId: string;
  studentName: string;
  therapistId: string | null;
  therapistName: string | null;
  status: string;
  link: string | null;
  centerScore: number | null;
  therapistScore: number | null;
  nps: number | null;
  note: string | null;
}

describe('نظرسنجی رضایت مرکز/درمانگر — چرخهٔ مدیر → خانواده → KPI', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Awaited<ReturnType<typeof asRole>>;
  let secretary: Awaited<ReturnType<typeof asRole>>;
  let therapist: Awaited<ReturnType<typeof asRole>>;
  let s1 = '';
  let s2 = '';
  let event1 = '';
  let event2 = '';
  let token1 = '';
  let token2 = '';
  let therapistStaffId = '';

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
    secretary = await asRole(A, 'secretary');
    therapist = await asRole(A, 'therapist');
    s1 = (await createStudent(manager, { first_name: 'آوا', last_name: 'نظرسنجی۱' })).id;
    s2 = (await createStudent(manager, { first_name: 'آرمین', last_name: 'نظرسنجی۲' })).id;
    const staff = dataOf<{ id: string; role: string; full_name: string }[]>(await manager.get('/api/staff'));
    therapistStaffId = staff.find((x) => x.role === 'therapist')!.id;
  });

  it('ساخت گروهی فقط مدیر؛ هر خانواده لینک امن خودش را می‌گیرد و درمانگر روی رویداد می‌نشیند', async () => {
    const denied = await therapist.post('/api/case-events/surveys', { student_ids: [s1] });
    expect(denied.status).toBe(403);

    const res = await manager.post('/api/case-events/surveys', {
      student_ids: [s1, s2],
      therapist_id: therapistStaffId
    });
    expect(res.status).toBe(201);
    const created = dataOf<{ created: SurveyItem[] }>(res).created;
    expect(created).toHaveLength(2);
    for (const item of created) {
      expect(item.status).toBe('pending_family');
      expect(item.link).toContain('/public/case-events/');
      expect(item.link).toContain('token=');
      expect(item.therapistId).toBe(therapistStaffId);
    }
    event1 = created[0].id;
    event2 = created[1].id;

    const rows = A.sql.prepare(`SELECT e.fill_token, e.staff_id, t.key FROM case_events e JOIN case_event_types t ON t.id = e.event_type_id WHERE e.id = ?`).get(event1) as { fill_token: string; staff_id: string; key: string };
    expect(rows.key).toBe('ce-center-survey-v1');
    expect(rows.staff_id).toBe(therapistStaffId);
    token1 = rows.fill_token;
    token2 = (A.sql.prepare(`SELECT fill_token FROM case_events WHERE id = ?`).get(event2) as { fill_token: string }).fill_token;
  });

  it('فهرست نظرسنجی: مدیر و منشی می‌بینند؛ درمانگر نه', async () => {
    expect((await manager.get('/api/case-events/surveys')).status).toBe(200);
    expect((await secretary.get('/api/case-events/surveys')).status).toBe(200);
    expect((await therapist.get('/api/case-events/surveys')).status).toBe(403);
    const items = dataOf<SurveyItem[]>(await manager.get('/api/case-events/surveys'));
    expect(items.length).toBe(2);
    expect(items.every((i) => i.therapistName && i.link)).toBe(true);
  });

  it('صفحهٔ وب نظرسنجی: عنوان + متن آزاد اختیاری (textarea) دارد', async () => {
    const page = await A.app.request(`/public/case-events/${event1}/fill?token=${token1}`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('نظرسنجی رضایت');
    expect(html).toContain('textarea');
    expect(html).toContain('اختیاری');
  });

  it('پر کردن کامل با متن آزاد: درصدهای زیرمقیاس + NPS + ذخیرهٔ نظر', async () => {
    const answers: Record<string, number | string> = {};
    for (let i = 1; i <= 5; i++) answers[`sv_cen${i}`] = 4;
    for (let i = 1; i <= 5; i++) answers[`sv_thr${i}`] = 3;
    answers['sv_nps'] = 9;
    answers['sv_note'] = 'لطفاً ساعت نوبت‌ها را جمع‌تر کنید';
    const post = await A.app.request(`/public/case-events/${event1}/fill`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: token1, answers })
    });
    expect(post.status).toBe(200);

    const again = await A.app.request(`/public/case-events/${event1}/fill`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: token1, answers })
    });
    expect(again.status).toBe(409); // تک‌مصرف

    const row = A.sql.prepare(`SELECT analysis, payload FROM case_events WHERE id = ?`).get(event1) as { analysis: string; payload: string };
    const a = JSON.parse(row.analysis) as { score: number; maxScore: number; subscaleScores: { id: string; score: number; max: number }[] };
    expect(a.score).toBe(35); // مرکز ۲۰ + درمانگر ۱۵ (NPS خارج از کل)
    expect(a.maxScore).toBe(40);
    expect(a.subscaleScores.find((s) => s.id === 'center')?.score).toBe(20);
    expect(a.subscaleScores.find((s) => s.id === 'therapist')?.score).toBe(15);
    expect(a.subscaleScores.find((s) => s.id === 'nps')?.score).toBe(9);
    const payload = JSON.parse(row.payload) as Record<string, { value: string }>;
    expect(payload.sv_note.value).toContain('نوبت');
  });

  it('پر کردن بدون متن آزاد هم کامل است (اختیاری‌بودن longtext)', async () => {
    const answers: Record<string, number> = {};
    for (let i = 1; i <= 5; i++) answers[`sv_cen${i}`] = 2;
    for (let i = 1; i <= 5; i++) answers[`sv_thr${i}`] = 4;
    answers['sv_nps'] = 6;
    const post = await A.app.request(`/public/case-events/${event2}/fill`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: token2, answers })
    });
    expect(post.status).toBe(200);
  });

  it('فهرست پس از پاسخ: درصد مرکز/درمانگر و NPS و نظر خانواده می‌آید', async () => {
    const items = dataOf<SurveyItem[]>(await manager.get('/api/case-events/surveys'));
    const done1 = items.find((i) => i.id === event1)!;
    const done2 = items.find((i) => i.id === event2)!;
    expect(done1.status).toBe('completed');
    expect(done1.centerScore).toBe(100);
    expect(done1.therapistScore).toBe(75);
    expect(done1.nps).toBe(9);
    expect(done1.note).toContain('نوبت');
    expect(done1.link).toBeNull(); // لینک فقط برای در انتظارها
    expect(done2.centerScore).toBe(50);
    expect(done2.therapistScore).toBe(100);
    expect(done2.nps).toBe(6);
    expect(done2.note).toBeNull();
  });

  it('KPI: بلوک family_survey پر می‌شود و نظرسنجی از متریک چک‌لیست خانواده جدا می‌ماند', async () => {
    const res = await manager.get('/api/kpi/summary?days=30');
    expect(res.status).toBe(200);
    const body = dataOf<{ family_survey: { surveys_sent: number; surveys_filled: number; response_rate: number | null; center_avg: number | null; therapist_avg: number | null; nps_avg: number | null }; documentation: { family_requests: number } }>(res);
    expect(body.family_survey.surveys_sent).toBe(2);
    expect(body.family_survey.surveys_filled).toBe(2);
    expect(body.family_survey.response_rate).toBe(1);
    expect(body.family_survey.center_avg).toBe(75); // (۱۰۰ + ۵۰) / ۲
    expect(body.family_survey.therapist_avg).toBe(87.5); // (۷۵ + ۱۰۰) / ۲
    expect(body.family_survey.nps_avg).toBe(7.5);
    expect(body.documentation.family_requests).toBe(0); // نظرسنجی دیگر «فرم خانواده»ی چک‌لیستی نمی‌شمارد
  });
});

describe('پایش در خانهٔ نسخهٔ ۲ — کانون‌های جمع‌بندی در فرم خانواده', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Awaited<ReturnType<typeof asRole>>;
  let studentId = '';
  let parentNid = '';
  let monitorEventId = '';
  let monitorToken = '';

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
    const s = await createStudent(manager, { first_name: 'هستی', last_name: 'پایشخانه' });
    studentId = s.id;
    parentNid = s.nationalId;
    expect((await bot(A, tx(parentNid, CHAT_PARENT3))).reply).toContain('اتصال انجام شد');
  });

  it('ارسال با بله: اسنپ‌شات کانون از موتور تزریقی در payload می‌نشیند', async () => {
    const types = dataOf<{ id: string; key: string }[]>(await manager.get('/api/case-events/types?active=true'));
    const monitor = types.find((t) => t.key === 'ce-home-monitor-v2')!;
    const created = await manager.post(`/api/students/${studentId}/case-events`, { eventTypeId: monitor.id, values: {} });
    expect(created.status).toBe(201);
    monitorEventId = dataOf<{ id: string }>(created).id;
    monitorToken = (A.sql.prepare(`SELECT fill_token FROM case_events WHERE id = ?`).get(monitorEventId) as { fill_token: string }).fill_token;

    const res = await manager.post(`/api/case-events/${monitorEventId}/send`, { audience: 'family' });
    expect(res.status).toBe(200);
    const row = A.sql.prepare(`SELECT payload FROM case_events WHERE id = ?`).get(monitorEventId) as { payload: string | null };
    expect(row.payload).toBeTruthy();
    const payload = JSON.parse(row.payload!) as { _monitor_focus?: { value: string; label: string } };
    expect(payload._monitor_focus).toBeTruthy();
    const focus = JSON.parse(payload._monitor_focus!.value) as { generatedAt: string; coherence: string; items: unknown[] };
    expect(typeof focus.generatedAt).toBe('string');
    expect(Array.isArray(focus.items)).toBe(true); // پروندهٔ نو → صفر کانون؛ اسنپ‌شات به‌هرحال می‌نشیند
  });

  it('فرم عمومی پایش: بنر کانون + تقدم بخش درگیر + فیلد توضیحات اختیاری', async () => {
    // اسنپ‌شات دست‌ساز (پروندهٔ نو خروجی موتور خالی می‌دهد) — قرارداد نمایش را گیت می‌کند
    const focus = {
      generatedAt: new Date().toISOString(),
      coherence: 'ناقص',
      items: [{ key: 'attention_exec', titleFa: 'توجه و کارکرد اجرایی', level: 'قابل‌توجه', score: 3 }]
    };
    A.sql.prepare(`UPDATE case_events SET payload = ? WHERE id = ?`).run(
      JSON.stringify({ _monitor_focus: { value: JSON.stringify(focus), label: 'کانون‌های پایش' } }),
      monitorEventId
    );
    const page = await A.app.request(`/public/case-events/${monitorEventId}/fill?token=${monitorToken}`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('کانون‌های این دوره');
    expect(html).toContain('توجه و کارکرد اجرایی');
    // تقدم کانون درگیر: بخش توجه پیش از رفتارهای برون‌ریزی (اولین بخش کتابخانه) بیاید
    expect(html.indexOf('توجه و کارکرد اجرایی')).toBeLessThan(html.indexOf('رفتارهای برون‌ریزی'));
    expect(html).toContain('textarea'); // توضیحات اختیاری
  });

  it('پر کردن کامل ۲۴ گویه + توضیحات: تحلیل هشت‌کانونی و حفظ اسنپ‌شات کانون پس از پاسخ', async () => {
    const answers: Record<string, number | string> = {};
    const scaleKeys = [
      'hm_att1', 'hm_att2', 'hm_att3', 'hm_ext1', 'hm_ext2', 'hm_ext3',
      'hm_int1', 'hm_int2', 'hm_int3', 'hm_lng1', 'hm_lng2', 'hm_lng3',
      'hm_aca1', 'hm_aca2', 'hm_aca3', 'hm_mot1', 'hm_mot2', 'hm_mot3',
      'hm_cog1', 'hm_cog2', 'hm_cog3', 'hm_soc1', 'hm_soc2', 'hm_soc3'
    ];
    for (const k of scaleKeys) answers[k] = 2;
    answers['hm_note'] = 'شب‌ها موقع درس خواندن خیلی پرت می‌شود';
    const post = await A.app.request(`/public/case-events/${monitorEventId}/fill`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: monitorToken, answers })
    });
    expect(post.status).toBe(200);

    const row = A.sql.prepare(`SELECT status, analysis, payload FROM case_events WHERE id = ?`).get(monitorEventId) as { status: string; analysis: string; payload: string };
    expect(row.status).toBe('completed');
    const a = JSON.parse(row.analysis) as { score: number; band: string; subscaleScores: { id: string; score: number; max: number; color: string | null }[] };
    expect(a.score).toBe(48); // ۲۴ × ۲
    expect(a.band).toBe('چند کانون پررنگ');
    expect(a.subscaleScores).toHaveLength(8);
    const att = a.subscaleScores.find((s) => s.id === 'attention_exec')!;
    expect(att.score).toBe(6);
    expect(att.color).toBe('danger');
    const payload = JSON.parse(row.payload) as { _monitor_focus?: { value: string }; hm_note?: { value: string } };
    expect(payload._monitor_focus).toBeTruthy(); // اسنپ‌شات کانون با پر شدن نمی‌سوزد
    expect(payload.hm_note.value).toContain('پرت');
  });
});

describe('موتور صورت‌بندی — ورودی‌های تازه (۱.۲۵.۵۹) در سازه‌ها می‌نشینند', () => {
  const evidenceOf = (events: EvidenceEvent[]): FormulationEvidence => ({
    events,
    wechsler: null,
    ot: null,
    gates: null,
    child: { id: 'child-test', ageYears: 9 }
  });

  it('شرح‌حال v3: نگرانی ساخت‌یافته مستقیم به سازهٔ هم‌نام می‌نشیند', () => {
    const anam: EvidenceEvent = {
      toolKey: 'ce-anamnesis-v3',
      status: 'completed',
      occurredAt: '2026-11-01T10:00:00.000Z',
      payload: {
        chief_complaint: { value: 'افت توجه در درس‌ها', label: 'شکایت' },
        attention_concern: { value: 'زیاد — نگران‌کننده', label: 'توجه' },
        hyper_concern: { value: 'متوسط', label: 'بی‌قراری' },
        home_language: { value: 'دوزبانه', label: 'زبان خانه' }
      }
    };
    const f = formulateCase(evidenceOf([anam]));
    const att = f.constructs.find((c) => c.key === 'attention_exec')!;
    expect(att.evidenceFa.some((e) => e.toolId === 'ce-anamnesis-v3' && e.signal === 'anamnesis3_attention_concern_high')).toBe(true);
    const ext = f.constructs.find((c) => c.key === 'externalizing')!;
    expect(ext.evidenceFa.some((e) => e.toolId === 'ce-anamnesis-v3' && e.signal === 'anamnesis3_hyper_concern_mid')).toBe(true);
  });

  it('ارزیابی عملکردی FX: پرچم حیطه‌ها به توجه/شناخت عمومی می‌نشیند و ضعف چندگانه وزن اضافه می‌گیرد', () => {
    const fx: EvidenceEvent = {
      toolKey: 'ce-rehab-fx-v1',
      status: 'completed',
      occurredAt: '2026-11-02T10:00:00.000Z',
      analysis: {
        score: 2,
        band: 'نیاز به مداخلهٔ همه‌جانبهٔ ذهنی',
        answered: 6,
        total: 6,
        maxScore: 6,
        flags: [
          { key: 'att_sus', label: 'توجه پایدار: ضعف آشکار — ۲ خط', value: 2 },
          { key: 'att_sel', label: 'توجه انتخابی: ضعف آشکار — ۱ خط', value: 1 },
          { key: 'wm', label: 'حافظهٔ کاری: ضعف آشکار — ۲ خط', value: 2 },
          { key: 'ps', label: 'حل مسئله: مرزی — ۴ گام', value: 4 }
        ]
      }
    };
    const f = formulateCase(evidenceOf([fx]));
    const att = f.constructs.find((c) => c.key === 'attention_exec')!;
    expect(att.evidenceFa.filter((e) => e.toolId === 'ce-rehab-fx-v1').length).toBeGreaterThanOrEqual(3); // سه ضعف + ضعف چندگانه
    expect(att.evidenceFa.some((e) => e.signal === 'fx_multi_weak')).toBe(true);
    const cog = f.constructs.find((c) => c.key === 'general_cog')!;
    expect(cog.evidenceFa.some((e) => e.toolId === 'ce-rehab-fx-v1' && e.signal === 'fx_ps_weak')).toBe(false); // حل‌مسئله مرزی است نه ضعف
    expect(cog.evidenceFa.some((e) => e.toolId === 'ce-rehab-fx-v1')).toBe(true); // ولی پرچم مرزی می‌آید
  });

  it('پایش خانهٔ v2: زیرمقیاس‌های هم‌نام سازه‌ها به جمع‌بندی می‌نشینند', () => {
    const mon: EvidenceEvent = {
      toolKey: 'ce-home-monitor-v2',
      status: 'completed',
      occurredAt: '2026-11-03T10:00:00.000Z',
      analysis: {
        score: 11,
        band: 'چند کانون نیازمند توجه',
        answered: 24,
        total: 25,
        maxScore: 72,
        subscaleScores: [
          { id: 'attention_exec', name: 'توجه', score: 7, max: 9, band: 'پررنگ', color: 'danger' },
          { id: 'internalizing', name: 'حال', score: 4, max: 9, band: 'نیازمند توجه', color: 'warn' }
        ]
      }
    };
    const f = formulateCase(evidenceOf([mon]));
    const att = f.constructs.find((c) => c.key === 'attention_exec')!;
    expect(att.evidenceFa.some((e) => e.toolId === 'ce-home-monitor-v2' && e.signal === 'home_mon_attention_exec_danger')).toBe(true);
    const emo = f.constructs.find((c) => c.key === 'internalizing')!;
    expect(emo.evidenceFa.some((e) => e.toolId === 'ce-home-monitor-v2' && e.signal === 'home_mon_internalizing_warn')).toBe(true);
  });

  it('SDQ والد: رویداد تازهٔ کلید جدید زیر قواعد قدیمی می‌نشیند و دوبارشماری ندارد', () => {
    const old: EvidenceEvent = {
      toolKey: 'sdq-parent',
      status: 'completed',
      occurredAt: '2026-10-01T10:00:00.000Z',
      analysis: { score: 10, band: 'مرزی', answered: 25, total: 25, maxScore: 50, subscaleScores: [{ id: 'hyper', name: 'بی‌قراری', score: 8, max: 10, band: 'قابل توجه', color: 'danger' }] }
    };
    const newer: EvidenceEvent = {
      toolKey: 'ce-sdq-p-v1',
      status: 'completed',
      occurredAt: '2026-11-05T10:00:00.000Z',
      analysis: { score: 12, band: 'قابل توجه', answered: 25, total: 25, maxScore: 50, subscaleScores: [{ id: 'hyper', name: 'بی‌قراری', score: 9, max: 10, band: 'قابل توجه', color: 'danger' }] }
    };
    const facts = engineFactsOf([old, newer]);
    const parent = facts.perTool.get('sdq-parent') ?? [];
    expect(parent).toHaveLength(1);
    expect(parent[0].occurredAt).toBe('2026-11-05T10:00:00.000Z'); // تازه‌تر برنده است
    expect(facts.latest.has('ce-sdq-p-v1')).toBe(false);
    // فقط قدیمی (بدون جدید): قاعده به همان رویداد می‌رسد
    const facts2 = engineFactsOf([old]);
    expect((facts2.perTool.get('sdq-parent') ?? []).length).toBe(1);
  });
});

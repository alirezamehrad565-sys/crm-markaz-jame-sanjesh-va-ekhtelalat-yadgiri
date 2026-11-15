/**
 * e2e ۱.۲۵.۵۹/۱.۲۵.۶۰ — نظرسنجی خانواده‌ها (ماژول مستقل فقط-مدیر) + پایش در خانهٔ نسخهٔ ۲
 * خواستهٔ کارفرما: «بخش نظر سنجی فقط باید برای مدیر باشه»، «یه دوتا فرم نظر سنجی سیستمی
 * ساخت یافته درست کن که موقع ترخیص و اتمام جلسه و یکی هم حین درمان از خانواده نظر سنجی
 * کنه و kpi بده به مدیر» و «ممکنه این ماژول بازخورد از خانواده رو تبدیل به یه پنجره یا
 * ماژول جدا کنی» — ماژول مستقل #/family-surveys با دو کلید ce-survey-discharge-v1 /
 * ce-survey-progress-v1 و خروج نظرسنجی از صف عمومی فرم‌ساز.
 * الگو: e2e-case-event-forms.test.ts — دادهٔ آزمونی محلی، بدون دست‌زدن به تولید.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, asRole, createStudent, WEBHOOK_SECRET } from '../../test/harness';
import { formulateCase } from '@domain/case-formulation';
import { engineFactsOf } from '@domain/clinical-engine';
import type { FormulationEvidence } from '@domain/case-formulation';
import type { EvidenceEvent as EngineEvidenceEvent } from '@domain/clinical-engine/types';

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
  kind: 'general' | 'discharge' | 'progress';
  typeKey: string;
  typeTitle: string;
  centerScore: number | null;
  therapistScore: number | null;
  progressScore: number | null;
  nps: number | null;
  note: string | null;
}

describe('نظرسنجی خانواده‌ها — ماژول مستقل فقط-مدیر با دو فرم ساخت‌یافته → KPI', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Awaited<ReturnType<typeof asRole>>;
  let secretary: Awaited<ReturnType<typeof asRole>>;
  let therapist: Awaited<ReturnType<typeof asRole>>;
  let s1 = '';
  let s2 = '';
  let s3 = '';
  let s3Nid = '';
  let dischargeEvent = '';
  let progressEvent = '';
  let tokenDischarge = '';
  let tokenProgress = '';
  let extraProgressEvent = '';
  let therapistStaffId = '';

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
    secretary = await asRole(A, 'secretary');
    therapist = await asRole(A, 'therapist');
    s1 = (await createStudent(manager, { first_name: 'آوا', last_name: 'نظرسنجی۱' })).id;
    s2 = (await createStudent(manager, { first_name: 'آرمین', last_name: 'نظرسنجی۲' })).id;
    const s3row = await createStudent(manager, { first_name: 'نوید', last_name: 'نظرسنجی۳' });
    s3 = s3row.id; // برای بستن چت بلهٔ ارسال موفق
    s3Nid = s3row.nationalId;
    const staff = dataOf<{ id: string; role: string; full_name: string }[]>(await manager.get('/api/staff'));
    therapistStaffId = staff.find((x) => x.role === 'therapist')!.id;
  });

  it('ساخت فقط مدیر؛ دو فرم ساخت‌یافته هرکدام کلید رجیستری خودشان را می‌گیرند', async () => {
    const denied = await therapist.post('/api/case-events/surveys', { student_ids: [s1], kind: 'discharge' });
    expect(denied.status).toBe(403);

    const resD = await manager.post('/api/case-events/surveys', {
      student_ids: [s1],
      therapist_id: therapistStaffId,
      kind: 'discharge'
    });
    expect(resD.status).toBe(201);
    const resP = await manager.post('/api/case-events/surveys', {
      student_ids: [s2],
      therapist_id: therapistStaffId,
      kind: 'progress'
    });
    expect(resP.status).toBe(201);

    const createdD = dataOf<{ created: SurveyItem[] }>(resD).created;
    const createdP = dataOf<{ created: SurveyItem[] }>(resP).created;
    expect(createdD).toHaveLength(1);
    expect(createdP).toHaveLength(1);
    const d = createdD[0];
    const p = createdP[0];
    expect(d.kind).toBe('discharge');
    expect(d.typeKey).toBe('ce-survey-discharge-v1');
    expect(d.typeTitle).toContain('پایان دوره');
    expect(p.kind).toBe('progress');
    expect(p.typeKey).toBe('ce-survey-progress-v1');
    for (const item of [d, p]) {
      expect(item.status).toBe('pending_family');
      expect(item.link).toContain('/public/case-events/');
      expect(item.link).toContain('token=');
      expect(item.therapistId).toBe(therapistStaffId);
    }
    dischargeEvent = d.id;
    progressEvent = p.id;

    const rows = A.sql.prepare(`SELECT e.id, e.fill_token, e.staff_id, t.key FROM case_events e JOIN case_event_types t ON t.id = e.event_type_id WHERE e.id IN (?, ?)`).all(dischargeEvent, progressEvent) as { id: string; fill_token: string; staff_id: string; key: string }[];
    const dRow = rows.find((r) => r.id === dischargeEvent)!;
    const pRow = rows.find((r) => r.id === progressEvent)!;
    expect(dRow.key).toBe('ce-survey-discharge-v1');
    expect(pRow.key).toBe('ce-survey-progress-v1');
    expect(dRow.staff_id).toBe(therapistStaffId);
    tokenDischarge = dRow.fill_token;
    tokenProgress = pRow.fill_token;
  });

  it('فهرست نظرسنجی فقط مدیر می‌بیند؛ منشی و درمانگر ۴۰۳ می‌گیرند', async () => {
    expect((await manager.get('/api/case-events/surveys')).status).toBe(200);
    expect((await secretary.get('/api/case-events/surveys')).status).toBe(403);
    expect((await therapist.get('/api/case-events/surveys')).status).toBe(403);
    const items = dataOf<SurveyItem[]>(await manager.get('/api/case-events/surveys'));
    expect(items.length).toBe(2);
    expect(items.every((i) => i.therapistName && i.link)).toBe(true);
  });

  it('نظرسنجی از صف عمومی «در انتظار پاسخ» فرم‌ساز بیرون است (ماژول جدا)', async () => {
    const pending = dataOf<{ id: string }[]>(await manager.get('/api/case-events/pending'));
    expect(pending.some((x) => x.id === dischargeEvent || x.id === progressEvent)).toBe(false);
  });

  it('وب فرم پایان دوره: عنوان + گویه پیشرفت + متن آزاد اختیاری دارد', async () => {
    const page = await A.app.request(`/public/case-events/${dischargeEvent}/fill?token=${tokenDischarge}`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('پایان دوره');
    expect(html).toContain('پیشرفت فرزند');
    expect(html).toContain('textarea');
    expect(html).toContain('اختیاری');
  });

  it('پر کردن کامل فرم پایان دوره: سه زیرمقیاس + NPS + ذخیرهٔ نظر', async () => {
    const answers: Record<string, number | string> = {};
    for (let i = 1; i <= 3; i++) answers[`sv_cen${i}`] = 4;
    for (let i = 1; i <= 4; i++) answers[`sv_thr${i}`] = 3;
    for (let i = 1; i <= 3; i++) answers[`sv_prg${i}`] = 4;
    answers['sv_nps'] = 9;
    answers['sv_note'] = 'لطفاً ساعت نوبت‌ها را جمع‌تر کنید';
    const post = await A.app.request(`/public/case-events/${dischargeEvent}/fill`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: tokenDischarge, answers })
    });
    expect(post.status).toBe(200);

    const again = await A.app.request(`/public/case-events/${dischargeEvent}/fill`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: tokenDischarge, answers })
    });
    expect(again.status).toBe(409); // تک‌مصرف

    const row = A.sql.prepare(`SELECT analysis, payload FROM case_events WHERE id = ?`).get(dischargeEvent) as { analysis: string; payload: string };
    const a = JSON.parse(row.analysis) as { score: number; maxScore: number; subscaleScores: { id: string; score: number; max: number }[] };
    expect(a.score).toBe(36); // مرکز ۱۲ + درمانگر ۱۲ + پیشرفت ۱۲ (NPS خارج از کل)
    expect(a.maxScore).toBe(40);
    expect(a.subscaleScores.find((s) => s.id === 'center')?.score).toBe(12);
    expect(a.subscaleScores.find((s) => s.id === 'therapist')?.score).toBe(12);
    expect(a.subscaleScores.find((s) => s.id === 'progress')?.score).toBe(12);
    expect(a.subscaleScores.find((s) => s.id === 'nps')?.score).toBe(9);
    const payload = JSON.parse(row.payload) as Record<string, { value: string }>;
    expect(payload.sv_note.value).toContain('نوبت');
  });

  it('پر کردن فرم حین درمان (بدون متن آزاد) هم کامل است', async () => {
    const answers: Record<string, number> = {};
    for (let i = 1; i <= 2; i++) answers[`sv_cen${i}`] = 2;
    for (let i = 1; i <= 3; i++) answers[`sv_thr${i}`] = 4;
    for (let i = 1; i <= 2; i++) answers[`sv_prg${i}`] = 3;
    answers['sv_nps'] = 6;
    const post = await A.app.request(`/public/case-events/${progressEvent}/fill`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: tokenProgress, answers })
    });
    expect(post.status).toBe(200);
  });

  it('فهرست پس از پاسخ: درصد مرکز/درمانگر/پیشرفت و NPS و نظر خانواده می‌آید', async () => {
    const items = dataOf<SurveyItem[]>(await manager.get('/api/case-events/surveys'));
    const doneD = items.find((i) => i.id === dischargeEvent)!;
    const doneP = items.find((i) => i.id === progressEvent)!;
    expect(doneD.status).toBe('completed');
    expect(doneD.centerScore).toBe(100);
    expect(doneD.therapistScore).toBe(75);
    expect(doneD.progressScore).toBe(100);
    expect(doneD.nps).toBe(9);
    expect(doneD.note).toContain('نوبت');
    expect(doneD.link).toBeNull(); // لینک فقط برای در انتظارها
    expect(doneP.centerScore).toBe(50);
    expect(doneP.therapistScore).toBe(100);
    expect(doneP.progressScore).toBe(75);
    expect(doneP.nps).toBe(6);
    expect(doneP.note).toBeNull();
  });

  it('ارسال و لغو نظرسنجی فقط از دسترسی مدیر — دفاع در عمق سمت سرویس', async () => {
    expect((await bot(A, tx(s3Nid, CHAT_PARENT1))).reply).toContain('اتصال انجام شد'); // ارسال موفق نیازمند چت بلهٔ پیوسته است
    const res = await manager.post('/api/case-events/surveys', { student_ids: [s3], kind: 'progress' });
    expect(res.status).toBe(201);
    extraProgressEvent = dataOf<{ created: SurveyItem[] }>(res).created[0].id;

    const sendDenied = await therapist.post(`/api/case-events/${extraProgressEvent}/send`, { audience: 'family' });
    expect(sendDenied.status).toBe(403);
    const cancelDenied = await therapist.post(`/api/case-events/${extraProgressEvent}/cancel`, {});
    expect(cancelDenied.status).toBe(403);

    const send = await manager.post(`/api/case-events/${extraProgressEvent}/send`, { audience: 'family' });
    expect(send.status).toBe(200);
    const cancel = await manager.post(`/api/case-events/${extraProgressEvent}/cancel`, {});
    expect(cancel.status).toBe(200);
    expect((A.sql.prepare(`SELECT status FROM case_events WHERE id = ?`).get(extraProgressEvent) as { status: string }).status).toBe('cancelled');
  });

  it('KPI: بلوک family_survey با تفکیک by_kind و progress_avg پر می‌شود؛ جدا از چک‌لیست خانواده', async () => {
    const res = await manager.get('/api/kpi/summary?days=30');
    expect(res.status).toBe(200);
    const body = dataOf<{
      family_survey: {
        surveys_sent: number;
        surveys_filled: number;
        response_rate: number | null;
        center_avg: number | null;
        therapist_avg: number | null;
        progress_avg: number | null;
        nps_avg: number | null;
        by_kind: Record<'general' | 'discharge' | 'progress', { sent: number; filled: number }>;
      };
      documentation: { family_requests: number };
    }>(res);
    expect(body.family_survey.surveys_sent).toBe(3);
    expect(body.family_survey.surveys_filled).toBe(2);
    expect(body.family_survey.response_rate).toBe(0.6667); // ۲ از ۳
    expect(body.family_survey.center_avg).toBe(75); // (۱۰۰ + ۵۰) / ۲
    expect(body.family_survey.therapist_avg).toBe(87.5); // (۷۵ + ۱۰۰) / ۲
    expect(body.family_survey.progress_avg).toBe(87.5); // (۱۰۰ + ۷۵) / ۲
    expect(body.family_survey.nps_avg).toBe(7.5);
    expect(body.family_survey.by_kind.discharge).toEqual({ sent: 1, filled: 1 });
    expect(body.family_survey.by_kind.progress).toEqual({ sent: 2, filled: 1 });
    expect(body.family_survey.by_kind.general).toEqual({ sent: 0, filled: 0 });
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
    expect(payload.hm_note?.value).toContain('پرت');
  });
});

describe('موتور صورت‌بندی — ورودی‌های تازه (۱.۲۵.۵۹) در سازه‌ها می‌نشینند', () => {
  /* رویدادها با قرارداد کامل موتور (EngineEvidenceEvent) ساخته می‌شوند و به سازه‌های
     صورت‌بندی (FormulationEvidence.events — قرارداد سبک‌تر) داده می‌شوند؛ هم‌ساخت‌اند. */
  const evidenceOf = (events: EngineEvidenceEvent[]): FormulationEvidence => ({
    events: events as unknown as FormulationEvidence['events'],
    wechsler: null,
    ot: null,
    gates: null,
    child: { id: 'child-test', ageYears: 9 }
  });

  const ev = (over: Partial<EngineEvidenceEvent>): EngineEvidenceEvent => ({
    eventId: 'ev-test',
    typeTitle: 'رویداد آزمون',
    status: 'completed',
    occurredAt: '2026-11-01T10:00:00.000Z',
    payload: null,
    analysis: null,
    bands: null,
    subscales: null,
    ...over
  } as EngineEvidenceEvent);

  it('شرح‌حال v3: نگرانی ساخت‌یافته مستقیم به سازهٔ هم‌نام می‌نشیند', () => {
    const anam = ev({
      toolKey: 'ce-anamnesis-v3',
      payload: {
        chief_complaint: { value: 'افت توجه در درس‌ها', label: 'شکایت' },
        attention_concern: { value: 'زیاد — نگران‌کننده', label: 'توجه' },
        hyper_concern: { value: 'متوسط', label: 'بی‌قراری' },
        home_language: { value: 'دوزبانه', label: 'زبان خانه' }
      }
    });
    const f = formulateCase(evidenceOf([anam]));
    const att = f.constructs.find((c) => c.key === 'attention_exec')!;
    expect(att.evidenceFa.some((e) => e.toolId === 'ce-anamnesis-v3' && e.signal === 'anamnesis3_attention_concern_high')).toBe(true);
    const ext = f.constructs.find((c) => c.key === 'externalizing')!;
    expect(ext.evidenceFa.some((e) => e.toolId === 'ce-anamnesis-v3' && e.signal === 'anamnesis3_hyper_concern_mid')).toBe(true);
  });

  it('ارزیابی عملکردی FX: پرچم حیطه‌ها به توجه/شناخت عمومی می‌نشیند و ضعف چندگانه وزن اضافه می‌گیرد', () => {
    const fx = ev({
      toolKey: 'ce-rehab-fx-v1',
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
    });
    const f = formulateCase(evidenceOf([fx]));
    const att = f.constructs.find((c) => c.key === 'attention_exec')!;
    expect(att.evidenceFa.filter((e) => e.toolId === 'ce-rehab-fx-v1').length).toBeGreaterThanOrEqual(3); // سه ضعف + ضعف چندگانه
    expect(att.evidenceFa.some((e) => e.signal === 'fx_multi_weak')).toBe(true);
    const cog = f.constructs.find((c) => c.key === 'general_cog')!;
    expect(cog.evidenceFa.some((e) => e.toolId === 'ce-rehab-fx-v1' && e.signal === 'fx_ps_weak')).toBe(false); // حل‌مسئله مرزی است نه ضعف
    expect(cog.evidenceFa.some((e) => e.toolId === 'ce-rehab-fx-v1')).toBe(true); // ولی پرچم مرزی می‌آید
  });

  it('پایش خانهٔ v2: زیرمقیاس‌های هم‌نام سازه‌ها به جمع‌بندی می‌نشینند', () => {
    const mon = ev({
      toolKey: 'ce-home-monitor-v2',
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
    });
    const f = formulateCase(evidenceOf([mon]));
    const att = f.constructs.find((c) => c.key === 'attention_exec')!;
    expect(att.evidenceFa.some((e) => e.toolId === 'ce-home-monitor-v2' && e.signal === 'home_mon_attention_exec_danger')).toBe(true);
    const emo = f.constructs.find((c) => c.key === 'internalizing')!;
    expect(emo.evidenceFa.some((e) => e.toolId === 'ce-home-monitor-v2' && e.signal === 'home_mon_internalizing_warn')).toBe(true);
  });

  it('SDQ والد: رویداد تازهٔ کلید جدید زیر قواعد قدیمی می‌نشیند و دوبارشماری ندارد', () => {
    const old = ev({
      toolKey: 'sdq-parent',
      occurredAt: '2026-10-01T10:00:00.000Z',
      analysis: { score: 10, band: 'مرزی', answered: 25, total: 25, maxScore: 50, subscaleScores: [{ id: 'hyper', name: 'بی‌قراری', score: 8, max: 10, band: 'قابل توجه', color: 'danger' }] }
    });
    const newer = ev({
      eventId: 'ev-test-newer',
      toolKey: 'ce-sdq-p-v1',
      occurredAt: '2026-11-05T10:00:00.000Z',
      analysis: { score: 12, band: 'قابل توجه', answered: 25, total: 25, maxScore: 50, subscaleScores: [{ id: 'hyper', name: 'بی‌قراری', score: 9, max: 10, band: 'قابل توجه', color: 'danger' }] }
    });
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

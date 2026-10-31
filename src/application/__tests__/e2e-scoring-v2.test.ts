import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, asRole, createStudent } from '../../test/harness';
import { analyzeChecklist, itemScoreOf, totalPossible } from '../../domain/case-events/pure';
import type { CaseEventField, CaseEventSubscale } from '../../domain/case-events/types';

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

interface TypeRow {
  id: string;
  key: string;
  category: string;
  fields: CaseEventField[];
  bands: { max: number; label: string; color?: string; advice?: string }[] | null;
  subscales: CaseEventSubscale[] | null;
}

interface Analysis {
  score: number;
  band: string | null;
  maxScore: number;
  subscaleScores?: { id: string; name: string; score: number; max: number; band: string | null; color?: string | null }[];
  flags?: { key: string; label: string; value: number }[];
  interpretation?: string | null;
}

describe('seedهای ارتقایافته (روان‌سنجی v2)', () => {
  it('SDQ پنج زیرمقیاس + آیتم معکوس + باند رنگی با توصیه دارد', async () => {
    const A = createTestApp();
    const m = await asRole(A, 'manager');
    const types = dataOf<TypeRow[]>(await m.get('/api/case-events/types?active=true'));
    const sdq = types.find((t) => t.key === 'sdq-parent')!;
    expect(sdq.subscales?.length).toBe(5);
    expect(sdq.subscales?.find((s) => s.id === 'prosocial')?.excludeFromTotal).toBe(true);
    const reversed = sdq.fields.filter((f) => f.reverse).map((f) => f.key);
    expect(reversed.sort()).toEqual(['i07', 'i11', 'i14', 'i23', 'i24'].sort());
    expect(sdq.bands?.every((b) => b.color && b.advice)).toBe(true);
  });

  it('قالب جدید غربال چندگزینه‌ای با نمرهٔ هر گزینه + آیتم بحرانی seed شده است', async () => {
    const A = createTestApp();
    const m = await asRole(A, 'manager');
    const types = dataOf<TypeRow[]>(await m.get('/api/case-events/types?active=true'));
    const q = types.find((t) => t.key === 'quick-multi-v1')!;
    expect(q).toBeTruthy();
    const single = q.fields.filter((f) => f.type === 'single');
    expect(single.length).toBe(4);
    expect(single.every((f) => (f.scoredOptions ?? []).length >= 2)).toBe(true);
    const critical = q.fields.find((f) => f.critical)!;
    expect(critical.key).toBe('q6');
    expect(critical.criticalMin).toBe(3);
  });
});

describe('فرم‌ساز v2: اعتبارسنجی و ساخت قالب', () => {
  it('منشی قالب با گزینه‌ای نمره‌دار + زیرمقیاس می‌سازد (همگانی)', async () => {
    const A = createTestApp();
    const sec = await asRole(A, 'secretary');
    const res = await sec.post('/api/case-events/types', {
      title: 'چک‌لیست آزمون زیرمقیاس',
      category: 'checklist',
      familyFillable: true,
      audience: 'family',
      subscales: [
        { id: 'emo', name: 'هیجانی' },
        { id: 'str', name: 'نقطهٔ قوت', excludeFromTotal: true }
      ],
      fields: [
        { key: 'e1', label: 'نگرانی', type: 'scale', scaleMax: 3, required: true, subscaleId: 'emo' },
        {
          key: 's1', label: 'همکاری', type: 'single', required: true, subscaleId: 'str',
          scoredOptions: [
            { label: 'خوب', score: 3 },
            { label: 'متوسط', score: 1 },
            { label: 'ضعیف', score: 0 }
          ]
        }
      ],
      bands: [
        { max: 2, label: 'مطلوب', color: 'ok', advice: 'ادامه بده' },
        { max: 4, label: 'مرزی', color: 'warn' },
        { max: 9999, label: 'قابل توجه', color: 'danger' }
      ]
    });
    expect(res.status).toBe(201);
    const created = dataOf<TypeRow & { audience: string }>(res);
    expect(created.subscales?.length).toBe(2);
    expect(created.fields.find((f) => f.key === 's1')?.scoredOptions?.length).toBe(3);
  });

  it('single در دستهٔ جلسه رد می‌شود؛ زیرمقیاس ناموجود رد می‌شود؛ زیرمقیاس تکراری رد می‌شود', async () => {
    const A = createTestApp();
    const m = await asRole(A, 'manager');
    const badSingle = await m.post('/api/case-events/types', {
      title: 'فرم جلسهٔ بد',
      category: 'session',
      fields: [{ key: 'x1', label: 'گزینه‌ای', type: 'single', scoredOptions: [{ label: 'الف', score: 0 }, { label: 'ب', score: 1 }] }]
    });
    expect(badSingle.status).toBe(400);

    const badSub = await m.post('/api/case-events/types', {
      title: 'چک‌لیست با زیرمقیاس ناموجود',
      category: 'checklist',
      familyFillable: true,
      fields: [{ key: 'x1', label: 'آیتم', type: 'scale', scaleMax: 2, required: true, subscaleId: 'ghost' }]
    });
    expect(badSub.status).toBe(400);

    const dupSub = await m.post('/api/case-events/types', {
      title: 'چک‌لیست زیرمقیاس تکراری',
      category: 'checklist',
      familyFillable: true,
      subscales: [
        { id: 'a', name: 'یک' },
        { id: 'a', name: 'دو' }
      ],
      fields: [{ key: 'x1', label: 'آیتم', type: 'scale', scaleMax: 2, required: true }]
    });
    expect(dupSub.status).toBe(400);
  });

  it('سقف آخرین باند زیرمقیاس باید بازهٔ زیرمقیاس را بپوشاند', async () => {
    const A = createTestApp();
    const m = await asRole(A, 'manager');
    const res = await m.post('/api/case-events/types', {
      title: 'چک‌لیست باند زیرمقیاس ناقص',
      category: 'checklist',
      familyFillable: true,
      subscales: [{ id: 'emo', name: 'هیجانی', bands: [{ max: 1, label: 'کم', color: 'ok' }] }],
      fields: [
        { key: 'a', label: 'یک', type: 'scale', scaleMax: 3, required: true, subscaleId: 'emo' },
        { key: 'b', label: 'دو', type: 'scale', scaleMax: 3, required: true, subscaleId: 'emo' }
      ]
    });
    expect(res.status).toBe(400);
  });
});

describe('موتور نمره‌گذاری: پر کردن چک‌لیست v2', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Awaited<ReturnType<typeof asRole>>;
  let studentId = '';
  let quickId = '';
  let sdqId = '';
  let quickEventId = '';
  let sdqEventId = '';

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
    const s = await createStudent(manager, { first_name: 'عرشیا', last_name: 'نمره‌آزمون' });
    studentId = s.id;
    const types = dataOf<TypeRow[]>(await manager.get('/api/case-events/types?active=true'));
    quickId = types.find((t) => t.key === 'quick-multi-v1')!.id;
    sdqId = types.find((t) => t.key === 'sdq-parent')!.id;

    const ev1 = await manager.post(`/api/students/${studentId}/case-events`, { eventTypeId: quickId, values: {} });
    expect(ev1.status).toBe(201);
    quickEventId = dataOf<{ id: string }>(ev1).id;

    const ev2 = await manager.post(`/api/students/${studentId}/case-events`, { eventTypeId: sdqId, values: {} });
    expect(ev2.status).toBe(201);
    sdqEventId = dataOf<{ id: string }>(ev2).id;
  });

  function tokenOf(eventId: string): string {
    const row = A.sql.prepare(`SELECT fill_token FROM case_events WHERE id = ?`).get(eventId) as { fill_token: string };
    return row.fill_token;
  }

  it('غربال چندگزینه‌ای: نمرهٔ گزینه + معکوس + پرچم بحرانی + تفسیر خودکار', async () => {
    const answers = { q1: 2, q2: 1, q3: 3, q4: 1, q5: 0, q6: 3 };
    const res = await A.app.request(`/public/case-events/${quickEventId}/fill`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: tokenOf(quickEventId), answers })
    });
    expect(res.status).toBe(200);

    const ev = dataOf<{ analysis: Analysis; payload: Record<string, { value: string }> }>(
      await manager.get(`/api/case-events/${quickEventId}`)
    );
    const a = ev.analysis;
    expect(a.score).toBe(12);
    expect(a.maxScore).toBe(17);
    expect(a.band).toBe('مرزی — نیاز به توجه');
    expect(a.flags?.map((f) => f.key)).toEqual(['q6']);
    expect(a.interpretation).toContain('آیتم بحرانی');
    expect(a.interpretation).toContain('نمرهٔ کل: ۱۲ از ۱۷');
    expect(ev.payload.q6.value).toBe('جسمی — به خود یا دیگری');
  });

  it('SDQ: زیرمقیاس نقاط قوت از نمرهٔ کل خارج است و باند معکوس‌جهت می‌گیرد', async () => {
    const answers: Record<string, number> = {};
    const keys = Array.from({ length: 25 }, (_, i) => `i${String(i + 1).padStart(2, '0')}`);
    for (const k of keys) answers[k] = 0;
    for (const k of ['i03', 'i08', 'i13', 'i16']) answers[k] = 2;
    for (const k of ['i07', 'i11', 'i14', 'i23', 'i24']) answers[k] = 2;
    const res = await A.app.request(`/public/case-events/${sdqEventId}/fill`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: tokenOf(sdqEventId), answers })
    });
    expect(res.status).toBe(200);

    const ev = dataOf<{ analysis: Analysis }>(await manager.get(`/api/case-events/${sdqEventId}`));
    const a = ev.analysis;
    expect(a.score).toBe(8); // فقط هیجانی؛ prosocial (همه ۰) خارج از کل
    expect(a.maxScore).toBe(38); // ۱۹ آیتم داخل جمع × ۲
    const emo = a.subscaleScores?.find((s) => s.id === 'emotional')!;
    expect(emo.score).toBe(8);
    expect(emo.band).toBe('قابل توجه — نیاز به بررسی بیشتر'); // — برچسب سادهٔ باند
    const pros = a.subscaleScores?.find((s) => s.id === 'prosocial')!;
    expect(pros.score).toBe(0);
    expect(pros.band).toBe('نیازمند تقویت — قابل توجه'); // باند جهت معکوس نقاط قوت
    expect(a.interpretation).toContain('هیجانی و اضطرابی');
  });
});

describe('حذف رویداد و قالب (فقط مدیر — دستور کاربر)', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Awaited<ReturnType<typeof asRole>>;
  let therapist: Awaited<ReturnType<typeof asRole>>;
  let studentId = '';
  let sessionId = '';
  let unusedTypeId = '';

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
    therapist = await asRole(A, 'therapist');
    const s = await createStudent(manager, { first_name: 'سارا', last_name: 'حذف‌آزمون' });
    studentId = s.id;
    const types = dataOf<TypeRow[]>(await manager.get('/api/case-events/types?active=true'));
    const sessionType = types.find((t) => t.category === 'session')!;
    const reqFields = sessionType.fields.filter((f) => f.required);
    const values: Record<string, string | number> = {};
    for (const f of reqFields) {
      if ((f.type === 'select') && f.options?.length) values[f.key] = f.options[0];
      else if (f.type === 'single' && f.scoredOptions?.length) values[f.key] = 0;
      else if (f.type === 'scale' || f.type === 'number') values[f.key] = 1;
      else values[f.key] = `مقدار آزمون ${f.label}`;
    }
    const ev = await therapist.post(`/api/students/${studentId}/case-events`, {
      eventTypeId: sessionType.id,
      values
    });
    if (ev.status !== 201) console.log('DEBUG-EV:', JSON.stringify(ev.body));
    expect(ev.status).toBe(201);
    sessionId = dataOf<{ id: string }>(ev).id;

    const nt = await manager.post('/api/case-events/types', {
      title: 'قالب بی‌استفاده برای حذف',
      category: 'note',
      fields: [{ key: 'n1', label: 'یادداشت', type: 'text' }]
    });
    expect(nt.status).toBe(201);
    unusedTypeId = dataOf<{ id: string }>(nt).id;
  });

  it('درمانگر اجازهٔ حذف ندارد (۴۰۳)', async () => {
    const res = await therapist.delete(`/api/case-events/${sessionId}`);
    expect(res.status).toBe(403);
  });

  it('مدیر حذف می‌کند؛ رویداد از تایم‌لاین/جزئیات حذف می‌شود', async () => {
    const before = dataOf<Array<{ id: string }>>(await manager.get(`/api/students/${studentId}/case-events`));
    expect(before.some((e) => e.id === sessionId)).toBe(true);

    const del = await manager.delete(`/api/case-events/${sessionId}`);
    expect(del.status).toBe(200);

    const after = dataOf<Array<{ id: string }>>(await manager.get(`/api/students/${studentId}/case-events`));
    expect(after.some((e) => e.id === sessionId)).toBe(false);
    const gone = await manager.get(`/api/case-events/${sessionId}`);
    expect(gone.status).toBe(404);
    expect((await manager.delete(`/api/case-events/${sessionId}`)).status).toBe(404);
  });

  it('حذف قالب با رویداد متصل رد می‌شود (۴۰۹)؛ قالب بی‌استفاده حذف می‌شود؛ منشی اجازهٔ حذف ندارد', async () => {
    const types = dataOf<TypeRow[]>(await manager.get('/api/case-events/types'));
    const usedType = types.find((t) => t.key === 'session-report') ?? types.find((t) => t.category === 'session')!;
    expect((await manager.delete(`/api/case-events/types/${usedType.id}`)).status).toBe(409);

    const sec = await asRole(A, 'secretary');
    expect((await sec.delete(`/api/case-events/types/${unusedTypeId}`)).status).toBe(403);

    const del = await manager.delete(`/api/case-events/types/${unusedTypeId}`);
    expect(del.status).toBe(200);
    const typesAfter = dataOf<TypeRow[]>(await manager.get('/api/case-events/types'));
    expect(typesAfter.some((t) => t.id === unusedTypeId)).toBe(false);
  });
});

describe('سازگاری قالب قدیمی (بدون v2)', () => {
  const LEGACY: CaseEventField[] = [
    { key: 'a', label: 'آیتم یک', type: 'scale', scaleMax: 3 },
    { key: 'b', label: 'آیتم دو', type: 'scale', scaleMax: 3 }
  ];

  it('analyzeChecklist بدون زیرمقیاس همان نتیجهٔ v1 را می‌دهد', () => {
    const a = analyzeChecklist(LEGACY, [{ max: 2, label: 'کم' }, { max: 9999, label: 'زیاد' }], { a: 2, b: 1 });
    expect(a.score).toBe(3);
    expect(a.maxScore).toBe(6);
    expect(a.band).toBe('زیاد');
    expect(a.subscaleScores).toEqual([]);
  });

  it('itemScoreOf معکوس و گزینه‌ای نمره‌دار', () => {
    const rev: CaseEventField = { key: 'r', label: 'معکوس', type: 'scale', scaleMax: 2, reverse: true };
    expect(itemScoreOf(rev, 0)).toBe(2);
    expect(itemScoreOf(rev, 2)).toBe(0);
    const single: CaseEventField = {
      key: 's', label: 'گزینه‌ای', type: 'single',
      scoredOptions: [{ label: 'الف', score: 0 }, { label: 'ب', score: 3 }]
    };
    expect(itemScoreOf(single, 1)).toBe(3);
    expect(() => itemScoreOf(single, 5)).toThrow();
  });

  it('totalPossible زیرمقیاس خارج از کل را حذف می‌کند', () => {
    const subs: CaseEventSubscale[] = [{ id: 'str', name: 'قوت', excludeFromTotal: true }];
    const fields: CaseEventField[] = [
      { key: 'a', label: 'یک', type: 'scale', scaleMax: 3 },
      { key: 'b', label: 'دو', type: 'scale', scaleMax: 2, subscaleId: 'str' }
    ];
    expect(totalPossible(fields, subs)).toBe(3);
    expect(totalPossible(fields, null)).toBe(5);
  });
});

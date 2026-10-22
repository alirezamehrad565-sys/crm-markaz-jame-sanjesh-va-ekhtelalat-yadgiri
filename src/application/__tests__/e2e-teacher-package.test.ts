import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  createTestApp,
  asRole,
  createStudent,
  SCHOOL1_ID
} from '../../test/harness';
import { packageComponentsOf } from '../../domain/case-events/pure';

const PKG = 'ce-comp-teacher-v2';
const COMPONENTS = ['ce-snap-iv-t-v1', 'ce-sdq-t-v1', 'ce-sld-class-t-v1'];

describe('انتخاب معلم — CRUD معلم‌های پرونده (student_teachers)', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: ReturnType<typeof asRole> extends Promise<infer T> ? T : never;
  let therapist: ReturnType<typeof asRole> extends Promise<infer T> ? T : never;
  let studentId = '';

  const dataOf = <T>(res: { body: unknown }): T => (res.body as { data: T }).data;

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
    therapist = await asRole(A, 'therapist');
    const s = await createStudent(manager, { first_name: 'آوا', last_name: 'معلم‌آزمون' });
    studentId = s.id;
  });

  it('افزودن معلم (نام/کلاس/راه ارتباطی) → ۲۰۱ و فهرست؛ تکرار نام → ۴۰۹؛ نام کوتاه → ۴۰۰', async () => {
    const ok = await manager.post(`/api/students/${studentId}/teachers`, {
      name: 'سرکار موسوی',
      class_label: 'چهارم ب — ریاضی',
      contact: '09121112233'
    });
    expect(ok.status).toBe(201);
    const t = dataOf<{ id: string; name: string; classLabel: string | null; contact: string | null; studentId: string }>(ok);
    expect(t.name).toBe('سرکار موسوی');
    expect(t.classLabel).toBe('چهارم ب — ریاضی');
    expect(t.studentId).toBe(studentId);

    const dup = await manager.post(`/api/students/${studentId}/teachers`, { name: 'سرکار موسوی' });
    expect(dup.status).toBe(409);

    const short = await manager.post(`/api/students/${studentId}/teachers`, { name: 'م' });
    expect(short.status).toBe(400);

    const list = dataOf<Array<{ id: string; name: string }>>(await manager.get(`/api/students/${studentId}/teachers`));
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('سرکار موسوی');
  });

  it('درمانگر هم می‌تواند معلم اضافه/حذف کند (سه نقش مرکز — جریان فرم معلم)', async () => {
    const ok = await therapist.post(`/api/students/${studentId}/teachers`, { name: 'جناب رحیمی', class_label: 'نظرات' });
    expect(ok.status).toBe(201);
    const id = dataOf<{ id: string }>(ok).id;
    expect((await therapist.delete(`/api/students/${studentId}/teachers/${id}`)).status).toBe(204);
    expect((await therapist.delete(`/api/students/${studentId}/teachers/${id}`)).status).toBe(404);
  });

  it('seed یکتای مایگریشن 0062 — معلمِ کلاس فعلی یک‌بار می‌آید؛ اجرای دوباره ردیف تازه نمی‌سازد؛ ستون‌های قدیمی دست‌نخورده', async () => {
    A.sql.prepare(
      `INSERT INTO classes (id, school_id, name, teacher_name, teacher_phone, active)
       VALUES ('c-t7-seed', ?, 'پنجم الف', 'سرکار امینی', '09120000001', 1)`
    ).run(SCHOOL1_ID);
    A.sql.prepare(
      `INSERT INTO students (id, national_id, first_name, last_name, class_id, active)
       VALUES ('s-t7-seed', '1000000077', 'سام', 'کلاسی', 'c-t7-seed', 1)`
    ).run();
    const migration = readFileSync(path.resolve(__dirname, '../../../migrations/0062_student_teachers.sql'), 'utf8');
    A.sql.exec(migration);
    A.sql.exec(migration); // idempotent
    const rows = A.sql.prepare(`SELECT name, class_label, contact FROM student_teachers WHERE student_id = 's-t7-seed'`).all() as Array<{ name: string; class_label: string; contact: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('سرکار امینی');
    expect(rows[0].class_label).toBe('پنجم الف');
    expect(rows[0].contact).toBe('09120000001');
    const cls = A.sql.prepare(`SELECT teacher_name, teacher_phone FROM classes WHERE id = 'c-t7-seed'`).get() as { teacher_name: string; teacher_phone: string };
    expect(cls.teacher_name).toBe('سرکار امینی');
  });
});

describe('فرم جامع معلم (ce-comp-teacher-v2) — پکیج + گره‌خوردن معلم', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: ReturnType<typeof asRole> extends Promise<infer T> ? T : never;
  let studentId = '';
  let teacher1 = { id: '', name: 'سرکار موسوی' };
  let teacher2 = { id: '', name: 'جناب کاظمی' };
  const typeIds: Record<string, string> = {};
  let ev1Id = '';
  let ev2Id = '';

  const dataOf = <T>(res: { body: unknown }): T => (res.body as { data: T }).data;
  const fieldsOf = (key: string): { key: string; type: string; scaleMax?: number }[] =>
    JSON.parse((A.sql.prepare(`SELECT fields FROM case_event_types WHERE key = ?`).get(key) as { fields: string }).fields);

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
    const s = await createStudent(manager, { first_name: 'امید', last_name: 'معلم‌جامع' });
    studentId = s.id;
    const t1 = await manager.post(`/api/students/${studentId}/teachers`, { name: teacher1.name, class_label: 'چهارم ب' });
    teacher1 = { ...teacher1, id: dataOf<{ id: string }>(t1).id };
    const t2 = await manager.post(`/api/students/${studentId}/teachers`, { name: teacher2.name, class_label: 'هنر' });
    teacher2 = { ...teacher2, id: dataOf<{ id: string }>(t2).id };
    const types = dataOf<Array<{ id: string; key: string; active: boolean }>>(await manager.get('/api/case-events/types?active=true'));
    for (const k of [PKG, ...COMPONENTS]) {
      const t = types.find((x) => x.key === k);
      expect(t, k).toBeTruthy();
      typeIds[k] = t!.id;
    }
  });

  it('قرارداد کامپوننت‌ها: packageComponentsOf ≡ battery-composite.json و تکی‌های v1 معلم فعال‌اند', async () => {
    expect(packageComponentsOf(PKG)).toEqual(COMPONENTS);
    expect(packageComponentsOf('ce-comp-family-v2')).toEqual(['ce-snap-iv-p-v1', 'ce-sdq-p-v1', 'ce-scared-p-v1', 'ce-id-adapt-v1']);
    expect(packageComponentsOf('ce-snap-iv-t-v1')).toBeNull();
    const pkgRow = A.sql.prepare(`SELECT fields, audience, family_fillable FROM case_event_types WHERE key = ?`).get(PKG) as { fields: string; audience: string; family_fillable: number };
    const ctxFields = JSON.parse(pkgRow.fields) as Array<{ key: string; type: string }>;
    expect(ctxFields.some((f) => f.type === 'heading')).toBe(true);
    expect(ctxFields.every((f) => f.type !== 'scale' && f.type !== 'single')).toBe(true);
    expect(pkgRow.audience).toBe('teacher');
    const subsOf = (key: string): string[] =>
      JSON.parse((A.sql.prepare(`SELECT subscales FROM case_event_types WHERE key = ?`).get(key) as { subscales: string }).subscales ?? '[]').map((s: { id: string }) => s.id);
    expect(subsOf('ce-snap-iv-t-v1')).toEqual(subsOf('ce-snap-iv-p-v1'));
    expect(subsOf('ce-sdq-t-v1')).toEqual(subsOf('ce-sdq-p-v1'));
    expect(subsOf('ce-sld-class-t-v1')).toEqual(['sld_read', 'sld_write', 'sld_calc']);
  });

  it('صدور لینک مستقل به‌ازای هر معلم — دو معلم، دو لینک متمایز؛ نام معلم گره می‌خورد', async () => {
    const ev1 = dataOf<{ id: string }>(await manager.post(`/api/students/${studentId}/case-events`, { eventTypeId: typeIds[PKG], values: {} }));
    const ev2 = dataOf<{ id: string }>(await manager.post(`/api/students/${studentId}/case-events`, { eventTypeId: typeIds[PKG], values: {} }));
    ev1Id = ev1.id;
    ev2Id = ev2.id;
    const l1 = await manager.post(`/api/case-events/${ev1.id}/teacher-link`, { teacher_name: teacher1.name, teacher_id: teacher1.id });
    expect(l1.status).toBe(200);
    const out1 = dataOf<{ link: string; teacherName: string }>(l1);
    expect(out1.teacherName).toBe(teacher1.name);
    expect(out1.link).toContain(`/public/case-events/${ev1.id}/fill?token=`);

    const l2 = await manager.post(`/api/case-events/${ev2.id}/teacher-link`, { teacher_name: teacher2.name, teacher_id: teacher2.id });
    const out2 = dataOf<{ link: string }>(l2);
    expect(out2.link).not.toBe(out1.link);
    expect(out2.link).toContain(`/public/case-events/${ev2.id}/fill?token=`);

    const bad = await manager.post(`/api/case-events/${ev2.id}/teacher-link`, { teacher_name: '  ' });
    expect(bad.status).toBe(400);
  });

  it('GET صفحهٔ پکیج معلم → سربرگ «فرم شما — X» + سه بخش + ملاک‌های کلاسی', async () => {
    const row = A.sql.prepare(`SELECT id, fill_token FROM case_events WHERE id = ?`).get(ev1Id) as { id: string; fill_token: string };
    const page = await A.app.request(`/public/case-events/${row.id}/fill?token=${row.fill_token}`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('فرم جامع معلم');
    expect(html).toContain('فرم شما — سرکار موسوی');
    expect(html).toContain('مشاهدهٔ کلاس و زمینهٔ گزارش معلم');
    expect(html).toContain('بخش ۲ از ۴ — چک‌لیست توجه و بی‌قراری — فرم معلم (SNAP-IV)');
    expect(html).toContain('بخش ۳ از ۴ — پرسش‌نامهٔ رفتار کودک — فرم معلم (SDQ)');
    expect(html).toContain('بخش ۴ از ۴ — ملاک‌های کلاسی خواندن/نوشتن/حساب — فرم معلم');
    expect(html).toContain('در دیکته، خطای حذف یا جابه‌جایی حرف‌ها دارد');
    expect(html).toContain('به‌روشنی و مکرر');
    expect(html).toContain(row.fill_token);
  });

  it('POST پکیج معلم → رویداد مستقل هر کامپوننت + زمینه؛ همه «پاسخ معلم: X» دارند؛ POST دوباره → ۴۰۹', async () => {
    const row = A.sql.prepare(`SELECT id, fill_token FROM case_events WHERE id = ?`).get(ev1Id) as { id: string; fill_token: string };

    const answers: Record<string, number | string> = {};
    for (const k of COMPONENTS) for (const f of fieldsOf(k)) answers[f.key] = 0;
    for (let i = 1; i <= 9; i++) answers[`s0${i}`] = 3;
    answers['r01'] = 1; answers['r02'] = 1; answers['r03'] = 1;
    for (const k of ['m01', 'm02', 'm03', 'm04']) answers[k] = 2;
    answers['obs_role'] = 'معلم کلاس';
    answers['obs_period'] = 'بیش از یک سال';
    answers['main_concern'] = 'در کلاس ریاضی گیر می‌کند';

    const post = await A.app.request(`/public/case-events/${row.id}/fill`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: row.fill_token, answers })
    });
    expect(post.status).toBe(200);

    const post2 = await A.app.request(`/public/case-events/${row.id}/fill`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: row.fill_token, answers })
    });
    expect(post2.status).toBe(409);

    const anchor = A.sql.prepare(`SELECT status, payload FROM case_events WHERE id = ?`).get(row.id) as { status: string; payload: string };
    expect(anchor.status).toBe('completed');
    const anchorPayload = JSON.parse(anchor.payload) as Record<string, { value: string; label: string }>;
    expect(anchorPayload.teacher_name).toEqual({ value: 'سرکار موسوی', label: 'پاسخ معلم' });
    expect(anchorPayload.obs_role.value).toBe('معلم کلاس');
    expect(anchorPayload.main_concern.value).toBe('در کلاس ریاضی گیر می‌کند');

    const rows = A.sql.prepare(
      `SELECT t.key AS type_key, e.payload, e.analysis
         FROM case_events e JOIN case_event_types t ON t.id = e.event_type_id
        WHERE e.student_id = ? AND e.status = 'completed' AND e.id != ?`
    ).all(studentId, row.id) as Array<{ type_key: string; payload: string; analysis: string }>;
    const byKey = Object.fromEntries(rows.map((r) => [r.type_key, r]));
    expect(Object.keys(byKey)).toEqual(expect.arrayContaining(COMPONENTS));

    const payOf = (k: string) => JSON.parse(byKey[k].payload) as Record<string, { value: string; label: string }>;
    const anOf = (k: string) => JSON.parse(byKey[k].analysis) as { score: number; band: string | null; subscaleScores: { id: string; score: number; max: number; band: string | null }[] };

    for (const k of COMPONENTS) {
      expect(payOf(k).teacher_name, k).toEqual({ value: 'سرکار موسوی', label: 'پاسخ معلم' });
    }
    const snap = anOf('ce-snap-iv-t-v1');
    expect(snap.subscaleScores.map((s) => s.id)).toEqual(['ia', 'hi', 'odd']);
    expect(snap.subscaleScores.find((s) => s.id === 'ia')!.score).toBe(27);
    expect(snap.subscaleScores.find((s) => s.id === 'ia')!.band).toBe('قابل توجه — نیاز به بررسی بیشتر');
    const sld = anOf('ce-sld-class-t-v1');
    expect(sld.subscaleScores.map((s) => s.id)).toEqual(['sld_read', 'sld_write', 'sld_calc']);
    expect(sld.subscaleScores.find((s) => s.id === 'sld_read')!.score).toBe(3);
    expect(sld.subscaleScores.find((s) => s.id === 'sld_read')!.band).toBe('مرزی — نیاز به توجه');
    expect(sld.subscaleScores.find((s) => s.id === 'sld_calc')!.score).toBe(8);
    expect(sld.subscaleScores.find((s) => s.id === 'sld_write')!.band).toBe('در محدودهٔ عادی');
  });

  it('POST ناقص (زمینهٔ الزامی جامانده) → ۴۰۹ و هیچ رویدادی ساخته نمی‌شود', async () => {
    const created = dataOf<{ id: string }>(await manager.post(`/api/students/${studentId}/case-events`, { eventTypeId: typeIds[PKG], values: {} }));
    const tokenRow = A.sql.prepare(`SELECT fill_token FROM case_events WHERE id = ?`).get(created.id) as { fill_token: string };
    const answers: Record<string, number | string> = {};
    for (const k of COMPONENTS) for (const f of fieldsOf(k)) answers[f.key] = 1;
    answers['obs_role'] = 'معلم کلاس'; // obs_period جامانده (الزامی)
    const post = await A.app.request(`/public/case-events/${created.id}/fill`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: tokenRow.fill_token, answers })
    });
    expect(post.status).toBe(409);
    const anchorRow = A.sql.prepare(`SELECT status FROM case_events WHERE id = ?`).get(created.id) as { status: string };
    expect(anchorRow.status).toBe('pending_family');
  });

  it('معلم دوم روی رویداد مستقل خودش — «پاسخ معلم: جناب کاظمی»', async () => {
    const row = A.sql.prepare(`SELECT id, fill_token, payload FROM case_events WHERE id = ?`).get(ev2Id) as { id: string; fill_token: string; payload: string };
    expect((JSON.parse(row.payload) as { teacher_binding: { name: string } }).teacher_binding.name).toBe(teacher2.name);
    const answers: Record<string, number | string> = {};
    for (const k of COMPONENTS) for (const f of fieldsOf(k)) answers[f.key] = 1;
    answers['obs_role'] = 'معلم ویژهٔ درس (مثل ریاضی یا فارسی)';
    answers['obs_period'] = 'سه تا شش ماه';
    const post = await A.app.request(`/public/case-events/${row.id}/fill`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: row.fill_token, answers })
    });
    expect(post.status).toBe(200);
    const anchor = A.sql.prepare(`SELECT payload FROM case_events WHERE id = ?`).get(row.id) as { payload: string };
    const payload = JSON.parse(anchor.payload) as Record<string, { value: string; label: string }>;
    expect(payload.teacher_name.value).toBe('جناب کاظمی');
  });

  it('ارسال بله با اتصال معلم → قالب bot_teacher_package_link + لینک در پاسخ + اتصال ثبت می‌شود', async () => {
    A.sql.prepare(
      `INSERT INTO classes (id, school_id, name, teacher_name, teacher_phone, active)
       VALUES ('c-t7-chat', ?, 'پنجم ب', 'سرکار موسوی', '09120000002', 1)`
    ).run(SCHOOL1_ID);
    A.sql.prepare(`UPDATE students SET class_id = 'c-t7-chat' WHERE id = ?`).run(studentId);
    A.sql.prepare(
      `INSERT INTO class_bot_links (id, code, class_id, chat_id, status, created_by, created_at, updated_at)
       VALUES ('cbl-t7-1', 'T7CLASS1', 'c-t7-chat', '9152', 'linked', 'seed', datetime('now'), datetime('now'))`
    ).run();
    const created = dataOf<{ id: string }>(await manager.post(`/api/students/${studentId}/case-events`, { eventTypeId: typeIds[PKG], values: {} }));
    const send = await manager.post(`/api/case-events/${created.id}/send`, {
      audience: 'teacher',
      teacher_name: teacher1.name,
      teacher_id: teacher1.id,
      note: 'لطفاً تا پایان هفته تکمیل کنید'
    });
    expect(send.status).toBe(200);
    const out = dataOf<{ sent: number; targets: string[]; link: string }>(send);
    expect(out.sent).toBeGreaterThanOrEqual(1);
    expect(out.targets).toContain('9152');
    expect(out.link).toContain(`/public/case-events/${created.id}/fill?token=`);
    const anchor = A.sql.prepare(`SELECT payload FROM case_events WHERE id = ?`).get(created.id) as { payload: string };
    expect((JSON.parse(anchor.payload) as { teacher_binding: { name: string } }).teacher_binding.name).toBe(teacher1.name);
    const notif = A.sql.prepare(`SELECT template, recipient FROM notifications WHERE student_id = ? AND template = 'bot_teacher_package_link'`).get(studentId) as { template: string; recipient: string };
    expect(notif.template).toBe('bot_teacher_package_link');
    expect(notif.recipient).toBe('9152');
  });

  it('رگرسیون تکی معلم: snap-t مستقل بدون اتصال → payload بدون «پاسخ معلم»؛ با اتصال → «پاسخ معلم» دارد؛ صفحهٔ تکی بدون «فرم شما —»', async () => {
    const created = dataOf<{ id: string }>(await manager.post(`/api/students/${studentId}/case-events`, { eventTypeId: typeIds['ce-snap-iv-t-v1'], values: {} }));
    const tokenRow = A.sql.prepare(`SELECT fill_token FROM case_events WHERE id = ?`).get(created.id) as { fill_token: string };
    const page = await A.app.request(`/public/case-events/${created.id}/fill?token=${tokenRow.fill_token}`);
    expect(page.status).toBe(200);
    expect(await page.text()).not.toContain('فرم شما — ');
    const answers: Record<string, number> = {};
    for (const f of fieldsOf('ce-snap-iv-t-v1')) answers[f.key] = 1;
    const post = await A.app.request(`/public/case-events/${created.id}/fill`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: tokenRow.fill_token, answers })
    });
    expect(post.status).toBe(200);
    const rec = A.sql.prepare(`SELECT payload, analysis FROM case_events WHERE id = ?`).get(created.id) as { payload: string; analysis: string };
    const payload = JSON.parse(rec.payload) as Record<string, unknown>;
    expect(payload['teacher_name']).toBeUndefined();
    const a = JSON.parse(rec.analysis) as { score: number; subscaleScores: { id: string }[] };
    expect(a.score).toBe(26);
    expect(a.subscaleScores.map((s) => s.id)).toEqual(['ia', 'hi', 'odd']);

    const created2 = dataOf<{ id: string }>(await manager.post(`/api/students/${studentId}/case-events`, { eventTypeId: typeIds['ce-sdq-t-v1'], values: {} }));
    await manager.post(`/api/case-events/${created2.id}/teacher-link`, { teacher_name: teacher2.name, teacher_id: teacher2.id });
    const tokenRow2 = A.sql.prepare(`SELECT fill_token FROM case_events WHERE id = ?`).get(created2.id) as { fill_token: string };
    const page2 = await A.app.request(`/public/case-events/${created2.id}/fill?token=${tokenRow2.fill_token}`);
    expect((await page2.text())).toContain('فرم شما — جناب کاظمی');
    const answers2: Record<string, number> = {};
    for (const f of fieldsOf('ce-sdq-t-v1')) answers2[f.key] = 0;
    const post2 = await A.app.request(`/public/case-events/${created2.id}/fill`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: tokenRow2.fill_token, answers: answers2 })
    });
    expect(post2.status).toBe(200);
    const rec2 = A.sql.prepare(`SELECT payload FROM case_events WHERE id = ?`).get(created2.id) as { payload: string };
    const payload2 = JSON.parse(rec2.payload) as Record<string, { value: string; label: string }>;
    expect(payload2.teacher_name).toEqual({ value: 'جناب کاظمی', label: 'پاسخ معلم' });
  });
});

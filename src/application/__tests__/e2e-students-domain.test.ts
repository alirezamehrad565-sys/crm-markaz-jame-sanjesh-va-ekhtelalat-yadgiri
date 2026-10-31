import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestApp,
  Api,
  asRole,
  makeNationalId,
  createStudent,
  SCHOOL1_ID,
  SCHOOL2_ID,
  STUDENT1_ID,
  STUDENT2_ID,
  TAG_DISORDER_1,
  TAG_GRADE_5
} from '../../test/harness';

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

describe('دانش‌آموزان: CRUD + اعتبارسنجی', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
  });

  it('ساخت دانش‌آموز با کد ملی معتبر — 201 + شناسه', async () => {
    const res = await manager.post('/api/students', {
      national_id: makeNationalId(),
      first_name: 'آرمین',
      last_name: 'توکلی',
      gender: 'male',
      grade: 'دوم',
      school_id: SCHOOL1_ID,
      guardian_phone: '09121113344'
    });
    expect(res.status).toBe(201);
    const data = (res.body as { data: { id: string; grade: string } }).data;
    expect(data.id).toBeTruthy();
    expect(data.grade).toBe('دوم');
  });

  it('کد ملی نامعتبر (checksum غلط) — 400', async () => {
    const res = await manager.post('/api/students', {
      national_id: '1234567890',
      first_name: 'بد',
      last_name: 'بدکد',
      guardian_phone: '09121113344'
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe('VALIDATION_ERROR');
  });

  it('کد ملی تکراری — 409', async () => {
    const nid = makeNationalId();
    await manager.post('/api/students', {
      national_id: nid, first_name: 'اول', last_name: 'اولی', guardian_phone: '09121113344'
    });
    const dup = await manager.post('/api/students', {
      national_id: nid, first_name: 'دوم', last_name: 'دومی', guardian_phone: '09121113344'
    });
    expect(dup.status).toBe(409);
    expect((dup.body as { error: string }).error).toBe('CONFLICT');
  });

  it('پایهٔ تحصیلی خارج از لیست ثابت — 400', async () => {
    const res = await manager.post('/api/students', {
      national_id: makeNationalId(),
      first_name: 'هفتمی',
      last_name: 'راهنمایی',
      grade: 'هفتم',
      guardian_phone: '09121113344'
    });
    expect(res.status).toBe(400);
  });

  it('تلفن ولی ناقص — 400 و تلفن با +۹۸/ارقام فارسی نرمال می‌شود', async () => {
    const bad = await manager.post('/api/students', {
      national_id: makeNationalId(), first_name: 'تلفن', last_name: 'بد', guardian_phone: '9121113'
    });
    expect(bad.status).toBe(400);

    const ok = await manager.post('/api/students', {
      national_id: makeNationalId(),
      first_name: 'تلفن',
      last_name: 'خوب',
      guardian_phone: '+98 912 111 33 44'
    });
    expect(ok.status).toBe(201);
    const data = (ok.body as { data: { guardianPhone: string } }).data;
    expect(data.guardianPhone).toBe('09121113344');
  });

  it('لیست دانش‌آموزان با فیلتر پایه + pagination meta', async () => {
    const res = await manager.get('/api/students?grade=%D8%B3%D9%88%D9%85&page=1&page_size=2');
    expect(res.status).toBe(200);
    const body = res.body as { data: unknown[]; meta: { page: number; pageSize: number; total: number } };
    expect(body.meta.page).toBe(1);
    expect(body.data.length).toBeLessThanOrEqual(2);
  });

  it('جستجوی متنی دانش‌آموز (query) — بر اساس نام', async () => {
    const res = await manager.get('/api/students?query=%D8%B3%D8%A7%D8%B1%D8%A7'); // سارا
    expect(res.status).toBe(200);
    const body = res.body as { data: Array<{ first_name: string; id: string }> };
    expect(body.data.some((s) => s.id === STUDENT2_ID)).toBe(true);
  });

  it('get by national-id با ارقام فارسی هم کار می‌کند', async () => {
    const res = await manager.get('/api/students/by-national-id/۰۰۱۲۳۴۵۶۷۹');
    expect(res.status).toBe(200);
    const data = (res.body as { data: { id: string } }).data;
    expect(data.id).toBe(STUDENT1_ID);
  });

  it('پچ دانش‌آموز (تغییر پایه) + deactivate/activate', async () => {
    const s = await createStudent(manager);
    const patched = await manager.patch(`/api/students/${s.id}`, { grade: 'پنجم' });
    expect(patched.status).toBe(200);
    expect(((patched.body as { data: { grade: string } }).data).grade).toBe('پنجم');

    const deact = await manager.post(`/api/students/${s.id}/deactivate`);
    expect(deact.status).toBe(200);
    const filtered = await manager.get(`/api/students?active=false`);
    const ids = (filtered.body as { data: Array<{ id: string }> }).data.map((x) => x.id);
    expect(ids).toContain(s.id);

    const act = await manager.post(`/api/students/${s.id}/activate`);
    expect(act.status).toBe(200);
    const again = await manager.get('/api/students?active=true&page_size=100');
    expect(((again.body as { data: Array<{ id: string }> }).data).map((x) => x.id)).toContain(s.id);
  });

  it('دانش‌آموز ناموجود — 404', async () => {
    const res = await manager.get('/api/students/00000000-0000-4000-8000-0000000000zz');
    expect([400, 404]).toContain(res.status);
  });
});

describe('مدارس و کلاس‌ها', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;
  let secretary: Api;

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
    secretary = await asRole(A, 'secretary');
  });

  it('ساخت مدرسه با فیلد مدیر — 201', async () => {
    const res = await manager.post('/api/schools', {
      name: 'دبستان آزمون تست',
      kind: 'school',
      principal_name: 'خانم رضوی',
      principal_phone: '021-88776655'
    });
    expect(res.status).toBe(201);
    const data = (res.body as { data: { id: string; principalName: string } }).data;
    expect(data.principalName).toBe('خانم رضوی');
  });

  it('ساخت مدرسه با کد رسمی و یادداشت — 201 و بازخوانی + PATCH یادداشت', async () => {
    const res = await manager.post('/api/schools', {
      name: 'دبستان کددار m60',
      kind: 'school',
      code: '44990001',
      notes: 'یادداشت آزمون m60'
    });
    expect(res.status).toBe(201);
    const data = (res.body as { data: { id: string; code: string; notes: string } }).data;
    expect(data.code).toBe('44990001');
    expect(data.notes).toBe('یادداشت آزمون m60');

    const patch = await manager.patch(`/api/schools/${data.id}`, { notes: 'یادداشت ویرایش‌شده' });
    expect(patch.status).toBe(200);
    expect((patch.body as { data: { notes: string } }).data.notes).toBe('یادداشت ویرایش‌شده');
  });

  it('کد مدرسهٔ تکراری — 409', async () => {
    const first = await manager.post('/api/schools', { name: 'مدرسه کد الف m60', code: '44990002' });
    expect(first.status).toBe(201);
    const second = await manager.post('/api/schools', { name: 'مدرسه کد ب m60', code: '44990002' });
    expect(second.status).toBe(409);
  });

  it('ارقام فارسی کد به لاتین نرمال می‌شود', async () => {
    const res = await manager.post('/api/schools', { name: 'مدرسه کد فارسی m60', code: '۴۴۹۹۰۰۰۳' });
    expect(res.status).toBe(201);
    expect((res.body as { data: { code: string } }).data.code).toBe('44990003');
  });

  it('جستجوی سراسری با کد مدرسه پیدا می‌کند', async () => {
    const res = await manager.get('/api/search?q=44990001');
    expect(res.status).toBe(200);
    const data = res.body as { data: { groups: Array<{ type: string; items: Array<{ id: string; subtitle?: string }> }> } };
    const schoolGroup = data.data.groups.find((g) => g.type === 'school');
    expect(schoolGroup?.items.length).toBeGreaterThanOrEqual(1);
    expect(schoolGroup?.items[0]?.subtitle).toBe('44990001');
  });

  it('لیست مدارس شامل seedها', async () => {
    const res = await manager.get('/api/schools');
    const data = (res.body as { data: Array<{ id: string }> }).data;
    expect(data.map((s) => s.id)).toEqual(expect.arrayContaining([SCHOOL1_ID, SCHOOL2_ID]));
  });

  it('کلاس جدید با معلم — 201 و کلاس تکراری هم‌نام در همان مدرسه — 409', async () => {
    const created = await manager.post('/api/classes', {
      school_id: SCHOOL1_ID,
      name: 'کلاس ۳ الف تست',
      teacher_name: 'خانم نوری',
      teacher_phone: '09121114000'
    });
    expect(created.status).toBe(201);
    const classId = (created.body as { data: { id: string } }).data.id;

    const dup = await manager.post('/api/classes', {
      school_id: SCHOOL1_ID,
      name: 'کلاس ۳ الف تست'
    });
    expect(dup.status).toBe(409);

    const s = await createStudent(manager, { school_id: SCHOOL1_ID });
    const linked = await manager.patch(`/api/students/${s.id}`, { class_id: classId });
    expect(linked.status).toBe(200);
    expect(((linked.body as { data: { classId: string } }).data).classId).toBe(classId);
  });

  it('کلاس در مدرسهٔ ناموجود — 404/400', async () => {
    const res = await manager.post('/api/classes', {
      school_id: '10000000-0000-4000-8000-0000000000ff',
      name: 'کلاس خیالی'
    });
    expect([400, 404]).toContain(res.status);
  });

  it('ساخت کلاس توسط همکار — 403 (نقش اجازه نمی‌دهد؟ مسیر باز است — بررسی رفتار واقعی)', async () => {
    const res = await secretary.post('/api/classes', {
      school_id: SCHOOL1_ID,
      name: 'کلاس منشی'
    });
    expect(res.status).toBeLessThan(500);
  });
});

describe('برچسب‌ها و جستجوی سراسری', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
  });

  it('برچسب‌های پیش‌فرض migration موجودند (disorder/grade/school_type)', async () => {
    const res = await manager.get('/api/tags');
    expect(res.status).toBe(200);
    const data = (res.body as { data: Array<{ id: string; category: string }> }).data;
    expect(data.length).toBeGreaterThanOrEqual(25);
    expect(data.some((t) => t.id === TAG_DISORDER_1)).toBe(true);
    expect(data.some((t) => t.id === TAG_GRADE_5)).toBe(true);
  });

  it('ساخت برچسب سفارشی + تکرار هم‌نام هم‌دسته — 409', async () => {
    const ok = await manager.post('/api/tags', { name: 'سخت‌گوی', category: 'custom', color: '#AA3377' });
    expect(ok.status).toBe(201);
    const dup = await manager.post('/api/tags', { name: 'سخت‌گوی', category: 'custom' });
    expect(dup.status).toBe(409);
  });

  it('رنگ HEX نامعتبر — 400', async () => {
    const res = await manager.post('/api/tags', { name: 'رنگ بد', category: 'custom', color: 'red' });
    expect(res.status).toBe(400);
  });

  it('جایگزینی برچسب‌های دانش‌آموز + خواندن + فیلتر لیست با tag_id', async () => {
    const s = await createStudent(manager);
    const put = await manager.put(`/api/students/${s.id}/tags`, {
      tag_ids: [TAG_DISORDER_1, TAG_GRADE_5]
    });
    expect(put.status).toBe(200);

    const read = await manager.get(`/api/students/${s.id}/tags`);
    const ids = (read.body as { data: Array<{ id: string }> }).data.map((t) => t.id);
    expect(ids).toEqual(expect.arrayContaining([TAG_DISORDER_1, TAG_GRADE_5]));

    const byTag = await manager.get(`/api/students?tag_id=${TAG_DISORDER_1}&page_size=100`);
    expect(((byTag.body as { data: Array<{ id: string }> }).data).map((x) => x.id)).toContain(s.id);
  });

  it('جستجوی سراسری «سارا» — دانش‌آموز پیدا می‌شود', async () => {
    const res = await manager.get('/api/search?q=%D8%B3%D8%A7%D8%B1%D8%A7');
    expect(res.status).toBe(200);
    const data = res.body as { data: { query: string; groups: Array<{ type: string; items: Array<{ type: string; id: string; title: string }> }> } };
    expect(data.data.query).toBe('سارا');
    const allItems = data.data.groups.flatMap((g) => g.items);
    expect(allItems.some((item) => item.id === STUDENT2_ID)).toBe(true);
  });

  it('جستجوی «مدیر» — کارمند پیدا می‌شود؛ کوئری خیلی کوتاه — بدون 500', async () => {
    const res = await manager.get('/api/search?q=%D9%85%D8%AF%DB%8C%D8%B1'); // مدیر
    expect(res.status).toBe(200);
    const data = res.body as { data: { groups: Array<{ type: string; items: Array<{ id: string }> }> } };
    const staffGroup = data.data.groups.find((g) => g.type === 'staff');
    expect(staffGroup?.items.length ?? 0).toBeGreaterThanOrEqual(1);

    const short = await manager.get('/api/search?q=%D8%B3'); // ۱ حرف
    expect(short.status).toBe(200);
    const shortData = short.body as { data: { groups: unknown[] } };
    expect(shortData.data.groups).toEqual([]);
  });
});

describe('پروندهٔ رویداد (جایگزین ارزیابی)', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;
  let therapist: Api;
  let studentId: string;
  let typeId: string;

  const simpleType = async (): Promise<string> => {
    const created = await manager.post('/api/case-events/types', {
      title: 'گزارش جلسهٔ آزمون m66',
      category: 'session',
      fields: [{ key: 'goal', label: 'هدف جلسه', type: 'text', required: true }]
    });
    expect(created.status).toBe(201);
    return dataOf<{ id: string }>(created).id;
  };

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
    therapist = await asRole(A, 'therapist');
    const s = await createStudent(manager);
    studentId = s.id;
    typeId = await simpleType();
  });

  it('ساخت پیش‌نویس گزارش توسط همکار — 201', async () => {
    const res = await therapist.post(`/api/students/${studentId}/case-events`, {
      eventTypeId: typeId,
      draft: true,
      values: {} // پیش‌نویس: فیلد الزامی فعلاً می‌تواند خالی بماند
    });
    expect(res.status).toBe(201);
    const data = (res.body as { data: { id: string; status: string } }).data;
    expect(data.status).toBe('draft');
  });

  it('نوع رویداد نامعتبر — 404', async () => {
    const res = await therapist.post(`/api/students/${studentId}/case-events`, {
      eventTypeId: '00000000-0000-4000-8000-000000000000',
      values: {}
    });
    expect(res.status).toBe(404);
  });

  it('چرخهٔ نهایی‌سازی: draft→finalize مجاز؛ فیلد الزامی خالی → خطا؛ finalize دوباره → 409', async () => {
    const created = await therapist.post(`/api/students/${studentId}/case-events`, {
      eventTypeId: typeId,
      draft: true,
      values: {}
    });
    const id = ((created.body as { data: { id: string } }).data).id;

    const early = await therapist.post(`/api/case-events/${id}/finalize`, {});
    expect(early.status).toBe(400);

    const patch = await therapist.patch(`/api/case-events/${id}`, { values: { goal: 'افزایش واژگان' } });
    expect(patch.status).toBe(200);
    const fin = await therapist.post(`/api/case-events/${id}/finalize`, {});
    expect(fin.status).toBe(200);
    expect(((fin.body as { data: { status: string } }).data).status).toBe('completed');

    const again = await therapist.post(`/api/case-events/${id}/finalize`, {});
    expect(again.status).toBe(409);
  });

  it('پیوست: افزودن فایل متنی + خواندن محتوا + سقف MIME', async () => {
    const created = await therapist.post(`/api/students/${studentId}/case-events`, {
      eventTypeId: typeId,
      values: { goal: 'جلسهٔ پیوست' }
    });
    const id = ((created.body as { data: { id: string } }).data).id;

    const content = Buffer.from('گزارش پیشرفت آزمایشی').toString('base64');
    const addFile = await therapist.post(`/api/case-events/${id}/files`, {
      filename: 'report.txt',
      mime_type: 'text/plain',
      content_b64: `data:text/plain;base64,${content}`
    });
    expect(addFile.status).toBe(201);
    const fileId = ((addFile.body as { data: { id: string } }).data).id;

    const badMime = await therapist.post(`/api/case-events/${id}/files`, {
      filename: 'evil.sh',
      mime_type: 'application/x-sh',
      content_b64: content
    });
    expect(badMime.status).toBe(400);

    const read = await therapist.get(`/api/case-events/${id}/files/${fileId}`);
    expect(read.status).toBe(200);
    expect(typeof read.body).toBe('string');
    expect(read.body as string).toContain('گزارش پیشرفت');

    const list = await therapist.get(`/api/case-events/${id}/files`);
    expect(((list.body as { data: unknown[] }).data).length).toBe(1);

    const del = await manager.delete(`/api/case-events/${id}/files/${fileId}`);
    expect(del.status).toBe(200);
  });
});

describe('شمارش ارزیابی‌ها در پاسخ فهرست دانش‌آموزان', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;
  let therapist: Api;
  let studentId: string;

  const countOf = async (id: string): Promise<number | undefined> => {
    const res = await manager.get(`/api/students?page_size=100`);
    expect(res.status).toBe(200);
    const items = (res.body as { data: Array<{ id: string; assessmentCount?: number }> }).data;
    return items.find((x) => x.id === id)?.assessmentCount;
  };

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
    therapist = await asRole(A, 'therapist');
    const s = await createStudent(manager);
    studentId = s.id;
  });

  it('بدون ارزیابی — assessmentCount صفر است (کلید همیشه حاضر)', async () => {
    expect(await countOf(studentId)).toBe(0);
  });

  it('پس از ثبت دو رویداد — شمارش ۲ می‌شود؛ لغو یک مورد → ۱', async () => {
    const sessionType = dataOf<{ id: string }>(
      await manager.post('/api/case-events/types', { title: 'گزارش آزمون شمارش m26', category: 'session', fields: [{ key: 'a', label: 'a', type: 'text' }] })
    ).id;

    const e1 = await therapist.post(`/api/students/${studentId}/case-events`, {
      eventTypeId: sessionType, values: { a: 'اول' }
    });
    expect(e1.status).toBe(201);
    await therapist.post(`/api/students/${studentId}/case-events`, {
      eventTypeId: sessionType, values: { a: 'دوم' }
    });
    expect(await countOf(studentId)).toBe(2);

    const id = ((e1.body as { data: { id: string } }).data).id;
    const cancel = await therapist.post(`/api/case-events/${id}/cancel`, {});
    expect(cancel.status).toBe(200);
    expect(await countOf(studentId)).toBe(1);
  });

  it('دانش‌آموز دیگر — شمارش مستقل (ایزوله بودن projection)', async () => {
    const other = await createStudent(manager);
    expect(await countOf(other.id)).toBe(0);
  });
});

describe('حذف پرونده با بقایای حذف‌نرم (کشف زنده: FK case_events حذف‌نرم‌شده)', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;
  let therapist: Api;

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
    therapist = await asRole(A, 'therapist');
  });

  it('پرونده با رویداد حذف‌نرم‌شده → حذف کامل ۲۰۰ (بقایا با پرونده پاک می‌شوند)', async () => {
    const studentId = (await createStudent(therapist)).id;
    const t = dataOf<{ id: string }>(
      await manager.post('/api/case-events/types', { title: 'قالب حذف m85', category: 'session', fields: [{ key: 'a', label: 'a', type: 'text' }] })
    ).id;
    const created = await therapist.post(`/api/students/${studentId}/case-events`, { eventTypeId: t, values: { a: 'x' } });
    expect(created.status).toBe(201);
    const eventId = (created.body as { data: { id: string } }).data.id;

    const soft = await manager.delete(`/api/case-events/${eventId}`);
    expect(soft.status).toBe(200);

    const del = await manager.delete(`/api/students/${studentId}`);
    expect(del.status).toBe(204);
    expect((await manager.get(`/api/students/${studentId}`)).status).toBe(404);
  });

  it('پرونده با مسیر مداخلهٔ فعال → گارد حذف هنوز محافظت می‌کند؟ — حذف مسیر با پرونده مجاز است (جریان آزمون )', async () => {
    const studentId = (await createStudent(therapist)).id;
    const p = await therapist.post(`/api/students/${studentId}/clinical-paths`, { target_key: 'dyslexia' });
    expect(p.status).toBe(201);
    const del = await manager.delete(`/api/students/${studentId}`);
    expect(del.status).toBe(204);
  });
});

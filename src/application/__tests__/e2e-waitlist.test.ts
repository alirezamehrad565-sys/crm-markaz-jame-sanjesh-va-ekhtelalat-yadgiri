import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestApp,
  Api,
  asRole,
  createStudent,
  makeNationalId,
  quarterHourFromNow,
  ALI_ID,
  SECRETARY_ID,
  STUDENT1_ID
} from '../../test/harness';

interface WaitlistEntryBody {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  nationalId: string | null;
  priority: string;
  status: string;
  callCount: number;
  lastCallAt: string | null;
  manualOrder: number | null;
  scheduledAppointmentId: string | null;
  admittedStudentId: string | null;
  note: string | null;
  serviceType?: string | null;
}

function entryOf(res: { body: unknown }): WaitlistEntryBody {
  return (res.body as { data: WaitlistEntryBody }).data;
}

async function createEntry(api: Api, overrides: Record<string, unknown> = {}): Promise<WaitlistEntryBody> {
  const res = await api.post('/api/waitlist', {
    first_name: 'متقاضی',
    last_name: `تست${Math.floor(Math.random() * 100000)}`,
    phone: '09121110000',
    source: 'self',
    priority: 'normal',
    ...overrides
  });
  expect(res.status).toBe(201);
  return entryOf(res);
}

function scheduleBody(staffId = ALI_ID, offset = 120) {
  return {
    staff_id: staffId,
    start_at: quarterHourFromNow(offset),
    end_at: quarterHourFromNow(offset + 45)
  };
}

describe('فاز W — ساخت و اعتبارسنجی', () => {
  let A: ReturnType<typeof createTestApp>;
  let sec: Api;

  beforeAll(async () => {
    A = createTestApp();
    sec = await asRole(A, 'secretary');
  });

  it('ساخت با نرمال‌سازی تلفن (+98 و ارقام فارسی) — 201 و وضعیت waiting', async () => {
    const res = await sec.post('/api/waitlist', {
      first_name: 'زهرا',
      last_name: 'کریمی‌نژاد',
      phone: '+98 912 ۳۴۵ ۶۷۸۹',
      source: 'school',
      priority: 'urgent',
      service_type: 'کاردرمانی'
    });
    expect(res.status).toBe(201);
    const entry = entryOf(res);
    expect(entry.phone).toBe('09123456789');
    expect(entry.status).toBe('waiting');
    expect(entry.priority).toBe('urgent');
    expect(entry.callCount).toBe(0);
  });

  it('تلفن نامعتبر و کد ملی نامعتبر — 400', async () => {
    const badPhone = await sec.post('/api/waitlist', {
      first_name: 'تست', last_name: 'تلفن', phone: '12345', source: 'self'
    });
    expect(badPhone.status).toBe(400);

    const badNid = await sec.post('/api/waitlist', {
      first_name: 'تست', last_name: 'کدملی', phone: '09121110001', national_id: '0000000000', source: 'self'
    });
    expect(badNid.status).toBe(400);
  });

  it('RBAC — درمانگر (معلم مرکز) هم می‌تواند متقاضی ثبت کند: POST 201، GET 200', async () => {
    const ther = await asRole(A, 'therapist');
    const list = await ther.get('/api/waitlist');
    expect(list.status).toBe(200);

    const post = await ther.post('/api/waitlist', {
      first_name: 'تست', last_name: 'درمانگر', phone: '09121110002', source: 'self'
    });
    expect(post.status).toBe(201);
  });
});

describe('فاز W — تماس، ویرایش، ترتیب', () => {
  let A: ReturnType<typeof createTestApp>;
  let sec: Api;

  beforeAll(async () => {
    A = createTestApp();
    sec = await asRole(A, 'secretary');
  });

  it('ثبت تماس: waiting→called، شمارنده + زمان تماس + append یادداشت', async () => {
    const e = await createEntry(sec);
    const res = await sec.post(`/api/waitlist/${e.id}/call`, { note: 'همراه بود؛ برای شنبه هماهنگ شد' });
    expect(res.status).toBe(200);
    const after = entryOf(res);
    expect(after.status).toBe('called');
    expect(after.callCount).toBe(1);
    expect(after.lastCallAt).toBeTruthy();
    expect(after.note).toContain('همراه بود');

    const res2 = await sec.post(`/api/waitlist/${e.id}/call`, {});
    expect(entryOf(res2).callCount).toBe(2);
  });

  it('PATCH فیلدهای دموگرافیک + اولویت — ولی وضعیت تغییر نمی‌کند', async () => {
    const e = await createEntry(sec);
    const res = await sec.patch(`/api/waitlist/${e.id}`, {
      phone: '09122220000',
      service_type: 'گفتاردرمانی',
      priority: 'urgent',
      status: 'admitted' // کلید غیرمجاز — باید نادیده گرفته شود
    });
    expect(res.status).toBe(200);
    const after = entryOf(res);
    expect(after.phone).toBe('09122220000');
    expect(after.priority).toBe('urgent');
    expect(after.status).toBe('waiting');
  });

  it('ترتیب خودکار: فوری بالاتر از معمولی (حتی با ثبت دیرتر)', async () => {
    const normal = await createEntry(sec, { last_name: 'معمولی‌ترتیب' });
    const urgent = await createEntry(sec, { last_name: 'فوری‌ترتیب', priority: 'urgent' });
    const res = await sec.get('/api/waitlist');
    const ids = (res.body as { data: WaitlistEntryBody[] }).data.map((x) => x.id);
    expect(ids.indexOf(urgent.id)).toBeLessThan(ids.indexOf(normal.id));
  });

  it('ترتیب دستی: reorder قفل می‌کند و ورودی جدید append می‌شود؛ auto-order برمی‌گرداند', async () => {
    const a = await createEntry(sec, { last_name: 'ترتیب‌آ' });
    const b = await createEntry(sec, { last_name: 'ترتیب‌ب' });
    const c = await createEntry(sec, { last_name: 'ترتیب‌پ' });

    const reordered = await sec.post('/api/waitlist/reorder', { ids: [c.id, a.id, b.id] });
    expect(reordered.status).toBe(200);
    const ids = (reordered.body as { data: WaitlistEntryBody[] }).data.map((x) => x.id);
    expect(ids.indexOf(c.id)).toBeLessThan(ids.indexOf(a.id));
    expect(ids.indexOf(a.id)).toBeLessThan(ids.indexOf(b.id));

    const d = await createEntry(sec, { last_name: 'ترتیب‌ت' });
    const list2 = await sec.get('/api/waitlist');
    const ids2 = (list2.body as { data: WaitlistEntryBody[] }).data.filter((x) => ['waiting', 'called'].includes(x.status)).map((x) => x.id);
    expect(ids2[ids2.length - 1]).toBe(d.id);

    const back = await sec.post('/api/waitlist/auto-order', {});
    expect(back.status).toBe(200);
    const list3 = await sec.get('/api/waitlist');
    const d2 = (list3.body as { data: WaitlistEntryBody[] }).data.find((x) => x.id === d.id);
    expect(d2?.manualOrder ?? null).toBeNull();
  });
});

describe('فاز W — تبدیل به نوبت (اتمیک)', () => {
  let A: ReturnType<typeof createTestApp>;
  let sec: Api;

  beforeAll(async () => {
    A = createTestApp();
    sec = await asRole(A, 'secretary');
  });

  it('با پروندهٔ موجود صریح → نوبت واقعی ساخته می‌شود و ورودی scheduled می‌شود', async () => {
    const e = await createEntry(sec, { last_name: 'پرونده‌موجود' });
    const res = await sec.post(`/api/waitlist/${e.id}/schedule`, { ...scheduleBody(), student_id: STUDENT1_ID });
    expect(res.status).toBe(201);
    const out = (res.body as { data: { entry: WaitlistEntryBody; appointment: { id: string }; student: { id: string } } }).data;
    expect(out.entry.status).toBe('scheduled');
    expect(out.entry.scheduledAppointmentId).toBe(out.appointment.id);
    expect(out.entry.admittedStudentId).toBe(STUDENT1_ID);
    expect(out.student.id).toBe(STUDENT1_ID);
  });

  it('با کد ملی بدون پرونده → پرونده + نوبت در همان عملیات (پاسخ student پر است)', async () => {
    const nid = makeNationalId();
    const e = await createEntry(sec, { last_name: 'پرونده‌جدید', national_id: nid });
    const res = await sec.post(`/api/waitlist/${e.id}/schedule`, scheduleBody());
    expect(res.status).toBe(201);
    const out = (res.body as { data: { entry: WaitlistEntryBody; appointment: { id: string }; student: { id: string; nationalId: string } } }).data;
    expect(out.student.nationalId).toBe(nid);
    expect(out.entry.admittedStudentId).toBe(out.student.id);
    expect(out.entry.status).toBe('scheduled');

    const byNid = await sec.get(`/api/students/by-national-id/${nid}`);
    expect(byNid.status).toBe(200);
  });

  it('بدون کد ملی و بدون تطبیق — پیام actionable «کد ملی لازم است»', async () => {
    const e = await createEntry(sec, { last_name: 'بی‌کدملی', phone: '09121117300' });
    const res = await sec.post(`/api/waitlist/${e.id}/schedule`, scheduleBody());
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('کد ملی');
  });

  it('تلفن مشترک با دو پرونده → 409 «انتخاب صریح»', async () => {
    const phone = '09121117999';
    await createStudent(sec, { guardian_phone: phone, last_name: 'هم‌تلفن‌یک' });
    await createStudent(sec, { guardian_phone: phone, last_name: 'هم‌تلفن‌دو' });
    const e = await createEntry(sec, { last_name: 'مبهم', phone });
    const res = await sec.post(`/api/waitlist/${e.id}/schedule`, scheduleBody());
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).toContain('صریح');
  });

  it('نوبت‌دهی دوبارهٔ ورودی نهایی‌شده — 409', async () => {
    const e = await createEntry(sec, { last_name: 'دوباره' });
    const r1 = await sec.post(`/api/waitlist/${e.id}/schedule`, { ...scheduleBody(), student_id: STUDENT1_ID });
    expect(r1.status).toBe(201);
    const r2 = await sec.post(`/api/waitlist/${e.id}/schedule`, { ...scheduleBody(), student_id: STUDENT1_ID });
    expect(r2.status).toBe(409);
  });

  it('هم‌پوشانی نرم — 201 با warnings (همان فلسفهٔ نوبت‌های عادی)', async () => {
    const e1 = await createEntry(sec, { last_name: 'همپوشانی‌یک' });
    const e2 = await createEntry(sec, { last_name: 'همپوشانی‌دو' });
    const r1 = await sec.post(`/api/waitlist/${e1.id}/schedule`, { ...scheduleBody(), student_id: STUDENT1_ID });
    expect(r1.status).toBe(201);
    const r2 = await sec.post(`/api/waitlist/${e2.id}/schedule`, { ...scheduleBody(), student_id: STUDENT1_ID });
    expect(r2.status).toBe(201);
    const warnings = (r2.body as { data: { warnings: unknown[] } }).data.warnings;
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('پذیرش خودکار: حضور «حاضر» روی نوبتِ متصل → خروج کامل از لیست + audit', async () => {
    const e = await createEntry(sec, { last_name: 'پذیرش‌خودکار' });
    const r = await sec.post(`/api/waitlist/${e.id}/schedule`, { ...scheduleBody(), student_id: STUDENT1_ID });
    const apptId = (r.body as { data: { appointment: { id: string } } }).data.appointment.id;

    const mark = await sec.patch(`/api/attendance/${apptId}/${STUDENT1_ID}`, { status: 'present' });
    expect(mark.status).toBe(200);

    const fresh = await sec.get(`/api/waitlist/${e.id}`);
    expect(fresh.status).toBe(404);
    const list = await sec.get('/api/waitlist');
    expect((list.body as { data: unknown[] }).data.find((row) => (row as { id: string }).id === e.id)).toBeUndefined();

    const dbRow = A.sql.prepare(`SELECT status, deleted_at FROM waitlist WHERE id = ?`).get(e.id) as { status: string; deleted_at: string | null };
    expect(dbRow.status).toBe('admitted');
    expect(dbRow.deleted_at).toBeTruthy();

    const auditRows = A.sql.prepare(`SELECT action FROM audit_log WHERE resource_id = ? AND action = 'waitlist.admitted'`).all(e.id);
    expect(auditRows.length).toBe(1);

    const call = await sec.post(`/api/waitlist/${e.id}/call`, {});
    expect(call.status).toBe(404);
  });
});

describe('فاز W — رد/نیامد/انصراف، حذف نرم، badge، جستجو', () => {
  let A: ReturnType<typeof createTestApp>;
  let sec: Api;

  beforeAll(async () => {
    A = createTestApp();
    sec = await asRole(A, 'secretary');
  });

  it('رد با دلیل → rejected + یادداشت append؛ نیامد از called → no_show', async () => {
    const e1 = await createEntry(sec, { last_name: 'ردشدنی' });
    const rj = await sec.post(`/api/waitlist/${e1.id}/reject`, { note: 'خارج از محدوده خدمت' });
    expect(rj.status).toBe(200);
    expect(entryOf(rj).status).toBe('rejected');
    expect(entryOf(rj).note).toContain('خارج از محدوده');

    const e2 = await createEntry(sec, { last_name: 'نیامدنی' });
    await sec.post(`/api/waitlist/${e2.id}/call`, {});
    const ns = await sec.post(`/api/waitlist/${e2.id}/no-show`, {});
    expect(entryOf(ns).status).toBe('no_show');
  });

  it('انصراف از waiting → cancelled؛ تغییر از وضعیت نهایی — 409', async () => {
    const e = await createEntry(sec, { last_name: 'منصرف' });
    const c = await sec.post(`/api/waitlist/${e.id}/cancel`, {});
    expect(entryOf(c).status).toBe('cancelled');
    const again = await sec.post(`/api/waitlist/${e.id}/no-show`, {});
    expect(again.status).toBe(409);
  });

  it('PATCH ویرایش فیلدها → شکل پاسخ به‌روز؛ admitted برای reopen 409', async () => {
    const e = await createEntry(sec, { last_name: 'قابل‌ویرایش' });
    const patch = await sec.patch(`/api/waitlist/${e.id}`, {
      first_name: 'ویرایش‌شده',
      phone: '09120000001',
      priority: 'urgent',
      service_type: 'گفتاردرمانی'
    });
    expect(patch.status).toBe(200);
    const edited = entryOf(patch);
    expect(edited.firstName).toBe('ویرایش‌شده');
    expect(edited.phone).toBe('09120000001');
    expect(edited.priority).toBe('urgent');
    expect(edited.serviceType).toBe('گفتاردرمانی');
  });

  it('reopen: rejected/no_show/cancelled → waiting + audit؛ admitted → 409', async () => {
    const A = createTestApp();
    const s2 = await asRole(A, 'secretary');
    const rej = await createEntry(s2, { last_name: 'ردشده‌بازگشتی' });
    await s2.post(`/api/waitlist/${rej.id}/reject`, { note: 'اشتباهی' });
    const back = await s2.post(`/api/waitlist/${rej.id}/reopen`, { note: 'خانواده دوباره پیگیری کرد' });
    expect(back.status).toBe(200);
    expect(entryOf(back).status).toBe('waiting');
    const auditRows = A.sql
      .prepare(`SELECT action FROM audit_log WHERE resource_id = ? AND action = 'waitlist.reopen'`)
      .all(rej.id);
    expect(auditRows.length).toBe(1);

    const admEntry = await createEntry(s2, { last_name: 'پذیرفته‌شده' });
    await s2.post(`/api/waitlist/${admEntry.id}/call`, {});
    A.sql.prepare(`UPDATE waitlist SET status = 'admitted' WHERE id = ?`).run(admEntry.id);
    const denied = await s2.post(`/api/waitlist/${admEntry.id}/reopen`, {});
    expect(denied.status).toBe(409);
  });

  it('حذف نرم — 204، از لیست حذف و اکشن روی آن 404', async () => {
    const e = await createEntry(sec, { last_name: 'حذف‌شدنی' });
    const del = await sec.delete(`/api/waitlist/${e.id}`);
    expect(del.status).toBe(204);

    const list = await sec.get('/api/waitlist');
    expect((list.body as { data: WaitlistEntryBody[] }).data.some((x) => x.id === e.id)).toBe(false);

    const call = await sec.post(`/api/waitlist/${e.id}/call`, {});
    expect(call.status).toBe(404);
  });

  it('badge: سررسید ۷ روزه با backdate مستقیم DB شمرده می‌شود', async () => {
    const e = await createEntry(sec, { last_name: 'سررسیدی' });
    const before = await sec.get('/api/waitlist/badge');
    const b0 = (before.body as { data: { overdue: number; urgent: number; waiting: number } }).data;
    expect(b0.waiting).toBeGreaterThan(0);

    A.sql.prepare(`UPDATE waitlist SET created_at = datetime('now', '-8 days') WHERE id = ?`).run(e.id);
    const after = await sec.get('/api/waitlist/badge');
    const b1 = (after.body as { data: { overdue: number } }).data;
    expect(b1.overdue).toBeGreaterThanOrEqual(1);
  });

  it('منبع پنجم جستجوی سراسری — گروه waitlist با تلفن', async () => {
    await createEntry(sec, { first_name: 'جمیله', last_name: 'جستجوپذیر', phone: '09121118555' });
    const res = await sec.get('/api/search?q=جستجوپذیر');
    expect(res.status).toBe(200);
    const groups = (res.body as { data: { groups: Array<{ type: string; items: Array<{ subtitle: string | null }> }> } }).data.groups;
    const wl = groups.find((g) => g.type === 'waitlist');
    expect(wl).toBeTruthy();
    expect(wl?.items[0].subtitle).toBe('09121118555');
  });
});

describe('فاز ۳ — هوک رد/نیامد لیست انتظار → پیگیری (پیشنهاد کاربر: با مسئول/مهلت)', () => {
  let A: ReturnType<typeof createTestApp>;
  let sec: Api;

  beforeAll(async () => {
    A = createTestApp();
    sec = await asRole(A, 'secretary');
  });

  function followupsOf(entityId: string) {
    return sec.get(`/api/followups?entity_type=waitlist&entity_id=${entityId}`).then((res) => {
      expect(res.status).toBe(200);
      return (res.body as {
        data: Array<{ id: string; title: string; assigneeId: string; studentId: string | null; status: string; dueAt: string | null }>;
      }).data;
    });
  }

  it('رد ورودی → پیگیری خودکار «متقاضی ردشده» با مسئول = بازیگر و مهلت پیش‌فرض', async () => {
    const e = await createEntry(sec, { first_name: 'بهاره', last_name: 'ردشدنی' });
    const rj = await sec.post(`/api/waitlist/${e.id}/reject`, { note: 'خارج از محدودهٔ سنی' });
    expect(rj.status).toBe(200);

    const items = await followupsOf(e.id);
    expect(items).toHaveLength(1);
    expect(items[0].title).toContain('ردشده');
    expect(items[0].title).toContain('بهاره');
    expect(items[0].assigneeId).toBe(SECRETARY_ID);
    expect(items[0].status).toBe('open');
    expect(items[0].dueAt).toBeTruthy(); // مهلت پیش‌فرض +۷ روز
    expect(items[0].studentId).toBeNull(); // هنوز پرونده نداشته
  });

  it('نیامد بعد از نوبت‌دهی → پیگیری «نیامده» با اتصال به پروندهٔ متصل', async () => {
    const e = await createEntry(sec, { first_name: 'کامران', last_name: 'نیامدنی' });
    const sch = await sec.post(`/api/waitlist/${e.id}/schedule`, { ...scheduleBody(), national_id: makeNationalId() });
    expect(sch.status).toBe(201);
    const scheduled = (sch.body as { data: { entry: WaitlistEntryBody } }).data.entry;
    expect(scheduled.admittedStudentId).toBeTruthy();

    const ns = await sec.post(`/api/waitlist/${e.id}/no-show`, {});
    expect(ns.status).toBe(200);

    const items = await followupsOf(e.id);
    expect(items).toHaveLength(1);
    expect(items[0].title).toContain('نیامده');
    expect(items[0].studentId).toBe(scheduled.admittedStudentId);
    expect(items[0].dueAt).toBeTruthy();
  });

  it('انصراف خانواده → پیگیری ساخته نمی‌شود (فقط رد/نیامد هوک دارند)', async () => {
    const e = await createEntry(sec, { first_name: 'شیرین', last_name: 'منصرف‌بی‌پیگیری' });
    const c = await sec.post(`/api/waitlist/${e.id}/cancel`, {});
    expect(c.status).toBe(200);
    expect(await followupsOf(e.id)).toHaveLength(0);
  });
});

/**
 * تست‌های e2e — teacher-intake
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// e2e-teacher-intake.test.ts — ثبت متقاضی لیست انتظار توسط معلم مدرسه از بات
// ۱) کیبورد معلم کلاس دکمهٔ «ثبت متقاضی» دارد
// ۲) فرم ۴ مرحله‌ای (نام → موبایل → تولد اختیاری → نیاز اختیاری) + جمع‌بندی + تأیید
// ۳) ردیف waitlist با source='teacher' و اتصال به کلاس معلم
// ۴) گیت‌ها: مهمان/والد/همکار مرکز پیام اختصاصی می‌گیرند؛ /cancel state را پاک می‌کند
// ۵) مدیریت کدها: GET بدون class_id با نام کلاس/مدرسه + DELETE (لغو) → کد بی‌اثر
// اپ واقعی Hono + migrations واقعی + webhook بله با secret تست

import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, WEBHOOK_SECRET, asRole, createStudent } from '../../test/harness';
import type { Api } from '../../test/harness';

type Update = Record<string, unknown>;
type A = ReturnType<typeof createTestApp>;

interface BotResponse {
  ok: boolean;
  handled: boolean;
  sent: boolean | null;
  reply: string | null;
  buttons: { text: string; callbackData: string }[][] | null;
  keyboard: string[][] | null;
}

async function bot(A: A, raw: Update): Promise<BotResponse> {
  const res = await A.app.request(
    `/webhook/bale/${WEBHOOK_SECRET}`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(raw) },
    A.env as never
  );
  return (await res.json()) as BotResponse;
}

const tx = (t: string, chatId: number): Update => ({ update_id: Math.floor(Math.random() * 1e9), message: { chat: { id: chatId }, text: t } });
const cb = (data: string, chatId: number): Update => ({
  update_id: Math.floor(Math.random() * 1e9),
  callback_query: { id: 'c1', data, message: { chat: { id: chatId } } }
});

// chatها: 7501 معلم مدرسه | 7502 والد | 7503 همکار مرکز (علی) | 7599 مهمان
const CHAT_TEACHER = 7501;
const CHAT_PARENT = 7502;
const CHAT_STAFF = 7503;
const CHAT_NONE = 7599;
const CHAT_STRANGER = 7511;

const ALI_NID = '3149977797';

describe('ثبت متقاضی توسط معلم مدرسه از بات', () => {
  let A: A;
  let manager: Api;
  let classId: string;
  let code: string;

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');

    // مدرسه + کلاس + دانش‌آموزِ همان کلاس (برای اتصال)
    const school = ((await manager.post('/api/schools', { name: 'دبستان آزمون m61', kind: 'school', gender_type: 'male' })).body as { data: { id: string } }).data;
    const cls = ((await manager.post('/api/classes', { school_id: school.id, name: 'چهارم الف', teacher_name: 'استاد آزمون', teacher_phone: '09170001122' })).body as { data: { id: string } }).data;
    classId = cls.id;
    await createStudent(manager, { school_id: school.id, class_id: classId });

    // کد اتصال معلم + اتصال بات معلم با /link
    code = (((await manager.post('/api/notifications/class-links', { class_id: classId })).body as { data: { code: string } }).data).code;
    const linked = await bot(A, tx(`/link ${code}`, CHAT_TEACHER));
    expect(linked.reply).toContain('اتصال با موفقیت');
  });

  it('کیبورد معلمِ متصل دارد (نوبت‌های کلاس من / دانش‌آموزان من / ثبت متقاضی / فعالیت کلاس / بانک تمرین / آگاهی‌ها)', async () => {
    const res = await bot(A, tx('/start', CHAT_TEACHER));
    expect(res.keyboard).toEqual([
      ['نوبت‌های کلاس من', 'دانش‌آموزان من'],
      ['ثبت متقاضی', 'فعالیت کلاس'],
      ['بانک تمرین', 'آگاهی‌های اختلالات'],
      ['درباره مرکز', 'راهنما']
    ]);
    // برچسب قدیمی «نوبت‌های من» برای معلم هم کار می‌کند (سازگاری )
    const legacy = await bot(A, tx('نوبت‌های من', CHAT_TEACHER));
    expect(legacy.handled).toBe(true);
  });

  it('فرم کامل: نام → موبایل → تولد شمسی → نیاز → جمع‌بندی → تأیید → ردیف انتظار با source=teacher', async () => {
    const start = await bot(A, tx('ثبت متقاضی', CHAT_TEACHER));
    expect(start.reply).toContain('ثبت متقاضی جدید');
    expect(start.reply).toContain('چهارم الف');
    expect(start.reply).toContain('نام و نام خانوادگی');

    // ورودی عددیِ وسط فرم نباید «ورود خودکار» شود — به فرم می‌رود
    const name = await bot(A, tx('امیرحسین کوهنجانی', CHAT_TEACHER));
    expect(name.reply).toContain('موبایل ولیّ');

    const phoneBad = await bot(A, tx('12345', CHAT_TEACHER));
    expect(phoneBad.reply).toContain('معتبر نیست');

    const phone = await bot(A, tx('۰۹۱۷۱۲۳۴۵۶۷', CHAT_TEACHER));
    expect(phone.reply).toContain('تاریخ تولد');

    const birth = await bot(A, tx('1397/10/25', CHAT_TEACHER));
    expect(birth.reply).toContain('شرح نیاز');

    const need = await bot(A, tx('تأخیر گفتار — توصیهٔ معلم', CHAT_TEACHER));
    expect(need.reply).toContain('جمع‌بندی');
    expect(need.reply).toContain('امیرحسین کوهنجانی');
    expect(need.reply).toContain('09171234567');
    expect(need.buttons?.[0]?.[0]?.callbackData).toBe('wl:do');

    const confirmed = await bot(A, cb('wl:do', CHAT_TEACHER));
    expect(confirmed.reply).toContain('موفقیت');

    // ردیف ساخته‌شده — از API دفتر (پاسخ camelCase است)
    const list = await manager.get('/api/waitlist');
    const rows = (list.body as { data: { firstName: string; phone: string; source: string }[] }).data;
    const entry = rows.find((r) => r.firstName === 'امیرحسین');
    expect(entry).toBeTruthy();
    expect(entry!.source).toBe('teacher');
    expect(entry!.phone).toBe('09171234567');
  });

  it('انصراف با /cancel وسط فرم — state پاک و ورودی بعدی به فرم نمی‌رود', async () => {
    expect((await bot(A, tx('/add', CHAT_TEACHER))).reply).toContain('نام و نام خانوادگی');
    expect((await bot(A, tx('سارا تستی', CHAT_TEACHER))).reply).toContain('موبایل');
    const cancelled = await bot(A, tx('/cancel', CHAT_TEACHER));
    expect(cancelled.reply).toContain('لغو شد');

    // بعد از لغو، ورودی عددی دیگر به فرم نمی‌رود (مسیر شناسایی عادی)
    const after = await bot(A, tx(ALI_NID, CHAT_TEACHER));
    expect(after.reply).not.toContain('موبایل');
  });

  it('گیت‌ها: مهمان → کد اتصال + تماس؛ والد → تماس با مرکز؛ همکار مرکز → ثبت از سایت', async () => {
    // chat همکار مرکز را با کد ملی علی متصل کن
    expect((await bot(A, tx(ALI_NID, CHAT_STAFF))).reply).toContain('اتصال انجام شد');

    const guest = await bot(A, tx('/add', CHAT_NONE));
    expect(guest.reply).toContain('معلمان متصل');
    expect(guest.reply).toContain('تماس تلفنی');

    const parent = await bot(A, tx('ثبت متقاضی', CHAT_PARENT));
    expect(parent.reply).toContain('تماس');

    const staff = await bot(A, tx('/add', CHAT_STAFF));
    expect(staff.reply).toContain('معلمان مدارس');
  });
});

describe('مدیریت کدهای اتصال معلم‌ها (مشاهده بدون تولید + لغو)', () => {
  let A: A;
  let manager: Api;

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
  });

  it('GET بدون class_id → همهٔ کدها با نام کلاس/مدرسه (فهرست مدیریت)', async () => {
    const school = ((await manager.post('/api/schools', { name: 'دبستان مدیریت m61', kind: 'school', gender_type: 'female' })).body as { data: { id: string } }).data;
    const cls = ((await manager.post('/api/classes', { school_id: school.id, name: 'دوم ب' })).body as { data: { id: string } }).data;
    await manager.post('/api/notifications/class-links', { class_id: cls.id });

    const all = await manager.get('/api/notifications/class-links?limit=200');
    expect(all.status).toBe(200);
    const rows = (all.body as { data: { classId: string; className?: string; schoolName?: string }[] }).data;
    const mine = rows.find((r) => r.classId === cls.id);
    expect(mine).toBeTruthy();
    expect(mine!.className).toBe('دوم ب');
    expect(mine!.schoolName).toBe('دبستان مدیریت m61');
  });

  it('مشاهدهٔ کد فقط GET است — شمارش کدها تغییر نمی‌کند (بدون تولید خودکار)', async () => {
    const school = ((await manager.post('/api/schools', { name: 'دبستان مشاهده', kind: 'school', gender_type: 'mixed' })).body as { data: { id: string } }).data;
    const cls = ((await manager.post('/api/classes', { school_id: school.id, name: 'سوم الف' })).body as { data: { id: string } }).data;
    await manager.post('/api/notifications/class-links', { class_id: cls.id });

    const before = (await manager.get(`/api/notifications/class-links?class_id=${cls.id}`)).body as { data: unknown[] };
    const after = (await manager.get(`/api/notifications/class-links?class_id=${cls.id}`)).body as { data: unknown[] };
    expect(after.data.length).toBe(before.data.length);
  });

  it('DELETE → کد لغو می‌شود؛ اتصال با آن شکست می‌خورد؛ idempotent', async () => {
    const school = ((await manager.post('/api/schools', { name: 'دبستان لغو', kind: 'school', gender_type: 'male' })).body as { data: { id: string } }).data;
    const cls = ((await manager.post('/api/classes', { school_id: school.id, name: 'پنجم الف' })).body as { data: { id: string } }).data;
    const link = ((await manager.post('/api/notifications/class-links', { class_id: cls.id })).body as { data: { id: string; code: string } }).data;

    const del = await manager.delete(`/api/notifications/class-links/${link.id}`);
    expect(del.status).toBe(200);
    const rows = ((await manager.get(`/api/notifications/class-links?class_id=${cls.id}`)).body as { data: { status: string }[] }).data;
    expect(rows[0].status).toBe('revoked');

    // اتصال با کد لغوشده شکست می‌خورد
    const tryLink = await bot(A, tx(`/link ${link.code}`, CHAT_STRANGER));
    expect(tryLink.reply).toContain('معتبر نیست');

    // idempotent
    const again = await manager.delete(`/api/notifications/class-links/${link.id}`);
    expect(again.status).toBe(200);
  });

  it('تولید کد جدید پس از لغو (POST صریح) — فقط یک کدِ در انتظار', async () => {
    const school = ((await manager.post('/api/schools', { name: 'دبستان بازتولید', kind: 'school', gender_type: 'male' })).body as { data: { id: string } }).data;
    const cls = ((await manager.post('/api/classes', { school_id: school.id, name: 'ششم الف' })).body as { data: { id: string } }).data;
    const first = ((await manager.post('/api/notifications/class-links', { class_id: cls.id })).body as { data: { id: string } }).data;
    await manager.delete(`/api/notifications/class-links/${first.id}`);
    const second = await manager.post('/api/notifications/class-links', { class_id: cls.id });
    expect(second.status).toBe(201);
    const rows = ((await manager.get(`/api/notifications/class-links?class_id=${cls.id}`)).body as { data: { status: string }[] }).data;
    expect(rows.filter((r) => r.status === 'pending').length).toBe(1);
  });
});

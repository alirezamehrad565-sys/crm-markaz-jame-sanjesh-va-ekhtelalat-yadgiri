/**
 * تست‌های e2e — -archive
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// e2e--archive.test.ts — (0.54.0): آرشیو انعطاف‌پذیر + تاریخچهٔ تحصیلی
// ۱) کد ملی اختیاری در ثبت آرشیو → نگه‌دارندهٔ یکتای «NAS-…» + ثبت واقعی بعداً از PATCH
// ۲) چرخهٔ فعال همچنان کد ملی الزامی دارد؛ کد ملی ثبت‌شده غیرقابل تغییر است
// ۳) تاریخچهٔ تحصیلی: افزودن پشت‌سرهم سال، فهرست، حذف، گیت نقش (دفتر/درمانگر)

import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestApp,
  Api,
  asRole,
  createStudent,
  makeNationalId
} from '../../test/harness';

interface StudentBody {
  id: string;
  nationalId: string | null;
  active: boolean;
  firstName: string;
  lastName: string;
}

interface EduEntry {
  id: string;
  studentId: string;
  studyYear: string;
  schoolName: string | null;
  level: string | null;
  notes: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
}

function bodyOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

describe('کد ملی اختیاری در آرشیو', () => {
  let A: ReturnType<typeof createTestApp>;
  let sec: Api;

  beforeAll(async () => {
    A = createTestApp();
    sec = await asRole(A, 'secretary');
  });

  it('ثبت آرشیو بدون کد ملی → ۲۰۱ + نگه‌دارندهٔ یکتای NAS-… + active=false', async () => {
    const res = await sec.post('/api/students', {
      first_name: 'سابقه‌دار',
      last_name: 'سال‌های‌گذشته',
      archived: true
    });
    expect(res.status).toBe(201);
    const st = bodyOf<StudentBody>(res);
    expect(st.active).toBe(false);
    expect(st.nationalId).toBeTruthy();
    expect(st.nationalId!.startsWith('NAS-')).toBe(true);

    // در فهرست آرشیو دیده می‌شود
    const list = await sec.get('/api/students?active=false&page_size=200');
    expect((list.body as { data: StudentBody[] }).data.find((r) => r.id === st.id)).toBeTruthy();
  });

  it('دانش‌آموز فعال بدون کد ملی → ۴۰۰ (فقط آرشیو بدون کد ملی ممکن است)', async () => {
    const res = await sec.post('/api/students', {
      first_name: 'فعال',
      last_name: 'بی‌کدملی'
    });
    expect(res.status).toBe(400);
  });

  it('ثبت کد ملی واقعی بعداً — PATCH روی پروندهٔ NAS-دار → ۲۰۰ و مقدار واقعی ذخیره می‌شود', async () => {
    const created = await sec.post('/api/students', {
      first_name: 'کدملی‌دار',
      last_name: 'بعداً',
      archived: true
    });
    const st = bodyOf<StudentBody>(created);
    expect(st.nationalId!.startsWith('NAS-')).toBe(true);

    const nid = makeNationalId();
    const patch = await sec.patch(`/api/students/${st.id}`, { national_id: nid });
    expect(patch.status).toBe(200);
    expect(bodyOf<StudentBody>(patch).nationalId).toBe(nid);
  });

  it('تغییر کد ملی پرونده‌ای که کد ملی واقعی دارد → ۴۰۹ (فقط «اولین ثبت» مجاز است)', async () => {
    const st = await createStudent(sec);
    const patch = await sec.patch(`/api/students/${st.id}`, { national_id: makeNationalId() });
    expect(patch.status).toBe(409);
  });

  it('ثبت کد ملی تکراری روی پروندهٔ NAS-دار → ۴۰۹ یکتایی', async () => {
    const other = await createStudent(sec);
    const blank = await sec.post('/api/students', {
      first_name: 'تکراری',
      last_name: 'کدملی',
      archived: true
    });
    const st = bodyOf<StudentBody>(blank);
    const dup = await sec.patch(`/api/students/${st.id}`, { national_id: other.nationalId });
    expect(dup.status).toBe(409);
  });
});

describe('تاریخچهٔ تحصیلی', () => {
  let A: ReturnType<typeof createTestApp>;
  let sec: Api;
  let ali: Api;
  let stId: string;

  beforeAll(async () => {
    A = createTestApp();
    sec = await asRole(A, 'secretary');
    ali = await asRole(A, 'therapist');
    const created = await sec.post('/api/students', {
      first_name: 'تاریخی',
      last_name: 'تحصیلی',
      archived: true
    });
    stId = bodyOf<StudentBody>(created).id;
  });

  it('افزودن پشت‌سرهم چند سال + فهرست با همان ترتیب ثبت', async () => {
    const y1 = await sec.post(`/api/students/${stId}/education-history`, {
      study_year: '۱۴۰۱–۱۴۰۲',
      school_name: 'دبستان غیردولتی دانش',
      level: 'اول ابتدایی',
      notes: 'در آن سال پیش‌نیاز سنجش ثبت شد'
    });
    expect(y1.status).toBe(201);
    expect(bodyOf<EduEntry>(y1).createdByName).toBeTruthy();

    const y2 = await sec.post(`/api/students/${stId}/education-history`, {
      study_year: '۱۴۰۲–۱۴۰۳',
      school_name: 'دبستان شهید مطهری',
      level: 'دوم ابتدایی'
    });
    expect(y2.status).toBe(201);

    const list = await sec.get(`/api/students/${stId}/education-history`);
    expect(list.status).toBe(200);
    const rows = bodyOf<EduEntry[]>(list);
    expect(rows.map((r) => r.studyYear)).toEqual(['۱۴۰۱–۱۴۰۲', '۱۴۰۲–۱۴۰۳']);
    expect(rows[0].schoolName).toBe('دبستان غیردولتی دانش');
    expect(rows[0].level).toBe('اول ابتدایی');
  });

  it('درمانگر خواندن آزاد دارد ولی افزودن/حذف → ۴۰۳ (دفتر)', async () => {
    const read = await ali.get(`/api/students/${stId}/education-history`);
    expect(read.status).toBe(200);

    const post = await ali.post(`/api/students/${stId}/education-history`, { study_year: '۱۴۰۰–۱۴۰۱' });
    expect(post.status).toBe(403);

    const list = bodyOf<EduEntry[]>((await sec.get(`/api/students/${stId}/education-history`)));
    const first = list[0];
    const del = await ali.delete(`/api/students/${stId}/education-history/${first.id}`);
    expect(del.status).toBe(403);
  });

  it('حذف یک سال — فقط دفتر؛ بعد از حذف از فهرست می‌رود', async () => {
    const list = bodyOf<EduEntry[]>((await sec.get(`/api/students/${stId}/education-history`)));
    const target = list[0];

    const del = await sec.delete(`/api/students/${stId}/education-history/${target.id}`);
    expect(del.status).toBe(204);

    const after = bodyOf<EduEntry[]>(await sec.get(`/api/students/${stId}/education-history`));
    expect(after.find((r) => r.id === target.id)).toBeUndefined();
    expect(after.length).toBe(list.length - 1);
  });

  it('مدخل ناموجود → ۴۰۴ و دانش‌آموز ناموجود → ۴۰۴', async () => {
    const missingEntry = await sec.delete(`/api/students/${stId}/education-history/99999999-9999-9999-9999-999999999999`);
    expect(missingEntry.status).toBe(404);

    const missingStudent = await sec.get('/api/students/99999999-9999-9999-9999-999999999999/education-history');
    expect(missingStudent.status).toBe(404);
  });

  it('سال تحصیلی خیلی بلند → ۴۰۰ (اعتبارسنجی Zod)', async () => {
    const res = await sec.post(`/api/students/${stId}/education-history`, {
      study_year: 'x'.repeat(25)
    });
    expect(res.status).toBe(400);
  });
});

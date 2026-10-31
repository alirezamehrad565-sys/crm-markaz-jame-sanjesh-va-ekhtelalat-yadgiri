import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, asRole, Api } from '../../test/harness';
import { jalaliToGregorianYmd } from '@core/shared';

// ─── درون‌ریزی اکسل: رگرسیون‌های e2e ───

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

interface AuditRow {
  action: string;
  resource_type: string;
}

const MEHR_1_1404 = jalaliToGregorianYmd(1404, 7, 1);
const MEHR_7_1404 = jalaliToGregorianYmd(1404, 7, 7);
const ABAN_1_1404 = jalaliToGregorianYmd(1404, 8, 1);

describe('درون‌ریزی اکسل — رجیستری و RBAC', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;
  let secretary: Api;
  let therapist: Api;

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
    secretary = await asRole(A, 'secretary');
    therapist = await asRole(A, 'therapist');
  });

  it('رجیستری برای مدیر هر سه موجودیت و برای منشی فقط تقویم اجرایی است', async () => {
    const mgr = dataOf<{ key: string; roles: string[]; columns: unknown[] }[]>(await manager.get('/api/import/registry'));
    expect(mgr.map((e) => e.key).sort()).toEqual(['clearbook-plans', 'school-classes', 'schools']);
    const schools = mgr.find((e) => e.key === 'schools')!;
    expect(schools.roles).toEqual(['manager']);
    expect(schools.columns.length).toBe(9);
    expect(schools.columns.some((c) => (c as { required?: boolean }).required)).toBe(true);

    const classes = mgr.find((e) => e.key === 'school-classes')!;
    expect(classes.roles).toEqual(['manager']);
    expect(classes.columns.map((c) => (c as { key: string }).key)).toEqual(['school', 'class_name', 'teacher_name', 'teacher_phone']);

    const sec = dataOf<{ key: string }[]>(await secretary.get('/api/import/registry'));
    expect(sec.map((e) => e.key)).toEqual(['clearbook-plans']);
  });

  it('درمانگر و مهمان مجاز نیستند (۴۰۳/۴۰۱)', async () => {
    expect((await therapist.get('/api/import/registry')).status).toBe(403);
    expect((await new Api(A).get('/api/import/registry')).status).toBe(401);
    expect((await therapist.post('/api/import/schools/validate', { rows: [{ name: 'آزمون' }] })).status).toBe(403);
    expect((await therapist.post('/api/import/clearbook-plans/commit', { rows: [{ title: 'آزمون' }] })).status).toBe(403);
  });

  it('منشی برای مدارس مجاز به نوشتن نیست ولی تقویم اجرایی بله', async () => {
    expect((await secretary.post('/api/import/schools/validate', { rows: [{ name: 'مدرسه منشی' }] })).status).toBe(403);
    expect(
      (await secretary.post('/api/import/clearbook-plans/validate', { rows: [{ title: 'فاز منشی', from_date: '1404/07/01' }] })).status
    ).toBe(200);
  });

  it('موجودیت ناشناخته ۴۰۴ می‌دهد', async () => {
    expect((await manager.post('/api/import/unknown-entity/validate', { rows: [{ a: 'b' }] })).status).toBe(404);
  });
});

describe('درون‌ریزی اکسل — اعتبارسنجی مدارس', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
  });

  it('سطر تازه «افزودن» و مدرسهٔ موجود (نام هم‌نرمال) «ویرایش» است؛ ارقام فارسی نرمال می‌شود', async () => {
    const res = await manager.post('/api/import/schools/validate', {
      rows: [
        { name: 'دبستان نمونهٔ نو', kind: 'مهدکودک', phone: '۰۲۱-۱۲۳۴۵۶۷۸', code: '۴۴۹۹۰۰۱۰' },
        { name: 'دبستان شهید مطهری', phone: '02199998877' }, // seeded — ویرایش
        { name: 'دبستان  شهید  مطهری' } // هم‌نرمالِ سطر ۲ → تکراری درون فایل
      ]
    });
    expect(res.status).toBe(200);
    const v = dataOf<{ summary: { add: number; update: number; error: number }; rows: { status: string; errors: string[]; display: Record<string, string> }[] }>(res);
    expect(v.summary).toEqual({ add: 1, update: 1, error: 1 });
    expect(v.rows[0].status).toBe('add');
    expect(v.rows[0].display.kind).toBe('مهدکودک');
    expect(v.rows[0].display.phone).toBe('021-12345678');
    expect(v.rows[0].display.code).toBe('44990010');
    expect(v.rows[1].status).toBe('update');
    expect(v.rows[2].status).toBe('error');
    expect(v.rows[2].errors.join(' ')).toContain('هم آمده است');
  });

  it('خطاهای سطری: نام خالی/کوتاه، نوع نامعتبر، تلفن نامعتبر، تکرار درون فایل', async () => {
    const res = await manager.post('/api/import/schools/validate', {
      rows: [
        { name: '' },
        { name: 'م' },
        { name: 'مدرسه نوع بد', kind: 'دبستان' },
        { name: 'مدرسه تلفن بد', phone: 'تلفن نامشخص' },
        { name: 'مدرسه تکراری الف', code: '111222333' },
        { name: 'مدرسه تکراری ب', code: '۱۱۱۲۲۲۳۳۳' }
      ]
    });
    const v = dataOf<{ summary: { error: number }; rows: { status: string; errors: string[] }[] }>(res);
    expect(v.rows[0].errors.join(' ')).toContain('خالی است');
    expect(v.rows[1].errors.join(' ')).toContain('حداقل ۲ نویسه');
    expect(v.rows[2].errors.join(' ')).toContain('نوع» نامعتبر');
    expect(v.rows[3].errors.join(' ')).toContain('تلفن» معتبر نیست');
    expect(v.rows[4].status).toBe('add');
    expect(v.rows[5].errors.join(' ')).toContain('هم آمده است');
    expect(v.summary.error).toBe(5);
  });

  it('تعارض کد مدرسه با مدرسهٔ دیگر خطا می‌گیرد', async () => {
    await manager.post('/api/schools', { name: 'مدرسه صاحب کد', code: '887766554' });
    const res = await manager.post('/api/import/schools/validate', {
      rows: [{ name: 'مدرسه دیگر', code: '887766554' }]
    });
    const v = dataOf<{ rows: { status: string; errors: string[] }[] }>(res);
    expect(v.rows[0].status).toBe('error');
    expect(v.rows[0].errors.join(' ')).toContain('قبلاً برای «مدرسه صاحب کد»');
  });

  it('محدودیت سطر: بیش از ۵۰۰ ردیف ۴۰۰ و آرایهٔ خالی ۴۰۰ است', async () => {
    const many = Array.from({ length: 501 }, (_, i) => ({ name: `مدرسه شماره ${i}` }));
    expect((await manager.post('/api/import/schools/validate', { rows: many })).status).toBe(400);
    expect((await manager.post('/api/import/schools/validate', { rows: [] })).status).toBe(400);
  });
});

describe('درون‌ریزی اکسل — ثبت مدارس (upsert + خانهٔ خالی)', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
  });

  it('ثبت ترکیبی: افزودن + ویرایش + رد شدن خطاها؛ خالی یعنی حفظ مقدار قبلی؛ audit ثبت می‌شود', async () => {
    // تلفن فعلی مدرسه seed: 021-12345678
    const res = await manager.post('/api/import/schools/commit', {
      rows: [
        { name: 'مهدکودک ستاره', kind: 'مهدکودک', gender_type: 'دخترانه', phone: '۰۳۱۳۳۳۳۴۴۵۵' },
        { name: 'دبستان شهید مطهری', principal_name: 'آقای مطهری‌زاده' }, // فقط نام مدیر — بقیه حفظ
        { name: '' } // خطا — رد می‌شود
      ]
    });
    expect(res.status).toBe(200);
    const r = dataOf<{ added: number; updated: number; skipped: number }>(res);
    expect(r).toEqual({ added: 1, updated: 1, skipped: 1 });

    const schools = dataOf<{ name: string; kind: string; genderType: string | null; phone: string | null; principalName: string | null; address: string | null }[]>(await manager.get('/api/schools'));
    const added = schools.find((s) => s.name === 'مهدکودک ستاره')!;
    expect(added.kind).toBe('kindergarten');
    expect(added.genderType).toBe('female');
    expect(added.phone).toBe('03133334455');

    const updated = schools.find((s) => s.name === 'دبستان شهید مطهری')!;
    expect(updated.principalName).toBe('آقای مطهری‌زاده');
    expect(updated.phone).toBe('021-12345678'); // خانهٔ خالی → مقدار قبلی
    expect(updated.address).toBe('تهران، خیابان آزادی'); // دست‌نخورده

    const audits = A.sql.prepare(`SELECT action, resource_type FROM audit_log WHERE action LIKE 'import.%'`).all() as unknown as AuditRow[];
    expect(audits.some((a) => a.action === 'import.schools')).toBe(true);
  });
});

describe('درون‌ریزی اکسل — کلاس‌ها و معلمان ()', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
  });

  it('اعتبارسنجی: افزودن/ویرایش (مدرسهٔ seed)، ارقام فارسی تلفن، مدرسهٔ ناشناخته، تکرار درون فایل', async () => {
    // کلاس موجود برای تشخیص ویرایش
    await manager.post('/api/classes', { school_id: '10000000-0000-0000-0000-000000000001', name: 'چهارم ب', teacher_name: 'خانم اکبری', teacher_phone: '09131112233' });

    const res = await manager.post('/api/import/school-classes/validate', {
      rows: [
        { school: 'دبستان شهید مطهری', class_name: 'پنجم الف', teacher_name: 'خانم رضایی', teacher_phone: '۰۹۱۳۱۲۳۴۵۶۷' },
        { school: 'دبستان  شهید مطهری', class_name: 'چهارم ب' }, // هم‌نرمالِ کلاس seed → ویرایش
        { school: 'مدرسهٔ ناموجود', class_name: 'اول الف' },
        { school: '', class_name: 'اول ب' },
        { school: 'دبستان شهید مطهری', class_name: '' },
        { school: 'دبستان شهید مطهری', class_name: 'پ', teacher_phone: 'تلفن معلوم نیست' },
        { school: 'دبستان شهید مطهری', class_name: 'پنجم الف', teacher_name: 'تکراری' }
      ]
    });
    expect(res.status).toBe(200);
    const v = dataOf<{ summary: { add: number; update: number; error: number }; rows: { status: string; errors: string[]; display: Record<string, string> }[] }>(res);
    expect(v.summary).toEqual({ add: 1, update: 1, error: 5 });
    expect(v.rows[0].status).toBe('add');
    expect(v.rows[0].display.teacher_phone).toBe('09131234567');
    expect(v.rows[1].status).toBe('update');
    expect(v.rows[2].errors.join(' ')).toContain('مدرسه با این نام یافت نشد');
    expect(v.rows[3].errors.join(' ')).toContain('نام مدرسه» خالی است');
    expect(v.rows[4].errors.join(' ')).toContain('نام کلاس» خالی است');
    expect(v.rows[5].errors.join(' ')).toContain('تلفن معلم» معتبر نیست');
    expect(v.rows[6].errors.join(' ')).toContain('هم آمده است');
  });

  it('منشی و درمانگر مجاز به درون‌ریزی کلاس‌ها نیستند', async () => {
    const secretary = await asRole(A, 'secretary');
    const therapist = await asRole(A, 'therapist');
    expect((await secretary.post('/api/import/school-classes/validate', { rows: [{ school: 'م', class_name: 'ک' }] })).status).toBe(403);
    expect((await therapist.post('/api/import/school-classes/commit', { rows: [{ school: 'م', class_name: 'ک' }] })).status).toBe(403);
  });

  it('ثبت: افزودن با تلفن نرمال‌شده، ویرایش با خانهٔ خالی (حفظ معلم)، فعال‌سازی دوبارهٔ کلاس غیرفعال، audit', async () => {
    // کلاس غیرفعال برای سناریوی فعال‌سازی دوباره
    const made = dataOf<{ id: string }>(await manager.post('/api/classes', { school_id: '10000000-0000-0000-0000-000000000001', name: 'سوم ت', teacher_name: 'خانم سعیدی', teacher_phone: '09135556677' }));
    expect((await manager.post(`/api/classes/${made.id}/deactivate`)).status).toBe(200);

    const res = await manager.post('/api/import/school-classes/commit', {
      rows: [
        { school: 'دبستان شهید مطهری', class_name: 'پنجم الف', teacher_name: 'خانم رضایی', teacher_phone: '۰۹۱۳۱۲۳۴۵۶۷' },
        { school: 'دبستان شهید مطهری', class_name: 'چهارم ب', teacher_name: 'خانم اکبری‌نژاد' }, // فقط نام معلم عوض می‌شود
        { school: 'دبستان شهید مطهری', class_name: 'سوم ت' }, // خالی‌ها حفظ + فعال دوباره
        { school: 'مدرسهٔ ناموجود', class_name: 'اول الف' } // خطا — رد می‌شود
      ]
    });
    expect(res.status).toBe(200);
    expect(dataOf<{ added: number; updated: number; skipped: number }>(res)).toEqual({ added: 1, updated: 2, skipped: 1 });

    const classes = dataOf<{ id: string; schoolName: string; name: string; teacherName: string | null; teacherPhone: string | null; active: boolean }[]>(await manager.get('/api/classes'));
    const added = classes.find((c) => c.name === 'پنجم الف')!;
    expect(added.schoolName).toBe('دبستان شهید مطهری');
    expect(added.teacherName).toBe('خانم رضایی');
    expect(added.teacherPhone).toBe('09131234567');
    expect(added.active).toBe(true);

    const edited = classes.find((c) => c.name === 'چهارم ب')!;
    expect(edited.teacherName).toBe('خانم اکبری‌نژاد');
    expect(edited.teacherPhone).toBe('09131112233'); // خانهٔ خالی → مقدار قبلی

    const reactivated = classes.find((c) => c.name === 'سوم ت')!;
    expect(reactivated.active).toBe(true);
    expect(reactivated.teacherName).toBe('خانم سعیدی');
    expect(reactivated.teacherPhone).toBe('09135556677');

    const audits = A.sql.prepare(`SELECT action FROM audit_log WHERE action LIKE 'import.%'`).all() as unknown as { action: string }[];
    expect(audits.some((a) => a.action === 'import.school_classes')).toBe(true);
  });
});

describe('درون‌ریزی اکسل — تقویم اجرایی (تاریخ شمسی + upsert عنوان)', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
  });

  it('اعتبارسنجی: تاریخ شمسی/فشرده، وضعیت فارسی، خطای بازه و تاریخ نامعتبر (اسفند ۳۰ سال غیرکابیسه)', async () => {
    const res = await manager.post('/api/import/clearbook-plans/validate', {
      rows: [
        { title: 'هفتهٔ اول مهر', from_date: '۱۴۰۴/۰۷/۰۱', to_date: '1404/7/7', status: 'در جریان', tag: 'جلسات اولیا' },
        { title: 'فاز فشرده', from_date: '14040801' },
        { title: 'بازهٔ وارونه', from_date: '1404/07/10', to_date: '1404/07/01' },
        { title: 'تاریخ نامعتبر', from_date: '1404/12/30' }, // ۱۴۰۴ کابیسه نیست
        { title: 'ماه نامعتبر', from_date: '1404/13/01' }
      ]
    });
    expect(res.status).toBe(200);
    const v = dataOf<{ summary: { add: number; error: number }; rows: { status: string; display: Record<string, string>; errors: string[] }[] }>(res);
    expect(v.rows[0].status).toBe('add');
    expect(v.rows[0].display.from_date).toBe('1404/07/01');
    expect(v.rows[0].display.status).toBe('در جریان');
    expect(v.rows[1].status).toBe('add');
    expect(v.rows[2].errors.join(' ')).toContain('قبل از');
    expect(v.rows[3].errors.join(' ')).toContain('از تاریخ» نامعتبر');
    expect(v.rows[4].errors.join(' ')).toContain('از تاریخ» نامعتبر');
    expect(v.summary.add).toBe(2);
    expect(v.summary.error).toBe(3);
  });

  it('ثبت: تاریخ شمسی به میلادی ذخیره می‌شود؛ عنوان موجود ویرایش و ترتیب فازهای تازه در انتهاست', async () => {
    const created = await manager.post('/api/clearbook/plans', {
      title: 'فاز پیش از اکسل',
      from_date: MEHR_1_1404,
      status: 'active'
    });
    expect(created.status).toBe(201);

    const res = await manager.post('/api/import/clearbook-plans/commit', {
      rows: [
        { title: 'فاز پیش از اکسل', from_date: '1404/07/01', to_date: '1404/07/07', status: 'تکمیل' }, // ویرایش
        { title: 'هفتهٔ اول مهر', from_date: '۱۴۰۴/۰۷/۰۱', to_date: '1404/7/7', status: 'در جریان', tag: 'جلسات اولیا' },
        { title: 'آبان — غربالگری', from_date: '14040801', admin_actions: 'بخشنامهٔ غربالگری' }
      ]
    });
    expect(res.status).toBe(200);
    const r = dataOf<{ added: number; updated: number; skipped: number }>(res);
    expect(r).toEqual({ added: 2, updated: 1, skipped: 0 });

    const plans = dataOf<{ id: string; title: string; fromDate: string; toDate: string | null; status: string; tag: string | null; adminActions: string; sortOrder: number }[]>(await manager.get('/api/clearbook/plans'));
    const edited = plans.find((p) => p.title === 'فاز پیش از اکسل')!;
    expect(edited.fromDate).toBe(MEHR_1_1404);
    expect(edited.toDate).toBe(MEHR_7_1404);
    expect(edited.status).toBe('done');

    const mehr = plans.find((p) => p.title === 'هفتهٔ اول مهر')!;
    expect(mehr.fromDate).toBe(MEHR_1_1404);
    expect(mehr.toDate).toBe(MEHR_7_1404);
    expect(mehr.status).toBe('active');
    expect(mehr.tag).toBe('جلسات اولیا');

    const aban = plans.find((p) => p.title === 'آبان — غربالگری')!;
    expect(aban.fromDate).toBe(ABAN_1_1404);
    expect(aban.adminActions).toBe('بخشنامهٔ غربالگری');
    expect(aban.sortOrder).toBeGreaterThan(edited.sortOrder);

    const audits = A.sql.prepare(`SELECT action FROM audit_log WHERE action LIKE 'import.%'`).all() as unknown as AuditRow[];
    expect(audits.some((a) => a.action === 'import.clearbook_plans')).toBe(true);
  });

  it('سطرهای خطادار در ثبت هم رد می‌شوند و سطر تکراری فایل خطا می‌گیرد', async () => {
    const res = await manager.post('/api/import/clearbook-plans/validate', {
      rows: [
        { title: 'فاز تکراری', from_date: '1404/09/01' },
        { title: 'فاز تکراری', from_date: '1404/09/02' }
      ]
    });
    const v = dataOf<{ rows: { status: string; errors: string[] }[] }>(res);
    expect(v.rows[0].status).toBe('add');
    expect(v.rows[1].status).toBe('error');
    expect(v.rows[1].errors.join(' ')).toContain('سطر ۱');
  });
});

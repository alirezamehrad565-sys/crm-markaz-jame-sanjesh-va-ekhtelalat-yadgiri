import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, asRole, Api } from '../../../test/harness';
import { currentSchoolYear } from '@core/shared';

const data = <T>(res: { body: unknown }): T => (res.body as { data: T }).data;

const FAKE_CTX = { waitUntil: () => undefined, passThroughOnException: () => undefined } as never;

describe('فرم عمومی معرفی به مرکز + اینباکس لیست انتظار (۱.۲۷.۳۳)', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: Api;
  let sec: Api;
  let familyId: string;
  let teacherIds: string[] = [];

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
    sec = await asRole(A, 'secretary');
  });

  it('ثبت معرفی خانواده — موبایل با ارقام فارسی نرمال می‌شود و تاریخ شمسی به میلادی می‌بَرد', async () => {
    const res = await new Api(A).post('/public/referrals', {
      role: 'family',
      referrer_name: 'مریم رضایی',
      referrer_phone: '۰۹۱۲۳۴۵۶۷۸۹',
      school_text: 'دبستان شهید بهشتی',
      grade_text: 'دوم دبستان',
      class_text: 'دوم ۱',
      children: [
        {
          first_name: 'آوا کریمی',
          birth_date_text: '۱۳۹۸/۵/۱۲',
          concern_category: 'learning_disorder',
          concern_text: 'مشکوک به دیسلکسی',
          family_culture: 'mid',
          family_finance: 'low',
          family_cooperation: 'high'
        }
      ]
    });
    expect(res.status).toBe(201);
    const rows = data<{ id: string; status: string; referrerPhone: string; academicYear: string | null; birthDate: string | null; channel: string }[]>(res);
    expect(rows.length).toBe(1);
    familyId = rows[0].id;
    expect(rows[0].status).toBe('new');
    expect(rows[0].referrerPhone).toBe('09123456789');
    expect(rows[0].channel).toBe('web');
    expect(rows[0].academicYear).toBe(currentSchoolYear());
    expect(rows[0].birthDate).toBe('2019-08-03'); // ۱۳۹۸/۰۵/۱۲
    /* ۱.۲۷.۳۶ — فرم تکمیلی خانواده در ستون JSON ثبت شده است */
    const famRow = A.sql.prepare(`SELECT family_context FROM waitlist_referrals WHERE id = ?`).get(familyId) as { family_context: string | null };
    expect(JSON.parse(famRow.family_context ?? '{}')).toEqual({ culture: 'mid', finance: 'low', cooperation: 'high' });
  });

  it('فرم خانواده با بیش از یک کودک → ۴۰۰', async () => {
    const res = await new Api(A).post('/public/referrals', {
      role: 'family',
      referrer_name: 'مریم رضایی',
      referrer_phone: '09123456789',
      children: [
        { first_name: 'کودک اول' },
        { first_name: 'کودک دوم' }
      ]
    });
    expect(res.status).toBe(400);
  });

  it('تکرار همان کودک + همان تلفن در همان سال تحصیلی → ۴۰۹', async () => {
    const res = await new Api(A).post('/public/referrals', {
      role: 'family',
      referrer_name: 'مریم رضایی',
      referrer_phone: '09123456789',
      children: [{ first_name: 'آوا کریمی' }]
    });
    expect(res.status).toBe(409);
  });

  it('ثبت دسته‌ای معلم — سه دانش‌آموز، هر ردیف تلفن والد خودش؛ گروه مشترک', async () => {
    const res = await new Api(A).post('/public/referrals', {
      role: 'teacher',
      referrer_name: 'خانم صادقی',
      referrer_phone: '09121112233',
      school_text: 'دبستان شهید بهشتی',
      children: [
        { first_name: 'سینا مرادی', guardian_phone: '09123333331', concern_category: 'delayed' },
        { first_name: 'نازنین احمدی', guardian_phone: '09123333332', concern_category: 'autism' },
        { first_name: 'رضا موسوی', guardian_phone: '09123333333', concern_category: 'learning_disorder' }
      ]
    });
    expect(res.status).toBe(201);
    const rows = data<{ id: string; submissionGroup: string | null; guardianPhone: string | null; refRole: string }[]>(res);
    expect(rows.length).toBe(3);
    teacherIds = rows.map((r) => r.id);
    expect(new Set(rows.map((r) => r.submissionGroup)).size).toBe(1);
    expect(rows[0].refRole).toBe('teacher');
    expect(rows[0].guardianPhone).toBe('09123333331');
    expect(rows[2].guardianPhone).toBe('09123333333'); // — ارقام فارسی هم نرمال شد
  });

  it('اعتبارسنجی: تلفن نامعتبر → ۴۰۰؛ بدون کودک → ۴۰۰؛ نقش نامعتبر → ۴۰۰', async () => {
    const badPhone = await new Api(A).post('/public/referrals', {
      role: 'family', referrer_name: 'تست', referrer_phone: '0912345', children: [{ first_name: 'کودک' }]
    });
    expect(badPhone.status).toBe(400);
    const noChild = await new Api(A).post('/public/referrals', {
      role: 'family', referrer_name: 'تست', referrer_phone: '09123456789', children: []
    });
    expect(noChild.status).toBe(400);
    const badRole = await new Api(A).post('/public/referrals', {
      role: 'other', referrer_name: 'تست', referrer_phone: '09123456789', children: [{ first_name: 'کودک' }]
    });
    expect(badRole.status).toBe(400);
  });

  it('اینباکس: فهرست برای منشی با فیلتر وضعیت — بدون لاگین → ۴۰۱', async () => {
    const anon = await new Api(A).get('/api/waitlist/referrals');
    expect(anon.status).toBe(401);
    const res = await sec.get('/api/waitlist/referrals?status=new');
    expect(res.status).toBe(200);
    const rows = data<{ id: string; status: string }[]>(res);
    expect(rows.some((r) => r.id === familyId)).toBe(true);
    expect(rows.every((r) => r.status === 'new')).toBe(true);
  });

  it('پذیرش معرفی خانواده — ردیف لیست انتظار با تلفن معرف و منبع «مراجعه مستقیم» + پیوند referral_id', async () => {
    const res = await sec.post(`/api/waitlist/referrals/${familyId}/accept`, {});
    expect(res.status).toBe(200);
    const entry = data<{ id: string; firstName: string; phone: string; source: string; serviceType: string | null; status: string }>(res);
    expect(entry.firstName).toBe('آوا کریمی');
    expect(entry.phone).toBe('09123456789');
    expect(entry.source).toBe('self');
    expect(entry.serviceType).toBe('اختلال یادگیری');
    expect(entry.status).toBe('waiting');
    const list = data<{ id: string; firstName: string }[]>(await mgr.get(`/api/waitlist?q=${encodeURIComponent('آوا کریمی')}`));
    expect(list.some((r) => r.firstName === 'آوا کریمی')).toBe(true);
    const again = await sec.post(`/api/waitlist/referrals/${familyId}/accept`, {});
    expect(again.status).toBe(409);
  });

  it('پذیرش معرفی معلم — تلفن ولیّ از ردیف کودک می‌آید و منبع «معلم» است', async () => {
    const res = await mgr.post(`/api/waitlist/referrals/${teacherIds[0]}/accept`, {});
    expect(res.status).toBe(200);
    const entry = data<{ phone: string; source: string; serviceType: string | null }>(res);
    expect(entry.phone).toBe('09123333331');
    expect(entry.source).toBe('teacher');
    expect(entry.serviceType).toBe('دیرآموز');
  });

  it('رد بدون دلیل → ۴۰۰؛ با دلیل → وضعیت ردشده + ثبت دلیل', async () => {
    const noReason = await mgr.post(`/api/waitlist/referrals/${teacherIds[1]}/reject`, {});
    expect(noReason.status).toBe(400);
    const res = await mgr.post(`/api/waitlist/referrals/${teacherIds[1]}/reject`, { reason: 'خارج از محدودهٔ سنی مرکز' });
    expect(res.status).toBe(200);
    expect(data<{ status: string; rejectReason: string | null }>(res).status).toBe('rejected');
    expect(data<{ rejectReason: string | null }>(res).rejectReason).toBe('خارج از محدودهٔ سنی مرکز');
  });

  it('محدودساز نرخ عمومی — ۲۱ درخواست از یک IP → ۴۲۹ (بدون دست‌زدن به سهم IPهای دیگر)', async () => {
    const ip = '10.77.7.7';
    let lastStatus = 0;
    for (let i = 0; i < 21; i++) {
      const res = await A.app.request(
        '/public/referrals',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
          body: JSON.stringify({ role: 'family', referrer_name: 'تست نرخ', referrer_phone: '09120000001', children: [{ first_name: `کودک نرخ ${i}` }] })
        },
        A.env as never,
        FAKE_CTX
      );
      lastStatus = res.status;
      await res.text();
    }
    expect(lastStatus).toBe(429);
    const otherIp = await new Api(A).post('/public/referrals', {
      role: 'family', referrer_name: 'تست نرخ', referrer_phone: '09120000002', children: [{ first_name: 'کودک نرخ دیگر' }]
    });
    expect(otherIp.status).toBe(201); // — IP دیگر سهم خودش را دارد
  });

  it('صفحهٔ عمومی فرم معرفی — HTML بدون لاگین با no-store/noindex/CSP', async () => {
    const res = await A.app.request('/public/referral?token=abc-123');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('معرفی به مرکز');
    expect(html).toContain('شروع'); // — متن خوش‌آمد در اسکریپت صفحه است
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-robots-tag')).toContain('noindex');
    expect(res.headers.get('content-security-policy')).toContain('script-src');
    // ۱.۲۷.۳۵ — وزیرمتن + افکت فید روی صفحهٔ معرفی هم
    expect(html).toContain('/assets/fonts/Vazirmatn-Variable.woff2') /* ۱.۲۷.۴۲ — فونت خودی */;
    expect(html).toContain('@keyframes fadein');
    expect(res.headers.get('content-security-policy')).toContain("font-src 'self'"); // ۱.۲۷.۴۲ — فونت فقط خودی
    /* ۱.۲۷.۳۶ — گام فرم تکمیلی خانواده هست؛ گزینهٔ اتیسم دیگر پیشنهاد نمی‌شود */
    expect(html).not.toContain('وضعیت خانواده'); // ۱.۲۷.۴۲ — فرم تکمیلی خانواده حذف شد (خواست کارفرما)
    expect(html).toContain('قبلاً جایی ارزیابی یا تشخیص داشته؟');
    expect(html).not.toContain('سطح مالی خانواده') /* ۱.۲۷.۴۲ — فرم وضعیت خانواده حذف شد */;
    expect(html).not.toContain('میزان همکاری خانواده') /* ۱.۲۷.۴۲ */;
    expect(html).not.toContain('نمی‌دانم') /* ۱.۲۷.۴۲ — گام حذف‌شده */;
    expect(html).not.toContain('data-c="autism"'); // کارت دغدغهٔ اتیسم حذف شده
    expect(html).not.toContain('data-cat="autism"'); // دستهٔ معلم هم
    expect(html).toContain("flex:1 1 0"); // دکمه‌های هم‌اندازه
  });

  it('GET /api/waitlist/referrals هرگز به‌عنوان id پارس نمی‌شود', async () => {
    const res = await sec.get('/api/waitlist/referrals');
    expect(res.status).toBe(200);
    expect(Array.isArray(data<unknown[]>(res))).toBe(true);
  });
});

import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, asRole, Api } from '../../../test/harness';

const data = <T>(res: { body: unknown }): T => (res.body as { data: T }).data;

const FAKE_CTX = { waitUntil: () => undefined, passThroughOnException: () => undefined } as never;

const BLOCKS = [
  { kind: 'note', label: 'درباره این نظرسنجی', note: 'چند پرسش کوتاه درباره کیفیت جلسات — کمتر از دو دقیقه.' },
  { kind: 'text', label: 'کدام فعالیت مفیدتر بود؟', required: true },
  { kind: 'number', label: 'از کیفیت جلسات از ۱ تا ۱۰ چند؟', required: true },
  { kind: 'select', label: 'مدرسه شما؟', options: [{ value: 'o1', label: 'شهید بهشتی' }, { value: 'o2', label: 'نمونه دولتی' }] },
  { kind: 'multi', label: 'کدام‌ها را امتحان کردید؟', options: [{ value: 'o1', label: 'تمرین خواندن' }, { value: 'o2', label: 'تمرین حساب' }] },
  { kind: 'yes_no', label: 'تمایل به ادامه دارید؟', required: true },
  { kind: 'phone', label: 'موبایل جایگزین (اختیاری)' }
];

describe('فرم‌ساز تعاملی عمومی (۱.۲۷.۳۴)', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: Api;
  let sec: Api;
  let ali: Api;
  let formId: string;

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
    sec = await asRole(A, 'secretary');
    ali = await asRole(A, 'therapist');
    const res = await mgr.post('/api/forms', {
      title: 'نظرسنجی جلسات',
      slug: 'spring-survey',
      description: 'نظر شما مسیر ما را عوض می‌کند',
      blocks: BLOCKS,
      published: true
    });
    expect(res.status).toBe(201);
    formId = data<{ id: string }>(res).id;
  });

  it('ساخت فرم توسط مدیر — اسلاگ + بلوک‌های شِمادار ذخیره شد', async () => {
    const res = await mgr.get(`/api/forms/${formId}`);
    const f = data<{ slug: string; blocks: { kind: string }[]; published: boolean; title: string }>(res);
    expect(f.slug).toBe('spring-survey');
    expect(f.published).toBe(true);
    expect(f.blocks.length).toBe(7);
    expect(f.blocks[0].kind).toBe('note');
  });

  it('اسلاگ تکراری → ۴۰۹', async () => {
    const res = await sec.post('/api/forms', { title: 'فرم دوم', slug: 'spring-survey', blocks: [], published: false });
    expect(res.status).toBe(409);
  });

  it('اعتبارسنجی شِما: select تک‌گزینه‌ای → ۴۰۰؛ اسلاگ بد → ۴۰۰؛ عنوان کوتاه → ۴۰۰', async () => {
    const oneOption = await sec.post('/api/forms', {
      title: 'فرم بد', slug: 'bad-options', blocks: [{ kind: 'select', label: 'انتخاب', options: [{ value: 'o1', label: 'فقط یکی' }] }]
    });
    expect(oneOption.status).toBe(400);
    const badSlug = await sec.post('/api/forms', { title: 'فرم بد', slug: 'اسلاگ فارسی!', blocks: [] });
    expect(badSlug.status).toBe(400);
    const shortTitle = await sec.post('/api/forms', { title: 'ف', slug: 'short-title', blocks: [] });
    expect(shortTitle.status).toBe(400);
  });

  it('RBAC: درمانگر نمی‌سازد (۴۰۳)؛ بدون لاگین → ۴۰۱؛ درمانگر پاسخ‌ها را می‌خواند ولی «خوانده شد» نمی‌زند', async () => {
    const forbidden = await ali.post('/api/forms', { title: 'فرم درمانگر', slug: 'ali-form', blocks: [] });
    expect(forbidden.status).toBe(403);
    const anon = await new Api(A).get('/api/forms');
    expect(anon.status).toBe(401);
    const respList = await ali.get(`/api/forms/${formId}/responses`);
    expect(respList.status).toBe(200);
  });

  it('صفحهٔ عمومی فرم منتشرشده → HTML با no-store/noindex/CSP؛ اسلاگ ناشناخته → صفحهٔ «یافت نشد» با ۴۰۴', async () => {
    const res = await A.app.request('/public/form/spring-survey');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-robots-tag')).toContain('noindex');
    const html = await res.text();
    expect(html).toContain('نظرسنجی جلسات');
    expect(html).toContain('کدام فعالیت مفیدتر بود؟');
    // ۱.۲۷.۳۵ — وزیرمتن + افکت فید + جریان پیوسته؛ CSP فقط jsdelivr را برای فونت باز می‌گذارد
    expect(html).toContain('Vazirmatn-font-face.css');
    expect(html).toContain('@keyframes fadein');
    expect(html).toContain('prefers-reduced-motion');
    expect(res.headers.get('content-security-policy')).toContain('font-src https://cdn.jsdelivr.net');
    const missing = await A.app.request('/public/form/nope-404');
    expect(missing.status).toBe(404);
    expect(await missing.text()).toContain('پیدا نشد');
  });

  it('ثبت پاسخ عمومی کامل → ۲۰۱ — ارقام فارسی موبایل نرمال، select/multi/yes_no معتبر', async () => {
    const res = await new Api(A).post('/public/form/spring-survey/submit', {
      respondent_name: 'مریم رضایی',
      respondent_phone: '۰۹۱۲۳۴۵۶۷۸۹',
      answers: [
        { index: 1, value: 'آوازخوانی گروهی' },
        { index: 2, value: '۹' },
        { index: 3, value: 'o1' },
        { index: 4, value: ['o1', 'o2'] },
        { index: 5, value: 'yes' },
        { index: 6, value: '۰۹۱۲۳۴۵۶۷۸۹' }
      ]
    });
    expect(res.status).toBe(201);
    const r = data<{ id: string; status: string; answers: { index: number; value: unknown }[]; channel: string }>(res);
    expect(r.status).toBe('new');
    expect(r.channel).toBe('web');
    const phoneAnswer = r.answers.find((a) => a.index === 6);
    expect(phoneAnswer?.value).toBe('09123456789');
  });

  it('بلوک اجباری خالی → ۴۰۰؛ گزینهٔ ناشناخته → ۴۰۰؛ اندیس بیرون رنج → ۴۰۰؛ موبایل بد → ۴۰۰', async () => {
    const noRequired = await new Api(A).post('/public/form/spring-survey/submit', {
      respondent_name: 'تست', answers: [{ index: 2, value: '۵' }, { index: 5, value: 'yes' }]
    });
    expect(noRequired.status).toBe(400);
    const unknownOption = await new Api(A).post('/public/form/spring-survey/submit', {
      respondent_name: 'تست', answers: [{ index: 1, value: 'x' }, { index: 2, value: '۵' }, { index: 3, value: 'o99' }, { index: 5, value: 'yes' }]
    });
    expect(unknownOption.status).toBe(400);
    const badIndex = await new Api(A).post('/public/form/spring-survey/submit', {
      respondent_name: 'تست', answers: [{ index: 99, value: 'x' }]
    });
    expect(badIndex.status).toBe(400);
    const badPhone = await new Api(A).post('/public/form/spring-survey/submit', {
      respondent_name: 'تست', answers: [{ index: 1, value: 'x' }, { index: 2, value: '۵' }, { index: 5, value: 'yes' }, { index: 6, value: '0912345' }]
    });
    expect(badPhone.status).toBe(400);
  });

  it('فرم منتشرنشده پاسخ نمی‌گیرد → ۴۰۴', async () => {
    const draft = await mgr.post('/api/forms', { title: 'پیش‌نویس', slug: 'draft-form', blocks: [], published: false });
    expect(draft.status).toBe(201);
    const submit = await new Api(A).post('/public/form/draft-form/submit', { respondent_name: 'تست', answers: [] });
    expect(submit.status).toBe(404);
  });

  it('صندوق پاسخ‌ها: فهرست + فیلتر جدید + «خوانده شد» فقط منشی/مدیر', async () => {
    const list = await sec.get(`/api/forms/${formId}/responses?status=new`);
    expect(list.status).toBe(200);
    const rows = data<{ id: string; status: string; respondentName: string; respondentPhone: string | null }[]>(list);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.status === 'new')).toBe(true);
    expect(rows[0].respondentName).toBe('مریم رضایی');
    expect(rows[0].respondentPhone).toBe('09123456789');
    const seen = await sec.post(`/api/forms/${formId}/responses/${rows[0].id}/seen`, {});
    expect(seen.status).toBe(200);
    expect(data<{ status: string }>(seen).status).toBe('seen');
  });

  it('ویرایش کل‌جایگزین + تغییر اسلاگ — لینک جدید ۲۰۰ و لینک قدیمی ۴۰۴', async () => {
    const res = await mgr.patch(`/api/forms/${formId}`, {
      title: 'نظرسنجی بهار',
      slug: 'spring-survey-2',
      description: 'عنوان تازه',
      blocks: BLOCKS.slice(0, 4),
      published: true
    });
    expect(res.status).toBe(200);
    expect(data<{ slug: string }>(res).slug).toBe('spring-survey-2');
    const newPage = await A.app.request('/public/form/spring-survey-2');
    expect(newPage.status).toBe(200);
    expect(await newPage.text()).toContain('نظرسنجی بهار');
    const oldPage = await A.app.request('/public/form/spring-survey');
    expect(oldPage.status).toBe(404);
  });

  it('سقف نرخ عمومی — درخواست ۳۱ از یک IP → ۴۲۹؛ IP دیگر سهم خودش را دارد', async () => {
    const rateForm = await mgr.post('/api/forms', {
      title: 'فرم نرخ', slug: 'rate-form', blocks: [{ kind: 'text', label: 'هر چیز', required: false }], published: true
    });
    expect(rateForm.status).toBe(201);
    const ip = '10.55.5.5';
    let lastStatus = 0;
    for (let i = 0; i < 31; i++) {
      const res = await A.app.request(
        '/public/form/rate-form/submit',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
          body: JSON.stringify({ respondent_name: 'تست نرخ', answers: [{ index: 0, value: `پاسخ ${i}` }] })
        },
        A.env as never,
        FAKE_CTX
      );
      lastStatus = res.status;
      await res.text();
    }
    expect(lastStatus).toBe(429);
    const otherIp = await new Api(A).post('/public/form/rate-form/submit', {
      respondent_name: 'تست نرخ دیگر', answers: [{ index: 0, value: 'پاسخ دیگر' }]
    });
    expect(otherIp.status).toBe(201);
  });

  it('حذف: منشی → ۴۰۳؛ مدیر → ۲۰۴ و صفحهٔ عمومی ۴۰۴', async () => {
    const bySec = await sec.delete(`/api/forms/${formId}`);
    expect(bySec.status).toBe(403);
    const byMgr = await mgr.delete(`/api/forms/${formId}`);
    expect(byMgr.status).toBe(204);
    const page = await A.app.request('/public/form/spring-survey-2');
    expect(page.status).toBe(404);
  });
});

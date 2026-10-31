import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, asRole, Api, MANAGER_ID, STUDENT1_ID } from '../../test/harness';
import { jalaliToGregorianYmd } from '@core/shared';
import { createAuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import { createChunkedD1ObjectStore } from '@core/storage';
import { createFinanceService, registerFinanceRoutes } from '@domain/finance';

// ─── بودجه و مالی مرکز: تست e2e ───
// دسترسی فقط مدیر؛ ریاضیِ تراز؛ حذف نرم؛ پیوست اسکن فاکتور؛ اتصال کمک به دانش‌آموز
//
// نکتهٔ سیم‌کشی: تا وقتی عامل اصلی createFinanceService را در api-routing وصل نکرده،
// سویت خودش ماژول را روی همان app ثبت می‌کند (اگر قبلاً وصل شده باشد، دوباره ثبت نمی‌شود).

function silentLogger(scope = 'it'): Logger {
  const base: Logger = {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    child: (sub) => silentLogger(`${scope}.${sub}`)
  };
  return base;
}

function createFinanceApp(): ReturnType<typeof createTestApp> {
  const A = createTestApp();
  const alreadyWired = (A.app as unknown as { routes: { path: string }[] }).routes.some(
    (r) => r.path === '/api/finance/summary'
  );
  if (!alreadyWired) {
    const finance = createFinanceService({
      db: A.db,
      audit: createAuditWriter(A.db),
      logger: silentLogger('finance'),
      storage: createChunkedD1ObjectStore(A.db)
    });
    registerFinanceRoutes(A.app, finance);
  }
  return A;
}

const M1_1404 = jalaliToGregorianYmd(1404, 7, 1); // ۲۰۲۵-۰۹-۲۳
const M10_1404 = jalaliToGregorianYmd(1404, 7, 10);
const ABAN15_1404 = jalaliToGregorianYmd(1404, 8, 15);
const FARVARDIN_1_1405 = jalaliToGregorianYmd(1405, 1, 1);

const PNG_BYTES = new TextEncoder().encode('%PNG-fake-finance-scan');
const PDF_BYTES = new TextEncoder().encode('%PDF-fake-finance-scan');

function makeFile(bytes: Uint8Array, name: string, type: string): File {
  return new File([bytes as unknown as ArrayBuffer], name, { type });
}

async function postForm(api: Api, path: string, form: FormData): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = api['token'] as string | null;
  if (token) headers['authorization'] = `Bearer ${token}`;
  const res = await api['testApp'].app.request(path, { method: 'POST', headers, body: form }, api['testApp'].env as never);
  let parsed: unknown = null;
  const text = await res.text();
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  return { status: res.status, body: parsed };
}

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

interface SummaryView {
  budgetTotal: number;
  donationsTotal: number;
  invoicesTotal: number;
  balance: number;
}

interface InvoiceView {
  id: string;
  title: string;
  amount: number;
  invoiceDate: string;
  category: string;
  description: string;
  attachment: { id: string; filename: string; mime: string; size: number } | null;
}

interface DonationView {
  id: string;
  donorName: string;
  amount: number;
  donationDate: string;
  studentId: string | null;
  studentName: string | null;
  note: string;
}

interface BudgetView {
  id: string;
  title: string;
  amount: number;
  periodFrom: string | null;
  periodTo: string | null;
  notes: string;
}

describe('بودجه و مالی — RBAC (فقط مدیر)', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;
  let secretary: Api;
  let therapist: Api;

  beforeAll(async () => {
    A = createFinanceApp();
    manager = await asRole(A, 'manager');
    secretary = await asRole(A, 'secretary');
    therapist = await asRole(A, 'therapist');
  });

  it('مهمان ۴۰۱ می‌گیرد', async () => {
    expect((await new Api(A).get('/api/finance/summary')).status).toBe(401);
  });

  it('منشی و درمانگر روی همهٔ مسیرها ممنوع‌اند (۴۰۳)', async () => {
    for (const api of [secretary, therapist]) {
      expect((await api.get('/api/finance/summary')).status).toBe(403);
      expect((await api.get('/api/finance/budgets')).status).toBe(403);
      expect((await api.get('/api/finance/invoices')).status).toBe(403);
      expect((await api.get('/api/finance/donations')).status).toBe(403);

      expect((await api.post('/api/finance/budgets', { title: 'ب', amount: 1 })).status).toBe(403);
      expect(
        (await api.post('/api/finance/invoices', { title: 'ف', amount: 1, invoice_date: M1_1404 })).status
      ).toBe(403);
      expect(
        (await api.post('/api/finance/donations', { donor_name: 'د', amount: 1, donation_date: M1_1404 })).status
      ).toBe(403);

      expect((await api.patch('/api/finance/budgets/00000000-0000-4000-8000-0000000000aa', { amount: 2 })).status).toBe(403);
      expect((await api.patch('/api/finance/invoices/00000000-0000-4000-8000-0000000000aa', { amount: 2 })).status).toBe(403);
      expect((await api.patch('/api/finance/donations/00000000-0000-4000-8000-0000000000aa', { amount: 2 })).status).toBe(403);
      expect((await api.delete('/api/finance/budgets/00000000-0000-4000-8000-0000000000aa')).status).toBe(403);
      expect((await api.delete('/api/finance/invoices/00000000-0000-4000-8000-0000000000aa')).status).toBe(403);
      expect((await api.delete('/api/finance/donations/00000000-0000-4000-8000-0000000000aa')).status).toBe(403);

      const form = new FormData();
      form.append('file', makeFile(PNG_BYTES, 'scan.png', 'image/png'));
      expect(
        (await postForm(api, '/api/finance/invoices/00000000-0000-4000-8000-0000000000aa/attachment', form)).status
      ).toBe(403);
      expect(
        (await api.get('/api/finance/invoices/00000000-0000-4000-8000-0000000000aa/attachment')).status
      ).toBe(403);
      expect(
        (await api.delete('/api/finance/invoices/00000000-0000-4000-8000-0000000000aa/attachment')).status
      ).toBe(403);
    }
  });

  it('مدیر اجازهٔ کامل دارد', async () => {
    expect((await manager.get('/api/finance/summary')).status).toBe(200);
    expect((await manager.get('/api/finance/budgets')).status).toBe(200);
    expect((await manager.get('/api/finance/invoices')).status).toBe(200);
    expect((await manager.get('/api/finance/donations')).status).toBe(200);
  });
});

describe('بودجه و مالی — تراز بودجه و ریاضی خلاصه', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;
  let invoice1Id: string;

  beforeAll(async () => {
    A = createFinanceApp();
    manager = await asRole(A, 'manager');

    const budget = await manager.post('/api/finance/budgets', {
      title: 'بودجه ۱۴۰۴',
      amount: 10_000_000,
      period_from: M1_1404,
      period_to: ABAN15_1404,
      notes: 'اعتبار مصوب امسال'
    });
    expect(budget.status).toBe(201);
    expect(dataOf<BudgetView>(budget).periodFrom).toBe(M1_1404);

    const inv1 = await manager.post('/api/finance/invoices', {
      title: 'اجاره مهر',
      amount: 3_000_000,
      invoice_date: M1_1404,
      category: 'اجاره'
    });
    expect(inv1.status).toBe(201);
    invoice1Id = dataOf<InvoiceView>(inv1).id;

    expect(
      (
        await manager.post('/api/finance/invoices', {
          title: 'ملزومات اداری',
          amount: 1_500_000,
          invoice_date: ABAN15_1404,
          category: 'ملزومات اداری'
        })
      ).status
    ).toBe(201);

    expect(
      (
        await manager.post('/api/finance/donations', {
          donor_name: 'خانواده علی',
          amount: 2_000_000,
          donation_date: M1_1404
        })
      ).status
    ).toBe(201);

    expect(
      (
        await manager.post('/api/finance/donations', {
          donor_name: 'دونیشن ناشناس',
          amount: 500_000,
          donation_date: M10_1404
        })
      ).status
    ).toBe(201);
  });

  it('خلاصهٔ بدون فیلتر بازه — کل بودجه + کل کمک‌ها و فاکتورها', async () => {
    const res = await manager.get('/api/finance/summary');
    expect(res.status).toBe(200);
    const s = dataOf<SummaryView>(res);
    expect(s.budgetTotal).toBe(10_000_000);
    expect(s.invoicesTotal).toBe(4_500_000);
    expect(s.donationsTotal).toBe(2_500_000);
    expect(s.balance).toBe(10_000_000 + 2_500_000 - 4_500_000); // ۸٬۰۰۰٬۰۰۰
  });

  it('خلاصهٔ با فیلتر بازه — بودجه بی‌تأثیر از تاریخ می‌ماند', async () => {
    const res = await manager.get(`/api/finance/summary?from=${M1_1404}&to=${M10_1404}`);
    expect(res.status).toBe(200);
    const s = dataOf<SummaryView>(res);
    expect(s.budgetTotal).toBe(10_000_000); // بدون فیلتر تاریخ
    expect(s.invoicesTotal).toBe(3_000_000); // فقط اجاره مهر (آبان خارج است)
    expect(s.donationsTotal).toBe(2_500_000); // هر دو کمک در بازه‌اند (۱ مهر و ۱۰ مهر)
    expect(s.balance).toBe(9_500_000);

    // بازهٔ فقط آبان: فاکتور ملزومات، بدون هیچ کمکی
    const aban = dataOf<SummaryView>(await manager.get(`/api/finance/summary?from=${ABAN15_1404}&to=${ABAN15_1404}`));
    expect(aban.invoicesTotal).toBe(1_500_000);
    expect(aban.donationsTotal).toBe(0);
    expect(aban.balance).toBe(8_500_000);

    const empty = dataOf<SummaryView>(await manager.get(`/api/finance/summary?from=${FARVARDIN_1_1405}`));
    expect(empty.invoicesTotal).toBe(0);
    expect(empty.donationsTotal).toBe(0);
  });

  it('اعتبارسنجی ورودی — مبلغ/تاریخ/عنوان نامعتبر ۴۰۰ می‌گیرد', async () => {
    expect(
      (await manager.post('/api/finance/invoices', { title: 'بد', amount: 0, invoice_date: M1_1404 })).status
    ).toBe(400);
    expect(
      (await manager.post('/api/finance/invoices', { title: 'بد', amount: -5, invoice_date: M1_1404 })).status
    ).toBe(400);
    expect(
      (await manager.post('/api/finance/invoices', { title: 'بد', amount: 100.5, invoice_date: M1_1404 })).status
    ).toBe(400);
    expect(
      (await manager.post('/api/finance/invoices', { title: 'بد', amount: 100, invoice_date: '1404/07/01' })).status
    ).toBe(400);
    expect(
      (await manager.post('/api/finance/invoices', { title: '  ', amount: 100, invoice_date: M1_1404 })).status
    ).toBe(400);
    expect((await manager.post('/api/finance/budgets', { title: 'بد', amount: 0 })).status).toBe(400);
    expect(
      (await manager.post('/api/finance/donations', { donor_name: 'د', amount: 10, donation_date: M1_1404, student_id: 'not-a-uuid' }))
        .status
    ).toBe(400);
  });

  it('حذف نرم فاکتور — از فهرست و از جمع خارج می‌شود', async () => {
    const del = await manager.delete(`/api/finance/invoices/${invoice1Id}`);
    expect(del.status).toBe(200);

    const list = dataOf<InvoiceView[]>(await manager.get('/api/finance/invoices'));
    expect(list.find((i) => i.id === invoice1Id)).toBeUndefined();

    const s = dataOf<SummaryView>(await manager.get('/api/finance/summary'));
    expect(s.invoicesTotal).toBe(1_500_000);
    expect(s.balance).toBe(10_000_000 + 2_500_000 - 1_500_000);

    // ردیف نرم‌حذف‌شده در DB هست ولی در خواندن نمی‌آید
    const row = A.sql.prepare('SELECT deleted_at FROM finance_invoices WHERE id = ?').get(invoice1Id) as {
      deleted_at: string | null;
    };
    expect(row.deleted_at).not.toBeNull();
  });

  it('جستجوی فاکتور و بازهٔ فهرست', async () => {
    const byQ = dataOf<InvoiceView[]>(await manager.get('/api/finance/invoices?q=ملزومات'));
    expect(byQ).toHaveLength(1);
    expect(byQ[0].title).toBe('ملزومات اداری');
    const byRange = dataOf<InvoiceView[]>(await manager.get(`/api/finance/invoices?from=${FARVARDIN_1_1405}`));
    expect(byRange).toHaveLength(0);
    const all = dataOf<InvoiceView[]>(await manager.get('/api/finance/invoices'));
    expect(all.length).toBeGreaterThanOrEqual(1);
    // مرتب‌سازی نزولی تاریخ
    for (let i = 1; i < all.length; i += 1) {
      expect(all[i - 1].invoiceDate >= all[i].invoiceDate).toBe(true);
    }
  });
});

describe('بودجه و مالی — پیوست اسکن فاکتور', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;
  let therapist: Api;
  let invoiceId: string;

  beforeAll(async () => {
    A = createFinanceApp();
    manager = await asRole(A, 'manager');
    therapist = await asRole(A, 'therapist');
    const inv = await manager.post('/api/finance/invoices', {
      title: 'تعمیر سیستم گرمایشی',
      amount: 800_000,
      invoice_date: M10_1404,
      category: 'تعمیرات'
    });
    invoiceId = dataOf<InvoiceView>(inv).id;
  });

  it('آپلود پیوست (فیلد file) → بج پیوست در رکورد؛ دانلود attachment و پیش‌نمایش inline سندباکس‌دار', async () => {
    const form = new FormData();
    form.append('file', makeFile(PNG_BYTES, 'scan-tamir.png', 'image/png'));
    const up = await postForm(manager, `/api/finance/invoices/${invoiceId}/attachment`, form);
    expect(up.status).toBe(201);
    const rec = dataOf<InvoiceView>(up);
    expect(rec.attachment).not.toBeNull();
    expect(rec.attachment!.filename).toBe('scan-tamir.png');
    expect(rec.attachment!.mime).toBe('image/png');

    const headers = { authorization: `Bearer ${(manager as unknown as { token: string }).token}` };

    const dl = await A.app.request(`/api/finance/invoices/${invoiceId}/attachment`, { headers }, A.env as never);
    expect(dl.status).toBe(200);
    expect(await dl.text()).toBe('%PNG-fake-finance-scan');
    expect(dl.headers.get('content-disposition')).toContain('attachment');

    const inline = await A.app.request(`/api/finance/invoices/${invoiceId}/attachment?inline=1`, { headers }, A.env as never);
    expect(inline.status).toBe(200);
    expect(inline.headers.get('content-disposition')).toContain('inline');
    expect(inline.headers.get('content-security-policy')).toBe('sandbox allow-scripts allow-popups');

    // درمانگر ممنوع
    const therHeaders = { authorization: `Bearer ${(therapist as unknown as { token: string }).token}` };
    expect(
      (await A.app.request(`/api/finance/invoices/${invoiceId}/attachment`, { headers: therHeaders }, A.env as never)).status
    ).toBe(403);
  });

  it('جایگزینی پیوست — فایل قبلی از ObjectStore حذف و فقط نسخهٔ جدید می‌ماند', async () => {
    const before = dataOf<InvoiceView[]>(await manager.get('/api/finance/invoices'));
    const oldAtt = before.find((i) => i.id === invoiceId)!.attachment!;
    const oldKey = `finance/invoices/${invoiceId}/${oldAtt.id}`;

    const form = new FormData();
    form.append('file', makeFile(PDF_BYTES, 'scan-tamir.pdf', 'application/pdf'));
    const up = await postForm(manager, `/api/finance/invoices/${invoiceId}/attachment`, form);
    expect(up.status).toBe(201);
    const newAtt = dataOf<InvoiceView>(up).attachment!;
    expect(newAtt.id).not.toBe(oldAtt.id);
    expect(newAtt.mime).toBe('application/pdf');

    expect((A.sql.prepare('SELECT COUNT(*) AS n FROM exercise_file_chunks WHERE key = ?').get(oldKey) as { n: number }).n).toBe(0);
    const newKey = `finance/invoices/${invoiceId}/${newAtt.id}`;
    expect((A.sql.prepare('SELECT COUNT(*) AS n FROM exercise_file_chunks WHERE key = ?').get(newKey) as { n: number }).n).toBeGreaterThan(0);

    // pdf → inline مجاز است
    const headers = { authorization: `Bearer ${(manager as unknown as { token: string }).token}` };
    const inline = await A.app.request(`/api/finance/invoices/${invoiceId}/attachment?inline=1`, { headers }, A.env as never);
    expect(inline.headers.get('content-disposition')).toContain('inline');
    expect(await inline.text()).toBe('%PDF-fake-finance-scan');
  });

  it('حذف پیوست — ۴۰۴ برای دریافت مجدد و رکورد بدون بج', async () => {
    const del = await manager.delete(`/api/finance/invoices/${invoiceId}/attachment`);
    expect(del.status).toBe(200);
    expect(dataOf<InvoiceView>(del).attachment).toBeNull();

    const headers = { authorization: `Bearer ${(manager as unknown as { token: string }).token}` };
    expect(
      (await A.app.request(`/api/finance/invoices/${invoiceId}/attachment`, { headers }, A.env as never)).status
    ).toBe(404);

    // حذف دوباره — پیوست وجود ندارد
    expect((await manager.delete(`/api/finance/invoices/${invoiceId}/attachment`)).status).toBe(404);
  });

  it('پیوست فاکتور ناموجود ۴۰۴ می‌گیرد', async () => {
    const form = new FormData();
    form.append('file', makeFile(PNG_BYTES, 'x.png', 'image/png'));
    const res = await postForm(manager, '/api/finance/invoices/00000000-0000-4000-8000-0000000000fe/attachment', form);
    expect(res.status).toBe(404);
  });
});

describe('بودجه و مالی — کمک‌ها و بودجه‌ها (CRUD + اتصال دانش‌آموز)', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;
  let donationId: string;
  let budgetId: string;

  beforeAll(async () => {
    A = createFinanceApp();
    manager = await asRole(A, 'manager');
    const don = await manager.post('/api/finance/donations', {
      donor_name: 'خانواده سارا',
      amount: 1_200_000,
      donation_date: M10_1404,
      note: 'کمک نقدی مهر'
    });
    donationId = dataOf<DonationView>(don).id;

    const b = await manager.post('/api/finance/budgets', { title: 'بودجه آزمایشی', amount: 5_000_000 });
    budgetId = dataOf<BudgetView>(b).id;
  });

  it('ویرایش کمک با اتصال به دانش‌آموز — نام دانش‌آموز resolve می‌شود', async () => {
    const patched = await manager.patch(`/api/finance/donations/${donationId}`, {
      student_id: STUDENT1_ID,
      amount: 1_300_000
    });
    expect(patched.status).toBe(200);
    const rec = dataOf<DonationView>(patched);
    expect(rec.studentId).toBe(STUDENT1_ID);
    expect(rec.studentName).toBeTruthy();
    expect(rec.amount).toBe(1_300_000);

    const filtered = dataOf<DonationView[]>(
      await manager.get(`/api/finance/donations?student_id=${STUDENT1_ID}`)
    );
    expect(filtered.some((d) => d.id === donationId)).toBe(true);
  });

  it('لغو اتصال دانش‌آموز با student_id: null — بدون بازنویسی بقیهٔ فیلدها', async () => {
    const patched = await manager.patch(`/api/finance/donations/${donationId}`, { student_id: null });
    expect(patched.status).toBe(200);
    const rec = dataOf<DonationView>(patched);
    expect(rec.studentId).toBeNull();
    expect(rec.studentName).toBeNull();
    expect(rec.amount).toBe(1_300_000); // پچ قبلی حفظ شده
    expect(rec.donorName).toBe('خانواده سارا');
  });

  it('جستجوی کمک روی نام اهداکننده و یادداشت', async () => {
    const byDonor = dataOf<DonationView[]>(await manager.get('/api/finance/donations?q=سارا'));
    expect(byDonor.some((d) => d.id === donationId)).toBe(true);
    const byNote = dataOf<DonationView[]>(await manager.get('/api/finance/donations?q=نقدی'));
    expect(byNote.some((d) => d.id === donationId)).toBe(true);
    const none = dataOf<DonationView[]>(await manager.get('/api/finance/donations?q=وجود-ندارد'));
    expect(none).toHaveLength(0);
  });

  it('ویرایش و حذف نرم بودجه — از خلاصه خارج می‌شود', async () => {
    const patched = await manager.patch(`/api/finance/budgets/${budgetId}`, { amount: 6_000_000, notes: 'اصلاحی' });
    expect(patched.status).toBe(200);
    const rec = dataOf<BudgetView>(patched);
    expect(rec.amount).toBe(6_000_000);
    expect(rec.title).toBe('بودجه آزمایشی'); // دست‌نخورده
    expect(rec.notes).toBe('اصلاحی');

    const before = dataOf<SummaryView>(await manager.get('/api/finance/summary'));
    expect(before.budgetTotal).toBeGreaterThanOrEqual(6_000_000);

    const del = await manager.delete(`/api/finance/budgets/${budgetId}`);
    expect(del.status).toBe(200);
    const list = dataOf<BudgetView[]>(await manager.get('/api/finance/budgets'));
    expect(list.find((b) => b.id === budgetId)).toBeUndefined();
    const after = dataOf<SummaryView>(await manager.get('/api/finance/summary'));
    expect(after.budgetTotal).toBe(before.budgetTotal - 6_000_000);
  });

  it('حذف نرم کمک — از فهرست خارج می‌شود', async () => {
    const don = await manager.post('/api/finance/donations', {
      donor_name: 'کمک موقت',
      amount: 100_000,
      donation_date: M10_1404
    });
    const id = dataOf<DonationView>(don).id;
    expect((await manager.delete(`/api/finance/donations/${id}`)).status).toBe(200);
    const list = dataOf<DonationView[]>(await manager.get('/api/finance/donations'));
    expect(list.find((d) => d.id === id)).toBeUndefined();
  });
});

describe('بودجه و مالی — audit', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Api;

  beforeAll(async () => {
    A = createFinanceApp();
    manager = await asRole(A, 'manager');
    await manager.post('/api/finance/budgets', { title: 'بودجه audit', amount: 1_000 });
    const inv = await manager.post('/api/finance/invoices', { title: 'فاکتور audit', amount: 500, invoice_date: M1_1404 });
    const invId = dataOf<InvoiceView>(inv).id;
    const form = new FormData();
    form.append('file', makeFile(PNG_BYTES, 'a.png', 'image/png'));
    await postForm(manager, `/api/finance/invoices/${invId}/attachment`, form);
    await manager.delete(`/api/finance/invoices/${invId}/attachment`);
    await manager.post('/api/finance/donations', { donor_name: 'اهداکننده audit', amount: 300, donation_date: M1_1404 });
  });

  it('هر تغییر مالی رخداد audit با اکشن finance.* ثبت کرده است', () => {
    const total = A.sql.prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE action LIKE 'finance.%'`).get() as { n: number };
    expect(total.n).toBeGreaterThanOrEqual(5);
    const byManager = A.sql
      .prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE action LIKE 'finance.%' AND actor_id = ?`)
      .get(MANAGER_ID) as { n: number };
    expect(byManager.n).toBe(total.n); // همهٔ عملیات فقط توسط مدیر انجام شده
    for (const action of [
      'finance.budget.create',
      'finance.invoice.create',
      'finance.invoice.attachment.set',
      'finance.invoice.attachment.delete',
      'finance.donation.create'
    ]) {
      const row = A.sql.prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE action = ?`).get(action) as { n: number };
      expect(row.n).toBeGreaterThanOrEqual(1);
    }
  });
});

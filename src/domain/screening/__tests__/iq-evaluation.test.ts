import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, asRole, Api } from '../../../test/harness';
import { schoolYearOfYmd } from '@core/shared';

const data = <T>(res: { body: unknown }): T => (res.body as { data: T }).data;

const todayYmd = (): string => {
  const t = new Date(Date.now() + 210 * 60_000); // امروز تهران (+۳:۳۰)
  return t.toISOString().slice(0, 10);
};

describe('نتیجهٔ ارزیابی تخصصی «اظهارنظر و پیشنهاد» (۱.۲۷.۳۳)', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: Api;
  let sec: Api;
  let ali: Api;
  let entryId: string;

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
    sec = await asRole(A, 'secretary');
    ali = await asRole(A, 'therapist');
    const res = await sec.post('/api/screening', { name: 'آوا محمدی', tags: ['ارجاع هوش'] });
    entryId = data<{ id: string }>(res).id;
  });

  it('ثبت کامل نتیجه — گزینهٔ ۳ + اتیسم + لی‌تر اعشاری + مشاهدات عیناً', async () => {
    const res = await mgr.post(`/api/screening/${entryId}/iq-evaluation`, {
      result_option: 3,
      autism_referral: true,
      leiter_score: 96.5,
      clinical_observations: 'همکاری خوب؛ دقت توجه متوسط'
    });
    expect(res.status).toBe(200);
    const d = data<{
      id: string;
      resultOption: number;
      autismReferral: boolean;
      leiterScore: number | null;
      wechslerVerbalScore: number | null;
      clinicalObservations: string | null;
      academicYear: string | null;
    }>(res);
    expect(d.resultOption).toBe(3);
    expect(d.autismReferral).toBe(true);
    expect(d.leiterScore).toBe(96.5);
    expect(d.wechslerVerbalScore).toBeNull();
    expect(d.clinicalObservations).toBe('همکاری خوب؛ دقت توجه متوسط');
    expect(d.academicYear).toBe(String(schoolYearOfYmd(todayYmd())));
  });

  it('با ثبت نتیجه، ردیف از پیگیری فعال خارج می‌شود (iqHandledAt)', async () => {
    const res = await sec.get(`/api/screening?q=${encodeURIComponent('آوا محمدی')}`);
    const e = data<{ entries: { id: string; iqHandledAt: string | null }[] }>(res).entries.find((x) => x.id === entryId);
    expect(e).toBeTruthy();
    expect(e!.iqHandledAt).not.toBeNull();
  });

  it('GET نتیجه برای بارگذاری ویرایش — همهٔ مقادیر ذخیره‌شده برمی‌گردد', async () => {
    const res = await mgr.get(`/api/screening/${entryId}/iq-evaluation`);
    expect(res.status).toBe(200);
    const d = data<{ resultOption: number; autismReferral: boolean }>(res);
    expect(d.resultOption).toBe(3);
    expect(d.autismReferral).toBe(true);
  });

  it('ثبت دوباره = ویرایش همان ردیف (upsert) — مقادیر کل‌جایگزین می‌شوند', async () => {
    const first = data<{ id: string }>(await mgr.get(`/api/screening/${entryId}/iq-evaluation`));
    const res = await mgr.post(`/api/screening/${entryId}/iq-evaluation`, {
      result_option: 5,
      autism_referral: false,
      wechsler_verbal_score: 88
    });
    expect(res.status).toBe(200);
    const d = data<{ id: string; resultOption: number; autismReferral: boolean; leiterScore: number | null; wechslerVerbalScore: number | null }>(res);
    expect(d.id).toBe(first.id); // — ردیف دوم ساخته نشد؛ همان ردیف ویرایش شد
    expect(d.resultOption).toBe(5);
    expect(d.autismReferral).toBe(false);
    expect(d.leiterScore).toBeNull();
    expect(d.wechslerVerbalScore).toBe(88);
  });

  it('بدون انتخاب گزینه → ۴۰۰؛ گزینهٔ ۸ → ۴۰۰؛ نمرهٔ غیرعددی → ۴۰۰', async () => {
    const noOption = await mgr.post(`/api/screening/${entryId}/iq-evaluation`, { autism_referral: false });
    expect(noOption.status).toBe(400);
    const overRange = await mgr.post(`/api/screening/${entryId}/iq-evaluation`, { result_option: 8 });
    expect(overRange.status).toBe(400);
    const badScore = await mgr.post(`/api/screening/${entryId}/iq-evaluation`, { result_option: 1, leiter_score: '۹۶x' });
    expect(badScore.status).toBe(400);
  });

  it('درمانگر (آزماینده) هم می‌تواند ثبت کند', async () => {
    const res = await sec.post('/api/screening', { name: 'امیرعلی قاسمی', tags: ['ارجاع هوش'] });
    const id2 = data<{ id: string }>(res).id;
    const save = await ali.post(`/api/screening/${id2}/iq-evaluation`, { result_option: 1 });
    expect(save.status).toBe(200);
    expect(data<{ resultOption: number }>(save).resultOption).toBe(1);
  });

  it('سنجش ناموجود → ۴۰۴', async () => {
    const res = await mgr.post('/api/screening/00000000-0000-4000-8000-00000000dead/iq-evaluation', { result_option: 2 });
    expect(res.status).toBe(404);
  });

  it('بدون احراز هویت → ۴۰۱', async () => {
    const res = await new Api(A).post(`/api/screening/${entryId}/iq-evaluation`, { result_option: 2 });
    expect(res.status).toBe(401);
  });
});

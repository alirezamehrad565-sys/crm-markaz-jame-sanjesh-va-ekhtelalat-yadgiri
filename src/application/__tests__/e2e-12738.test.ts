/**
 * e2e ۱.۲۷.۳۸ — صفحه‌های عمومی تازه + فلو بات «تمرین‌ها و کارت‌ها»
 * ① /public/guide/<slug> برای سه دسته + ۴۰۴ برای اسلاگ ناشناخته (لینک «توضیحات بیشتر» صفحه‌های آگاهی)
 * ② /public/activities — فهرست عمومی بانک محتوا (بدون دادهٔ دانش‌آموز؛ CSP عین referral)
 * ③ دکمهٔ «تمرین‌ها و کارت‌ها» مهمان → پیام با لینک صفحهٔ عمومی + لینک فرم معرفی
 * الگو: e2e-bot-v2.test.ts + referrals.test.ts
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, WEBHOOK_SECRET } from '../../test/harness';

describe('۱.۲۷.۳۸ — راهنمای عمومی + صفحهٔ تمرین‌ها + فلو بات کارت‌ها', () => {
  let A: ReturnType<typeof createTestApp>;
  beforeAll(() => {
    A = createTestApp();
  });

  it('① راهنمای سه دسته سرو می‌شود — محاوره‌ای، با CTA معرفی، بدون تذکر تکراری', async () => {
    for (const slug of ['delayed', 'learning-disorder', 'intellectual']) {
      const res = await A.app.request(`/public/guide/${slug}`, {}, A.env as never);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('معرفی این دانش‌آموز به مرکز');
      expect(html).toContain('همهٔ خدمات مرکز رایگان است');
      expect(html).not.toContain('تشخیص کار ماست');
      expect(html).not.toContain('تشخیصش کارِ ماست');
      expect(res.headers.get('cache-control')).toBe('no-store');
    }
  });

  it('① اسلاگ ناشناخته → ۴۰۴', async () => {
    const res = await A.app.request('/public/guide/autism', {}, A.env as never);
    expect(res.status).toBe(404);
  });

  it('② صفحهٔ عمومی تمرین‌ها — بدون کلید فایل و بدون دادهٔ دانش‌آموز', async () => {
    const res = await A.app.request('/public/activities', {}, A.env as never);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('تمرین‌ها و کارت‌های آماده');
    expect(html).toContain('چطور از این محتواها استفاده کنم');
    expect(html).toContain('/public/referral');
    expect(html).not.toContain('file_key');
    expect(res.headers.get('content-security-policy')).toContain("style-src 'unsafe-inline' https://cdn.jsdelivr.net");
  });

  it('③ دکمهٔ «تمرین‌ها و کارت‌ها» مهمان → پیام با لینک صفحهٔ عمومی + فرم معرفی', async () => {
    const res = await A.app.request(
      `/webhook/bale/${WEBHOOK_SECRET}`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ update_id: 1, message: { chat: { id: 7801 }, text: 'تمرین‌ها و کارت‌ها' } }) },
      A.env as never
    );
    const json = (await res.json()) as { handled: boolean; reply: string | null; keyboard: string[][] | null };
    expect(json.handled).toBe(true);
    expect(json.reply).toContain('/public/activities');
    expect(json.reply).toContain('/public/referral');
    expect(json.reply).toContain('فایل هر تمرین');
    expect(json.keyboard).toContainEqual(['تمرین‌ها و کارت‌ها']);
  });
});

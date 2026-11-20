/**
 * گیت فرانت ۱.۲۷.۳۷ — «صندوق ورودی» نمای مستقل منو (فاز بعدی صندوق)
 * خواست کارفرما: «تو سایت صندوق ورودی رو نمی‌بینم» — تب قدیمی صندوق معرفی‌ها در ۱.۲۷.۳۵
 * از لیست انتظار حذف شده بود (خواست همان زمان کارفرما) و معرفی‌های فرم عمومی بدون نمای مدیریتی
 * مانده بودند. این گیت سیم‌کشی نمای مستقل را پین می‌کند:
 * ① آیتم منو «صندوق ورودی» در گروه برنامه‌ریزی — فقط مدیر/منشی
 * ② register با lazyView + roleOnly + پیام دسترسی فارسی
 * ③ نمای صندوق: فیلتر وضعیت (جدید/پذیرفته‌شده/ردشده/همه) + جست‌وجو + KPI چهارگانه
 * ④ فرم تکمیلی خانواده در کارت و مودال (فرهنگی/مالی/همکاری) — بدون KPI اتیسم
 * ⑤ پذیرش/رد از همان API اتمیک + badge منو با شمار «جدید» + رویداد referrals:changed
 * الگو: front-12581.test.ts — گیت محتوایی سورس‌خوان
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('گیت فرانت ۱.۲۷.۳۷ — صندوق ورودی معرفی‌ها (نمای مستقل)', () => {
  const view = read('public/assets/js/views/referral-inbox.js');
  const app = read('public/assets/js/app.js');

  it('① آیتم منو «صندوق ورودی» بعد از لیست انتظار — فقط مدیر/منشی', () => {
    expect(app).toContain("{ hash: '#/referral-inbox', label: 'صندوق ورودی', icon: 'clipboard', group: 'برنامه‌ریزی', roles: ['manager', 'secretary'] }");
    expect(app.indexOf('#/referral-inbox')).toBeGreaterThan(app.indexOf("'#/waitlist', label: 'لیست انتظار'"));
  });

  it('② register مسیر با lazyView + roleOnly + پیام دسترسی', () => {
    expect(app).toContain("register('#/referral-inbox', { title: 'صندوق ورودی', render: roleOnly(['manager', 'secretary'], lazyView(() => import('./views/referral-inbox.js'), 'renderReferralInbox', '#/referral-inbox'), 'صندوق ورودی برای دفتر مرکز فعال است.') });");
  });

  it('③ نمای صندوق: فیلتر وضعیت + جست‌وجو + شمارنده', () => {
    expect(view).toContain("FILTERS = [");
    expect(view).toContain("{ key: 'new', label: 'جدید' }");
    expect(view).toContain("{ key: 'all', label: 'همه' }");
    expect(view).toContain("'جست‌وجوی نام یا شماره…'");
    expect(view).toContain('kpi-grid');
  });

  it('④ فرم تکمیلی خانواده هست؛ KPI/نشان اتیسم نیست (دادهٔ قدیمی فقط برچسب خنثی)', () => {
    expect(view).toContain('culture');
    expect(view).toContain('finance');
    expect(view).toContain('cooperation');
    expect(view).toContain('اولویت خدمات رایگان');
    expect(view).toContain('سطح مالی کم‌برخوردار');
    expect(view).not.toContain("'اتیسم'"); // نشان اتیسم قدیمی حذف شده
    expect(view).not.toContain('ارجاع اتیسم');
  });

  it('⑤ API اتمیک + badge منو + رویداد referrals:changed', () => {
    expect(view).toContain("api.get('/api/waitlist/referrals')");
    expect(view).toContain("/api/waitlist/referrals/${r.id}/accept");
    expect(view).toContain("/api/waitlist/referrals/${r.id}/reject");
    expect(view).toContain("window.dispatchEvent(new CustomEvent('referrals:changed'))");
    expect(app).toContain('nav__badge--referrals');
    expect(app).toContain('async function updateReferralsBadge()');
    expect(app).toContain("window.addEventListener('referrals:changed', updateReferralsBadge)");
    expect(app).toContain('updateReferralsBadge(); // ۱.۲۷.۳۷');
    expect((app.match(/updateReferralsBadge\(\);/g) ?? []).length).toBe(2); // دو فراخوان: rebuildNavForRole + بوت پس از ورود
  });
});

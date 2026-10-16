/**
 * تست‌های واحد — templates-
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// رندررهای بات نقش‌آگاه: نتیجهٔ جستجو + برنامهٔ مرکز + راهنماهای نقش‌محور
import { describe, expect, it } from 'vitest';
import { renderTemplate } from '../templates';
import { renderCenterSchedule, renderSearchResults } from '../templates';

describe('renderSearchResults', () => {
  it('نتیجه‌ها با نام و پایه — بدون PII', () => {
    const text = renderSearchResults({
      title: '🔎 جستجوی «علی»',
      items: [
        { name: 'علی محمدی', grade: 'پنجم' },
        { name: 'علی رضایی', grade: null }
      ]
    });
    expect(text).toContain('• علی محمدی — پنجم');
    expect(text).toContain('• علی رضایی');
    expect(text).not.toMatch(/\d{10}/); // بدون کد ملی
  });

  it('بدون نتیجه → پیام یافت نشدن', () => {
    const text = renderSearchResults({ title: '🔎 جستجوی «xyz»', items: [] });
    expect(text).toContain('یافت نشد');
  });
});

describe('renderCenterSchedule', () => {
  it('بدون نوبت → پیام خالی بودن', () => {
    const text = renderCenterSchedule({ title: '📋 برنامهٔ مرکز — امروز', rows: [] });
    expect(text).toContain('موردی برای امروز ثبت نشده است');
  });

  it('ردیف‌ها بر اساس ساعت مرتب و لغوشده‌ها برچسب می‌گیرند', () => {
    const text = renderCenterSchedule({
      title: '📋 برنامهٔ مرکز — امروز',
      rows: [
        { timeLabel: '14:00', staffName: 'مریم احمدی', studentNames: ['سارا کریمی'], cancelled: false },
        { timeLabel: '09:00', staffName: 'دکتر علی رضایی', studentNames: ['علی محمدی'], cancelled: false },
        { timeLabel: '11:00', staffName: 'دکتر علی رضایی', studentNames: [], cancelled: true }
      ]
    });
    const lines = text.split('\n').filter((l) => l.startsWith('۰') || l.startsWith('۱۱') || l.startsWith('۱۴'));
    expect(lines.length).toBe(3);
    expect(lines[0]).toContain('۰۹:۰۰');
    expect(lines[1]).toContain('(لغوشده)');
    expect(lines[2]).toContain('۱۴:۰۰');
  });

  it('سقف ۱۲ ردیف + خط ادامه با ارجاع به پنل', () => {
    const rows = Array.from({ length: 15 }, (_, i) => ({
      timeLabel: `0${i % 10}:00`,
      staffName: 'متخصص',
      studentNames: [`دانش‌آموز ${i}`],
      cancelled: false
    }));
    const text = renderCenterSchedule({ title: '📋 برنامهٔ مرکز', rows });
    expect(text).toContain('مورد دیگر');
    expect(text).toContain('روز کاری');
    // ۱۲ ردیف نمایش داده شده
    const bodyLines = text.split('\n').filter((l) => l.includes('دانش‌آموز'));
    expect(bodyLines.length).toBe(12);
  });
});

describe('راهنماهای نقش‌محور — هر نقش فقط دستورهای خودش را می‌بیند', () => {
  it('مهمان — مسیر ورود + /link', () => {
    const t = renderTemplate('bot_help_guest');
    expect(t).toContain('کد ملی');
    expect(t).toContain('/link CODE');
    expect(t).toContain('پس از اتصال');
    expect(t).not.toContain('/search');
  });

  it('مدیر/منشی — /search و «برنامه مرکز» و «وضعیت مرکز»', () => {
    const t = renderTemplate('bot_help_office');
    expect(t).toContain('/search نام');
    expect(t).toContain('برنامه مرکز');
    expect(t).toContain('وضعیت مرکز');
    expect(t).toContain('پیگیری‌های من');
  });

  it('متخصص — جستجو و پیگیری دارد؛ وضعیت مرکز ندارد (: منوی دانش‌آموز)', () => {
    const t = renderTemplate('bot_help_therapist');
    // جستجوی آزاد جای خود را به منوی ساخت‌یافتهٔ «دانش‌آموزان فعال» داد
    expect(t).toContain('دانش‌آموزان فعال');
    expect(t).toContain('پیام به خانواده');
    expect(t).toContain('پیگیری‌های من');
    expect(t).not.toContain('وضعیت مرکز');
    expect(t).not.toContain('برنامه مرکز');
  });

  it('معلم مدرسه — فقط برنامه کلاس', () => {
    const t = renderTemplate('bot_help_class');
    expect(t).toContain('/today');
    expect(t).toContain('/week');
    expect(t).not.toContain('/search');
    expect(t).not.toContain('پیگیری');
  });

  it('والد — حضور فرزند و تمرین‌های انجام‌نشده دارد؛ پیگیری و جستجو ندارد', () => {
    const t = renderTemplate('bot_help_parent');
    expect(t).toContain('حضور فرزند');
    // برچسب دقیق دستور کاربر
    expect(t).toContain('نوبت‌های دانش‌آموز من');
    expect(t).toContain('تمرین‌های انجام‌نشده');
    expect(t).not.toContain('/search');
    expect(t).not.toContain('پیگیری');
  });

  it('پیام‌های انکار', () => {
    expect(renderTemplate('bot_search_denied')).toContain('فقط برای همکاران مرکز است');
    expect(renderTemplate('bot_center_denied')).toContain('فقط برای مدیر و منشی است');
  });
});

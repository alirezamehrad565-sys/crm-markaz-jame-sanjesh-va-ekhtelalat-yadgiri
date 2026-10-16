/**
 * تست‌های واحد — templates-
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// پارسر + رندررهای «لیست انتظار ↔ بات»
import { describe, expect, it } from 'vitest';
import { parseBotUpdate } from '../bale/webhook';
import { renderTemplate, renderWaitlistList } from '../templates';

describe('parseBotUpdate — (لیست انتظار)', () => {
  const update = (text: string) => ({ message: { chat: { id: 42 }, text } });

  it('/waitlist → waitlist_list', () => {
    expect(parseBotUpdate(update('/waitlist'))).toEqual({ kind: 'waitlist_list', chatId: '42' });
  });

  it('دکمهٔ متنی «لیست انتظار» → waitlist_list', () => {
    expect(parseBotUpdate(update('لیست انتظار'))).toEqual({ kind: 'waitlist_list', chatId: '42' });
  });
});

describe('renderWaitlistList', () => {
  it('بدون متقاضی باز → پیام خالی بودن', () => {
    const t = renderWaitlistList({ title: '⏳ لیست انتظار', items: [], totalOpen: 0 });
    expect(t).toContain('متقاضیِ بازی در لیست انتظار نیست');
  });

  it('ردیف‌ها با اولویت/خدمت/روز انتظار — فوری با نشان', () => {
    const t = renderWaitlistList({
      title: '⏳ لیست انتظار',
      items: [
        { name: 'حسین رضایی', service: 'کاردرمانی', urgent: true, daysWaiting: 3 },
        { name: 'زهرا حسینی', service: null, urgent: false, daysWaiting: 0 }
      ],
      totalOpen: 2
    });
    expect(t).toContain('🔴 فوری');
    expect(t).toContain('— کاردرمانی');
    expect(t).toContain('۳ روز در انتظار');
    expect(t).toContain('امروز در انتظار');
    expect(t).not.toContain('مورد دیگر');
  });

  it('سقف ۸ ردیف + خط ادامه با شمارندهٔ کل', () => {
    const items = Array.from({ length: 11 }, (_, i) => ({
      name: `متقاضی ${i}`,
      service: null,
      urgent: false,
      daysWaiting: 1
    }));
    const t = renderWaitlistList({ title: '⏳ لیست انتظار', items, totalOpen: 11 });
    expect(t).toContain('و ۳ متقاضی دیگر');
    const rows = t.split('\n').filter((l) => l.startsWith('• '));
    expect(rows.length).toBe(8);
  });
});

describe('قالب‌های', () => {
  it('waitlist_slot_freed — متخصص، زمان و متقاضیان', () => {
    const t = renderTemplate('waitlist_slot_freed', {
      staffName: 'دکتر علی رضایی',
      dateYmd: '1405-07-01',
      timeLabel: '09:00',
      extra: 'متقاضیان در انتظار: حسین رضایی، زهرا حسینی'
    });
    expect(t).toContain('یک نوبت خالی شد');
    expect(t).toContain('دکتر علی رضایی');
    expect(t).toContain('ساعت ۰۹:۰۰');
    expect(t).toContain('متقاضیان در انتظار: حسین رضایی، زهرا حسینی');
    expect(t).toContain('لیست انتظار');
  });

  it('bot_waitlist_denied — انکار نقش', () => {
    expect(renderTemplate('bot_waitlist_denied')).toContain('فقط برای همکاران مرکز است');
  });

  it('bot_help_office — «لیست انتظار» در منوی دفتر هست؛ در منوی متخصص نیست', () => {
    expect(renderTemplate('bot_help_office')).toContain('لیست انتظار');
    expect(renderTemplate('bot_help_therapist')).not.toContain('لیست انتظار');
  });
});

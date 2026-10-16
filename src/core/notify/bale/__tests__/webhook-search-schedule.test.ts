/**
 * تست‌های واحد — webhook-
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// تست‌های پارس دستورهای بات نقش‌آگاه (/search و /center)
import { describe, expect, it } from 'vitest';
import { parseBotUpdate } from '../webhook';

describe('parseBotUpdate — (جستجو + برنامهٔ مرکز)', () => {
  const update = (text: string) => ({ message: { chat: { id: 42 }, text } });

  it('/search با آرگومان → search', () => {
    expect(parseBotUpdate(update('/search علی'))).toEqual({
      kind: 'search',
      chatId: '42',
      query: 'علی'
    });
  });

  it('/search با فاصلهٔ اضافی → آرگومان نرمال‌شده', () => {
    expect(parseBotUpdate(update('  /search   محمدی  '))).toEqual({
      kind: 'search',
      chatId: '42',
      query: 'محمدی'
    });
  });

  it('/search بدون آرگومان → unknown (راهنمای نقش‌محور)', () => {
    expect(parseBotUpdate(update('/search'))).toEqual({
      kind: 'unknown',
      chatId: '42',
      text: '/search'
    });
  });

  it('/SEARCH با حروف بزرگ هم کار می‌کند (پرس‌وجوی لاتین)', () => {
    expect(parseBotUpdate(update('/SEARCH Reza'))).toEqual({
      kind: 'search',
      chatId: '42',
      query: 'Reza'
    });
  });

  it('/center → center_schedule', () => {
    expect(parseBotUpdate(update('/center'))).toEqual({
      kind: 'center_schedule',
      chatId: '42'
    });
  });

  it('دکمهٔ متنی «برنامه مرکز» → center_schedule', () => {
    expect(parseBotUpdate(update('برنامه مرکز'))).toEqual({
      kind: 'center_schedule',
      chatId: '42'
    });
  });

  it('دستورهای قبلی دست‌نخورده‌اند', () => {
    expect(parseBotUpdate(update('/status'))).toEqual({ kind: 'center_status', chatId: '42' });
    expect(parseBotUpdate(update('/today'))).toEqual({ kind: 'schedule', chatId: '42', scope: 'today' });
  });
});

/**
 * تست‌های واحد — webhook-media
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// webhook-media.test.ts — پارس pure پیام‌های رسانه‌ای و callback حلقهٔ بازگشت
// عکس (آرایهٔ سایزها) / سند / کپشن / sub:pick — و این‌که جریان‌های قبلی دست‌نخورده‌اند

import { describe, it, expect } from 'vitest';
import { parseBotUpdate, pickLargestPhoto, extractMedia, normalizeCaption } from '../webhook';
import type { BaleUpdateMessage } from '../webhook';

const photoMsg = (photo: unknown[], chatId = 7500, caption?: string) => ({
  update_id: 1,
  message: { chat: { id: chatId }, photo, ...(caption !== undefined ? { caption } : {}) }
});

const docMsg = (document: unknown, chatId = 7500, caption?: string) => ({
  update_id: 1,
  message: { chat: { id: chatId }, document, ...(caption !== undefined ? { caption } : {}) }
});

const cb = (data: string, chatId = 7500) => ({
  update_id: 2,
  callback_query: { id: 10, data, message: { chat: { id: chatId } } }
});

describe('pickLargestPhoto (pure)', () => {
  it('بزرگ‌ترین file_size را انتخاب می‌کند', () => {
    const best = pickLargestPhoto([
      { file_id: 'small', file_size: 100, width: 90, height: 90 },
      { file_id: 'big', file_size: 900, width: 1280, height: 960 },
      { file_id: 'mid', file_size: 400, width: 320, height: 240 }
    ]);
    expect(best?.file_id).toBe('big');
  });

  it('بدون file_size → مساحت width×height ملاک است', () => {
    const best = pickLargestPhoto([
      { file_id: 'a', width: 320, height: 240 },
      { file_id: 'b', width: 1280, height: 960 }
    ]);
    expect(best?.file_id).toBe('b');
  });

  it('بدون هیچ سنجه → آخترین عنصر برنده است (قرارداد بله)', () => {
    const best = pickLargestPhoto([{ file_id: 'a' }, { file_id: 'b' }]);
    expect(best?.file_id).toBe('b');
  });

  it('عناصر بدون file_id نادیده می‌شوند؛ لیست خالی → null', () => {
    expect(pickLargestPhoto([{ width: 10, height: 10 }, { file_id: 'ok' }])?.file_id).toBe('ok');
    expect(pickLargestPhoto([])).toBeNull();
  });
});

describe('extractMedia (pure)', () => {
  it('عکس → photo با mime پیش‌فرض image/jpeg', () => {
    const media = extractMedia({ photo: [{ file_id: 'p1', file_size: 200 }] } as BaleUpdateMessage);
    expect(media).toEqual({ type: 'photo', fileId: 'p1', fileName: null, mime: 'image/jpeg', size: 200 });
  });

  it('سند → نام/mime اعلامی بله', () => {
    const media = extractMedia({
      document: { file_id: 'd1', file_name: 'نتیجه.pdf', mime_type: 'application/pdf', file_size: 1024 }
    } as BaleUpdateMessage);
    expect(media).toEqual({ type: 'document', fileId: 'd1', fileName: 'نتیجه.pdf', mime: 'application/pdf', size: 1024 });
  });

  it('ویدئو/صدا/متن ساده → null', () => {
    expect(extractMedia({} as BaleUpdateMessage)).toBeNull();
    expect(extractMedia({ text: 'سلام' } as BaleUpdateMessage)).toBeNull();
  });
});

describe('normalizeCaption (pure)', () => {
  it('نرمال فاصله + سقف ۵۰۰ نویسه', () => {
    expect(normalizeCaption('  سلام   دنیا  ')).toBe('سلام دنیا');
    expect(normalizeCaption('x'.repeat(600))?.length).toBe(500);
    expect(normalizeCaption(undefined)).toBeNull();
    expect(normalizeCaption('   ')).toBeNull();
  });
});

describe('پارس پیام رسانه‌ای در parseBotUpdate', () => {
  it('عکس → media_received با بزرگ‌ترین سایز', () => {
    const cmd = parseBotUpdate(
      photoMsg([
        { file_id: 'small', file_size: 100 },
        { file_id: 'big', file_size: 900 }
      ])
    );
    expect(cmd).toMatchObject({ kind: 'media_received', chatId: '7500' });
    if (cmd?.kind === 'media_received') {
      expect(cmd.media.fileId).toBe('big');
      expect(cmd.media.type).toBe('photo');
      expect(cmd.caption).toBeNull();
    }
  });

  it('سند + کپشن → media_received با کپشن نرمال', () => {
    const cmd = parseBotUpdate(
      docMsg({ file_id: 'd1', file_name: 'کار.pdf', mime_type: 'application/pdf' }, 7501, '  صفحهٔ   اول  ')
    );
    expect(cmd).toMatchObject({ kind: 'media_received', chatId: '7501' });
    if (cmd?.kind === 'media_received') {
      expect(cmd.media.fileName).toBe('کار.pdf');
      expect(cmd.caption).toBe('صفحهٔ اول');
    }
  });

  it('عکس بدون chat → null؛ سند بدون file_id → null', () => {
    const noChat = parseBotUpdate({ update_id: 1, message: { photo: [{ file_id: 'x' }] } });
    expect(noChat).toBeNull();
    const emptyDoc = parseBotUpdate(docMsg({ file_name: 'a.pdf' }));
    expect(emptyDoc).toBeNull();
  });
});

describe('callback sub:pick', () => {
  it('sub:pick:<idx> → sub_pick', () => {
    expect(parseBotUpdate(cb('sub:pick:0'))).toEqual({ kind: 'sub_pick', chatId: '7500', idx: 0 });
    expect(parseBotUpdate(cb('sub:pick:7'))).toEqual({ kind: 'sub_pick', chatId: '7500', idx: 7 });
  });

  it('sub نامعتبر → null؛ callbackهای دیگر دست‌نخورده', () => {
    expect(parseBotUpdate(cb('sub:'))).toBeNull();
    expect(parseBotUpdate(cb('sub:pick:abc'))).toBeNull();
    expect(parseBotUpdate(cb('sub:cancel:1'))).toBeNull();
    expect(parseBotUpdate(cb('cancel:abc'))).toMatchObject({ kind: 'cancel_do' });
  });
});

describe('سازگاری عقب: جریان‌های قبلی', () => {
  it('متن عادی و /bank مثل قبل پارس می‌شود', () => {
    expect(parseBotUpdate({ update_id: 1, message: { chat: { id: 1 }, text: '/bank' } }))
      .toMatchObject({ kind: 'exb_root' });
    expect(parseBotUpdate({ update_id: 1, message: { chat: { id: 1 }, text: '۳۶۷۲۸۱۸۶۹۰' } }))
      .toMatchObject({ kind: 'identify' });
  });
});

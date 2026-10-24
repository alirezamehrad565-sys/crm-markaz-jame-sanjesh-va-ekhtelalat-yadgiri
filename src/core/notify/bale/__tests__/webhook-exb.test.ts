import { describe, it, expect } from 'vitest';
import { parseBotUpdate } from '../webhook';

const msg = (text: string, chatId = 7300) => ({
  update_id: 1,
  message: { chat: { id: chatId }, text }
});

const cb = (data: string, chatId = 7300) => ({
  update_id: 2,
  callback_query: { id: 10, data, message: { chat: { id: chatId } } }
});

describe('پارس «بانک تمرین»: برچسب متنی و /bank', () => {
  it('برچسب «بانک تمرین» و تغییرش‌ها → exb_root', () => {
    expect(parseBotUpdate(msg('بانک تمرین'))).toEqual({ kind: 'exb_root', chatId: '7300' });
    expect(parseBotUpdate(msg('بانک تمرینها'))).toEqual({ kind: 'exb_root', chatId: '7300' });
    expect(parseBotUpdate(msg('بانک\u200cتمرین'))).toEqual({ kind: 'exb_root', chatId: '7300' });
  });

  it('دستور /bank → exb_root', () => {
    expect(parseBotUpdate(msg('/bank'))).toEqual({ kind: 'exb_root', chatId: '7300' });
  });

  it('متن دیگر نویز می‌ماند (null)', () => {
    expect(parseBotUpdate(msg('بانک تمرین بده'))).toBeNull();
  });
});

describe('پارس callbackهای exb:', () => {
  it('root / cats / list', () => {
    expect(parseBotUpdate(cb('exb:root'))).toEqual({ kind: 'exb_root', chatId: '7300' });
    expect(parseBotUpdate(cb('exb:cats:d:1'))).toEqual({ kind: 'exb_cats', chatId: '7300', cat: 'd', page: 1 });
    expect(parseBotUpdate(cb('exb:cats:g:3'))).toEqual({ kind: 'exb_cats', chatId: '7300', cat: 'g', page: 3 });
    expect(parseBotUpdate(cb('exb:lst:a:0:1'))).toEqual({ kind: 'exb_list', chatId: '7300', cat: 'a', tagIdx: 0, page: 1 });
    expect(parseBotUpdate(cb('exb:lst:o:4:2'))).toEqual({ kind: 'exb_list', chatId: '7300', cat: 'o', tagIdx: 4, page: 2 });
  });

  it('item / file / lfile', () => {
    expect(parseBotUpdate(cb('exb:item:3'))).toEqual({ kind: 'exb_item', chatId: '7300', idx: 3 });
    expect(parseBotUpdate(cb('exb:file:2:1'))).toEqual({ kind: 'exb_file', chatId: '7300', idx: 2, fileIdx: 1 });
    expect(parseBotUpdate(cb('exb:lfile:4'))).toEqual({ kind: 'exb_file', chatId: '7300', idx: 4, fileIdx: -1 });
  });

  it('callbackهای حذف‌شدهٔ m184 → null', () => {
    expect(parseBotUpdate(cb('exb:send:2:1'))).toBeNull();
    expect(parseBotUpdate(cb('exb:pick:1:4'))).toBeNull();
    expect(parseBotUpdate(cb('exb:yes:0:2'))).toBeNull();
    expect(parseBotUpdate(cb('exb:pkg:2'))).toBeNull();
    expect(parseBotUpdate(cb('exb:pitem:1'))).toBeNull();
  });

  it('callback نامعتبر → null (نادیده)', () => {
    expect(parseBotUpdate(cb('exb:x:1'))).toBeNull();
    expect(parseBotUpdate(cb('exb:item:-1'))).toBeNull();
    expect(parseBotUpdate(cb('exb:cats:z:1'))).toBeNull();
    expect(parseBotUpdate(cb('exb:item:abc'))).toBeNull();
    expect(parseBotUpdate(cb('exb:'))).toBeNull();
  });

  it('callbackهای قدیمی (ask/cancel/fudone) دست‌نخورده', () => {
    expect(parseBotUpdate(cb('cancel:abc-123'))).toEqual({ kind: 'cancel_do', chatId: '7300', appointmentId: 'abc-123' });
    expect(parseBotUpdate(cb('ask:xyz'))).toEqual({ kind: 'cancel_ask', chatId: '7300', appointmentId: 'xyz' });
    expect(parseBotUpdate(cb('fudone:99'))).toEqual({ kind: 'followup_done', chatId: '7300', followupId: '99' });
  });
});

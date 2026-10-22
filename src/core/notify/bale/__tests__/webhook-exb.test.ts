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

  it('item / send / pick / yes', () => {
    expect(parseBotUpdate(cb('exb:item:3'))).toEqual({ kind: 'exb_item', chatId: '7300', idx: 3 });
    expect(parseBotUpdate(cb('exb:send:2:1'))).toEqual({ kind: 'exb_send', chatId: '7300', idx: 2, page: 1 });
    expect(parseBotUpdate(cb('exb:pick:1:4'))).toEqual({ kind: 'exb_pick', chatId: '7300', idx: 1, stuIdx: 4 });
    expect(parseBotUpdate(cb('exb:yes:0:2'))).toEqual({ kind: 'exb_yes', chatId: '7300', idx: 0, stuIdx: 2 });
  });

  it('pkg / pitem / psend / ppick / pyes', () => {
    expect(parseBotUpdate(cb('exb:pkg:2'))).toEqual({ kind: 'exb_pkg', chatId: '7300', page: 2 });
    expect(parseBotUpdate(cb('exb:pitem:1'))).toEqual({ kind: 'exb_pitem', chatId: '7300', idx: 1 });
    expect(parseBotUpdate(cb('exb:psend:0:3'))).toEqual({ kind: 'exb_psend', chatId: '7300', idx: 0, page: 3 });
    expect(parseBotUpdate(cb('exb:ppick:2:5'))).toEqual({ kind: 'exb_ppick', chatId: '7300', idx: 2, stuIdx: 5 });
    expect(parseBotUpdate(cb('exb:pyes:1:0'))).toEqual({ kind: 'exb_pyes', chatId: '7300', idx: 1, stuIdx: 0 });
    expect(parseBotUpdate(cb('exb:pkg:abc'))).toBeNull();
    expect(parseBotUpdate(cb('exb:pyes:1'))).toBeNull();
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

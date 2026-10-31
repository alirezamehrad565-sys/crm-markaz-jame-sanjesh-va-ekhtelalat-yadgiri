import { describe, expect, it } from 'vitest';
import { LINK_CODE_LENGTH } from '@core/shared';
import { generateLinkCode, parseBotUpdate } from '../webhook';

function updateWithText(text: string, chatId: number | string = 111222333): unknown {
  return {
    update_id: 42,
    message: {
      message_id: 7,
      chat: { id: chatId, type: 'private' },
      from: { id: 555, first_name: 'کاربر' },
      text
    }
  };
}

describe('parseBotUpdate (pure)', () => {
  it('T1: /start — chatId و نام فرستنده استخراج می‌شود', () => {
    const cmd = parseBotUpdate(updateWithText('/start'));
    expect(cmd).toEqual({ kind: 'start', chatId: '111222333', firstName: 'کاربر' });
  });

  it('T2: /help و /myid', () => {
    expect(parseBotUpdate(updateWithText('/help'))).toEqual({ kind: 'help', chatId: '111222333' });
    expect(parseBotUpdate(updateWithText('/myid'))).toEqual({ kind: 'myid', chatId: '111222333' });
  });

  it('T3: /link abc12d — کد نرمال (uppercase، بدون فاصله)', () => {
    expect(parseBotUpdate(updateWithText('/link abc12d'))).toEqual({
      kind: 'link',
      chatId: '111222333',
      code: 'ABC12D'
    });
    expect(parseBotUpdate(updateWithText('/link   Xy-Z9  '))).toEqual({
      kind: 'link',
      chatId: '111222333',
      code: 'XY-Z9'
    });
  });

  it('T4: /link بدون آرگومان → unknown (نه crash)', () => {
    const cmd = parseBotUpdate(updateWithText('/link'));
    expect(cmd?.kind).toBe('unknown');
  });

  it('T5: متن فارسی بدون / → null (نادیده)', () => {
    expect(parseBotUpdate(updateWithText('سلام، نوبت ما کی است؟'))).toBeNull();
  });

  it('T6: دستور ناشناخته با / → unknown (از دستور /status واقعی است)', () => {
    const cmd = parseBotUpdate(updateWithText('/somethingelse'));
    expect(cmd?.kind).toBe('unknown');
  });

  it('T7: آپدیت خراب → null (بدون chat یا بدون متن یا غیر آبجکت)', () => {
    expect(parseBotUpdate(null)).toBeNull();
    expect(parseBotUpdate('str')).toBeNull();
    expect(parseBotUpdate({ message: { text: '/start' } })).toBeNull();
    expect(parseBotUpdate({ message: { chat: { id: 1 } } })).toBeNull();
    expect(parseBotUpdate({ message: { chat: { id: 1 }, text: '' } })).toBeNull();
  });

  it('T8: edited_message هم پارس می‌شود', () => {
    const cmd = parseBotUpdate({ edited_message: { chat: { id: 9 }, text: '/myid' } });
    expect(cmd).toEqual({ kind: 'myid', chatId: '9' });
  });

  it('T9: chatId عددی بزرگ (اما safe) → string دقیق', () => {
    const cmd = parseBotUpdate(updateWithText('/start', 9007199254740991)); // 2^53-1
    expect(cmd?.chatId).toBe('9007199254740991');
  });
});

describe('generateLinkCode (pure)', () => {
  it('T10: طول کد مطابق ثابت و فقط از الفبای مجاز', () => {
    const code = generateLinkCode(LINK_CODE_LENGTH);
    expect(code).toHaveLength(LINK_CODE_LENGTH);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]+$/); // بدون O, I, 0, 1
  });

  it('T11: دو کد پشت‌هم احتمال تکرار عملاً صفر (random واقعی)', () => {
    const a = generateLinkCode(LINK_CODE_LENGTH);
    const b = generateLinkCode(LINK_CODE_LENGTH);
    expect(a).not.toBe(b);
  });
});

describe('parseBotUpdate (pure)', () => {
  it(': دکمه متنی «نوبت‌های من» با و بدون نیم‌فاصله → my_next', () => {
    expect(parseBotUpdate(updateWithText('نوبت‌های من'))).toEqual({ kind: 'my_next', chatId: '111222333' });
    expect(parseBotUpdate(updateWithText('نوبتهای من'))).toEqual({ kind: 'my_next', chatId: '111222333' });
    expect(parseBotUpdate(updateWithText(' نوبت‌های من '))).toEqual({ kind: 'my_next', chatId: '111222333' });
    expect(parseBotUpdate(updateWithText('/mynext'))).toEqual({ kind: 'my_next', chatId: '111222333' });
  });

  it(': دکمه متنی «راهنما» → help', () => {
    expect(parseBotUpdate(updateWithText('راهنما'))).toEqual({ kind: 'help', chatId: '111222333' });
  });

  it(': کد ملی با ارقام فارسی → identify national_id (نرمال‌شده)', () => {
    expect(parseBotUpdate(updateWithText('۰۰۱۲۳۴۵۶۷۹'))).toEqual({
      kind: 'identify', chatId: '111222333', format: 'national_id', value: '0012345679'
    });
    expect(parseBotUpdate(updateWithText('0012-3456-79'))).toEqual({
      kind: 'identify', chatId: '111222333', format: 'national_id', value: '0012345679'
    });
  });

  it(': موبایل ۰۹… و ۰۹۸… و +۹۸ → identify phone (نرمال ۰۹)', () => {
    expect(parseBotUpdate(updateWithText('09121234567'))).toEqual({
      kind: 'identify', chatId: '111222333', format: 'phone', value: '09121234567'
    });
    expect(parseBotUpdate(updateWithText('۰۹۱۲۱۲۳۴۵۶۷'))).toEqual({
      kind: 'identify', chatId: '111222333', format: 'phone', value: '09121234567'
    });
    expect(parseBotUpdate(updateWithText('+989121234567'))).toEqual({
      kind: 'identify', chatId: '111222333', format: 'phone', value: '989121234567'
    });
    expect(parseBotUpdate(updateWithText('989121234567'))).toEqual({
      kind: 'identify', chatId: '111222333', format: 'phone', value: '989121234567'
    });
  });

  it(': موبایل ۱۰ رقمی بدون صفر → national_id طبق قاعده (سرویس تلفن را هم امتحان می‌کند)', () => {
    expect(parseBotUpdate(updateWithText('9121234567'))).toEqual({
      kind: 'identify', chatId: '111222333', format: 'national_id', value: '9121234567'
    });
  });

  it(': شماره ثابت ۱۱ رقمی بدون ۰۹ → invalid (پیام راهنما، نه سکوت)', () => {
    expect(parseBotUpdate(updateWithText('02112345678'))).toEqual({
      kind: 'identify', chatId: '111222333', format: 'invalid', value: '02112345678'
    });
  });

  it(': عدد کوتاه/بلند خارج بازه → null (نویز) و متن مخلوط حرف‌وعدد → null', () => {
    expect(parseBotUpdate(updateWithText('۱۲۳'))).toBeNull();
    expect(parseBotUpdate(updateWithText('12345678901234567890'))).toBeNull();
    expect(parseBotUpdate(updateWithText('کد من ۱۲۳۴۵۶'))).toBeNull();
    expect(parseBotUpdate(updateWithText('سلام، نوبت ما کی است؟'))).toBeNull();
  });

  it(': callback_query با data «ask:<id>» و «cancel:<id>» → cancel_ask/cancel_do', () => {
    const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    expect(parseBotUpdate({
      callback_query: { id: 5, data: `ask:${id}`, message: { chat: { id: 777 } } }
    })).toEqual({ kind: 'cancel_ask', chatId: '777', appointmentId: id });
    expect(parseBotUpdate({
      callback_query: { id: 6, data: `cancel:${id}`, message: { chat: { id: 777 } } }
    })).toEqual({ kind: 'cancel_do', chatId: '777', appointmentId: id });
  });

  it(': callback ناشناخته/بدون chat/بدون data → null', () => {
    const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    expect(parseBotUpdate({ callback_query: { data: `other:${id}`, message: { chat: { id: 1 } } } })).toBeNull();
    expect(parseBotUpdate({ callback_query: { data: `ask:${id}` } })).toBeNull();
    expect(parseBotUpdate({ callback_query: { message: { chat: { id: 1 } } } })).toBeNull();
  });
});

describe('parseBotUpdate (pure)', () => {
  it(': دستورهای /followups و /attendance', () => {
    expect(parseBotUpdate(updateWithText('/followups'))).toEqual({ kind: 'followups_me', chatId: '111222333' });
    expect(parseBotUpdate(updateWithText('/attendance'))).toEqual({ kind: 'attendance_summary', chatId: '111222333' });
  });

  it(': دکمه‌های متنی فارسی (با و بدون نیم‌فاصله)', () => {
    expect(parseBotUpdate(updateWithText('پیگیری‌های من'))).toEqual({ kind: 'followups_me', chatId: '111222333' });
    expect(parseBotUpdate(updateWithText('پیگیری های من'))).toEqual({ kind: 'followups_me', chatId: '111222333' });
    expect(parseBotUpdate(updateWithText('حضور فرزند'))).toEqual({ kind: 'attendance_summary', chatId: '111222333' });
    expect(parseBotUpdate(updateWithText('حضور'))).toEqual({ kind: 'attendance_summary', chatId: '111222333' });
  });

  it(': callback «fudone:<id>» → followup_done؛ callback نامعتبر → null', () => {
    const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    expect(parseBotUpdate({
      callback_query: { id: 7, data: `fudone:${id}`, message: { chat: { id: 888 } } }
    })).toEqual({ kind: 'followup_done', chatId: '888', followupId: id });
    expect(parseBotUpdate({
      callback_query: { id: 8, data: 'fudone:', message: { chat: { id: 888 } } }
    })).toBeNull();
  });

  it(': «حضور» دقیق است — «حضور و غیاب» نویز است (نه دستور، نه شناسه)', () => {
    expect(parseBotUpdate(updateWithText('حضور و غیاب'))).toBeNull();
  });
});

describe('parseBotUpdate (pure)', () => {
  it(': متن عادی حاوی «هدف» → نویز (نه دستور)', () => {
    expect(parseBotUpdate(updateWithText('هدف ما این است'))).toBeNull();
  });
});

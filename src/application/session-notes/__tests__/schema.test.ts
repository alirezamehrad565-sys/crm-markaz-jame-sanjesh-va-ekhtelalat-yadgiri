import { describe, expect, it } from 'vitest';
import { NEXT_ACTION_VALUES, SESSION_NOTE_MAX, SaveSessionNoteSchema } from '@core/shared';
import { normalizeNextAction } from '../service';

function parse(input: unknown) {
  return SaveSessionNoteSchema.parse(input);
}

describe('SaveSessionNoteSchema (D7)', () => {
  it('T1 — پیش‌فرض‌ها: متن خالی و اقدام «none»', () => {
    const v = parse({});
    expect(v.session_note).toBe('');
    expect(v.next_action).toBe('none');
  });

  it('T2 — همهٔ مقادیر مجاز اقدام بعدی قبول می‌شوند', () => {
    for (const v of NEXT_ACTION_VALUES) {
      expect(parse({ next_action: v }).next_action).toBe(v);
    }
  });

  it('T3 — مقدار نامعتبر اقدام بعدی رد می‌شود', () => {
    expect(() => parse({ next_action: 'bogus' })).toThrow();
    expect(() => parse({ next_action: 42 })).toThrow();
    expect(() => parse({ next_action: null })).toThrow();
  });

  it(`T4 — سقف ${SESSION_NOTE_MAX} نویسه: ۲۰۰۰ قبول، ۲۰۰۱ رد`, () => {
    expect(parse({ session_note: 'ا'.repeat(SESSION_NOTE_MAX) }).session_note.length).toBe(SESSION_NOTE_MAX);
    expect(() => parse({ session_note: 'ا'.repeat(SESSION_NOTE_MAX + 1) })).toThrow();
  });

  it('T5 — متن غیررشته‌ای رد می‌شود', () => {
    expect(() => parse({ session_note: 123 })).toThrow();
  });
});

describe('normalizeNextAction (قرارداد ذخیره‌سازی)', () => {
  it('T6 — none به NULL نگاشت می‌شود؛ بقیه عبور می‌کنند', () => {
    expect(normalizeNextAction('none')).toBeNull();
    expect(normalizeNextAction('follow_up')).toBe('follow_up');
    expect(normalizeNextAction('next_appointment')).toBe('next_appointment');
    expect(normalizeNextAction('contact')).toBe('contact');
    expect(normalizeNextAction('referral')).toBe('referral');
  });
});

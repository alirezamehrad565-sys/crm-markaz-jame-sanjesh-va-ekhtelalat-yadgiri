import { describe, it, expect } from 'vitest';
import { NewStaffSchema, UpdateStaffSchema, LoginSchema } from '../schemas';

const VALID_BASE = {
  full_name: 'سارا محمدی',
  phone: '09121234567',
  national_id: '3672818690', // checksum معتبر
  username: 'sara.m',
  role: 'therapist' as const
};

describe('NewStaffSchema', () => {
  it('با تلفن + کد ملی + نام کاربری معتبر می‌پذیرد', () => {
    const parsed = NewStaffSchema.parse(VALID_BASE);
    expect(parsed.username).toBe('sara.m');
    expect(parsed.national_id).toBe('3672818690');
  });

  it('ایمیل دیگر جزو اسکیما است — ارسالش اثر ندارد', () => {
    const parsed = NewStaffSchema.parse({ ...VALID_BASE, email: 'a@b.com' });
    expect(parsed).not.toHaveProperty('email');
  });

  it('بدون تلفن رد می‌شود', () => {
    const { phone, ...rest } = VALID_BASE;
    void phone;
    expect(NewStaffSchema.safeParse(rest).success).toBe(false);
  });

  it('بدون کد ملی رد می‌شود', () => {
    const { national_id, ...rest } = VALID_BASE;
    void national_id;
    expect(NewStaffSchema.safeParse(rest).success).toBe(false);
  });

  it('کد ملی با checksum غلط رد می‌شود', () => {
    expect(NewStaffSchema.safeParse({ ...VALID_BASE, national_id: '3672818691' }).success).toBe(false);
  });

  it('نام کاربری با نویسه غیرمجاز رد می‌شود', () => {
    expect(NewStaffSchema.safeParse({ ...VALID_BASE, username: 'سارا' }).success).toBe(false);
    expect(NewStaffSchema.safeParse({ ...VALID_BASE, username: 'a b' }).success).toBe(false);
  });

  it('نام کاربری خیلی کوتاه رد می‌شود', () => {
    expect(NewStaffSchema.safeParse({ ...VALID_BASE, username: 'ab' }).success).toBe(false);
  });

  it('رمز اختیاری است ولی حداقل ۴ نویسه', () => {
    expect(NewStaffSchema.safeParse({ ...VALID_BASE, password: '12' }).success).toBe(false);
    expect(NewStaffSchema.safeParse({ ...VALID_BASE, password: '1234' }).success).toBe(true);
  });
});

describe('UpdateStaffSchema', () => {
  it('به‌روزرسانی جزئی نام کاربری/رمز مجاز است', () => {
    const parsed = UpdateStaffSchema.parse({ username: 'new-name', password: '5678' });
    expect(parsed.username).toBe('new-name');
  });

  it('فیلد email حذف شده — ارسال آن رد می‌شود (strict نیست ولی ذخیره نمی‌شود)', () => {
    const parsed = UpdateStaffSchema.parse({ email: 'x@y.z' });
    expect(parsed).not.toHaveProperty('email');
  });
});

describe('LoginSchema', () => {
  it('نام کاربری + رمز معتبر', () => {
    expect(LoginSchema.parse({ username: ' manager ', password: '1234' })).toEqual({
      username: 'manager',
      password: '1234'
    });
  });

  it('نام کاربری خالی رد می‌شود', () => {
    expect(LoginSchema.safeParse({ username: '', password: '1234' }).success).toBe(false);
  });
});

import { WorkingHourRangeSchema, NewWorkingHourSchema } from '../schemas';

describe('WorkingHourRangeSchema (camelCase یا snake_case)', () => {
  it('شکل camelCase فرانت پذیرفته می‌شود', () => {
    const parsed = WorkingHourRangeSchema.parse({ weekday: 0, startMinute: 480, endMinute: 660 });
    expect(parsed.start_minute).toBe(480);
    expect(parsed.end_minute).toBe(660);
  });

  it('شکل snake_case هم‌چنان پذیرفته می‌شود', () => {
    const parsed = WorkingHourRangeSchema.parse({ weekday: 1, start_minute: 540, end_minute: 720 });
    expect(parsed.start_minute).toBe(540);
  });

  it('NewWorkingHourSchema با camelCase', () => {
    const parsed = NewWorkingHourSchema.parse({
      staff_id: '00000000-0000-0000-0000-000000000001',
      weekday: 2,
      startMinute: 510,
      endMinute: 690
    });
    expect(parsed.staff_id).toBe('00000000-0000-0000-0000-000000000001');
    expect(parsed.start_minute).toBe(510);
  });

  it('غیرهم‌راستا (پایان قبل از شروع) رد می‌شود', () => {
    expect(WorkingHourRangeSchema.safeParse({ weekday: 0, startMinute: 660, endMinute: 480 }).success).toBe(false);
  });
});

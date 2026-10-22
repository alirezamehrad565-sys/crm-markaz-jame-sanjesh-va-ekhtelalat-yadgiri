import { describe, it, expect } from 'vitest';
import { WAITLIST_TRANSITIONS, canTransition, orderWaitlist, isOverdue, matchStudent, appendNote } from '../pure';

describe('ماتریس ترنزیشن وضعیت', () => {
  it('waiting می‌تواند به همهٔ حالت‌های فعال/نهایی برود', () => {
    expect(WAITLIST_TRANSITIONS.waiting).toEqual(['called', 'scheduled', 'admitted', 'rejected', 'no_show', 'cancelled']);
    expect(canTransition('called', 'admitted')).toBe(true);
  });

  it('scheduled فقط به admitted/no_show/cancelled می‌رود', () => {
    expect(WAITLIST_TRANSITIONS.scheduled).toEqual(['admitted', 'no_show', 'cancelled']);
    expect(canTransition('scheduled', 'called')).toBe(false);
    expect(canTransition('scheduled', 'rejected')).toBe(false);
  });

  it('وضعیت‌های نهایی — فقط admitted بن‌بست است؛ خروج‌ها به waiting بازمی‌گردند', () => {
    expect(WAITLIST_TRANSITIONS.admitted).toEqual([]);
    expect(canTransition('admitted', 'waiting')).toBe(false);
    for (const s of ['rejected', 'no_show', 'cancelled'] as const) {
      expect(WAITLIST_TRANSITIONS[s]).toEqual(['waiting']);
      expect(canTransition(s, 'waiting')).toBe(true);
      expect(canTransition(s, 'called')).toBe(false);
      expect(canTransition(s, 'scheduled')).toBe(false);
    }
  });

  it('جریان طلایی waiting→called→scheduled→admitted', () => {
    expect(canTransition('waiting', 'called')).toBe(true);
    expect(canTransition('called', 'scheduled')).toBe(true);
    expect(canTransition('scheduled', 'admitted')).toBe(true);
  });
});

interface Row {
  id: string;
  status: 'waiting' | 'called' | 'scheduled' | 'admitted' | 'rejected' | 'no_show' | 'cancelled';
  priority: 'normal' | 'urgent';
  manualOrder: number | null;
  createdAt: string;
  updatedAt: string;
}

function row(id: string, over: Partial<Row> = {}): Row {
  return {
    id,
    status: 'waiting',
    priority: 'normal',
    manualOrder: null,
    createdAt: `2025-01-0${1 + (Number(id) % 9)}` + ' 10:00:00',
    updatedAt: '2025-01-10 10:00:00',
    ...over
  };
}

describe('orderWaitlist — ترتیب خودکار و دستی', () => {
  it('حالت خودکار: فوری‌ها بالای لیست، بعد FIFO', () => {
    const a = row('1', { createdAt: '2025-01-01 10:00:00' });
    const b = row('2', { createdAt: '2025-01-02 10:00:00', priority: 'urgent' });
    const c = row('3', { createdAt: '2025-01-03 10:00:00', priority: 'urgent' });
    const out = orderWaitlist([a, b, c]);
    expect(out.map((r) => r.id)).toEqual(['2', '3', '1']);
  });

  it('حالت خودکار در اولویت برابر: FIFO', () => {
    const a = row('1', { createdAt: '2025-01-03 10:00:00' });
    const b = row('2', { createdAt: '2025-01-01 10:00:00' });
    const out = orderWaitlist([a, b]);
    expect(out.map((r) => r.id)).toEqual(['2', '1']);
  });

  it('حالت دستی: manual_order حاکم است حتی اگر urgent باشد', () => {
    const a = row('1', { manualOrder: 2 });
    const b = row('2', { manualOrder: 1, priority: 'normal' });
    const c = row('3', { priority: 'urgent', manualOrder: null }); // جدید — append به انتها
    const out = orderWaitlist([a, b, c]);
    expect(out.map((r) => r.id)).toEqual(['2', '1', '3']);
  });

  it('بسته‌شده‌ها به پایین لیست می‌روند (جدیدترین تغییر اول)', () => {
    const open = row('1');
    const done1 = row('2', { status: 'rejected', updatedAt: '2025-01-11 10:00:00' });
    const done2 = row('3', { status: 'admitted', updatedAt: '2025-01-12 10:00:00' });
    const out = orderWaitlist([done2, open, done1]);
    expect(out.map((r) => r.id)).toEqual(['1', '3', '2']);
  });
});

describe('isOverdue — آستانهٔ هشدار', () => {
  const now = new Date('2025-01-15T10:00:00.000Z');

  it('waiting قدیمی‌تر از ۷ روز → overdue', () => {
    const e = row('1', { createdAt: '2025-01-07 09:00:00' });
    expect(isOverdue(e, now, 7)).toBe(true);
  });

  it('waiting تازه → نه', () => {
    const e = row('1', { createdAt: '2025-01-14 09:00:00' });
    expect(isOverdue(e, now, 7)).toBe(false);
  });

  it('بسته‌شدهٔ قدیمی هرگز overdue نیست', () => {
    const e = row('1', { status: 'admitted', createdAt: '2024-12-01 09:00:00' });
    expect(isOverdue(e, now, 7)).toBe(false);
  });

  it('فرمت datetime دیتابیس (بدون T/Z) هم پارس می‌شود', () => {
    const e = row('1', { createdAt: '2025-01-01 09:00:00' });
    expect(isOverdue(e, now, 7)).toBe(true);
  });
});

describe('matchStudent — تطبیق در /schedule', () => {
  const students = [
    { id: 's1', nationalId: '111', guardianPhone: '09120000001' },
    { id: 's2', nationalId: '222', guardianPhone: '09120000001' },
    { id: 's3', nationalId: '333', guardianPhone: '09120000003' }
  ];

  it('student_id صریح اولویت دارد', () => {
    const out = matchStudent({ studentId: 's3', nationalId: '111', phone: '09120000001' }, students);
    expect(out).toEqual({ kind: 'explicit', studentId: 's3' });
  });

  it('national_id یکتا → تطبیق', () => {
    const out = matchStudent({ nationalId: '333' }, students);
    expect(out).toEqual({ kind: 'national_id', studentId: 's3' });
  });

  it('تلفن با دو پرونده → ambiguous', () => {
    const out = matchStudent({ phone: '09120000001' }, students);
    expect(out).toEqual({ kind: 'ambiguous', candidates: ['s1', 's2'] });
  });

  it('تلفن با یک پرونده → تطبیق phone', () => {
    const out = matchStudent({ phone: '09120000003' }, students);
    expect(out).toEqual({ kind: 'phone', studentId: 's3' });
  });

  it('بدون هیچ نشانه‌ای → none', () => {
    expect(matchStudent({}, students)).toEqual({ kind: 'none' });
    expect(matchStudent({ studentId: 'nope' }, students)).toEqual({ kind: 'none' });
    expect(matchStudent({ nationalId: '999' }, students)).toEqual({ kind: 'none' });
  });
});

describe('appendNote — یادداشت تماس/رد', () => {
  it('به یادداشت موجود append می‌شود', () => {
    expect(appendNote('یادداشت اول', 'تماس', 'همراه بود')).toBe('یادداشت اول\n［تماس］همراه بود');
  });

  it('بدون متن هم ثبت می‌شود (فقط برچسب و زمان‌گذاری غیرمستقیم)', () => {
    expect(appendNote(null, 'رد شد', undefined)).toBe('［رد شد］');
  });

  it('یادداشت خالی موجود را خراب نمی‌کند', () => {
    expect(appendNote('  ', 'تماس', 'پیگیر است')).toBe('［تماس］پیگیر است');
  });
});

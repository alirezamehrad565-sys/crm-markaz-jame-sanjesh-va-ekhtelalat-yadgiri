/**
 * آزمون رفتاری منطق خالص تقویم نوبت‌ها — ۱.۲۷.۸۲ (sdt159: بستن testing-002)
 * الگوی مرجع: front-updater/front-sync-status — توابع خالصِ appointments.js در node اجرا می‌شوند
 * نه فقط به‌صورت متن. تنها سد import: خوانش سطح‌ماژولِ sessionStorage در state — استاب سبک.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('منطق خالص تقویم نوبت‌ها (appointments.js — behavioral)', () => {
  // @ts-ignore — ماژول وانیل فرانت خارج از tsconfig است
  let A: typeof import('../../public/assets/js/views/appointments.js');

  beforeAll(async () => {
    (globalThis as Record<string, unknown>).sessionStorage = {
      getItem: () => null, setItem: () => {}, removeItem: () => {}
    };
    // @ts-ignore — ماژول وانیل فرانت خارج از tsconfig است
    A = await import('../../public/assets/js/views/appointments.js');
  });
  afterAll(() => {
    delete (globalThis as Record<string, unknown>).sessionStorage;
  });

  it('attStateOf — چهار وضعیت قراردادی حضور (لغو/برگزارشده/برگزارنشده/بی‌اثر)', () => {
    expect(A.attStateOf({ status: 'cancelled', students: [{ attendance: 'present' }] })).toBe('cancelled');
    expect(A.attStateOf({ status: 'scheduled', students: [{ attendance: 'present' }, { attendance: 'late' }] })).toBe('completed');
    expect(A.attStateOf({ status: 'scheduled', students: [{ attendance: 'absent' }] })).toBe('no_show');
    expect(A.attStateOf({ status: 'scheduled', students: [{ attendance: 'present' }, { attendance: 'absent' }] })).toBe('none');
    expect(A.attStateOf({ status: 'scheduled', students: [] })).toBe('none');
    expect(A.attStateOf({ status: 'scheduled', students: [{ attendance: 'cancelled' }] })).toBe('none');
  });

  it('apptStatusClass — نگاشت وضعیت به کلاس CSS (قرارداد استایل کارت)', () => {
    expect(A.apptStatusClass({ status: 'cancelled' })).toBe(' is-cancelled');
    expect(A.apptStatusClass({ status: 'scheduled', students: [{ attendance: 'present' }] })).toBe(' is-attended');
    expect(A.apptStatusClass({ status: 'scheduled', students: [{ attendance: 'absent' }] })).toBe(' is-noshow');
    expect(A.apptStatusClass({ status: 'scheduled', students: [{ attendance: 'cancelled' }] })).toBe('');
  });

  it('isoToYmd — مرز نیمه‌شب تهران (+۰۳:۳۰) تاریخ را جابه‌جا می‌کند', () => {
    expect(A.isoToYmd('2026-05-01T10:00:00Z')).toBe('2026-05-01'); // ۱۳:۳۰ تهران
    expect(A.isoToYmd('2026-05-01T21:00:00Z')).toBe('2026-05-02'); // ۰۰:۳۰ روز بعد
  });

  it('weekStartOf — هفته از شنبه آغاز می‌شود', () => {
    expect(A.weekStartOf('2026-01-04')).toBe('2026-01-03'); // یکشنبه → شنبه
    expect(A.weekStartOf('2026-01-03')).toBe('2026-01-03'); // خودِ شنبه
    expect(A.weekStartOf('2026-01-09')).toBe('2026-01-03'); // جمعه
  });

  it('groupByDay — گروه‌بندی بر تاریخ تهران + مرتب‌سازی درون‌گروهی', () => {
    const mk = (id: string, startAt: string) => ({ id, startAt });
    const list = [
      mk('b', '2026-05-01T07:00:00Z'),
      mk('d', '2026-05-01T21:00:00Z'), // تهران ۰۱:۰۰ فردا
      mk('a', '2026-05-01T05:30:00Z')
    ];
    const map = A.groupByDay(list);
    const keys = [...map.keys()].sort();
    expect(keys).toEqual([A.isoToYmd('2026-05-01T07:00:00Z'), A.isoToYmd('2026-05-01T21:00:00Z')]);
    const day = map.get(A.isoToYmd('2026-05-01T07:00:00Z')) as Array<{ id: string }>;
    expect(day.map((x) => x.id)).toEqual(['a', 'b']); // sort با startAt
  });

  it('buildScaleCore — شبکهٔ خالص با پارامتر صریح (ساعات مرکز، ppm): مرزها و یکنوایی yOf', () => {
    const hours = [{ weekday: 3, startMinute: 480, endMinute: 1080 }]; // چهارشنبه ۸:۰۰–۱۸:۰۰
    const items = [{ startAt: '2026-11-25T10:00:00Z', endAt: '2026-11-25T11:00:00Z' }];
    const s = A.buildScaleCore(['2026-11-25'], items, hours, 1.9);
    expect(s.workStart).toBe(480);
    expect(s.workEnd).toBe(1080);
    expect(s.start).toBeGreaterThanOrEqual(A.DAY_START); // کف مطلق ۰۶:۰۰
    expect(s.end).toBeLessThanOrEqual(A.DAY_END);        // سقف مطلق ۲۲:۰۰
    expect(s.yOf(s.start)).toBe(0);
    expect(s.total).toBe(s.yOf(s.end));
    let prev = s.yOf(s.start);
    for (let m = s.start; m <= s.end; m += 15) {
      expect(s.yOf(m)).toBeGreaterThanOrEqual(prev); // یکنوایی صعودی
      prev = s.yOf(m);
    }
    // نوبت داخل بازهٔ کاری span مثبت و هم‌ترازِ ppm کاری
    const spanIn = s.span(540, 600);
    expect(spanIn).toBeCloseTo(60 * 1.9, 6);
    expect(spanIn).toBeGreaterThan(0);
  });

  it('buildScaleCore — گارد بدون ساعت مرکز: پیش‌فرض ۸:۰۰–۱۸:۰۰ + اثر WORK_CAP', () => {
    const s = A.buildScaleCore(['2026-11-26'], [], undefined, 1.9);
    expect(s.workStart).toBe(480);
    expect(s.workEnd).toBe(Math.min(1080, A.WORK_CAP));
  });

  it('ثابت‌های تجاری شبکه و برچسب‌ها — قرارداد محصولی', () => {
    expect(A.DAY_START).toBe(360);   // ۰۶:۰۰
    expect(A.DAY_END).toBe(1320);    // ۲۲:۰۰
    expect(A.CELL_MINUTES).toBe(30);
    expect(A.WORK_CAP).toBe(21 * 60); // شیفت عصر تا ۲۱:۰۰ (۱.۲۵.۵۷)
    expect(A.DURATIONS).toEqual([15, 30, 45, 60, 90, 120, 180, 240]);
    expect(A.NEXT_ACTION_LABELS.none).toBe('هیچ');
    expect(A.NEXT_ACTION_LABELS.referral).toBe('ارجاع');
  });
});

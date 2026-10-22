import { describe, expect, it } from 'vitest';
import { findOverlaps } from '../engine';
import type { ExistingAppointment, ProposedWindow } from '../engine';

const DAY = '2026-10-12';

function existing(overrides: Partial<ExistingAppointment> & { id: string }): ExistingAppointment {
  return {
    staffId: 'staff-1',
    startAt: `${DAY}T08:00:00.000Z`,
    endAt: `${DAY}T08:30:00.000Z`,
    status: 'scheduled',
    ...overrides
  };
}

function proposed(overrides: Partial<ProposedWindow> = {}): ProposedWindow {
  return {
    staffId: 'staff-1',
    startAt: `${DAY}T08:15:00.000Z`,
    endAt: `${DAY}T08:45:00.000Z`,
    ...overrides
  };
}

describe('conflict-engine.findOverlaps', () => {
  it('T1: مرز دقیق — پایان نوبت موجود == شروع پیشنهادی → بدون تداخل', () => {
    const rows = [existing({ id: 'a1', startAt: `${DAY}T07:45:00.000Z`, endAt: `${DAY}T08:15:00.000Z` })];
    expect(findOverlaps(rows, proposed())).toHaveLength(0);
  });

  it('T2: مرز دقیق — شروع نوبت موجود == پایان پیشنهادی → بدون تداخل', () => {
    const rows = [existing({ id: 'a1', startAt: `${DAY}T08:45:00.000Z`, endAt: `${DAY}T09:15:00.000Z` })];
    expect(findOverlaps(rows, proposed())).toHaveLength(0);
  });

  it('T3: هم‌پوشانی جزئی → تشخیص داده می‌شود', () => {
    const rows = [existing({ id: 'a1' })]; // 08:00-08:30
    const warnings = findOverlaps(rows, proposed()); // 08:15-08:45
    expect(warnings).toHaveLength(1);
    expect(warnings[0].appointmentId).toBe('a1');
    expect(warnings[0].type).toBe('overlap');
  });

  it('T4: پیشنهادی کاملاً داخل موجود → تشخیص داده می‌شود', () => {
    const rows = [existing({ id: 'a1', startAt: `${DAY}T08:00:00.000Z`, endAt: `${DAY}T09:00:00.000Z` })];
    expect(findOverlaps(rows, proposed())).toHaveLength(1);
  });

  it('T5: موجود کاملاً داخل پیشنهادی → تشخیص داده می‌شود', () => {
    const rows = [existing({ id: 'a1', startAt: `${DAY}T08:20:00.000Z`, endAt: `${DAY}T08:25:00.000Z` })];
    expect(findOverlaps(rows, proposed())).toHaveLength(1);
  });

  it('T6: زمان‌های یکسان → تشخیص داده می‌شود', () => {
    const rows = [existing({ id: 'a1', startAt: `${DAY}T08:15:00.000Z`, endAt: `${DAY}T08:45:00.000Z` })];
    expect(findOverlaps(rows, proposed())).toHaveLength(1);
  });

  it('T7: نوبت لغوشده حساب نمی‌شود', () => {
    const rows = [existing({ id: 'a1', status: 'cancelled' })];
    expect(findOverlaps(rows, proposed())).toHaveLength(0);
  });

  it('T8: excludeId نادیده گرفته می‌شود', () => {
    const rows = [existing({ id: 'a1' })];
    expect(findOverlaps(rows, proposed({ excludeId: 'a1' }))).toHaveLength(0);
  });

  it('T9: چند تداخل هم‌زمان → همه برمی‌گردند و متخصص متفاوت نادیده است', () => {
    const rows = [
      existing({ id: 'a1', startAt: `${DAY}T08:00:00.000Z`, endAt: `${DAY}T08:30:00.000Z` }),
      existing({ id: 'a2', startAt: `${DAY}T08:30:00.000Z`, endAt: `${DAY}T09:00:00.000Z` }),
      existing({ id: 'a3', staffId: 'staff-2', startAt: `${DAY}T08:15:00.000Z`, endAt: `${DAY}T08:45:00.000Z` })
    ];
    const warnings = findOverlaps(rows, proposed());
    expect(warnings.map((w) => w.appointmentId).sort()).toEqual(['a1', 'a2']);
  });
});

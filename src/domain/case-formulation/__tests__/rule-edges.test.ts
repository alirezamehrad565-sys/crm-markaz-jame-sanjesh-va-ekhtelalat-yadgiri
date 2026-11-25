/**
 * آزمون مرزی موتور صورت‌بندی — ۱.۲۷.۸۳ (sdt160: بستن testing-007)
 * سطح خالص engine.js: wechslerFromEvent (سه مسیر: engine_output / فیلدهای دستی / همه‌null)،
 * ageYearsFromBirthDate (میلادی/جلالی/خارج بازه) و تک‌منبعی جدول‌های آستانه از __tables.
 */
import { describe, it, expect } from 'vitest';
// @ts-ignore — باندل خالص موتور صورت‌بندی
import { wechslerFromEvent, ageYearsFromBirthDate, __tables } from '../engine.js';

describe('مرزهای موتور صورت‌بندی (testing-007 — ۱.۲۷.۸۳)', () => {
  it('wechslerFromEvent — مسیر engine_output معتبر: کل پاکت ok دار برگردانده می‌شود (ورودی = خود payload)', () => {
    const payload = {
      engine_output: { value: JSON.stringify({
        ok: true,
        snapshot: { indices: { VCI: 13, PRI: 12, WMI: 10, PSI: 9 }, fsiq: 105 }
      }) }
    };
    const w = wechslerFromEvent(payload);
    expect(w?.ok).toBe(true);
    expect(w?.snapshot?.fsiq).toBe(105);
  });

  it('wechslerFromEvent — مسیر فیلدهای دستی (payload[key].value): snapshot.fsiq', () => {
    const payload = { vci: { value: '11' }, pri: { value: '8' }, wmi: { value: '9' }, psi: { value: '12' }, fsiq: { value: '98' } };
    const w = wechslerFromEvent(payload);
    expect(w?.snapshot?.fsiq).toBe(98);
    expect(w?.snapshot?.indexScatter).toBeGreaterThan(0); // پراکندگی گزارش می‌شود (قرارداد)
    expect(w?.snapshot?.indices?.VCI?.scaled).toBe(11);
  });

  it('wechslerFromEvent — پراکندگی دستی وقتی فقط دو مقدار مانده باشد', () => {
    const payload = { vci: { value: '6' }, pri: { value: '15' } };
    const w = wechslerFromEvent(payload);
    expect(w?.snapshot?.indexScatter).toBeGreaterThan(0);
  });

  it('wechslerFromEvent — همه‌null → null (بی‌کرش)', () => {
    expect(wechslerFromEvent({})).toBeNull();
    expect(wechslerFromEvent(null)).toBeNull();
  });

  it('ageYearsFromBirthDate — میلادی دقیق با مرز ماه/روز و بازهٔ مجاز', () => {
    expect(ageYearsFromBirthDate('2018-06-15')).toBe(8);       // تا 2026-11-25 هنوز ۸
    expect(ageYearsFromBirthDate('2018-05-20')).toBe(8);       // تولد گذشتهٔ سال → ۸
    expect(ageYearsFromBirthDate('2018-12-31')).toBe(7);       // تولد نیامده → ۷
    expect(ageYearsFromBirthDate('2025-01-01')).toBe(1);       // کف بازه
    expect(ageYearsFromBirthDate('2030-01-01')).toBeUndefined(); // آینده → خارج بازه
    expect(ageYearsFromBirthDate('نامعتبر')).toBeUndefined();
  });

  it('ageYearsFromBirthDate — جلالی با تخمین سال', () => {
    const y = ageYearsFromBirthDate('1397/05/10');
    expect(y).toBeGreaterThanOrEqual(8);
    expect(y).toBeLessThanOrEqual(9);
    expect(ageYearsFromBirthDate('1400/01/01')).toBeGreaterThanOrEqual(5);
  });

  it('جدول‌های آستانه از __tables — تک‌منبعِ level/اجماع/سقف نمره', () => {
    const tables = (__tables ?? {}) as Record<string, unknown>;
    expect(JSON.stringify(tables)).toContain('border'); // LEVEL_THRESHOLDS در جدول‌های افشا‌شده هست
  });
});

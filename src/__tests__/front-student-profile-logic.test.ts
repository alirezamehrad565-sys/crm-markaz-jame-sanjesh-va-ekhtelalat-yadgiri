/**
 * آزمون رفتاری منطق خالص پروندهٔ دانش‌آموز — ۱.۲۷.۸۲ (sdt159: بستن testing-002)
 * الگوی front-updater: import مستقیم ماژول وانیل + اجرای واقعی توابع خالص.
 */
import { describe, it, expect } from 'vitest';
// @ts-ignore — ماژول وانیل فرانت خارج از tsconfig است
import { normalizePhoneValue, pickActiveLinkCode, relationLabel, TIMELINE_PHASE_META } from '../../public/assets/js/views/student-profile.js';

describe('منطق خالص پروندهٔ دانش‌آموز (student-profile.js — behavioral)', () => {
  it('normalizePhoneValue — ارقام فارسی/عربی به لاتین، حذف هر جداکننده، حفظ + بین‌المللی', () => {
    expect(normalizePhoneValue('۰۹۱۲-۳۴۵ ۶۷۸۹')).toBe('09123456789');
    expect(normalizePhoneValue('+98 912 345 6789')).toBe('+989123456789');
    expect(normalizePhoneValue('tel: ۰۹۱۲/۳۴۵۶۷۸۹')).toBe('09123456789');
    expect(normalizePhoneValue('')).toBe('');
    expect(normalizePhoneValue(null)).toBe('');
    expect(normalizePhoneValue(undefined)).toBe('');
  });

  it('pickActiveLinkCode — اولویت قراردادی: pending > linked > نخستین > null', () => {
    const mk = (code: string, status: string) => ({ code, status });
    expect(pickActiveLinkCode([mk('L', 'linked'), mk('P', 'pending')])).toBe('P');
    expect(pickActiveLinkCode([mk('L1', 'linked'), mk('L2', 'linked')])).toBe('L1');
    expect(pickActiveLinkCode([mk('R', 'revoked'), mk('X', 'expired')])).toBe('R');
    expect(pickActiveLinkCode([])).toBeNull();
  });

  it('relationLabel — نگاشت فارسی + fallback هویت‌ساز', () => {
    expect(relationLabel('father')).toBe('پدر');
    expect(relationLabel('mother')).toBe('مادر');
    expect(relationLabel('other')).toBe('سایر');
    expect(relationLabel('guardian')).toBe('guardian'); // ناشناخته → خود کلید
    expect(relationLabel(undefined)).toBe('—');
  });

  it('TIMELINE_PHASE_META — شش فاز قراردادی خط زمانی با برچسب فارسی', () => {
    const phases = Object.keys(TIMELINE_PHASE_META);
    expect(phases).toEqual(['screening', 'assessment', 'plan', 'treatment', 'review', 'scattered']);
    for (const p of phases) {
      expect(TIMELINE_PHASE_META[p as keyof typeof TIMELINE_PHASE_META].label.length).toBeGreaterThan(0);
      expect(TIMELINE_PHASE_META[p as keyof typeof TIMELINE_PHASE_META].icon.length).toBeGreaterThan(0);
    }
    expect(TIMELINE_PHASE_META.treatment.label).toBe('دورهٔ درمان');
  });
});

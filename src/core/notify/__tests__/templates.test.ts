/**
 * تست‌های واحد — templates
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// تست pure قالب‌های پیام — بدون دیتابیس

import { describe, expect, it } from 'vitest';
import { NOTIFICATION_TEMPLATES } from '@core/shared';
import type { NotificationTemplateId } from '@core/shared';
import { renderTemplate } from '../templates';

describe('notification templates (pure)', () => {
  it('T1: appointment_reminder — شامل نام، تاریخ، ساعت و نام متخصص', () => {
    const text = renderTemplate('appointment_reminder', {
      studentName: 'علی محمدی',
      staffName: 'دکتر علی رضایی',
      dateYmd: '2026-10-12',
      timeLabel: '09:30',
      clinicName: 'مرکز نمونه'
    });
    expect(text).toContain('یادآوری نوبت');
    expect(text).toContain('علی محمدی');
    expect(text).toContain('2026-10-12');
    expect(text).toContain('09:30');
    expect(text).toContain('دکتر علی رضایی');
    expect(text).toContain('مرکز نمونه');
  });

  it('T2: بدون clinicName — نام پیش‌فرض مرکز استفاده می‌شود', () => {
    const text = renderTemplate('appointment_cancelled', { dateYmd: '2026-10-12', timeLabel: '10:00' });
    expect(text).toContain('مرکز جامع');
    expect(text).toContain('لغو نوبت');
  });

  it('T3: appointment_changed — تاریخ و ساعت جدید اعلام می‌شود (شمسی، )', () => {
    const text = renderTemplate('appointment_changed', {
      studentName: 'سارا کریمی',
      dateYmd: '2026-10-13',
      timeLabel: '14:15'
    });
    expect(text).toContain('تغییر زمان نوبت');
    //: تاریخ‌ها شمسی و ارقام فارسی شدند
    expect(text).toContain('۲۱ مهر ۱۴۰۵');
    expect(text).toContain('۱۴:۱۵');
  });

  it('T4: bot_welcome و bot_help — ورود خودکار و دستور /link در راهنما هست', () => {
    const welcome = renderTemplate('bot_welcome');
    expect(welcome).toContain('کد ملی');           //: ورود خودکار روش اول است
    expect(renderTemplate('bot_help')).toContain('/link CODE');
    expect(renderTemplate('bot_help')).toContain('/myid');
    expect(renderTemplate('bot_help')).toContain('نوبت‌های من');
  });

  it('T5: bot_link_success با نام دانش‌آموز / bot_link_invalid / bot_myid', () => {
    const ok = renderTemplate('bot_link_success', { studentName: 'حسین رضایی' });
    expect(ok).toContain('✅');
    expect(ok).toContain('حسین رضایی');

    expect(renderTemplate('bot_link_invalid')).toContain('معتبر نیست');

    const myid = renderTemplate('bot_myid', { chatId: '987654' });
    expect(myid).toContain('987654');
  });

  it('T6: generic — با extra همان متن، بدون extra متن fallback', () => {
    expect(renderTemplate('generic', { extra: 'سلام تست' })).toBe('سلام تست');
    expect(renderTemplate('generic')).not.toBe('');
  });

  it('T7: exhaustiveness — همه idهای ثابت بدون خطا متن غیرخالی می‌دهند', () => {
    for (const id of NOTIFICATION_TEMPLATES) {
      const text = renderTemplate(id as NotificationTemplateId, { studentName: 'x' });
      expect(text.length, `template ${id} must render`).toBeGreaterThan(3);
    }
  });
});

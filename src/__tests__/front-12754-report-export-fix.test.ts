/**
 * گیت ۱.۲۷.۵۴ — رفع باگ «دکمهٔ خروجی نسخه‌دار کار نمی‌کند».
 * علت: برای پرونده‌های بدون مسیر مداخله (اکثر پرونده‌های واقعی)، دکمه فقط یک toast بن‌بست می‌داد.
 * رفع: مودال پیش‌نیازِ اکشن‌دار (رفتن به تفسیر بالینی با دیپ‌لینک tab=clinical).
 * بازتولید واقعی با مرورگر روی سرور محلی انجام شد (فلوی کامل صدور ۱۴۰۵-۰۰۰۱ هم سبز بود).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('رفع باگ دکمهٔ خروجی — حالت خالی اکشن‌دار', () => {
  const view = read('public/assets/js/views/student-profile.js');

  it('بن‌بست toast حذف شد؛ مودال پیش‌نیاز با مسیر اقدام جایگزین است', () => {
    expect(view).not.toContain('مسیر مداخله‌ای ثبت نشده');
    expect(view).toContain('پیش‌نیاز گزارش: مسیر مداخله');
    expect(view).toContain("'رفتن به تفسیر بالینی'");
  });

  it('اقدام = دیپ‌لینک تب تفسیر بالینی، نه دستور بی‌مقصد', () => {
    expect(view).toContain("location.hash = `#/students/${id}?tab=clinical`");
  });

  it('شکل پاسخ فهرست مسیرها گارد شده است (data ?? [] و Array.isArray)', () => {
    expect(view).toContain('paths = (await api.get(`/api/students/${id}/clinical-paths`)).data ?? []');
    expect(view).toContain('if (!Array.isArray(paths) || paths.length === 0)');
  });
});

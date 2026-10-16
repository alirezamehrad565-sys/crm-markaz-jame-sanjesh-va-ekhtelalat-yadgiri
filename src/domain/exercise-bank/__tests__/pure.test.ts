/**
 * تست‌های واحد — pure
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// pure.test.ts — منطق خالص بانک تمرین

import { describe, it, expect } from 'vitest';
import {
  normalizeExerciseTitle,
  estimateBase64Bytes,
  stripDataUrlPrefix,
  isAllowedExerciseMimeType,
  sanitizeFilename,
  validateExerciseFileInput,
  clampPage,
  pageWindow,
  truncateLabel
} from '../pure';

describe('نرمال‌سازی و فایل', () => {
  it('عنوان: فاصله‌های تکراری فروکاستن می‌شود', () => {
    expect(normalizeExerciseTitle('  تمرین   حروف  ')).toBe('تمرین حروف');
  });

  it('sanitizeFilename مسیر را حذف می‌کند', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('C:\\temp\\کاربرگ ریاضی.pdf')).toBe('کاربرگ ریاضی.pdf');
  });

  it('MIME مجاز: سند/تصویر/HTML بله — اجرایی خیر', () => {
    expect(isAllowedExerciseMimeType('application/pdf')).toBe(true);
    expect(isAllowedExerciseMimeType('TEXT/HTML')).toBe(true);
    expect(isAllowedExerciseMimeType('application/zip')).toBe(false);
    expect(isAllowedExerciseMimeType('application/javascript')).toBe(false);
  });

  it('برآورد حجم base64 و حذف پیشوند data-URL', () => {
    expect(estimateBase64Bytes(Buffer.from('abc').toString('base64'))).toBe(3);
    expect(estimateBase64Bytes(stripDataUrlPrefix('data:application/pdf;base64,' + Buffer.from('abc').toString('base64')))).toBe(3);
  });

  it('validateExerciseFileInput: مسیرهای خطای فارسی', () => {
    const b64 = Buffer.from('hello').toString('base64');
    expect(validateExerciseFileInput({ filename: '', mimeType: 'application/pdf', contentB64: b64 })).toEqual({
      ok: false,
      reason: 'نام فایل نامعتبر است'
    });
    expect(validateExerciseFileInput({ filename: 'a.zip', mimeType: 'application/zip', contentB64: b64 })).toEqual({
      ok: false,
      reason: 'این نوع فایل مجاز نیست — فقط سند، تصویر، ویدیو و HTML کاربرگ'
    });
    expect(validateExerciseFileInput({ filename: 'a.pdf', mimeType: 'application/pdf', contentB64: '' })).toEqual({
      ok: false,
      reason: 'محتوای فایل خالی است'
    });
    const big = Buffer.alloc(513 * 1024).toString('base64');
    expect(validateExerciseFileInput({ filename: 'a.pdf', mimeType: 'application/pdf', contentB64: big })).toEqual({
      ok: false,
      reason: 'حجم فایل بیش از ۵۱۲ کیلوبایت است'
    });
    expect(validateExerciseFileInput({ filename: 'w.html', mimeType: 'text/html', contentB64: b64 })).toEqual({ ok: true });
  });
});

describe('صفحه‌بندی و برچسب دکمه', () => {
  it('clampPage صفحهٔ نامعتبر → ۱', () => {
    expect(clampPage(undefined)).toBe(1);
    expect(clampPage(0)).toBe(1);
    expect(clampPage(2.5)).toBe(1);
    expect(clampPage(3)).toBe(3);
  });

  it('pageWindow: صفحات خالی هم نقطه می‌گیرند و hasMore قطعی است', () => {
    const w1 = pageWindow(0, 1, 5);
    expect(w1).toEqual({ page: 1, offset: 0, totalPages: 1, hasMore: false });

    const w2 = pageWindow(12, 3, 5);
    expect(w2).toEqual({ page: 3, offset: 10, totalPages: 3, hasMore: false });

    const w3 = pageWindow(12, 99, 5);
    expect(w3.page).toBe(3);
    expect(w3.hasMore).toBe(false);

    const w4 = pageWindow(12, 1, 5);
    expect(w4.hasMore).toBe(true);
    expect(w4.offset).toBe(0);
  });

  it('truncateLabel با مرز کد یونیکد می‌بُرد (نه نیم‌نویسه)', () => {
    expect(truncateLabel('عنوان کوتاه')).toBe('عنوان کوتاه');
    const long = 'تمرین خیلی طولانی برای دکمهٔ بات که باید کوتاه شود';
    const cut = truncateLabel(long, 20);
    expect(Array.from(cut).length).toBeLessThanOrEqual(20);
    expect(cut.endsWith('…')).toBe(true);
  });
});

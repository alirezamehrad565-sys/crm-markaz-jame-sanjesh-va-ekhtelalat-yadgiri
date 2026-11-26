/**
 * آزمون رفتاری منطق خالص بانک تمرین — ۱.۲۷.۸۲ (sdt159: بستن testing-002)
 * validateLocalFile سه پیام خطای کاربر-رو دارد که قرارداد محصولی‌اند (نه پینِ متن سورس).
 */
import { describe, it, expect } from 'vitest';
// @ts-ignore — ماژول وانیل فرانت خارج از tsconfig است
import { LIMITS, EXT_MIME_FALLBACK, PREVIEW_EXTS, previewable, localMime, validateLocalFile, matchesFilterCore } from '../../public/assets/js/views/exercises.js';

describe('منطق خالص بانک تمرین (exercises.js — behavioral)', () => {
  it('LIMITS — سقف‌های قراردادی بارگذاری', () => {
    expect(LIMITS.maxFileBytes).toBe(50 * 1024 * 1024);
    expect(LIMITS.maxFilesPerUpload).toBe(10);
  });

  it('localMime — mime صریح حاکم است؛ وگرنه جدول fallback پسوند', () => {
    expect(localMime({ name: 'a.mp4', type: 'video/mp4' })).toBe('video/mp4');
    expect(localMime({ name: 'clip.mkv', type: '' })).toBe('video/x-matroska');
    expect(localMime({ name: 'doc.docx', type: 'application/octet-stream' })).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(localMime({ name: 'mystery.xyz', type: '' })).toBe(''); // پسوند ناشناخته → همان type خالی (fallback نهایی فقط برای type ناسازگار است)
    expect(localMime({ name: 'mystery.xyz' })).toBe(''); // بدون فیلد type هم '' می‌ماند (type || '' همیشه رشته است)
  });

  it('validateLocalFile — سه پیام قراردادی کاربر-رو + بازگشت mime نهایی', () => {
    expect(validateLocalFile({ name: 'f.mp4', type: '', size: 123 })).toBe('video/mp4');
    expect(() => validateLocalFile({ name: 'f.xyz', type: '', size: 10 })).toThrow('شناخته نشد');
    expect(() => validateLocalFile({ name: 'f.mp4', type: '', size: LIMITS.maxFileBytes + 1 })).toThrow('بیش از');
    expect(() => validateLocalFile({ name: 'f.mp4', type: 'video/mp4', size: 0 })).toThrow('خالی است');
    expect(() => validateLocalFile({ name: 'f.mp4', type: 'video/mp4', size: 0 })).toThrow(/فایل «f\.mp4»/);
  });

  it('previewable — فقط تصویر/PDF پیش‌نمایش دارد؛ ناشناس با پسوند PREVIEW_EXTS', () => {
    expect(previewable({ mime: 'image/png', filename: 'x.png' })).toBe(true);
    expect(previewable({ mime: 'application/pdf', filename: 'x.pdf' })).toBe(true);
    expect(previewable({ mime: 'application/octet-stream', filename: 'x.webp' })).toBe(true);
    expect(previewable({ mime: '', filename: 'x.jpg' })).toBe(true);
    expect(previewable({ mime: 'application/octet-stream', filename: 'x.exe' })).toBe(false);
    expect(previewable({ mime: 'video/mp4', filename: 'x.mp4' })).toBe(false); // ویدیوی شناخته پیش‌نمایش تصویری ندارد
    expect(previewable({ mime: '', filename: 'x.xyz' })).toBe(false);
  });

  it('matchesFilterCore — آینهٔ قرارداد فیلتر سرور: نوع/انتشار/جستجوی نرمال‌شدهٔ فارسی', () => {
    const ex = { format: 'homework', published: true, title: 'بیبی', description: 'تمرین گفتاری' };
    expect(matchesFilterCore(ex, 'homework', 'all', '')).toBe(true);
    expect(matchesFilterCore(ex, 'worksheet', 'all', '')).toBe(false);   // نوع ناهمخوان
    expect(matchesFilterCore(ex, '', 'true', '')).toBe(true);            // منتشرشده می‌گذرد
    expect(matchesFilterCore(ex, '', 'false', '')).toBe(false);          // پیش‌نویس می‌خواست
    expect(matchesFilterCore(ex, '', 'all', 'بیبی')).toBe(true);
    // ی عربی/فارسی هم‌ارزند — آینهٔ faNormalize سرور (۱.۲۷.۷۸-B2)
    expect(matchesFilterCore(ex, '', 'all', 'بيبي')).toBe(true);
    expect(matchesFilterCore(ex, '', 'all', 'گفتار')).toBe(true);        // هٔ/ا نرمال
    expect(matchesFilterCore(ex, '', 'all', 'وجود ندارد')).toBe(false);
    // توصیف هم در بادَه جستجوست
    expect(matchesFilterCore({ format: 'homework', published: true, title: 'x', description: 'تمرین گفتاری' }, '', 'all', 'گفتاری')).toBe(true);
  });

  it('PREVIEW_EXTS و EXT_MIME_FALLBACK — جدول‌های قراردادی سلف‌هاست', () => {
    expect(PREVIEW_EXTS).toEqual(['png', 'jpg', 'jpeg', 'webp', 'gif', 'pdf']);
    expect(EXT_MIME_FALLBACK.pdf).toBe('application/pdf');
    expect(EXT_MIME_FALLBACK.xlsx).toContain('spreadsheetml');
  });
});

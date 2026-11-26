/**
 * واحد ۱.۲۷.۷۷ (sdt154) — fa-search: تنها منبع نرمال‌سازی فارسی جستجو (موج B3 پیام ۱۶).
 * قواعد: ي/ى عربی→ی، ك→ک، أ/إ/آ→ا، ة→ه، حذف نیم‌فاصله، ارقام→لاتین، فشردن فاصله،
 * بی‌اثرسازی wildcard های LIKE در sanitizeFaQuery، و قرارداد زنجیرهٔ REPLACE در faHaystackExpr.
 */
import { describe, it, expect } from 'vitest';
import { faNormalize, sanitizeFaQuery, likePattern, faHaystackExpr, toLatinDigits } from '../fa-search';

describe('faNormalize', () => {
  it('ی/ک عربی → فارسی', () => {
    expect(faNormalize('علي')).toBe('علی');
    expect(faNormalize('رضايي')).toBe('رضایی');
    expect(faNormalize('محمدي')).toBe('محمدی');
    expect(faNormalize('كبري')).toBe('کبری');
  });

  it('همزه‌ها و ة → او/ه', () => {
    expect(faNormalize('أحمد')).toBe('احمد');
    expect(faNormalize('إبراهيم')).toBe('ابراهیم');
    expect(faNormalize('آمنه')).toBe('امنه');
    expect(faNormalize('فاطمة')).toBe('فاطمه');
  });

  it('نیم‌فاصله حذف می‌شود و فاصله‌ها فشرده می‌شوند', () => {
    expect(faNormalize('می‌رنا')).toBe('میرنا');
    expect(faNormalize('علی    رضایی')).toBe('علی رضایی');
  });

  it('اعراب/شدّه از سؤال حذف می‌شود', () => {
    expect(faNormalize('عَلي')).toBe('علی');
    expect(faNormalize('رضّایی')).toBe('رضایی');
    expect(faNormalize('مُحًممَد')).toBe('محممد'); // هر ترکیبی از اعراب
  });

  it('ارقام فارسی/عربی → لاتین', () => {
    expect(faNormalize('۴۵۶')).toBe('456');
    expect(toLatinDigits('٤٥٦')).toBe('456');
  });

  it('undefined/null امن است', () => {
    expect(faNormalize(undefined as unknown as string)).toBe('');
  });
});

describe('sanitizeFaQuery', () => {
  it('wildcard های LIKE بی‌اثر می‌شوند', () => {
    expect(sanitizeFaQuery('علی%')).toBe('علی');
    expect(sanitizeFaQuery('ا_ا')).toBe('ا ا');
  });

  it('نرمال فارسی + فشردن فاصله', () => {
    expect(sanitizeFaQuery('  عَلي   رضايي  ')).toBe('علی رضایی');
  });
});

describe('likePattern / faHaystackExpr', () => {
  it('الگوی LIKE محصور است', () => {
    expect(likePattern('علی')).toBe('%علی%');
  });

  it('زنجیرهٔ REPLACE همهٔ قواعد را روی ستون اعمال می‌کند و NULL-امن است', () => {
    const expr = faHaystackExpr('s.first_name');
    expect(expr).toContain("REPLACE(s.first_name, 'ي', 'ی')");
    expect(expr).toContain("'ى'");
    expect(expr).toContain("'ك'");
    expect(expr).toContain("'أ'");
    expect(expr).toContain("'إ'");
    expect(expr).toContain("'آ'");
    expect(expr).toContain("'ة'");
    expect(expr).toContain('\u200c'); // نیم‌فاصله واقعی داخل SQL literal
  });
});

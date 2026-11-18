/**
 * ۱.۲۵.۸۱ — گیت سقف آیتم قالب‌ها + بخش‌بندی مشترک فرم خانواده
 * خواست کارفرما: «یکی از همکار‌ها می‌خواد تو فرم‌ها و پرسشنامه‌ها پرسشنامه طراحی کنه،
 * پرسشنامه‌ش ۱۰۰ ایتمه ولی محدودیت پرسشنامه ۴۵ ایتمه — اینو درست کن».
 * ① سقف ۴۵ → ۱۲۰: پرسش‌نامهٔ ۱۰۰ ایتمی هم به schema می‌گذرد هم validateTypeDefinition
 *   (۱۲۰ حاشیهٔ رشد — CBCL ۱۱۳، Connor ۱۰۰ — و زیر محدودیت اندازهٔ D1).
 * ② پیام ردشدن فارسی و روشن (نه پیام پیش‌فرض انگلیسی zod).
 * ③ familySectionsOf: بخش‌بندی مشترک فرم واقعی و پیش‌نمایش — گروه‌بندی زیرمقیاس،
 *   حذف سربرگ/متن آزاد از شمارش، یکتایی قاعده «پیش‌نمایش = عین فرم خانواده».
 */
import { describe, it, expect } from 'vitest';
import { CaseEventTypeInputSchema, validateTypeDefinition, FIELDS_MAX } from '@domain/case-events/pure';
import { familySectionsOf } from '@domain/case-events/public-form';

function scaleDefinition(n: number) {
  return {
    title: 'پرسش‌نامهٔ آزمایشی سقف آیتم',
    category: 'checklist',
    icon: null,
    familyFillable: true,
    fields: Array.from({ length: n }, (_, i) => ({
      key: `it_${i}`,
      label: `آیتم شمارهٔ ${i + 1}`,
      type: 'scale' as const,
      scaleMax: 3
    })),
    bands: [
      { max: 7, label: 'مطلوب', color: 'ok' as const, advice: null },
      { max: n * 3, label: 'نیاز به پیگیری', color: 'warn' as const, advice: null }
    ],
    subscales: null,
    tags: null,
    audience: 'family' as const,
    description: null
  };
}

describe('سقف آیتم قالب فرم‌ساز (۱.۲۵.۸۱ — خواست کارفرما)', () => {
  it('ثابت سقف = ۱۲۰ — کلاس گزارش همکار (۱۰۰ ایتمی) با حاشیهٔ رشد بسته می‌شود', () => {
    expect(FIELDS_MAX).toBe(120);
    expect(FIELDS_MAX).toBeGreaterThanOrEqual(100);
  });

  it('پرسش‌نامهٔ ۱۰۰ ایتمی به schema می‌گذرد — همان سناریوی همکار', () => {
    const parsed = CaseEventTypeInputSchema.safeParse(scaleDefinition(100));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.fields).toHaveLength(100);
  });

  it('پرسش‌نامهٔ ۱۰۰ ایتمی از validateTypeDefinition هم می‌گذرد — عین مسیر ذخیره', () => {
    const def = scaleDefinition(100);
    expect(() => validateTypeDefinition({
      category: def.category,
      fields: def.fields,
      bands: def.bands,
      familyFillable: def.familyFillable,
      subscales: def.subscales
    })).not.toThrow();
  });

  it('۱۲۱ آیتم رد می‌شود — با پیام فارسی روشن، نه خطای خام zod', () => {
    const parsed = CaseEventTypeInputSchema.safeParse(scaleDefinition(121));
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? '';
      expect(msg).toContain('حداکثر');
      expect(msg).toContain('۱۲۰');
    }
  });
});

describe('familySectionsOf — بخش‌بندی مشترک فرم واقعی و پیش‌نمایش', () => {
  const fields = [
    { key: 'h1', label: 'سربرگ بخش', type: 'heading' },
    { key: 'a1', label: 'آیتم اول', type: 'scale', scaleMax: 3, subscaleId: 'sub_em', hint: 'مثال' },
    { key: 'a2', label: 'آیتم دوم', type: 'scale', scaleMax: 3, subscaleId: 'sub_em' },
    { key: 'b1', label: 'آیتم زیرمقیاس دیگر', type: 'scale', scaleMax: 3, subscaleId: 'sub_soc' },
    { key: 'f1', label: 'متن آزاد اختیاری', type: 'longtext' },
    { key: 's1', label: 'انتخاب ساده', type: 'select', options: ['کم', 'زیاد'] }
  ];
  const subscales = [
    { id: 'sub_em', name: 'هیجانی' },
    { id: 'sub_soc', name: 'اجتماعی' }
  ];

  it('آیتم‌های هم‌زیرمقیاس یک بخش می‌شوند و تغییر زیرمقیاس بخش تازه می‌سازد', () => {
    const sections = familySectionsOf(fields, subscales);
    expect(sections.map((s) => s.title)).toEqual(['هیجانی', 'اجتماعی', null]);
    expect(sections[0].items.map((i) => i.key)).toEqual(['a1', 'a2']);
    expect(sections[1].items.map((i) => i.key)).toEqual(['b1']);
    expect(sections[2].items.map((i) => i.key)).toEqual(['f1']); // select به گیرنده نمی‌رسد (فقط scale/single/longtext)
  });

  it('سربرگ از فرم خانواده حذف می‌شود؛ teacherLabel برای فرم معلم عبور می‌کند', () => {
    const sections = familySectionsOf(fields, subscales);
    const allKeys = sections.flatMap((s) => s.items.map((i) => i.key));
    expect(allKeys).not.toContain('h1');
    const withTeacher = familySectionsOf([
      { key: 't1', label: 'گویه خانواده', type: 'scale', scaleMax: 3, teacherLabel: 'گویه معلم' }
    ], null);
    expect(withTeacher[0].items[0].teacherLabel).toBe('گویه معلم');
  });

  it('بدون زیرمقیاس همهٔ آیتم‌های قابل نمایش یک بخش بی‌عنوان می‌شوند', () => {
    const sections = familySectionsOf(fields, null);
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBeNull();
    expect(sections[0].items).toHaveLength(4); // a1,a2,b1,f1 — سربرگ و select حذف
  });
});

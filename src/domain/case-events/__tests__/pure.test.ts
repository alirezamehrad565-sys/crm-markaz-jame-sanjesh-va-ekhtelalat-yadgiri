/**
 * تست‌های واحد — pure
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// pure.test.ts — اعتبارسنجی خالص رویدادهای پرونده
// buildEventPayload (الزامی/select/number/scale/سقف متن)، analyzeChecklist (امتیاز/باند)
// و validateTypeDefinition (قواعد فرم‌ساز)

import { describe, it, expect } from 'vitest';
import {
  analyzeChecklist,
  buildEventPayload,
  buildSummary,
  itemMaxScore,
  itemScoreOf,
  packageComponentsOf,
  resolveBand,
  validateTypeDefinition
} from '../pure';
import type { CaseEventBand, CaseEventField } from '../types';
import { ValidationError } from '@core/errors';

const FIELDS: CaseEventField[] = [
  { key: 'source', label: 'منبع اطلاعات', type: 'select', options: ['مادر', 'پدر'], required: true },
  { key: 'note', label: 'توضیح', type: 'longtext' },
  { key: 'count', label: 'تعداد', type: 'number' },
  { key: 'part', label: 'مشارکت', type: 'scale', scaleMax: 5 }
];

const BANDS: CaseEventBand[] = [
  { max: 8, label: 'مطلوب' },
  { max: 16, label: 'توجه' },
  { max: 24, label: 'جدی' }
];

describe('buildEventPayload', () => {
  it('الزامی خالی → خطا؛ اختیاری خالی حذف؛ select خارج از گزینه → خطا', () => {
    expect(() => buildEventPayload(FIELDS, { source: '' })).toThrow(/الزامی/);
    expect(() => buildEventPayload(FIELDS, { source: 'خاله' })).toThrow(/گزینه‌های مجاز/);
    const payload = buildEventPayload(FIELDS, { source: 'مادر', note: '', count: null });
    expect(payload.source.value).toBe('مادر');
    expect(payload.note).toBeUndefined();
    expect(payload.count).toBeUndefined();
  });

  it('number و scale — عدد فارسی، سقف نمره، متن غیرعدد', () => {
    const ok = buildEventPayload(FIELDS, { source: 'پدر', count: '۱۲', part: 4 });
    expect(ok.count.value).toBe('12');
    expect(ok.part.value).toBe('4');
    expect(() => buildEventPayload(FIELDS, { source: 'پدر', part: 6 })).toThrow(/بین ۰ تا ۵/);
    expect(() => buildEventPayload(FIELDS, { source: 'پدر', count: 'abc' })).toThrow(/عدد/);
  });

  it('سقف متن کوتاه/بلند', () => {
    expect(() => buildEventPayload(FIELDS, { source: 'مادر', note: 'x'.repeat(2001) })).toThrow(/۲۰۰۰/);
    const long = buildEventPayload(FIELDS, { source: 'مادر', note: 'y'.repeat(1500) });
    expect(long.note.value).toHaveLength(1500);
  });

  it('buildSummary — معنادارترین متن ≥۱۰ نویسه + خلاصهٔ تحلیل', () => {
    const summary = buildSummary(buildEventPayload(FIELDS, { source: 'مادر', note: 'تأخیر در تکلم کودک مشاهده شد.' }), null);
    expect(summary).toContain('تأخیر در تکلم');
    const an = analyzeChecklist(FIELDS.filter((f) => f.type === 'scale'), BANDS, { part: 4 });
    const anSummary = buildSummary(null, an);
    expect(anSummary).toContain('امتیاز: ۴ از ۵');
  });
});

describe('analyzeChecklist و باندها', () => {
  const ITEMS: CaseEventField[] = Array.from({ length: 8 }, (_, i) => ({ key: `i${i + 1}`, label: `آیتم ${i + 1}`, type: 'scale', scaleMax: 3 }));

  it('جمع نمره + باند درست', () => {
    const values = { i1: 3, i2: 2, i3: 1, i4: 0, i5: 3, i6: 2, i7: 1, i8: 0 };
    const an = analyzeChecklist(ITEMS, BANDS, values);
    expect(an.score).toBe(12);
    expect(an.answered).toBe(8);
    expect(an.total).toBe(8);
    expect(an.band).toBe('توجه');
    expect(resolveBand(8, BANDS)).toBe('مطلوب');
    expect(resolveBand(24, BANDS)).toBe('جدی');
    expect(resolveBand(99, BANDS)).toBe('جدی'); // بالاتر از سقف آخر → آخرین باند
    expect(resolveBand(5, null)).toBeNull();
  });

  it('نمرهٔ خارج از سقف → خطا؛ آیتم بی‌پاسخ answered کمتر', () => {
    expect(() => analyzeChecklist(ITEMS, BANDS, { i1: 4 })).toThrow(/آیتم 1/);
    const partial = analyzeChecklist(ITEMS, BANDS, { i1: 1, i2: 2 });
    expect(partial.answered).toBe(2);
    expect(partial.score).toBe(3);
  });
});

describe('validateTypeDefinition (فرم‌ساز)', () => {
  it('کلید تکراری / select تک‌گزینه / گزینه در نوع غیرselect / چک‌لیست غیرنمره‌ای', () => {
    expect(() => validateTypeDefinition({
      category: 'session',
      fields: [
        { key: 'a', label: 'الف', type: 'text' },
        { key: 'a', label: 'ب', type: 'text' }
      ]
    })).toThrow(/تکراری/);

    expect(() => validateTypeDefinition({
      category: 'session',
      fields: [{ key: 's', label: 'انتخاب', type: 'select', options: ['یکی'] }]
    })).toThrow(/دو گزینه/);

    expect(() => validateTypeDefinition({
      category: 'session',
      fields: [{ key: 't', label: 'متن', type: 'text', options: ['a', 'b'] }]
    })).toThrow(/select نیست/);

    expect(() => validateTypeDefinition({
      category: 'checklist',
      fields: [{ key: 't', label: 'متن', type: 'text' }]
    })).toThrow(/نمره‌ای/);

    expect(() => validateTypeDefinition({
      category: 'note',
      fields: [{ key: 't', label: 'متن', type: 'text' }],
      familyFillable: true
    })).toThrow(/چک‌لیست/);
  });

  it('تعریف درست رد نمی‌شود + باند ناقص رد می‌شود', () => {
    const items: CaseEventField[] = [
      { key: 'i1', label: 'یکی', type: 'scale', scaleMax: 3 },
      { key: 'i2', label: 'دو', type: 'scale', scaleMax: 3 }
    ];
    expect(() => validateTypeDefinition({ category: 'checklist', fields: items, familyFillable: true, bands: [{ max: 3, label: 'مطلوب' }] }))
      .toThrow(/حداکثر نمرهٔ ممکن/);
    expect(() => validateTypeDefinition({ category: 'checklist', fields: items, familyFillable: true, bands: [{ max: 3, label: 'مطلوب' }, { max: 6, label: 'جدی' }] }))
      .not.toThrow();
  });
});

// ───────── زبان روایی: heading + scaleLabels ─────────

describe('سربرگ بخش (heading) و لنگرهای کلامی (scaleLabels)', () => {
  it('heading در فرم جلسه مجاز است و در payload/جمع نمره ظاهر نمی‌شود', () => {
    const fields: CaseEventField[] = [
      { key: 'sec1', label: 'بخش ۱ — مشکل به زبان شما', type: 'heading' },
      { key: 'chief', label: 'مشکل را بگویید', type: 'longtext', required: true },
      { key: 'sec2', label: 'بخش ۲ — سلامت', type: 'heading' }
    ];
    expect(() => validateTypeDefinition({ category: 'session', fields })).not.toThrow();

    const payload = buildEventPayload(fields, { sec1: 'نباید بیاید', chief: 'تأخیر در تکلم', sec2: 'نباید بیاید' });
    expect(payload['sec1']).toBeUndefined();
    expect(payload['sec2']).toBeUndefined();
    expect(payload['chief']?.value).toBe('تأخیر در تکلم');
  });

  it('heading در چک‌لیست رد می‌شود (چک‌لیست فقط آیتم نمره‌دار)', () => {
    expect(() => validateTypeDefinition({
      category: 'checklist',
      fields: [
        { key: 'h', label: 'سربرگ', type: 'heading' },
        { key: 'i1', label: 'آیتم', type: 'scale', scaleMax: 2 }
      ]
    })).toThrow(/نمره‌ای/);
  });

  it('scaleLabels باید دقیقاً scaleMax+1 برچسب داشته باشد', () => {
    const ok: CaseEventField[] = [
      { key: 'i1', label: 'آیتم', type: 'scale', scaleMax: 2, scaleLabels: ['آشکار نیست', 'کم و گاهی', 'آشکار و مکرر'] }
    ];
    expect(() => validateTypeDefinition({ category: 'checklist', fields: ok, familyFillable: true })).not.toThrow();

    const bad: CaseEventField[] = [
      { key: 'i1', label: 'آیتم', type: 'scale', scaleMax: 2, scaleLabels: ['فقط دو تا', 'کمتر از لازم'] }
    ];
    expect(() => validateTypeDefinition({ category: 'checklist', fields: bad, familyFillable: true }))
      .toThrow(/برچسب‌های نمره/);
  });

  it('نمره‌گذاری آیتم دارای scaleLabels بدون تغییر می‌ماند (عدد ذخیره می‌شود)', () => {
    const f: CaseEventField = { key: 's1', label: 'آیتم', type: 'scale', scaleMax: 3, scaleLabels: ['اصلاً', 'کمی', 'خیلی', 'خیلی زیاد'] };
    expect(itemScoreOf(f, 2)).toBe(2);
    expect(itemMaxScore(f)).toBe(3);
  });
});

describe('پکیج فرم جامع خانواده (T5) — قرارداد رزولوشن کامپوننت‌ها', () => {
  it('packageComponentsOf: فقط کلید پکیج کامپوننت‌ها را به‌ترتیب می‌دهد؛ بقیه null', () => {
    expect(packageComponentsOf('ce-comp-family-v2')).toEqual([
      'ce-snap-iv-p-v1', 'ce-sdq-p-v1', 'ce-scared-p-v1', 'ce-id-adapt-v1'
    ]);
    expect(packageComponentsOf('ce-snap-iv-p-v1')).toBeNull();
    expect(packageComponentsOf('sdq-parent')).toBeNull();
    expect(packageComponentsOf(null)).toBeNull();
    expect(packageComponentsOf(undefined)).toBeNull();
    expect(packageComponentsOf('')).toBeNull();
  });

  const ctxFields: CaseEventField[] = [
    { key: 'pkg_sec', label: 'زمینهٔ خانواده', type: 'heading' },
    { key: 'filled_by', label: 'این فرم را چه کسی پر می‌کند؟', type: 'select', options: ['مادر', 'پدر'], required: true },
    { key: 'main_concern', label: 'دغدغهٔ امروز', type: 'text' }
  ];

  it('شاخهٔ packageComponents: پکیج درست رد نمی‌شود', () => {
    expect(() =>
      validateTypeDefinition({
        category: 'session',
        fields: ctxFields,
        familyFillable: true,
        packageComponents: ['ce-snap-iv-p-v1', 'ce-sdq-p-v1']
      })
    ).not.toThrow();
  });

  it('پکیج بدون خانواده‌پذیری / با باند / با زیرمقیاس / با آیتم نمره‌دار / با کامپوننت تکراری رد می‌شود', () => {
    expect(() =>
      validateTypeDefinition({ category: 'session', fields: ctxFields, familyFillable: false, packageComponents: ['ce-sdq-p-v1'] })
    ).toThrow(/خانواده/);
    expect(() =>
      validateTypeDefinition({ category: 'session', fields: ctxFields, familyFillable: true, bands: [{ max: 10, label: 'x' }], packageComponents: ['ce-sdq-p-v1'] })
    ).toThrow(/باند/);
    expect(() =>
      validateTypeDefinition({
        category: 'session', fields: ctxFields, familyFillable: true,
        subscales: [{ id: 'x', name: 'زیرمقیاس' }], packageComponents: ['ce-sdq-p-v1']
      })
    ).toThrow(/زیرمقیاس/);
    expect(() =>
      validateTypeDefinition({
        category: 'session', familyFillable: true, packageComponents: ['ce-sdq-p-v1'],
        fields: [{ key: 'scored', label: 'آیتم نمره‌دار', type: 'scale', scaleMax: 2 }]
      })
    ).toThrow(/نمره‌دار/);
    expect(() =>
      validateTypeDefinition({ category: 'session', fields: ctxFields, familyFillable: true, packageComponents: ['ce-sdq-p-v1', 'ce-sdq-p-v1'] })
    ).toThrow(/تکراری/);
    expect(() =>
      validateTypeDefinition({ category: 'session', fields: ctxFields, familyFillable: true, packageComponents: [] })
    ).toThrow(/چک‌لیست/); // کامپوننت خالی → شاخهٔ عادی جلسه (خانواده‌پذیر جلسه ممنوع)
  });

  it('تعریف فرم‌های تکی بدون packageComponents — رفتار امروز دست‌نخورده (بدون شاخهٔ پکیج)', () => {
    // جلسهٔ خانواده‌پذیر بدون اعلام پکیج همان‌طور که قبل رد می‌شود
    expect(() =>
      validateTypeDefinition({ category: 'session', fields: ctxFields, familyFillable: true })
    ).toThrow(/چک‌لیست/);
  });
});

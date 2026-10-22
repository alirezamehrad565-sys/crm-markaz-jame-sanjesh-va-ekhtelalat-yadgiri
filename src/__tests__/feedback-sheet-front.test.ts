// الگوی format-front.test.ts — فایل public/assets/js خارج از include تایپ‌اسکریپت است؛ import با @ts-ignore.

// @ts-ignore — فایل.js فرانت، خارج از include تایپ‌اسکریپت است
import { buildFeedbackSheet, feedbackSheetTextOf } from '../../public/assets/js/feedback-sheet.js';

const STUDENT = { firstName: 'آوا', lastName: 'کریمی' };

const FORMULATION = {
  constructs: [
    { key: 'attention_exec', level: 'قابل‌توجه' },
    { key: 'academic_learning', level: 'مرزی' },
    { key: 'internalizing', level: 'هم‌گرای-بالا' },
    { key: 'language_comm', level: 'پایین' },
    { key: 'motor_coord', level: 'پایین' },
    { key: 'unknown_future_key', level: 'قابل‌توجه' }
  ]
};

const PLAN = {
  planType: 'جامع',
  items: [
    { toolKey: 'ce-snap-iv-p-v1', priority: 'core', reasonFa: 'نشانهٔ هم‌بودی توجه (شرح‌حال) — چک‌لیست توجه خانواده (§۳.۱).', hypothesisKeys: ['r5'] },
    { toolKey: 'ce-sld-read-v1', priority: 'core', reasonFa: 'نگرانی خواندن در شرح‌حال (§۴).', hypothesisKeys: ['r2'] },
    { toolKey: 'ce-scared-p-v1', priority: 'recommended', reasonFa: 'پیشنهاد تکمیلی (§۶).', hypothesisKeys: ['r7'] },
    { toolKey: 'ce-unknown-tool-v9', priority: 'core', reasonFa: 'ابزار ناشناخته (§۹).', hypothesisKeys: ['r9'] }
  ]
};

describe('buildFeedbackSheet — سازندهٔ خالص برگهٔ بازخورد (T9/m152)', () => {
  it('سربرگ — مرکز، نام دانش‌آموز و تاریخ پاس‌شده؛ بدون وابستگی به Date', () => {
    const sheet = buildFeedbackSheet({ student: STUDENT, formulation: FORMULATION, plan: PLAN, todayLabel: 'شنبه ۱۴ مهر ۱۴۰۴' });
    expect(sheet.center).toBe('مرکز جامع سنجش و آموزش');
    expect(sheet.title).toBe('برگهٔ بازخورد خانواده');
    expect(sheet.studentName).toBe('آوا کریمی');
    expect(sheet.dateLabel).toBe('شنبه ۱۴ مهر ۱۴۰۴');
    expect(sheet.sections.map((s: any) => s.key)).toEqual(['strengths', 'findings', 'steps', 'home']);
  });

  it('نقاط قوت — فقط سازه‌های «پایین»؛ نبودِ آن‌ها → خط خنثی راهنما', () => {
    const sheet = buildFeedbackSheet({ student: STUDENT, formulation: FORMULATION, plan: PLAN, todayLabel: '—' });
    const strengths = sheet.sections.find((s: any) => s.key === 'strengths')!;
    expect(strengths.items.map((i: any) => i.text)).toEqual([
      'زبان و توانایی بیان او در وضعیت مطلوبی است.',
      'مهارت‌های حرکتی و هماهنگی او خوب است.'
    ]);

    const empty = buildFeedbackSheet({
      student: STUDENT,
      formulation: { constructs: [{ key: 'attention_exec', level: 'قابل‌توجه' }] },
      plan: PLAN,
      todayLabel: '—'
    });
    const fallback = empty.sections.find((s: any) => s.key === 'strengths')!;
    expect(fallback.items).toHaveLength(1);
    expect(fallback.items[0].muted).toBe(true);
    expect(fallback.items[0].text).toContain('نقطهٔ قوت خاصی ثبت نشده');
  });

  it('آنچه دیده شد — نگاشت کلیدهای شناخته‌شده به جملهٔ ساده + سطح والدپسند؛ کلید ناشناخته حذف می‌شود', () => {
    const sheet = buildFeedbackSheet({ student: STUDENT, formulation: FORMULATION, plan: PLAN, todayLabel: '—' });
    const findings = sheet.sections.find((s: any) => s.key === 'findings')!;
    const texts = findings.items.map((i: any) => i.text);
    expect(texts.some((t: any) => t.includes('تمرکز و پیگیری کارها') && t.includes('نیاز به توجه و کمک بیشتر دارد'))).toBe(true);
    expect(texts.some((t: any) => t.includes('یادگیری مهارت‌های درسی') && t.includes('کمی نیاز به توجه دارد'))).toBe(true);
    expect(texts.some((t: any) => t.includes('نگرانی یا غم') && t.includes('به‌روشنی به توجه و کمک بیشتر نیاز دارد'))).toBe(true);
    expect(texts.some((t: any) => t.includes('ناشناخته'))).toBe(false);
    expect(texts.some((t: any) => t.includes('زبان و توانایی بیان'))).toBe(false);
  });

  it('گام‌های بعدی — فقط core شناخته‌شده با دلیل ساده‌شده (بدون §)؛ حداکثر ۴؛ نبود پلن → خط خنثی', () => {
    const sheet = buildFeedbackSheet({ student: STUDENT, formulation: FORMULATION, plan: PLAN, todayLabel: '—' });
    const steps = sheet.sections.find((s: any) => s.key === 'steps')!;
    const texts = steps.items.map((i: any) => i.text);
    expect(texts).toEqual([
      'پرسش‌نامهٔ توجه و بی‌قراری (خانواده) — نشانهٔ هم‌بودی توجه (شرح‌حال) — چک‌لیست توجه خانواده',
      'چک‌لیست مهارت خواندن — نگرانی خواندن در شرح‌حال'
    ]);

    const noPlan = buildFeedbackSheet({ student: STUDENT, formulation: FORMULATION, plan: null, todayLabel: '—' });
    const fallback = noPlan.sections.find((s: any) => s.key === 'steps')!;
    expect(fallback.items[0].text).toContain('جلسهٔ بعد');
  });

  it('توصیه‌های خانه — پنج توصیهٔ ثابت عملی', () => {
    const sheet = buildFeedbackSheet({ student: STUDENT, formulation: FORMULATION, plan: PLAN, todayLabel: '—' });
    const home = sheet.sections.find((s: any) => s.key === 'home')!;
    expect(home.items).toHaveLength(5);
    expect(home.items.map((i: any) => i.text).join(' ')).toContain('خواب کافی');
  });

  it('formulation خالی/بدون سازه — هرگز نمی‌شکند و فال‌بک‌های خنثی می‌آیند', () => {
    const sheet = buildFeedbackSheet({ student: STUDENT, formulation: null, plan: null, todayLabel: '—' });
    expect(sheet.sections.every((s: any) => s.items.length > 0)).toBe(true);
    const empty = buildFeedbackSheet({ student: STUDENT, formulation: { constructs: [] }, plan: { items: [] }, todayLabel: '—' });
    expect(empty.sections.every((s: any) => s.items.length > 0)).toBe(true);
  });

  it('قطعی — دو فراخوانی با ورودی یکسان خروجی عمیقاً یکسان می‌دهد', () => {
    const a = buildFeedbackSheet({ student: STUDENT, formulation: FORMULATION, plan: PLAN, todayLabel: 'ت' });
    const b = buildFeedbackSheet({ student: STUDENT, formulation: FORMULATION, plan: PLAN, todayLabel: 'ت' });
    expect(a).toEqual(b);
  });

  it('متن ساده — سربرگ و هر چهار بخش را دارد (برای کپی)', () => {
    const text = feedbackSheetTextOf(buildFeedbackSheet({ student: STUDENT, formulation: FORMULATION, plan: PLAN, todayLabel: 'ت' }));
    expect(text).toContain('مرکز جامع سنجش و آموزش');
    expect(text).toContain('برگهٔ بازخورد خانواده');
    for (const title of ['نقاط قوت کودک', 'آنچه در ارزیابی دیده شد', 'گام‌های بعدی', 'توصیه‌های خانه']) {
      expect(text).toContain(title);
    }
    expect(text).not.toContain('§');
  });
});

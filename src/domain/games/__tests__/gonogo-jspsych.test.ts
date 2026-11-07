// آزمون‌های اقتباس jsPsych-timelines/go-nogo (MIT) — ۱.۲۵.۳۴
// تمرین تعاملی «تا موفقیت» + خلاصهٔ پایان + نگاشت stimulus_duration — خالص و بدون DOM
import { describe, it, expect } from 'vitest';
import {
  GO_NOGO_TEXT,
  PRACTICE_LIMITS,
  practiceLimitOf,
  practiceOutcome,
  debriefMarkup,
  stimSvg
} from '../../../../public/assets/play/kinds/gonogo.js';
import { stimulusHideMsFor, windowMsFor } from '../../../../public/assets/play/engine/machine.js';
import { STAGE_VISUALS } from '../stages';
import { FORBIDDEN_TEXT_PATTERNS } from '../pure';

/** همهٔ متن‌های ممکن ماژول — برای لینت واژه‌های ممنوع */
function allTextOutputs(): string[] {
  const out: string[] = [];
  for (const v of Object.values(GO_NOGO_TEXT)) {
    if (typeof v === 'string') out.push(v);
    else if (typeof v === 'function') {
      for (const arg of ['ماهی نارنجی', 87, 0.7, 2, 12]) out.push(String(v(arg as never)));
    }
  }
  return out;
}

describe('تمرین تعاملی — آینهٔ حلقهٔ retry بستهٔ jsPsych', () => {
  it('practiceOutcome با on_finish بستهٔ jsPsych هم‌ارز است: گو=لمس موفق، نوگو=بازداری موفق', () => {
    expect(practiceOutcome('go', true)).toBe('success');
    expect(practiceOutcome('go', false)).toBe('retry');
    expect(practiceOutcome('nogo', false)).toBe('success');
    expect(practiceOutcome('nogo', true)).toBe('retry');
  });

  it('practiceLimitOf: پیش‌فرض‌های بستهٔ jsPsych (۱۰s گو / ۳s نوگو) و بسته‌بندی امن', () => {
    expect(PRACTICE_LIMITS.go_ms).toBe(10000);
    expect(PRACTICE_LIMITS.nogo_ms).toBe(3000);
    expect(practiceLimitOf('go', null as unknown as number)).toBe(10000);
    expect(practiceLimitOf('nogo', undefined as unknown as number)).toBe(3000);
    expect(practiceLimitOf('go', 5000)).toBe(5000);
    // بیرون بازهٔ امن → پیش‌فرض نوع‌بازی
    expect(practiceLimitOf('go', 100)).toBe(10000);
    expect(practiceLimitOf('nogo', 999999)).toBe(3000);
    expect(practiceLimitOf('nogo', 500)).toBe(3000);
  });
});

describe('متن‌های فارسی — الگوی text_object بستهٔ jsPsych', () => {
  it('همهٔ متن‌ها غیرتهی و فارسی‌اند — هیچ انگلیسی روبه‌کودک نیست', () => {
    for (const t of allTextOutputs()) {
      expect(t.trim().length).toBeGreaterThan(0);
      expect(t, `متن غیرفارسی: ${t}`).toMatch(/[\u0600-\u06FF]/);
    }
  });

  it('هیچ واژهٔ ممنوعی در متن‌های روبه‌کودک نیست — لینت مشترک بسته‌ها', () => {
    for (const w of FORBIDDEN_TEXT_PATTERNS) {
      for (const t of allTextOutputs()) {
        expect(t.includes(w), `واژهٔ ممنوع «${w}» در: ${t}`).toBe(false);
      }
    }
  });
});

describe('خلاصهٔ پایان (debrief) — نگاشت createDebrief با قاعدهٔ دامنهٔ صفر', () => {
  it('جلسهٔ خالی یا بی‌آزمون نمره‌خورده = هیچ کارتی — عدد ساختگی ممنوع', () => {
    expect(debriefMarkup(null, null)).toBe('');
    expect(debriefMarkup({}, null)).toBe('');
    expect(debriefMarkup({ scored_total: 0, scored_correct: 0 }, null)).toBe('');
  });

  it('دقت = نمرهٔ سرور (فقط train) بر کل نمره‌خورده — اعداد فارسی', () => {
    const html = debriefMarkup({ scored_total: 10, scored_correct: 8, median_rt: 654 }, null);
    expect(html).toContain('play-debrief');
    expect(html).toContain('٪'); // ٪۸۰
    expect(html).toContain('۸۰');
    expect(html).toContain('۰٫۷ ثانیه'); // Math.round(654/100)/10
    expect(html).not.toMatch(/[0-9]/); // هیچ رقم لاتین در خروجی
  });

  it('بدون median_rt معتبر فقط خط دقت می‌آید — بی‌خط ثانیه', () => {
    const html = debriefMarkup({ scored_total: 6, scored_correct: 5 }, null);
    expect(html).toContain('دقت');
    expect(html).not.toContain('ثانیه');
  });

  it('تعداد تلاش‌های تمرین فقط اگر بزرگ‌تر از صفر باشد می‌آید', () => {
    const s = { scored_total: 6, scored_correct: 6 };
    expect(debriefMarkup(s, { go_retries: 0, nogo_retries: 0 })).not.toContain('تمرین');
    expect(debriefMarkup(s, { go_retries: 2, nogo_retries: 1 })).toContain('۳ بار');
  });
});

describe('مدت نمایش محرک — نگاشت stimulus_duration بستهٔ jsPsych', () => {
  const base = { params: { response_window_go_ms: 1500 } };

  it('پیش‌فرض null = نمایش تا پاسخ/پایان پنجره — رفتار امروز دست‌نخورده', () => {
    expect(stimulusHideMsFor({}, null)).toBeNull();
    expect(stimulusHideMsFor({}, base)).toBeNull();
    expect(stimulusHideMsFor({}, { params: { ...base.params, stimulus_duration_ms: 600 } })).toBe(600);
  });

  it('مقدار بیرون بازهٔ امن (زیر ۱۵۰ یا دروازهٔ پنجره) → سقوط امن به نمایش کامل', () => {
    expect(stimulusHideMsFor({}, { params: { ...base.params, stimulus_duration_ms: 100 } })).toBeNull();
    expect(stimulusHideMsFor({}, { params: { ...base.params, stimulus_duration_ms: 1460 } })).toBeNull(); // > 1500-50
    expect(stimulusHideMsFor({}, { params: { ...base.params, stimulus_duration_ms: 1450 } })).toBe(1450); // == w-50 مجاز
    expect(stimulusHideMsFor({}, { params: { ...base.params, stimulus_duration_ms: 5900 } })).toBeNull(); // > پنجرهٔ override
  });

  it('override پنجرهٔ آیتم هم ملاک سقف است — همان قرارداد windowMsFor', () => {
    const item = { stim: { window_ms: 2000 } };
    expect(windowMsFor(item, base)).toBe(2000);
    expect(stimulusHideMsFor(item, { params: { ...base.params, stimulus_duration_ms: 1950 } })).toBe(1950);
    expect(stimulusHideMsFor(item, { params: { ...base.params, stimulus_duration_ms: 1980 } })).toBeNull();
  });
});

describe('هویت ماهی و خرچنگ — محرک‌های وکتور موجود دست‌نخورده', () => {
  it('امضای مرحلهٔ اول: گو=ماهی نارنجی، نوگو=خرچنگ آبی — از سرور، نه کلاینت', () => {
    expect(STAGE_VISUALS.s1.go.shape).toBe('fish');
    expect(STAGE_VISUALS.s1.go.color).toBe('orange');
    expect(STAGE_VISUALS.s1.nogo.shape).toBe('crab');
    expect(STAGE_VISUALS.s1.nogo.color).toBe('blue');
  });

  it('وکتور ماهی و خرچنگ همان مسیرهای درون‌کد قبلی‌اند — svg بدون دارایی خارجی', () => {
    const fish = stimSvg({ shape: 'fish', color: 'orange' });
    const crab = stimSvg({ shape: 'crab', color: 'blue' });
    expect(fish).toContain('<svg');
    expect(crab).toContain('<svg');
    expect(fish).toContain('M14 60'); // مسیر ماهی قدیمی
    expect(crab).toContain('M28 52'); // مسیر خرچنگ قدیمی
  });
});

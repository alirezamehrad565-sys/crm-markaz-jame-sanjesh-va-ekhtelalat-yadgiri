// تست واحد محاسبات خالص پراپ پیشروی: ملاک تسلط ۸۰٪ دوجلسه‌ای، شیب OLS هم‌ارز با گزارش پیشرفت،
// داوری نسبی روند و ارزیابی کامل سری — همه بدون دیتابیس.
import { describe, it, expect } from 'vitest';
import {
  PATH_PROBE_DEFAULT_THRESHOLD,
  PATH_PROBE_MASTERY_STREAK,
  olsSlopeOf,
  masteryOf,
  probeVerdictOf,
  evaluateProbeSeries
} from '../progress';
import type { ProbePointLike } from '../progress';

function seriesOf(values: number[], startIso = '2025-01-01T09:00:00.000Z', stepMs = 86400000): ProbePointLike[] {
  return values.map((value, i) => ({ value, takenAt: new Date(Date.parse(startIso) + i * stepMs).toISOString() }));
}

// کپیِ فرمول مرجع progress-report.js برای آزمون هم‌ارزی شیب (باندل فرانت، منبع واحد فرمول)
function progressReportOls(ys: number[]): number {
  const n = ys.length;
  if (n < 2) return 0;
  const mx = (n - 1) / 2;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let numr = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    numr += (i - mx) * (ys[i] - my);
    den += (i - mx) * (i - mx);
  }
  return den ? numr / den : 0;
}

describe('ملاک تسلط پراپ (۸۰٪ در دو جلسهٔ پیاپی)', () => {
  it('سری خالی → بدون تسلط، دنبالهٔ صفر، sinceAt تهی', () => {
    const m = masteryOf([]);
    expect(m.achieved).toBe(false);
    expect(m.streak).toBe(0);
    expect(m.sinceAt).toBeNull();
    expect(m.threshold).toBe(80);
  });

  it('تک‌پراپِ ۸۵ → دنبالهٔ ۱ ولی تسلط تأیید نمی‌شود (دو جلسه لازم است)', () => {
    const m = masteryOf(seriesOf([85]));
    expect(m.streak).toBe(1);
    expect(m.achieved).toBe(false);
    expect(m.sinceAt).toBeNull();
  });

  it('دو پراپ پیاپیِ ۸۰/۸۲ → تسلط تأیید با sinceAt = پراپ اول زوج', () => {
    const s = seriesOf([80, 82]);
    const m = masteryOf(s);
    expect(m.achieved).toBe(true);
    expect(m.streak).toBe(2);
    expect(m.sinceAt).toBe(s[0].takenAt);
  });

  it('سه پراپ پیاپیِ ≥ملاک → sinceAt = پراپ دوم (تسلط از همان‌جا کامل شده)', () => {
    const s = seriesOf([80, 84, 90]);
    const m = masteryOf(s);
    expect(m.achieved).toBe(true);
    expect(m.streak).toBe(3);
    expect(m.sinceAt).toBe(s[1].takenAt);
  });

  it('غیرپیاپی: ۸۰، ۷۰، ۸۰ → دنبالهٔ انتهایی فقط ۱ است و تسلط تأیید نمی‌شود', () => {
    const m = masteryOf(seriesOf([80, 70, 80]));
    expect(m.streak).toBe(1);
    expect(m.achieved).toBe(false);
    expect(m.sinceAt).toBeNull();
  });

  it('۸۲ سپس ۷۰ → دنبالهٔ انتهایی صفر است (دنباله از آخر سری می‌شمارد، نه بیشترین دنبالهٔ تاریخی)', () => {
    const m = masteryOf(seriesOf([82, 70]));
    expect(m.streak).toBe(0);
    expect(m.achieved).toBe(false);
  });

  it('مرز ملاک: مقدار دقیقاً برابر ۸۰ حساب می‌شود (شرط ≥)', () => {
    const s = seriesOf([79, 80, 80]);
    const m = masteryOf(s);
    expect(s[1].value).toBe(80);
    // اگر شرط «بزرگ‌ترِ اکید» بود، دو ۸۰ حساب نمی‌شد و تسلط تأیید نمی‌گشت
    expect(m.achieved).toBe(true);
    expect(m.sinceAt).toBe(s[1].takenAt);
  });

  it('ملاک سفارشی ۶۰: سری ۵۵/۶۱/۶۲ که با ۸۰ تسلط نبود، با ۶۰ تسلط می‌شود', () => {
    const s = seriesOf([55, 61, 62]);
    expect(masteryOf(s).achieved).toBe(false); // ملاک پیش‌فرض ۸۰
    const m = masteryOf(s, 60);
    expect(m.achieved).toBe(true);
    expect(m.sinceAt).toBe(s[1].takenAt); // اولین عضو آخرین زوجِ ≥۶۰
  });

  it('تعداد پیاپی سفارشی: با streakNeeded=۳، دو پراپِ ≥ملاک کافی نیست', () => {
    const m = masteryOf(seriesOf([80, 82]), 80, 3);
    expect(m.streak).toBe(2);
    expect(m.achieved).toBe(false);
  });

  it('ثابت‌های دکترین: ملاک پیش‌فرض ۸۰ و دو جلسهٔ پیاپی', () => {
    expect(PATH_PROBE_DEFAULT_THRESHOLD).toBe(80);
    expect(PATH_PROBE_MASTERY_STREAK).toBe(2);
  });
});

describe('شیب OLS هم‌ارز با progress-report.js', () => {
  it('سری خالی و تک‌عضوی → شیب صفر (n<2 بی‌معناست)', () => {
    expect(olsSlopeOf([])).toBe(0);
    expect(olsSlopeOf([42])).toBe(0);
  });

  it('سری خطی ۱۰/۲۰/۳۰ → شیب دقیقاً ۱۰ در هر گام', () => {
    expect(olsSlopeOf([10, 20, 30])).toBeCloseTo(10, 12);
  });

  it('هم‌ارزی عددی با فرمول مرجع گزارش پیشرفت روی سری واقع‌نما', () => {
    const ys = [45, 52, 60, 68, 75, 82, 84];
    expect(olsSlopeOf(ys)).toBeCloseTo(progressReportOls(ys), 12);
    const ys2 = [90, 88, 91, 60, 77];
    expect(olsSlopeOf(ys2)).toBeCloseTo(progressReportOls(ys2), 12);
  });
});

describe('داوری روند نسبی به دامنه', () => {
  it('شش کلید داوری با برش‌های ±۲/±۵ درصدِ دامنه', () => {
    // دامنهٔ ۱۰۰ — rel = slope
    expect(probeVerdictOf(6, 100, 3).key).toBe('improving');
    expect(probeVerdictOf(3, 100, 3).key).toBe('gradual');
    expect(probeVerdictOf(0, 100, 3).key).toBe('plateau');
    expect(probeVerdictOf(-3, 100, 3).key).toBe('slight_decline');
    expect(probeVerdictOf(-6, 100, 3).key).toBe('regressed');
    expect(probeVerdictOf(0, 100, 1).key).toBe('insufficient');
  });

  it('همان شیب با دامنهٔ بزرگ‌تر داوریِ ملایم‌تر می‌گیرد (نسبی‌بودن)', () => {
    const narrow = probeVerdictOf(1, 10, 4); // rel = 10 → بهبود روشن
    const wide = probeVerdictOf(1, 100, 4); // rel = 1 → تقریباً پایدار
    expect(narrow.key).toBe('improving');
    expect(wide.key).toBe('plateau');
  });

  it('برش‌ها نامتقارن‌اند: ۵/۲ هم‌شاملِ حد بالا، پایدار فقط بالاتر از ۲− (دقیقاً ۲− افت خفیف است)', () => {
    expect(probeVerdictOf(5, 100, 2).key).toBe('improving');
    expect(probeVerdictOf(2, 100, 2).key).toBe('gradual');
    // مرز پایین طبق دکترین: پایدار یعنی rel>−2 — پس دقیقاً −2 افت خفیف می‌شود
    expect(probeVerdictOf(-1.9, 100, 2).key).toBe('plateau');
    expect(probeVerdictOf(-2, 100, 2).key).toBe('slight_decline');
    expect(probeVerdictOf(-4.9, 100, 2).key).toBe('slight_decline');
    expect(probeVerdictOf(-5, 100, 2).key).toBe('regressed');
  });
});

describe('ارزیابی کامل سری (evaluateProbeSeries)', () => {
  it('سری صعودی واقعی در ۸۰: بهبود روشن + تسلط از پراپ ششم + آخرین مقدار ۸۴', () => {
    const s = seriesOf([45, 52, 60, 68, 75, 82, 84]);
    const ev = evaluateProbeSeries(s);
    expect(ev.count).toBe(7);
    expect(ev.latestValue).toBe(84);
    expect(ev.slope).toBeGreaterThan(0);
    expect(ev.verdict.key).toBe('improving');
    expect(ev.verdict.good).toBe(1);
    expect(ev.mastery.achieved).toBe(true);
    expect(ev.mastery.sinceAt).toBe(s[5].takenAt); // زوج ۸۲/۸۴
  });

  it('سری تخت → تقریباً پایدار و بدون تسلط', () => {
    const ev = evaluateProbeSeries(seriesOf([50, 50, 50]));
    expect(ev.slope).toBe(0);
    expect(ev.verdict.key).toBe('plateau');
    expect(ev.mastery.achieved).toBe(false);
  });

  it('سری خالی → دادهٔ کافی نیست، بدون آخرین مقدار', () => {
    const ev = evaluateProbeSeries([]);
    expect(ev.count).toBe(0);
    expect(ev.latestValue).toBeNull();
    expect(ev.verdict.key).toBe('insufficient');
    expect(ev.slope).toBe(0);
    expect(ev.mastery.achieved).toBe(false);
  });

  it('ملاک سفارشی به ارزیابی منتقل می‌شود: ۴۵/۵۲ با ملاک ۴۰ تسلط می‌گیرد', () => {
    const ev = evaluateProbeSeries(seriesOf([45, 52]), 40);
    expect(ev.mastery.achieved).toBe(true);
    expect(ev.mastery.threshold).toBe(40);
  });
});

// ─── پایش پیشرفت کامل: قاعدهٔ ۴-نقطه، هشدار سکون، خط هدف ───
import { fourPointRuleOf, stallJudgementOf, goalLineOf, GOAL_LINE_WINDOW_WEEKS } from '../progress';

describe('قاعدهٔ ۴-نقطه (چهار دادهٔ آخر از ۶–۸ دادهٔ نخست)', () => {
  it('کمتر از شش داده → ناکافی', () => {
    expect(fourPointRuleOf(seriesOf([10, 11, 12, 13, 14, 15]).slice(0, 5)).key).toBe('insufficient');
  });

  it('صعود: سه یا چهار نقطهٔ آخر بالای میانهٔ نیمهٔ اول پنجره', () => {
    const rising = fourPointRuleOf(seriesOf([40, 41, 40, 41, 55, 56, 57, 58]));
    expect(rising.key).toBe('rising');
    expect(rising.window).toBe(8);
    expect(rising.above).toBe(4);
  });

  it('نزول: سه یا چهار نقطهٔ آخر پایین میانهٔ نیمهٔ اول', () => {
    const falling = fourPointRuleOf(seriesOf([60, 61, 60, 62, 45, 44, 43, 42]));
    expect(falling.key).toBe('falling');
  });

  it('نامعین: دو بالا و دو پایین پایه', () => {
    const mid = fourPointRuleOf(seriesOf([50, 50, 50, 50, 51, 49, 51, 49]));
    expect(mid.key).toBe('indeterminate');
    expect(mid.above).toBe(2);
  });

  it('پنجره در سری بلند روی ۸ دادهٔ نخست می‌ماند (نه کل سری)', () => {
    const long = fourPointRuleOf(seriesOf([40, 40, 40, 40, 40, 40, 40, 40, 90, 90, 90, 90]));
    expect(long.window).toBe(8);
    expect(long.key).toBe('indeterminate'); // جهش پس از پنجرهٔ ۸تایی ملاک نیست
  });
});

describe('داوری سکون و خط هدف', () => {
  it('سکون: شیب صفر + ۴-نقطه نامعین → پیشنهاد افزایش دوز با سه‌گانهٔ کامل', () => {
    const evalr = evaluateProbeSeries(seriesOf([50, 50, 50, 50, 50, 50, 50, 50])); // کاملاً هموار
    expect(evalr.monitor.fourPoint.key).toBe('indeterminate');
    expect(evalr.verdict.key).toBe('plateau');
    expect(evalr.monitor.stall.key).toBe('dose');
    expect(evalr.monitor.stall.hint).toContain('افزایش دوز');
    expect(evalr.monitor.stall.hint).toContain('تغییر روش');
  });

  it('تسلط برقرار → تصمیم «none»؛ افت روشن → «تغییر روش»', () => {
    const master = evaluateProbeSeries([80, 85, 90].map((v, i) => ({ value: v, takenAt: new Date(Date.parse('2025-01-01T09:00:00.000Z') + i * 86400000).toISOString() })));
    expect(master.monitor.stall.key).toBe('none');
    const regressed = evaluateProbeSeries(seriesOf([60, 58, 55, 50, 45, 40, 35, 30]));
    expect(regressed.monitor.stall.key).toBe('change');
  });

  it('خط هدف: گام هفتگی = (ملاک − پایه)/۶؛ سری کوتاه null', () => {
    const s = seriesOf([40, 46]);
    const gl = goalLineOf(s, 70);
    expect(gl).toEqual({ startAt: s[0].takenAt, startValue: 40, weeklyGain: 5, windowWeeks: GOAL_LINE_WINDOW_WEEKS, criterion: 70 });
    expect(goalLineOf(seriesOf([40]), 70)).toBeNull();
  });
});

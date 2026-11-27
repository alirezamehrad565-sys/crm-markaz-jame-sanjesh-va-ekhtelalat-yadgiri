/**
 * واحد ۱.۲۵.۶۱ — موتور خالص تابلوی نظرسنجی‌ها (survey-insights)
 * ریاضی شاخص‌ها بدون دیتابیس: پنجرهٔ جاری/قبلی، NPS استاندارد (٪مروجان − ٪منتقدان)،
 * برش‌های روند (۷روزه→روزانه، ۳۰/۹۰روزه→۶ برش)، تفکیک فرم، کارنامهٔ درمانگران،
 * دسته‌بندی تماتیک متن‌ها و شمار معلق/مهلت‌گذشته.
 */
import { describe, it, expect } from 'vitest';
import {
  applySurveyStructuredAnalysis, buildSurveyInsights, buildSurveyStructuredInsight,
  classifySurveyNote, surveyConcernLevelOf, surveyStructuredSummaryFa, surveyTrendSlices, SURVEY_NOTE_THEMES
} from '../survey-insights';
import type { CaseEventField, CaseEventSubscale } from '../types';

const NOW = new Date('2026-11-10T09:00:00.000Z');
const DAY = 86_400_000;

const iso = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * DAY).toISOString();

function row(over: Partial<Parameters<typeof buildSurveyInsights>[0][number]> = {}) {
  return {
    id: 'ev-x',
    kind: 'discharge' as const,
    answered: true,
    expired: false,
    createdAt: iso(0),
    staffId: 'st-1',
    staffName: 'درمانگر یک',
    studentName: 'دانش‌آموز',
    center: 80,
    therapist: 60,
    progress: 70,
    nps: 8,
    note: null,
    ...over
  };
}

describe('surveyTrendSlices — قرارداد برش‌ها', () => {
  it('۷ روز روزانه، ۳۰ روز ۵روزه، ۹۰ روز ۱۵روزه — همه ≈ ۶-۷ برش', () => {
    expect(surveyTrendSlices(7)).toEqual({ bucketDays: 1, count: 7 });
    expect(surveyTrendSlices(30)).toEqual({ bucketDays: 5, count: 6 });
    expect(surveyTrendSlices(90)).toEqual({ bucketDays: 15, count: 6 });
  });
});

describe('classifySurveyNote — تم‌ها و نشانهٔ منفی', () => {
  it('نوبت/ساعت/تأخیر → تم نوبت‌دهی + منفی', () => {
    const c = classifySurveyNote('لطفاً ساعت نوبت‌ها را جمع‌تر کنید — تأخیر زیاد بود');
    expect(c.themes).toEqual(['scheduling']);
    expect(c.negative).toBe(true);
  });
  it('متن مثبت بی‌تم، بی‌پرچم', () => {
    const c = classifySurveyNote('همه چیز خوب بود، ممنون از هماهنگی');
    expect(c.themes).toEqual([]);
    expect(c.negative).toBe(false);
  });
  it('چندتم + متن خالی', () => {
    expect(classifySurveyNote('درمانگر مهربان بود ولی هزینه‌ها بالاست').themes.sort()).toEqual(['finance', 'therapist']);
    expect(classifySurveyNote(null)).toEqual({ themes: [], negative: false });
    expect(classifySurveyNote('   ')).toEqual({ themes: [], negative: false });
  });
  it('همهٔ تم‌های تعریف‌شده برچسب یکتا دارند', () => {
    const labels = SURVEY_NOTE_THEMES.map((t) => t.label);
    expect(new Set(labels).size).toBe(SURVEY_NOTE_THEMES.length);
  });
});

describe('buildSurveyInsights — ریاضی تابلو', () => {
  const rows = [
    row({ id: 'a', createdAt: iso(0), center: 100, therapist: 75, progress: 100, nps: 9, staffId: 'st-1', staffName: 'درمانگر یک' }),
    row({ id: 'b', kind: 'progress', createdAt: iso(40), center: 50, therapist: 100, progress: 75, nps: 6, staffId: null, staffName: null }), // دورهٔ قبلِ ۳۰روزه
    row({ id: 'c', kind: 'progress', createdAt: iso(2), answered: false, center: null, therapist: null, progress: null, nps: null, staffId: 'st-2', staffName: 'درمانگر دو' }),
    row({ id: 'd', createdAt: iso(1), answered: false, expired: true, center: null, therapist: null, progress: null, nps: null, staffId: 'st-1', staffName: 'درمانگر یک' }),
    row({ id: 'e', createdAt: iso(3), note: 'نوبت‌ها دیر شروع می‌شد', center: 60, therapist: 50, progress: 40, nps: 3, staffId: 'st-2', staffName: 'درمانگر دو' })
  ];

  it('جاری/قبلی با ریاضی دقیق — NPS شاخص استاندارد', () => {
    const ins = buildSurveyInsights(rows, { days: 30, now: NOW });
    expect(ins.window.days).toBe(30);
    // جاری: a (پاسخ)، c (معلق)، d (مهلت‌گذشته)، e (پاسخ) — b چهل روز پیش است
    expect(ins.current.sent).toBe(4);
    expect(ins.current.filled).toBe(2);
    expect(ins.current.response_rate).toBe(0.5);
    expect(ins.current.center_avg).toBe(80); // (۱۰۰+۶۰)/۲
    expect(ins.current.therapist_avg).toBeCloseTo(62.5, 2);
    expect(ins.current.progress_avg).toBe(70);
    expect(ins.current.nps_avg).toBe(6); // (۹+۳)/۲
    // مروجان: یک (۹) · منتقدان: یک (۳) → شاخص صفر
    expect(ins.current.nps_index).toBe(0);
    // قبلی: فقط b
    expect(ins.previous.sent).toBe(1);
    expect(ins.previous.filled).toBe(1);
    expect(ins.previous.center_avg).toBe(50);
    expect(ins.previous.nps_index).toBe(-100);
  });

  it('تفکیک فرم + کارنامهٔ درمانگران + معلق/مهلت‌گذشته', () => {
    const ins = buildSurveyInsights(rows, { days: 30, now: NOW });
    expect(ins.by_kind.discharge.sent).toBe(3);
    expect(ins.by_kind.discharge.filled).toBe(2);
    expect(ins.by_kind.progress.sent).toBe(1);
    expect(ins.by_kind.progress.filled).toBe(0);
    // درمانگر دو: یک پاسخ (e) + یک معلق (c) — مرتب بر پایهٔ پاسخ‌ها
    const t2 = ins.therapists.find((t) => t.therapist_id === 'st-2')!;
    expect(t2.sent).toBe(2);
    expect(t2.filled).toBe(1);
    expect(t2.response_rate).toBe(0.5);
    expect(t2.therapist_avg).toBe(50);
    expect(t2.nps_avg).toBe(3);
    expect(ins.pending_open).toBe(1); // c
    expect(ins.pending_expired).toBe(1); // d
  });

  it('تم‌ها: «نوبت‌دهی» با یک منفی؛ متن منفی شمرده می‌شود', () => {
    const ins = buildSurveyInsights(rows, { days: 30, now: NOW });
    expect(ins.themes).toEqual([{ id: 'scheduling', label: 'نوبت‌دهی و زمان', count: 1, negative_count: 1 }]);
    expect(ins.notes).toHaveLength(1);
    expect(ins.notes[0].id).toBe('e');
    expect(ins.notes[0].negative).toBe(true);
    expect(ins.notes_negative_count).toBe(1);
  });

  it('روند: ۶ برش؛ برش آخر پاسخ امروز را دارد؛ برش‌های خالی null', () => {
    const ins = buildSurveyInsights(rows, { days: 30, now: NOW });
    expect(ins.trend).toHaveLength(6);
    const last = ins.trend[ins.trend.length - 1];
    expect(last.filled).toBe(2);
    expect(last.center_avg).toBe(80);
    expect(ins.trend[0].sent).toBe(0);
    expect(ins.trend[0].center_avg).toBeNull();
  });

  it('پنجرهٔ ۷روزه: b بیرون می‌ماند و قبلی خالی می‌شود', () => {
    const ins = buildSurveyInsights(rows, { days: 7, now: NOW });
    expect(ins.previous.sent).toBe(0);
    expect(ins.previous.response_rate).toBeNull();
    expect(ins.trend).toHaveLength(7);
  });
});

/* ─── ۱.۲۷.x — تحلیل ساختاری نظرسنجی خانواده ───
   فیکسچر بریده‌شده از ساختار واقعی «فرم ارزیابی عملکرد حسی _فرم خانواده» (t-9fa42a382d):
   آیتم دودویی بله=۱/خیر=۰ با subscaleId، زیرمقیاس‌های excludeFromTotal و بدون باند؛
   یک آیتم مقیاس ۰-۲ با برچسب هم افزوده شده تا مسیر scaleLabels پوشش داده شود */
const SURVEY_SUBS: CaseEventSubscale[] = [
  { id: 'sub_touch', name: 'بخش اول: حس لمس', excludeFromTotal: true, bands: null },
  { id: 'sub_oral', name: 'بخش دوم: حس دهانی', excludeFromTotal: true, bands: null },
  { id: 'sub_vest', name: 'بخش سوم: حس عمقی و وستیبولار', excludeFromTotal: true, bands: null }
];
const YES_NO = [{ label: 'بله', score: 1 }, { label: 'خیر', score: 0 }];
const SURVEY_FIELDS: CaseEventField[] = [
  { key: 't1', label: 'گویه لمس یک', type: 'single', scoredOptions: YES_NO, subscaleId: 'sub_touch' },
  { key: 't2', label: 'گویه لمس دو', type: 'single', scoredOptions: YES_NO, subscaleId: 'sub_touch' },
  { key: 't3', label: 'گویه لمس سه', type: 'single', scoredOptions: YES_NO, subscaleId: 'sub_touch' },
  { key: 'o1', label: 'گویه دهانی یک', type: 'single', scoredOptions: YES_NO, subscaleId: 'sub_oral' },
  { key: 'o2', label: 'گویه دهانی دو', type: 'single', scoredOptions: YES_NO, subscaleId: 'sub_oral' },
  { key: 'v1', label: 'گویه وستیبولار یک', type: 'scale', scaleMax: 2, scaleLabels: ['هرگز', 'گاهی', 'همیشه'], subscaleId: 'sub_vest' },
  { key: 'v2', label: 'گویه وستیبولار دو', type: 'scale', scaleMax: 2, scaleLabels: ['هرگز', 'گاهی', 'همیشه'], subscaleId: 'sub_vest' }
];
/* مقدار خام آیتم «single» = اندیس گزینه در scoredOptions (گزینهٔ صفر همینجا «بله» است) —
   هم‌قرارداد fillByFamily که اندیس را می‌فرستد و itemScoreOf نمرهٔ گزینه را می‌خواند */
const SURVEY_VALUES: Record<string, number> = { t1: 0, t2: 0, t3: 1, o1: 0, o2: 1, v1: 2, v2: 0 };

describe('surveyConcernLevelOf — آستانه‌های توصیفی', () => {
  it('۰-۱۹ کم، ۲۰-۴۹ متوسط، ۵۰ به بالا — صرفاً هیوریستیک نمایشی', () => {
    expect(surveyConcernLevelOf(0)).toBe('low');
    expect(surveyConcernLevelOf(19)).toBe('low');
    expect(surveyConcernLevelOf(20)).toBe('medium');
    expect(surveyConcernLevelOf(49)).toBe('medium');
    expect(surveyConcernLevelOf(50)).toBe('high');
    expect(surveyConcernLevelOf(100)).toBe('high');
  });
});

describe('buildSurveyStructuredInsight — فرم چندحیطه‌ای با زیرمقیاس', () => {
  it('تفکیک حیطه‌ای از زیرمقیاس‌های خود فرم + نرخ نشانه در هر بخش', () => {
    const ins = buildSurveyStructuredInsight(SURVEY_FIELDS, SURVEY_VALUES, SURVEY_SUBS)!;
    expect(ins.grouped_by).toBe('subscale');
    expect(ins.domains.map((d) => d.name)).toEqual(['بخش اول: حس لمس', 'بخش دوم: حس دهانی', 'بخش سوم: حس عمقی و وستیبولار']);
    expect(ins.domains[0]).toMatchObject({ id: 'sub_touch', items: 3, answered: 3, concerning: 2, concern_pct: 67 });
    expect(ins.domains[1]).toMatchObject({ id: 'sub_oral', items: 2, answered: 2, concerning: 1, concern_pct: 50 });
    expect(ins.domains[2]).toMatchObject({ id: 'sub_vest', items: 2, answered: 2, concerning: 1, concern_pct: 50 });
    expect(ins.items).toBe(7);
    expect(ins.answered).toBe(7);
    expect(ins.concerning).toBe(4);
    expect(ins.concern_pct).toBe(57); // ۴/۷ ≈ ۵۷٪
    expect(ins.level).toBe('high');
    expect(ins.level_label).toBe('بالا');
  });

  it('گویه‌های نشانه‌دار: متن گویه + برچسب پاسخ همان که خانواده دیده (بله / برچسب نمرهٔ مقیاس)', () => {
    const ins = buildSurveyStructuredInsight(SURVEY_FIELDS, SURVEY_VALUES, SURVEY_SUBS)!;
    expect(ins.flagged.map((f) => f.key)).toEqual(['t1', 't2', 'o1', 'v1']);
    expect(ins.flagged[0]).toEqual({ key: 't1', question: 'گویه لمس یک', answer: 'بله' });
    expect(ins.flagged[3].answer).toBe('همیشه'); // برچسب نمرهٔ ۲ مقیاس
    expect(ins.flagged.some((f) => f.key === 'v2')).toBe(false); // پاسخ صفر نشانه نیست
  });

  it('تفسیر صریحاً توصیفی و بدون هنجار — بیشترین حیطه‌ها را نام می‌برد', () => {
    const ins = buildSurveyStructuredInsight(SURVEY_FIELDS, SURVEY_VALUES, SURVEY_SUBS)!;
    expect(ins.interpretation).toContain('توصیفی');
    expect(ins.interpretation).toContain('بدون هنجار روان‌سنجی');
    expect(ins.interpretation).toContain('از ۷ آیتمِ پاسخ‌گرفته، ۴ مورد');
    expect(ins.interpretation).toContain('«بخش اول: حس لمس»');
    expect(ins.interpretation).toContain('«بخش دوم: حس دهانی»');
  });
});

describe('buildSurveyStructuredInsight — فرم بدون گروه', () => {
  const fields: CaseEventField[] = [
    { key: 'a', label: 'گویه یک', type: 'single', scoredOptions: YES_NO },
    { key: 'b', label: 'گویه دو', type: 'single', scoredOptions: YES_NO }
  ];
  it('بدون زیرمقیاس و سربرگ → تک‌حیطهٔ «همهٔ آیتم‌ها» با همان ریاضی', () => {
    const ins = buildSurveyStructuredInsight(fields, { a: 0, b: 0 })!;
    expect(ins.grouped_by).toBe('none');
    expect(ins.domains).toHaveLength(1);
    expect(ins.domains[0].name).toBe('همهٔ آیتم‌ها');
    expect(ins.domains[0]).toMatchObject({ items: 2, answered: 2, concerning: 2, concern_pct: 100 });
    expect(ins.concern_pct).toBe(100);
    expect(ins.level).toBe('high');
    expect(ins.interpretation).toContain('بخش‌بندی صریح ندارد');
  });
  it('بخش‌بندی از سربرگ‌های فرم وقتی زیرمقیاس تعریف نشده', () => {
    const withHeadings: CaseEventField[] = [
      { key: 'h1', label: 'بخش خوراک', type: 'heading' },
      { key: 'a', label: 'گویه یک', type: 'single', scoredOptions: YES_NO },
      { key: 'b', label: 'گویه دو', type: 'single', scoredOptions: YES_NO },
      { key: 'h2', label: 'بخش خواب', type: 'heading' },
      { key: 'c', label: 'گویه سه', type: 'single', scoredOptions: YES_NO }
    ];
    const ins = buildSurveyStructuredInsight(withHeadings, { a: 0, b: 1, c: 0 })!;
    expect(ins.grouped_by).toBe('heading');
    expect(ins.domains.map((d) => d.name)).toEqual(['بخش خوراک', 'بخش خواب']);
    expect(ins.domains[0]).toMatchObject({ answered: 2, concerning: 1, concern_pct: 50 });
    expect(ins.domains[1]).toMatchObject({ answered: 1, concerning: 1, concern_pct: 100 });
    expect(ins.flagged).toHaveLength(2);
  });
  it('فرم بدون آیتم نمره‌دار → null (مسیر تحلیل قدیمی دست‌نخورده)', () => {
    const free: CaseEventField[] = [{ key: 'n1', label: 'یادداشت', type: 'longtext' }];
    expect(buildSurveyStructuredInsight(free, {})).toBeNull();
  });
});

describe('applySurveyStructuredAnalysis — الحاق بدون شکستن مسیر قدیمی', () => {
  it('maxScore صفر («نمرهٔ کل: ۰ از ۰») → تفسیر جایگزین می‌شود', () => {
    const legacy = { score: 0, band: null, answered: 7, total: 7, maxScore: 0, subscaleScores: [], interpretation: 'نمرهٔ کل: ۰ از ۰' };
    const ins = buildSurveyStructuredInsight(SURVEY_FIELDS, SURVEY_VALUES, SURVEY_SUBS)!;
    const merged = applySurveyStructuredAnalysis(legacy, ins);
    expect(merged.survey).toBe(ins);
    expect(merged.interpretation).toBe(ins.interpretation);
    expect(merged.interpretation).not.toContain('نمرهٔ کل');
  });
  it('maxScore>0 → پاراگراف توصیفی به انتهای تفسیر موجود اضافه می‌شود (extend نه break)', () => {
    const legacy = { score: 2, band: null, answered: 2, total: 2, maxScore: 2, subscaleScores: [], interpretation: 'نمرهٔ کل: ۲ از ۲' };
    const ins = buildSurveyStructuredInsight(
      [{ key: 'a', label: 'گویه یک', type: 'single', scoredOptions: YES_NO }, { key: 'b', label: 'گویه دو', type: 'single', scoredOptions: YES_NO }],
      { a: 1, b: 0 }
    )!;
    const merged = applySurveyStructuredAnalysis(legacy, ins);
    expect(merged.interpretation?.startsWith('نمرهٔ کل: ۲ از ۲')).toBe(true);
    expect(merged.interpretation).toContain('بدون هنجار روان‌سنجی');
    expect(merged.survey).toBe(ins);
  });
  it('خلاصهٔ تک‌خطی فهرست‌ها: کوتاه، توصیفی و با شمار نشانه‌ها', () => {
    const ins = buildSurveyStructuredInsight(SURVEY_FIELDS, SURVEY_VALUES, SURVEY_SUBS)!;
    const s = surveyStructuredSummaryFa(ins);
    expect(Array.from(s).length).toBeLessThanOrEqual(300);
    expect(s).toContain('تحلیل توصیفی');
    expect(s).toContain('۴ نشانه از ۷ پاسخ');
    expect(s).toContain('سطح کلی: بالا');
  });
});

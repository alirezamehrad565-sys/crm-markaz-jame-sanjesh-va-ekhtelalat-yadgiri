/**
 * واحد ۱.۲۵.۶۱ — موتور خالص تابلوی نظرسنجی‌ها (survey-insights)
 * ریاضی شاخص‌ها بدون دیتابیس: پنجرهٔ جاری/قبلی، NPS استاندارد (٪مروجان − ٪منتقدان)،
 * برش‌های روند (۷روزه→روزانه، ۳۰/۹۰روزه→۶ برش)، تفکیک فرم، کارنامهٔ درمانگران،
 * دسته‌بندی تماتیک متن‌ها و شمار معلق/مهلت‌گذشته.
 */
import { describe, it, expect } from 'vitest';
import {
  buildSurveyInsights, classifySurveyNote, surveyTrendSlices, SURVEY_NOTE_THEMES
} from '../survey-insights';

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

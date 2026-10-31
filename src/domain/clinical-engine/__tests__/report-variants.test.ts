import { describe, it, expect } from 'vitest';
import { buildPathwayReport, parentVariantOf, schoolVariantOf } from '../report';
import type { InterventionPathRecord, PathSessionRecord, PathwayReportSummary } from '../types';

// سه گزارش از یک داده: بالینی (موجود) + والدپسند (زبان ساده) + مدرسه (توصیهٔ اجرایی)
// معیار پذیرش سند: تولید هر سه گزارش بدون بازنویسی دستی و با یک دکمه.

function fakeSummary(over: Partial<PathwayReportSummary> = {}): PathwayReportSummary {
  return {
    sessionsTotal: 4,
    sessionsDone: 3,
    sessionsSkipped: 0,
    sessionsPlanned: 1,
    outcomeCoverage: 1,
    cardsTotal: 12,
    cardsDone: 9,
    cardsDonePct: 75,
    probeCardsPlanned: 3,
    probeCardsDone: 3,
    firstOutcome: 'تمرین واج‌شناسی خوب پیش رفت',
    latestOutcome: 'خواندن واژهٔ تازه روان‌تر شد',
    doneDateFirst: '2026-09-01T09:00:00.000Z',
    doneDateLast: '2026-09-25T09:00:00.000Z',
    ...over
  };
}

function fakePath(): InterventionPathRecord {
  return {
    id: 'p1', studentId: 's1', studentName: 'علی محمدی', targetKey: 'dyslexia', targetTitle: 'نارساخوانی',
    status: 'active', engineHypothesis: null, decision: null, steps: [], exerciseIds: [],
    templateKey: null, templateTitle: null, sessions: [], probeSummary: null,
    reassessAt: null, goal: 'خواندن واژهٔ تازه تا ملاک ۸۰٪', goalBasis: null,
    createdBy: 'staff', createdAt: '2026-09-01T08:00:00.000Z', updatedAt: '2026-09-25T08:00:00.000Z'
  };
}

function fakeMonitoring(over: Record<string, unknown> = {}): ReturnType<typeof import('../report').buildMonitoring> {
  return {
    metric: 'واژه درست در دقیقه', points: 8,
    masteryPct: 75, masteryAchieved: false,
    slopePerSession: 1.2, trendKey: 'gradual', fourPointKey: 'rising',
    decision: 'continue', decisionLabel: 'روند مثبت — ادامه',
    dosePlanned: 4, doseDone: 3, doseAdherencePct: 75, fidelityPct: 100,
    ...over
  } as ReturnType<typeof import('../report').buildMonitoring>;
}

describe('سه گزارش از یک داده ()', () => {
  it('والدپسند: بدون اصطلاح فنی (۴-نقطه/OLS/پراپ) — با درصد هدف و پیشنهاد خانه', () => {
    const v = parentVariantOf(fakePath(), fakeSummary(), fakeMonitoring());
    expect(v.headline).toContain('علی محمدی');
    expect(v.headline).toContain('خانواده');
    const all = v.paragraphs.join(' ') + v.tips.join(' ');
    expect(all).not.toContain('OLS');
    expect(all).not.toContain('۴-نقطه');
    expect(all).toContain('۷۵ درصد هدف'); // ارقام فارسی
    expect(v.tips.length).toBeGreaterThanOrEqual(3);
  });

  it('مدرسه: عملکرد کلاس + توصیه‌های اجرایی متصل به تصمیم پایش و هدف مسیر', () => {
    const v = schoolVariantOf(fakePath(), fakeSummary(), fakeMonitoring(), []);
    expect(v.headline).toContain('مدرسه');
    expect(v.performance.join(' ')).toContain('نارساخوانی');
    expect(v.performance.join(' ')).toContain('۸۰٪'); // هدف SMART روی کارت مسیر
    expect(v.actions.join(' ')).toContain('هفتگی'); // توصیهٔ سنجش کلاسی از تصمیم continue
    expect(v.actions.length).toBeGreaterThanOrEqual(3);
  });

  it('گزارش کامل هر سه واریانت را حمل می‌کند — buildPathwayReport بدون بازنویسی دستی', () => {
    const sessions: PathSessionRecord[] = [{
      id: 'x1', pathwayId: 'p1', ord: 1, title: 'جلسهٔ ۱', plan: null, criterion: '۸۰٪ پراپ',
      outcome: 'پیشرفت خوب', items: [], status: 'done', doneAt: '2026-09-01T10:00:00.000Z',
      note: null, fidelity: { protocol: true, homework: true, parent: true },
      createdBy: 'staff', createdAt: '2026-09-01T08:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z'
    }];
    const rep = buildPathwayReport(fakePath(), sessions, { from: null, to: null });
    expect(rep.parent.paragraphs.length).toBeGreaterThan(0);
    expect(rep.school.actions.length).toBeGreaterThan(0);
    expect(rep.familySummary).toContain('جلسه'); // پاراگراف موجود دست‌نخورده
  });
});

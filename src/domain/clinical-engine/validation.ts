// اعتبارسنجی بیرونی: داشبورد KPI از دادهٔ موجود — هیچ ورودی دستی جدیدی به فرایند روزمره
// اضافه نمی‌شود؛ همهٔ نرخ‌ها از همان مسیرها/جلسات/پراپ‌ها/رویدادهای پرونده محاسبه می‌شوند.
// این فایل هیچ دسترسی به دیتابیس ندارد — سرویس رکوردها را می‌دهد، این‌جا فقط محاسبه است.
import { faDigits } from '@core/shared';
import type { PathDecision, RankedHypothesis } from './types';
import { evaluateProbeSeries } from './progress';

export interface ValidationPathInput {
  id: string;
  studentId: string;
  engineHypothesis: RankedHypothesis | null;
  decision: PathDecision | null;
  reassessAt: string | null;
}

export interface ValidationSessionAgg {
  pathwayId: string;
  lastDoneAt: string | null;
  doneCount: number;
}

export interface ValidationProbeAgg {
  pathwayId: string;
  metric: string;
  values: { value: number; takenAt: string }[];
}

export interface ValidationStudentInput {
  id: string;
  createdAt: string;
  firstResultsAt: string | null; // اولین «گزارش نتایج ارزیابی» تکمیل‌شده (ce-results-v1)
}

export interface KpiShare {
  pct: number | null; // ۰..۱۰۰ — null یعنی مبنایی برای محاسبه نیست
  base: number;       // شمار مبنا
  hit: number;        // شمار برقرار
}

export interface ValidationKpis {
  // ۱ — نرخ هم‌گرایی فرضیهٔ موتور با تصمیم نهایی (مسیرهای تصمیم‌گرفته)
  hypothesisConvergence: KpiShare;
  // ۲ — نرخ پاسخ به مداخله از داوری روند (مسیرهای دارای پراپ)
  interventionResponse: KpiShare;
  // ۳ — نرخ بازنگری به‌موعود (مسیرهای با reassess_at سرآمده)
  reassessOnTime: KpiShare;
  // ۴ — فاصلهٔ شروع تا جمع‌بندی شناسایی (میانهٔ روز — دانش‌آموزان دارای گزارش نتایج)
  startToIdentification: { medianDays: number | null; students: number };
  generatedAt: string;
}

function shareOf(base: number, hit: number): KpiShare {
  return { pct: base > 0 ? Math.round((hit / base) * 100) : null, base, hit };
}

export function computeValidationKpis(
  paths: ValidationPathInput[],
  sessions: ValidationSessionAgg[],
  probes: ValidationProbeAgg[],
  students: ValidationStudentInput[],
  now: Date
): ValidationKpis {
  const sessionByPath = new Map(sessions.map((s) => [s.pathwayId, s]));

  // ۱ — هم‌گرایی فرضیه با تصمیم: از مسیرهای تصمیم‌گرفته (confirm/reject)، سهمی که با
  // اسنپ‌شات فرضیهٔ موتور تأیید شده‌اند — یعنی تصمیم نهایی همان‌جایی ایستاده که شواهد می‌گفت.
  const decided = paths.filter((p) => p.decision && (p.decision.action === 'confirm' || p.decision.action === 'reject'));
  const converged = decided.filter((p) => p.decision!.action === 'confirm' && p.engineHypothesis !== null);
  const hypothesisConvergence = shareOf(decided.length, converged.length);

  // ۲ — پاسخ به مداخله: مسیرهای دارای پراپ که سنجهٔ اصلی‌شان بهبود روشن/تدریجی دارد یا ملاک تسلط برقرار است
  const probesByPath = new Map<string, ValidationProbeAgg[]>();
  for (const pr of probes) {
    const list = probesByPath.get(pr.pathwayId);
    if (list) list.push(pr);
    else probesByPath.set(pr.pathwayId, [pr]);
  }
  const withProbes = paths.filter((p) => (probesByPath.get(p.id) ?? []).length > 0);
  let responding = 0;
  for (const p of withProbes) {
    const groups = probesByPath.get(p.id)!;
    const primary = groups.reduce((a, b) => (b.values.length > a.values.length ? b : a), groups[0]);
    const ev = evaluateProbeSeries(primary.values);
    if (ev.verdict.good === 1 || ev.mastery.achieved) responding += 1;
  }
  const interventionResponse = shareOf(withProbes.length, responding);

  // ۳ — بازنگری به‌موعود: مسیرهایی که موعد بازنگری‌شان گذشته — سهمی که دست‌کم یک جلسهٔ انجام‌شده
  // بعد از موعد دارند (بازنگریِ انجام‌شده در داده)
  const due = paths.filter((p) => p.reassessAt && p.reassessAt <= now.toISOString());
  const onTime = due.filter((p) => {
    const s = sessionByPath.get(p.id);
    return Boolean(s?.lastDoneAt && s.lastDoneAt >= p.reassessAt!);
  });
  const reassessOnTime = shareOf(due.length, onTime.length);

  // ۴ — شروع تا جمع‌بندی شناسایی: فاصلهٔ ساخت پرونده تا اولین «گزارش نتایج» تکمیل‌شده — میانهٔ روز
  const createdAtOf = new Map(students.map((s) => [s.id, s.createdAt]));
  const spans: number[] = [];
  for (const s of students) {
    if (!s.firstResultsAt) continue;
    const start = createdAtOf.get(s.id);
    if (!start) continue;
    const days = (Date.parse(s.firstResultsAt) - Date.parse(start)) / 86400000;
    if (days >= 0) spans.push(days);
  }
  spans.sort((a, b) => a - b);
  const median = spans.length
    ? (spans.length % 2 ? spans[(spans.length - 1) / 2] : (spans[spans.length / 2 - 1] + spans[spans.length / 2]) / 2)
    : null;

  return {
    hypothesisConvergence,
    interventionResponse,
    reassessOnTime,
    startToIdentification: { medianDays: median === null ? null : Math.round(median * 10) / 10, students: spans.length },
    generatedAt: now.toISOString()
  };
}

export function kpiShareFa(k: KpiShare): string {
  return k.pct === null ? '—' : `${faDigits(k.pct)}٪ (${faDigits(k.hit)} از ${faDigits(k.base)})`;
}

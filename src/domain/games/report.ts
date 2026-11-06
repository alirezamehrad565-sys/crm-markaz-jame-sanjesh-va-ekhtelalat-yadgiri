// report.ts — گزارش درمانگر گو/نوگو (فاز ۸ بازطراحی / ۱.۲۵.۱۸)
// دفترچهٔ وظیفه §۸:
//   · خلاصهٔ عملکرد + تحلیل جزئی (بلوک‌ها، RT، پراکندگی، توزیع خطا، دنباله، تایم‌لاین همهٔ آزمون‌ها)
//   · مقایسهٔ جلسه‌ها — سری زمانی هر سنجه
//   · «خام در برابر محاسبه‌شده» جدا — هر دو لایه در خروجی حاضرند و هیچ‌جا مخلوط نمی‌شوند
//   ⚠ هیچ برچسب/تشخیص بالینی خودکار — داده و پرچم کیفیت، تفسیر با درمانگر.

import type { SessionMetricOutcome, SessionValidity } from './types';

export interface ReportRawAttempt {
  item_id: string;
  phase: 'train' | 'probe';
  response: unknown;
  correct: boolean | null;
  rt_ms: number | null;
  rt_valid: boolean;
  created_at: string;
  evidence: Record<string, number | null>;
}

export interface ReportComputedSession {
  session_id: string;
  purpose: string;
  validity: SessionValidity;
  quality_verdict: string;
  started_at: string | null;
  ended_at: string | null;
  summary: unknown | null;   // خروجی scoring.ts (لایهٔ محاسبه‌شده)
  metrics: SessionMetricOutcome[] | null; // سنجه‌های رجیستری
}

export interface ReportSession {
  session_id: string;
  mission_ref: string;
  mission_title: string;
  purpose: string;
  started_at: string | null;
  computed: ReportComputedSession | null;
  raw: {
    attempt_count: number;
    attempts: ReportRawAttempt[];
    sequence: unknown | null; // seed + kinds g/n — بازتولید دنباله ممکن
  };
  adaptive: unknown | null; // تصمیم سازگاری با ورودی‌ها (فقط تمرین)
}

export interface ChildGameReport {
  child_id: string;
  generated_at: string;
  session_count: number;
  sessions: ReportSession[];
  /** مقایسهٔ جلسه‌ها — سری زمانی هر سنجه (قدیمی→جدید) */
  comparison: {
    by_metric: Array<{ metric_id: string; unit: string; points: Array<{ session_id: string; value: number; at: string | null }> }>;
  };
  /** پرچم صریح: این گزارش هیچ تفسیر بالینی تولید نمی‌کند */
  disclaimer: 'no_clinical_conclusion';
}

/** مقایسهٔ جلسه‌ها از سنجه‌های ذخیره‌شده — قدیمی→جدید */
export function buildComparison(
  sessions: Array<{ session_id: string; started_at: string | null; metrics: SessionMetricOutcome[] | null }>
): ChildGameReport['comparison'] {
  const byMetric = new Map<string, { unit: string; points: Array<{ session_id: string; value: number; at: string | null }> }>();
  for (const s of sessions) {
    if (!s.metrics) continue;
    for (const m of s.metrics) {
      const rec = byMetric.get(m.metricId) ?? { unit: m.unit, points: [] };
      rec.points.push({ session_id: s.session_id, value: m.value, at: s.started_at });
      byMetric.set(m.metricId, rec);
    }
  }
  return {
    by_metric: Array.from(byMetric.entries())
      .map(([metric_id, rec]) => ({ metric_id, unit: rec.unit, points: rec.points }))
      .sort((a, b) => (a.metric_id < b.metric_id ? -1 : 1))
  };
}

/** خروجی CSV لایهٔ محاسبه‌شدهٔ گزارش (۱.۲۵.۲۴) — یک ردیف به‌ازای هر جلسه؛
 *  لایهٔ خام (پاسخ‌ها/شواهد) عمداً وارد CSV نمی‌شود — حجم/حریم داده و خوانایی دفترچه؛ BOM برای Excel */
export function reportToCsv(report: ChildGameReport): string {
  const esc = (v: unknown): string => {
    const s = String(v ?? '');
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const num = (v: number | null | undefined): string => (typeof v === 'number' ? String(v) : '');
  type SessionSum = {
    totals?: { total?: number };
    pct?: Record<string, number | null>;
    rt?: { median?: number | null };
    stage?: { title_fa?: string; stars?: number };
  };
  const header = [
    'session_id', 'mission_ref', 'mission_title', 'purpose', 'validity', 'quality_verdict',
    'started_at', 'ended_at', 'total', 'correct_go_pct', 'correct_nogo_pct', 'commission_pct',
    'omission_pct', 'median_rt_ms', 'stage_title', 'stage_stars', 'attempt_count'
  ];
  const lines = [header.join(',')];
  for (const s of report.sessions) {
    const sum = (s.computed?.summary ?? null) as SessionSum | null;
    lines.push([
      s.session_id,
      s.mission_ref,
      s.mission_title ?? '',
      s.purpose,
      s.computed?.validity ?? '',
      s.computed?.quality_verdict ?? '',
      s.started_at ?? '',
      s.computed?.ended_at ?? '',
      num(sum?.totals?.total),
      num(sum?.pct?.correct_go),
      num(sum?.pct?.correct_nogo),
      num(sum?.pct?.commission),
      num(sum?.pct?.omission),
      num(sum?.rt?.median),
      sum?.stage?.title_fa ?? '',
      typeof sum?.stage?.stars === 'number' ? String(sum.stage.stars) : '',
      String(s.raw.attempt_count)
    ].map(esc).join(','));
  }
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

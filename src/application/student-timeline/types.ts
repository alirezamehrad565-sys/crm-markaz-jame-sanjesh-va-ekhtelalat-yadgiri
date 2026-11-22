import type { AuthContext } from '@core/shared';
import type { DbClient } from '@core/db';

export const TIMELINE_KINDS = [
  'student_created',
  'case_status',
  'special_need',
  'tags',
  'waitlist',
  'appointment',
  'appointment_moved',
  'session_note',
  'followup',
  'notification',
  'committee',
  'exercise',
  'clinical_path',
  'case_event',
  'report_export' // موج ۳ — سند خروجی نسخه‌دار از پرونده (طرح C: گزارش در تاریخچه «سند» است نه رویداد)
] as const;

export type TimelineKind = (typeof TIMELINE_KINDS)[number];

export interface TimelineEvent {
  at: string;
  kind: TimelineKind;
  title: string;
  subtitle?: string | null;
  actor?: string | null;
  ref?: { type: string; id: string } | null;
  /* موج ۱ (طرح D §۲) — فصل‌بندی و لحظه‌های کلیدی:
     boundary فقط قرارداد داخلی سرور برای periodizeTimeline است (کلاینت مصرف نمی‌کند)؛
     milestone/milestoneLabel رویدادهای گره‌خورده با تصمیم‌ها (کمیسیون/وضعیت/مسیر/پذیرش/وکسلر)؛
     chapterId پس از فصل‌بندی به هر رویداد می‌چسبد تا کلاینت سرصفهٔ فصل را در جریان بگذارد. */
  boundary?: 'screening' | 'assessment' | 'plan' | 'review';
  milestone?: boolean;
  milestoneLabel?: string;
  chapterId?: string;
  /* موج ۲ — فقط رویدادهای پیگیری: سررسید و باز/بسته برای بج «سررسیده» و صف اکشن‌محور (طرح B/E) */
  dueAt?: string | null;
  open?: boolean;
}

/* موج ۱ — فصل‌های روایت پرونده: قطعی، بدون LLM و بدون ادعای بالینی (فقط آمار-و-نقل) */
export type TimelinePhase = 'screening' | 'assessment' | 'plan' | 'treatment' | 'review' | 'scattered';

export interface TimelineChapterSummary {
  sessions: number;
  attended: number;
  absent: number;
  cancelledSessions: number;
  pendingSessions: number;
  exercisesAssigned: number;
  exercisesSubmitted: number;
  exercisesCorrected: number;
  followupsCreated: number;
  committeeDecisions: number;
  caseEvents: number;
  milestones: number;
}

export interface TimelineChapterTrend {
  attendancePct: number | null;
  scores: Array<{ at: string; pct: number }>;
}

export interface TimelineChapter {
  id: string;
  phase: TimelinePhase;
  run?: number; // شمارهٔ دورهٔ درمان (۱، ۲، …) — فقط برای phase=treatment
  from: string;
  to: string;
  eventCount: number;
  summary: TimelineChapterSummary;
  trend: TimelineChapterTrend;
}

export interface TimelineNextAction {
  type: 'appointment' | 'followup';
  at: string | null;
  title: string;
  id: string;
}

export interface TimelineFilters {
  from?: string;
  to?: string;
  kinds?: TimelineKind[];
  limit?: number;
  offset?: number;
  /* موج ۲ — جست‌وجوی متنی روی title/subtitle/actor (طرح D §۳؛ سرور بلااستفاده بود) */
  q?: string;
}

export interface StudentTimelineDeps {
  db: DbClient;
}

export interface TimelineResult {
  events: TimelineEvent[];
  nextAction: TimelineNextAction | null;
  hasMore: boolean;
  /* موج ۱ — فصل‌های کل خط زمانی (مستقل از صفحه‌سازی؛ سرور کل ردیف‌ها را می‌خواند).
     اختیاری تا مصرف‌کنندهٔ کهنه نشکند. */
  chapters?: TimelineChapter[];
}

export interface StudentTimelineService {
  list(studentId: string, filters: TimelineFilters, actor: AuthContext): Promise<TimelineResult>;
}

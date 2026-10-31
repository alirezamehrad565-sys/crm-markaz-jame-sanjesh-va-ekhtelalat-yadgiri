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
  'case_event'
] as const;

export type TimelineKind = (typeof TIMELINE_KINDS)[number];

export interface TimelineEvent {
  at: string;
  kind: TimelineKind;
  title: string;
  subtitle?: string | null;
  actor?: string | null;
  ref?: { type: string; id: string } | null;
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
}

export interface StudentTimelineDeps {
  db: DbClient;
}

export interface TimelineResult {
  events: TimelineEvent[];
  nextAction: TimelineNextAction | null;
  hasMore: boolean;
}

export interface StudentTimelineService {
  list(studentId: string, filters: TimelineFilters, actor: AuthContext): Promise<TimelineResult>;
}

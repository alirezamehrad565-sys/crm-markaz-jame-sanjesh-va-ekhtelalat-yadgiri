import type { AuthContext } from '@core/shared';
import type { DbClient } from '@core/db';
import type { Logger } from '@core/logger';
import type { SpecialNeedSeverity, SpecialNeedType, StudentCaseStatus } from '@core/shared';

export const ATTENTION_REASONS = [
  'overdue_followup',
  'long_open_followup',
  'awaiting_assessment',
  'no_recent_session'
] as const;

export type AttentionReason = (typeof ATTENTION_REASONS)[number];

export interface OpenFollowUpRef {
  id: string;
  dueAt: string | null;
  createdAt: string;
}

export interface AttentionInput {
  caseStatus: StudentCaseStatus | null;
  waitStatus: 'waiting' | 'admitted' | null;
  lastSessionAt: string | null;
  nextSessionAt: string | null;
  openFollowups: readonly OpenFollowUpRef[];
}

export interface AttentionStudent {
  id: string;
  firstName: string;
  lastName: string;
  grade: string | null;
  schoolId: string | null;
  schoolName: string | null;
  classId: string | null;
  className: string | null;
  specialNeedType: SpecialNeedType | null;
  specialNeedSeverity: SpecialNeedSeverity | null;
  caseStatus: StudentCaseStatus | null;
  reasons: AttentionReason[];
}

export interface GridCell {
  total: number;
  special: number;
  attention: number;
  bySeverity: Partial<Record<SpecialNeedSeverity, number>>;
}

export interface SchoolGridRow {
  schoolId: string | null;
  schoolName: string | null;
  kind: string | null;
  cells: Record<string, GridCell>;
  totals: GridCell;
}

export interface SpecialNeedsGrid {
  generatedAt: string;
  grades: string[];
  schools: SchoolGridRow[];
  overall: GridCell & { byType: Partial<Record<SpecialNeedType, number>> };
  attention: AttentionStudent[];
}

export interface GridFilters {
  schoolId?: string;
  grade?: string;
  severity?: SpecialNeedSeverity;
}

export interface SchoolOverview {
  school: { id: string; name: string; kind: string; active: boolean };
  metrics: {
    studentsActive: number;
    admitted: number;
    waiting: number;
    classesActive: number;
    classesWithTeacher: number;
    classesBotLinked: number;
    sessionsLast30: number;
    sessionsPrev30: number;
    specialNeeds: number;
    attention: number;
  };
  attention: AttentionStudent[];
}

export interface SpecialNeedsDeps {
  db: DbClient;
  logger: Logger;
}

export interface SpecialNeedsService {
  grid(filters: GridFilters, actor: AuthContext): Promise<SpecialNeedsGrid>;
  schoolOverview(schoolId: string, actor: AuthContext): Promise<SchoolOverview>;
}

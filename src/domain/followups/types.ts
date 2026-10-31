import type { AuthContext, FollowUp, FollowUpGroup, FollowUpStatus } from '@core/shared';
import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';

export interface NewFollowUpInput {
  entityType: string;
  entityId: string;
  studentId?: string | null;
  title: string;
  assigneeId: string;
  dueAt?: string | null;
}

export interface UpdateFollowUpInput {
  status?: FollowUpStatus;
  assigneeId?: string;
  dueAt?: string | null;
}

export interface FollowUpListFilters {
  mine?: boolean;
  assigneeId?: string;
  group?: FollowUpGroup | 'all';
  entityType?: string;
  entityId?: string;
  studentId?: string;
}

export interface FollowUpDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
}

export interface FollowUpsService {
  list(filters: FollowUpListFilters, actor: AuthContext): Promise<FollowUp[]>;
  getById(id: string): Promise<FollowUp | null>;
  create(input: NewFollowUpInput, actor: AuthContext): Promise<FollowUp>;
  update(id: string, patch: UpdateFollowUpInput, actor: AuthContext): Promise<FollowUp>;
  createWithinTx(tx: DbClient, input: NewFollowUpInput, actor: AuthContext): Promise<FollowUp>;
}

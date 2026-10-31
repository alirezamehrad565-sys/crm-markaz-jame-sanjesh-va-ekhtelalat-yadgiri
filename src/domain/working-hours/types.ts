import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { AuthContext } from '@core/shared';
import type { HourRange } from './rules';

export interface WorkingHour extends HourRange {
  id: string;
  staffId: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkingHoursDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
}

export interface WorkingHoursService {
  listForStaff(staffId: string): Promise<WorkingHour[]>;
  listAll(): Promise<WorkingHour[]>;
  add(staffId: string, range: HourRange, actor: AuthContext): Promise<WorkingHour>;
  replaceWeek(staffId: string, items: HourRange[], actor: AuthContext): Promise<WorkingHour[]>;
  remove(id: string, actor: AuthContext): Promise<void>;
}

export type { HourRange };

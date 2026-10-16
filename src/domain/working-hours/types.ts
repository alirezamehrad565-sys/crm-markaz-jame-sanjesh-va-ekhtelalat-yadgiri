/**
 * ماژول ساعات کاری — تایپ‌های ماژول
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// Public types of the working-hours module — owner of the `working_hours` table

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
  /** All ranges of one staff member (all weekdays) */
  listForStaff(staffId: string): Promise<WorkingHour[]>;
  /** All ranges of all staff — for week-grid overlays */
  listAll(): Promise<WorkingHour[]>;
  /** Add a single range — rejects overlap with existing ranges of same staff+weekday (409) */
  add(staffId: string, range: HourRange, actor: AuthContext): Promise<WorkingHour>;
  /** Atomically replace the whole weekly plan of a staff member */
  replaceWeek(staffId: string, items: HourRange[], actor: AuthContext): Promise<WorkingHour[]>;
  /** Delete a single range */
  remove(id: string, actor: AuthContext): Promise<void>;
}

export type { HourRange };

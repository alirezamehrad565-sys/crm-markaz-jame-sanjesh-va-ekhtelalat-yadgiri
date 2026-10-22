import type {
  AuthContext,
  StaffAttendanceDaySummary,
  StaffAttendancePersonSummary,
  StaffAttendanceRecord,
  StaffAttendanceStatus
} from '@core/shared';
import { addDaysYmd, STAFF_ATTENDANCE_STATUSES, STAFF_ROLES, tehranTodayYmd } from '@core/shared';
import { NotFoundError, ValidationError } from '@core/errors';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { DbClient } from '@core/db';

export function canMarkDate(date: string, todayYmd: string): boolean {
  return date === todayYmd;
}

export interface StaffAttendanceDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
}

export interface MarkStaffAttendanceInput {
  staffId: string;
  date: string;
  status: StaffAttendanceStatus;
  note?: string;
}

export interface StaffAttendanceService {
  mark(input: MarkStaffAttendanceInput, actor: AuthContext): Promise<StaffAttendanceRecord>;
  list(filters: { from: string; to: string; staffId?: string }): Promise<StaffAttendanceRecord[]>;
  daySummary(date: string): Promise<StaffAttendanceDaySummary>;
  rangeSummary(from: string, to: string): Promise<StaffAttendancePersonSummary[]>;
}

interface StaffAttendanceRow {
  id: string;
  staff_id: string;
  date: string;
  status: StaffAttendanceStatus;
  note: string | null;
  updated_at: string;
  staff_name?: string;
  role?: string;
}

function rowToRecord(row: StaffAttendanceRow): StaffAttendanceRecord {
  return {
    id: row.id,
    staffId: row.staff_id,
    staffName: row.staff_name ?? '',
    role: (row.role && (STAFF_ROLES as readonly string[]).includes(row.role)
      ? row.role
      : 'therapist') as StaffAttendanceRecord['role'],
    date: row.date,
    status: row.status,
    note: row.note,
    updatedAt: row.updated_at
  };
}

export function countDaysInclusive(from: string, to: string): number {
  const ms = Date.parse(to) - Date.parse(from);
  return Math.floor(ms / (24 * 60 * 60 * 1000)) + 1;
}

export function daysInRange(from: string, to: string): string[] {
  const out: string[] = [];
  const n = countDaysInclusive(from, to);
  if (n <= 0) return out;
  let cur = from;
  for (let i = 0; i < n; i++) {
    out.push(cur);
    cur = addDaysYmd(cur, 1);
  }
  return out;
}

export function aggregateDay(date: string, rows: StaffAttendanceRow[], totalActiveStaff: number): StaffAttendanceDaySummary {
  const summary: StaffAttendanceDaySummary = {
    date,
    present: 0,
    absent: 0,
    late: 0,
    leave: 0,
    sick: 0,
    unmarked: 0,
    totalActiveStaff
  };
  const seenStaff = new Set<string>();
  for (const row of rows) {
    if (row.date !== date) continue;
    seenStaff.add(row.staff_id);
    if (row.status === 'present') summary.present++;
    else if (row.status === 'absent') summary.absent++;
    else if (row.status === 'late') summary.late++; //
    else if (row.status === 'leave') summary.leave++;
    else if (row.status === 'sick') summary.sick++;
  }
  summary.unmarked = Math.max(0, totalActiveStaff - seenStaff.size);
  return summary;
}

export function aggregateRange(
  from: string,
  to: string,
  rows: StaffAttendanceRow[],
  activeStaff: { id: string; displayName: string; role: string }[]
): StaffAttendancePersonSummary[] {
  const days = countDaysInclusive(from, to);
  const byId = new Map<string, StaffAttendancePersonSummary>();
  for (const s of activeStaff) {
    byId.set(s.id, {
      staffId: s.id,
      staffName: s.displayName,
      role: (STAFF_ROLES as readonly string[]).includes(s.role) ? (s.role as StaffAttendancePersonSummary['role']) : 'therapist',
      present: 0,
      absent: 0,
      late: 0,
      leave: 0,
      sick: 0,
      unmarked: days
    });
  }
  for (const row of rows) {
    const agg = byId.get(row.staff_id);
    if (!agg) continue;
    agg.unmarked = Math.max(0, agg.unmarked - 1);
    if (row.status === 'present') agg.present++;
    else if (row.status === 'absent') agg.absent++;
    else if (row.status === 'late') agg.late++; //
    else if (row.status === 'leave') agg.leave++;
    else if (row.status === 'sick') agg.sick++;
  }
  return [...byId.values()];
}

export function createStaffAttendanceService(deps: StaffAttendanceDeps): StaffAttendanceService {
  const { db, audit, logger } = deps;

  return {
    async mark(input, actor) {
      if (!(STAFF_ATTENDANCE_STATUSES as readonly string[]).includes(input.status)) {
        throw new ValidationError('وضعیت حضور نامعتبر است');
      }
      if (!canMarkDate(input.date, tehranTodayYmd())) {
        throw new ValidationError('ثبت حضور و غیاب همکاران فقط برای امروز مجاز است');
      }
      const staff = await db.queryOne<{ id: string; active: number }>(
        `SELECT id, active FROM staff WHERE id = ?`,
        [input.staffId]
      );
      if (!staff || staff.active !== 1) {
        throw new NotFoundError('همکار');
      }

      const existing = await db.queryOne<StaffAttendanceRow>(
        `SELECT id, staff_id, date, status, note, updated_at FROM staff_attendance WHERE staff_id = ? AND date = ?`,
        [input.staffId, input.date]
      );

      const nowIso = new Date().toISOString();
      let recordId = '';

      await db.transaction(async (tx) => {
        if (existing) {
          recordId = existing.id;
          await tx.execute(
            `UPDATE staff_attendance SET status = ?, note = COALESCE(?, note), updated_at = ? WHERE id = ?`,
            [input.status, input.note ?? null, nowIso, existing.id]
          );
          await audit.logInTransaction(tx, {
            actorId: actor.staffId,
            action: 'attendance.staff.update',
            resourceType: 'staff_attendance',
            resourceId: existing.id,
            changes: {
              status: { from: existing.status, to: input.status }
            }
          });
        } else {
          recordId = crypto.randomUUID();
          await tx.execute(
            `INSERT INTO staff_attendance (id, staff_id, date, status, note, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [recordId, input.staffId, input.date, input.status, input.note ?? null, nowIso, nowIso]
          );
          await audit.logInTransaction(tx, {
            actorId: actor.staffId,
            action: 'attendance.staff.mark',
            resourceType: 'staff_attendance',
            resourceId: recordId,
            changes: {
              status: { from: null, to: input.status },
              date: { from: null, to: input.date }
            }
          });
        }
      });

      logger.child('staff-attendance').info('attendance.staff.marked', { status: input.status });

      const row = await db.queryOne<StaffAttendanceRow>(
        `SELECT sa.id, sa.staff_id, sa.date, sa.status, sa.note, sa.updated_at,
                s.full_name AS staff_name, s.role
           FROM staff_attendance sa JOIN staff s ON s.id = sa.staff_id
          WHERE sa.id = ?`,
        [recordId]
      );
      return rowToRecord(row as StaffAttendanceRow);
    },

    async list(filters): Promise<StaffAttendanceRecord[]> {
      const conditions: string[] = ['sa.date >= ?', 'sa.date <= ?'];
      const params: unknown[] = [filters.from, filters.to];
      if (filters.staffId) {
        conditions.push('sa.staff_id = ?');
        params.push(filters.staffId);
      }
      const rows = await db.query<StaffAttendanceRow>(
        `SELECT sa.id, sa.staff_id, sa.date, sa.status, sa.note, sa.updated_at,
                s.full_name AS staff_name, s.role
           FROM staff_attendance sa
           JOIN staff s ON s.id = sa.staff_id
          WHERE ${conditions.join(' AND ')}
          ORDER BY sa.date DESC, s.full_name`,
        params
      );
      return rows.map(rowToRecord);
    },

    async daySummary(date): Promise<StaffAttendanceDaySummary> {
      const [staffCount, rows] = await Promise.all([
        db.queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM staff WHERE active = 1`),
        db.query<StaffAttendanceRow>(
          `SELECT id, staff_id, date, status, note, updated_at FROM staff_attendance WHERE date = ?`,
          [date]
        )
      ]);
      return aggregateDay(date, rows, staffCount?.n ?? 0);
    },

    async rangeSummary(from, to): Promise<StaffAttendancePersonSummary[]> {
      const [staffRows, rows] = await Promise.all([
        db.query<{ id: string; displayName: string; role: string }>(
          `SELECT id, full_name AS displayName, role FROM staff WHERE active = 1 ORDER BY full_name`
        ),
        db.query<StaffAttendanceRow>(
          `SELECT id, staff_id, date, status, note, updated_at FROM staff_attendance WHERE date >= ? AND date <= ?`,
          [from, to]
        )
      ]);
      return aggregateRange(from, to, rows, staffRows);
    }
  };
}

import type { AuthContext } from '@core/shared';
import { ConflictError, ForbiddenError, NotFoundError } from '@core/errors';
import type { DbClient } from '@core/db';
import type { WorkingHoursDeps, WorkingHour, WorkingHoursService } from './types';
import type { HourRange } from './rules';
import { findOverlap } from './rules';

interface WorkingHourRow {
  id: string;
  staff_id: string;
  weekday: number;
  start_minute: number;
  end_minute: number;
  created_at: string;
  updated_at: string;
}

const WH_COLS = 'id, staff_id, weekday, start_minute, end_minute, created_at, updated_at';

function rowToWorkingHour(row: WorkingHourRow): WorkingHour {
  return {
    id: row.id,
    staffId: row.staff_id,
    weekday: row.weekday,
    startMinute: row.start_minute,
    endMinute: row.end_minute,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function loadStaffRanges(db: DbClient, staffId: string): Promise<HourRange[]> {
  const rows = await db.query<{ weekday: number; start_minute: number; end_minute: number }>(
    `SELECT weekday, start_minute, end_minute FROM working_hours WHERE staff_id = ?`,
    [staffId]
  );
  return rows.map((r) => ({ weekday: r.weekday, startMinute: r.start_minute, endMinute: r.end_minute }));
}

export function createWorkingHoursService(deps: WorkingHoursDeps): WorkingHoursService {
  const { db, audit, logger } = deps;

  function assertHoursScope(actor: AuthContext, staffId: string): void {
    if (actor.role === 'manager' || actor.role === 'secretary') return;
    if (actor.role === 'therapist' && actor.staffId === staffId) return;
    throw new ForbiddenError('ویرایش ساعات کاری فقط برای برنامهٔ خودِ شما مجاز است');
  }

  return {
    async listForStaff(staffId: string): Promise<WorkingHour[]> {
      const rows = await db.query<WorkingHourRow>(
        `SELECT ${WH_COLS} FROM working_hours WHERE staff_id = ? ORDER BY weekday, start_minute`,
        [staffId]
      );
      return rows.map(rowToWorkingHour);
    },

    async listAll(): Promise<WorkingHour[]> {
      const rows = await db.query<WorkingHourRow>(
        `SELECT ${WH_COLS} FROM working_hours ORDER BY staff_id, weekday, start_minute`,
        []
      );
      return rows.map(rowToWorkingHour);
    },

    async add(staffId: string, range: HourRange, actor: AuthContext): Promise<WorkingHour> {
      const staff = await db.queryOne<{ id: string }>(`SELECT id FROM staff WHERE id = ?`, [staffId]);
      if (!staff) throw new NotFoundError('کارمند');
      assertHoursScope(actor, staffId);

      const existing = await loadStaffRanges(db, staffId);
      const violation = findOverlap([...existing, range]);
      if (violation) {
        throw new ConflictError('این بازه با یک بازه کاری موجود هم‌پوشانی دارد');
      }

      const id = crypto.randomUUID();
      await db.transaction(async (tx) => {
        await tx.execute(
          `INSERT INTO working_hours (id, staff_id, weekday, start_minute, end_minute) VALUES (?, ?, ?, ?, ?)`,
          [id, staffId, range.weekday, range.startMinute, range.endMinute]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'working_hours.create',
          resourceType: 'working_hours',
          resourceId: id,
          changes: {
            staff_id: { from: null, to: staffId },
            range: { from: null, to: `${range.weekday}/${range.startMinute}-${range.endMinute}` }
          }
        });
      });
      logger.child('working-hours').info('range.added', { weekday: range.weekday });
      const row = await db.queryOne<WorkingHourRow>(`SELECT ${WH_COLS} FROM working_hours WHERE id = ?`, [id]);
      return rowToWorkingHour(row as WorkingHourRow);
    },

    async replaceWeek(staffId: string, items: HourRange[], actor: AuthContext): Promise<WorkingHour[]> {
      const staff = await db.queryOne<{ id: string }>(`SELECT id FROM staff WHERE id = ?`, [staffId]);
      if (!staff) throw new NotFoundError('کارمند');
      assertHoursScope(actor, staffId);

      const violation = findOverlap(items);
      if (violation) {
        throw new ConflictError('بازه‌های ارسالی با هم هم‌پوشانی دارند');
      }

      await db.transaction(async (tx) => {
        await tx.execute(`DELETE FROM working_hours WHERE staff_id = ?`, [staffId]);
        for (const range of items) {
          await tx.execute(
            `INSERT INTO working_hours (id, staff_id, weekday, start_minute, end_minute) VALUES (?, ?, ?, ?, ?)`,
            [crypto.randomUUID(), staffId, range.weekday, range.startMinute, range.endMinute]
          );
        }
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'working_hours.replace_week',
          resourceType: 'staff',
          resourceId: staffId,
          changes: {
            ranges: { from: 'previous', to: `${items.length} ranges` }
          }
        });
      });
      logger.child('working-hours').info('week.replaced', { count: items.length });
      return this.listForStaff(staffId);
    },

    async remove(id: string, actor: AuthContext): Promise<void> {
      await db.transaction(async (tx) => {
        const row = await tx.queryOne<WorkingHourRow>(`SELECT ${WH_COLS} FROM working_hours WHERE id = ?`, [id]);
        if (!row) throw new NotFoundError('بازه کاری');
        assertHoursScope(actor, row.staff_id);
        await tx.execute(`DELETE FROM working_hours WHERE id = ?`, [id]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'working_hours.delete',
          resourceType: 'working_hours',
          resourceId: id,
          changes: {
            range: { from: `${row.weekday}/${row.start_minute}-${row.end_minute}`, to: null }
          }
        });
      });
      logger.child('working-hours').info('range.removed');
    }
  };
}

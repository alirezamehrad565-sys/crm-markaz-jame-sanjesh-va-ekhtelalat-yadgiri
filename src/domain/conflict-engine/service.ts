import type { DbClient } from '@core/db';
import type { ConflictWarning } from '@core/shared';
import { findOverlaps } from './engine';
import type { ExistingAppointment, ProposedWindow } from './engine';

export interface ConflictEngineDeps {
  db: DbClient;
}

export interface ConflictEngine {
  checkOverlap(proposed: ProposedWindow): Promise<ConflictWarning[]>;
  findConflicts(staffId: string, from: string, to: string): Promise<ConflictWarning[]>;
}

interface AppointmentRow {
  id: string;
  staff_id: string;
  start_at: string;
  end_at: string;
  status: string;
}

function rowToExisting(row: AppointmentRow): ExistingAppointment {
  return {
    id: row.id,
    staffId: row.staff_id,
    startAt: row.start_at,
    endAt: row.end_at,
    status: row.status
  };
}

export function createConflictEngine(deps: ConflictEngineDeps): ConflictEngine {
  const { db } = deps;

  return {
    async checkOverlap(proposed: ProposedWindow): Promise<ConflictWarning[]> {
      const rows = await db.query<AppointmentRow>(
        `SELECT id, staff_id, start_at, end_at, status
           FROM appointments
          WHERE staff_id = ?
            AND start_at < ?
            AND end_at > ?
            AND status != 'cancelled'`,
        [proposed.staffId, proposed.endAt, proposed.startAt]
      );
      const existing = rows.map(rowToExisting);
      return findOverlaps(existing, proposed);
    },

    async findConflicts(staffId: string, from: string, to: string): Promise<ConflictWarning[]> {
      const rows = await db.query<AppointmentRow>(
        `SELECT id, staff_id, start_at, end_at, status
           FROM appointments
          WHERE staff_id = ?
            AND start_at >= ?
            AND start_at <= ?
            AND status != 'cancelled'
          ORDER BY start_at`,
        [staffId, from, to]
      );
      const existing = rows.map(rowToExisting);
      const warnings: ConflictWarning[] = [];
      const seen = new Set<string>();

      for (let i = 0; i < existing.length; i++) {
        const proposed: ProposedWindow = {
          staffId,
          startAt: existing[i].startAt,
          endAt: existing[i].endAt,
          excludeId: existing[i].id
        };
        const found = findOverlaps(existing, proposed);
        for (const w of found) {
          const key = [existing[i].id, w.appointmentId].sort().join('|');
          if (!seen.has(key)) {
            seen.add(key);
            warnings.push(w);
          }
        }
      }
      return warnings;
    }
  };
}

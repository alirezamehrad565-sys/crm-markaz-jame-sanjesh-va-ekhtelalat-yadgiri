import type { DbClient } from '@core/db';
import type { StaffRole } from '@core/shared';

export interface StaffRow {
  id: string;
  email: string;
  full_name: string;
  role: StaffRole;
  active: number;
}

const STAFF_COLS = 'id, email, full_name, COALESCE(role_ext, role) AS role, active';

export function resolveStaffByEmail(db: D1Database, email: string): Promise<StaffRow | null> {
  return db
    .prepare(`SELECT ${STAFF_COLS} FROM staff WHERE email = ? LIMIT 1`)
    .bind(email)
    .first<StaffRow>();
}

export function getStaffById(db: D1Database, staffId: string): Promise<StaffRow | null> {
  return db
    .prepare(`SELECT ${STAFF_COLS} FROM staff WHERE id = ? LIMIT 1`)
    .bind(staffId)
    .first<StaffRow>();
}

export function listStaff(db: DbClient, onlyActive = true): Promise<StaffRow[]> {
  const sql = onlyActive
    ? `SELECT ${STAFF_COLS} FROM staff WHERE active = 1 ORDER BY full_name`
    : `SELECT ${STAFF_COLS} FROM staff ORDER BY full_name`;
  return db.query<StaffRow>(sql, []);
}

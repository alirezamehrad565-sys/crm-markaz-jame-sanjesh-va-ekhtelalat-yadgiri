/**
 * احراز هویت هسته — JWT، رمز، کلید API و گارد نقش — حضور کارکنان
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// Resolution کاربر: email → staff row، id → staff row، لیست کارکنان (read-only)
// جدول staff مالک ماژول دیگری نیست (manual / future module) — خواندن فقط از اینجا.
// دو سبک ورودی: D1 خام (برای middleware) و DbClient (برای ماژول‌های application مثل dashboard)

import type { DbClient } from '@core/db';
import type { StaffRole } from '@core/shared';

export interface StaffRow {
  id: string;
  email: string;
  full_name: string;
  role: StaffRole;
  active: number;
}

/**
 * — نقش مؤثر = COALESCE(role_ext, role) — ستون role_ext نقش ناظر اداره را
 * بدون بازسازی جدول (FK D1) اضافه می‌کند (مایگریشن 0028).
 */
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

/** لیست کارکنان — ورودی DbClient (برای dashboard و ماژول‌های application) */
export function listStaff(db: DbClient, onlyActive = true): Promise<StaffRow[]> {
  const sql = onlyActive
    ? `SELECT ${STAFF_COLS} FROM staff WHERE active = 1 ORDER BY full_name`
    : `SELECT ${STAFF_COLS} FROM staff ORDER BY full_name`;
  return db.query<StaffRow>(sql, []);
}

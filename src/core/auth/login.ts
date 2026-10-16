/**
 * احراز هویت هسته — JWT، رمز، کلید API و گارد نقش — منطق ورود با تلاش‌محدود
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// احراز هویت صفحه ورود با «نام کاربری + رمز»
// کاربر: امنیت مهم نیست (حتی رمز هارد‌کد) — ولی رمز خام ذخیره نمی‌شود (SHA-256)
// ورود با username یا email قدیمی (legacy) ممکن است.

import type { StaffRole } from '@core/shared';

export interface LoginStaffRow {
  id: string;
  email: string;
  full_name: string;
  role: StaffRole;
  active: number;
  username: string | null;
  password_hash: string | null;
}

/** یافتن کارمند با username یا email (legacy) — فقط برای صفحه ورود */
export function findStaffByUsername(db: D1Database, username: string): Promise<LoginStaffRow | null> {
  const u = username.trim();
  return db
    .prepare(
      `SELECT id, email, full_name, COALESCE(role_ext, role) AS role, active, username, password_hash
         FROM staff
        WHERE lower(trim(username)) = lower(?) OR lower(email) = lower(?)
        LIMIT 1`
    )
    .bind(u, u.toLowerCase())
    .first<LoginStaffRow>();
}

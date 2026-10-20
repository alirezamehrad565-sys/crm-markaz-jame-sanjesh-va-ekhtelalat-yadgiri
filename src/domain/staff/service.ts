/**
 * ماژول کارکنان — سرویس اصلی و منطق کسب‌وکار
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// Business logic of staff management — audit co-transaction (rule 4)
// Soft state (active 0/1) — never hard delete: appointments reference staff.
// v۲: بدون ایمیل اجباری — تلفن + کد ملی + نام کاربری + رمز (SHA-256)

import type { AuthContext, StaffRole } from '@core/shared';
import { DEFAULT_PASSWORD, hashPassword } from '@core/auth';
import { ConflictError, NotFoundError } from '@core/errors';
import type { StaffDeps, StaffMember, NewStaffInput, UpdateStaffInput, StaffService } from './types';

interface StaffRow {
  id: string;
  email: string;
  full_name: string;
  role: StaffRole;
  /** — نقش مؤثر ناظر (NULL = نقش عادی) — مایگریشن 0028 */
  role_ext: string | null;
  active: number;
  notify_enabled: number;
  phone: string | null;
  national_id: string | null;
  username: string | null;
  created_at: string;
}

/**
 * — نقش مؤثر = COALESCE(role_ext, role).
 * ستون role فقط سه مقدار CHECK-دار می‌پذیرد (0001)؛ «ناظر اداره» با
 * role='secretary' + role_ext='supervisor' ذخیره می‌شود و همه‌جا نقش مؤثر می‌آید.
 */
const STAFF_COLS =
  'id, email, full_name, COALESCE(role_ext, role) AS role, active, notify_enabled, phone, national_id, username, role_ext, created_at';

/** نقش ورودی API → جفت ستون‌های DB (م62) */
function roleToColumns(role: StaffRole): { role: string; roleExt: string | null } {
  return role === 'supervisor'
    ? { role: 'secretary', roleExt: 'supervisor' }
    : { role, roleExt: null };
}

function rowToMember(row: StaffRow): StaffMember {
  return {
    id: row.id,
    fullName: row.full_name,
    role: row.role,
    active: row.active === 1,
    notifyEnabled: row.notify_enabled === 1,
    phone: row.phone,
    nationalId: row.national_id,
    username: row.username,
    email: row.email,
    createdAt: row.created_at
  };
}

/** ایمیل synthetic برای ستون legacy NOT NULL UNIQUE — در UI نمایش داده نمی‌شود */
function syntheticEmail(): string {
  const rnd = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  return `auto-${rnd}@local`;
}

export function createStaffService(deps: StaffDeps): StaffService {
  const { db, audit, logger } = deps;

  return {
    async list(filters: { active?: boolean }): Promise<StaffMember[]> {
      const where = filters.active === undefined ? '' : filters.active ? 'WHERE active = 1' : 'WHERE active = 0';
      const rows = await db.query<StaffRow>(
        `SELECT ${STAFF_COLS} FROM staff ${where} ORDER BY full_name`,
        []
      );
      return rows.map(rowToMember);
    },

    async getById(id: string): Promise<StaffMember | null> {
      const row = await db.queryOne<StaffRow>(`SELECT ${STAFF_COLS} FROM staff WHERE id = ?`, [id]);
      return row ? rowToMember(row) : null;
    },

    async create(input: NewStaffInput, actor: AuthContext): Promise<StaffMember> {
      const username = input.username.trim();
      const nationalId = input.nationalId.trim();
      const phone = input.phone.trim();

      const dupUser = await db.queryOne<{ id: string }>(
        `SELECT id FROM staff WHERE lower(trim(username)) = lower(?)`,
        [username]
      );
      if (dupUser) throw new ConflictError('این نام کاربری قبلاً گرفته شده است');

      const dupNid = await db.queryOne<{ id: string }>(
        `SELECT id FROM staff WHERE national_id = ?`,
        [nationalId]
      );
      if (dupNid) throw new ConflictError('این کد ملی قبلاً ثبت شده است');

      const passwordHash = await hashPassword(input.password?.trim() ? input.password.trim() : DEFAULT_PASSWORD);
      const id = crypto.randomUUID();
      const email = syntheticEmail();

      await db.transaction(async (tx) => {
        const roleCols = roleToColumns(input.role);
        await tx.execute(
          `INSERT INTO staff (id, email, full_name, role, role_ext, phone, national_id, username, password_hash)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, email, input.fullName.trim(), roleCols.role, roleCols.roleExt, phone, nationalId, username, passwordHash]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'staff.create',
          resourceType: 'staff',
          resourceId: id,
          changes: {
            full_name: { from: null, to: input.fullName.trim() },
            username: { from: null, to: username },
            phone: { from: null, to: phone },
            role: { from: null, to: input.role }
          }
        });
      });
      logger.child('staff').info('staff.created', { role: input.role });
      const created = await this.getById(id);
      return created as StaffMember;
    },

    async update(id: string, patch: UpdateStaffInput, actor: AuthContext): Promise<StaffMember> {
      return db.transaction(async (tx) => {
        const row = await tx.queryOne<StaffRow>(`SELECT ${STAFF_COLS} FROM staff WHERE id = ?`, [id]);
        if (!row) throw new NotFoundError('کارمند');

        const changes: Record<string, { from: unknown; to: unknown }> = {};
        const setMap: [string, unknown, unknown][] = []; // [column, newValue, oldValue]
        let roleOverride: StaffRole | null = null;

        if (patch.username !== undefined && patch.username.trim().toLowerCase() !== (row.username ?? '').toLowerCase()) {
          const username = patch.username.trim();
          const dup = await tx.queryOne<{ id: string }>(
            `SELECT id FROM staff WHERE lower(trim(username)) = lower(?) AND id != ?`,
            [username, id]
          );
          if (dup) throw new ConflictError('این نام کاربری قبلاً گرفته شده است');
          setMap.push(['username', username, row.username]);
        }
        if (patch.nationalId !== undefined && patch.nationalId.trim() !== (row.national_id ?? '')) {
          const nationalId = patch.nationalId.trim();
          const dup = await tx.queryOne<{ id: string }>(
            `SELECT id FROM staff WHERE national_id = ? AND id != ?`,
            [nationalId, id]
          );
          if (dup) throw new ConflictError('این کد ملی قبلاً ثبت شده است');
          setMap.push(['national_id', nationalId, row.national_id]);
        }
        if (patch.phone !== undefined && patch.phone.trim() !== (row.phone ?? '')) {
          setMap.push(['phone', patch.phone.trim(), row.phone]);
        }
        if (patch.fullName !== undefined && patch.fullName.trim() !== row.full_name) {
          setMap.push(['full_name', patch.fullName.trim(), row.full_name]);
        }
        if (patch.role !== undefined && patch.role !== row.role) {
          const roleCols = roleToColumns(patch.role);
          // از = نقش مؤثر قبلی؛ تا = نقش مؤثر جدید (ستون‌ها جدا نوشته می‌شوند)
          setMap.push(['role', roleCols.role, row.role]);
          setMap.push(['role_ext', roleCols.roleExt, row.role_ext]);
          roleOverride = patch.role;
        }
        if (patch.notifyEnabled !== undefined && patch.notifyEnabled !== (row.notify_enabled === 1)) {
          setMap.push(['notify_enabled', patch.notifyEnabled ? 1 : 0, row.notify_enabled]);
        }

        // رمز — فقط وقتی صریحاً ارسال شده (خالی/ناموجود = بدون تغییر)
        if (patch.password !== undefined && patch.password.trim() !== '') {
          const passwordHash = await hashPassword(patch.password.trim());
          await tx.execute(`UPDATE staff SET password_hash = ? WHERE id = ?`, [passwordHash, id]);
          changes.password = { from: '••••', to: '••••' };
        }

        if (setMap.length > 0) {
          const sets = setMap.map(([col]) => `${col} = ?`).join(', ');
          await tx.execute(`UPDATE staff SET ${sets} WHERE id = ?`, [...setMap.map(([, v]) => v), id]);
          for (const [col, to, from] of setMap) changes[col] = { from, to };
        }

        if (Object.keys(changes).length > 0) {
          await audit.logInTransaction(tx, {
            actorId: actor.staffId,
            action: 'staff.update',
            resourceType: 'staff',
            resourceId: id,
            changes
          });
        }

        // ساخت پاسخ در حافظه — خواندن داخل همان تراکنش مقدار کهنه می‌دهد (writeها batch می‌شوند)
        const merged: StaffRow = { ...row };
        for (const [col, to] of setMap) (merged as unknown as Record<string, unknown>)[col] = to;
        if (roleOverride) merged.role = roleOverride; // نقش مؤثر در پاسخ
        return rowToMember(merged);
      });
    },

    async setActive(id: string, active: boolean, actor: AuthContext): Promise<StaffMember> {
      return db.transaction(async (tx) => {
        const row = await tx.queryOne<StaffRow>(`SELECT ${STAFF_COLS} FROM staff WHERE id = ?`, [id]);
        if (!row) throw new NotFoundError('کارمند');
        if (row.active === (active ? 1 : 0)) {
          throw new ConflictError(active ? 'کارمند قبلاً فعال است' : 'کارمند قبلاً غیرفعال شده است');
        }
        if (!active && row.id === actor.staffId) {
          throw new ConflictError('غیرفعال کردن کاربر جاری مجاز نیست');
        }

        await tx.execute(`UPDATE staff SET active = ? WHERE id = ?`, [active ? 1 : 0, id]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: active ? 'staff.activate' : 'staff.deactivate',
          resourceType: 'staff',
          resourceId: id,
          changes: { active: { from: row.active, to: active ? 1 : 0 } }
        });
        logger.child('staff').info(active ? 'staff.activated' : 'staff.deactivated');
        return rowToMember({ ...row, active: active ? 1 : 0 });
      });
    },

    /**
     * — حذف کامل همکار ثبت‌شدهٔ اشتباه (نام غلط / ثبت تکراری چند دقیقه پیش).
     * گاردها:
     * - حذف حساب خود بازیگر → خطا
     * - آخرین مدیر فعال مرکز → خطا (دفتر بی‌مدیر نمی‌ماند)
     * - هر سابقهٔ واقعی (نوبت / ساعت کاری / حضور همکار / دانش‌آموزِ مسئول / todo /
     * followup / متقاضی ثبت‌کننده / رویداد پرونده / سنجش / اعلان / تمرین / api key /
     * توضیح روز کاری / رویداد استاندارد) → ConflictError با راهنمای «غیرفعال‌سازی»
     * خالی بودن → DELETE + audit («settings_staff_links» با CASCADE پاک می‌شود،
     * «notifications.staff_id» با SET NULL بی‌مقصد می‌شود).
     */
    async remove(id: string, actor: AuthContext): Promise<void> {
      await db.transaction(async (tx) => {
        const row = await tx.queryOne<StaffRow>(`SELECT ${STAFF_COLS} FROM staff WHERE id = ?`, [id]);
        if (!row) throw new NotFoundError('کارمند');
        if (id === actor.staffId) {
          throw new ConflictError('حذف حساب خودتان ممکن نیست — از مدیر دیگر بخواهید');
        }

        if (row.role === 'manager' && row.active === 1) {
          const managers = await tx.queryOne<{ cnt: number }>(
            `SELECT COUNT(*) AS cnt FROM staff WHERE role = 'manager' AND active = 1`,
            []
          );
          if ((managers?.cnt ?? 0) <= 1) {
            throw new ConflictError('آخرین مدیر فعال مرکز حذف نمی‌شود — ابتدا مدیر دیگری تعیین کنید');
          }
        }

        const refs: Array<[string, string, number]> = [
          ['نوبت', `SELECT COUNT(*) AS cnt FROM appointments WHERE staff_id = ?`, 1],
          ['بازهٔ کاری', `SELECT COUNT(*) AS cnt FROM working_hours WHERE staff_id = ?`, 1],
          ['حضور همکار', `SELECT COUNT(*) AS cnt FROM staff_attendance WHERE staff_id = ?`, 1],
          ['مسئول پرونده', `SELECT COUNT(*) AS cnt FROM students WHERE owner_staff_id = ?`, 1],
          ['کار روزانه', `SELECT COUNT(*) AS cnt FROM todos WHERE assigner_id = ? OR assignee_id = ?`, 2],
          ['پیگیری', `SELECT COUNT(*) AS cnt FROM followups WHERE assignee_id = ? OR created_by = ?`, 2],
          ['متقاضی ثبت‌شده', `SELECT COUNT(*) AS cnt FROM waitlist WHERE created_by = ? AND deleted_at IS NULL`, 1],
          ['رویداد پرونده', `SELECT COUNT(*) AS cnt FROM case_events WHERE staff_id = ?`, 1],
          ['اعلان', `SELECT COUNT(*) AS cnt FROM announcements WHERE created_by = ?`, 1],
          ['تمرین', `SELECT COUNT(*) AS cnt FROM exercises WHERE created_by = ?`, 1],
          ['کلید API', `SELECT COUNT(*) AS cnt FROM api_keys WHERE created_by = ?`, 1],
          ['توضیح روز کاری', `SELECT COUNT(*) AS cnt FROM day_notes WHERE created_by = ?`, 1]
        ];
        for (const [label, sql, paramCount] of refs) {
          const hit = await tx.queryOne<{ cnt: number }>(sql, Array(paramCount).fill(id));
          if ((hit?.cnt ?? 0) > 0) {
            throw new ConflictError(`«${row.full_name}» سابقهٔ ${label} دارد و حذف نمی‌شود — از «غیرفعال‌سازی» استفاده کنید`);
          }
        }

        await tx.execute(`DELETE FROM staff WHERE id = ?`, [id]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'staff.delete',
          resourceType: 'staff',
          resourceId: id,
          changes: { full_name: { from: row.full_name, to: null }, role: { from: row.role, to: null } }
        });
      });
      logger.child('staff').info('staff.deleted', { id });
    }
  };
}

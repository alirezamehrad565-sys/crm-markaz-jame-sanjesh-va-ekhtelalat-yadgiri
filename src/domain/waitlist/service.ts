/**
 * ماژول لیست انتظار — سرویس اصلی و منطق کسب‌وکار
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// Business logic لیست انتظار (فاز W) — مالک WRITE جدول waitlist
// قواعد:
// - audit هم‌تراکنش (قانون ۴)؛ متن یادداشت در audit نمی‌آید (فقط نشانه)
// - وضعیت فقط از endpointهای اختصاصی با ماتریس pure.ts
// - /schedule اتمیک است: پرونده (در صورت نیاز) + نوبت + به‌روزرسانی ورودی
// در یک db.transaction — بدون duplicate منطق (createWithinTx/createStudentWithin)
// - اعلان «نوبت جدید» بعد از commit از همان مسیر observer نوبت می‌آید

import type { AuthContext, WaitlistBadge, WaitlistEntry } from '@core/shared';
import { WAITLIST_ALERT_DAYS, WAITLIST_LIST_LIMIT, WAITLIST_QUEUE_STATUSES } from '@core/shared';
import { ConflictError, NotFoundError, ValidationError } from '@core/errors';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { DbClient } from '@core/db';
import { appendNote, canTransition, matchStudent, orderWaitlist } from './pure';
import type { NewWaitlistInput, StudentWaitStatusInput, UpdateWaitlistInput, WaitlistDeps, WaitlistListFilters, WaitlistScheduleInput, WaitlistScheduleResult, WaitlistService } from './types';

interface WaitlistRow {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  national_id: string | null;
  birth_date: string | null;
  school_id: string | null;
  class_id: string | null;
  school_name: string | null;
  class_name: string | null;
  source: string;
  service_type: string | null;
  note: string | null;
  priority: string;
  status: string;
  manual_order: number | null;
  call_count: number;
  last_call_at: string | null;
  scheduled_appointment_id: string | null;
  admitted_student_id: string | null;
  student_id: string | null;
  created_by: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

function rowToEntry(row: WaitlistRow): WaitlistEntry {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    nationalId: row.national_id,
    birthDate: row.birth_date,
    schoolId: row.school_id,
    classId: row.class_id,
    schoolName: row.school_name,
    className: row.class_name,
    source: row.source as WaitlistEntry['source'],
    serviceType: row.service_type,
    note: row.note,
    priority: row.priority as WaitlistEntry['priority'],
    status: row.status as WaitlistEntry['status'],
    manualOrder: row.manual_order,
    callCount: row.call_count,
    lastCallAt: row.last_call_at,
    scheduledAppointmentId: row.scheduled_appointment_id,
    admittedStudentId: row.admitted_student_id,
    studentId: row.student_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const SELECT_BASE = `
  SELECT w.id,
         -- M21: برای ورودی‌های متصل به پرونده، مشخصات هویتی زنده از خود دانش‌آموز می‌آید
         COALESCE(st.first_name, w.first_name) AS first_name,
         COALESCE(st.last_name, w.last_name) AS last_name,
         COALESCE(st.guardian_phone, w.phone) AS phone,
         w.national_id, w.birth_date,
         COALESCE(st.school_id, w.school_id) AS school_id,
         COALESCE(st.class_id, w.class_id) AS class_id,
         s.name AS school_name, c.name AS class_name,
         w.source, w.service_type, w.note, w.priority, w.status, w.manual_order,
         w.call_count, w.last_call_at, w.scheduled_appointment_id, w.admitted_student_id,
         w.student_id, w.created_by, w.deleted_at, w.created_at, w.updated_at
    FROM waitlist w
    LEFT JOIN students st ON st.id = w.student_id
    LEFT JOIN schools s ON s.id = COALESCE(st.school_id, w.school_id)
    LEFT JOIN classes c ON c.id = COALESCE(st.class_id, w.class_id)`;

export function createWaitlistService(deps: WaitlistDeps): WaitlistService {
  const { db, audit, logger } = deps;
  const log = logger.child('waitlist');

  async function loadEntry(tx: Pick<DbClient, 'queryOne'>, id: string): Promise<WaitlistRow> {
    const row = await tx.queryOne<WaitlistRow>(`${SELECT_BASE} WHERE w.id = ? AND w.deleted_at IS NULL`, [id]);
    if (!row) throw new NotFoundError('ورودی لیست انتظار');
    return row;
  }

  /** وضعیت ورودی را با audit هم‌تراکنش به‌روز می‌کند (endpointهای اختصاصی) */
  async function transitionEntry(
    tx: DbClient,
    row: WaitlistRow,
    to: WaitlistEntry['status'],
    action: string,
    actorId: string,
    noteAppend?: { label: string; text?: string }
  ): Promise<void> {
    if (!canTransition(row.status as WaitlistEntry['status'], to)) {
      throw new ConflictError(`تغییر وضعیت از «${row.status}» به «${to}» مجاز نیست`, undefined);
    }
    const newNote = noteAppend ? appendNote(row.note, noteAppend.label, noteAppend.text) : row.note;
    // خروج از «scheduled» یعنی نوبت متصل دیگر معتبر نیست؛ ارجاع FK باید همان‌جا
    // خنثی شود وگرنه حذف بعدیِ آن نوبت با «FOREIGN KEY constraint failed» می‌شکند
    const leavingScheduled = row.status === 'scheduled' && to !== 'scheduled';
    await tx.execute(
      `UPDATE waitlist
          SET status = ?, note = ?,${leavingScheduled ? ' scheduled_appointment_id = NULL,' : ''} updated_at = datetime('now')
        WHERE id = ?`,
      [to, newNote, row.id]
    );
    await audit.logInTransaction(tx, {
      actorId,
      action,
      resourceType: 'waitlist',
      resourceId: row.id,
      changes: {
        status: { from: row.status, to },
        ...(leavingScheduled ? { scheduled_appointment_id: { from: row.scheduled_appointment_id, to: null } } : {})
      }
    });
  }

  const service: WaitlistService = {
    async list(filters: WaitlistListFilters): Promise<WaitlistEntry[]> {
      const conditions: string[] = ['w.deleted_at IS NULL'];
      const params: unknown[] = [];
      if (filters.status) {
        conditions.push('w.status = ?');
        params.push(filters.status);
      }
      if (filters.priority) {
        conditions.push('w.priority = ?');
        params.push(filters.priority);
      }
      if (filters.q && filters.q.trim()) {
        const pattern = `%${filters.q.trim()}%`;
        conditions.push('(w.first_name LIKE ? OR w.last_name LIKE ? OR w.phone LIKE ? OR (w.first_name || \' \' || w.last_name) LIKE ?)');
        params.push(pattern, pattern, pattern, pattern);
      }
      const sql = `${SELECT_BASE} WHERE ${conditions.join(' AND ')} LIMIT ${WAITLIST_LIST_LIMIT}`;
      const rows = await db.query<WaitlistRow>(sql, params);
      return orderWaitlist(rows.map(rowToEntry));
    },

    async getById(id: string): Promise<WaitlistEntry | null> {
      const row = await db.queryOne<WaitlistRow>(`${SELECT_BASE} WHERE w.id = ? AND w.deleted_at IS NULL`, [id]);
      return row ? rowToEntry(row) : null;
    },

    async create(input: NewWaitlistInput, actor: AuthContext): Promise<WaitlistEntry> {
      const id = crypto.randomUUID();
      await db.transaction(async (tx) => {
        // ورودی متصل به پرونده: مشخصات هویتی همیشه از خود دانش‌آموز پر می‌شود
        let identity = {
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          nationalId: input.nationalId ?? null,
          birthDate: input.birthDate ?? null,
          schoolId: input.schoolId ?? null,
          classId: input.classId ?? null
        };
        if (input.studentId) {
          const st = await tx.queryOne<{
            id: string; first_name: string; last_name: string; guardian_phone: string | null;
            national_id: string; birth_date: string | null; school_id: string | null; class_id: string | null; active: number;
          }>(`SELECT id, first_name, last_name, guardian_phone, national_id, birth_date, school_id, class_id, active
                FROM students WHERE id = ?`, [input.studentId]);
          if (!st) throw new NotFoundError('دانش‌آموز');
          if (!st.active) throw new ValidationError('پروندهٔ این دانش‌آموز غیرفعال است');
          const dup = await tx.queryOne<{ id: string }>(
            `SELECT id FROM waitlist WHERE student_id = ? AND status IN ('waiting','called','scheduled') AND deleted_at IS NULL`,
            [input.studentId]
          );
          if (dup) throw new ConflictError('این دانش‌آموز همین حالا در لیست انتظار است', undefined);
          identity = {
            firstName: st.first_name,
            lastName: st.last_name,
            phone: st.guardian_phone ?? input.phone,
            nationalId: st.national_id,
            birthDate: st.birth_date,
            schoolId: st.school_id,
            classId: st.class_id
          };
        }
        await tx.execute(
          `INSERT INTO waitlist (id, first_name, last_name, phone, national_id, birth_date, school_id, class_id,
                                 source, service_type, note, priority, status, call_count, student_id, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'waiting', 0, ?, ?)`,
          [
            id,
            identity.firstName,
            identity.lastName,
            identity.phone,
            identity.nationalId,
            identity.birthDate,
            identity.schoolId,
            identity.classId,
            input.source,
            input.serviceType ?? null,
            input.note ?? null,
            input.priority,
            input.studentId ?? null,
            actor.staffId
          ]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'waitlist.create',
          resourceType: 'waitlist',
          resourceId: id,
          changes: {
            status: { from: null, to: 'waiting' },
            priority: { from: null, to: input.priority },
            source: { from: null, to: input.source },
            student_id: { from: null, to: input.studentId ?? null }
          }
        });
      });
      log.info('waitlist.created');
      const entry = await service.getById(id);
      if (!entry) throw new NotFoundError('ورودی لیست انتظار');
      return entry;
    },

    async update(id: string, patch: UpdateWaitlistInput, actor: AuthContext): Promise<WaitlistEntry> {
      await db.transaction(async (tx) => {
        const row = await loadEntry(tx, id);
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        const sets: string[] = [];
        const params: unknown[] = [];

        const fieldMap: Array<[keyof UpdateWaitlistInput, string]> = [
          ['firstName', 'first_name'],
          ['lastName', 'last_name'],
          ['phone', 'phone'],
          ['nationalId', 'national_id'],
          ['birthDate', 'birth_date'],
          ['schoolId', 'school_id'],
          ['classId', 'class_id'],
          ['source', 'source'],
          ['serviceType', 'service_type'],
          ['note', 'note'],
          ['priority', 'priority']
        ];
        for (const [key, column] of fieldMap) {
          const value = patch[key];
          if (value === undefined) continue;
          const from = row[column as keyof WaitlistRow];
          if (from !== value) {
            sets.push(`${column} = ?`);
            params.push(value ?? null);
            changes[column] = { from, to: value ?? null };
          }
        }

        if (sets.length > 0) {
          sets.push(`updated_at = datetime('now')`);
          await tx.execute(`UPDATE waitlist SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
          await audit.logInTransaction(tx, {
            actorId: actor.staffId,
            action: 'waitlist.update',
            resourceType: 'waitlist',
            resourceId: id,
            changes
          });
        }
      });
      // read-back بعد از commit — خواندن داخل تراکنش مقدار کهنه می‌دهد
      return (await service.getById(id)) as WaitlistEntry;
    },

    async call(id: string, note: string | undefined, actor: AuthContext): Promise<WaitlistEntry> {
      await db.transaction(async (tx) => {
        const row = await loadEntry(tx, id);
        const status = row.status as WaitlistEntry['status'];
        if (status !== 'waiting' && status !== 'called') {
          throw new ConflictError('برای این وضعیت ثبت تماس معنا ندارد', undefined);
        }
        await tx.execute(
          `UPDATE waitlist SET call_count = call_count + 1, last_call_at = ?, note = ?, status = ?, updated_at = datetime('now') WHERE id = ?`,
          [new Date().toISOString(), appendNote(row.note, 'تماس', note), 'called', id]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'waitlist.call',
          resourceType: 'waitlist',
          resourceId: id,
          changes: {
            status: { from: row.status, to: 'called' },
            call_count: { from: row.call_count, to: row.call_count + 1 }
          }
        });
      });
      return (await service.getById(id)) as WaitlistEntry;
    },

    async schedule(id: string, input: WaitlistScheduleInput, actor: AuthContext): Promise<WaitlistScheduleResult> {
      if (input.endAt <= input.startAt) {
        throw new ValidationError('زمان پایان باید بعد از زمان شروع باشد');
      }

      // ۱) تراکنش اتمیک: پرونده (در صورت نیاز) + نوبت + ورودی
      const { studentId, createdStudent, warnings } = await db.transaction(async (tx) => {
        const row = await loadEntry(tx, id);
        if (!canTransition(row.status as WaitlistEntry['status'], 'scheduled')) {
          throw new ConflictError('این ورودی قبلاً نهایی شده و دوباره نوبت‌دهی نمی‌شود', undefined);
        }

        // ۲) تطبیق دانش‌آموز: پروندهٔ متصلِ ورودی > student_id صریح > national_id > تلفن ولیّ
        let studentId: string;
        let createdStudent: boolean;
        if (row.student_id) {
          // ورودی متصل: پرونده از قبل مشخص است (تیک «منتظر دریافت خدمت»)
          const hit = await tx.queryOne<{ id: string }>(`SELECT id FROM students WHERE id = ? AND active = 1`, [row.student_id]);
          if (!hit) throw new NotFoundError('دانش‌آموز');
          studentId = hit.id;
          createdStudent = false;
        } else if (input.studentId) {
          // پروندهٔ صریح — فقط بررسی وجود و فعال بودن
          const hit = await tx.queryOne<{ id: string }>(`SELECT id FROM students WHERE id = ? AND active = 1`, [input.studentId]);
          if (!hit) throw new NotFoundError('دانش‌آموز');
          studentId = hit.id;
          createdStudent = false;
        } else {
          const candidates = await tx.query<{ id: string; nationalId: string | null; guardianPhone: string | null }>(
            `SELECT id, national_id AS nationalId, guardian_phone AS guardianPhone
               FROM students WHERE active = 1`
          );
          const match = matchStudent(
            { nationalId: input.nationalId ?? row.national_id ?? undefined, phone: row.phone },
            candidates
          );

          if (match.kind === 'ambiguous') {
            throw new ConflictError('چند پرونده با این شماره تلفن پیدا شد — دانش‌آموز را صریح انتخاب کنید', undefined);
          }
          if (match.kind === 'national_id' || match.kind === 'phone') {
            studentId = match.studentId;
            createdStudent = false;
          } else {
            // ۳) پروندهٔ جدید — کد ملی لازم است (students.national_id NOT NULL UNIQUE)
            const nid = input.nationalId ?? row.national_id;
            if (!nid) {
              throw new ValidationError('برای ساخت پروندهٔ جدید کد ملی لازم است — ابتدا کد ملی را از خانواده بگیرید یا پروندهٔ موجود را انتخاب کنید');
            }
            const student = await deps.students.createStudentWithin(
              tx,
              {
                nationalId: nid,
                firstName: row.first_name,
                lastName: row.last_name,
                birthDate: row.birth_date ?? undefined,
                schoolId: row.school_id ?? undefined,
                classId: row.class_id ?? undefined,
                guardianPhone: row.phone,
                // «دانش‌آموز به هر همکاری داده شد…»: درمانگرِ نوبتِ اول، مسئول پرونده می‌شود
                ownerStaffId: input.staffId
              },
              actor
            );
            studentId = student.id;
            createdStudent = true;
          }
        }

        // ۴) نوبت واقعی از همان منطق appointment-core (بدون duplicate)
        const { appointment, warnings } = await deps.appointments.createWithinTx(
          tx,
          {
            staffId: input.staffId,
            startAt: input.startAt,
            endAt: input.endAt,
            note: input.note,
            students: [{ studentId }]
          },
          actor
        );

        // ۵) به‌روزرسانی ورودی + audit — همه در همان batch
        await tx.execute(
          `UPDATE waitlist SET status = 'scheduled', scheduled_appointment_id = ?, admitted_student_id = ?, updated_at = datetime('now') WHERE id = ?`,
          [appointment.id, studentId, id]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'waitlist.schedule',
          resourceType: 'waitlist',
          resourceId: id,
          changes: {
            status: { from: row.status, to: 'scheduled' },
            appointment_id: { from: null, to: appointment.id },
            student_id: { from: null, to: studentId },
            student_created: { from: null, to: createdStudent }
          }
        });

        return { studentId, createdStudent, warnings };
      });

      // ۶) بعد از commit: read-back + اعلان از مسیر observer نوبت (best-effort)
      const entry = await service.getById(id);
      if (!entry) throw new NotFoundError('ورودی لیست انتظار');
      const appointment = await deps.appointments.getById(entry.scheduledAppointmentId as string);
      if (!appointment) throw new NotFoundError('نوبت');
      const student = (await deps.students.getStudentById(studentId)) ?? null;
      await deps.appointments.notifyCreated(appointment);
      log.info('waitlist.scheduled', { createdStudent });

      return {
        entry,
        appointment,
        student: student as NonNullable<typeof student>,
        warnings
      };
    },

    /**
     * — تیک «منتظر دریافت خدمت» روی پروندهٔ دانش‌آموز:
     * awaiting=true → ساخت ورودی متصل (یا به‌روزرسانی منبع/نوع خدمت/اولویت همان)
     * awaiting=false → لغو ورودی(های) باز متصل (خروج از لیست انتظار)
     * پاسخ null = هیچ تغییری لازم نبود (idempotent)
     */
    async setStudentWaiting(studentId: string, input: StudentWaitStatusInput, actor: AuthContext): Promise<WaitlistEntry | null> {
      const resultId = await db.transaction(async (tx): Promise<string | null> => {
        const st = await tx.queryOne<{
          id: string; first_name: string; last_name: string; guardian_phone: string | null;
          national_id: string; birth_date: string | null; school_id: string | null; class_id: string | null; active: number;
        }>(`SELECT id, first_name, last_name, guardian_phone, national_id, birth_date, school_id, class_id, active
              FROM students WHERE id = ?`, [studentId]);
        if (!st) throw new NotFoundError('دانش‌آموز');
        if (!st.active) throw new ValidationError('پروندهٔ این دانش‌آموز غیرفعال است');

        const open = await tx.query<{ id: string; status: string; source: string; service_type: string | null; priority: string }>(
          `SELECT id, status, source, service_type, priority FROM waitlist
            WHERE student_id = ? AND status IN ('waiting','called','scheduled') AND deleted_at IS NULL
            ORDER BY created_at`,
          [studentId]
        );

        if (input.awaiting) {
          if (open.length > 0) {
            // ورودی باز موجود — فقط منبع/نوع خدمت/اولویت را همگام کن (idempotent)
            const row = open[0];
            const changes: Record<string, { from: unknown; to: unknown }> = {};
            if (row.source !== input.source) changes.source = { from: row.source, to: input.source };
            if ((row.service_type ?? null) !== (input.serviceType ?? null)) changes.service_type = { from: row.service_type, to: input.serviceType ?? null };
            if (row.priority !== input.priority) changes.priority = { from: row.priority, to: input.priority };
            if (Object.keys(changes).length > 0) {
              await tx.execute(
                `UPDATE waitlist SET source = ?, service_type = ?, priority = ?, updated_at = datetime('now') WHERE id = ?`,
                [input.source, input.serviceType ?? null, input.priority, row.id]
              );
              await audit.logInTransaction(tx, {
                actorId: actor.staffId,
                action: 'waitlist.waiting_set',
                resourceType: 'waitlist',
                resourceId: row.id,
                changes: { ...changes, student_id: { from: null, to: studentId } }
              });
              return row.id;
            }
            return null;
          }
          // ورودی جدید — هویت از پرونده
          if (!st.guardian_phone) {
            throw new ValidationError('برای افزودن به لیست انتظار، تلفن ولیّ در پرونده لازم است');
          }
          const id = crypto.randomUUID();
          await tx.execute(
            `INSERT INTO waitlist (id, first_name, last_name, phone, national_id, birth_date, school_id, class_id,
                                   source, service_type, priority, status, call_count, student_id, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'waiting', 0, ?, ?)`,
            [id, st.first_name, st.last_name, st.guardian_phone, st.national_id, st.birth_date, st.school_id, st.class_id,
             input.source, input.serviceType ?? null, input.priority, studentId, actor.staffId]
          );
          await audit.logInTransaction(tx, {
            actorId: actor.staffId,
            action: 'waitlist.waiting_set',
            resourceType: 'waitlist',
            resourceId: id,
            changes: { status: { from: null, to: 'waiting' }, student_id: { from: null, to: studentId } }
          });
          return id;
        }

        // awaiting=false — لغو همهٔ ورودی‌های باز متصل
        let lastId: string | null = null;
        for (const row of open) {
          const full = await loadEntry(tx, row.id);
          await transitionEntry(tx, full, 'cancelled', 'waitlist.waiting_cleared', actor.staffId, {
            label: 'از لیست انتظار برداشته شد'
          });
          lastId = row.id;
        }
        return lastId;
      });

      if (!resultId) return null;
      return service.getById(resultId);
    },

    async reject(id: string, reason: string | undefined, actor: AuthContext): Promise<WaitlistEntry> {
      await db.transaction(async (tx) => {
        const row = await loadEntry(tx, id);
        await transitionEntry(tx, row, 'rejected', 'waitlist.reject', actor.staffId, {
          label: 'رد شد',
          text: reason
        });
        // فاز ۳ — هوک §37: رد ورودی → پیگیری با مسئول/مهلت (پیشنهاد کاربر) — همان تراکنش
        await deps.followups.createWithinTx(
          tx,
          {
            entityType: 'waitlist',
            entityId: row.id,
            studentId: row.admitted_student_id,
            title: `پیگیری متقاضی ردشده — ${row.first_name} ${row.last_name}`,
            assigneeId: actor.staffId
          },
          actor
        );
      });
      return (await service.getById(id)) as WaitlistEntry;
    },

    async noShow(id: string, actor: AuthContext): Promise<WaitlistEntry> {
      await db.transaction(async (tx) => {
        const row = await loadEntry(tx, id);
        await transitionEntry(tx, row, 'no_show', 'waitlist.no_show', actor.staffId);
        // فاز ۳ — هوک §37: مراجعه‌کنندهٔ نیامده → پیگیری با مسئول/مهلت — همان تراکنش
        await deps.followups.createWithinTx(
          tx,
          {
            entityType: 'waitlist',
            entityId: row.id,
            studentId: row.admitted_student_id,
            title: `پیگیری مراجعه‌کنندهٔ نیامده — ${row.first_name} ${row.last_name}`,
            assigneeId: actor.staffId
          },
          actor
        );
      });
      return (await service.getById(id)) as WaitlistEntry;
    },

    async cancel(id: string, actor: AuthContext): Promise<WaitlistEntry> {
      await db.transaction(async (tx) => {
        const row = await loadEntry(tx, id);
        await transitionEntry(tx, row, 'cancelled', 'waitlist.cancel', actor.staffId);
      });
      return (await service.getById(id)) as WaitlistEntry;
    },

    // بازگشت خروجِ اشتباه به صف (رد/نیامد/انصراف → در انتظار) — تعیین وضعیت شفاف
    async reopen(id: string, note: string | undefined, actor: AuthContext): Promise<WaitlistEntry> {
      await db.transaction(async (tx) => {
        const row = await loadEntry(tx, id);
        await transitionEntry(tx, row, 'waiting', 'waitlist.reopen', actor.staffId, {
          label: 'بازگشت به صف انتظار',
          text: note
        });
      });
      return (await service.getById(id)) as WaitlistEntry;
    },

    async reorder(ids: string[], actor: AuthContext): Promise<WaitlistEntry[]> {
      if (new Set(ids).size !== ids.length) {
        throw new ValidationError('شناسه‌های تکراری در ترتیب دستی مجاز نیست');
      }
      await db.transaction(async (tx) => {
        for (let i = 0; i < ids.length; i++) {
          const row = await loadEntry(tx, ids[i]);
          if (row.status !== 'waiting' && row.status !== 'called') {
            throw new ValidationError('فقط ورودی‌های در انتظار قابل ترتیب‌دستی هستند');
          }
          await tx.execute(`UPDATE waitlist SET manual_order = ?, updated_at = datetime('now') WHERE id = ?`, [i + 1, ids[i]]);
        }
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'waitlist.reorder',
          resourceType: 'waitlist',
          resourceId: ids[0],
          changes: { order: { from: null, to: ids.length } }
        });
      });
      return service.list({});
    },

    async autoOrder(actor: AuthContext): Promise<WaitlistEntry[]> {
      await db.transaction(async (tx) => {
        await tx.execute(`UPDATE waitlist SET manual_order = NULL WHERE deleted_at IS NULL`);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'waitlist.auto_order',
          resourceType: 'waitlist',
          resourceId: '*',
          changes: { order: { from: 'manual', to: 'auto' } }
        });
      });
      return service.list({});
    },

    async badge(): Promise<WaitlistBadge> {
      const row = await db.queryOne<{ overdue: number | null; urgent: number | null; waiting: number | null }>(
        `SELECT SUM(CASE WHEN status IN ('waiting','called') AND julianday('now') - julianday(created_at) >= ? THEN 1 ELSE 0 END) AS overdue,
                SUM(CASE WHEN status = 'waiting' AND priority = 'urgent' THEN 1 ELSE 0 END) AS urgent,
                SUM(CASE WHEN status IN ('waiting','called') THEN 1 ELSE 0 END) AS waiting
           FROM waitlist
          WHERE deleted_at IS NULL`,
        [WAITLIST_ALERT_DAYS]
      );
      return {
        overdue: row?.overdue ?? 0,
        urgent: row?.urgent ?? 0,
        waiting: row?.waiting ?? 0
      };
    },

    async softDelete(id: string, actor: AuthContext): Promise<void> {
      await db.transaction(async (tx) => {
        const row = await loadEntry(tx, id);
        await tx.execute(`UPDATE waitlist SET deleted_at = ?, updated_at = datetime('now') WHERE id = ?`, [
          new Date().toISOString(),
          id
        ]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'waitlist.delete',
          resourceType: 'waitlist',
          resourceId: id,
          changes: { status: { from: row.status, to: 'deleted' } }
        });
      });
      log.info('waitlist.deleted', { id });
    },

    async onAttendanceMarked(appointmentId: string, studentId: string, status: string): Promise<void> {
      try {
        // تأخیر هم «اولین جلسهٔ واقعی» است (دانش‌آموز آمده، فقط دیررس)
        if (status !== 'present' && status !== 'late') return;
        // پذیرش خودکار: هم نوبتِ متصلِ کلاسیک و هم هر ورودیِ بازِ متصل به همین پرونده
        // «پذیرش = خروج از لیست انتظار» به دستور کاربر: ورودی با اولین جلسهٔ واقعی
        // از لیست پاک می‌شود (soft delete — تاریخچه در audit و تایم‌لاین می‌ماند) و پرونده
        // که از قبل ساخته شده در «دانش‌آموزان» فعال دیده می‌شود.
        const rows = await db.query<{ id: string; status: string }>(
          `SELECT id, status FROM waitlist
            WHERE deleted_at IS NULL AND status IN ('waiting','called','scheduled')
              AND (
                (scheduled_appointment_id = ? AND admitted_student_id = ? AND status = 'scheduled')
                OR (student_id = ?)
              )`,
          [appointmentId, studentId, studentId]
        );
        if (rows.length === 0) return;
        for (const row of rows) {
          if (!canTransition(row.status as WaitlistEntry['status'], 'admitted')) continue;
          await db.execute(
            `UPDATE waitlist SET status = 'admitted', deleted_at = ?, updated_at = datetime('now') WHERE id = ?`,
            [new Date().toISOString(), row.id]
          );
          await audit.log({
            actorId: 'system',
            action: 'waitlist.admitted',
            resourceType: 'waitlist',
            resourceId: row.id,
            changes: { status: { from: row.status, to: 'admitted' }, removed_from_list: { from: null, to: true } }
          });
          log.info('waitlist.admitted', { appointmentId, waitlistId: row.id, from: row.status });
        }
      } catch (err) {
        // ناظر هرگز عملیات اصلی (ثبت حضور) را شکست نمی‌دهد
        log.warn('waitlist.admission.observer.failed', {
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
  };

  return service;
}

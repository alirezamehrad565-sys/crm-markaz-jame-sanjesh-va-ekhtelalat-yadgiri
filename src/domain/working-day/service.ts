/**
 * ماژول بورد روز کاری — سرویس اصلی و منطق کسب‌وکار
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// بورد «مدیریت روز کاری در یک نگاه»
// مالک WRITE جدول day_notes؛ بقیه فقط-خواندنی (appointment-core مالک نوبت‌ها است)
// قواعد:
// - بورد هر تاریخی قابل مشاهده است (مرور گذشته/آینده)
// - ثبت حضور همکاران فقط امروز تهران — همان قاعده (این ماژول مسئول آن نیست؛
// ثبت از طریق StaffAttendanceService انجام می‌شود)
// - توضیحات روز append-only: هر ثبت با نویسنده + زمان؛ حذف فقط مدیر
// - audit هم‌تراکنش (قانون ۴)

import type {
  AuthContext,
  DayNote,
  DayNoteKind,
  WorkingDayAppointment,
  WorkingDayAppointmentStudent,
  WorkingDayBoard,
  WorkingDaySessionStats,
  WorkingDayStaffColumn,
  StaffAttendanceStatus
} from '@core/shared';
import { OPS_QUEUE_WINDOW_MINUTES, iranianWeekdayOfYmd, tehranDayRange, tehranTodayYmd } from '@core/shared';
import { NotFoundError, ValidationError } from '@core/errors';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { DbClient } from '@core/db';
import {
  buildQueue,
  groupAppointmentsByStaff,
  normalizeDayNoteBody,
  opsStatsFromAppointments,
  sessionStatsFromAppointments
} from './pure';
import type { StaffAttendanceService } from '@domain/attendance';

export interface WorkingDayDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
  /** خلاصه حضور همکاران همان روز (قاعده «فقط امروز» مالکش است) */
  staffAttendance: StaffAttendanceService;
}

export interface WorkingDayService {
  /**
   * — بازیگر اختیاری: درمانگر بورد را فقط برای خودش می‌بیند
   * (ستون خودش + آمار همان + بدون «سایر نوبت‌ها»)؛ دفتر کل مرکز را می‌بیند.
   */
  getBoard(date: string, actor?: AuthContext): Promise<WorkingDayBoard>;
  addNote(date: string, body: string, actor: AuthContext): Promise<DayNote>;
  deleteNote(id: string, actor: AuthContext): Promise<void>;
}

interface StaffRow {
  id: string;
  full_name: string;
  role: string;
}

interface AttendanceRow {
  staff_id: string;
  status: StaffAttendanceStatus;
  note: string | null;
  updated_at: string;
}

interface HoursRow {
  staff_id: string;
  start_minute: number;
  end_minute: number;
}

interface BoardApptRow {
  id: string;
  staff_id: string | null;
  start_at: string;
  end_at: string;
  status: 'scheduled' | 'cancelled';
  /** فاز ۱ (تصمیم D1) — NULL = برنامه‌ریزی‌شدهٔ عادی */
  ops_status: string | null;
  note: string | null;
  version: number;
  student_id: string | null;
  student_attendance: string | null;
  student_name: string | null;
  /** — موبایل ولیّ برای تماس سریع از بورد */
  student_phone: string | null;
}

interface NoteRow {
  id: string;
  date: string;
  body: string;
  /** فاز ۱ (تصمیم D2) — human/system */
  kind: string;
  created_by: string;
  created_at: string;
  creator_name: string;
}

/** تبدیل ردیف‌های join شده نوبت+دانش‌آموز به نوبت‌های بورد — pure */
export function rowsToAppointments(rows: BoardApptRow[]): WorkingDayAppointment[] {
  const byId = new Map<string, WorkingDayAppointment>();
  for (const r of rows) {
    let appt = byId.get(r.id);
    if (!appt) {
      appt = {
        id: r.id,
        staffId: r.staff_id ?? '',
        startAt: r.start_at,
        endAt: r.end_at,
        status: r.status,
        opsStatus: (r.ops_status ?? null) as WorkingDayAppointment['opsStatus'],
        note: r.note,
        version: r.version,
        students: []
      };
      byId.set(r.id, appt);
    }
    if (r.student_id) {
      const student: WorkingDayAppointmentStudent = {
        studentId: r.student_id,
        name: r.student_name ?? '',
        attendance: (r.student_attendance ?? 'pending') as WorkingDayAppointmentStudent['attendance'],
        phone: r.student_phone ?? null
      };
      appt.students.push(student);
    }
  }
  return [...byId.values()];
}

export function createWorkingDayService(deps: WorkingDayDeps): WorkingDayService {
  const { db, audit, logger } = deps;
  const log = logger.child('working-day');

  return {
    async getBoard(date: string, actor?: AuthContext): Promise<WorkingDayBoard> {
      // درمانگر فقط کارت خودش: ستون‌ها/آمار/صف نسبت به خودش اشتقاق می‌یابند
      const therapistStaffId = actor?.role === 'therapist' ? actor.staffId : null;
      const weekday = iranianWeekdayOfYmd(date);
      const range = tehranDayRange(date);
      const isToday = date === tehranTodayYmd();

      const [staffRows, attendanceRows, hoursRows, apptRows, noteRows, summary, assessmentRows] = await Promise.all([
        db.query<StaffRow>(`SELECT id, full_name, role FROM staff WHERE active = 1 ORDER BY full_name`, []),
        db.query<AttendanceRow>(
          `SELECT staff_id, status, note, updated_at FROM staff_attendance WHERE date = ?`,
          [date]
        ),
        db.query<HoursRow>(
          `SELECT staff_id, start_minute, end_minute FROM working_hours WHERE weekday = ? ORDER BY staff_id, start_minute`,
          [weekday]
        ),
        db.query<BoardApptRow>(
          `SELECT a.id, a.staff_id, a.start_at, a.end_at, a.status, a.ops_status, a.note, a.version,
                  s.student_id, s.attendance AS student_attendance,
                  st.first_name || ' ' || st.last_name AS student_name,
                  st.guardian_phone AS student_phone
             FROM appointments a
             LEFT JOIN appointment_students s ON s.appointment_id = a.id
             LEFT JOIN students st ON st.id = s.student_id
            WHERE a.start_at >= ? AND a.start_at < ?
            ORDER BY a.start_at, s.student_id`,
          [range.start, range.end]
        ),
        db.query<NoteRow>(
          `SELECT n.id, n.date, n.body, n.kind, n.created_by, n.created_at,
                  st.full_name AS creator_name
             FROM day_notes n
             JOIN staff st ON st.id = n.created_by
            WHERE n.date = ?
            ORDER BY n.created_at DESC, n.id DESC`,
          [date]
        ),
        deps.staffAttendance.daySummary(date),
        // شمارش رویدادهای پروندهٔ همان روز (نوار وضعیت بورد §7.1) — فقط-خواندنی
        // (assessments بازنشسته شد؛ مرز روز تهران از tehranDayRange می‌آید)
        // برای درمانگر فقط گزارش‌های خودش شمرده می‌شود
        db.query<{ n: number }>(
          therapistStaffId
            ? `SELECT COUNT(*) AS n
                 FROM case_events e
                 JOIN case_event_types t ON t.id = e.event_type_id
                WHERE t.category = 'session' AND e.status != 'cancelled'
                  AND e.occurred_at >= ? AND e.occurred_at < ?
                  AND e.staff_id = ?`
            : `SELECT COUNT(*) AS n
                 FROM case_events e
                 JOIN case_event_types t ON t.id = e.event_type_id
                WHERE t.category = 'session' AND e.status != 'cancelled'
                  AND e.occurred_at >= ? AND e.occurred_at < ?`,
          therapistStaffId ? [range.start, range.end, therapistStaffId] : [range.start, range.end]
        )
      ]);

      const allAppointments = rowsToAppointments(apptRows);
      // scope درمانگر: فقط نوبت‌های خودش؛ «سایر نوبت‌ها» دفتر است
      const appointments = therapistStaffId
        ? allAppointments.filter((a) => a.staffId === therapistStaffId)
        : allAppointments;
      const visibleStaffRows = therapistStaffId
        ? staffRows.filter((s) => s.id === therapistStaffId)
        : staffRows;
      const knownStaffIds = new Set(visibleStaffRows.map((s) => s.id));
      const { byStaff, unassigned: allUnassigned } = groupAppointmentsByStaff(appointments, knownStaffIds);
      const unassigned = therapistStaffId ? [] : allUnassigned;

      const attendanceByStaff = new Map(attendanceRows.map((r) => [r.staff_id, r]));
      const hoursByStaff = new Map<string, { startMinute: number; endMinute: number }[]>();
      for (const h of hoursRows) {
        const list = hoursByStaff.get(h.staff_id) ?? [];
        list.push({ startMinute: h.start_minute, endMinute: h.end_minute });
        hoursByStaff.set(h.staff_id, list);
      }

      const columns: WorkingDayStaffColumn[] = visibleStaffRows.map((s) => {
        const att = attendanceByStaff.get(s.id);
        return {
          staffId: s.id,
          fullName: s.full_name,
          role: s.role as WorkingDayStaffColumn['role'],
          attendance: att
            ? { status: att.status, note: att.note, updatedAt: att.updated_at }
            : null,
          dayHours: hoursByStaff.get(s.id) ?? [],
          appointments: byStaff.get(s.id) ?? []
        };
      });

      const notes: DayNote[] = noteRows.map((n) => ({
        id: n.id,
        date: n.date,
        body: n.body,
        kind: (n.kind === 'system' ? 'system' : 'human') as DayNoteKind,
        createdBy: n.created_by,
        creatorName: n.creator_name,
        createdAt: n.created_at
      }));

      const sessionStats: WorkingDaySessionStats = sessionStatsFromAppointments(appointments);

      // ─── فاز ۱: نوار وضعیت عملیاتی + صف ۶۰ دقیقه (Projection از همان نوبت‌ها) ───
      const opsStats = opsStatsFromAppointments(appointments);
      const staffNameById = new Map(staffRows.map((s) => [s.id, s.full_name]));
      const staffNameOf = (staffId: string): string => staffNameById.get(staffId) ?? '—';
      // صف فقط برای «امروز» معنا دارد؛ مرور گذشته/آینده خالی برمی‌گردد
      const queue = isToday
        ? buildQueue(appointments, new Date().toISOString(), {
            windowMinutes: OPS_QUEUE_WINDOW_MINUTES,
            staffNameOf
          })
        : [];

      return {
        date,
        weekday,
        isToday,
        summary,
        sessionStats,
        opsStats,
        queue,
        assessmentsToday: assessmentRows[0]?.n ?? 0,
        staff: columns,
        unassigned,
        notes
      };
    },

    async addNote(date: string, body: string, actor: AuthContext): Promise<DayNote> {
      const normalized = normalizeDayNoteBody(body);
      if (normalized.length < 2) {
        throw new ValidationError('متن توضیحات حداقل ۲ نویسه است');
      }

      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();

      await db.transaction(async (tx) => {
        await tx.execute(
          `INSERT INTO day_notes (id, date, body, created_by, created_at) VALUES (?, ?, ?, ?, ?)`,
          [id, date, normalized, actor.staffId, createdAt]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'day_note.create',
          resourceType: 'day_note',
          resourceId: id,
          changes: {
            date: { from: null, to: date },
            body: { from: null, to: normalized.slice(0, 120) }
          }
        });
      });

      log.info('day_note.created', { date });
      return {
        id,
        date,
        body: normalized,
        kind: 'human' as DayNoteKind,
        createdBy: actor.staffId,
        creatorName: actor.displayName,
        createdAt
      };
    },

    async deleteNote(id: string, actor: AuthContext): Promise<void> {
      await db.transaction(async (tx) => {
        const row = await tx.queryOne<NoteRow>(
          `SELECT n.id, n.date, n.body, n.created_by, n.created_at,
                  st.full_name AS creator_name
             FROM day_notes n JOIN staff st ON st.id = n.created_by
            WHERE n.id = ?`,
          [id]
        );
        if (!row) throw new NotFoundError('توضیحات روز');
        await tx.execute(`DELETE FROM day_notes WHERE id = ?`, [id]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'day_note.delete',
          resourceType: 'day_note',
          resourceId: id,
          changes: {
            date: { from: row.date, to: null },
            body: { from: row.body.slice(0, 120), to: null }
          }
        });
      });
      log.info('day_note.deleted', { id });
    }
  };
}

import type {
  AdvancedReport,
  PeriodReport,
  ReportSchoolRow,
  ReportTagRow,
  StaffRole
} from '@core/shared';
import type { DbClient } from '@core/db';
import type { Logger } from '@core/logger';
import { tehranRange } from '@core/shared';
import { effectiveContentFormula, productionScoreOf, SCORING_CONFIG_KEY } from '../../../worker/scoring.js';
import {
  avgWaitDaysOf,
  buildDaySeries,
  buildPerStaff,
  buildTopStudents,
  buildWeeklyTrend,
  safeRate,
  safeRateOrNull
} from './pure';
import type { ApptMinuteRow, StudentSessionRow } from './pure';

async function readScoringWeights(db: DbClient): Promise<Record<string, number> | undefined> {
  try {
    const row = await db.queryOne<{ value: string }>(
      `SELECT value FROM settings WHERE key = ?`,
      [SCORING_CONFIG_KEY]
    );
    if (!row) return undefined;
    const parsed = JSON.parse(row.value) as { weights?: unknown };
    return parsed?.weights && typeof parsed.weights === 'object'
      ? (parsed.weights as Record<string, number>)
      : undefined;
  } catch {
    return undefined;
  }
}

export interface ReportDeps {
  db: DbClient;
  logger: Logger;
}

export interface ReportService {
  getReport(from: string, to: string): Promise<PeriodReport>;
  getAdvancedReport(from: string, to: string): Promise<AdvancedReport>;
}

export function createReportService(deps: ReportDeps): ReportService {
  const { db, logger } = deps;

  return {
    async getReport(from, to) {
      const range = tehranRange(from, to);

      const apptRows = await db.query<{ id: string; staff_id: string; start_at: string; end_at: string; status: string }>(
        `SELECT id, staff_id, start_at, end_at, status
           FROM appointments
          WHERE start_at >= ? AND start_at <= ?`,
        [range.start, range.end]
      );

      const attRows = await db.query<{ attendance: string; appt_status: string }>(
        `SELECT s.attendance, a.status AS appt_status
           FROM appointment_students s
           JOIN appointments a ON a.id = s.appointment_id
          WHERE a.start_at >= ? AND a.start_at <= ?`,
        [range.start, range.end]
      );
      const attendance = { present: 0, absent: 0, late: 0, pending: 0, cancelled: 0 };
      for (const r of attRows) {
        if (r.appt_status === 'cancelled') attendance.cancelled++;
        else if (r.attendance === 'present') attendance.present++;
        else if (r.attendance === 'late') attendance.late++; //
        else if (r.attendance === 'absent') attendance.absent++;
        else attendance.pending++;
      }

      const staffAttRows = await db.query<{ status: string }>(
        `SELECT status FROM staff_attendance WHERE date >= ? AND date <= ?`,
        [from, to]
      );
      const staffAttendance = { present: 0, absent: 0, late: 0, leave: 0, sick: 0 };
      for (const r of staffAttRows) {
        if (r.status === 'present') staffAttendance.present++;
        else if (r.status === 'absent') staffAttendance.absent++;
        else if (r.status === 'late') staffAttendance.late++; //
        else if (r.status === 'leave') staffAttendance.leave++;
        else if (r.status === 'sick') staffAttendance.sick++;
      }

      const staffRows = await db.query<{ id: string; full_name: string; role: string }>(
        `SELECT id, full_name, role FROM staff`
      );
      const staffNames = new Map(staffRows.map((s) => [s.id, s.full_name]));
      const staffRoles = new Map<string, StaffRole>(
        staffRows.map((s) => [s.id, (['manager', 'therapist', 'secretary'].includes(s.role) ? s.role : 'therapist') as StaffRole])
      );

      const schedRows = await db.query<{ wl_created: string; appt_created: string }>(
        `SELECT strftime('%Y-%m-%dT%H:%M:%SZ', w.created_at) AS wl_created,
                strftime('%Y-%m-%dT%H:%M:%SZ', a.created_at) AS appt_created
           FROM waitlist w
           JOIN appointments a ON a.id = w.scheduled_appointment_id
          WHERE w.deleted_at IS NULL AND a.created_at >= ? AND a.created_at <= ?`,
        [range.start, range.end]
      );
      const waitSchedule = {
        scheduled: schedRows.length,
        avgDays: avgWaitDaysOf(schedRows.map((r) => ({ createdAt: r.wl_created, admittedAt: r.appt_created })))
      };

      const practicalRow = await db.queryOne<{
        exercises: number;
        packages: number;
        templates: number;
        forms: number;
      }>(
        `SELECT
           (SELECT SUM(CASE WHEN team_created = 1 THEN 0.5 ELSE 1 END) FROM exercises WHERE deleted_at IS NULL AND created_at >= ? AND created_at <= ?) AS exercises,
           (SELECT COUNT(*) FROM exercise_packages WHERE deleted_at IS NULL AND created_at >= ? AND created_at <= ?) AS packages,
           (SELECT COUNT(*) FROM pathway_templates WHERE active = 1 AND created_at >= ? AND created_at <= ?) AS templates,
           (SELECT COUNT(*) FROM case_event_types WHERE is_system = 0 AND active = 1 AND created_at >= ? AND created_at <= ?) AS forms`,
        [range.start, range.end, range.start, range.end, range.start, range.end, range.start, range.end]
      );
      const practicalCounts = {
        exercises: practicalRow?.exercises ?? 0,
        packages: practicalRow?.packages ?? 0,
        templates: practicalRow?.templates ?? 0,
        forms: practicalRow?.forms ?? 0
      };
      const practical = {
        ...practicalCounts,
        score: productionScoreOf(practicalCounts, effectiveContentFormula(await readScoringWeights(db)))
      };

      const studentSessionRows = await db.query<StudentSessionRow>(
        `SELECT s.student_id, st.first_name || ' ' || st.last_name AS student_name,
                s.attendance, a.status AS appt_status
           FROM appointment_students s
           JOIN appointments a ON a.id = s.appointment_id
           JOIN students st ON st.id = s.student_id
          WHERE a.start_at >= ? AND a.start_at <= ?`,
        [range.start, range.end]
      );

      const tagRows = await db.query<{ id: string; name: string; category: string; count: number }>(
        `SELECT t.id, t.name, t.category, COUNT(st.student_id) AS count
           FROM tags t
           JOIN student_tags st ON st.tag_id = t.id
           JOIN students s ON s.id = st.student_id AND s.active = 1
          GROUP BY t.id
          ORDER BY count DESC
          LIMIT 8`
      );
      const topTags: ReportTagRow[] = tagRows.map((r) => ({
        tagId: r.id,
        name: r.name,
        category: r.category as ReportTagRow['category'],
        count: r.count
      }));

      const newStudentsRow = await db.queryOne<{ n: number }>(
        `SELECT COUNT(*) AS n FROM students
          WHERE created_at >= ? AND created_at <= ?`,
        [range.start, range.end]
      );

      const schoolRows = await db.query<{ id: string; name: string; students: number }>(
        `SELECT sc.id, sc.name, COUNT(st.id) AS students
           FROM schools sc
           JOIN students st ON st.school_id = sc.id AND st.active = 1
          GROUP BY sc.id
          ORDER BY students DESC, sc.name ASC`
      );
      const schools: ReportSchoolRow[] = schoolRows.map((r) => ({
        schoolId: r.id,
        name: r.name,
        students: r.students
      }));

      const servedRows = studentSessionRows.filter((r) => r.apptStatus !== 'cancelled');
      const servedStudents = new Set(servedRows.map((r) => r.studentId)).size;
      const perStudent = {
        sessions: servedRows.length,
        students: servedStudents,
        avgSessions: servedStudents > 0 ? Math.round((servedRows.length / servedStudents) * 10) / 10 : null
      };

      const total = apptRows.length;
      const cancelled = apptRows.filter((a) => a.status === 'cancelled').length;
      const totalMinutes = apptRows
        .filter((a) => a.status !== 'cancelled')
        .reduce((acc, a) => acc + Math.max(0, (Date.parse(a.end_at) - Date.parse(a.start_at)) / 60000), 0);
      const dayCount = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / (24 * 60 * 60 * 1000)) + 1);

      const report: PeriodReport = {
        from,
        to,
        generatedAt: new Date().toISOString(),
        appointments: {
          total,
          scheduled: total - cancelled,
          cancelled,
          cancellationRate: safeRate(cancelled, total),
          hours: Math.round((totalMinutes / 60) * 10) / 10,
          avgPerDay: Math.round((total / dayCount) * 100) / 100
        },
        attendance: {
          ...attendance,
          absenceRate: safeRate(attendance.absent, attendance.present + attendance.late + attendance.absent)
        },
        staffAttendance: {
          ...staffAttendance,
          unmarked: 0, // در سطح بازه شمارش unmarked بی‌معناست — فقط ثبت‌شده‌ها
          attendanceRate: safeRate(staffAttendance.present + staffAttendance.late, staffAttendance.present + staffAttendance.late + staffAttendance.absent + staffAttendance.leave + staffAttendance.sick)
        },
        newStudents: newStudentsRow?.n ?? 0,
        byDay: buildDaySeries(
          apptRows.map((a) => ({ startAt: a.start_at, status: a.status })),
          from,
          to
        ),
        perStaff: buildPerStaff(
          apptRows.map((a): ApptMinuteRow => ({ appointmentId: a.id, staffId: a.staff_id, startAt: a.start_at, endAt: a.end_at, status: a.status })),
          staffNames,
          staffRoles
        ),
        waitSchedule,
        perStudent,
        practical,
        topStudents: buildTopStudents(studentSessionRows),
        topTags,
        schools
      };

      logger.child('reports').info('report.generated', { from, to, total });
      return report;
    },

    async getAdvancedReport(from, to) {
      const range = tehranRange(from, to);

      const apptRows = await db.query<{ start_at: string; status: string; ops_status: string | null }>(
        `SELECT start_at, status, ops_status FROM appointments
          WHERE start_at >= ? AND start_at <= ?`,
        [range.start, range.end]
      );
      const attRows = await db.query<{ start_at: string; attendance: string; appt_status: string }>(
        `SELECT a.start_at, s.attendance, a.status AS appt_status
           FROM appointment_students s
           JOIN appointments a ON a.id = s.appointment_id
          WHERE a.start_at >= ? AND a.start_at <= ?`,
        [range.start, range.end]
      );
      const weeks = buildWeeklyTrend(
        apptRows.map((a) => ({ startAt: a.start_at, status: a.status, opsStatus: a.ops_status })),
        attRows.map((r) => ({ startAt: r.start_at, attendance: r.attendance, apptStatus: r.appt_status })),
        from,
        to
      );

      const wlRows = await db.query<{ status: string; created_at: string }>(
        `SELECT status, created_at FROM waitlist`
      );

      const wlIdRows = await db.query<{ id: string; status: string; created_at: string }>(
        `SELECT id, status, created_at FROM waitlist WHERE status = 'admitted'`
      );
      const firstAdmitted = new Map<string, string>();
      if (wlIdRows.length > 0) {
        const auditRows = await db.query<{ resource_id: string; admitted_at: string }>(
          `SELECT resource_id, MIN(strftime('%Y-%m-%dT%H:%M:%SZ', created_at)) AS admitted_at
             FROM audit_log
            WHERE resource_type = 'waitlist' AND action = 'waitlist.admitted'
              AND resource_id IN (${wlIdRows.map(() => '?').join(',')})
            GROUP BY resource_id`,
          wlIdRows.map((r) => r.id)
        );
        for (const r of auditRows) firstAdmitted.set(r.resource_id, r.admitted_at);
      }
      const waitPairs = wlIdRows
        .filter((r) => firstAdmitted.has(r.id))
        .map((r) => ({ createdAt: r.created_at, admittedAt: firstAdmitted.get(r.id)! }));

      const countBy = (status: string) => wlRows.filter((w) => w.status === status).length;
      const waitlist: AdvancedReport['waitlist'] = {
        total: wlRows.length,
        open: countBy('waiting') + countBy('called'),
        scheduled: countBy('scheduled'),
        admitted: countBy('admitted'),
        rejected: countBy('rejected'),
        noShow: countBy('no_show'),
        cancelled: countBy('cancelled'),
        avgWaitDays: avgWaitDaysOf(waitPairs),
        conversionRate: safeRateOrNull(countBy('admitted'), countBy('admitted') + countBy('rejected') + countBy('no_show') + countBy('cancelled'))
      };

      const eventRows = await db.query<{ student_id: string; has_final: number }>(
        `SELECT e.student_id,
                MAX(CASE WHEN e.status = 'completed' THEN 1 ELSE 0 END) AS has_final
           FROM case_events e
           JOIN case_event_types t ON t.id = e.event_type_id
          WHERE e.status != 'cancelled' AND t.category = 'session'
            AND e.student_id IN (SELECT id FROM students WHERE active = 1)
          GROUP BY e.student_id`
      );
      const activeStudentsRow = await db.queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM students WHERE active = 1`);
      const withAny = eventRows.length;
      const withFinal = eventRows.filter((r) => r.has_final === 1).length;
      const activeStudents = activeStudentsRow?.n ?? 0;
      const assessments = {
        activeStudents,
        withFinal,
        withAny,
        without: Math.max(0, activeStudents - withAny),
        coverageRate: safeRateOrNull(withAny, activeStudents)
      };

      const noteRow = await db.queryOne<{ total: number; with_note: number }>(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN s.session_note IS NOT NULL AND s.session_note != '' THEN 1 ELSE 0 END) AS with_note
           FROM appointment_students s
           JOIN appointments a ON a.id = s.appointment_id
          WHERE a.start_at >= ? AND a.start_at <= ? AND a.status != 'cancelled'`,
        [range.start, range.end]
      );
      const sessionNotes = {
        sessions: noteRow?.total ?? 0,
        withNote: noteRow?.with_note ?? 0,
        coverageRate: safeRateOrNull(noteRow?.with_note ?? 0, noteRow?.total ?? 0)
      };

      const fuRows = await db.query<{ status: string; due_at: string | null; completed_at: string | null }>(
        `SELECT status, due_at, completed_at FROM followups`
      );
      const nowIso = new Date().toISOString();
      const openFu = fuRows.filter((f) => f.status === 'open' || f.status === 'in_progress');
      const overdueFu = openFu.filter((f) => f.due_at !== null && f.due_at < nowIso);
      const doneInPeriod = fuRows.filter((f) => f.status === 'done' && f.completed_at !== null && f.completed_at >= range.start && f.completed_at <= range.end).length;
      const cancelledInPeriod = fuRows.filter((f) => f.status === 'cancelled').length;
      const followups = {
        open: openFu.length,
        overdue: overdueFu.length,
        doneInPeriod,
        cancelledInPeriod,
        completionRate: safeRateOrNull(doneInPeriod, doneInPeriod + openFu.length)
      };

      const cmRow = await db.queryOne<{ n: number }>(
        `SELECT COUNT(*) AS n FROM committee_meetings
          WHERE status = 'held' AND deleted_at IS NULL AND meeting_date >= ? AND meeting_date <= ?`,
        [from, to]
      );
      const ciRows = await db.query<{ decision_status: string; meeting_id: string }>(
        `SELECT i.decision_status, i.meeting_id
           FROM committee_items i
           JOIN committee_meetings m ON m.id = i.meeting_id
          WHERE i.deleted_at IS NULL AND m.deleted_at IS NULL AND m.status = 'held'
            AND m.meeting_date >= ? AND m.meeting_date <= ?`,
        [from, to]
      );
      const itemsTotal = ciRows.length;
      const itemsDecided = ciRows.filter((r) => r.decision_status === 'approved' || r.decision_status === 'rejected').length;
      const approved = ciRows.filter((r) => r.decision_status === 'approved').length;
      const committee = {
        heldMeetings: cmRow?.n ?? 0,
        itemsTotal,
        itemsDecided,
        approved,
        approvalRate: safeRateOrNull(approved, itemsTotal)
      };

      const report: AdvancedReport = {
        from,
        to,
        generatedAt: new Date().toISOString(),
        weeks,
        waitlist,
        assessments,
        sessionNotes,
        followups,
        committee
      };
      logger.child('reports').info('advanced_report.generated', { from, to, weeks: weeks.length });
      return report;
    }
  };
}

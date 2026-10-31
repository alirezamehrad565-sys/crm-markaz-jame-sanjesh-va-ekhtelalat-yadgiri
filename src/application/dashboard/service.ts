import type {
  DashboardPeriodSummary,
  DashboardScreeningGoal,
  DashboardTodayCards,
  MyPerformanceStats,
  TherapistScoreboard
} from '@core/shared';
import {
  JALALI_MONTHS_FA,
  addDaysYmd,
  jalaliToGregorianYmd,
  tehranDayRange,
  tehranRange,
  tehranTodayYmd,
  toJalaliParts
} from '@core/shared';
import { listStaff } from '@core/auth';
import type { DbClient } from '@core/db';
import type { AppointmentService } from '@domain/appointment-core';
import type { AttendanceService } from '@domain/attendance';
import type { ConflictEngine } from '@domain/conflict-engine';
import type { StudentProfileService } from '@domain/student-profile';
import type { ScreeningService } from '@domain/screening';
import type { SettingsService } from '@app/settings';
import { goalsQueryWindow, summarizeScreeningGoals } from './screening-goal';
import {
  computeAttendanceStats,
  computeStaffCards,
  computeStatusCounts,
  computeScoreboard,
  countSessionsPerStaff,
  findNextAppointment,
  groupByDay,
  scoreOf
} from './kpis';
import type { StaffInfo, TherapistActivityCounts } from './kpis';

export interface DashboardDeps {
  db: DbClient;
  appointments: AppointmentService;
  attendance: AttendanceService;
  conflicts: ConflictEngine;
  students: StudentProfileService;
  screening?: ScreeningService;
  settings?: SettingsService;
}

export interface DashboardService {
  getTodayCards(dateYmd: string): Promise<DashboardTodayCards>;
  getPeriodSummary(fromYmd: string, toYmd: string): Promise<DashboardPeriodSummary>;
  getScreeningGoal(): Promise<DashboardScreeningGoal>;
  getScoreboard(actorStaffId: string | null): Promise<TherapistScoreboard>;
  getMyStats(actorStaffId: string): Promise<MyPerformanceStats>;
}

export function createDashboardService(deps: DashboardDeps): DashboardService {
  const { db, appointments, conflicts, students } = deps;

  async function staffInfoMap(): Promise<Map<string, StaffInfo>> {
    const rows = await listStaff(db, true);
    const map = new Map<string, StaffInfo>();
    for (const r of rows) {
      map.set(r.id, { name: r.full_name, role: r.role });
    }
    return map;
  }

  async function activityCounts(fromYmd: string, toYmd: string): Promise<Map<string, TherapistActivityCounts>> {
    const range = tehranRange(fromYmd, toYmd);
    // — شمارنده‌ها با مرز UTC آگاه (range.start/end) مقایسه می‌شوند نه substr تاریخ UTC؛ وگرنه از نیمه‌شب تا ۰۳:۳۰ تهران،
    // created_at (UTC روز قبل) از پنجرهٔ روز تهران بیرون می‌افتد و تمرین/رویداد/پیگیری صفر می‌شود (رفع باگ ).
    const [monthAppointments, exRows, evRows, fuRows] = await Promise.all([
      appointments.list({ from: range.start, to: range.end }),
      db.query<{ staffId: string; cnt: number }>(
        `SELECT created_by AS staffId, COUNT(*) AS cnt FROM exercises
          WHERE deleted_at IS NULL AND replace(created_at, ' ', 'T') >= ? AND replace(created_at, ' ', 'T') < ?
          GROUP BY created_by`,
        [range.start, range.end]
      ),
      db.query<{ staffId: string; cnt: number }>(
        `SELECT created_by AS staffId, COUNT(*) AS cnt FROM case_events
          WHERE replace(created_at, ' ', 'T') >= ? AND replace(created_at, ' ', 'T') < ?
          GROUP BY created_by`,
        [range.start, range.end]
      ),
      db.query<{ staffId: string; cnt: number }>(
        `SELECT created_by AS staffId, COUNT(*) AS cnt FROM followups
          WHERE replace(created_at, ' ', 'T') >= ? AND replace(created_at, ' ', 'T') < ?
          GROUP BY created_by`,
        [range.start, range.end]
      )
    ]);

    const sessions = countSessionsPerStaff(monthAppointments);
    const map = new Map<string, TherapistActivityCounts>();
    const ensure = (staffId: string): TherapistActivityCounts => {
      let c = map.get(staffId);
      if (!c) {
        c = { sessions: 0, exercises: 0, events: 0, followups: 0 };
        map.set(staffId, c);
      }
      return c;
    };
    for (const [staffId, n] of sessions) ensure(staffId).sessions = n;
    for (const r of exRows) ensure(r.staffId).exercises = r.cnt;
    for (const r of evRows) ensure(r.staffId).events = r.cnt;
    for (const r of fuRows) ensure(r.staffId).followups = r.cnt;
    return map;
  }

  return {
    async getTodayCards(dateYmd: string): Promise<DashboardTodayCards> {
      const date = dateYmd || tehranTodayYmd();
      const range = tehranDayRange(date);
      const nowIso = new Date().toISOString();

      const [dayAppointments, staffInfo, studentsSummary] = await Promise.all([
        appointments.list({ from: range.start, to: range.end }),
        staffInfoMap(),
        students.getDirectoryStats()
      ]);

      let activeConflicts = 0;
      const activeStaffIds = new Set(dayAppointments.filter((a) => a.status === 'scheduled').map((a) => a.staffId));
      for (const staffId of activeStaffIds) {
        const found = await conflicts.findConflicts(staffId, range.start, range.end);
        activeConflicts += found.length;
      }

      const attendanceStats = computeAttendanceStats(dayAppointments);
      return {
        date,
        rangeStartAt: range.start,
        rangeEndAt: range.end,
        appointments: computeStatusCounts(dayAppointments),
        perStaff: computeStaffCards(dayAppointments, staffInfo),
        pendingAttendance: attendanceStats.pending,
        absenceRate: attendanceStats.absenceRate,
        attendance: attendanceStats,
        activeConflicts,
        nextAppointment: findNextAppointment(dayAppointments, nowIso),
        studentsSummary
      };
    },

    async getPeriodSummary(fromYmd: string, toYmd: string): Promise<DashboardPeriodSummary> {
      const range = tehranRange(fromYmd, toYmd);

      const [periodAppointments, staffInfo] = await Promise.all([
        appointments.list({ from: range.start, to: range.end }),
        staffInfoMap()
      ]);

      return {
        from: fromYmd,
        to: toYmd,
        appointments: computeStatusCounts(periodAppointments),
        attendance: computeAttendanceStats(periodAppointments),
        perStaff: computeStaffCards(periodAppointments, staffInfo),
        byDay: groupByDay(periodAppointments)
      };
    },

    async getScreeningGoal(): Promise<DashboardScreeningGoal> {
      if (!deps.screening || !deps.settings) {
        throw new Error('SCREENING_GOAL_UNAVAILABLE');
      }

      const todayYmd = tehranTodayYmd();
      const [gy, gm, gd] = todayYmd.split('-').map(Number);
      const j = toJalaliParts(gy, gm, gd);
      const yearStartYmd = jalaliToGregorianYmd(j.jy, 1, 1);

      const targets = await deps.settings.getScreeningTargets();
      const qw = goalsQueryWindow(targets, todayYmd);
      const [dayCounts, rangeSummary] = await Promise.all([
        deps.screening.dayCounts(qw.fromYmd, qw.toYmd),
        deps.screening.rangeSummary(yearStartYmd, todayYmd)
      ]);

      const monthTotals = new Array<number>(12).fill(0);
      let yearDone = 0;
      let todayCount = 0;
      let weekCount = 0;
      let monthCount = 0;
      const weekStart = addDaysYmd(todayYmd, -6);
      const monthStart = addDaysYmd(todayYmd, -29);
      for (const d of dayCounts) {
        const [dgy, dgm, dgd] = d.day.split('-').map(Number);
        const dj = toJalaliParts(dgy, dgm, dgd);
        if (dj.jy !== j.jy) continue;
        yearDone += d.count;
        monthTotals[dj.jm - 1] += d.count;
        if (d.day === todayYmd) todayCount = d.count;
        if (d.day >= weekStart) weekCount += d.count;
        if (d.day >= monthStart) monthCount += d.count;
      }

      const yearTarget = targets.find((t) => t.year === j.jy && t.month === null) ?? null;
      const monthTargetCfg = targets.find((t) => t.year === j.jy && t.month === j.jm) ?? null;

      const months: DashboardScreeningGoal['months'] = [];
      for (let m = 1; m <= j.jm; m += 1) {
        months.push({ month: m, label: JALALI_MONTHS_FA[m - 1], done: monthTotals[m - 1] });
      }

      return {
        todayYmd,
        jalaliYear: j.jy,
        todayCount,
        weekCount,
        monthCount,
        yearDone,
        yearNormal: rangeSummary.normal,
        yearReferrals: rangeSummary.referrals,
        referralRate: rangeSummary.total > 0 ? Math.round((rangeSummary.referrals / rangeSummary.total) * 100) : null,
        target: yearTarget ? yearTarget.target : null,
        targetPercent: yearTarget && yearTarget.target > 0 ? Math.min(100, Math.round((yearDone / yearTarget.target) * 100)) : null,
        targetRemaining: yearTarget ? Math.max(0, yearTarget.target - yearDone) : null,
        monthlyTarget: monthTargetCfg ? monthTargetCfg.target : null,
        monthlyDone: monthTotals[j.jm - 1],
        months,
        goals: summarizeScreeningGoals(targets, dayCounts, todayYmd)
      };
    },

    async getScoreboard(actorStaffId: string | null): Promise<TherapistScoreboard> {
      const todayYmd = tehranTodayYmd();
      const [gy, gm, gd] = todayYmd.split('-').map(Number);
      const j = toJalaliParts(gy, gm, gd);
      const monthStart = jalaliToGregorianYmd(j.jy, j.jm, 1);

      const [staffRows, counts] = await Promise.all([
        listStaff(db, true),
        activityCounts(monthStart, todayYmd)
      ]);

      const therapists = staffRows
        .filter((r) => r.role === 'therapist')
        .map((r) => ({ id: r.id, name: r.full_name }));

      const entries = computeScoreboard(therapists, counts);

      let me: TherapistScoreboard['me'] = null;
      if (actorStaffId) {
        const mine = entries.find((e) => e.staffId === actorStaffId);
        if (mine) {
          me = { staffId: mine.staffId, rank: mine.rank, of: entries.length, score: mine.score };
        }
      }

      return {
        from: monthStart,
        to: todayYmd,
        jalaliLabel: `${JALALI_MONTHS_FA[j.jm - 1]} ${j.jy}`,
        entries,
        me
      };
    },

    async getMyStats(actorStaffId: string): Promise<MyPerformanceStats> {
      const todayYmd = tehranTodayYmd();
      const [gy, gm, gd] = todayYmd.split('-').map(Number);
      const j = toJalaliParts(gy, gm, gd);
      const monthStart = jalaliToGregorianYmd(j.jy, j.jm, 1);
      const prevJm = j.jm === 1 ? 12 : j.jm - 1;
      const prevJy = j.jm === 1 ? j.jy - 1 : j.jy;
      const prevStart = jalaliToGregorianYmd(prevJy, prevJm, 1);
      const prevEnd = addDaysYmd(monthStart, -1);

      const [curCounts, prevCounts, staffRows, missing, nextRow] = await Promise.all([
        activityCounts(monthStart, todayYmd),
        activityCounts(prevStart, prevEnd),
        listStaff(db, true),
        db.queryOne<{ cnt: number }>(
          `SELECT COUNT(*) AS cnt
             FROM appointment_students s
             JOIN appointments a ON a.id = s.appointment_id
            WHERE a.staff_id = ?
              AND a.status != 'cancelled'
              AND s.attendance = 'present'
              AND (s.session_note IS NULL OR s.session_note = '')
              AND substr(a.start_at, 1, 10) BETWEEN ? AND ?`,
          [actorStaffId, monthStart, todayYmd]
        ),
        db.queryOne<{ id: string; start_at: string; end_at: string; names: string | null }>(
          `SELECT a.id, a.start_at, a.end_at,
                  GROUP_CONCAT(st.first_name || ' ' || st.last_name, '، ') AS names
             FROM appointments a
             JOIN appointment_students s ON s.appointment_id = a.id
             JOIN students st ON st.id = s.student_id
            WHERE a.staff_id = ? AND a.status = 'scheduled' AND a.start_at >= ?
            GROUP BY a.id
            ORDER BY a.start_at
            LIMIT 1`,
          [actorStaffId, new Date().toISOString()]
        )
      ]);

      const cur = curCounts.get(actorStaffId) ?? { sessions: 0, exercises: 0, events: 0, followups: 0 };
      const prev = prevCounts.get(actorStaffId) ?? { sessions: 0, exercises: 0, events: 0, followups: 0 };

      const therapists = staffRows.filter((r) => r.role === 'therapist');
      const entries = computeScoreboard(
        therapists.map((r) => ({ id: r.id, name: r.full_name })),
        curCounts
      );
      const mine = entries.find((e) => e.staffId === actorStaffId);

      const EMPTY = { sessions: 0, exercises: 0, events: 0, followups: 0 };
      const historyTasks = [];
      for (let i = 5; i >= 1; i -= 1) {
        let y = j.jy;
        let m = j.jm - i;
        while (m <= 0) { m += 12; y -= 1; }
        const nextY = m === 12 ? y + 1 : y;
        const nextM = m === 12 ? 1 : m + 1;
        const start = jalaliToGregorianYmd(y, m, 1);
        const end = addDaysYmd(jalaliToGregorianYmd(nextY, nextM, 1), -1);
        historyTasks.push(
          activityCounts(start, end).then((counts) => ({
            label: `${JALALI_MONTHS_FA[m - 1]} ${y}`,
            score: scoreOf(counts.get(actorStaffId) ?? EMPTY)
          }))
        );
      }
      const prevHistory = await Promise.all(historyTasks);

      return {
        staffId: actorStaffId,
        from: monthStart,
        to: todayYmd,
        jalaliLabel: `${JALALI_MONTHS_FA[j.jm - 1]} ${j.jy}`,
        sessions: cur.sessions,
        sessionsPrev: prev.sessions,
        exercises: cur.exercises,
        exercisesPrev: prev.exercises,
        events: cur.events,
        eventsPrev: prev.events,
        followups: cur.followups,
        followupsPrev: prev.followups,
        score: scoreOf(cur),
        scorePrev: scoreOf(prev),
        missingNotes: missing?.cnt ?? 0,
        rank: mine ? { position: mine.rank, of: entries.length } : null,
        nextAppointment: nextRow
          ? { id: nextRow.id, startAt: nextRow.start_at, endAt: nextRow.end_at, studentNames: (nextRow.names ?? '').split('، ').filter(Boolean) }
          : null,
        history: [...prevHistory, { label: `${JALALI_MONTHS_FA[j.jm - 1]} ${j.jy}`, score: scoreOf(cur) }]
      };
    }
  };
}

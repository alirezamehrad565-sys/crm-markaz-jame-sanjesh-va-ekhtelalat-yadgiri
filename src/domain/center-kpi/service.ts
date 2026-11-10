import { addDaysYmd, iranianWeekdayOfYmd, tehranDayRange, tehranTodayYmd } from '@core/shared';
import type { DbClient } from '@core/db';
import type {
  AppointmentKpi,
  CenterKpiService,
  DocumentationKpi,
  InterventionKpi,
  KpiDays,
  KpiSummary,
  KpiWindow
} from './types';

// ─── شاخص‌های مرکز: سرویس تجمیع فقط-عددی ───
// همهٔ عدد‌ها از جدول‌های واقعی نود می‌آیند؛ هیچ متنی/شناسه‌ای در پاسخ نیست.
// پنجره‌ها تهران‌محورند (از ابتدای روز تهرانِ «fromYmd» تا انتهای امروز تهران).

function round4(v: number | null): number | null {
  return v === null ? null : Math.round(v * 10_000) / 10_000;
}

function rate(num: number, den: number): number | null {
  if (den <= 0) return null;
  return round4(num / den);
}

function parseJson<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** طول نوبت به دقیقه (از ISO UTC) — ورودی خراب = ۰ */
function durationMinutes(startIso: string, endIso: string): number {
  const s = Date.parse(startIso);
  const e = Date.parse(endIso);
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return 0;
  return Math.min(Math.round((e - s) / 60_000), 12 * 60); // سقف منطقی ۱۲ ساعت
}

interface FidelityRow {
  fidelity: string | null;
}

interface FamilyScoreRow {
  analysis: string | null;
}

export function createCenterKpiService(deps: { db: DbClient }): CenterKpiService {
  const db = deps.db;

  async function summary(days: KpiDays, now: Date = new Date()): Promise<KpiSummary> {
    const todayYmd = tehranTodayYmd(now);
    const fromYmd = addDaysYmd(todayYmd, -(days - 1));
    const fromRange = tehranDayRange(fromYmd);
    const toRange = tehranDayRange(todayYmd);
    const fromIso = fromRange.start;
    const toIso = toRange.end;
    const nowIso = now.toISOString();

    const window: KpiWindow = {
      days,
      from_iso: fromIso,
      to_iso: toIso,
      from_ymd: fromYmd,
      to_ymd: todayYmd
    };

    // ─── نوبت‌ها و حضور ───
    const [apptAgg, attendAgg, overdue, schedRows, whRows, served] = await Promise.all([
      db.queryOne<{ total: number; scheduled: number; cancelled: number }>(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END), 0) AS scheduled,
                COALESCE(SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END), 0) AS cancelled
         FROM appointments WHERE start_at >= ? AND start_at <= ?`,
        [fromIso, toIso]
      ),
      db.queryOne<{ present: number; absent: number; pending: number; cancelled: number }>(
        `SELECT
           COALESCE(SUM(CASE WHEN aps.attendance = 'present' THEN 1 ELSE 0 END), 0) AS present,
           COALESCE(SUM(CASE WHEN aps.attendance = 'absent' THEN 1 ELSE 0 END), 0) AS absent,
           COALESCE(SUM(CASE WHEN aps.attendance = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
           COALESCE(SUM(CASE WHEN aps.attendance = 'cancelled' THEN 1 ELSE 0 END), 0) AS cancelled
         FROM appointment_students aps
         JOIN appointments a ON a.id = aps.appointment_id
         WHERE a.start_at >= ? AND a.start_at <= ?`,
        [fromIso, toIso]
      ),
      db.queryOne<{ c: number }>(
        `SELECT COUNT(*) AS c
         FROM appointment_students aps
         JOIN appointments a ON a.id = aps.appointment_id
         WHERE aps.attendance = 'pending' AND a.end_at < ?`,
        [nowIso]
      ),
      db.query<{ start_at: string; end_at: string }>(
        `SELECT start_at, end_at FROM appointments
         WHERE status = 'scheduled' AND start_at >= ? AND start_at <= ?`,
        [fromIso, toIso]
      ),
      db.query<{ weekday: number; start_minute: number; end_minute: number }>(
        `SELECT wh.weekday, wh.start_minute, wh.end_minute
         FROM working_hours wh JOIN staff s ON s.id = wh.staff_id
         WHERE s.active = 1`
      ),
      db.queryOne<{ c: number }>(
        `SELECT COUNT(DISTINCT aps.student_id) AS c
         FROM appointment_students aps
         JOIN appointments a ON a.id = aps.appointment_id
         WHERE a.start_at >= ? AND a.start_at <= ?`,
        [fromIso, toIso]
      )
    ]);

    // نرخ پر بودن ظرفیت: فقط روزهای گذشتهٔ پنجره (روزهای آینده هنوز نوبت نمی‌خورند)
    const bookedByDay = new Map<string, number>();
    for (const r of schedRows) {
      const ymd = tehranTodayYmd(new Date(r.start_at));
      bookedByDay.set(ymd, (bookedByDay.get(ymd) ?? 0) + durationMinutes(r.start_at, r.end_at));
    }
    const capacityByWeekday = new Map<number, number>();
    for (const r of whRows) {
      capacityByWeekday.set(r.weekday, (capacityByWeekday.get(r.weekday) ?? 0) + (r.end_minute - r.start_minute));
    }
    let bookedMinutes = 0;
    let capacityMinutes = 0;
    for (let i = 0; i < days; i++) {
      const ymd = addDaysYmd(fromYmd, i);
      if (ymd > todayYmd) break; // فقط روزهای گذشته و امروز
      capacityMinutes += capacityByWeekday.get(iranianWeekdayOfYmd(ymd)) ?? 0;
      bookedMinutes += bookedByDay.get(ymd) ?? 0;
    }

    const attendance = {
      present: attendAgg?.present ?? 0,
      absent: attendAgg?.absent ?? 0,
      pending: attendAgg?.pending ?? 0,
      cancelled: attendAgg?.cancelled ?? 0
    };

    const appointments: AppointmentKpi = {
      total: apptAgg?.total ?? 0,
      scheduled: apptAgg?.scheduled ?? 0,
      cancelled: apptAgg?.cancelled ?? 0,
      cancel_rate: rate(apptAgg?.cancelled ?? 0, apptAgg?.total ?? 0),
      attendance,
      absent_rate: rate(attendance.absent, attendance.present + attendance.absent),
      pending_overdue: overdue?.c ?? 0,
      booked_minutes: bookedMinutes,
      capacity_minutes: capacityMinutes,
      fill_rate: rate(bookedMinutes, capacityMinutes),
      students_served: served?.c ?? 0
    };

    // ─── کیفیت مداخله ───
    const [pathAgg, fidelityRows, gameAgg, attemptAgg, assignAgg] = await Promise.all([
      db.queryOne<{ done: number; skipped: number }>(
        `SELECT
           COALESCE(SUM(CASE WHEN status = 'done' AND done_at >= ? AND done_at <= ? THEN 1 ELSE 0 END), 0) AS done,
           COALESCE(SUM(CASE WHEN status = 'skipped' AND updated_at >= ? AND updated_at <= ? THEN 1 ELSE 0 END), 0) AS skipped
         FROM pathway_sessions`,
        [fromIso, toIso, fromIso, toIso]
      ),
      db.query<FidelityRow>(
        `SELECT fidelity FROM pathway_sessions
         WHERE status = 'done' AND done_at >= ? AND done_at <= ? AND fidelity IS NOT NULL`,
        [fromIso, toIso]
      ),
      db.queryOne<{ total: number; valid: number; partial: number; invalid: number }>(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(CASE WHEN validity = 'valid' THEN 1 ELSE 0 END), 0) AS valid,
                COALESCE(SUM(CASE WHEN validity = 'partial' THEN 1 ELSE 0 END), 0) AS partial,
                COALESCE(SUM(CASE WHEN validity = 'invalid' THEN 1 ELSE 0 END), 0) AS invalid
         FROM game_sessions WHERE created_at >= ? AND created_at <= ?`,
        [fromIso, toIso]
      ),
      db.queryOne<{ scored: number; correct: number }>(
        `SELECT COUNT(*) AS scored,
                COALESCE(SUM(CASE WHEN correct = 1 THEN 1 ELSE 0 END), 0) AS correct
         FROM game_attempts WHERE correct IS NOT NULL AND created_at >= ? AND created_at <= ?`,
        [fromIso, toIso]
      ),
      db.queryOne<{ total: number; done: number; cancelled: number }>(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END), 0) AS done,
                COALESCE(SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END), 0) AS cancelled
         FROM exercise_assignments WHERE created_at >= ? AND created_at <= ?`,
        [fromIso, toIso]
      )
    ]);

    let fidelityChecked = 0;
    let fidelityFull = 0;
    for (const row of fidelityRows) {
      const f = parseJson<{ protocol?: boolean; homework?: boolean; parent?: boolean }>(row.fidelity);
      if (!f) continue;
      fidelityChecked += 1;
      if (f.protocol === true && f.homework === true && f.parent === true) fidelityFull += 1;
    }

    const gameTotal = gameAgg?.total ?? 0;
    const attemptScored = attemptAgg?.scored ?? 0;

    const intervention: InterventionKpi = {
      pathway_sessions_done: pathAgg?.done ?? 0,
      pathway_sessions_skipped: pathAgg?.skipped ?? 0,
      session_completion_rate: rate(pathAgg?.done ?? 0, (pathAgg?.done ?? 0) + (pathAgg?.skipped ?? 0)),
      fidelity_checked: fidelityChecked,
      fidelity_full: fidelityFull,
      game_sessions: gameTotal,
      game_valid: gameAgg?.valid ?? 0,
      game_partial: gameAgg?.partial ?? 0,
      game_invalid: gameAgg?.invalid ?? 0,
      game_valid_rate: rate(gameAgg?.valid ?? 0, gameTotal),
      game_attempts_scored: attemptScored,
      game_correct: attemptAgg?.correct ?? 0,
      game_correct_rate: rate(attemptAgg?.correct ?? 0, attemptScored),
      assignments_total: assignAgg?.total ?? 0,
      assignments_done: assignAgg?.done ?? 0,
      assignments_cancelled: assignAgg?.cancelled ?? 0,
      assignment_done_rate: rate(assignAgg?.done ?? 0, (assignAgg?.done ?? 0) + (assignAgg?.cancelled ?? 0))
    };

    // ─── ثبت پرونده + بازخورد خانواده ───
    const [studentsAgg, caseAgg, docAgg, assessAgg, familyAgg, familyScoreRows] = await Promise.all([
      db.queryOne<{ active: number }>(
        `SELECT COALESCE(SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END), 0) AS active FROM students`
      ),
      db.queryOne<{ total: number }>(
        `SELECT COUNT(*) AS total FROM case_events WHERE created_at >= ? AND created_at <= ?`,
        [fromIso, toIso]
      ),
      db.queryOne<{ students: number; session_notes: number }>(
        `SELECT COUNT(DISTINCT ce.student_id) AS students,
                COALESCE(SUM(CASE WHEN cet.category = 'session' THEN 1 ELSE 0 END), 0) AS session_notes
         FROM case_events ce JOIN case_event_types cet ON cet.id = ce.event_type_id
         WHERE ce.created_at >= ? AND ce.created_at <= ?`,
        [fromIso, toIso]
      ),
      db.queryOne<{ c: number }>(
        `SELECT COUNT(*) AS c FROM assessments WHERE active = 1 AND performed_at >= ? AND performed_at <= ?`,
        [fromIso, toIso]
      ),
      db.queryOne<{ total: number; filled: number }>(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(CASE WHEN ce.status = 'completed' AND ce.filled_by_chat_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS filled
         FROM case_events ce JOIN case_event_types cet ON cet.id = ce.event_type_id
         WHERE cet.family_fillable = 1 AND ce.created_at >= ? AND ce.created_at <= ?`,
        [fromIso, toIso]
      ),
      db.query<FamilyScoreRow>(
        `SELECT ce.analysis FROM case_events ce JOIN case_event_types cet ON cet.id = ce.event_type_id
         WHERE cet.family_fillable = 1 AND ce.status = 'completed' AND ce.filled_by_chat_id IS NOT NULL
           AND ce.created_at >= ? AND ce.created_at <= ?`,
        [fromIso, toIso]
      )
    ]);

    let scoreSum = 0;
    let scoreCount = 0;
    for (const row of familyScoreRows) {
      const a = parseJson<{ score?: unknown }>(row.analysis);
      const s = Number(a?.score);
      if (Number.isFinite(s)) {
        scoreSum += s;
        scoreCount += 1;
      }
    }

    const studentsActive = studentsAgg?.active ?? 0;
    const familyTotal = familyAgg?.total ?? 0;

    const documentation: DocumentationKpi = {
      students_active: studentsActive,
      case_events_total: caseAgg?.total ?? 0,
      session_notes: docAgg?.session_notes ?? 0,
      students_documented: docAgg?.students ?? 0,
      documentation_coverage: rate(docAgg?.students ?? 0, studentsActive),
      assessments_recorded: assessAgg?.c ?? 0,
      family_requests: familyTotal,
      family_filled: familyAgg?.filled ?? 0,
      family_response_rate: rate(familyAgg?.filled ?? 0, familyTotal),
      family_avg_score: scoreCount > 0 ? round4(scoreSum / scoreCount) : null
    };

    return {
      window,
      generated_at: nowIso,
      appointments,
      intervention,
      documentation
    };
  }

  return { summary };
}

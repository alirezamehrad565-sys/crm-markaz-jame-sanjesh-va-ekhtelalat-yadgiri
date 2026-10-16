/**
 * سرویس نیازهای ویژه — سرویس اصلی و منطق کسب‌وکار
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// فاز ۷ — گردآوری گرید نیازهای ویژه + وضعیت همکاری مدرسه از منابع موجود
// فقط-خواندنی: students/schools/classes (مالک: student-profile)، followups،
// appointments، waitlist (پروجکشن inline )، class_bot_links — هیچ write

import { NotFoundError } from '@core/errors';
import { FOLLOWUP_OPEN_STATUSES, STUDENT_GRADES } from '@core/shared';
import type { AuthContext, SpecialNeedSeverity, SpecialNeedType, StudentCaseStatus } from '@core/shared';
import type { DbClient } from '@core/db';
import type {
  AttentionStudent,
  GridFilters,
  OpenFollowUpRef,
  SchoolGridRow,
  SchoolOverview,
  SpecialNeedsGrid,
  SpecialNeedsService
} from './types';
import {
  addAttention,
  addSpecial,
  addTotal,
  bumpByType,
  deriveAttentionReasons,
  emptyCell,
  mergeCells,
  sortAttentionStudents,
  sortGrades
} from './pure';

interface SpecialStudentRow {
  id: string;
  first_name: string;
  last_name: string;
  grade: string | null;
  school_id: string | null;
  school_name: string | null;
  school_kind: string | null;
  class_id: string | null;
  class_name: string | null;
  special_need_type: string | null;
  special_need_severity: string | null;
  case_status: string | null;
  wait_status: string | null;
}

interface TotalRow {
  school_id: string | null;
  school_name: string | null;
  school_kind: string | null;
  grade: string | null;
  total: number;
}

interface FollowUpRow {
  id: string;
  student_id: string;
  due_at: string | null;
  created_at: string;
}

interface SessionRow {
  student_id: string;
  last_past: string | null;
  next_upcoming: string | null;
}

/** ISO نرمال‌ساز — created_at فرمت SQLite می‌دهد؛ start_at/created_at سرویس‌های دیگر ISO */
function isoOf(v: string | null): string | null {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v)) {
    return `${v.replace(' ', 'T')}Z`;
  }
  return v;
}

/** پروجکشن وضعیت پذیرش — همان الگوی inline سایر ماژول‌های فقط-خواندنی (پرهیز از اتصال عرضی) */
const WAIT_PROJECTION = `,
       CASE WHEN EXISTS (SELECT 1 FROM waitlist wq WHERE wq.student_id = s.id AND wq.deleted_at IS NULL AND wq.status IN ('waiting','called','scheduled')) THEN 'waiting'
            WHEN EXISTS (SELECT 1 FROM waitlist wa WHERE wa.student_id = s.id AND wa.deleted_at IS NULL AND wa.status = 'admitted') THEN 'admitted'
            ELSE NULL END AS wait_status`;

export function createSpecialNeedsService(deps: { db: DbClient }): SpecialNeedsService {
  const { db } = deps;

  /** پیگیری‌های باز دانش‌آموزان — یک کوئری */
  async function openFollowupsOf(studentIds: string[]): Promise<Map<string, OpenFollowUpRef[]>> {
    const map = new Map<string, OpenFollowUpRef[]>();
    if (studentIds.length === 0) return map;
    const ph = studentIds.map(() => '?').join(', ');
    const rows = await db.query<FollowUpRow>(
      `SELECT id, student_id, due_at, created_at
         FROM followups
        WHERE student_id IN (${ph}) AND status IN (${FOLLOWUP_OPEN_STATUSES.map(() => '?').join(', ')})`,
      [...studentIds, ...FOLLOWUP_OPEN_STATUSES]
    );
    for (const r of rows) {
      const list = map.get(r.student_id) ?? [];
      list.push({ id: r.id, dueAt: isoOf(r.due_at), createdAt: isoOf(r.created_at) ?? r.created_at });
      map.set(r.student_id, list);
    }
    return map;
  }

  /** آخرین جلسهٔ گذشته و نزدیک‌ترین نوبت آینده — یک کوئری روی appointment_students */
  async function sessionsOf(studentIds: string[], nowIso: string): Promise<Map<string, SessionRow>> {
    const map = new Map<string, SessionRow>();
    if (studentIds.length === 0) return map;
    const ph = studentIds.map(() => '?').join(', ');
    const rows = await db.query<{ student_id: string; last_past: string | null; next_upcoming: string | null }>(
      `SELECT a_s.student_id AS student_id,
              MAX(CASE WHEN a.start_at <= ? AND a.status != 'cancelled' THEN a.start_at END) AS last_past,
              MIN(CASE WHEN a.start_at > ? AND a.status = 'scheduled' THEN a.start_at END) AS next_upcoming
         FROM appointment_students a_s
         JOIN appointments a ON a.id = a_s.appointment_id
        WHERE a_s.student_id IN (${ph})
        GROUP BY a_s.student_id`,
      [nowIso, nowIso, ...studentIds]
    );
    for (const r of rows) map.set(r.student_id, r);
    return map;
  }

  /** ساخت AttentionStudent از ردیف خام + منابع پیگیری/جلسه */
  function toAttentionStudent(row: SpecialStudentRow, nowIso: string, fus: OpenFollowUpRef[], sessions: SessionRow | undefined): { student: AttentionStudent; reasons: string[] } {
    const reasons = deriveAttentionReasons(
      {
        caseStatus: (row.case_status as StudentCaseStatus | null) ?? null,
        waitStatus: (row.wait_status as 'waiting' | 'admitted' | null) ?? null,
        lastSessionAt: sessions?.last_past ?? null,
        nextSessionAt: sessions?.next_upcoming ?? null,
        openFollowups: fus
      },
      nowIso
    );
    return {
      student: {
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        grade: row.grade,
        schoolId: row.school_id,
        schoolName: row.school_name,
        classId: row.class_id,
        className: row.class_name,
        specialNeedType: (row.special_need_type as SpecialNeedType | null) ?? null,
        specialNeedSeverity: (row.special_need_severity as SpecialNeedSeverity | null) ?? null,
        caseStatus: (row.case_status as StudentCaseStatus | null) ?? null,
        reasons
      },
      reasons
    };
  }

  return {
    /** گرید مدرسه×پایه + فهرست توجه — همه از دو aggregate و دو منبع کمکی */
    async grid(filters: GridFilters, _actor: AuthContext): Promise<SpecialNeedsGrid> {
      const nowIso = new Date().toISOString();

      const conditions: string[] = [`s.active = 1`, `s.special_need_type IS NOT NULL`];
      const params: unknown[] = [];
      if (filters.schoolId) {
        conditions.push(`s.school_id = ?`);
        params.push(filters.schoolId);
      }
      if (filters.grade) {
        conditions.push(`s.grade = ?`);
        params.push(filters.grade);
      }
      if (filters.severity) {
        conditions.push(`s.special_need_severity = ?`);
        params.push(filters.severity);
      }

      // ۱) دانش‌آموزان ویژه فعال (فیلترشده)
      const specialRows = await db.query<SpecialStudentRow>(
        `SELECT s.id, s.first_name, s.last_name, s.grade, s.school_id,
                sc.name AS school_name, sc.kind AS school_kind,
                c.id AS class_id, c.name AS class_name,
                s.special_need_type, s.special_need_severity, s.case_status
                ${WAIT_PROJECTION}
           FROM students s
           LEFT JOIN schools sc ON sc.id = s.school_id
           LEFT JOIN classes c ON c.id = s.class_id
          WHERE ${conditions.join(' AND ')}
          ORDER BY s.last_name, s.first_name`,
        params
      );

      // ۲) مخرج گرید — همهٔ دانش‌آموزان فعال به تفکیک مدرسه×پایه (با همان فیلتر مدرسه/پایه؛ severity مخرج را تغییر نمی‌دهد)
      const totalConditions: string[] = [`s.active = 1`];
      const totalParams: unknown[] = [];
      if (filters.schoolId) {
        totalConditions.push(`s.school_id = ?`);
        totalParams.push(filters.schoolId);
      }
      if (filters.grade) {
        totalConditions.push(`s.grade = ?`);
        totalParams.push(filters.grade);
      }
      const totalRows = await db.query<TotalRow>(
        `SELECT s.school_id, sc.name AS school_name, sc.kind AS school_kind, s.grade, COUNT(*) AS total
           FROM students s
           LEFT JOIN schools sc ON sc.id = s.school_id
          WHERE ${totalConditions.join(' AND ')}
          GROUP BY s.school_id, s.grade`,
        totalParams
      );

      // ۳) منابع توجه
      const specialIds = specialRows.map((r) => r.id);
      const fus = await openFollowupsOf(specialIds);
      const sessions = await sessionsOf(specialIds, nowIso);

      // ۴) ساخت گرید
      const schoolMap = new Map<string | null, SchoolGridRow>();
      const cellKey = (grade: string | null) => grade ?? '—';
      const gradesSet = new Set<string>();

      for (const t of totalRows) {
        const key = t.school_id ?? '__none__';
        let row = schoolMap.get(key);
        if (!row) {
          row = { schoolId: t.school_id, schoolName: t.school_name, kind: t.school_kind, cells: {}, totals: emptyCell() };
          schoolMap.set(key, row);
        }
        const g = cellKey(t.grade);
        gradesSet.add(g);
        row.cells[g] = row.cells[g] ?? emptyCell();
        addTotal(row.cells[g], t.total);
        addTotal(row.totals, t.total);
      }

      const attention: AttentionStudent[] = [];
      let byType: Partial<Record<SpecialNeedType, number>> = {};
      for (const s of specialRows) {
        const key = s.school_id ?? '__none__';
        let row = schoolMap.get(key);
        if (!row) {
          // دانش‌آموز ویژه در مدرسه/پایه‌ای که در totals نیست (فیلتر severity داده را از مخرج جدا کرده؟ خیر — فقط حالت دفاعی)
          row = { schoolId: s.school_id, schoolName: s.school_name, kind: s.school_kind, cells: {}, totals: emptyCell() };
          schoolMap.set(key, row);
        }
        const g = cellKey(s.grade);
        gradesSet.add(g);
        row.cells[g] = row.cells[g] ?? emptyCell();
        addSpecial(row.cells[g], (s.special_need_severity as SpecialNeedSeverity | null) ?? null);
        addSpecial(row.totals, (s.special_need_severity as SpecialNeedSeverity | null) ?? null);

        const { student, reasons } = toAttentionStudent(
          s,
          nowIso,
          fus.get(s.id) ?? [],
          sessions.get(s.id)
        );
        byType = bumpByType(byType, student.specialNeedType);
        if (reasons.length > 0) {
          addAttention(row.cells[g]);
          addAttention(row.totals);
          attention.push(student);
        }
      }

      const overall = [...schoolMap.values()].reduce((acc, r) => mergeCells(acc, r.totals), emptyCell());
      const attentionSorted = sortAttentionStudents(attention);

      return {
        generatedAt: nowIso,
        grades: sortGrades(gradesSet, STUDENT_GRADES),
        schools: [...schoolMap.values()].sort((a, b) => {
          const an = a.schoolName ?? '';
          const bn = b.schoolName ?? '';
          if (an !== bn) return an < bn ? -1 : 1;
          return (a.schoolId ?? '') < (b.schoolId ?? '') ? -1 : 1;
        }),
        overall: { ...overall, byType },
        attention: attentionSorted
      };
    },

    /** وضعیت همکاری مدرسه (§15.2) + بخش توجه (§15.3) — بازخوانِ همان derivation گرید */
    async schoolOverview(schoolId: string, _actor: AuthContext): Promise<SchoolOverview> {
      const nowIso = new Date().toISOString();
      const school = await db.queryOne<{ id: string; name: string; kind: string; active: number }>(
        `SELECT id, name, kind, active FROM schools WHERE id = ?`,
        [schoolId]
      );
      if (!school) throw new NotFoundError('مدرسه');

      const count = async (sql: string, params: unknown[] = []): Promise<number> => {
        const r = await db.queryOne<{ n: number }>(sql, params);
        return r?.n ?? 0;
      };

      const studentsActive = await count(
        `SELECT COUNT(*) AS n FROM students WHERE school_id = ? AND active = 1`,
        [schoolId]
      );

      // پروجکشن پذیرش روی همان school — با EXISTS روی waitlist
      const admitted = await count(
        `SELECT COUNT(*) AS n FROM students s
          WHERE s.school_id = ? AND s.active = 1
            AND EXISTS (SELECT 1 FROM waitlist wa WHERE wa.student_id = s.id AND wa.deleted_at IS NULL AND wa.status = 'admitted')`,
        [schoolId]
      );
      const waiting = await count(
        `SELECT COUNT(*) AS n FROM students s
          WHERE s.school_id = ? AND s.active = 1
            AND EXISTS (SELECT 1 FROM waitlist wq WHERE wq.student_id = s.id AND wq.deleted_at IS NULL AND wq.status IN ('waiting','called','scheduled'))`,
        [schoolId]
      );

      const classesActive = await count(
        `SELECT COUNT(*) AS n FROM classes WHERE school_id = ? AND active = 1`,
        [schoolId]
      );
      const classesWithTeacher = await count(
        `SELECT COUNT(*) AS n FROM classes WHERE school_id = ? AND active = 1 AND teacher_name IS NOT NULL AND TRIM(teacher_name) != ''`,
        [schoolId]
      );
      const classesBotLinked = await count(
        `SELECT COUNT(DISTINCT l.class_id) AS n
           FROM class_bot_links l
           JOIN classes c ON c.id = l.class_id
          WHERE c.school_id = ? AND c.active = 1 AND l.status = 'linked'`,
        [schoolId]
      );

      // جلسات دو پنجرهٔ ۳۰ روزه — گذشتهٔ برگزارشده (غیرلغوشده)
      const now = Date.parse(nowIso);
      const from30 = new Date(now - 30 * 86_400_000).toISOString();
      const from60 = new Date(now - 60 * 86_400_000).toISOString();
      const sessionsLast30 = await count(
        `SELECT COUNT(DISTINCT a.id) AS n
           FROM appointments a
           JOIN appointment_students a_s ON a_s.appointment_id = a.id
           JOIN students s ON s.id = a_s.student_id
          WHERE s.school_id = ? AND a.status != 'cancelled' AND a.start_at > ? AND a.start_at <= ?`,
        [schoolId, from30, nowIso]
      );
      const sessionsPrev30 = await count(
        `SELECT COUNT(DISTINCT a.id) AS n
           FROM appointments a
           JOIN appointment_students a_s ON a_s.appointment_id = a.id
           JOIN students s ON s.id = a_s.student_id
          WHERE s.school_id = ? AND a.status != 'cancelled' AND a.start_at > ? AND a.start_at <= ?`,
        [schoolId, from60, from30]
      );

      // توجه — همان لایهٔ derivation گرید برای دانش‌آموزان ویژهٔ این مدرسه
      const specialRows = await db.query<SpecialStudentRow>(
        `SELECT s.id, s.first_name, s.last_name, s.grade, s.school_id,
                sc.name AS school_name, sc.kind AS school_kind,
                c.id AS class_id, c.name AS class_name,
                s.special_need_type, s.special_need_severity, s.case_status
                ${WAIT_PROJECTION}
           FROM students s
           LEFT JOIN schools sc ON sc.id = s.school_id
           LEFT JOIN classes c ON c.id = s.class_id
          WHERE s.active = 1 AND s.school_id = ? AND s.special_need_type IS NOT NULL
          ORDER BY s.last_name, s.first_name`,
        [schoolId]
      );
      const ids = specialRows.map((r) => r.id);
      const fus = await openFollowupsOf(ids);
      const sessions = await sessionsOf(ids, nowIso);

      const attention: AttentionStudent[] = [];
      for (const s of specialRows) {
        const { student, reasons } = toAttentionStudent(s, nowIso, fus.get(s.id) ?? [], sessions.get(s.id));
        if (reasons.length > 0) attention.push(student);
      }

      return {
        school: { id: school.id, name: school.name, kind: school.kind, active: school.active === 1 },
        metrics: {
          studentsActive,
          admitted,
          waiting,
          classesActive,
          classesWithTeacher,
          classesBotLinked,
          sessionsLast30,
          sessionsPrev30,
          specialNeeds: specialRows.length,
          attention: attention.length
        },
        attention: sortAttentionStudents(attention)
      };
    }
  };
}

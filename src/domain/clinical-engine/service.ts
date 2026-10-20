/**
 * موتور بالینی — باتری‌ها، قواعد، روایت و اهداف مداخله — سرویس اصلی و منطق کسب‌وکار
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// سرویس موتور بالینی: تفسیر زنده + مسیر مداخله + پروتکل قضاوت درمانگر (پلن §۵ و §۷)
// RBAC (پلن §۷): مشاهده — مدیر/منشی/درمانگرِ مسئول؛ ساخت مسیر و تصمیم — مدیر یا درمانگرِ مسئول.
// جدول intervention_paths تنها جدول جدید این ماژول است؛ تفسیر همیشه محاسبهٔ زندهٔ قطعی است.

import type { AuthContext } from '@core/shared';
import type { DbClient } from '@core/db';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@core/errors';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { CaseEventAnalysis, CaseEventBand, CaseEventSubscale } from '@domain/case-events';
import type {
  EvidenceEvent,
  InferenceOutput,
  InterventionPathRecord,
  InterventionPathStatus,
  PathDecision,
  PathStepState,
  RankedHypothesis
} from './types';
import { INTERVENTION_PATH_STATUS_LABELS } from './types';
import { runInference } from './infer';
import { narrativeOf, narrativeOfHypothesis } from './narrative';
import { ALL_TARGETS_INCLUDING_REHAB, targetOf } from './targets';

// ───────── سقف‌ها و قواعد پروتکل (پلن §۱۱) ─────────

/** سقف مسیر فعال هم‌زمان برای یک دانش‌آموز */
export const MAX_ACTIVE_PATHS = 2;
/** حداکثر طول یادداشت تصمیم */
export const DECISION_NOTE_MAX = 500;

export interface ClinicalPathDecisionInput {
  action: 'confirm' | 'edit' | 'reject' | 'need_info';
  note?: string | null;
  /** فقط action=edit — تغییر هدف */
  targetKey?: string | null;
  /** فقط action=confirm — تمرین‌های انتخابی درمانگر از بانک */
  exerciseIds?: string[] | null;
}

export interface ClinicalEngineDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
  now?: () => Date;
}

interface StudentRow {
  id: string;
  first_name: string;
  last_name: string;
  grade: string | null;
  owner_staff_id: string | null;
}

interface EventJoinRow {
  id: string;
  tool_key: string;
  type_title: string;
  status: string;
  occurred_at: string;
  payload: string | null;
  analysis: string | null;
  type_bands: string | null;
  type_subscales: string | null;
}

interface PathRow {
  id: string;
  student_id: string;
  student_first: string;
  student_last: string;
  target_key: string;
  status: string;
  engine_hypothesis: string | null;
  decision: string | null;
  steps: string;
  exercise_ids: string;
  reassess_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function createClinicalEngineService(deps: ClinicalEngineDeps) {
  const { db, audit, logger } = deps;
  const log = logger.child('clinical-engine');
  const now = deps.now ?? (() => new Date());
  const iso = () => now().toISOString();

  // ───────── RBAC (پلن §۷) ─────────

  async function loadStudent(studentId: string): Promise<StudentRow> {
    const row = await db.queryOne<StudentRow>(
      `SELECT id, first_name, last_name, grade, owner_staff_id FROM students WHERE id = ?`,
      [studentId]
    );
    if (!row) throw new NotFoundError('دانش‌آموز');
    return row;
  }

  function studentNameOf(s: Pick<StudentRow, 'first_name' | 'last_name'>): string {
    return `${s.first_name} ${s.last_name}`.trim();
  }

  /** مشاهدهٔ تفسیر/مسیر: مدیر، منشی، یا درمانگرِ مسئول پرونده */
  function assertCanView(student: StudentRow, actor: AuthContext): void {
    if (actor.role === 'manager' || actor.role === 'secretary') return;
    if (actor.role === 'therapist' && student.owner_staff_id === actor.staffId) return;
    throw new ForbiddenError('تفسیر بالینی فقط برای مدیر، منشی یا درمانگرِ مسئول پرونده قابل مشاهده است');
  }

  /** تصمیم و ساخت مسیر: مدیر یا درمانگرِ مسئول (منشی فقط مشاهده — پلن §۱۱) */
  function assertCanDecide(student: StudentRow, actor: AuthContext): void {
    if (actor.role === 'manager') return;
    if (actor.role === 'therapist' && student.owner_staff_id === actor.staffId) return;
    throw new ForbiddenError('ثبت تصمیم فقط توسط مدیر یا درمانگرِ مسئول پرونده مجاز است');
  }

  // ───────── دادهٔ ورودی موتور ─────────

  async function loadEvidenceEvents(studentId: string): Promise<EvidenceEvent[]> {
    const rows = await db.query<EventJoinRow>(
      `SELECT e.id,
              t.key            AS tool_key,
              t.title          AS type_title,
              e.status,
              e.occurred_at,
              e.payload,
              e.analysis,
              t.bands          AS type_bands,
              t.subscales      AS type_subscales
         FROM case_events e
         JOIN case_event_types t ON t.id = e.event_type_id
        WHERE e.student_id = ?
          AND e.status = 'completed'
          AND e.deleted_at IS NULL
        ORDER BY e.occurred_at DESC, e.created_at DESC
        LIMIT 200`,
      [studentId]
    );
    return rows.map((r) => ({
      eventId: r.id,
      toolKey: r.tool_key,
      typeTitle: r.type_title,
      status: r.status,
      occurredAt: r.occurred_at,
      payload: parseJson<Record<string, { value: string; label: string }> | null>(r.payload, null),
      analysis: parseJson<CaseEventAnalysis | null>(r.analysis, null),
      bands: parseJson<CaseEventBand[] | null>(r.type_bands, null),
      subscales: parseJson<CaseEventSubscale[] | null>(r.type_subscales, null)
    }));
  }

  // ───────── تفسیر زنده ─────────

  async function getInsights(studentId: string, actor: AuthContext): Promise<InferenceOutput & {
    student: { id: string; name: string; grade: string | null };
    narrative: ReturnType<typeof narrativeOf>['text'];
    /** — روایت سه‌بخشی مستقل هر فرضیه برای کارت‌های پنل (پلن §۶ و §۱۰) */
    ranked: (InferenceOutput['ranked'][number] & { narrative: ReturnType<typeof narrativeOfHypothesis> })[];
  }> {
    const student = await loadStudent(studentId);
    assertCanView(student, actor);
    const events = await loadEvidenceEvents(studentId);
    const result = runInference(events, { now });
    log.debug('insights computed', { studentId, ranked: result.ranked.length });
    return {
      ...result,
      ranked: result.ranked.map((h) => ({ ...h, narrative: narrativeOfHypothesis(h) })),
      student: { id: student.id, name: studentNameOf(student), grade: student.grade },
      narrative: narrativeOf(result).text
    };
  }

  // ───────── مسیرهای مداخله ─────────

  function pathRowToRecord(r: PathRow): InterventionPathRecord {
    return {
      id: r.id,
      studentId: r.student_id,
      studentName: `${r.student_first} ${r.student_last}`.trim(),
      targetKey: r.target_key,
      targetTitle: targetOf(r.target_key)?.title ?? r.target_key,
      status: r.status as InterventionPathStatus,
      engineHypothesis: parseJson<RankedHypothesis | null>(r.engine_hypothesis, null),
      decision: parseJson<PathDecision | null>(r.decision, null),
      steps: parseJson<{ key: string; title: string; doneAt: string | null }[]>(r.steps, []),
      exerciseIds: parseJson<string[]>(r.exercise_ids, []),
      reassessAt: r.reassess_at,
      createdBy: r.created_by,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  }

  async function loadPathRow(pathId: string): Promise<PathRow> {
    const row = await db.queryOne<PathRow>(
      `SELECT p.*, s.first_name AS student_first, s.last_name AS student_last
         FROM intervention_paths p
         JOIN students s ON s.id = p.student_id
        WHERE p.id = ? AND p.deleted_at IS NULL`,
      [pathId]
    );
    if (!row) throw new NotFoundError('مسیر مداخله');
    return row;
  }

  async function listPaths(studentId: string, actor: AuthContext): Promise<InterventionPathRecord[]> {
    const student = await loadStudent(studentId);
    assertCanView(student, actor);
    const rows = await db.query<PathRow>(
      `SELECT p.*, s.first_name AS student_first, s.last_name AS student_last
         FROM intervention_paths p
         JOIN students s ON s.id = p.student_id
        WHERE p.student_id = ? AND p.deleted_at IS NULL
        ORDER BY p.created_at DESC`,
      [studentId]
    );
    return rows.map(pathRowToRecord);
  }

  async function createPath(
    studentId: string,
    input: { targetKey: string; note?: string | null; exerciseIds?: string[] | null },
    actor: AuthContext
  ): Promise<InterventionPathRecord> {
    const student = await loadStudent(studentId);
    assertCanDecide(student, actor);

    // هدف باید در دانش‌نامه باشد — درمانگر حتی هدفی که موتور رتبه‌بندی نکرده می‌تواند بسازد (پلن §۷)
    const target = targetOf(input.targetKey);
    if (!target) throw new ValidationError('هدف انتخابی در دانش‌نامهٔ موتور وجود ندارد');

    // snapshot فرضیهٔ موتور — اگر هدف در رتبهٔ فعلی بود (پایهٔ کالیبراسیون )
    const events = await loadEvidenceEvents(studentId);
    const result = runInference(events, { now });
    const hypothesis = result.ranked.find((h) => h.targetKey === input.targetKey) ?? null;

    const id = crypto.randomUUID();
    const steps = target.path.map((s) => ({ key: s.key, title: s.title, doneAt: null }));
    const exerciseIds = (input.exerciseIds ?? []).filter((x) => typeof x === 'string' && x.length > 0).slice(0, 20);

    await db.execute(
      `INSERT INTO intervention_paths (id, student_id, target_key, status, engine_hypothesis, steps, exercise_ids, created_by, created_at, updated_at)
       VALUES (?, ?, ?, 'suggested', ?, ?, ?, ?, ?, ?)`,
      [id, studentId, input.targetKey, hypothesis ? JSON.stringify(hypothesis) : null, JSON.stringify(steps), JSON.stringify(exerciseIds), actor.staffId, iso(), iso()]
    );
    await audit.log({
      actorId: actor.staffId,
      action: 'clinical_path.create',
      resourceType: 'intervention_path',
      resourceId: id,
      changes: { target_key: { from: null, to: input.targetKey } }
    });
    log.info('path created', { studentId, targetKey: input.targetKey, engine: hypothesis !== null });
    return pathRowToRecord(await loadPathRow(id));
  }

  async function decidePath(
    pathId: string,
    input: ClinicalPathDecisionInput,
    actor: AuthContext
  ): Promise<InterventionPathRecord> {
    const row = await loadPathRow(pathId);
    const student = await loadStudent(row.student_id);
    assertCanDecide(student, actor);

    const status = row.status as InterventionPathStatus;
    if (status === 'active' || status === 'closed') {
      throw new ConflictError(`این مسیر در وضعیت «${INTERVENTION_PATH_STATUS_LABELS[status]}» است و تصمیم جدید نمی‌پذیرد`);
    }

    const note = input.note?.trim() ? input.note.trim().slice(0, DECISION_NOTE_MAX) : null;
    if (input.action === 'reject' && !note) {
      throw new ValidationError('رد فرضیه بدون یادداشت مجاز نیست — دلیل رد برای کالیبراسیون موتور لازم است');
    }

    let newStatus: InterventionPathStatus;
    let targetKey = row.target_key;
    let exerciseIds = parseJson<string[]>(row.exercise_ids, []);
    const changes: Record<string, { from: unknown; to: unknown }> = {};

    switch (input.action) {
      case 'confirm':
        // سقف مسیر فعال هم‌زمان (پلن §۱۱) — در لحظهٔ ورود به active
        {
          const activeRow = await db.queryOne<{ n: number }>(
            `SELECT COUNT(*) AS n FROM intervention_paths
              WHERE student_id = ? AND status = 'active' AND deleted_at IS NULL AND id != ?`,
            [row.student_id, pathId]
          );
          if ((activeRow?.n ?? 0) >= MAX_ACTIVE_PATHS) {
            throw new ConflictError(`حداکثر ${MAX_ACTIVE_PATHS} مسیر فعال هم‌زمان مجاز است — یکی را ببندید`);
          }
        }
        newStatus = 'active'; // تأیید → مسیر مداخله فعال (تشخیص/هدف درمانی فقط این‌جا)
        if (input.exerciseIds) {
          const ids = input.exerciseIds.filter((x) => typeof x === 'string' && x.length > 0).slice(0, 20);
          exerciseIds = ids;
          changes.exercise_ids = { from: parseJson<string[]>(row.exercise_ids, []), to: ids };
        }
        break;
      case 'edit':
        newStatus = 'reviewed';
        if (!input.targetKey) throw new ValidationError('اصلاح فرضیه بدون هدف جدید مجاز نیست');
        if (!targetOf(input.targetKey)) throw new ValidationError('هدف جدید در دانش‌نامهٔ موتور وجود ندارد');
        changes.target_key = { from: row.target_key, to: input.targetKey };
        targetKey = input.targetKey;
        break;
      case 'reject':
        newStatus = 'closed'; // رد ثبت می‌شود (دادهٔ کالیبراسیون) — مسیر ساخته نمی‌شود
        break;
      case 'need_info':
        newStatus = 'reviewed';
        break;
    }
    changes.status = { from: status, to: newStatus };

    const decision: PathDecision = {
      action: input.action,
      by: actor.staffId,
      byName: actor.displayName,
      at: iso(),
      note
    };

    // یادآور بازسنجی ۴–۶ هفته (فاز بهبود §۱۰.۳): در تأیید مسیر، reassess_at — که UI وعده می‌دهد —
    // بالاخره نوشته می‌شود (میانهٔ پنجرهٔ ۴–۶ هفته = ۳۵ روز)؛ در سایر تصمیم‌ها مقدار قبلی حفظ می‌شود
    const REASSESS_WINDOW_DAYS = 35;
    const reassessAt = newStatus === 'active'
      ? new Date(Date.now() + REASSESS_WINDOW_DAYS * 86400000).toISOString()
      : (row.reassess_at ?? null);
    if (newStatus === 'active') {
      changes.reassess_at = { from: row.reassess_at ?? null, to: reassessAt };
    }

    await db.transaction(async (tx) => {
      await tx.execute(
        `UPDATE intervention_paths
            SET status = ?, target_key = ?, decision = ?, steps = ?, exercise_ids = ?, reassess_at = ?, updated_at = ?
          WHERE id = ?`,
        [newStatus, targetKey, JSON.stringify(decision), row.steps, JSON.stringify(exerciseIds), reassessAt, iso(), pathId]
      );
      await audit.logInTransaction(tx, {
        actorId: actor.staffId,
        action: 'clinical_path.decision',
        resourceType: 'intervention_path',
        resourceId: pathId,
        changes
      });
    });

    log.info('path decision', { pathId, action: input.action, status: newStatus });
    return pathRowToRecord(await loadPathRow(pathId));
  }

  /**
   * — علامت‌زدن گام مسیر مداخله (چک‌لیست مراحل پلن §۱۰ ردیف UI)
   * فقط مدیر/درمانگرِ مسئول؛ فقط مسیر فعال (مراحل، کارِ اجرایی مداخله است)؛ toggle — دوباره لمس = لغو
   */
  async function toggleStep(pathId: string, stepKey: string, actor: AuthContext): Promise<InterventionPathRecord> {
    const row = await loadPathRow(pathId);
    const student = await loadStudent(row.student_id);
    assertCanDecide(student, actor);

    const status = row.status as InterventionPathStatus;
    if (status !== 'active') {
      throw new ConflictError(`علامت‌زدن گام فقط برای مسیر فعال مجاز است — این مسیر «${INTERVENTION_PATH_STATUS_LABELS[status]}» است`);
    }

    const steps = parseJson<PathStepState[]>(row.steps, []);
    const step = steps.find((s) => s.key === stepKey);
    if (!step) throw new NotFoundError('گام مسیر');
    step.doneAt = step.doneAt ? null : iso();

    await db.transaction(async (tx) => {
      await tx.execute(
        `UPDATE intervention_paths SET steps = ?, updated_at = ? WHERE id = ?`,
        [JSON.stringify(steps), iso(), pathId]
      );
      await audit.logInTransaction(tx, {
        actorId: actor.staffId,
        action: 'clinical_path.step_toggle',
        resourceType: 'intervention_path',
        resourceId: pathId,
        changes: { step_key: { from: !step.doneAt, to: Boolean(step.doneAt) } }
      });
    });
    log.info('path step toggled', { pathId, stepKey, done: Boolean(step.doneAt) });
    return pathRowToRecord(await loadPathRow(pathId));
  }

  async function getPath(pathId: string, actor: AuthContext): Promise<InterventionPathRecord> {
    const row = await loadPathRow(pathId);
    const student = await loadStudent(row.student_id);
    assertCanView(student, actor);
    return pathRowToRecord(row);
  }

  /** فهرست دانش‌نامه — برای فرم‌های پنل و بات — + اهداف شاخهٔ توانبخشی */
  async function listTargets(): Promise<{ key: string; title: string; group: string }[]> {
    return ALL_TARGETS_INCLUDING_REHAB.map((t) => ({ key: t.key, title: t.title, group: t.group }));
  }

  return { getInsights, listPaths, createPath, decidePath, getPath, listTargets, toggleStep };
}

export type ClinicalEngineService = ReturnType<typeof createClinicalEngineService>;

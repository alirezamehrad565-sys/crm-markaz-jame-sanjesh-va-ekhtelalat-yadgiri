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
  PathwayItemType,
  RankedHypothesis
} from './types';
import type { ChecklistPlan } from './recommender';
import { INTERVENTION_PATH_STATUS_LABELS, PATHWAY_ITEM_TYPES, PATHWAY_SESSION_STATUSES } from './types';
import type {
  PathSessionItem,
  PathSessionRecord,
  PathwaySessionStatus,
  PathwayTemplateSession,
  PathwayTemplateStep,
  PathwayTemplateSummary
} from './types';
import { runInference } from './infer';
import { checklistPlanContextOf, recommendChecklistPlan } from './recommender';
import { narrativeOf, narrativeOfHypothesis } from './narrative';
import { ALL_TARGETS_INCLUDING_REHAB, targetOf } from './targets';

export const MAX_ACTIVE_PATHS = 2;
export const DECISION_NOTE_MAX = 500;

// — محدودیت‌های پروتکل جلسه‌به‌جلسه و قالب مسیر (پاریسی با باندل اصلی) —
export const PATHWAY_SESSION_TITLE_MAX = 120;
export const PATHWAY_SESSION_PLAN_MAX = 500;
export const PATHWAY_SESSION_NOTE_MAX = 300;
export const PATHWAY_SESSION_MAX = 200;
export const PATHWAY_TEMPLATE_SESSIONS_MAX = 100;
export const PATHWAY_SESSION_ITEMS_MAX = 10;
export const PATHWAY_SESSION_ITEM_TEXT_MAX = PATHWAY_SESSION_PLAN_MAX;
export const PATHWAY_TEMPLATE_DESC_MAX = 300;
export const PATHWAY_TEMPLATE_STEP_HINT_MAX = 200;
export const PATHWAY_TEMPLATE_KEY_RE = /^[a-z0-9][a-z0-9-]{3,59}$/;
const PATHWAY_TEMPLATE_STEP_MAX = 12;
const PATHWAY_TEMPLATE_PROTOCOLS = ['learning', 'slow_learner', 'mental_ot', 'rehab'] as const;

export interface ClinicalPathCreateInput {
  targetKey?: string | null;
  templateKey?: string | null;
  note?: string | null;
  exerciseIds?: string[] | null;
}

export interface PathTemplateUpsertInput {
  isUpdate: boolean;
  key: string;
  title?: string | null;
  description?: string | null;
  protocol?: string | null;
  targetKey?: string | null;
  steps?: PathwayTemplateStep[] | null;
  sessions?: PathwayTemplateSession[] | null;
  active?: boolean | null;
}

export interface PathSessionAddInput {
  title: string;
  plan?: string | null;
  items?: PathSessionItem[] | null;
}

export interface PathSessionUpdateInput {
  status?: string | null;
  title?: string | null;
  plan?: string | null;
  note?: string | null;
  items?: PathSessionItem[] | null;
}

export interface ClinicalPathDecisionInput {
  action: 'confirm' | 'edit' | 'reject' | 'need_info';
  note?: string | null;
  targetKey?: string | null;
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
  template_key: string | null;
  template_title: string | null;
  reassess_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface PathSessionRow {
  id: string;
  pathway_id: string;
  ord: number;
  title: string;
  plan: string | null;
  items_json: string;
  status: string;
  done_at: string | null;
  note: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface TemplateRow {
  key: string;
  title: string;
  description: string | null;
  protocol: string | null;
  target_key: string | null;
  steps: string;
  sessions_json: string | null;
  is_system: number;
  active: number;
  created_by: string | null;
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function parseText(v: string | null | undefined, max: number): string | null {
  const t = v?.trim();
  return t ? t.slice(0, max) : null;
}

export function sanitizeSessionItems(raw: unknown): PathSessionItem[] {
  if (!Array.isArray(raw)) return [];
  const out: PathSessionItem[] = [];
  for (const it of raw) {
    const t = (it ?? {}) as { type?: unknown; text?: unknown };
    if (typeof t.type !== 'string' || !PATHWAY_ITEM_TYPES.includes(t.type as PathwayItemType)) continue;
    const text = typeof t.text === 'string' ? t.text.trim() : '';
    if (!text) continue;
    out.push({ type: t.type as PathwayItemType, text: text.slice(0, PATHWAY_SESSION_ITEM_TEXT_MAX) });
    if (out.length >= PATHWAY_SESSION_ITEMS_MAX) break;
  }
  return out;
}

export function sanitizeTemplateSessions(raw: unknown): PathwayTemplateSession[] {
  if (!Array.isArray(raw)) return [];
  const out: PathwayTemplateSession[] = [];
  for (const s of raw) {
    const title = typeof (s as { title?: unknown })?.title === 'string' ? ((s as { title: string }).title.trim()) : '';
    if (!title) continue;
    out.push({
      title: title.slice(0, PATHWAY_SESSION_TITLE_MAX),
      items: sanitizeSessionItems((s as { items?: unknown })?.items)
    });
    if (out.length >= PATHWAY_TEMPLATE_SESSIONS_MAX) break;
  }
  return out;
}

export function sanitizeTemplateSteps(raw: unknown): PathwayTemplateStep[] {
  if (!Array.isArray(raw)) return [];
  const out: PathwayTemplateStep[] = [];
  for (const s of raw) {
    const key = typeof (s as { key?: unknown })?.key === 'string' ? (s as { key: string }).key.trim().slice(0, 80) : '';
    const title = typeof (s as { title?: unknown })?.title === 'string' ? (s as { title: string }).title.trim().slice(0, PATHWAY_SESSION_TITLE_MAX) : '';
    if (!key || !title) continue;
    const hint = typeof (s as { hint?: unknown })?.hint === 'string' && (s as { hint: string }).hint.trim()
      ? (s as { hint: string }).hint.trim().slice(0, PATHWAY_TEMPLATE_STEP_HINT_MAX)
      : undefined;
    out.push(hint ? { key, title, hint } : { key, title });
    if (out.length >= PATHWAY_TEMPLATE_STEP_MAX) break;
  }
  return out;
}

export function createClinicalEngineService(deps: ClinicalEngineDeps) {
  const { db, audit, logger } = deps;
  const log = logger.child('clinical-engine');
  const now = deps.now ?? (() => new Date());
  const iso = () => now().toISOString();

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

  function assertCanView(student: StudentRow, actor: AuthContext): void {
    if (actor.role === 'manager' || actor.role === 'secretary') return;
    if (actor.role === 'therapist' && student.owner_staff_id === actor.staffId) return;
    throw new ForbiddenError('تفسیر بالینی فقط برای مدیر، منشی یا درمانگرِ مسئول پرونده قابل مشاهده است');
  }

  function assertCanDecide(student: StudentRow, actor: AuthContext): void {
    if (actor.role === 'manager') return;
    if (actor.role === 'therapist' && student.owner_staff_id === actor.staffId) return;
    throw new ForbiddenError('ثبت تصمیم فقط توسط مدیر یا درمانگرِ مسئول پرونده مجاز است');
  }

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

  async function getInsights(studentId: string, actor: AuthContext): Promise<InferenceOutput & {
    student: { id: string; name: string; grade: string | null };
    narrative: ReturnType<typeof narrativeOf>['text'];
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

  async function getChecklistPlan(studentId: string, actor: AuthContext): Promise<ChecklistPlan> {
    const student = await loadStudent(studentId);
    assertCanView(student, actor);
    const events = await loadEvidenceEvents(studentId);
    const plan = recommendChecklistPlan(checklistPlanContextOf(events));
    log.debug('checklist plan computed', { studentId, planType: plan.planType, items: plan.items.length });
    return plan;
  }

  function sessionRowToRecord(r: PathSessionRow): PathSessionRecord {
    const status: PathwaySessionStatus = PATHWAY_SESSION_STATUSES.includes(r.status as PathwaySessionStatus)
      ? (r.status as PathwaySessionStatus)
      : 'planned';
    return {
      id: r.id,
      pathwayId: r.pathway_id,
      ord: r.ord,
      title: r.title,
      plan: r.plan,
      items: sanitizeSessionItems(parseJson<PathSessionItem[]>(r.items_json ?? '[]', [])),
      status,
      doneAt: r.done_at,
      note: r.note,
      createdBy: r.created_by,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  }

  async function loadPathSessions(pathwayId: string): Promise<PathSessionRecord[]> {
    const rows = await db.query<PathSessionRow>(
      `SELECT * FROM pathway_sessions WHERE pathway_id = ? ORDER BY ord ASC, created_at ASC`,
      [pathwayId]
    );
    return rows.map(sessionRowToRecord);
  }

  async function loadSessionsOfPaths(pathIds: string[]): Promise<Map<string, PathSessionRecord[]>> {
    const map = new Map<string, PathSessionRecord[]>();
    if (pathIds.length === 0) return map;
    const rows = await db.query<PathSessionRow>(
      `SELECT * FROM pathway_sessions
        WHERE pathway_id IN (${pathIds.map(() => '?').join(', ')})
        ORDER BY ord ASC, created_at ASC`,
      pathIds
    );
    for (const r of rows) {
      const list = map.get(r.pathway_id);
      const rec = sessionRowToRecord(r);
      if (list) list.push(rec);
      else map.set(r.pathway_id, [rec]);
    }
    return map;
  }

  function pathRowToRecord(r: PathRow, sessions: PathSessionRecord[] = []): InterventionPathRecord {
    return {
      id: r.id,
      studentId: r.student_id,
      studentName: `${r.student_first} ${r.student_last}`.trim(),
      targetKey: r.target_key,
      targetTitle: targetOf(r.target_key)?.title ?? r.target_key,
      status: r.status as InterventionPathStatus,
      engineHypothesis: parseJson<RankedHypothesis | null>(r.engine_hypothesis, null),
      decision: parseJson<PathDecision | null>(r.decision, null),
      steps: parseJson<PathStepState[]>(r.steps, []),
      exerciseIds: parseJson<string[]>(r.exercise_ids, []),
      templateKey: r.template_key ?? null,
      templateTitle: r.template_title ?? null,
      sessions,
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
    const sessionsByPath = await loadSessionsOfPaths(rows.map((r) => r.id));
    return rows.map((r) => pathRowToRecord(r, sessionsByPath.get(r.id) ?? []));
  }

  async function createPath(
    studentId: string,
    input: ClinicalPathCreateInput,
    actor: AuthContext
  ): Promise<InterventionPathRecord> {
    const student = await loadStudent(studentId);
    assertCanDecide(student, actor);

    let targetKey = input.targetKey?.trim() ?? null;
    let templateKey: string | null = null;
    let templateTitle: string | null = null;
    let steps: PathStepState[];
    let tplSessions: PathwayTemplateSession[] = [];
    if (input.templateKey) {
      const tpl = await db.queryOne<TemplateRow>(
        `SELECT * FROM pathway_templates WHERE key = ? AND active = 1`,
        [input.templateKey]
      );
      if (!tpl) throw new ValidationError('قالب مسیر یافت نشد یا غیرفعال است');
      targetKey = targetKey ?? tpl.target_key;
      templateKey = tpl.key;
      templateTitle = tpl.title;
      const tplSteps = parseJson<PathwayTemplateStep[]>(tpl.steps, []);
      steps = tplSteps.map((s) => ({ key: s.key, title: s.title, hint: s.hint, doneAt: null }));
      tplSessions = sanitizeTemplateSessions(parseJson<PathwayTemplateSession[] | null>(tpl.sessions_json ?? null, []));
    } else {
      steps = [];
    }
    if (!targetKey) throw new ValidationError('هدف انتخابی لازم است — این قالب هدف پیش‌فرض ندارد');
    const target = targetOf(targetKey);
    if (!target) throw new ValidationError('هدف انتخابی در فهرست شناخته‌شدهٔ سامانه نیست');

    const events = await loadEvidenceEvents(studentId);
    const result = runInference(events, { now });
    const hypothesis = result.ranked.find((h) => h.targetKey === targetKey) ?? null;

    const id = crypto.randomUUID();
    if (steps.length === 0) {
      steps = target.path.map((s) => ({ key: s.key, title: s.title, doneAt: null }));
    }
    const exerciseIds = (input.exerciseIds ?? []).filter((x) => typeof x === 'string' && x.length > 0).slice(0, 20);

    await db.execute(
      `INSERT INTO intervention_paths (id, student_id, target_key, status, engine_hypothesis, steps, exercise_ids, template_key, template_title, created_by, created_at, updated_at)
       VALUES (?, ?, ?, 'suggested', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, studentId, targetKey, hypothesis ? JSON.stringify(hypothesis) : null, JSON.stringify(steps), JSON.stringify(exerciseIds), templateKey, templateTitle, actor.staffId, iso(), iso()]
    );
    await audit.log({
      actorId: actor.staffId,
      action: 'clinical_path.create',
      resourceType: 'intervention_path',
      resourceId: id,
      changes: {
        target_key: { from: null, to: targetKey },
        ...(templateKey ? { template_key: { from: null, to: templateKey } } : {})
      }
    });
    for (const [i, ts] of tplSessions.entries()) {
      if (i >= PATHWAY_SESSION_MAX) break;
      await db.execute(
        `INSERT INTO pathway_sessions (id, pathway_id, ord, title, plan, items_json, status, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, NULL, ?, 'planned', ?, ?, ?)`,
        [crypto.randomUUID(), id, i + 1, ts.title, JSON.stringify(ts.items), actor.staffId, iso(), iso()]
      );
    }
    log.info('path created', { studentId, targetKey, template: templateKey, engine: hypothesis !== null, sessionsSeeded: tplSessions.length });
    return pathRowToRecord(await loadPathRow(id), await loadPathSessions(id));
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
      throw new ValidationError('رد فرضیه بدون یادداشت مجاز نیست — دلیل رد برای بهبود جمع‌بندی‌های بعدی لازم است');
    }

    let newStatus: InterventionPathStatus;
    let targetKey = row.target_key;
    let exerciseIds = parseJson<string[]>(row.exercise_ids, []);
    const changes: Record<string, { from: unknown; to: unknown }> = {};

    switch (input.action) {
      case 'confirm':
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
        if (!targetOf(input.targetKey)) throw new ValidationError('هدف جدید در فهرست شناخته‌شدهٔ سامانه نیست');
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

  async function listTargets(): Promise<{ key: string; title: string; group: string }[]> {
    return ALL_TARGETS_INCLUDING_REHAB.map((t) => ({ key: t.key, title: t.title, group: t.group }));
  }

  // ─── قالب‌های مسیر (m187 — بازگردانی بخش مدیریت قالب‌ها از باندل اصلی) ───
  function templateRowToSummary(r: TemplateRow): PathwayTemplateSummary {
    return {
      key: r.key,
      title: r.title,
      description: r.description,
      protocol: r.protocol,
      targetKey: r.target_key,
      steps: parseJson<PathwayTemplateStep[]>(r.steps, []),
      sessions: sanitizeTemplateSessions(parseJson<PathwayTemplateSession[] | null>(r.sessions_json ?? null, [])),
      isSystem: r.is_system === 1,
      active: r.active === 1,
      createdBy: r.created_by ?? null
    };
  }

  async function listPathTemplates(): Promise<PathwayTemplateSummary[]> {
    const rows = await db.query<TemplateRow>(
      `SELECT * FROM pathway_templates WHERE active = 1 ORDER BY is_system DESC, created_at ASC`
    );
    return rows.map(templateRowToSummary);
  }

  async function upsertPathTemplate(input: PathTemplateUpsertInput, actor: AuthContext): Promise<PathwayTemplateSummary> {
    const key = input.key.trim();
    if (!PATHWAY_TEMPLATE_KEY_RE.test(key)) {
      throw new ValidationError('کلید قالب باید ۴ تا ۶۰ نویسهٔ لاتین کوچک، رقم یا خط تیره باشد');
    }
    const existing = await db.queryOne<TemplateRow>(
      `SELECT * FROM pathway_templates WHERE key = ?`,
      [key]
    );
    if (input.isUpdate && !existing) throw new NotFoundError('قالب مسیر');
    if (!input.isUpdate && existing) throw new ConflictError('کلید قالب تکراری است');

    const title = input.title !== undefined
      ? (input.title?.trim() ? input.title.trim().slice(0, PATHWAY_SESSION_TITLE_MAX) : '')
      : existing?.title ?? '';
    if (!title) throw new ValidationError('عنوان قالب لازم است');
    const description = input.description !== undefined ? parseText(input.description, PATHWAY_TEMPLATE_DESC_MAX) : existing?.description ?? null;
    const protocol = input.protocol !== undefined
      ? (input.protocol && (PATHWAY_TEMPLATE_PROTOCOLS as readonly string[]).includes(input.protocol) ? input.protocol : null)
      : existing?.protocol ?? null;
    const targetKey = input.targetKey !== undefined ? parseText(input.targetKey, 40) : existing?.target_key ?? null;
    if (targetKey && !targetOf(targetKey)) {
      throw new ValidationError('هدف پیش‌فرض در فهرست شناخته‌شدهٔ سامانه نیست');
    }
    const steps = input.steps !== undefined ? sanitizeTemplateSteps(input.steps) : parseJson<PathwayTemplateStep[]>(existing?.steps ?? '[]', []);
    const sessions = input.sessions !== undefined
      ? sanitizeTemplateSessions(input.sessions)
      : sanitizeTemplateSessions(parseJson<PathwayTemplateSession[] | null>(existing?.sessions_json ?? null, []));
    const active = input.active !== undefined ? (input.active ? 1 : 0) : existing?.active ?? 1;

    if (existing) {
      await db.execute(
        `UPDATE pathway_templates
            SET title = ?, description = ?, protocol = ?, target_key = ?, steps = ?, sessions_json = ?, active = ?, updated_at = ?
          WHERE key = ?`,
        [title, description, protocol, targetKey, JSON.stringify(steps), sessions.length ? JSON.stringify(sessions) : null, active, iso(), key]
      );
      await audit.log({
        actorId: actor.staffId,
        action: 'pathway_template.update',
        resourceType: 'pathway_template',
        resourceId: key,
        changes: {
          sessions_count: { from: null, to: sessions.length },
          active: { from: existing.active === 1, to: active === 1 }
        }
      });
      log.info('pathway template updated', { key, sessions: sessions.length });
    } else {
      await db.execute(
        `INSERT INTO pathway_templates (id, key, title, description, protocol, target_key, steps, sessions_json, is_system, active, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?)`,
        [crypto.randomUUID(), key, title, description, protocol, targetKey, JSON.stringify(steps), sessions.length ? JSON.stringify(sessions) : null, actor.staffId, iso(), iso()]
      );
      await audit.log({
        actorId: actor.staffId,
        action: 'pathway_template.create',
        resourceType: 'pathway_template',
        resourceId: key,
        changes: { sessions_count: { from: null, to: sessions.length } }
      });
      log.info('pathway template created', { key, sessions: sessions.length });
    }
    const row = await db.queryOne<TemplateRow>(`SELECT * FROM pathway_templates WHERE key = ?`, [key]);
    return templateRowToSummary(row as TemplateRow);
  }

  // ─── جلسات مسیر مداخله (پروتکل جلسه‌به‌جلسه) ───
  async function listPathSessions(pathId: string, actor: AuthContext): Promise<PathSessionRecord[]> {
    const row = await loadPathRow(pathId);
    const student = await loadStudent(row.student_id);
    assertCanView(student, actor);
    return loadPathSessions(pathId);
  }

  async function addPathSession(pathId: string, input: PathSessionAddInput, actor: AuthContext): Promise<PathSessionRecord> {
    const row = await loadPathRow(pathId);
    const student = await loadStudent(row.student_id);
    assertCanDecide(student, actor);
    if (row.status === 'closed') {
      throw new ConflictError('مسیر بسته‌شده جلسهٔ جدید نمی‌پذیرد');
    }
    const count = await db.queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM pathway_sessions WHERE pathway_id = ?`,
      [pathId]
    );
    if ((count?.n ?? 0) >= PATHWAY_SESSION_MAX) {
      throw new ConflictError(`حداکثر ${PATHWAY_SESSION_MAX} جلسه برای یک مسیر مجاز است`);
    }
    const ord = (count?.n ?? 0) + 1;
    const id = crypto.randomUUID();
    const title = input.title.trim().slice(0, PATHWAY_SESSION_TITLE_MAX);
    const plan = parseText(input.plan, PATHWAY_SESSION_PLAN_MAX);
    const items = sanitizeSessionItems(input.items);
    await db.execute(
      `INSERT INTO pathway_sessions (id, pathway_id, ord, title, plan, items_json, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'planned', ?, ?, ?)`,
      [id, pathId, ord, title, plan, JSON.stringify(items), actor.staffId, iso(), iso()]
    );
    await audit.log({
      actorId: actor.staffId,
      action: 'clinical_path.session_add',
      resourceType: 'intervention_path',
      resourceId: pathId,
      changes: { session_ord: { from: null, to: ord } }
    });
    log.info('path session added', { pathId, ord });
    const created = await db.queryOne<PathSessionRow>(`SELECT * FROM pathway_sessions WHERE id = ?`, [id]);
    return sessionRowToRecord(created as PathSessionRow);
  }

  async function updatePathSession(pathId: string, sessionId: string, input: PathSessionUpdateInput, actor: AuthContext): Promise<PathSessionRecord> {
    const row = await loadPathRow(pathId);
    const student = await loadStudent(row.student_id);
    assertCanDecide(student, actor);
    const session = await db.queryOne<PathSessionRow>(
      `SELECT * FROM pathway_sessions WHERE id = ? AND pathway_id = ?`,
      [sessionId, pathId]
    );
    if (!session) throw new NotFoundError('جلسهٔ برنامه');

    const nextTitle = input.title !== undefined && input.title !== null
      ? (input.title.trim() ? input.title.trim().slice(0, PATHWAY_SESSION_TITLE_MAX) : session.title)
      : session.title;
    const nextPlan = input.plan !== undefined ? parseText(input.plan, PATHWAY_SESSION_PLAN_MAX) : session.plan;
    const nextNote = input.note !== undefined ? parseText(input.note, PATHWAY_SESSION_NOTE_MAX) : session.note;
    const nextItems = input.items !== undefined ? JSON.stringify(sanitizeSessionItems(input.items)) : session.items_json;
    let nextStatus = session.status;
    let nextDoneAt = session.done_at;
    if (input.status && input.status !== session.status) {
      nextStatus = input.status;
      nextDoneAt = input.status === 'done' ? iso() : null;
    }
    await db.execute(
      `UPDATE pathway_sessions SET title = ?, plan = ?, items_json = ?, status = ?, done_at = ?, note = ?, updated_at = ? WHERE id = ?`,
      [nextTitle, nextPlan, nextItems, nextStatus, nextDoneAt, nextNote, iso(), sessionId]
    );
    await audit.log({
      actorId: actor.staffId,
      action: 'clinical_path.session_update',
      resourceType: 'intervention_path',
      resourceId: pathId,
      changes: {
        session_id: { from: null, to: sessionId },
        ...(input.status && input.status !== session.status ? { status: { from: session.status, to: nextStatus } } : {})
      }
    });
    const updated = await db.queryOne<PathSessionRow>(`SELECT * FROM pathway_sessions WHERE id = ?`, [sessionId]);
    return sessionRowToRecord(updated as PathSessionRow);
  }

  async function deletePathSession(pathId: string, sessionId: string, actor: AuthContext): Promise<void> {
    const row = await loadPathRow(pathId);
    const student = await loadStudent(row.student_id);
    assertCanDecide(student, actor);
    const session = await db.queryOne<PathSessionRow>(
      `SELECT * FROM pathway_sessions WHERE id = ? AND pathway_id = ?`,
      [sessionId, pathId]
    );
    if (!session) throw new NotFoundError('جلسهٔ برنامه');
    await db.execute(`DELETE FROM pathway_sessions WHERE id = ?`, [sessionId]);
    await audit.log({
      actorId: actor.staffId,
      action: 'clinical_path.session_delete',
      resourceType: 'intervention_path',
      resourceId: pathId,
      changes: { session_ord: { from: session.ord, to: null } }
    });
    log.info('path session deleted', { pathId, sessionId });
  }

  return { getInsights, getChecklistPlan, listPaths, createPath, decidePath, getPath, listTargets, toggleStep, listPathTemplates, upsertPathTemplate, listPathSessions, addPathSession, updatePathSession, deletePathSession };
}

export type ClinicalEngineService = ReturnType<typeof createClinicalEngineService>;

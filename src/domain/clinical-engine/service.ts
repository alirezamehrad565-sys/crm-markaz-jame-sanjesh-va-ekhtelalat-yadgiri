import type { AuthContext } from '@core/shared';
import { tehranDayRange } from '@core/shared'; // مرز روزِ بازهٔ گزارش با آفست تهران (قرارداد §۷)
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
  PathProbeRecord,
  PathProbeSeries,
  PathProbeSummaryBadge,
  PathStepState,
  PathwayItemType,
  PathwayReport,
  RankedHypothesis
} from './types';
import { buildPathwayReport } from './report'; // تجمیع خالص گزارش دوره‌ای
import { evaluateProbeSeries, masteryOf } from './progress'; // محاسبات خالص پراپ پیشروی
import type { ChecklistPlan } from './recommender';
import { INTERVENTION_PATH_STATUS_LABELS, PATHWAY_ITEM_TYPES, PATHWAY_SESSION_STATUSES } from './types';
import type {
  PathSessionItem,
  PathSessionRecord,
  PathwaySessionStatus,
  PathwayTemplateSession,
  PathwayTemplateStep,
  PathwayTemplateSummary,
  RecentCardRecord,
  PathBasisSnapshot,
  SessionFidelity
} from './types';
import { runInference } from './infer';
import { HYPOTHESIS_LOG_EVENT_KEY, hypothesisLogFingerprint, hypothesisLogPayload, hypothesisLogSummary } from './hypothesis-log'; // لج فرضیه
import { basisSuggestionsOf, basisSnapshotForTarget, type BasisSuggestion } from './basis'; // قواعد اگر-آنگاه مبنا
import { computeValidationKpis, type ValidationKpis, type ValidationPathInput, type ValidationSessionAgg, type ValidationProbeAgg, type ValidationStudentInput } from './validation'; // اعتبارسنجی بیرونی
import { checklistPlanContextOf, recommendChecklistPlan } from './recommender';
import { narrativeOf, narrativeOfHypothesis } from './narrative';
import { ALL_TARGETS_INCLUDING_REHAB, targetOf } from './targets';

export const MAX_ACTIVE_PATHS = 2;
export const DECISION_NOTE_MAX = 500;

// — محدودیت‌های پروتکل جلسه‌به‌جلسه و قالب مسیر (پاریسی با باندل اصلی) —
export const PATHWAY_SESSION_TITLE_MAX = 120;
export const PATHWAY_SESSION_PLAN_MAX = 500;
export const PATHWAY_SESSION_NOTE_MAX = 300;
export const PATHWAY_SESSION_CRITERION_MAX = 300; // معیار تسلط جلسه
export const PATHWAY_SESSION_MAX = 200;
export const PATHWAY_TEMPLATE_SESSIONS_MAX = 100;
export const PATHWAY_SESSION_ITEMS_MAX = 10;
export const PATHWAY_SESSION_ITEM_TEXT_MAX = PATHWAY_SESSION_PLAN_MAX;
export const PATHWAY_TEMPLATE_DESC_MAX = 300;
export const PATHWAY_TEMPLATE_STEP_HINT_MAX = 200;
export const PATHWAY_TEMPLATE_KEY_RE = /^[a-z0-9][a-z0-9-]{3,59}$/;
export const PATHWAY_ITEM_LINK_ID_RE = /^[0-9a-fA-F][0-9a-fA-F-]{7,63}$/; // فرمت id رکورد بانک تمرین
export const PATHWAY_RECENT_CARDS_MAX = 60; // سقف کارت‌های قبلی تیم
export const PATHWAY_GOAL_MAX = 300; // سقف متن هدف SMART مسیر
const PATHWAY_TEMPLATE_STEP_MAX = 12;
const PATHWAY_TEMPLATE_PROTOCOLS = ['learning', 'slow_learner', 'mental_ot', 'rehab'] as const;

export interface ClinicalPathCreateInput {
  targetKey?: string | null;
  templateKey?: string | null;
  note?: string | null;
  exerciseIds?: string[] | null;
  goal?: string | null; // هدف اندازه‌پذیر (اختیاری — مسیر بدون هدف برچسب می‌گیرد)
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
  criterion?: string | null;
  items?: PathSessionItem[] | null;
}

export interface PathSessionUpdateInput {
  status?: string | null;
  title?: string | null;
  plan?: string | null;
  criterion?: string | null;
  outcome?: string | null;
  note?: string | null;
  items?: PathSessionItem[] | null;
  fidelity?: SessionFidelity | null; // وفاداری اجرا (null = پاک‌کردن)
}

// حسابرسی موردی دو-ارزیاب: ثبت سادهٔ توافق/اختلاف — بدون حساب جدید
export interface CaseAuditCreateInput {
  studentId: string;
  reviewerA: string;
  reviewerB: string;
  targetKey?: string | null;
  agreed: boolean;
  note?: string | null;
}

export interface CaseAuditRecord {
  id: string;
  studentId: string;
  studentName: string;
  reviewerA: string;
  reviewerB: string;
  targetKey: string | null;
  agreed: boolean;
  note: string | null;
  createdBy: string;
  createdAt: string;
}

export const CASE_AUDIT_NOTE_MAX = 300; // سقف یادداشت توافق/اختلاف

interface CaseAuditRow {
  id: string;
  student_id: string;
  reviewer_a: string;
  reviewer_b: string;
  target_key: string | null;
  agreed: number;
  note: string | null;
  created_by: string;
  created_at: string;
}

// — محدودیت‌های پراپ پیشروی (برچسب سنجه/واحد/یادداشت + سقف اندازه و تعداد) —
export const PATH_PROBE_METRIC_MAX = 40;
export const PATH_PROBE_UNIT_MAX = 20;
export const PATH_PROBE_NOTE_MAX = 300;
export const PATH_PROBE_VALUE_MAX = 10000;
export const PATH_PROBES_PER_PATH_MAX = 600;

export interface PathProbeAddInput {
  metric: string;
  value: number;
  unit?: string | null;
  sessionId?: string | null;
  takenAt?: string | null;
  note?: string | null;
}

export interface PathProbeUpdateInput {
  // کلیدِ غایب یعنی مقدار قبلی دست‌نخورده (درس عبور nullish عیناً)
  value?: number | null;
  unit?: string | null;
  note?: string | null;
  sessionId?: string | null;
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
  exerciseIdsExist?: (ids: string[]) => Promise<Set<string>>; // اعتبارسنجی لینک کارت به بانک تمرین (تزریقی)
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
  goal: string | null; // 
  goal_basis: string | null; // 
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface PathProbeRow {
  id: string;
  pathway_id: string;
  session_id: string | null;
  target_key: string;
  metric: string;
  value: number;
  unit: string | null;
  taken_at: string;
  taken_by: string;
  note: string | null;
  created_at: string;
}

interface PathSessionRow {
  id: string;
  pathway_id: string;
  ord: number;
  title: string;
  plan: string | null;
  criterion: string | null;
  outcome: string | null;
  items_json: string;
  status: string;
  done_at: string | null;
  note: string | null;
  fidelity: string | null; // JSON وفاداری اجرا
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
    const t = (it ?? {}) as { type?: unknown; text?: unknown; done?: unknown; linkId?: unknown };
    if (typeof t.type !== 'string' || !PATHWAY_ITEM_TYPES.includes(t.type as PathwayItemType)) continue;
    const text = typeof t.text === 'string' ? t.text.trim() : '';
    if (!text) continue;
    // لینک کارت فقط با فرمت معتبر نگه داشته می‌شود؛ متن کارت اسنپ‌شاتِ عنوان در لحظهٔ درج است
    const linkId = typeof t.linkId === 'string' && PATHWAY_ITEM_LINK_ID_RE.test(t.linkId.trim()) ? t.linkId.trim() : null;
    out.push({
      type: t.type as PathwayItemType,
      text: text.slice(0, PATHWAY_SESSION_ITEM_TEXT_MAX),
      done: t.done === true,
      linkId
    });
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
      // هدف و معیار تسلط جلسه در طرح هم نوشته می‌شود؛ تیک کارت در قالب بی‌معناست و همیشه false می‌ماند
      plan: parseText(typeof (s as { plan?: unknown })?.plan === 'string' ? (s as { plan: string }).plan : null, PATHWAY_SESSION_PLAN_MAX),
      criterion: parseText(typeof (s as { criterion?: unknown })?.criterion === 'string' ? (s as { criterion: string }).criterion : null, PATHWAY_SESSION_CRITERION_MAX),
      items: sanitizeSessionItems((s as { items?: unknown })?.items).map((it) => ({ ...it, done: false }))
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
  const exerciseIdsExist = deps.exerciseIdsExist ?? null; // تزریقی؛ نبودش فقط اعتبارسنجی لینک را رد می‌کند
  const log = logger.child('clinical-engine');
  const now = deps.now ?? (() => new Date());
  const iso = () => now().toISOString();

  // کارتِ پیوسته باید به تمرین موجود بانک وصل باشد؛ حذف تمرین بعداً فقط chip لینک را می‌شکند نه متن کارت را
  async function assertCardLinksExist(items: PathSessionItem[]): Promise<void> {
    if (!exerciseIdsExist) return;
    const ids = [...new Set(items.map((it) => it.linkId).filter((x): x is string => Boolean(x)))];
    if (!ids.length) return;
    const found = await exerciseIdsExist(ids);
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length) {
      throw new ValidationError('یکی از کارت‌های پیوسته به تمرینی حذف‌شده یا ناموجود وصل است — لینک آن کارت را بردارید');
    }
  }

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
          AND t.key != ? -- لج فرضیه خروجی موتور است، نه شاهد ورودی آن
        ORDER BY e.occurred_at DESC, e.created_at DESC
        LIMIT 200`,
      [studentId, HYPOTHESIS_LOG_EVENT_KEY]
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

  // لج فرضیه: اسنپ‌شات رتبه‌بندی در رویداد پرونده — فقط وقتی اثرانگشت عوض شده باشد.
  // ناظر ( فقط-خواندن) هرگز در مسیر GET چیزی نمی‌نویسد؛ دانش‌آموز بی‌فرضیه هم رکورد نمی‌گیرد.
  async function persistHypothesisLogIfChanged(studentId: string, actor: AuthContext, result: InferenceOutput): Promise<void> {
    try {
      if (actor.role === 'supervisor') return;
      if (!result.ranked.length) return;
      const type = await db.queryOne<{ id: string }>(
        `SELECT id FROM case_event_types WHERE key = ? AND deleted_at IS NULL`,
        [HYPOTHESIS_LOG_EVENT_KEY]
      );
      if (!type) return; // مایگریشن ۰۰۷۹ اعمال نشده — بی‌سروصدا رد می‌شود
      const last = await db.queryOne<{ payload: string | null }>(
        `SELECT e.payload
           FROM case_events e
           JOIN case_event_types t ON t.id = e.event_type_id
          WHERE e.student_id = ? AND t.key = ? AND e.status = 'completed' AND e.deleted_at IS NULL
          ORDER BY e.occurred_at DESC, e.created_at DESC LIMIT 1`,
        [studentId, HYPOTHESIS_LOG_EVENT_KEY]
      );
      const fingerprint = hypothesisLogFingerprint(result.ranked);
      const lastFingerprint = last?.payload
        ? (parseJson<{ fingerprint?: string } | null>(last.payload, null)?.fingerprint ?? null)
        : null;
      if (lastFingerprint === fingerprint) return;
      const id = crypto.randomUUID();
      const at = now().toISOString();
      await db.execute(
        `INSERT INTO case_events (id, event_type_id, student_id, staff_id, appointment_id, occurred_at,
                                  status, payload, analysis, summary, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, NULL, ?, 'completed', ?, NULL, ?, ?, ?, ?)`,
        [id, type.id, studentId, actor.staffId, at, JSON.stringify(hypothesisLogPayload(result.ranked, at)), hypothesisLogSummary(result.ranked), actor.staffId, at, at]
      );
      await audit.log({
        actorId: actor.staffId,
        action: 'clinical_insights.hypothesis_log',
        resourceType: 'student',
        resourceId: studentId,
        changes: { fingerprint: { from: lastFingerprint, to: fingerprint } }
      });
      log.debug('hypothesis log appended', { studentId, fingerprint });
    } catch (err) {
      // لج کمکی است — خطای نوشتنش نباید تفسیر بالینی را بشکند
      log.warn('hypothesis log write failed', { studentId, error: String(err) });
    }
  }

  async function getInsights(studentId: string, actor: AuthContext): Promise<InferenceOutput & {
    basis: BasisSuggestion[]; // مبناهای پیشنهاد فعال
    student: { id: string; name: string; grade: string | null };
    narrative: ReturnType<typeof narrativeOf>['text'];
    ranked: (InferenceOutput['ranked'][number] & { narrative: ReturnType<typeof narrativeOfHypothesis> })[];
  }> {
    const student = await loadStudent(studentId);
    assertCanView(student, actor);
    const events = await loadEvidenceEvents(studentId);
    const result = runInference(events, { now });
    await persistHypothesisLogIfChanged(studentId, actor, result); // اسنپ‌شات لج فرضیه
    log.debug('insights computed', { studentId, ranked: result.ranked.length });
    return {
      ...result,
      ranked: result.ranked.map((h) => ({ ...h, narrative: narrativeOfHypothesis(h) })),
      basis: basisSuggestionsOf(events), // مبناهای پیشنهاد فعال از دادهٔ موجود
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
      criterion: r.criterion ?? null,
      outcome: r.outcome ?? null,
      items: sanitizeSessionItems(parseJson<PathSessionItem[]>(r.items_json ?? '[]', [])),
      status,
      doneAt: r.done_at,
      note: r.note,
      fidelity: parseJson<SessionFidelity | null>(r.fidelity ?? null, null), // 
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

  function pathRowToRecord(r: PathRow, sessions: PathSessionRecord[] = [], probeSummary: PathProbeSummaryBadge | null = null): InterventionPathRecord {
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
      probeSummary, // فقط listPaths بج را پر می‌کند؛ مسیرهای تکی null می‌مانند
      reassessAt: r.reassess_at,
      goal: r.goal ?? null,
      goalBasis: parseJson<PathBasisSnapshot | null>(r.goal_basis, null), // 
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

  // بج پراپ فهرست مسیرها بدون N+1: یک کوئری سقف‌دار (۴۰۰ سطر جدیدتر کل) برای همهٔ مسیرها؛
  // masteredMetric = آخرین سنجهٔ مسیر که دنبالهٔ انتهایی‌اش ملاک تسلط را گذرانده (masteryOf).
  async function loadProbeSummariesOfPaths(pathIds: string[]): Promise<Map<string, PathProbeSummaryBadge>> {
    const map = new Map<string, PathProbeSummaryBadge>();
    if (pathIds.length === 0) return map;
    const rows = await db.query<{ pathway_id: string; metric: string; value: number; taken_at: string }>(
      `SELECT pathway_id, metric, value, taken_at FROM pathway_probes
        WHERE pathway_id IN (${pathIds.map(() => '?').join(', ')})
        ORDER BY taken_at DESC
        LIMIT 400`,
      pathIds
    );
    // سقف ۴۰۰ سطر: بج اطلاع‌رسانی است نه گزارش رسمی؛ ۴۰۰ پراپِ جدیدتر برای دنبالهٔ تسلط کافی است
    // (ترتیب DESC یعنی جدیدترین‌ها می‌مانند) و شمارش بیش از سقف، کمتر از واقعی دیده می‌شود.
    type MetricSeries = { points: { value: number; takenAt: string }[]; lastAt: string };
    const byPathMetric = new Map<string, Map<string, MetricSeries>>();
    const counts = new Map<string, number>();
    for (const r of rows) {
      counts.set(r.pathway_id, (counts.get(r.pathway_id) ?? 0) + 1);
      let metrics = byPathMetric.get(r.pathway_id);
      if (!metrics) {
        metrics = new Map();
        byPathMetric.set(r.pathway_id, metrics);
      }
      const s = metrics.get(r.metric) ?? { points: [], lastAt: r.taken_at };
      s.points.push({ value: r.value, takenAt: r.taken_at }); // DESC ورودی — بعد برعکس می‌شود
      s.lastAt = r.taken_at; // اولین سطر دیده‌شده = جدیدترین
      metrics.set(r.metric, s);
    }
    for (const [pathId, metrics] of byPathMetric) {
      let masteredMetric: string | null = null;
      let masteredAt = '';
      for (const [metric, s] of metrics) {
        const asc = [...s.points].reverse(); // صعودی برای masteryOf
        if (masteryOf(asc).achieved && s.lastAt > masteredAt) {
          masteredMetric = metric;
          masteredAt = s.lastAt;
        }
      }
      map.set(pathId, { count: counts.get(pathId) ?? 0, masteredMetric });
    }
    return map;
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
    const probesByPath = await loadProbeSummariesOfPaths(rows.map((r) => r.id)); // بج پراپ
    return rows.map((r) => pathRowToRecord(r, sessionsByPath.get(r.id) ?? [], probesByPath.get(r.id) ?? null));
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
    // اسنپ‌شات قواعد اگر-آنگاهِ فعالِ همین هدف در لحظهٔ ساخت (مبنای پیشنهاد)
    const goalBasis = basisSnapshotForTarget(events, targetKey);
    const goal = input.goal?.trim() ? input.goal.trim().slice(0, PATHWAY_GOAL_MAX) : null;

    const id = crypto.randomUUID();
    if (steps.length === 0) {
      steps = target.path.map((s) => ({ key: s.key, title: s.title, doneAt: null }));
    }
    const exerciseIds = (input.exerciseIds ?? []).filter((x) => typeof x === 'string' && x.length > 0).slice(0, 20);

    await db.execute(
      `INSERT INTO intervention_paths (id, student_id, target_key, status, engine_hypothesis, steps, exercise_ids, template_key, template_title, goal, goal_basis, created_by, created_at, updated_at)
       VALUES (?, ?, ?, 'suggested', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, studentId, targetKey, hypothesis ? JSON.stringify(hypothesis) : null, JSON.stringify(steps), JSON.stringify(exerciseIds), templateKey, templateTitle, goal, goalBasis ? JSON.stringify(goalBasis) : null, actor.staffId, iso(), iso()]
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
        `INSERT INTO pathway_sessions (id, pathway_id, ord, title, plan, criterion, items_json, status, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'planned', ?, ?, ?)`,
        [crypto.randomUUID(), id, i + 1, ts.title, ts.plan, ts.criterion, JSON.stringify(ts.items), actor.staffId, iso(), iso()]
      );
    }
    log.info('path created', { studentId, targetKey, template: templateKey, engine: hypothesis !== null, goal: Boolean(goal), sessionsSeeded: tplSessions.length });
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

  // ─── قالب‌های مسیر (بازگردانی بخش مدیریت قالب‌ها از باندل اصلی) ───
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
    await assertCardLinksExist(sessions.flatMap((s) => s.items)); // لینک کارت‌های طرح به بانک تمرین بررسی شود
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
    const criterion = parseText(input.criterion, PATHWAY_SESSION_CRITERION_MAX);
    const items = sanitizeSessionItems(input.items);
    await assertCardLinksExist(items); // لینک کارت‌ها به بانک تمرین بررسی شود
    await db.execute(
      `INSERT INTO pathway_sessions (id, pathway_id, ord, title, plan, criterion, items_json, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'planned', ?, ?, ?)`,
      [id, pathId, ord, title, plan, criterion, JSON.stringify(items), actor.staffId, iso(), iso()]
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
    const nextCriterion = input.criterion !== undefined ? parseText(input.criterion, PATHWAY_SESSION_CRITERION_MAX) : session.criterion ?? null;
    const nextOutcome = input.outcome !== undefined ? parseText(input.outcome, PATHWAY_SESSION_CRITERION_MAX) : session.outcome ?? null;
    const nextNote = input.note !== undefined ? parseText(input.note, PATHWAY_SESSION_NOTE_MAX) : session.note;
    const nextItems = input.items !== undefined ? sanitizeSessionItems(input.items) : sanitizeSessionItems(parseJson<PathSessionItem[]>(session.items_json ?? '[]', []));
    if (input.items !== undefined) await assertCardLinksExist(nextItems); // فقط وقتی آیتم‌ها عوض شدند لینک‌ها بررسی شود
    // وفاداری اجرا: فقط سه بولی؛ null = پاک‌کردن چک‌لیست
    let nextFidelity: SessionFidelity | null;
    if (input.fidelity !== undefined) {
      nextFidelity = input.fidelity
        ? { protocol: Boolean(input.fidelity.protocol), homework: Boolean(input.fidelity.homework), parent: Boolean(input.fidelity.parent) }
        : null;
    } else {
      nextFidelity = parseJson<SessionFidelity | null>(session.fidelity ?? null, null);
    }
    let nextStatus = session.status;
    let nextDoneAt = session.done_at;
    if (input.status && input.status !== session.status) {
      nextStatus = input.status;
      nextDoneAt = input.status === 'done' ? iso() : null;
    }
    await db.execute(
      `UPDATE pathway_sessions SET title = ?, plan = ?, criterion = ?, outcome = ?, items_json = ?, status = ?, done_at = ?, note = ?, fidelity = ?, updated_at = ? WHERE id = ?`,
      [nextTitle, nextPlan, nextCriterion, nextOutcome, JSON.stringify(nextItems), nextStatus, nextDoneAt, nextNote, nextFidelity ? JSON.stringify(nextFidelity) : null, iso(), sessionId]
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

  // ─── جابه‌جایی جلسات طرح (درگ‌ودراپ) — ترتیب کامل با یک فراخوان ───
  async function reorderPathSessions(pathId: string, orderedIds: string[], actor: AuthContext): Promise<PathSessionRecord[]> {
    const row = await loadPathRow(pathId);
    const student = await loadStudent(row.student_id);
    assertCanDecide(student, actor);
    if (row.status === 'closed') {
      throw new ConflictError('مسیر بسته‌شده جابه‌جایی جلسات نمی‌پذیرد');
    }
    const sessions = await db.query<PathSessionRow>(
      `SELECT * FROM pathway_sessions WHERE pathway_id = ? ORDER BY ord ASC`,
      [pathId]
    );
    if (orderedIds.length !== sessions.length) {
      throw new ValidationError('فهرست ترتیب باید شامل همهٔ جلسات مسیر باشد');
    }
    if (new Set(orderedIds).size !== orderedIds.length) {
      throw new ValidationError('شناسهٔ تکراری در فهرست ترتیب مجاز نیست');
    }
    const byId = new Map(sessions.map((s) => [s.id, s]));
    for (const id of orderedIds) {
      if (!byId.has(id)) throw new NotFoundError('جلسهٔ برنامه');
    }
    const beforeOrder = [...sessions].sort((a, b) => a.ord - b.ord).map((s) => s.id);
    const changed = orderedIds.some((id, i) => beforeOrder[i] !== id);
    if (!changed) return loadPathSessions(pathId); // ترتیب یکسان — نوشتن بی‌دلیل
    await db.transaction(async (tx) => {
      for (const [i, id] of orderedIds.entries()) {
        await tx.execute(
          `UPDATE pathway_sessions SET ord = ?, updated_at = ? WHERE id = ?`,
          [i + 1, iso(), id]
        );
      }
      await audit.logInTransaction(tx, {
        actorId: actor.staffId,
        action: 'clinical_path.sessions_reorder',
        resourceType: 'intervention_path',
        resourceId: pathId,
        changes: { order: { from: beforeOrder, to: [...orderedIds] } }
      });
    });
    log.info('path sessions reordered', { pathId, count: orderedIds.length });
    return loadPathSessions(pathId);
  }

  // ─── پراپ‌های پیشروی مسیر (سری زمانی سنجه‌ها) ───
  function probeRowToRecord(r: PathProbeRow): PathProbeRecord {
    return {
      id: r.id,
      pathwayId: r.pathway_id,
      sessionId: r.session_id,
      targetKey: r.target_key,
      metric: r.metric,
      value: r.value,
      unit: r.unit,
      takenAt: r.taken_at,
      takenBy: r.taken_by,
      note: r.note,
      createdAt: r.created_at
    };
  }

  async function addPathProbe(pathId: string, input: PathProbeAddInput, actor: AuthContext): Promise<PathProbeRecord> {
    const row = await loadPathRow(pathId);
    const student = await loadStudent(row.student_id);
    assertCanDecide(student, actor);
    if (row.status === 'closed') {
      throw new ConflictError('مسیر بسته‌شده پراپ جدید نمی‌پذیرد');
    }
    if (input.sessionId) {
      const session = await db.queryOne<{ id: string }>(
        `SELECT id FROM pathway_sessions WHERE id = ? AND pathway_id = ?`,
        [input.sessionId, pathId]
      );
      if (!session) throw new NotFoundError('جلسهٔ برنامه');
    }
    // مهر پراپ ISO UTC نرمال می‌شود؛ ورودی بی‌معنا همین‌جا رد می‌شود (روت هم با zod می‌گیرد)
    let takenAt = iso();
    if (input.takenAt) {
      const t = new Date(input.takenAt);
      if (Number.isNaN(t.getTime())) throw new ValidationError('تاریخ پراپ معتبر نیست');
      takenAt = t.toISOString();
    }
    const count = await db.queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM pathway_probes WHERE pathway_id = ?`,
      [pathId]
    );
    if ((count?.n ?? 0) >= PATH_PROBES_PER_PATH_MAX) {
      throw new ConflictError(`حداکثر ${PATH_PROBES_PER_PATH_MAX} پراپ برای یک مسیر مجاز است`);
    }
    const id = crypto.randomUUID();
    const metric = input.metric.trim();
    const unit = parseText(input.unit, PATH_PROBE_UNIT_MAX);
    const note = parseText(input.note, PATH_PROBE_NOTE_MAX);
    await db.execute(
      `INSERT INTO pathway_probes (id, pathway_id, session_id, target_key, metric, value, unit, taken_at, taken_by, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, pathId, input.sessionId ?? null, row.target_key, metric, input.value, unit, takenAt, actor.staffId, note, iso(), iso()]
    );
    await audit.log({
      actorId: actor.staffId,
      action: 'clinical_path.probe_add',
      resourceType: 'intervention_path',
      resourceId: pathId,
      changes: { metric: { from: null, to: metric }, value: { from: null, to: input.value } }
    });
    log.info('path probe added', { pathId, metric, value: input.value });
    const created = await db.queryOne<PathProbeRow>(`SELECT * FROM pathway_probes WHERE id = ?`, [id]);
    return probeRowToRecord(created as PathProbeRow);
  }

  async function listPathProbes(
    pathId: string,
    actor: AuthContext,
    opts?: { metric?: string | null; threshold?: number | null }
  ): Promise<{ metrics: PathProbeSeries[]; total: number }> {
    const row = await loadPathRow(pathId);
    const student = await loadStudent(row.student_id);
    assertCanView(student, actor); // همان قاعدهٔ دید پرونده — منشی هم می‌خواند
    const conds = ['pathway_id = ?'];
    const params: string[] = [pathId];
    if (opts?.metric) {
      conds.push('metric = ?');
      params.push(opts.metric.trim());
    }
    const rows = await db.query<PathProbeRow>(
      `SELECT * FROM pathway_probes WHERE ${conds.join(' AND ')} ORDER BY taken_at ASC, created_at ASC`,
      params
    );
    // گروه‌بندی بر اساس سنجه به ترتیب اولین دیده‌شدن؛ هر گروه سری صعودی مستقل خودش را دارد
    const groups = new Map<string, PathProbeRow[]>();
    for (const r of rows) {
      const list = groups.get(r.metric);
      if (list) list.push(r);
      else groups.set(r.metric, [r]);
    }
    const threshold = opts?.threshold ?? undefined;
    const metrics: PathProbeSeries[] = [...groups.entries()].map(([metric, list]) => {
      const ev = evaluateProbeSeries(
        list.map((r) => ({ value: r.value, takenAt: r.taken_at })),
        threshold
      );
      return {
        metric,
        unit: list[0].unit,
        count: ev.count,
        firstAt: list[0].taken_at,
        lastAt: list[list.length - 1].taken_at,
        latestValue: ev.latestValue,
        slope: ev.slope,
        verdict: ev.verdict,
        mastery: ev.mastery,
        monitor: ev.monitor, // قاعدهٔ ۴-نقطه + هشدار سکون
        points: list.map((r) => ({ value: r.value, takenAt: r.taken_at }))
      };
    });
    return { metrics, total: rows.length };
  }

  async function updatePathProbe(pathId: string, probeId: string, input: PathProbeUpdateInput, actor: AuthContext): Promise<PathProbeRecord> {
    const row = await loadPathRow(pathId);
    const student = await loadStudent(row.student_id);
    assertCanDecide(student, actor);
    const probe = await db.queryOne<PathProbeRow>(
      `SELECT * FROM pathway_probes WHERE id = ? AND pathway_id = ?`,
      [probeId, pathId]
    );
    if (!probe) throw new NotFoundError('پراپ');

    // اصلاح نمرهٔ اشتباه‌گرفته‌شده؛ کلید غایب = دست‌نخوردن مقدار قبلی (درس )
    const nextValue = input.value !== undefined ? input.value : probe.value;
    const nextUnit = input.unit !== undefined ? parseText(input.unit, PATH_PROBE_UNIT_MAX) : probe.unit;
    const nextNote = input.note !== undefined ? parseText(input.note, PATH_PROBE_NOTE_MAX) : probe.note;
    let nextSessionId = probe.session_id;
    if (input.sessionId !== undefined) {
      if (input.sessionId === null) {
        nextSessionId = null; // بازکردن پیوند صریح
      } else {
        const session = await db.queryOne<{ id: string }>(
          `SELECT id FROM pathway_sessions WHERE id = ? AND pathway_id = ?`,
          [input.sessionId, pathId]
        );
        if (!session) throw new NotFoundError('جلسهٔ برنامه');
        nextSessionId = input.sessionId;
      }
    }
    await db.execute(
      `UPDATE pathway_probes SET value = ?, unit = ?, note = ?, session_id = ?, updated_at = ? WHERE id = ?`,
      [nextValue, nextUnit, nextNote, nextSessionId, iso(), probeId]
    );
    await audit.log({
      actorId: actor.staffId,
      action: 'clinical_path.probe_update',
      resourceType: 'intervention_path',
      resourceId: pathId,
      changes: {
        probe_id: { from: null, to: probeId },
        value: { from: probe.value, to: nextValue }
      }
    });
    log.info('path probe updated', { pathId, probeId, from: probe.value, to: nextValue });
    const updated = await db.queryOne<PathProbeRow>(`SELECT * FROM pathway_probes WHERE id = ?`, [probeId]);
    return probeRowToRecord(updated as PathProbeRow);
  }

  // ─── گزارش دوره‌ای طرح درمان (فقط‌خواندنی، روی‌دادِ محاسبه‌شده — هیچ جدول گزارشی نیست) ───
  // بازهٔ from/to روی مهر زمانیِ جلسه (done_at) فیلتر می‌شود؛ جلسات بدون مهر (planned/skipped)
  // فقط در گزارش «کل دوره» می‌آیند — گزارش دوره‌ای یعنی «در این بازه چه اتفاقی افتاد».
  async function getPathwayReport(
    pathId: string,
    query: { from: string | null; to: string | null },
    actor: AuthContext
  ): Promise<PathwayReport> {
    const row = await loadPathRow(pathId);
    const student = await loadStudent(row.student_id);
    assertCanView(student, actor); // همان قاعدهٔ دید پروندهٔ بالینی — درمانگر فقط پروندهٔ خودش
    // ورودی تاریخ YYYY-MM-DD است؛ مرز روز با آفست تهران به لحظهٔ UTC تبدیل می‌شود («تا» شاملِ کل آن روز)
    const startAt = query.from ? tehranDayRange(query.from).start : null;
    const endAt = query.to ? tehranDayRange(query.to).end : null;
    if (startAt && endAt && startAt > endAt) {
      throw new ValidationError('بازهٔ گزارش نامعتبر است — تاریخ «از» بعد از «تا» است');
    }
    // کوئری پارامتری؛ صفت‌های بازه فقط وقتی که تاریخ آمده اضافه می‌شوند
    const conds = ['pathway_id = ?'];
    const params: string[] = [pathId];
    if (startAt) {
      conds.push('done_at >= ?');
      params.push(startAt);
    }
    if (endAt) {
      conds.push('done_at <= ?');
      params.push(endAt);
    }
    const sessions = (await db.query<PathSessionRow>(
      `SELECT * FROM pathway_sessions WHERE ${conds.join(' AND ')} ORDER BY ord ASC, created_at ASC`,
      params
    )).map(sessionRowToRecord);
    log.info('pathway report built', {
      pathId,
      period: query.from || query.to ? `${query.from ?? ''}..${query.to ?? ''}` : 'full',
      sessions: sessions.length
    });
    // پراپ‌های مسیر برای پاسخ عددی سه پرسش گزارش (همهٔ دوره — روند به کل داده نگاه می‌کند)
    const probeRows = await db.query<PathProbeRow>(
      `SELECT * FROM pathway_probes WHERE pathway_id = ? ORDER BY taken_at ASC, created_at ASC`,
      [pathId]
    );
    const probeGroups = new Map<string, PathProbeRow[]>();
    for (const r of probeRows) {
      const list = probeGroups.get(r.metric);
      if (list) list.push(r);
      else probeGroups.set(r.metric, [r]);
    }
    const metrics: PathProbeSeries[] = [...probeGroups.entries()].map(([metric, list]) => {
      const ev = evaluateProbeSeries(list.map((r) => ({ value: r.value, takenAt: r.taken_at })));
      return {
        metric,
        unit: list[0].unit,
        count: ev.count,
        firstAt: list[0].taken_at,
        lastAt: list[list.length - 1].taken_at,
        latestValue: ev.latestValue,
        slope: ev.slope,
        verdict: ev.verdict,
        mastery: ev.mastery,
        monitor: ev.monitor,
        points: list.map((r) => ({ value: r.value, takenAt: r.taken_at }))
      };
    });
    return buildPathwayReport(pathRowToRecord(row), sessions, { from: query.from, to: query.to }, metrics);
  }

  // ─── کارت‌های قبلی تیم (کتابخانهٔ استفادهٔ مجدد) — دیکشانده با شمارندهٔ استفاده ───
  async function listRecentCards(): Promise<RecentCardRecord[]> {
    const tplRows = await db.query<{ sessions_json: string | null; updated_at: string }>(
      `SELECT sessions_json, updated_at FROM pathway_templates WHERE active = 1 AND sessions_json IS NOT NULL`
    );
    const sesRows = await db.query<{ items_json: string; updated_at: string }>(
      `SELECT ps.items_json, ps.updated_at
         FROM pathway_sessions ps
         JOIN intervention_paths ip ON ip.id = ps.pathway_id
        WHERE ip.deleted_at IS NULL
        ORDER BY ps.updated_at DESC
        LIMIT 400`
    );
    const seen = new Map<string, RecentCardRecord>();
    const absorb = (items: PathSessionItem[], usedAt: string) => {
      for (const it of items) {
        const key = `${it.type}\u0000${it.text}`;
        const prev = seen.get(key);
        if (prev) {
          prev.usageCount += 1;
          if (usedAt > prev.lastUsedAt) prev.lastUsedAt = usedAt;
        } else {
          seen.set(key, { type: it.type, text: it.text, linkId: it.linkId, usageCount: 1, lastUsedAt: usedAt });
        }
      }
    };
    for (const r of sesRows) {
      absorb(sanitizeSessionItems(parseJson<unknown[]>(r.items_json ?? '[]', [])), r.updated_at ?? '');
    }
    for (const r of tplRows) {
      const usedAt = r.updated_at ?? '';
      for (const s of sanitizeTemplateSessions(parseJson<unknown[]>(r.sessions_json ?? '[]', []))) {
        absorb(s.items, usedAt);
      }
    }
    return [...seen.values()]
      .sort((a, b) => b.usageCount - a.usageCount || b.lastUsedAt.localeCompare(a.lastUsedAt))
      .slice(0, PATHWAY_RECENT_CARDS_MAX);
  }

  // هدف‌گذاری/ویرایش هدف مسیر (SMART) — مسیر بدون هدف هم قابل‌هدف‌گذاری است
  async function updatePathGoal(pathId: string, goal: string | null, actor: AuthContext): Promise<InterventionPathRecord> {
    const row = await loadPathRow(pathId);
    const student = await loadStudent(row.student_id);
    assertCanDecide(student, actor);
    const text = goal?.trim() ? goal.trim().slice(0, PATHWAY_GOAL_MAX) : null;
    await db.execute(
      `UPDATE intervention_paths SET goal = ?, updated_at = ? WHERE id = ?`,
      [text, iso(), pathId]
    );
    await audit.log({
      actorId: actor.staffId,
      action: 'clinical_path.goal',
      resourceType: 'intervention_path',
      resourceId: pathId,
      changes: { goal: { from: row.goal ?? null, to: text } }
    });
    log.info('path goal updated', { pathId, hasGoal: Boolean(text) });
    return pathRowToRecord(await loadPathRow(pathId), await loadPathSessions(pathId));
  }

  // ─── اعتبارسنجی بیرونی: KPIها فقط از دادهٔ موجود + حسابرسی موردی ───

  async function getValidationKpis(actor: AuthContext): Promise<ValidationKpis> {
    if (actor.role !== 'manager') {
      throw new ForbiddenError('داشبورد اعتبارسنجی فقط برای مدیر قابل مشاهده است');
    }
    const paths = (await db.query<{
      id: string; student_id: string; engine_hypothesis: string | null; decision: string | null; reassess_at: string | null;
    }>(`SELECT id, student_id, engine_hypothesis, decision, reassess_at FROM intervention_paths WHERE deleted_at IS NULL`))
      .map((r): ValidationPathInput => ({
        id: r.id,
        studentId: r.student_id,
        engineHypothesis: parseJson<RankedHypothesis | null>(r.engine_hypothesis, null),
        decision: parseJson<PathDecision | null>(r.decision, null),
        reassessAt: r.reassess_at
      }));
    const sessions = (await db.query<{ pathway_id: string; last_done: string | null; n: number }>(
      `SELECT pathway_id, MAX(done_at) AS last_done, COUNT(*) AS n FROM pathway_sessions
        WHERE status = 'done' AND done_at IS NOT NULL GROUP BY pathway_id`
    )).map((r): ValidationSessionAgg => ({ pathwayId: r.pathway_id, lastDoneAt: r.last_done, doneCount: r.n }));
    const probeRows = await db.query<{ pathway_id: string; metric: string; value: number; taken_at: string }>(
      `SELECT pathway_id, metric, value, taken_at FROM pathway_probes ORDER BY taken_at ASC, created_at ASC`
    );
    const probeGroups = new Map<string, ValidationProbeAgg>();
    for (const r of probeRows) {
      const g = probeGroups.get(`${r.pathway_id}\u0000${r.metric}`);
      if (g) g.values.push({ value: r.value, takenAt: r.taken_at });
      else probeGroups.set(`${r.pathway_id}\u0000${r.metric}`, { pathwayId: r.pathway_id, metric: r.metric, values: [{ value: r.value, takenAt: r.taken_at }] });
    }
    const resultsRows = await db.query<{ student_id: string; first_at: string }>(
      `SELECT e.student_id, MIN(e.occurred_at) AS first_at
         FROM case_events e
         JOIN case_event_types t ON t.id = e.event_type_id
        WHERE t.key = 'ce-results-v1' AND e.status = 'completed' AND e.deleted_at IS NULL
        GROUP BY e.student_id`
    );
    const firstResultsOf = new Map(resultsRows.map((r) => [r.student_id, r.first_at]));
    const students = (await db.query<{ id: string; created_at: string }>(`SELECT id, created_at FROM students`))
      .map((r): ValidationStudentInput => ({ id: r.id, createdAt: r.created_at, firstResultsAt: firstResultsOf.get(r.id) ?? null }));
    const kpis = computeValidationKpis(paths, sessions, [...probeGroups.values()], students, now());
    log.info('validation kpis computed', {
      decided: kpis.hypothesisConvergence.base,
      withProbes: kpis.interventionResponse.base,
      dueReassess: kpis.reassessOnTime.base
    });
    return kpis;
  }

  async function createCaseAudit(input: CaseAuditCreateInput, actor: AuthContext): Promise<CaseAuditRecord> {
    if (actor.role !== 'manager') {
      throw new ForbiddenError('ثبت حسابرسی موردی فقط توسط مدیر مجاز است');
    }
    const student = await loadStudent(input.studentId);
    const id = crypto.randomUUID();
    await db.execute(
      `INSERT INTO case_audits (id, student_id, reviewer_a, reviewer_b, target_key, agreed, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, student.id, input.reviewerA.trim(), input.reviewerB.trim(), input.targetKey?.trim() || null, input.agreed ? 1 : 0, input.note?.trim()?.slice(0, CASE_AUDIT_NOTE_MAX) ?? null, actor.staffId]
    );
    await audit.log({
      actorId: actor.staffId,
      action: 'case_audit.create',
      resourceType: 'student',
      resourceId: student.id,
      changes: { agreed: { from: null, to: input.agreed }, reviewers: { from: null, to: `${input.reviewerA} / ${input.reviewerB}` } }
    });
    return caseAuditRowToRecord(await db.queryOne<CaseAuditRow & { student_first: string; student_last: string }>(
      `SELECT a.*, s.first_name AS student_first, s.last_name AS student_last FROM case_audits a JOIN students s ON s.id = a.student_id WHERE a.id = ?`,
      [id]
    ) as CaseAuditRow & { student_first: string; student_last: string });
  }

  async function listCaseAudits(actor: AuthContext, studentId: string | null): Promise<CaseAuditRecord[]> {
    if (actor.role !== 'manager') {
      throw new ForbiddenError('حسابرسی موردی فقط برای مدیر قابل مشاهده است');
    }
    const rows = studentId
      ? await db.query<CaseAuditRow & { student_first: string; student_last: string }>(
          `SELECT a.*, s.first_name AS student_first, s.last_name AS student_last
             FROM case_audits a JOIN students s ON s.id = a.student_id
            WHERE a.student_id = ? ORDER BY a.created_at DESC LIMIT 50`,
          [studentId]
        )
      : await db.query<CaseAuditRow & { student_first: string; student_last: string }>(
          `SELECT a.*, s.first_name AS student_first, s.last_name AS student_last
             FROM case_audits a JOIN students s ON s.id = a.student_id
            ORDER BY a.created_at DESC LIMIT 50`
        );
    return rows.map((r) => caseAuditRowToRecord(r));
  }

  function caseAuditRowToRecord(r: CaseAuditRow & { student_first: string; student_last: string }): CaseAuditRecord {
    return {
      id: r.id,
      studentId: r.student_id,
      studentName: `${r.student_first} ${r.student_last}`.trim(),
      reviewerA: r.reviewer_a,
      reviewerB: r.reviewer_b,
      targetKey: r.target_key,
      agreed: r.agreed === 1,
      note: r.note,
      createdBy: r.created_by,
      createdAt: r.created_at
    };
  }

  return { getInsights, getChecklistPlan, listPaths, createPath, decidePath, getPath, listTargets, toggleStep, listPathTemplates, upsertPathTemplate, listPathSessions, addPathSession, updatePathSession, deletePathSession, reorderPathSessions, listRecentCards, getPathwayReport, addPathProbe, listPathProbes, updatePathProbe, updatePathGoal, getValidationKpis, createCaseAudit, listCaseAudits }; // پراپ‌های پیشروی · هدف مسیر · اعتبارسنجی
}

export type ClinicalEngineService = ReturnType<typeof createClinicalEngineService>;

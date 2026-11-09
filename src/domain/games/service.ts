// service.ts — سرویس بازی: توکن، نمره‌دهی سروری، دوز سمت سرور، ماشین حالت لینک (M1 / ۱.۲۵.۰۷)
// قرارداد §۵/§۶/§۸ نقشهٔ راه. هیچ کلید پاسخی از این سرویس به کلاینت نمی‌رود.
import type { AuthContext } from '@core/shared';
import { tehranDayRange, tehranTodayYmd } from '@core/shared';
import { ConflictError, NotFoundError, ValidationError } from '@core/errors';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { DbClient } from '@core/db';
import {
  computeMetricValue,
  decideValidity,
  runPublishGates,
  scoreAttempt,
  answerDisplayOf,
  previewMissionOf,
  previewItemAt,
  stimLabelOf,
  stripAnswerKeys,
  numlineFeedbackOf,
  scanMissedCsv,
  SCAN_FB_ALL,
  toItemView
} from './pure';
import { protocolForAge, protocolSnapshotOf, bandForAge, applyNbackProtocol } from './protocol';
import type { ProtocolMode } from './protocol';
import { WINDOW_MAX_MS, WINDOW_MIN_MS } from './adaptive';
import {
  applyStageOverrides,
  currentStageOf,
  itemInStageFor,
  stageById,
  stageByIndex,
  stageOutcomeFor,
  stageProgressOfKind,
  stageStimViewOf,
  scanStageWaveMs,
  STAGE_RULES_VERSION,
  STAGE_TOTAL,
  type GameKind,
  type StageDef,
  type StageHistoryRow,
  type StageProgress
} from './stages';
import { buildEvidenceDossier } from './evidence';
import { summarizeAttempts } from './scoring';
import { assessQuality, serializeQuality, type QualityInput } from './quality';
import { buildComparison, type ChildGameReport, type ReportRawAttempt, type ReportSession } from './report';
import { decideAdaptive, applyAdaptiveLevel, serializeDecision, type AdaptiveSessionInput, type AdaptiveDecision } from './adaptive';
import { generateSequence, serializeSequence, parseSequenceRecord, nbackRotationOffsetOf, nbackOrderedItems, serializeNbackRotation, parseNbackRotation } from './stimulus';
import { ENGINE_METRICS, ENGINE_ONLY_FORMULAS, mergeEngineMetrics } from './registry-extra';
// رجیستری نوع-محور (G4الف/رفع P3-4) — تجزیهٔ kind و پرچم‌های نوع تک‌منبعش همین نقشه است
import { gameKindOf } from './registry';
import type {
  AttemptDraftInput,
  SessionEvidenceFromClient,
  AttemptFeedback,
  GamesDeps,
  GamesService,
  ItemView,
  LinkIssueOutcome,
  MissionConfig,
  MissionItem,
  MissionRecord,
  MissionStatus,
  PackageBody,
  PackageRecord,
  PackageUpsertInput,
  PrescriptionCreateInput,
  PrescriptionListQuery,
  PrescriptionListRecord,
  PrescriptionRecord,
  FollowupRow,
  FollowupReason,
  PublicStateView,
  PreviewIssueOutcome,
  PreviewStateView,
  RegistryGoal,
  RegistryMetric,
  SessionMetricOutcome,
  SessionValidity
} from './types';

const LINK_URL_PATH = '/m/';
const PREVIEW_URL_PATH = '/play/preview/';
const PREVIEW_TTL_MINUTES = 30; // توکن کوتاه‌عمر — ممیزی فاز ۰ U4
const FEEDBACK_OK = 'گرفتی!';
const FEEDBACK_WITHHOLD = 'عالی، صبر کردی!'; // بازداری درست گو/نوگو — سند محتوا بستهٔ ۳
const FEEDBACK_RETRY = 'این یکی سخته؛ بیا با هم دوباره نگاهش کنیم.'; // متن پیش‌فرض خطا §۲ — هیچ سرزنشی
const MAX_RT_MS = 120000; // بیش از ۲ دقیقه = زمان واکنش بی‌معنا
const STALE_SESSION_MS = 6 * 3600 * 1000; // جلسهٔ بی‌فعالیت >۶ ساعت = رهاشده (لینک هم ≤۱۲ ساعت عمر دارد)
const STALL_DAYS = 7; // رکود تبعیت: ≥۷ روز بی‌جلسه در تجویز فعال

interface LinkRow {
  jti: string;
  mission_id: string;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
}

interface MissionRow {
  id: string;
  prescription_id: string;
  scheduled_for: string;
  mission_ref: string;
  status: MissionStatus;
}

interface PrescriptionRow {
  id: string;
  child_id: string;
  package_id: string;
  package_version: string;
  goal_id: string;
  pathway_id: string | null;
  dose_override: string | null;
  suggested_by: string;
  created_by: string;
  approved_by: string;
  status: string;
  created_at: string;
}

/** ردیف فهرست تجویزها با هم‌پیوند هویت انسانی (۱.۲۵.۲۴) — ترکیب p.* با ستون‌های join */
type PrescriptionListRow = PrescriptionRow & {
  child_name: string | null;
  goal_title_fa: string | null;
  package_title_fa: string | null;
  mission_total: number;
  mission_done: number;
  mission_live: number;
};

interface SessionRow {
  id: string;
  mission_id: string;
  state: string;
  validity: string;
  purpose?: string;
  sequence_json?: string | null;
  started_at: string | null;
  ended_at: string | null;
  last_activity_at: string | null;
  metrics_json: string | null;
  summary_json?: string | null;
  adaptive_json?: string | null;
  quality_json?: string | null;
  stage_id?: string | null;
}

interface AttemptRow {
  id: string;
  session_id: string;
  item_id: string;
  phase: string;
  response_json: string;
  correct: number | null;
  rt_ms: number | null;
  rt_valid: number;
  idem_key: string;
  presented_at_ms?: number | null;
  frame_drops?: number | null;
  max_frame_delta_ms?: number | null;
  touch_count?: number | null;
  premature_count?: number | null;
  multiple_count?: number | null;
  out_of_surface_count?: number | null;
  window_ms?: number | null;
  created_at: string;
}

function isoOf(d: Date): string {
  return d.toISOString();
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function randomSecret(): string {
  const bytes = new Uint8Array(32); // ۲۵۶ بیت — فراتر از حداقل ۱۲۸ بیت §۱۱
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function mergedDose(base: { days_per_week: number; minutes: number; max_missions_per_day: number; min_weeks: number }, override: Partial<typeof base> | null): typeof base {
  const ov = override ?? {};
  return { ...base, ...Object.fromEntries(Object.entries(ov).filter(([, v]) => v !== null && v !== undefined)) } as typeof base;
}

export function createGamesService(deps: GamesDeps): GamesService {
  const { db, audit, logger } = deps;
  const now = deps.now ?? (() => new Date());
  const linkTtlHours = deps.linkTtlHours ?? 12;

  // ─── رجیستری ───

  async function upsertMetric(input: { id: string; titleFa: string; unit: RegistryMetric['unit']; higherIsBetter: boolean; source: RegistryMetric['source']; formula: RegistryMetric['formula'] }, actor: AuthContext): Promise<RegistryMetric> {
    const id = input.id.trim();
    if (!/^[a-z][a-z0-9_]{2,63}$/.test(id)) throw new ValidationError('شناسهٔ سنجه باید الگوی لاتین snake_case داشته باشد');
    if (ENGINE_ONLY_FORMULAS.includes(input.formula)) {
      throw new ValidationError('سنجه‌های درصدی گو/نوگو از موتور می‌آیند و دستی ثبت نمی‌شوند');
    }
    await db.execute(
      `INSERT INTO game_metrics (id, title_fa, unit, higher_is_better, source, formula) VALUES (?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET title_fa=excluded.title_fa, unit=excluded.unit,
         higher_is_better=excluded.higher_is_better, source=excluded.source, formula=excluded.formula`,
      [id, input.titleFa.trim(), input.unit, input.higherIsBetter ? 1 : 0, input.source, input.formula]
    );
    await audit.log({ actorId: actor.staffId, action: 'game_metric_upsert', resourceType: 'game_metric', resourceId: id });
    return (await db.queryOne<RegistryMetric>(`SELECT id, title_fa, unit, higher_is_better != 0 AS higher_is_better, source, formula FROM game_metrics WHERE id = ?`, [id]))!;
  }

  async function listMetrics(): Promise<RegistryMetric[]> {
    const rows = await db.query<RegistryMetric>(
      `SELECT id, title_fa, unit, higher_is_better != 0 AS higher_is_better, source, formula FROM game_metrics ORDER BY id`
    );
    return mergeEngineMetrics(rows); // سنجه‌های درصدی موتورمحور هم در رجیستری دیده می‌شوند
  }

  async function upsertGoal(input: { id: string; titleFa: string; packageId: string; metricId: string; ageMin?: number | null; ageMax?: number | null }, actor: AuthContext): Promise<RegistryGoal> {
    const id = input.id.trim();
    if (!/^[a-z][a-z0-9_]{2,63}$/.test(id)) throw new ValidationError('شناسهٔ هدف باید الگوی لاتین snake_case داشته باشد');
    const metric = await db.queryOne<{ id: string }>(`SELECT id FROM game_metrics WHERE id = ?`, [input.metricId]);
    if (!metric) throw new NotFoundError('سنجه');
    await db.execute(
      `INSERT INTO game_goals (id, title_fa, package_id, metric_id, age_min, age_max) VALUES (?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET title_fa=excluded.title_fa, package_id=excluded.package_id,
         metric_id=excluded.metric_id, age_min=excluded.age_min, age_max=excluded.age_max`,
      [id, input.titleFa.trim(), input.packageId.trim(), input.metricId, input.ageMin ?? null, input.ageMax ?? null]
    );
    await audit.log({ actorId: actor.staffId, action: 'game_goal_upsert', resourceType: 'game_goal', resourceId: id });
    return (await db.queryOne<RegistryGoal>(`SELECT id, title_fa, package_id, metric_id, age_min, age_max FROM game_goals WHERE id = ?`, [id]))!;
  }

  async function listGoals(): Promise<RegistryGoal[]> {
    return db.query<RegistryGoal>(`SELECT id, title_fa, package_id, metric_id, age_min, age_max FROM game_goals ORDER BY id`);
  }

  // ─── بستهٔ محتوا ───

  async function packageRowToRecord(row: { id: string; version: string; title_fa: string; evidence_level: string; dose_json: string; status: string; body_json: string; reviewed_by: string | null; reviewed_at: string | null; created_at: string }): Promise<PackageRecord> {
    return {
      id: row.id,
      version: row.version,
      titleFa: row.title_fa,
      evidenceLevel: row.evidence_level as PackageRecord['evidenceLevel'],
      dose: parseJson(row.dose_json, { days_per_week: 0, minutes: 0, max_missions_per_day: 0, min_weeks: 0 }),
      status: row.status as PackageRecord['status'],
      body: parseJson<PackageBody>(row.body_json, { package_id: row.id, goals: [], missions: [] }),
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at,
      createdAt: row.created_at
    };
  }

  async function upsertPackage(input: PackageUpsertInput, actor: AuthContext): Promise<PackageRecord> {
    if (!/^\d+\.\d+\.\d+$/.test(input.version)) throw new ValidationError('نسخه باید شکل semver داشته باشد (مثل 1.0.0)');
    if (input.body.package_id !== input.packageId) throw new ValidationError('package_id بدنه با شناسهٔ بسته یکی نیست');
    if (!Array.isArray(input.body.missions) || input.body.missions.length === 0) throw new ValidationError('بسته حداقل یک مأموریت لازم دارد');
    const existing = await db.queryOne<{ status: string }>(
      `SELECT status FROM game_packages WHERE id = ? AND version = ?`,
      [input.packageId, input.version]
    );
    if (existing && existing.status !== 'draft') {
      throw new ConflictError('نسخهٔ منتشرشده تغییرناپذیر است؛ نسخهٔ جدید بسازید');
    }
    await db.execute(
      `INSERT INTO game_packages (id, version, title_fa, evidence_level, dose_json, status, body_json, updated_at)
       VALUES (?,?,?,?,?,'draft',?, datetime('now'))
       ON CONFLICT(id, version) DO UPDATE SET title_fa=excluded.title_fa, evidence_level=excluded.evidence_level,
         dose_json=excluded.dose_json, body_json=excluded.body_json, updated_at=datetime('now')`,
      [input.packageId, input.version, input.titleFa.trim(), input.evidenceLevel, JSON.stringify(input.dose), JSON.stringify(input.body)]
    );
    await audit.log({ actorId: actor.staffId, action: 'game_package_upsert', resourceType: 'game_package', resourceId: `${input.packageId}@${input.version}` });
    return loadPackage(input.packageId, input.version);
  }

  async function loadPackage(id: string, version: string): Promise<PackageRecord> {
    const row = await db.queryOne<Parameters<typeof packageRowToRecord>[0]>(
      `SELECT id, version, title_fa, evidence_level, dose_json, status, body_json, reviewed_by, reviewed_at, created_at
       FROM game_packages WHERE id = ? AND version = ?`,
      [id, version]
    );
    if (!row) throw new NotFoundError('بستهٔ محتوا');
    return packageRowToRecord(row);
  }

  async function listPackages(status?: string): Promise<PackageRecord[]> {
    const rows = status
      ? await db.query<Parameters<typeof packageRowToRecord>[0]>(
          `SELECT id, version, title_fa, evidence_level, dose_json, status, body_json, reviewed_by, reviewed_at, created_at
           FROM game_packages WHERE status = ? ORDER BY id, version DESC`,
          [status]
        )
      : await db.query<Parameters<typeof packageRowToRecord>[0]>(
          `SELECT id, version, title_fa, evidence_level, dose_json, status, body_json, reviewed_by, reviewed_at, created_at
           FROM game_packages ORDER BY id, version DESC`
        );
    return Promise.all(rows.map(packageRowToRecord));
  }

  async function publishPackage(packageId: string, version: string, reviewedByStaffId: string | null, actor: AuthContext): Promise<PackageRecord> {
    const record = await loadPackage(packageId, version);
    if (record.status === 'published') return record;
    if (record.status === 'retired') throw new ConflictError('بستهٔ بازنشسته منتشر نمی‌شود');
    const [metrics, goals] = await Promise.all([listMetrics(), listGoals()]);
    const errors = runPublishGates(
      record.body,
      record.dose,
      record.evidenceLevel,
      { metricIds: new Set(metrics.map((m) => m.id)), goalIds: new Set(goals.map((g) => g.id)) }
    );
    if (errors.length > 0) {
      throw new ValidationError(`گیت انتشار رد شد: ${errors.map((e) => e.message).join(' · ')}`);
    }
    const reviewer = reviewedByStaffId ?? actor.staffId;
    const reviewerRow = await db.queryOne<{ id: string }>(`SELECT id FROM staff WHERE id = ? AND active = 1`, [reviewer]);
    if (!reviewerRow) throw new NotFoundError('بازبین بالینی');
    await db.execute(
      `UPDATE game_packages SET status = 'published', reviewed_by = ?, reviewed_at = ?, updated_at = datetime('now')
       WHERE id = ? AND version = ?`,
      [reviewer, isoOf(now()), packageId, version]
    );
    await audit.log({
      actorId: actor.staffId,
      action: 'game_package_publish',
      resourceType: 'game_package',
      resourceId: `${packageId}@${version}`,
      changes: { status: { from: record.status, to: 'published' }, reviewed_by: { from: null, to: reviewer } }
    });
    logger.info('games.package.published', { packageId, version, reviewer });
    return loadPackage(packageId, version);
  }

  /** بازنشسته‌کردن نسخهٔ بسته (۱.۲۵.۲۴) — تجویز تازه می‌بندد (create فقط منتشرشده می‌پذیرد)؛
   *  تجویز/مأموریت موجود نسخه‌قفل می‌ماند (§۱۳) — رفتار نسخه‌پین‌شده عمداً دست‌نخورده */
  async function retirePackage(packageId: string, version: string, actor: AuthContext): Promise<PackageRecord> {
    const record = await loadPackage(packageId, version);
    if (record.status === 'retired') return record;
    await db.execute(
      `UPDATE game_packages SET status = 'retired', updated_at = datetime('now') WHERE id = ? AND version = ?`,
      [packageId, version]
    );
    await audit.log({
      actorId: actor.staffId,
      action: 'game_package_retire',
      resourceType: 'game_package',
      resourceId: `${packageId}@${version}`,
      changes: { status: { from: record.status, to: 'retired' } }
    });
    logger.info('games.package.retired', { packageId, version });
    return loadPackage(packageId, version);
  }

  // ─── تجویز ───

  async function createPrescription(input: PrescriptionCreateInput, actor: AuthContext): Promise<PrescriptionRecord> {
    const child = await db.queryOne<{ id: string }>(`SELECT id FROM students WHERE id = ? AND active = 1`, [input.childId]);
    if (!child) throw new NotFoundError('کودک');
    let pkg: PackageRecord;
    try {
      pkg = await loadPackage(input.packageId, input.packageVersion);
    } catch {
      throw new ValidationError('بسته یا نسخهٔ آن یافت نشد');
    }
    if (pkg.status !== 'published') throw new ValidationError('ارسال به دانش‌آموز فقط از بستهٔ منتشرشده ممکن است');
    const goal = await db.queryOne<{ id: string; package_id: string }>(`SELECT id, package_id FROM game_goals WHERE id = ?`, [input.goalId]);
    if (!goal) throw new NotFoundError('هدف');
    if (goal.package_id !== input.packageId) throw new ValidationError('هدف به این بسته تعلق ندارد');
    if (input.pathwayId) {
      const path = await db.queryOne<{ id: string; student_id: string; status: string }>(
        `SELECT id, student_id, status FROM intervention_paths WHERE id = ? AND deleted_at IS NULL`,
        [input.pathwayId]
      );
      if (!path) throw new NotFoundError('مسیر مداخله');
      if (path.student_id !== input.childId) throw new ValidationError('مسیر مداخله به این کودک تعلق ندارد');
      if (path.status === 'closed') throw new ConflictError('مسیر بسته‌شده تجویز بازی نمی‌پذیرد');
    }
    if (input.doseOverride) {
      const keys = Object.keys(input.doseOverride);
      const allowed = ['days_per_week', 'minutes', 'max_missions_per_day', 'min_weeks'];
      if (keys.some((k) => !allowed.includes(k))) throw new ValidationError('کلید دوز ناشناخته است');
      if (keys.some((k) => typeof (input.doseOverride as Record<string, unknown>)[k] !== 'number')) {
        throw new ValidationError('مقادیر دوز باید عدد باشند');
      }
    }
    const id = crypto.randomUUID();
    const suggestedBy = input.suggestedBy ?? 'therapist';
    await db.execute(
      `INSERT INTO game_prescriptions (id, child_id, package_id, package_version, goal_id, pathway_id, dose_override,
        suggested_by, created_by, approved_by, approved_at, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,'active')`,
      [id, input.childId, input.packageId, input.packageVersion, input.goalId, input.pathwayId ?? null,
        input.doseOverride ? JSON.stringify(input.doseOverride) : null, suggestedBy, actor.staffId, actor.staffId, isoOf(now())]
    );
    await audit.log({ actorId: actor.staffId, action: 'game_prescription_create', resourceType: 'game_prescription', resourceId: id });
    return (await loadPrescription(id))!;
  }

  async function loadPrescription(id: string): Promise<PrescriptionRecord | null> {
    const row = await db.queryOne<PrescriptionRow>(`SELECT * FROM game_prescriptions WHERE id = ?`, [id]);
    if (!row) return null;
    return prescriptionRowToRecord(row);
  }

  function prescriptionRowToRecord(row: PrescriptionRow): PrescriptionRecord {
    return {
      id: row.id,
      childId: row.child_id,
      packageId: row.package_id,
      packageVersion: row.package_version,
      goalId: row.goal_id,
      pathwayId: row.pathway_id,
      doseOverride: parseJson(row.dose_override, null as PrescriptionRecord['doseOverride']),
      suggestedBy: row.suggested_by as PrescriptionRecord['suggestedBy'],
      approvedBy: row.approved_by,
      status: row.status,
      createdAt: row.created_at
    };
  }

  /** سوییپ مأموریت رهاشده (۱.۲۵.۲۵ G3؛ فراخوانی cron از G1/۱.۲۵.۳۵) — جلسهٔ child_active
   *  بی‌فعالیت >۶ ساعت مأموریتش را به pending برمی‌گرداند تا شمارندهٔ «در جریان» صادق بماند.
   *  بی‌خطر و idempotent؛ خود جلسه دست نمی‌خورد — با لینک تازه همان جلسه ادامه می‌یابد
   *  و پاسخ‌های ثبت‌شدهٔ کودک حفظ می‌شود. خروجی: شمار ردیف‌های بازگردانده‌شده برای cron. */
  async function expireStaleMissions(): Promise<number> {
    try {
      const cutoff = isoOf(new Date(now().getTime() - STALE_SESSION_MS));
      const res = await db.execute(
        `UPDATE game_missions SET status = 'pending' WHERE status = 'in_progress' AND id IN
          (SELECT m.id FROM game_missions m JOIN game_sessions s ON s.mission_id = m.id
           WHERE s.state = 'child_active' AND s.last_activity_at < ?)`,
        [cutoff]
      );
      const changed = typeof res?.meta?.changes === 'number' ? res.meta.changes : 0;
      if (changed > 0) logger.info('games.sweep.stale_missions', { restored: changed });
      return changed;
    } catch (err) {
      // سوییپ هرگز مسیر فهرست/تجویز را نمی‌شکند
      logger.warn('games.sweep.failed', { error: err instanceof Error ? err.message : String(err) });
      return 0;
    }
  }

  /** نگهداشت دوره‌ای بازی‌ها (G1 / P2-3 — از cron شبانه؛ هرگز مسیر درخواست نیست):
   *  مأموریت رهاشده + لینک منقضی + توکن پیش‌نمایش منقضی — تا امروز فقط lazy پاک می‌شدند.
   *  همهٔ گام‌ها idempotent و بی‌خطر؛ خطای هر بخش بقیه را نمی‌شکند. */
  async function maintenance(): Promise<{ swept_missions: number; removed_links: number; removed_preview_tokens: number }> {
    const sweptMissions = await expireStaleMissions();
    let removedLinks = 0;
    let removedPreviews = 0;
    const cutoff = isoOf(now());
    try {
      const links = await db.execute(`DELETE FROM game_links WHERE expires_at < ?`, [cutoff]);
      removedLinks = typeof links?.meta?.changes === 'number' ? links.meta.changes : 0;
    } catch (err) {
      logger.warn('games.maintenance.links.failed', { error: err instanceof Error ? err.message : String(err) });
    }
    try {
      const previews = await db.execute(`DELETE FROM game_preview_tokens WHERE expires_at < ?`, [cutoff]);
      removedPreviews = typeof previews?.meta?.changes === 'number' ? previews.meta.changes : 0;
    } catch (err) {
      logger.warn('games.maintenance.previews.failed', { error: err instanceof Error ? err.message : String(err) });
    }
    if (removedLinks > 0 || removedPreviews > 0) {
      logger.info('games.maintenance.done', { removed_links: removedLinks, removed_preview_tokens: removedPreviews });
    }
    return { swept_missions: sweptMissions, removed_links: removedLinks, removed_preview_tokens: removedPreviews };
  }

  /** فهرست تجویزها برای میز درمانگر (۱.۲۵.۲۴) — هویت انسانی + شمار مأموریت‌ها؛ فهرست محدود (رشد ناپذیر) */
  async function listPrescriptions(query?: string | PrescriptionListQuery): Promise<PrescriptionListRecord[]> {
    await expireStaleMissions();
    const q: PrescriptionListQuery = typeof query === 'string' ? { childId: query } : (query ?? {});
    const limit = Math.min(Math.max(Math.trunc(q.limit ?? 50), 1), 200);
    const offset = Math.max(Math.trunc(q.offset ?? 0), 0);
    const where: string[] = [];
    const params: unknown[] = [];
    if (q.childId) { where.push('p.child_id = ?'); params.push(q.childId); }
    if (q.status) { where.push('p.status = ?'); params.push(q.status); }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await db.query<PrescriptionListRow>(
      `SELECT p.*,
        (s.first_name || ' ' || s.last_name) AS child_name,
        g.title_fa AS goal_title_fa,
        pk.title_fa AS package_title_fa,
        (SELECT COUNT(*) FROM game_missions m WHERE m.prescription_id = p.id) AS mission_total,
        (SELECT COUNT(*) FROM game_missions m WHERE m.prescription_id = p.id AND m.status = 'done') AS mission_done,
        (SELECT COUNT(*) FROM game_missions m WHERE m.prescription_id = p.id AND m.status IN ('pending','in_progress')) AS mission_live
      FROM game_prescriptions p
      LEFT JOIN students s ON s.id = p.child_id
      LEFT JOIN game_goals g ON g.id = p.goal_id
      LEFT JOIN game_packages pk ON pk.id = p.package_id AND pk.version = p.package_version
      ${whereSql}
      ORDER BY p.created_at DESC
      LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    return rows.map((row) => ({
      ...prescriptionRowToRecord(row),
      childName: row.child_name ?? null,
      packageTitleFa: row.package_title_fa ?? null,
      goalTitleFa: row.goal_title_fa ?? null,
      missionTotal: row.mission_total,
      missionDone: row.mission_done,
      missionLive: row.mission_live
    }));
  }

  /** میز پیگیری تبعیت (۱.۲۵.۲۵ G2) — تجویزهای فعال با دلیل پیگیری؛ شدیدترین اول.
   *  دلایل فقط رفتار داده را توصیف می‌کنند: بی‌برنامه‌سازی، رکود ≥۷ روز،
   *  مأموریتِ تاریخ‌گذشتهٔ اجرانشده، مأموریتِ امروزِ بی‌لینک زنده. */
  async function listFollowups(): Promise<FollowupRow[]> {
    await expireStaleMissions();
    const today = tehranTodayYmd(now());
    const rows = await db.query<{
      id: string; child_id: string; child_name: string | null; package_id: string; package_version: string; goal_id: string;
      package_title_fa: string | null;
      goal_title_fa: string | null; status: string; created_at: string;
      mission_total: number; mission_done: number;
      pending_overdue: number; today_unlinked: number;
      last_session_at: string | null;
    }>(
      `SELECT p.id, p.child_id, p.package_id, p.package_version, p.goal_id, p.status, p.created_at,
        (s.first_name || ' ' || s.last_name) AS child_name,
        pk.title_fa AS package_title_fa,
        g.title_fa AS goal_title_fa,
        (SELECT COUNT(*) FROM game_missions m WHERE m.prescription_id = p.id) AS mission_total,
        (SELECT COUNT(*) FROM game_missions m WHERE m.prescription_id = p.id AND m.status = 'done') AS mission_done,
        (SELECT COUNT(*) FROM game_missions m WHERE m.prescription_id = p.id AND m.status = 'pending' AND m.scheduled_for < ?) AS pending_overdue,
        (SELECT COUNT(*) FROM game_missions m WHERE m.prescription_id = p.id AND m.status = 'pending' AND m.scheduled_for = ?
           AND NOT EXISTS (SELECT 1 FROM game_links l WHERE l.mission_id = m.id AND l.revoked_at IS NULL AND l.expires_at > ?)) AS today_unlinked,
        (SELECT MAX(x.started_at) FROM game_sessions x JOIN game_missions m2 ON m2.id = x.mission_id
           WHERE m2.prescription_id = p.id AND x.state IN ('child_done','closed')) AS last_session_at
      FROM game_prescriptions p
      LEFT JOIN students s ON s.id = p.child_id
      LEFT JOIN game_goals g ON g.id = p.goal_id
      LEFT JOIN game_packages pk ON pk.id = p.package_id AND pk.version = p.package_version
      WHERE p.status = 'active'
      ORDER BY p.created_at ASC
      LIMIT 200`,
      [today, today, isoOf(now())]
    );
    const nowT = now().getTime();
    const out: FollowupRow[] = [];
    for (const r of rows) {
      const reasons: FollowupReason[] = [];
      const anchor = r.last_session_at ?? r.created_at;
      const idleDays = anchor
        ? Math.max(0, Math.floor((nowT - new Date(anchor).getTime()) / (24 * 3600 * 1000)))
        : null;
      if (r.mission_total === 0) reasons.push('never_scheduled');
      if (r.mission_total > 0 && r.mission_done < r.mission_total && idleDays !== null && idleDays >= STALL_DAYS) reasons.push('stalled');
      if (r.pending_overdue > 0) reasons.push('pending_overdue');
      if (r.today_unlinked > 0) reasons.push('today_unlinked');
      if (reasons.length === 0) continue; // میز پیگیری فقط ردیف‌های نیازمند توجه
      out.push({
        prescriptionId: r.id,
        childId: r.child_id,
        childName: r.child_name,
        packageId: r.package_id,
        packageVersion: r.package_version,
        packageTitleFa: r.package_title_fa,
        goalId: r.goal_id,
        goalTitleFa: r.goal_title_fa,
        status: r.status,
        missionTotal: r.mission_total,
        missionDone: r.mission_done,
        pendingOverdue: r.pending_overdue,
        todayUnlinked: r.today_unlinked,
        idleDays,
        reasons
      });
    }
    // شدیدترین اول: رکود بیشتر، بعد بی‌برنامه‌سازی، بعد امروزِ بی‌لینک
    out.sort((a, b) =>
      (b.idleDays ?? -1) - (a.idleDays ?? -1) ||
      b.pendingOverdue - a.pendingOverdue ||
      b.todayUnlinked - a.todayUnlinked
    );
    return out;
  }

  async function setPrescriptionStatus(id: string, action: 'pause' | 'resume' | 'stop' | 'complete', actor: AuthContext): Promise<PrescriptionRecord> {
    const row = await db.queryOne<PrescriptionRow>(`SELECT * FROM game_prescriptions WHERE id = ?`, [id]);
    if (!row) throw new NotFoundError('ارسال');
    const to = { pause: 'paused', resume: 'active', stop: 'stopped', complete: 'completed' }[action];
    await db.execute(`UPDATE game_prescriptions SET status = ?, updated_at = datetime('now') WHERE id = ?`, [to, id]);
    await audit.log({
      actorId: actor.staffId, action: 'game_prescription_status', resourceType: 'game_prescription', resourceId: id,
      changes: { status: { from: row.status, to } }
    });
    return (await loadPrescription(id))!;
  }

  // ─── مأموریت ───

  function missionRowToRecord(row: MissionRow): MissionRecord {
    return { id: row.id, prescriptionId: row.prescription_id, scheduledFor: row.scheduled_for, missionRef: row.mission_ref, status: row.status };
  }

  /** شمارش مأموریت‌های همان کودک در همان روز — سقف دوز فقط سمت سرور (§۸) */
  async function missionsOnDateForChild(childId: string, scheduledFor: string, statuses: string[]): Promise<number> {
    const row = await db.queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM game_missions m JOIN game_prescriptions p ON p.id = m.prescription_id
       WHERE p.child_id = ? AND m.scheduled_for = ? AND m.status IN (${statuses.map(() => '?').join(',')})`,
      [childId, scheduledFor, ...statuses]
    );
    return row?.n ?? 0;
  }

  async function scheduleMission(input: { prescriptionId: string; missionRef: string; scheduledFor: string }, actor: AuthContext): Promise<MissionRecord> {
    const rx = await loadPrescription(input.prescriptionId);
    if (!rx) throw new NotFoundError('ارسال');
    if (rx.status !== 'active') throw new ConflictError('ارسال فعال نیست');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.scheduledFor)) throw new ValidationError('تاریخ مأموریت باید YYYY-MM-DD باشد');
    const pkg = await loadPackage(rx.packageId, rx.packageVersion);
    const mission = pkg.body.missions.find((m) => m.id === input.missionRef);
    if (!mission) throw new ValidationError('مأموریت با این شناسه در بسته نیست');
    const pkgDose = await loadPackageDose(rx.packageId, rx.packageVersion, rx.doseOverride);
    const scheduled = await missionsOnDateForChild(rx.childId, input.scheduledFor, ['pending', 'in_progress', 'done']);
    if (scheduled >= pkgDose.max_missions_per_day) {
      throw new ConflictError('سقف مأموریت‌های این روز پر است');
    }
    const id = crypto.randomUUID();
    await db.execute(
      `INSERT INTO game_missions (id, prescription_id, scheduled_for, mission_ref, status) VALUES (?,?,?,?, 'pending')`,
      [id, input.prescriptionId, input.scheduledFor, input.missionRef]
    );
    await audit.log({ actorId: actor.staffId, action: 'game_mission_schedule', resourceType: 'game_mission', resourceId: id });
    return missionRowToRecord((await db.queryOne<MissionRow>(`SELECT * FROM game_missions WHERE id = ?`, [id]))!);
  }

  async function loadPackageDose(packageId: string, packageVersion: string, override: Partial<{ days_per_week: number; minutes: number; max_missions_per_day: number; min_weeks: number }> | null): Promise<{ days_per_week: number; minutes: number; max_missions_per_day: number; min_weeks: number }> {
    const pkg = await loadPackage(packageId, packageVersion);
    return mergedDose(pkg.dose, override);
  }

  /** فهرست مأموریت‌های تجویز (۱.۲۵.۲۴) — عنوان از بدنهٔ بسته + لینک زندهٔ هر مأموریت برای پیگیری تبعیت */
  async function listMissions(prescriptionId: string): Promise<MissionRecord[]> {
    const rows = await db.query<MissionRow>(`SELECT * FROM game_missions WHERE prescription_id = ? ORDER BY scheduled_for, created_at`, [prescriptionId]);
    let titles = new Map<string, string>();
    const rx = await loadPrescription(prescriptionId);
    if (rx) {
      try {
        const pkg = await loadPackage(rx.packageId, rx.packageVersion);
        titles = new Map(pkg.body.missions.map((m) => [m.id, m.title ?? m.id]));
      } catch { /* بسته/نسخه در دسترس نیست — عنوان‌ها خالی می‌ماند */ }
    }
    const linkByMission = new Map<string, { jti: string; expiresAt: string }>();
    if (rows.length > 0) {
      const liveLinks = await db.query<{ mission_id: string; jti: string; expires_at: string }>(
        `SELECT mission_id, jti, expires_at FROM game_links
         WHERE mission_id IN (${rows.map(() => '?').join(',')}) AND revoked_at IS NULL AND expires_at > ?`,
        [...rows.map((r) => r.id), isoOf(now())]
      );
      for (const l of liveLinks) linkByMission.set(l.mission_id, { jti: l.jti, expiresAt: l.expires_at });
    }
    return rows.map((row) => ({
      ...missionRowToRecord(row),
      title: titles.get(row.mission_ref) ?? null,
      link: linkByMission.get(row.id) ?? null
    }));
  }

  // ─── لینک امضاشده ───

  async function issueLink(missionId: string, actor: AuthContext): Promise<LinkIssueOutcome> {
    const missionRow = await db.queryOne<MissionRow>(`SELECT * FROM game_missions WHERE id = ?`, [missionId]);
    if (!missionRow) throw new NotFoundError('مأموریت');
    const rxRow = await db.queryOne<PrescriptionRow>(`SELECT * FROM game_prescriptions WHERE id = ?`, [missionRow.prescription_id]);
    if (!rxRow) throw new NotFoundError('ارسال');
    if (rxRow.status !== 'active') throw new ConflictError('ارسال فعال نیست');
    const today = tehranTodayYmd(now());
    if (missionRow.scheduled_for < today) {
      await db.execute(`UPDATE game_missions SET status = 'expired' WHERE id = ? AND status = 'pending'`, [missionId]);
      throw new ConflictError('مأموریت منقضی شده است');
    }
    if (missionRow.status === 'done' || missionRow.status === 'expired') {
      throw new ConflictError('این مأموریت قابل صدور لینک نیست');
    }
    // سقف دوز: مأموریت‌های اجراشدهٔ امروز همان کودک
    const dose = await loadPackageDose(rxRow.package_id, rxRow.package_version, parseJson(rxRow.dose_override, null as PrescriptionRecord['doseOverride']));
    const executed = await missionsOnDateForChild(rxRow.child_id, missionRow.scheduled_for, ['in_progress', 'done']);
    if (executed >= dose.max_missions_per_day) {
      throw new ConflictError('سقف مأموریت‌های امروز پر است؛ پیام پایان آرام نشان داده می‌شود');
    }
    // لینک‌های قبلی همان مأموریت باطل می‌شوند — هر مأموریت فقط یک لینک زنده دارد
    await db.execute(`UPDATE game_links SET revoked_at = ? WHERE mission_id = ? AND revoked_at IS NULL`, [isoOf(now()), missionId]);
    const jti = crypto.randomUUID();
    const secret = randomSecret();
    const token = `${jti}.${secret}`;
    const issuedAt = now();
    const endOfDay = tehranDayRange(missionRow.scheduled_for).end; // پایان همان روز (تهران)
    const ttlEnd = new Date(issuedAt.getTime() + linkTtlHours * 3600 * 1000);
    const expiresAt = new Date(Math.min(new Date(endOfDay).getTime(), ttlEnd.getTime()));
    await db.execute(
      `INSERT INTO game_links (jti, mission_id, token_hash, issued_by, expires_at) VALUES (?,?,?,?,?)`,
      [jti, missionId, await sha256Hex(token), actor.staffId, isoOf(expiresAt)]
    );
    await audit.log({ actorId: actor.staffId, action: 'game_link_issue', resourceType: 'game_link', resourceId: jti });
    const base = deps.publicBaseUrl?.replace(/\/+$/, '') ?? '';
    return { jti, token, url: `${base}${LINK_URL_PATH}${token}`, expiresAt: isoOf(expiresAt) };
  }

  async function revokeLink(jti: string, actor: AuthContext): Promise<{ ok: true }> {
    const row = await db.queryOne<LinkRow>(`SELECT * FROM game_links WHERE jti = ?`, [jti]);
    if (!row) throw new NotFoundError('لینک');
    await db.execute(`UPDATE game_links SET revoked_at = ? WHERE jti = ? AND revoked_at IS NULL`, [isoOf(now()), jti]);
    await audit.log({ actorId: actor.staffId, action: 'game_link_revoke', resourceType: 'game_link', resourceId: jti });
    return { ok: true };
  }

  // ─── پیش‌نمایش فقط-پرسنلی (۱.۲۵.۲۰) — ممیزی فاز ۰ §۳.۱۰/U4: توکن کوتاه‌عمر، رندر بی‌کلید، صفر نوشتن ───

  interface PreviewTokenRow {
    jti: string;
    package_id: string;
    package_version: string;
    token_hash: string;
    issued_by: string;
    expires_at: string;
    revoked_at: string | null;
  }

  async function issuePreview(packageId: string, version: string, actor: AuthContext): Promise<PreviewIssueOutcome> {
    const row = await db.queryOne<{ id: string; version: string; status: string }>(
      `SELECT id, version, status FROM game_packages WHERE id = ? AND version = ?`, [packageId, version]
    );
    if (!row) throw new NotFoundError('بسته');
    if (row.status !== 'published') throw new ConflictError('پیش‌نمایش فقط برای بستهٔ منتشرشده است');
    const jti = crypto.randomUUID();
    const token = `${jti}.${randomSecret()}`;
    const expiresAt = new Date(now().getTime() + PREVIEW_TTL_MINUTES * 60 * 1000);
    await db.execute(
      `INSERT INTO game_preview_tokens (jti, package_id, package_version, token_hash, issued_by, expires_at, created_at) VALUES (?,?,?,?,?,?,?)`,
      [jti, packageId, version, await sha256Hex(token), actor.staffId, isoOf(expiresAt), isoOf(now())]
    );
    await audit.log({ actorId: actor.staffId, action: 'game_preview_issue', resourceType: 'game_preview', resourceId: jti });
    const base = deps.publicBaseUrl?.replace(/\/+$/, '') ?? '';
    return { jti, token, url: `${base}${PREVIEW_URL_PATH}${token}`, expiresAt: isoOf(expiresAt) };
  }

  /** حل توکن پیش‌نمایش → بستهٔ منتشرشده؛ منقضی/باطل/ناشناس = null (هیچ پیام بالینی نمی‌دهد) */
  async function resolvePreview(token: string): Promise<PackageRecord | null> {
    const dot = token.indexOf('.');
    if (dot <= 0) return null;
    const row = await db.queryOne<PreviewTokenRow>(`SELECT * FROM game_preview_tokens WHERE jti = ?`, [token.slice(0, dot)]);
    if (!row) return null;
    if ((await sha256Hex(token)) !== row.token_hash) return null;
    if (row.revoked_at) return null;
    if (new Date(row.expires_at).getTime() <= now().getTime()) return null;
    const pkgRow = await db.queryOne<{ id: string; version: string; title_fa: string; evidence_level: string; dose_json: string; status: string; body_json: string; reviewed_by: string | null; reviewed_at: string | null; created_at: string }>(
      `SELECT * FROM game_packages WHERE id = ? AND version = ?`, [row.package_id, row.package_version]
    );
    if (!pkgRow || pkgRow.status !== 'published') return null;
    return packageRowToRecord(pkgRow);
  }

  /** مدل رندر صفحهٔ پیش‌نمایش — مأموریت نخستِ آیتم‌لمسی + اسنپ‌شات پروتکل باند پیش‌فرض (بی‌سن) */
  async function previewState(token: string): Promise<PreviewStateView | null> {
    const pkg = await resolvePreview(token);
    if (!pkg) return null;
    const mission = previewMissionOf(pkg.body);
    if (!mission) return null;
    const mode: ProtocolMode = pkg.body.mode ?? 'training';
    // پیش‌نمایش بی‌تاریخچه = دید کودکِ تازه — مرحلهٔ ۱ با امضای دیداری‌اش (۱.۲۵.۲۳)
    const previewStageId = mode === 'training' && pkg.body.stages_enabled !== false ? 's1' : null;
    return {
      packageTitle: pkg.titleFa,
      missionTitle: mission.title ?? mission.id,
      game: mission.game,
      hint: playHintOf(mission, previewStageId) ?? null,
      protocol: protocolSnapshotOf(protocolForAge(mode, null)),
      mode
    };
  }

  /** آیتم موقعیت n — بی‌حالت و بی‌نوشت؛ دنبالهٔ قطعی از seed ثابت بسته (همان منطق start) */
  async function previewItem(token: string, position: number): Promise<{ item: ItemView | null; progress: { done: number; total: number } }> {
    const pkg = await resolvePreview(token);
    if (!pkg) throw new NotFoundError('پیش‌نمایش');
    const mission = previewMissionOf(pkg.body);
    if (!mission) throw new NotFoundError('مأموریت در بسته');
    const mode: ProtocolMode = pkg.body.mode ?? 'training';
    const touchItems = (mission.items ?? []).filter((it) => it.type === 'touch_report');
    const hasProtocol = mode === 'assessment' || pkg.body.protocol != null;
    let seq: ReturnType<typeof parseSequenceRecord> = null;
    if (hasProtocol && touchItems.length >= 4) {
      const prot = protocolForAge(mode, null); // پیش‌نمایش بی‌سن — باند پیش‌فرض پروتکل
      const poolRatio = touchItems.length > 0
        ? touchItems.filter((it) => it.correct_touch === true).length / touchItems.length
        : null;
      seq = parseSequenceRecord(serializeSequence(generateSequence({
        seed: `preview:${pkg.id}@${pkg.version}`, // ثابت نسخهٔ بسته — هر پیش‌نمایشِ همان نسخه، همان ترتیب
        count: touchItems.length,
        goRatio: poolRatio ?? prot.params.go_ratio.value,
        maxConsecutiveSame: prot.params.max_consecutive_same.value,
        blockSize: prot.params.block_size.value
      })));
    }
    const at = previewItemAt(mission, seq, position);
    // امضای دیداری مرحلهٔ ۱ در پیش‌نمایش (۱.۲۵.۲۳) — فقط نمایش؛ هیچ کلیدی در DOM نیست
    let view = at.item ? toItemView(at.item) : null;
    if (view && view.type === 'touch_report' && mode === 'training' && pkg.body.stages_enabled !== false) {
      const authored = (mission.items ?? []).find((it) => it.id === view!.id);
      view = { ...view, stim: stageStimViewOf(authored?.stim, authored?.correct_touch === true, 's1') };
    }
    return { item: view, progress: at.progress };
  }

  /** بازخورد آزمایشی — نمره‌دهی فقط سمت سرور از آیتم ذخیره‌شده؛ هیچ رکوردی نوشته نمی‌شود */
  async function previewFeedback(token: string, itemId: string, response: unknown, rtMs: number | null): Promise<AttemptFeedback> {
    const pkg = await resolvePreview(token);
    if (!pkg) throw new NotFoundError('پیش‌نمایش');
    const mission = previewMissionOf(pkg.body);
    if (!mission) throw new NotFoundError('مأموریت در بسته');
    const item = (mission.items ?? []).find((it) => it.id === itemId);
    if (!item) throw new ValidationError('آیتم به این بسته تعلق ندارد');
    const rt = typeof rtMs === 'number' && Number.isFinite(rtMs)
      ? (rtMs < 0 ? null : rtMs > MAX_RT_MS ? null : Math.round(rtMs))
      : null;
    const scored = scoreAttempt(item, mission, response, rt);
    return feedbackOf(item, scored.correct, response);
  }

  /** حل توکن خام → پیوند کامل؛ هرگز پیام خطای بالینی نمی‌دهد */
  interface ResolvedLink {
    link: LinkRow;
    mission: MissionRow;
    rx: PrescriptionRow;
    pkg: PackageRecord;
    session: SessionRow | null;
  }

  async function resolveLink(token: string): Promise<ResolvedLink | null> {
    const dot = token.indexOf('.');
    if (dot <= 0) return null;
    const jti = token.slice(0, dot);
    const link = await db.queryOne<LinkRow>(`SELECT * FROM game_links WHERE jti = ?`, [jti]);
    if (!link) return null;
    const hash = await sha256Hex(token);
    if (hash !== link.token_hash) return null;
    const mission = await db.queryOne<MissionRow>(`SELECT * FROM game_missions WHERE id = ?`, [link.mission_id]);
    if (!mission) return null;
    const rx = await db.queryOne<PrescriptionRow>(`SELECT * FROM game_prescriptions WHERE id = ?`, [mission.prescription_id]);
    if (!rx) return null;
    const pkg = await loadPackage(rx.package_id, rx.package_version);
    const session = await db.queryOne<SessionRow>(
      `SELECT * FROM game_sessions WHERE mission_id = ? ORDER BY created_at DESC LIMIT 1`,
      [mission.id]
    );
    return { link, mission, rx, pkg, session };
  }

  function linkStateOf(res: ResolvedLink): PublicStateView['state'] {
    if (res.link.revoked_at) return 'revoked';
    if (new Date(res.link.expires_at).getTime() < now().getTime()) return 'expired';
    if (!res.session) return 'parent_pre';
    return res.session.state as PublicStateView['state'];
  }

  function missionConfigOf(res: ResolvedLink): MissionConfig {
    const m = res.pkg.body.missions.find((x) => x.id === res.mission.mission_ref);
    if (!m) throw new NotFoundError('مأموریت در بسته');
    return m;
  }

  /**
   * راهنمای شروع بازی کودک (M2) — فقط از آیتم‌های آموزشی touch_report ساخته می‌شود؛
   * آیتم‌های پروب هرگز به این راهنما راه ندارند تا شناسهٔ هدف از پیش لو نرود.
   */
  function playHintOf(mission: MissionConfig, stageId: string | null = null): PublicStateView['playHint'] {
    const train = (mission.items ?? []).filter((it) => it.phase === 'train' && it.type === 'touch_report');
    const go = train.find((it) => it.correct_touch === true);
    const nogo = train.find((it) => it.correct_touch === false);
    // حملهٔ جاسوس‌ها (۱.۲۵.۳۰) — مأموریت اسکن: قاعدهٔ موج از نخستین آیتم آموزشی؛
    // امضای هدف عمومی است (کودک باید قاعده را ببیند)؛ «کدام خانه» هرگز این‌جا نیست
    const scanTrain = (mission.items ?? []).find((it) => it.phase === 'train' && it.type === 'scan');
    if (scanTrain && !go && !nogo) {
      const stim = (scanTrain.stim ?? {}) as Record<string, unknown>;
      const sig = typeof stim.signature === 'number' && Number.isInteger(stim.signature) && stim.signature > 0 ? stim.signature : 2;
      const label = typeof scanTrain.prompt === 'string' && scanTrain.prompt.trim() !== ''
        ? scanTrain.prompt
        : 'جاسوس‌ها ربات‌هایی با ' + sig + ' آنتن‌اند';
      return {
        go: { label: 'جاسوس — ربات ' + sig + ' آنتن', stim: stripAnswerKeys({ signature: sig }) },
        nogo: null,
        scan: { label, stim: stripAnswerKeys({ signature: sig }) }
      };
    }
    // سه بازی تازه + ن‌پشت (۱.۲۵.۳۲/۱.۲۵.۴۰) — قاعدهٔ بازی از پرامپت آیتم آموزشی؛ هیچ کلیدی این‌جا نیست؛
    // محرک آموزش، عین همان چیزی است که کودک در اجرا می‌بیند
    const newTrain = (mission.items ?? []).find((it) =>
      it.phase === 'train' && (it.type === 'stroop' || it.type === 'flanker' || it.type === 'trail' || it.type === 'nback'));
    if (newTrain && !go && !nogo) {
      const kindKey = newTrain.type as 'stroop' | 'flanker' | 'trail' | 'nback';
      // سد نشتی data-hint — stim راهنما از stripAnswerKeys می‌گذرد (کلید همسانی match
      // ن‌پشت و هر کلید پاسخی در هر عمق این‌جا می‌ماند؛ برای بانک‌های فعلی بی‌اثر)
      const stim = stripAnswerKeys((newTrain.stim ?? {}) as Record<string, unknown>);
      const label = typeof newTrain.prompt === 'string' && newTrain.prompt.trim() !== '' ? newTrain.prompt : '';
      return {
        go: { label, stim },
        nogo: null,
        [kindKey]: { label, stim }
      };
    }
    if (!go && !nogo) return null;
    // درون‌مایهٔ دیداری مرحله (۱.۲۵.۲۳) — قدم آموزش دقیقاً همان چیزی را نشان می‌دهد
    // که کودک در اجرای اصلی می‌بیند؛ کلید پاسخ در برچسب نیست (فقط توصیف ظاهری)
    const goStim = stripAnswerKeys(stageStimViewOf(go?.stim, true, stageId));
    const nogoStim = nogo ? stripAnswerKeys(stageStimViewOf(nogo.stim, false, stageId)) : null;
    return {
      go: { label: stimLabelOf(goStim), stim: goStim },
      nogo: nogoStim ? { label: stimLabelOf(nogoStim), stim: nogoStim } : null
    };
  }

  /** سن کودک از تاریخ تولد — برای انتخاب باند سنی پروتکل (فاز ۱ بازطراحی)؛ بی‌تاریخ تولد = null */
  async function childAgeOf(childId: string): Promise<number | null> {
    try {
      const row = await db.queryOne<{ birth_date: string | null }>(
        `SELECT birth_date FROM students WHERE id = ?`,
        [childId]
      );
      if (!row?.birth_date) return null;
      const bd = new Date(row.birth_date);
      if (Number.isNaN(bd.getTime())) return null;
      const age = Math.floor((now().getTime() - bd.getTime()) / (365.2425 * 24 * 3600 * 1000));
      return age >= 0 && age <= 25 ? age : null;
    } catch {
      return null;
    }
  }

  async function stateViewOf(res: ResolvedLink): Promise<PublicStateView> {
    const m = missionConfigOf(res);
    const kind = gameKindOf(m.game);
    const adherence = await db.queryOne<{ confirm2_at: string | null }>(`SELECT confirm2_at FROM game_adherence WHERE mission_id = ?`, [res.mission.id]);
    const state = linkStateOf(res);
    const mode: ProtocolMode = res.pkg.body.mode ?? 'training';
    const childAge = state === 'child_active' ? await childAgeOf(res.rx.child_id) : null;
    let snap = protocolSnapshotOf(protocolForAge(mode, childAge));
    // ن‌پشت (۱.۲۵.۴۰) — snapshot با پارامترهای پروتکل نوع-محور بازنویسی می‌شود؛
    // برای شش نوع دیگر بی‌اثر است و بازنویسی مرحله (ISI/تثبیت) روی همین می‌نشیند
    if (kind === 'nback') snap = applyNbackProtocol(snap, bandForAge(childAge).band);
    // نظام مرحله‌ها و ستاره‌ها (۱.۲۵.۲۲) — فقط تمرین؛ پنجره/ISI/تثبیت بر پایهٔ مرحلهٔ فعال بازنویسی می‌شود؛
    // ارزیابی هرگز مرحله نمی‌بیند (C1) و کلید خاموشی درمانگر همیشه محترم است
    let stage: StageDef | null = null;
    let progress: StageProgress | null = null;
    if (state === 'child_active' && mode === 'training') {
      const sctx = await stageContextOf(res.rx.id, childAge, res.pkg.body, kind);
      if (sctx) {
        stage = sctx.stage;
        progress = sctx.progress;
        snap = { ...snap, params: applyStageOverrides(snap.params, stage) };
      }
    }
    // سازگاری فقط-تمرین (فاز ۶): آخرین تصمیم معتبر تجویز پنجرهٔ این جلسه را تنظیم می‌کند؛
    // بر پایهٔ مرحله (۱.۲۵.۲۲): گام آخر سازگاری به‌صورت افست روی پنجرهٔ مرحله می‌نشیند —
    // ارزیابی هرگز، و کلید خاموشی بسته/درمانگر همیشه محترم است
    if (state === 'child_active' && mode === 'training' && res.pkg.body.protocol != null && res.pkg.body.adaptive_enabled !== false) {
      const { decision } = await latestAdaptiveDecisionOf(res.rx.id);
      if (decision?.change && decision.change.param === 'response_window_go_ms') {
        const offset = decision.change.to - decision.change.from;
        const w = Math.min(WINDOW_MAX_MS, Math.max(WINDOW_MIN_MS, Math.round(snap.params.response_window_go_ms + offset)));
        snap = { ...snap, params: { ...snap.params, response_window_go_ms: w } };
      }
    }
    // کارت پایان (۱.۲۵.۲۲): نتیجهٔ مرحلهٔ جلسهٔ آخر — فقط تمرین با ستارهٔ ثبت‌شده در summary
    let stageResult: PublicStateView['playStageResult'] = undefined;
    if (state === 'child_done' && mode === 'training' && res.session?.stage_id && res.pkg.body.stages_enabled !== false) {
      const sum = parseJson<{ stage?: { id?: string; index?: number; title_fa?: string; passed?: boolean; stars?: number } } | null>(res.session.summary_json, null);
      const st = sum?.stage;
      if (st && typeof st.stars === 'number' && typeof st.index === 'number') {
        const prog = stageProgressOfKind(kind, await stageHistoryOf(res.rx.id));
        const next = stageByIndex('7-12', st.index + 1, kind);
        stageResult = {
          id: st.id ?? res.session.stage_id,
          index: st.index,
          title_fa: st.title_fa ?? 'مرحله',
          stars: st.stars,
          passed: st.passed === true,
          next_title_fa: next ? next.title_fa : null,
          stars_total: prog.stars_total
        };
      }
    }
    // ادامهٔ نرم جلسهٔ نیمه‌تمام (U7/G3): فرادادهٔ «چند قدم مانده» برای کارت خوش‌برگشتی —
    // فقط وقتی این جلسه حداقل یک پاسخ ثبت‌شده دارد؛ کل = آزمون‌های جریانِ مرحلهٔ منجمد
    // (همان فیلتر nextItem)؛ کلاینت فقط پیام کودک‌زبان می‌سازد — هیچ کلید/محرکی نیست.
    let resumeMeta: PublicStateView['playResume'] = null;
    if (state === 'child_active' && res.session) {
      try {
        const doneRow = await db.queryOne<{ n: number }>(
          `SELECT COUNT(*) AS n FROM game_attempts WHERE session_id = ?`, [res.session.id]);
        const doneN = doneRow?.n ?? 0;
        if (doneN > 0) {
          // فیلتر جریان مرحله از رجیستری نوع-محور (G4الف) — جای زنجیرهٔ if per-kind
          const inStg = (it: MissionItem): boolean => itemInStageFor(kind, it, res.session!.stage_id);
          resumeMeta = { done: doneN, total: (m.items ?? []).filter(inStg).length };
        }
      } catch { resumeMeta = null; } // فرادادهٔ ادامه هرگز ورود را نمی‌شکند
    }
    // پس‌گفت والد (U8/G3): محتوای واقعی توصیفی — شمار جلسهٔ آغازشدهٔ هفته و پاسخ‌های همین
    // جلسه + جملهٔ فردا از parent_copy.after بستهٔ نسخه‌دار (لینت واژهٔ ممنوع دارد).
    // توصیف رفتار است، نه حکم بالینی — هیچ هنجار/درصدی/آستانه‌ای روبه‌والد نمی‌آید.
    let parentPost: PublicStateView['parentPost'] = undefined;
    if (state === 'parent_post') {
      try {
        const weekAgoIso = isoOf(new Date(now().getTime() - 7 * 24 * 60 * 60 * 1000));
        const weekRow = await db.queryOne<{ n: number }>(
          `SELECT COUNT(*) AS n FROM game_sessions s JOIN game_missions mm ON mm.id = s.mission_id
           WHERE mm.prescription_id = ? AND s.started_at >= ?`, [res.rx.id, weekAgoIso]);
        const todayRow = res.session
          ? await db.queryOne<{ n: number }>(
              `SELECT COUNT(*) AS n FROM game_attempts WHERE session_id = ?`, [res.session.id])
          : null;
        const parentCopy = (res.pkg.body.parent_copy ?? {}) as Record<string, unknown>;
        const afterFa = typeof parentCopy.after === 'string' && parentCopy.after.trim() !== ''
          ? parentCopy.after.trim()
          : 'فردا یک مأموریت تازه در راه است؛ هر روز چند دقیقه کافی است.';
        parentPost = {
          sessions_week: weekRow?.n ?? 0,
          attempts_today: todayRow?.n ?? 0,
          tomorrow_fa: afterFa
        };
      } catch { parentPost = undefined; } // پس‌گفت هرگز ورود والد را نمی‌شکند
    }
    return {
      state,
      missionRef: m.id,
      missionTitle: m.title ?? m.id,
      packageTitle: res.pkg.titleFa,
      /* هویت نوع‌بازی برای هر دو شاخهٔ والد و کودک — کارت والدِ pre قهرمان خود بازی را می‌بیند
         (رفع P0 ممیزی فازها: قبلاً فقط child_active پُر می‌شد و همهٔ کارت‌های والد ماهی گونوگو می‌گرفتند) */
      playGame: m.game,
      expiresAt: res.link.expires_at,
      validity: res.session ? (res.session.validity as PublicStateView['validity']) : undefined,
      adherenceConfirmed: adherence?.confirm2_at != null,
      parentCopyBefore: typeof (res.pkg.body.parent_copy as Record<string, unknown> | undefined)?.before === 'string'
        ? ((res.pkg.body.parent_copy as Record<string, unknown>).before as string) : null,
      ...(state === 'child_active' ? {
        playHint: playHintOf(m, res.session?.stage_id ?? stage?.id ?? null),
        playProtocol: snap,
        playResume: resumeMeta,
        ...(stage && progress ? {
          playStage: {
            id: stage.id, index: stage.index, total: STAGE_TOTAL,
            title_fa: stage.title_fa, goal_fa: stage.goal_fa, difficulty: stage.difficulty,
            best_stars: progress.best[stage.id]?.stars ?? 0
          }
        } : {})
      } : {}),
      ...(stageResult ? { playStageResult: stageResult } : {}),
      ...(parentPost ? { parentPost } : {})
    };
  }

  async function requireActiveToken(token: string): Promise<ResolvedLink> {
    const res = await resolveLink(token);
    if (!res) throw new NotFoundError('این پیوند پیدا نشد');
    const state = linkStateOf(res);
    if (state === 'revoked') throw new ConflictError('این پیوند باطل شده است');
    if (state === 'expired') throw new ConflictError('این پیوند منقضی شده است');
    return res;
  }

  function requireSessionIn(res: ResolvedLink, states: string[]): SessionRow {
    if (!res.session) throw new ConflictError('جلسه آغاز نشده است');
    if (!states.includes(res.session.state)) throw new ConflictError('گذار وضعیت مجاز نیست');
    return res.session;
  }

  // ─── زنجیرهٔ عمومی ───

  async function getState(token: string): Promise<PublicStateView> {
    const res = await resolveLink(token);
    if (!res) throw new NotFoundError('این پیوند پیدا نشد');
    return stateViewOf(res);
  }

  /** آخرین تصمیم سازگاری فعال تجویز (فاز ۶) — برای سطح فعلی جلسهٔ جدید */
  async function latestAdaptiveDecisionOf(prescriptionId: string): Promise<{ decision: AdaptiveDecision | null; history: AdaptiveSessionInput[] }> {
    try {
      const rows = await db.query<{ adaptive_json: string | null; summary_json: string | null; validity: string; id: string }>(
        `SELECT s.adaptive_json, s.summary_json, s.validity, s.id
         FROM game_sessions s JOIN game_missions m ON m.id = s.mission_id
         WHERE m.prescription_id = ?
         ORDER BY s.created_at DESC LIMIT 10`,
        [prescriptionId]
      );
      let decision: AdaptiveDecision | null = null;
      const history: AdaptiveSessionInput[] = [];
      for (const r of rows) {
        if (r.adaptive_json) {
          const d = parseJson<AdaptiveDecision>(r.adaptive_json, null as unknown as AdaptiveDecision);
          if (d && typeof d.action === 'string') decision = d;
        }
        const sum = parseJson<{ totals?: Record<string, number>; pct?: Record<string, number | null>; rt?: { median: number | null; cv: number | null }; behavior?: { premature_total?: number } } | null>(r.summary_json, null);
        if (sum && sum.totals && sum.pct) {
          history.push({
            session_id: r.id,
            validity: (r.validity as 'valid' | 'partial' | 'invalid') ?? 'valid',
            correct_go_pct: sum.pct.correct_go ?? null,
            correct_nogo_pct: sum.pct.correct_nogo ?? null,
            commission_pct: sum.pct.commission ?? null,
            omission_pct: sum.pct.omission ?? null,
            median_rt: sum.rt?.median ?? null,
            rt_cv: sum.rt?.cv ?? null,
            premature_total: sum.behavior?.premature_total ?? 0
          });
        }
      }
      return { decision, history };
    } catch {
      return { decision: null, history: [] };
    }
  }

  /** تاریخچهٔ مرحلهٔ تجویز (۱.۲۵.۲۲) — جلسه‌های دارای stage_id با درصدی‌های خلاصه؛ قدیمی→جدید */
  async function stageHistoryOf(prescriptionId: string): Promise<StageHistoryRow[]> {
    try {
      const rows = await db.query<{ stage_id: string | null; validity: string; summary_json: string | null }>(
        `SELECT s.stage_id, s.validity, s.summary_json
         FROM game_sessions s JOIN game_missions m ON m.id = s.mission_id
         WHERE m.prescription_id = ? AND s.stage_id IS NOT NULL
         ORDER BY s.created_at ASC`,
        [prescriptionId]
      );
      return rows.map((r) => {
        const sum = parseJson<{ pct?: { correct_go?: number | null; correct_nogo?: number | null; accuracy?: number | null }; numline?: { mean_error_pct?: number | null } } | null>(r.summary_json, null);
        return {
          stage_id: r.stage_id,
          validity: r.validity,
          correct_go_pct: sum?.pct?.correct_go ?? null,
          correct_nogo_pct: sum?.pct?.correct_nogo ?? null,
          accuracy: sum?.pct?.accuracy ?? null,
          numline_error_pct: sum?.numline?.mean_error_pct ?? null
        };
      });
    } catch {
      return [];
    }
  }

  /** زمینهٔ مرحلهٔ تمرین (۱.۲۵.۲۲) — پیشرفت + مرحلهٔ فعال؛ فقط تمرین با کلید خاموشی روشن؛
   *  ملاک گذار و عنوان مرحله‌ها نوع‌بازی‌آگاه است (۱.۲۵.۲۸) */
  async function stageContextOf(
    prescriptionId: string,
    childAge: number | null,
    body: { stages_enabled?: boolean },
    kind: GameKind = 'gonogo'
  ): Promise<{ progress: StageProgress; stage: StageDef } | null> {
    if (body.stages_enabled === false) return null;
    const band = bandForAge(childAge).band;
    const progress = stageProgressOfKind(kind, await stageHistoryOf(prescriptionId));
    const stage = currentStageOf(progress, band, kind);
    if (!stage) return null;
    return { progress, stage };
  }

  async function start(token: string): Promise<PublicStateView> {
    const res = await requireActiveToken(token);
    if (res.session) {
      if (res.session.state === 'child_active') return stateViewOf(res); // رفرش: ادامهٔ همان جلسه
      if (res.session.state !== 'parent_pre') throw new ConflictError('گذار وضعیت مجاز نیست');
    }
    const rxStatusOk = res.rx.status === 'active';
    if (!rxStatusOk) throw new ConflictError('ارسال فعال نیست');
    if (!res.session) {
      const id = crypto.randomUUID();
      // دو حالت مستقل + دنبالهٔ seed-دار (فاز ۳ بازطراحی):
      // بستهٔ دارای protocol/mode → دنبالهٔ قطعی با seed یگانهٔ جلسه، قابل‌بازتولید برای ممیزی
      const mode: ProtocolMode = res.pkg.body.mode ?? 'training';
      const mission = missionConfigOf(res);
      const touchItems = (mission.items ?? []).filter((it) => it.type === 'touch_report');
      const hasProtocol = mode === 'assessment' || res.pkg.body.protocol != null;
      const poolGo = touchItems.filter((it) => it.correct_touch === true).length;
      const poolRatio = touchItems.length > 0 ? poolGo / touchItems.length : null;
      // مرحلهٔ فعال مسیر پیشرفت (۱.۲۵.۲۲) — فقط تمرین؛ resolve از تاریخچهٔ تجویز و ماندگاری در جلسه؛
      // عنوان/ملاک مرحله‌ها نوع‌بازی‌آگاه (۱.۲۵.۲۸) — پیش از نوشتن جلسه منجمد می‌شود تا
      // رکورد چرخش ن‌پشت هم روی جریانِ همان مرحله بسته شود
      let stageId: string | null = null;
      if (mode === 'training') {
        const sctx = await stageContextOf(res.rx.id, await childAgeOf(res.rx.child_id), res.pkg.body, gameKindOf(mission.game));
        stageId = sctx?.stage.id ?? null;
      }
      let sequenceJson: string | null = null;
      const missionKind = gameKindOf(mission.game);
      if (missionKind === 'nback') {
        // ن‌پشت (۱.۲۵.۴۰) — به‌جای دنبالهٔ g/n، رکورد چرخش لنگر-مقید در جلسه می‌نشیند:
        // آفست قطعی از seed جلسه، فقط روی سرِ زنجیره‌های مجاز (rot_start) پسوند پروب —
        // سرِ جریان چرخیده همیشه لنگر است و حکم‌های همسانی درون زنجیره‌ها سالم می‌مانند
        const flowItems = (mission.items ?? []).filter((it) => itemInStageFor(missionKind, it, stageId));
        const trainCount = flowItems.filter((it) => it.phase === 'train').length;
        const probeSuffix = flowItems.slice(trainCount);
        const anchors = probeSuffix
          .map((it, i) => ((it.stim ?? {}) as Record<string, unknown>).rot_start === true ? i : -1)
          .filter((i) => i >= 0);
        const offset = nbackRotationOffsetOf(id, anchors);
        sequenceJson = serializeNbackRotation({
          kind: 'nback', v: 1, seed: id,
          train_count: trainCount, probe_count: probeSuffix.length, offset
        });
      } else if (hasProtocol && touchItems.length >= 4) {
        const prot = protocolForAge(mode, await childAgeOf(res.rx.child_id));
        const seq = generateSequence({
          seed: id, // seed = شناسهٔ جلسه — یگانه، قابل‌ذخیره، بازتولیدپذیر
          count: touchItems.length,
          goRatio: poolRatio ?? prot.params.go_ratio.value,
          maxConsecutiveSame: prot.params.max_consecutive_same.value,
          blockSize: prot.params.block_size.value
        });
        sequenceJson = serializeSequence(seq);
      }
      await db.execute(
        `INSERT INTO game_sessions (id, mission_id, state, validity, purpose, sequence_json, stage_id, started_at, last_activity_at)
         VALUES (?,?, 'child_active', 'valid', ?, ?, ?, ?, ?)`,
        [id, res.mission.id, mode, sequenceJson, stageId, isoOf(now()), isoOf(now())]
      );
    }
    await db.execute(`UPDATE game_missions SET status = 'in_progress' WHERE id = ? AND status = 'pending'`, [res.mission.id]);
    const fresh = await resolveLink(token);
    return stateViewOf(fresh!);
  }

  async function nextItem(token: string): Promise<{ item: ItemView | null; progress: { done: number; total: number } }> {
    const res = await requireActiveToken(token);
    const session = requireSessionIn(res, ['child_active']);
    const mission = missionConfigOf(res);
    const kind = gameKindOf(mission.game);
    const attempts = await db.query<AttemptRow>(`SELECT * FROM game_attempts WHERE session_id = ?`, [session.id]);
    const doneIds = new Set(attempts.map((a) => a.item_id));
    // موج مرحلهٔ خط عددی/اسکن/استروپ/فلانکر/رد — فیلتر بانک هر نوع از رجیستری (G4الف)؛
    // گونوگو و بی‌مرحله = همهٔ آیتم‌ها؛ نمره‌دهی همیشه روی آیتم authored می‌ماند
    const inStage = (it: MissionItem): boolean => itemInStageFor(kind, it, session.stage_id);
    const stageItems = (mission.items ?? []).filter(inStage);
    const total = stageItems.length;
    const unansweredOf = (pred: (it: MissionItem) => boolean): MissionItem | undefined =>
      stageItems.find((it) => !doneIds.has(it.id) && pred(it));

    // ترتیب seed-دار (فاز ۳): جایگاه = شمار پاسخ‌های ثبت‌شده؛ دستهٔ g/n تعیین‌کنندهٔ
    // انتخاب آیتم است — کلید پاسخ هرگز به کلاینت نمی‌رود، فقط خودِ آیتمِ برگزیده.
    const seq = parseSequenceRecord(session.sequence_json);
    let next: MissionItem | undefined;
    if (seq && doneIds.size < seq.trials.length) {
      const kindTrial = seq.trials[doneIds.size].kind;
      next = unansweredOf((it) => (it.correct_touch === true) === (kindTrial === 'go'))
        ?? unansweredOf(() => true); // سهمیهٔ دسته خالی — نزدیک‌ترین سازگار
    }
    if (!next) {
      // ن‌پشت (۱.۲۵.۴۰) — ترتیب چرخشی از رکورد جلسه (ضدحفظ، لنگر-مقید)؛ رکورد خراب =
      // جریان بی‌چرخش روی ترتیب authored — هرگز انتخاب آیتم نمی‌شکند
      const rot = kind === 'nback' ? parseNbackRotation(session.sequence_json) : null;
      const flow = rot
        ? nbackOrderedItems(stageItems, { train_count: rot.train_count, offset: rot.offset })
        : stageItems;
      next = flow.find((it) => !doneIds.has(it.id));
    }

    await db.execute(`UPDATE game_sessions SET last_activity_at = ? WHERE id = ?`, [isoOf(now()), session.id]);

    // درون‌مایهٔ دیداری مرحله (۱.۲۵.۲۳) — فقط نمایش؛ نمره‌دهی روی آیتم authored می‌ماند
    // و کلید پاسخ (correct_touch) هرگز در نمای کلاینت نیست (toItemView).
    // شناسهٔ مرحله از خود جلسه می‌آید — همان که در start منجمد شده، برای همهٔ آیتم‌ها پایدار.
    let view: ItemView | null = null;
    if (next) {
      let display = next;
      if (next.type === 'touch_report' && (res.pkg.body.mode ?? 'training') === 'training' && res.pkg.body.stages_enabled !== false) {
        display = { ...next, stim: stageStimViewOf(next.stim, next.correct_touch === true, session.stage_id) };
      }
      // اهرم تندشدن موج اسکن (۱.۲۵.۳۲) — فقط نمایش؛ کلید/محرک authored دست‌نخورده؛
      // کمینهٔ زمان authored و سقف مرحله — کودک هرگز سریع‌تر از بانک نمی‌شود
      if (next.type === 'scan' && (res.pkg.body.mode ?? 'training') === 'training' && res.pkg.body.stages_enabled !== false) {
        const s = (next.stim ?? {}) as Record<string, unknown>;
        const wave = scanStageWaveMs(typeof s.wave_ms === 'number' ? s.wave_ms : null, session.stage_id);
        if (wave !== null) display = { ...next, stim: { ...s, wave_ms: wave } };
      }
      view = toItemView(display);
    }
    return { item: view, progress: { done: doneIds.size, total } };
  }

  async function submitAttempt(token: string, draft: AttemptDraftInput): Promise<AttemptFeedback> {
    const res = await requireActiveToken(token);
    const session = requireSessionIn(res, ['child_active']);
    const mission = missionConfigOf(res);
    const item = mission.items.find((it) => it.id === draft.item_id);
    if (!item) throw new ValidationError('آیتم به این مأموریت تعلق ندارد');
    if (!draft.idem_key || draft.idem_key.length > 100) throw new ValidationError('idem_key لازم است');
    // نمره‌دهی فقط سمت سرور — فاز آیتم از دادهٔ ذخیره‌شده می‌آید، نه ادعای کلاینت
    const rtMs = typeof draft.rt_ms === 'number' && Number.isFinite(draft.rt_ms)
      ? (draft.rt_ms < 0 ? null : draft.rt_ms > MAX_RT_MS ? null : Math.round(draft.rt_ms))
      : null;
    const scored = scoreAttempt(item, mission, draft.response, rtMs);
    const evidence = trialEvidenceOf(draft.response);
    const existing = await db.queryOne<AttemptRow>(`SELECT * FROM game_attempts WHERE idem_key = ?`, [draft.idem_key]);
    if (existing) return feedbackOf(item, existing.correct === 1, parseJson(existing.response_json, {})); // تکرار ایمن: همان بازخورد اول
    // سد سروری آیتم پاسخ‌داده‌شده (۱.۲۵.۲۵ G1) — idem_key تازه برای همان آیتم پاسخ دوم نمی‌سازد؛
    // این پاسخ در خلاصه/ستاره/سازگاری دوبرابر نمی‌شود (یگانگی (session,item) در مایگریشن ۰۰۹۷ هم تضمین است)
    const answered = await db.queryOne<{ correct: number | null; response_json: string }>(
      `SELECT correct, response_json FROM game_attempts WHERE session_id = ? AND item_id = ?`,
      [session.id, item.id]
    );
    if (answered) return feedbackOf(item, answered.correct === 1, parseJson(answered.response_json, {}));
    try {
      await db.execute(
        `INSERT INTO game_attempts (id, session_id, item_id, phase, response_json, correct, rt_ms, rt_valid, idem_key,
          presented_at_ms, frame_drops, max_frame_delta_ms, touch_count, premature_count, multiple_count,
          out_of_surface_count, window_ms, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [crypto.randomUUID(), session.id, item.id, item.phase, JSON.stringify(draft.response ?? {}), scored.correct ? 1 : 0,
          scored.rtMs, scored.rtValid ? 1 : 0, draft.idem_key,
          evidence.presented_at_ms, evidence.frame_drops, evidence.max_frame_delta_ms, evidence.touch_count,
          evidence.premature_count, evidence.multiple_count, evidence.out_of_surface_count, evidence.window_ms,
          isoOf(now())]
      );
    } catch (err) {
      // سد رقابت هم‌زمانی (P2-2 ممیزی M0 / G1): دو ارسال هم‌زمان به یگانگی‌های DB
      // (idem_key / session+item — مایگریشن ۰۰۹۷) می‌خورند؛ پاسخِ برنده همان بازخورد رسمی است —
      // پیام خام درایور هرگز به کلاینت عمومی نمی‌رسد و پاسخ دوم دوباره شمرده نمی‌شود
      const winner = await db.queryOne<AttemptRow>(
        `SELECT * FROM game_attempts WHERE idem_key = ? OR (session_id = ? AND item_id = ?)
         ORDER BY created_at LIMIT 1`,
        [draft.idem_key, session.id, item.id]
      );
      if (!winner) throw err; // خطای واقعی — نه رقابت یگانگی
      return feedbackOf(item, winner.correct === 1, parseJson(winner.response_json, {}));
    }
    await db.execute(`UPDATE game_sessions SET last_activity_at = ? WHERE id = ?`, [isoOf(now()), session.id]);
    return feedbackOf(item, scored.correct, draft.response);
  }

  /** شواهد نمایش واقعی کلاینت (فاز ۴) — فقط مقادیر عددی محدود؛ ادعای درستی هرگز از کلاینت پذیرفته نمی‌شود */
  function trialEvidenceOf(response: unknown): {
    presented_at_ms: number | null; frame_drops: number | null; max_frame_delta_ms: number | null;
    touch_count: number | null; premature_count: number | null; multiple_count: number | null;
    out_of_surface_count: number | null; window_ms: number | null;
  } {
    const res = (response ?? {}) as Record<string, unknown>;
    const intOf = (v: unknown): number | null =>
      typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e9 ? Math.round(v) : null;
    return {
      presented_at_ms: intOf(res.presented_at),
      frame_drops: intOf(res.frame_drops),
      max_frame_delta_ms: intOf(res.max_frame_delta),
      touch_count: intOf(res.touch_count),
      premature_count: intOf(res.premature_count),
      multiple_count: intOf(res.multiple_count),
      out_of_surface_count: intOf(res.out_of_surface_count),
      window_ms: intOf(res.window_ms)
    };
  }

  function feedbackOf(item: MissionItem, correct: boolean, response: unknown): AttemptFeedback {
    if (item.phase === 'probe') {
      return { recorded: true, phase: 'probe' }; // پروب: هیچ بازخوردی (§۵)
    }
    const touched = (response ?? {}) === Object(response)
      ? (response as Record<string, unknown>).touched === true
      : false;
    // خط عددی (۱.۲۵.۲۸): دو سطح موفقیت — دقیق / نزدیک؛ نادرست = متن پیش‌فرض §۲ بی‌سرزنش
    // حملهٔ جاسوس‌ها (۱.۲۵.۳۰): موج کامل = تحسین دقیق؛ ناقص = متن آرام + CSV جاسوس‌های جامانده
    const message = item.type === 'touch_report' && correct && !touched
      ? FEEDBACK_WITHHOLD
      : item.type === 'numline' && correct
        ? (numlineFeedbackOf(item, true, response) ?? FEEDBACK_OK)
        : item.type === 'scan' && correct
          ? SCAN_FB_ALL
          : correct
            ? FEEDBACK_OK
            : FEEDBACK_RETRY;
    return {
      recorded: true,
      phase: 'train',
      correct,
      answer_display: correct ? null : (item.type === 'scan' ? scanMissedCsv(item, response) : answerDisplayOf(item)),
      message,
      replay_audio: !correct
    };
  }

  async function finish(token: string, sessionEvidence?: SessionEvidenceFromClient): Promise<{ state: PublicStateView; metrics: SessionMetricOutcome[] }> {
    const res = await requireActiveToken(token);
    if (res.session && res.session.state === 'child_done') {
      // تکرار ایمن finish (شبکهٔ ناپایدار): همان وضعیت و همان سنجه‌های ذخیره‌شده
      return { state: await stateViewOf(res), metrics: parseJson<SessionMetricOutcome[]>(res.session.metrics_json, []) };
    }
    const session = requireSessionIn(res, ['child_active']);
    const mission = missionConfigOf(res);
    const attempts = await db.query<AttemptRow>(`SELECT * FROM game_attempts WHERE session_id = ? ORDER BY created_at`, [session.id]);
    const nowIso = isoOf(now());

    // اعتبار جلسه: شکاف بیکاری + نسبت تکمیل (§۶/§۸) — نسبت تکمیل خط عددی به «جادهٔ مرحلهٔ»
    // همان جلسه سنجیده می‌شود نه کل بانک (۱.۲۵.۲۸)؛ گونوگو/بی‌مرحله = کل مأموریت
    const finishKind = gameKindOf(mission.game);
    const finishStage = finishKind !== 'gonogo'
      ? stageById('7-12', session.stage_id, finishKind)
      : null;
    const finishTotal = finishStage
      ? mission.items.filter((it) => itemInStageFor(finishKind, it, finishStage.id)).length
      : mission.items.length;
    const activity = [res.session?.started_at ?? null, ...attempts.map((a) => a.created_at), nowIso]
      .filter((v): v is string => typeof v === 'string')
      .map((v) => new Date(v).getTime());
    const validity = decideValidity(activity, attempts.length, finishTotal);

    // سنجه فقط از Attemptهای معتبر پروب (§۸) — همهٔ سنجه‌های مأموریت (مثل چهار سنجهٔ گو/نوگو)
    // + لایهٔ محاسبه‌شدهٔ scoring.ts (فاز ۵) برای گزارش درمانگر — جدا از سنجه‌های رجیستری
    const metricIds = mission.metrics && mission.metrics.length > 0 ? mission.metrics : [mission.metric];
    const scoredRows = attempts.map((a) => ({
      a,
      scored: scoreAttempt(
        mission.items.find((it) => it.id === a.item_id) ?? ({ id: a.item_id, phase: 'probe', type: 'choice' } as MissionItem),
        mission,
        parseJson(a.response_json, {}),
        a.rt_ms
      )
    }));
    const probeScored = scoredRows.filter((r) => r.a.phase === 'probe').map((r) => r.scored);
    // خلاصهٔ محاسبه‌شده از همهٔ آزمون‌های جلسه (۱.۲۵.۲۸: خط عددی هم شامل است — رفتار/RT/پوشش
    // شواهد برای هر نوع‌بازی ثبت می‌شود؛ برای گو/نوگو همان مجموعهٔ قبلی است چون همهٔ آیتم‌ها لمسی‌اند)
    const summary = summarizeAttempts(
      scoredRows.map((r) => r.scored),
      scoredRows.map((r) => ({
        presented_at_ms: r.a.presented_at_ms ?? null,
        frame_drops: r.a.frame_drops ?? null,
        max_frame_delta_ms: r.a.max_frame_delta_ms ?? null,
        touch_count: r.a.touch_count ?? null,
        premature_count: r.a.premature_count ?? null,
        multiple_count: r.a.multiple_count ?? null,
        out_of_surface_count: r.a.out_of_surface_count ?? null,
        window_ms: r.a.window_ms ?? null
      })),
      protocolForAge(res.pkg.body.mode ?? 'training', null).params.block_size.value
    );
    const metrics: SessionMetricOutcome[] = [];
    for (const metricId of metricIds) {
      // رجیستری DB + سنجه‌های موتورمحور (فاز ۱) — درصدی‌ها هم در زنجیرهٔ سنجه و پراپ می‌آیند
      const metricRow = (await db.queryOne<RegistryMetric>(`SELECT * FROM game_metrics WHERE id = ?`, [metricId]))
        ?? ENGINE_METRICS.find((m) => m.id === metricId) ?? null;
      if (!metricRow) continue;
      const value = computeMetricValue(metricRow.formula, probeScored);
      if (value !== null && Number.isFinite(value)) {
        metrics.push({ metricId: metricRow.id, value, unit: metricRow.unit, probeCount: probeScored.length, injected: false });
      }
    }

    // تزریق پراپ به مسیر مداخله (addPathProbe) — با زمینهٔ درمانگر تجویزکننده؛
    // هر سنجه یک سری زمانی مستقل در pathway_probes می‌گیرد
    if (metrics.length > 0 && res.rx.pathway_id && deps.injectPathProbe) {
      const actor = await staffActorOf(res.rx.created_by);
      if (actor) {
        for (const outcome of metrics) {
          try {
            await deps.injectPathProbe(res.rx.pathway_id, {
              metric: outcome.metricId,
              value: outcome.value,
              unit: unitFa(outcome.unit),
              takenAt: nowIso,
              note: `بازی «${mission.title ?? mission.id}» — جلسهٔ بازی ${session.id.slice(0, 8)}${validity === 'partial' ? ' (ناقص)' : ''} — خودکار`
            }, actor);
            outcome.injected = true;
          } catch (err) {
            // خطای تزریق جلسهٔ کودک را نمی‌شکند؛ سنجه در game_sessions می‌ماند
            logger.warn('games.probe.inject_failed', { error: err instanceof Error ? err.message : String(err) });
          }
        }
      }
    }

    // کیفیت جلسه (فاز ۷) — سه‌تایی با قواعد شفاف؛ هیچ نتیجه‌گیری شناختی
    const idleGapMax = activity.length > 1
      ? Math.max(...activity.slice(1).map((t, i) => t - activity[i]))
      : null;
    const quality = assessQuality({
      validity,
      total_items: finishTotal,
      done_items: attempts.length,
      idle_gap_max_ms: idleGapMax,
      pause_count: typeof sessionEvidence?.pause_count === 'number' && Number.isFinite(sessionEvidence.pause_count) ? Math.max(0, Math.round(sessionEvidence.pause_count)) : null,
      pause_total_ms: typeof sessionEvidence?.pause_total_ms === 'number' && Number.isFinite(sessionEvidence.pause_total_ms) ? Math.max(0, Math.round(sessionEvidence.pause_total_ms)) : null,
      out_of_surface_total: summary.behavior.out_of_surface_total,
      premature_total: summary.behavior.premature_total,
      frame_drops_total: summary.behavior.frame_drops_total,
      max_frame_delta_ms: summary.behavior.max_frame_delta_ms,
      evidence_coverage: summary.behavior.evidence_coverage,
      rt_floor_violations: attempts.filter((a) => a.rt_valid === 0).length
    });
    // نتیجهٔ مرحله (۱.۲۵.۲۲) — فقط تمرین با جلسهٔ معتبر؛ گذار/ستاره در summary_json می‌ماند و
    // پیشرفت (stageProgressOf) در جلسه‌های بعدی از همین رکوردها ساخته می‌شود
    const sessionMode: ProtocolMode = res.pkg.body.mode ?? 'training';
    const stagesOn = sessionMode === 'training' && res.pkg.body.stages_enabled !== false;
    const ageFin = stagesOn ? await childAgeOf(res.rx.child_id) : null;
    const sessionKind = gameKindOf(mission.game);
    const sessionStage = stagesOn && session.stage_id
      ? stageById(bandForAge(ageFin).band, session.stage_id, sessionKind)
      : null;
    let summaryBody: unknown = summary;
    if (sessionStage && validity === 'valid') {
      // ملاک گذار نوع‌بازی‌آگاه (۱.۲۵.۲۸) — گونوگو: گو/نوگو؛ بقیه: دقت جای عدد/موج/پاسخ/رد
      const outcome = stageOutcomeFor(sessionKind, summary);
      // موتور جمع‌کردن شواهد (۱.۲۵.۳۲) — نشانه‌ها + پرچم‌ها + توصیهٔ غیربالینی؛
      // ملاک گذار همان قواعد مرحله است — شواهد فقط پیشنهاد می‌دهد و در گزارش می‌ماند
      const evidence = buildEvidenceDossier(sessionKind, summary, outcome.passed);
      summaryBody = {
        ...summary,
        evidence,
        stage: {
          id: sessionStage.id,
          index: sessionStage.index,
          title_fa: sessionStage.title_fa,
          passed: outcome.passed,
          stars: outcome.stars,
          rules_version: STAGE_RULES_VERSION
        }
      };
    }
    await db.execute(
      `UPDATE game_sessions SET state = 'child_done', validity = ?, ended_at = ?, last_activity_at = ?, metrics_json = ?, summary_json = ?, quality_json = ? WHERE id = ?`,
      [validity, nowIso, nowIso, metrics.length > 0 ? JSON.stringify(metrics) : null, JSON.stringify(summaryBody), serializeQuality(quality), session.id]
    );
    // تصمیم سازگاری (فاز ۶) — فقط تمرین با پروتکل فعال و کلید خاموشی روشن؛
    // بر پایهٔ مرحله (۱.۲۵.۲۲): سطح جاری از پنجرهٔ مرحله شروع می‌شود نه پایهٔ پروتکل —
    // ورودی‌های تصمیم عیناً در adaptive_json می‌مانند (شفافیت برای درمانگر)
    const adaptiveEnabled = sessionMode === 'training' && res.pkg.body.protocol != null && res.pkg.body.adaptive_enabled !== false;
    if (adaptiveEnabled) {
      const prot = protocolForAge('training', ageFin);
      const stageBase = sessionStage
        ? applyStageOverrides(
            Object.fromEntries(Object.entries(prot.params).map(([k, v]) => [k, v.value])),
            sessionStage
          ).response_window_go_ms
        : prot.params.response_window_go_ms.value;
      const { decision: priorDecision, history } = await latestAdaptiveDecisionOf(res.rx.id);
      const current = applyAdaptiveLevel(
        { response_window_go_ms: stageBase, level: 0 },
        priorDecision
      );
      const decision = decideAdaptive(history, current, { adaptiveEnabled: prot.behavior.adaptive });
      await db.execute(`UPDATE game_sessions SET adaptive_json = ? WHERE id = ?`, [
        serializeDecision(decision, session.id, 'training'), session.id
      ]);
    }
    await db.execute(`UPDATE game_missions SET status = 'done' WHERE id = ?`, [res.mission.id]);
    const fresh = await resolveLink(token);
    return { state: await stateViewOf(fresh!), metrics };
  }

  function unitFa(unit: RegistryMetric['unit'] | undefined): string | null {
    switch (unit) {
      case 'percent': return 'درصد';
      case 'count': return 'تعداد';
      case 'ms': return 'میلی‌ثانیه';
      case 'score': return 'امتیاز';
      default: return null;
    }
  }

  async function staffActorOf(staffId: string): Promise<AuthContext | null> {
    const row = await db.queryOne<{ id: string; email: string; role: string; full_name: string }>(
      `SELECT id, email, COALESCE(role_ext, role) AS role, full_name FROM staff WHERE id = ? AND active = 1`,
      [staffId]
    );
    if (!row) return null;
    return { staffId: row.id, email: row.email, role: row.role as AuthContext['role'], displayName: row.full_name };
  }

  async function parentGate(token: string, solve: boolean): Promise<PublicStateView> {
    const res = await requireActiveToken(token);
    const session = requireSessionIn(res, solve ? ['parent_gate'] : ['child_done']);
    await db.execute(`UPDATE game_sessions SET state = ?, last_activity_at = ? WHERE id = ?`,
      [solve ? 'parent_post' : 'parent_gate', isoOf(now()), session.id]);
    const fresh = await resolveLink(token);
    return stateViewOf(fresh!);
  }

  async function confirm(token: string): Promise<PublicStateView> {
    const res = await requireActiveToken(token);
    const session = requireSessionIn(res, ['parent_post']);
    const adherence = await db.queryOne<{ confirm1_at: string | null; confirm2_at: string | null }>(
      `SELECT confirm1_at, confirm2_at FROM game_adherence WHERE mission_id = ?`,
      [res.mission.id]
    );
    const nowIso = isoOf(now());
    if (!adherence || adherence.confirm1_at === null) {
      await db.execute(
        `INSERT INTO game_adherence (mission_id, confirm1_at) VALUES (?, ?)
         ON CONFLICT(mission_id) DO UPDATE SET confirm1_at = COALESCE(game_adherence.confirm1_at, excluded.confirm1_at)`,
        [res.mission.id, nowIso]
      );
    } else if (adherence.confirm2_at === null) {
      await db.execute(`UPDATE game_adherence SET confirm2_at = ? WHERE mission_id = ?`, [nowIso, res.mission.id]);
      await db.execute(`UPDATE game_sessions SET state = 'closed', last_activity_at = ? WHERE id = ?`, [nowIso, session.id]);
    }
    const fresh = await resolveLink(token);
    return stateViewOf(fresh!);
  }

  async function getSessionDetail(missionId: string): Promise<{ sessions: unknown[]; attempts: unknown[] }> {
    const sessions = await db.query<SessionRow>(`SELECT * FROM game_sessions WHERE mission_id = ? ORDER BY created_at DESC`, [missionId]);
    const sessionIds = sessions.map((s) => s.id);
    const attempts = sessionIds.length
      ? await db.query<AttemptRow>(
          `SELECT * FROM game_attempts WHERE session_id IN (${sessionIds.map(() => '?').join(',')}) ORDER BY created_at`,
          sessionIds
        )
      : [];
    return {
      sessions: sessions.map((s) => ({
        id: s.id, state: s.state, validity: s.validity, purpose: s.purpose ?? 'training',
        startedAt: s.started_at, endedAt: s.ended_at,
        sequence: s.sequence_json ? parseJson<unknown>(s.sequence_json, null) : null,
        metrics: parseJson<unknown>(s.metrics_json, null),
        summary: s.summary_json ? parseJson<unknown>(s.summary_json, null) : null,
        quality: s.quality_json ? parseJson<unknown>(s.quality_json, null) : null
      })),
      attempts: attempts.map((a) => ({
        id: a.id, sessionId: a.session_id, itemId: a.item_id, phase: a.phase,
        response: stripAnswerKeys(parseJson(a.response_json, {})),
        correct: a.correct === null ? null : a.correct === 1,
        rtMs: a.rt_ms, rtValid: a.rt_valid === 1, createdAt: a.created_at,
        evidence: {
          presented_at_ms: a.presented_at_ms ?? null,
          frame_drops: a.frame_drops ?? null,
          max_frame_delta_ms: a.max_frame_delta_ms ?? null,
          touch_count: a.touch_count ?? null,
          premature_count: a.premature_count ?? null,
          multiple_count: a.multiple_count ?? null,
          out_of_surface_count: a.out_of_surface_count ?? null,
          window_ms: a.window_ms ?? null
        }
      }))
    };
  }

  /** گزارش درمانگر (فاز ۸) — خام/محاسبه‌شدهٔ جدا + مقایسهٔ جلسه‌ها؛ بدون هیچ برچسب بالینی */
  async function getChildReport(childId: string): Promise<ChildGameReport> {
    const sessions = await db.query<SessionRow & { mission_ref: string; mission_title: string | null }>(
      `SELECT s.*, m.mission_ref, m.id AS mission_row_id
       FROM game_sessions s
       JOIN game_missions m ON m.id = s.mission_id
       JOIN game_prescriptions p ON p.id = m.prescription_id
       WHERE p.child_id = ? AND s.state IN ('child_done','closed')
       ORDER BY s.created_at`,
      [childId]
    );
    const missionRows = await db.query<{ id: string; mission_ref: string; prescription_id: string }>(
      `SELECT id, mission_ref, prescription_id FROM game_missions WHERE prescription_id IN
        (SELECT id FROM game_prescriptions WHERE child_id = ?)`,
      [childId]
    );
    const missionRefOf = new Map(missionRows.map((m) => [m.id, m.mission_ref]));
    const sessionIds = sessions.map((s) => s.id);
    const attempts = sessionIds.length
      ? await db.query<AttemptRow>(
          `SELECT * FROM game_attempts WHERE session_id IN (${sessionIds.map(() => '?').join(',')}) ORDER BY created_at`,
          sessionIds
        )
      : [];

    const reportSessions: ReportSession[] = [];
    const comparisonInput: Array<{ session_id: string; started_at: string | null; metrics: SessionMetricOutcome[] | null }> = [];
    for (const s of sessions) {
      const sessAttempts = attempts.filter((a) => a.session_id === s.id);
      const metrics = parseJson<SessionMetricOutcome[] | null>(s.metrics_json, null);
      comparisonInput.push({ session_id: s.id, started_at: s.started_at, metrics });
      const raw: ReportRawAttempt[] = sessAttempts.map((a) => ({
        item_id: a.item_id,
        phase: (a.phase as 'train' | 'probe') ?? 'train',
        response: stripAnswerKeys(parseJson(a.response_json, {})),
        correct: a.correct === null ? null : a.correct === 1,
        rt_ms: a.rt_ms,
        rt_valid: a.rt_valid === 1,
        created_at: a.created_at,
        evidence: {
          presented_at_ms: a.presented_at_ms ?? null,
          frame_drops: a.frame_drops ?? null,
          max_frame_delta_ms: a.max_frame_delta_ms ?? null,
          touch_count: a.touch_count ?? null,
          premature_count: a.premature_count ?? null,
          multiple_count: a.multiple_count ?? null,
          out_of_surface_count: a.out_of_surface_count ?? null,
          window_ms: a.window_ms ?? null
        }
      }));
      const quality = parseJson<{ verdict?: string } | null>(s.quality_json ?? null, null);
      reportSessions.push({
        session_id: s.id,
        mission_ref: missionRefOf.get(s.mission_id) ?? '',
        mission_title: '',
        purpose: s.purpose ?? 'training',
        started_at: s.started_at,
        computed: {
          session_id: s.id,
          purpose: s.purpose ?? 'training',
          validity: (s.validity as SessionValidity) ?? 'valid',
          quality_verdict: quality?.verdict ?? 'unknown',
          started_at: s.started_at,
          ended_at: s.ended_at,
          summary: parseJson<unknown>(s.summary_json ?? null, null),
          metrics
        },
        raw: {
          attempt_count: raw.length,
          attempts: raw,
          sequence: s.sequence_json ? parseJson<unknown>(s.sequence_json, null) : null
        },
        adaptive: s.adaptive_json ? parseJson<unknown>(s.adaptive_json, null) : null
      });
    }

    return {
      child_id: childId,
      generated_at: isoOf(now()),
      session_count: reportSessions.length,
      sessions: reportSessions,
      comparison: buildComparison(comparisonInput),
      disclaimer: 'no_clinical_conclusion'
    };
  }

  /** ممیزی خروج دادهٔ کودک (۱.۲۵.۲۵ G5) — هر گزارش JSON/HTML/CSV در دفترچهٔ حسابرسی می‌ماند:
   *  چه کسی، برای کدام کودک، با چه قالبی — بدون خودِ دادهٔ بالینی */
  async function auditReportExport(childId: string, format: string, actor: AuthContext): Promise<void> {
    await audit.log({
      actorId: actor.staffId,
      action: 'game_report_export',
      resourceType: 'game_report',
      resourceId: childId,
      changes: { format: { from: null, to: format === 'csv' || format === 'html' ? format : 'json' } }
    });
  }

  return {
    upsertMetric, listMetrics, upsertGoal, listGoals, upsertPackage, listPackages, publishPackage,
    createPrescription, listPrescriptions, listFollowups, setPrescriptionStatus, scheduleMission, listMissions,
    retirePackage, auditReportExport, maintenance,
    issueLink, revokeLink, getSessionDetail, getChildReport,
    issuePreview, previewState, previewItem, previewFeedback,
    getState, start, nextItem, submitAttempt, finish, parentGate, confirm
  };
}

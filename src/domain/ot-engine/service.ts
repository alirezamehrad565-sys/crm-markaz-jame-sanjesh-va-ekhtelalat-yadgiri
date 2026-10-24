import type { AuthContext } from '@core/shared';
import { NEED_PROTOCOL_SUGGESTIONS, STUDENT_PROTOCOL_LABELS, type StudentProtocol } from '@core/shared';
import type { DbClient } from '@core/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@core/errors';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type {
  GatesOutput,
  IdentificationGate,
  NeedsSummaryInput,
  NeedsSummaryResult,
  OtDomain,
  OtDomainProgress,
  OtProfile,
  OtProgressBaselineEntry,
  OtProgressOutput,
  OtProgressSessionEntry,
  OtPromptLevel,
  OtSessionSaveInput,
  OtSessionSaveResult,
  OtSkillState,
  OtSkillStatus,
  SuspicionOutput,
  SuspicionSignal,
  WechslerSummary
} from './types';
import { OT_DOMAINS, OT_DOMAIN_LABELS, OT_GATE_FRESH_MONTHS, OT_PROMPT_LEVEL_LABELS, OT_SKILL_STATUS_LABELS } from './types';

export const OT_SKILL_NOTE_MAX = 300;
export const OT_FOCUS_MAX = 200;
export const OT_SUMMARY_MAX = 2000;
export const OT_HOMEWORK_MAX = 300;
export const NEEDS_TEXT_MAX = 4000;
export const NEEDS_PLAN_MAX = 300;

const ANAMNESIS_KEYS = ['ce-anamnesis-v3', 'ce-anamnesis-v2', 'anamnesis'];
const BEHAVIORAL_KEYS = ['sdq-parent', 'ce-sdq-t-v1', 'ce-snap-iv-p-v1', 'ce-snap-iv-t-v1', 'ce-scared-p-v1', 'ce-dcdq-v1'];
const WECHSLER_KEYS = ['ce-wechsler-w4-v1', 'wechsler'];

const NEEDS_EVENT_KEY = 'ce-needs-v1';
const OT_SESSION_EVENT_KEY = 'ce-ot-session-v1';

const REHAB_FX_EVENT_KEY = 'ce-rehab-fx-v1';
const SLD_CHECKLIST_EVENT_KEYS = ['ce-sld-read-v1', 'ce-sld-wri-v1', 'ce-sld-calc-v1'];
const REHAB_PATHWAY_ORDER = ['anamnesis', 'skills', 'needs'] as const;

const SUSPICION_EVENT_KEY = 'ce-clinical-suspicion-v1';
const SNAP_CUTOFFS = {
  parent: { ia: { warn: 11, danger: 16 }, hi: { danger: 13 } },
  teacher: { ia: { warn: 14, danger: 16 }, hi: { danger: 11 } }
} as const;
const SCARED_DANGER = 25;
const SCARED_WARN_MIN = 20;
const SCARED_STRONG = 30;
const SUSPICION_LEVEL_LABELS: Record<string, string> = {
  watch: 'قابل پایش',
  high: 'محتمل — شواهد هم‌گرا'
};
const SUSPICION_CONSTRUCT_LABELS: Record<string, string> = {
  adhd: 'بیش‌فعالی/کم‌توجهی',
  anxiety: 'اضطراب'
};

const NEED_TYPE_LABELS: Record<string, string> = {
  dyslexia: 'نارساخوانی (دیس‌لکسی)',
  dysgraphia: 'نارسانویسی (دیس‌گرافی)',
  dyscalculia: 'نارساریاضی (دیس‌کالکولی)',
  adhd: 'بیش‌فعالی و کم‌توجهی',
  autism: 'طیف اتیسم',
  speech_language: 'اختلال زبانی و بیان',
  anxiety: 'اضطراب',
  motor_coordination: 'اختلال هماهنگی حرکتی',
  slow_learner: 'دیرآموز',
  intellectual_disability: 'ناتوانی هوشی',
  global_developmental_delay: 'تأخیر رشدی جهانی',
  social_communication: 'اختلال ارتباط اجتماعی (پراگماتیک)',
  tic: 'اختلال تیک',
  other: 'سایر'
};

interface StudentRow {
  id: string;
  first_name: string;
  last_name: string;
  owner_staff_id: string | null;
  protocol: string | null;
  case_status: string | null;
  pathway: string | null;
}

interface SeenMetaRow {
  tool_key: string;
  last_at: string;
}

interface CoverageRow {
  domain: string;
  n: number;
}

interface OtProgressRow {
  id: string;
  student_id: string;
  skill_id: string;
  status: string;
  note: string | null;
  prompt_level: string | null;
  session_id: string | null;
  occurred_at: string;
  created_at: string;
}

interface EventTypeRow {
  id: string;
  key: string;
}

interface StageEventRow {
  eventId: string;
  toolKey: string;
  status: string;
  occurredAt: string;
  payload: Record<string, { value: string; label: string }> | null;
  analysis: { score?: number | null; band?: string | null; subscaleScores?: { id: string; name: string; score: number; max: number; band: string | null; color?: string | null }[] } | null;
  subscales: { id: string; bands?: { label: string; color?: string | null }[] }[] | null;
}

interface OtEngineDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
  now?: () => Date;
}

function parseText(v: string | null | undefined, max: number): string | null {
  const t = v?.trim();
  return t ? t.slice(0, max) : null;
}

function isFresh(lastAt: string | undefined, nowFn: () => Date): boolean {
  if (!lastAt) return false;
  const t = Date.parse(lastAt.includes('T') ? lastAt : `${lastAt.replace(' ', 'T')}Z`);
  if (Number.isNaN(t)) return false;
  return nowFn().getTime() - t <= OT_GATE_FRESH_MONTHS * 30 * 24 * 3600 * 1000;
}

function makeIsFreshIso(nowFn: () => Date): (isoAt: string) => boolean {
  return (isoAt: string) => {
    const t = Date.parse(isoAt.includes('T') ? isoAt : `${isoAt.replace(' ', 'T')}Z`);
    if (Number.isNaN(t)) return false;
    return nowFn().getTime() - t <= OT_GATE_FRESH_MONTHS * 30 * 24 * 3600 * 1000;
  };
}

function parseJsonSafe<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function faNum(value: number | string): string {
  const fa = '۰۱۲۳۴۵۶۷۸۹';
  return String(value).replace(/\d/g, (d) => fa[Number(d)]);
}

function numOf(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))));
  return Number.isFinite(n) ? n : null;
}

function subscaleScoreOf(event: StageEventRow, id: string): { score: number; band: string | null; color?: string | null } | null {
  return event.analysis?.subscaleScores?.find((s) => s.id === id) ?? null;
}

function subscaleColorOf(event: StageEventRow, id: string): string | null {
  const ss = subscaleScoreOf(event, id);
  if (!ss) return null;
  if (ss.color) return ss.color;
  const def = event.subscales?.find((s) => s.id === id);
  return ss.band && def ? def.bands?.find((x) => x.label === ss.band)?.color ?? null : null;
}

function sourceOf(toolKey: string): 'parent' | 'teacher' {
  if (toolKey.includes('-t-') || toolKey === 'ce-sdq-t-v1' || toolKey === 'teacher-classroom') return 'teacher';
  return 'parent';
}

function sourceFa(toolKey: string): string {
  return sourceOf(toolKey) === 'teacher' ? 'معلم' : 'والد';
}

function roleOf(toolKey: string): 'parent' | 'teacher' {
  return sourceOf(toolKey);
}

interface SuspicionHit {
  construct: 'adhd' | 'anxiety';
  level: 'watch' | 'high';
  source: string;
  text: string;
}

function computeSuspicion(behavioralEvents: StageEventRow[], decisionEvent: StageEventRow | null, isFreshIso: (isoAt: string) => boolean): SuspicionOutput {
  const latest = new Map<string, StageEventRow>();
  for (const e of behavioralEvents) {
    if (e.status !== 'completed') continue;
    if (!isFreshIso(e.occurredAt)) continue;
    if (!latest.has(e.toolKey)) latest.set(e.toolKey, e);
  }

  const hits: SuspicionHit[] = [];
  for (const [toolKey, event] of latest) {
    if (toolKey === 'ce-snap-iv-p-v1' || toolKey === 'ce-snap-iv-t-v1') {
      const cut = SNAP_CUTOFFS[roleOf(toolKey)];
      const src = sourceFa(toolKey);
      const ia = subscaleScoreOf(event, 'ia');
      const iaNum = ia ? ia.score : numOf(event.payload?.['ia_total']?.value);
      const iaDanger = iaNum !== null ? iaNum >= cut.ia.danger : subscaleColorOf(event, 'ia') === 'danger';
      const iaWarn = !iaDanger && iaNum !== null ? iaNum >= cut.ia.warn : !iaDanger && subscaleColorOf(event, 'ia') === 'warn';
      if (iaDanger) {
        hits.push({ construct: 'adhd', level: 'high', source: sourceOf(toolKey), text: `بی‌توجهی در SNAP-IV ${src} پرخطر است${iaNum !== null ? ` (نمرهٔ ${faNum(iaNum)} از ${faNum(27)})` : ''}` });
      } else if (iaWarn) {
        hits.push({ construct: 'adhd', level: 'watch', source: sourceOf(toolKey), text: `بی‌توجهی در SNAP-IV ${src} کمی بالاتر از معمول است${iaNum !== null ? ` (نمرهٔ ${faNum(iaNum)})` : ''}` });
      }
      const hi = subscaleScoreOf(event, 'hi');
      const hiNum = hi ? hi.score : numOf(event.payload?.['hi_total']?.value);
      const hiDanger = hiNum !== null ? hiNum >= cut.hi.danger : subscaleColorOf(event, 'hi') === 'danger';
      if (hiDanger) {
        hits.push({ construct: 'adhd', level: 'high', source: sourceOf(toolKey), text: `بی‌قراری/تکانش در SNAP-IV ${src} پرخطر است${hiNum !== null ? ` (نمرهٔ ${faNum(hiNum)})` : ''}` });
      }
      continue;
    }
    if (toolKey === 'sdq-parent' || toolKey === 'ce-sdq-t-v1') {
      const src = sourceFa(toolKey);
      if (subscaleColorOf(event, 'hyper') === 'danger') {
        hits.push({ construct: 'adhd', level: 'high', source: sourceOf(toolKey), text: `بیش‌فعالی در SDQ ${src} پرخطر گزارش شده است` });
      }
      if (subscaleColorOf(event, 'emo') === 'danger') {
        hits.push({ construct: 'anxiety', level: 'watch', source: sourceOf(toolKey), text: `مشکلات هیجانی در SDQ ${src} پرخطر گزارش شده است` });
      }
      continue;
    }
    if (toolKey === 'ce-scared-p-v1') {
      const total = event.analysis?.score ?? numOf(event.payload?.['total']?.value);
      if (total !== null) {
        if (total >= SCARED_STRONG) {
          hits.push({ construct: 'anxiety', level: 'high', source: 'parent', text: `نمرهٔ کل اضطراب (SCARED والد) در باند اختصاصی است (${faNum(total)})` });
        } else if (total >= SCARED_DANGER) {
          hits.push({ construct: 'anxiety', level: 'high', source: 'parent', text: `نمرهٔ کل اضطراب (SCARED والد) پرخطر است (${faNum(total)} از ${faNum(82)})` });
        } else if (total >= SCARED_WARN_MIN) {
          hits.push({ construct: 'anxiety', level: 'watch', source: 'parent', text: `نمرهٔ کل اضطراب (SCARED والد) کمی بالاتر از معمول است (${faNum(total)})` });
        }
      }
      continue;
    }
  }

  const signals: SuspicionSignal[] = [];
  for (const construct of ['adhd', 'anxiety'] as const) {
    const mine = hits.filter((h) => h.construct === construct);
    if (mine.length === 0) continue;
    const level: 'watch' | 'high' = mine.some((h) => h.level === 'high') ? 'high' : 'watch';
    const sources = [...new Set(mine.map((h) => h.source))];
    const evidence = mine.map((h) => h.text).slice(0, 4);
    if (sources.includes('parent') && sources.includes('teacher')) {
      evidence.push('خانه و مدرسه هم‌رأی گزارش می‌دهند (هم‌گرایی چندمنبعی)');
    }
    signals.push({
      construct,
      label: SUSPICION_CONSTRUCT_LABELS[construct] ?? construct,
      level,
      levelLabel: SUSPICION_LEVEL_LABELS[level] ?? level,
      sources,
      evidence
    });
  }

  return {
    signals,
    decided: Boolean(decisionEvent),
    decidedAt: decisionEvent?.occurredAt ?? null,
    decidedSummary: decisionEvent?.payload?.['decision']?.value ?? decisionEvent?.payload?.['suspect']?.value ?? null
  };
}

const WISC_INDEX_KEYS = ['VCI', 'PRI', 'WMI', 'PSI', 'FSIQ'] as const;

function wechslerSummaryOf(events: StageEventRow[]): WechslerSummary | null {
  const w = events.find((e) => WECHSLER_KEYS.includes(e.toolKey));
  if (!w) return null;

  const engineRaw = w.payload?.['engine_output']?.value?.trim();
  if (engineRaw) {
    try {
      const c = JSON.parse(engineRaw) as {
        ok?: unknown;
        snapshot?: {
          fsiq?: number | null;
          gai?: number | null;
          indexScatter?: number | null;
          indices?: Record<string, { scaled?: number | null; percentile?: number | null; cls?: string | null } | undefined>;
          spreads?: Record<string, number | undefined>;
          weakestIndex?: string | null;
          strongestIndex?: string | null;
          personalIndexMean?: number | null;
          personalSubMean?: number | null;
          outOfBandSubs?: number | null;
          subtests?: { code: string; scaled?: number | null }[] | null;
          subStrong?: { code: string }[] | null;
          subWeak?: { code: string }[] | null;
          gaiMeta?: { scaled?: number | null; percentile?: number | null; ci95?: string | null } | null;
          s5rows?: Record<string, unknown>[] | null;
          pairs?: Record<string, unknown>[] | null;
        } | null;
        weakDomains?: string[] | null;
        flags?: { fa?: string }[] | null;
        monitoringInterval?: string | null;
        ageLine?: string | null;
        psychometrics?: Record<string, unknown> | null;
      };
      const snap = c.snapshot;
      if (c.ok && snap) {
        const profile = (snap.subtests?.length || snap.indices && WISC_INDEX_KEYS.some((k) => snap.indices?.[k])) ? {
          indices: WISC_INDEX_KEYS
            .map((k) => {
              const ix = snap.indices?.[k];
              if (!ix || (ix.scaled == null && ix.percentile == null)) return null;
              return { key: k, scaled: ix.scaled ?? null, percentile: ix.percentile ?? null, cls: ix.cls ?? null };
            })
            .filter((ix): ix is NonNullable<typeof ix> => ix !== null),
          gaiMeta: snap.gaiMeta ?? null,
          spreads: snap.spreads ?? {},
          weakestIndex: snap.weakestIndex ?? null,
          strongestIndex: snap.strongestIndex ?? null,
          personalIndexMean: snap.personalIndexMean ?? null,
          personalSubMean: snap.personalSubMean ?? null,
          outOfBandSubs: snap.outOfBandSubs ?? null,
          subtests: (snap.subtests ?? []).map((s) => ({ code: s.code, scaled: s.scaled ?? null, core: null })),
          subStrong: (snap.subStrong ?? []).map((s) => ({ code: s.code })),
          subWeak: (snap.subWeak ?? []).map((s) => ({ code: s.code })),
          step5: snap.s5rows ?? [],
          pairs: snap.pairs ?? [],
          comparisons: null
        } : null;
        return {
          fsiq: snap.fsiq ?? null,
          vci: snap.indices?.VCI?.scaled ?? null,
          pri: snap.indices?.PRI?.scaled ?? null,
          wmi: snap.indices?.WMI?.scaled ?? null,
          psi: snap.indices?.PSI?.scaled ?? null,
          gai: snap.gai ?? null,
          indexScatter: snap.indexScatter ?? null,
          cls: snap.indices?.FSIQ?.cls ?? null,
          percentile: typeof snap.indices?.FSIQ?.percentile === 'number' ? snap.indices.FSIQ.percentile : null,
          weakDomains: c.weakDomains ?? [],
          flagsFa: (c.flags ?? []).map((f) => f.fa ?? '').filter(Boolean),
          monitoringInterval: c.monitoringInterval ?? null,
          ageLine: c.ageLine ?? null,
          occurredAt: w.occurredAt,
          event: { date: w.occurredAt },
          engine: true,
          profile,
          psychometrics: c.psychometrics ?? null
        };
      }
    } catch {
      // خروجی موتور ناخوانا — به مسیر دستی می‌افتیم
    }
  }

  const n = (k: string) => numOf(w.payload?.[k]?.value);
  const manual = { fsiq: n('fsiq'), vci: n('vci'), pri: n('pri'), wmi: n('wmi'), psi: n('psi') };
  if (manual.fsiq === null && manual.vci === null && manual.pri === null && manual.wmi === null && manual.psi === null) return null;
  return {
    ...manual,
    gai: null,
    indexScatter: null,
    cls: null,
    percentile: null,
    weakDomains: [],
    flagsFa: [],
    monitoringInterval: null,
    ageLine: null,
    occurredAt: w.occurredAt,
    event: { date: w.occurredAt },
    engine: false,
    profile: null,
    psychometrics: null
  };
}

export function createOtEngineService(deps: OtEngineDeps) {
  const { db, audit, logger } = deps;
  const log = logger.child('ot-engine');
  const now = deps.now ?? (() => new Date());
  const iso = () => now().toISOString();

  async function loadStudent(studentId: string): Promise<StudentRow> {
    const row = await db.queryOne<StudentRow>(
      `SELECT id, first_name, last_name, owner_staff_id, protocol, case_status, pathway FROM students WHERE id = ?`,
      [studentId]
    );
    if (!row) throw new NotFoundError('دانش‌آموز');
    return row;
  }

  function assertCanView(student: StudentRow, actor: AuthContext): void {
    if (actor.role === 'manager' || actor.role === 'secretary') return;
    if (actor.role === 'therapist' && student.owner_staff_id === actor.staffId) return;
    throw new ForbiddenError('این بخش فقط برای مدیر، منشی یا درمانگرِ مسئول پرونده قابل مشاهده است');
  }

  function assertCanWrite(student: StudentRow, actor: AuthContext): void {
    if (actor.role === 'manager') return;
    if (actor.role === 'therapist' && student.owner_staff_id === actor.staffId) return;
    throw new ForbiddenError('ثبت فقط توسط مدیر یا درمانگرِ مسئول پرونده مجاز است');
  }

  async function loadSeenToolMeta(studentId: string): Promise<Map<string, string>> {
    const rows = await db.query<SeenMetaRow>(
      `SELECT t.key AS tool_key, MAX(e.occurred_at) AS last_at
         FROM case_events e
         JOIN case_event_types t ON t.id = e.event_type_id
        WHERE e.student_id = ? AND e.status = 'completed' AND e.deleted_at IS NULL
        GROUP BY t.key
        LIMIT 500`,
      [studentId]
    );
    return new Map(rows.map((r) => [r.tool_key, r.last_at]));
  }

  async function loadOtCoverage(studentId: string): Promise<{ scored: number; total: number; domainsCovered: number; domainsMin3: number; domainTitles: string[] }> {
    const rows = await db.query<CoverageRow>(
      `SELECT t.domain, COUNT(DISTINCT p.skill_id) AS n
         FROM ot_progress p
         JOIN ot_skills t ON t.id = p.skill_id
        WHERE p.student_id = ?
        GROUP BY t.domain`,
      [studentId]
    );
    const byDomain = new Map(rows.map((r) => [r.domain, r.n]));
    const covered: string[] = [];
    let scored = 0;
    let domainsMin3 = 0;
    for (const d of OT_DOMAINS) {
      const n = byDomain.get(d) ?? 0;
      scored += n;
      if (n > 0) covered.push(OT_DOMAIN_LABELS[d]);
      if (n >= 3) domainsMin3 += 1;
    }
    const totalRow = await db.queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM ot_skills WHERE COALESCE(is_primary, 1) = 1`
    );
    return { scored, total: totalRow?.n ?? 0, domainsCovered: covered.length, domainsMin3, domainTitles: covered };
  }

  async function loadStageEvents(studentId: string): Promise<StageEventRow[]> {
    const keys = [...BEHAVIORAL_KEYS, ...WECHSLER_KEYS, SUSPICION_EVENT_KEY];
    const rows = await db.query<{
      id: string;
      tool_key: string;
      status: string;
      occurred_at: string;
      payload: string | null;
      analysis: string | null;
      type_subscales: string | null;
    }>(
      `SELECT e.id,
              t.key            AS tool_key,
              e.status,
              e.occurred_at,
              e.payload,
              e.analysis,
              t.subscales      AS type_subscales
         FROM case_events e
         JOIN case_event_types t ON t.id = e.event_type_id
        WHERE e.student_id = ? AND e.status = 'completed' AND e.deleted_at IS NULL
          AND t.key IN (${keys.map(() => '?').join(', ')})
        ORDER BY e.occurred_at DESC, e.created_at DESC
        LIMIT 200`,
      [studentId, ...keys]
    );
    return rows.map((r) => ({
      eventId: r.id,
      toolKey: r.tool_key,
      status: r.status,
      occurredAt: r.occurred_at,
      payload: parseJsonSafe<Record<string, { value: string; label: string }>>(r.payload),
      analysis: parseJsonSafe<StageEventRow['analysis']>(r.analysis),
      subscales: parseJsonSafe<StageEventRow['subscales']>(r.type_subscales)
    }));
  }

  function clampProtocol(v: string | null): StudentProtocol | null {
    return v && v in STUDENT_PROTOCOL_LABELS ? (v as StudentProtocol) : null;
  }

  async function computeGates(student: StudentRow): Promise<GatesOutput> {
    const [seen, otCoverage, stageEvents] = await Promise.all([loadSeenToolMeta(student.id), loadOtCoverage(student.id), loadStageEvents(student.id)]);
    const protocol = clampProtocol(student.protocol);

    const freshCount = (keys: string[]) => keys.filter((k) => isFresh(seen.get(k), now)).length;
    const rawCount = (keys: string[]) => keys.filter((k) => seen.has(k)).length;

    const nAnam = freshCount(ANAMNESIS_KEYS);
    const nAnamRaw = rawCount(ANAMNESIS_KEYS);
    const nBehav = freshCount(BEHAVIORAL_KEYS);
    const nWisc = freshCount(WECHSLER_KEYS);
    const nWiscRaw = rawCount(WECHSLER_KEYS);
    const nSld = freshCount(SLD_CHECKLIST_EVENT_KEYS);
    const nSldRaw = rawCount(SLD_CHECKLIST_EVENT_KEYS);
    const nFx = freshCount([REHAB_FX_EVENT_KEY]);
    const nFxRaw = rawCount([REHAB_FX_EVENT_KEY]);
    const domCovered = otCoverage.domainsCovered;
    const domMin3 = otCoverage.domainsMin3;

    const staleNote = ` — کهنه است (بیش از ${'۱۲'} ماه؛ بازثبت لازم)`;
    const isLearning = student.pathway === 'learning';
    const isRehab = student.pathway === 'rehab';

    const skillsStatus = isRehab
      ? {
          done: nFx > 0 || (domCovered >= 7 && domMin3 >= 7),
          detail: nFx > 0
            ? 'ارزیابی عملکردی ذهنی ثبت شده — خط پایهٔ شش حیطه‌ای موجود است'
            : nFxRaw > 0
              ? `ارزیابی عملکردی ذهنی ثبت شده اما${staleNote}`
              : domCovered > 0
                ? `${otCoverage.scored} مهارت در چک‌لیست ۷ حیطه‌ای نمره گرفته — ارزیابی عملکردی درمانگر هنوز ثبت نشده`
                : 'ارزیابی عملکردی درمانگر در مرکز هنوز ثبت نشده'
        }
      : isLearning
        ? {
            done: nSld >= 2,
            detail: nSld > 0 ? `${nSld} از ۳ چک‌لیست خواندن/نوشتن/ریاضی در ۱۲ ماه اخیر` : nSldRaw > 0 ? 'ثبت شده اما خارج از پنجرهٔ ۱۲ ماه' : 'هنوز ثبت نشده'
          }
        : {
            done: domCovered >= 7 && domMin3 >= 7,
            detail: `${otCoverage.scored} مهارت نمره‌گرفته — ${domMin3} حیطه از ۷ با حداقل ۳ نمره`
          };

    const stageStatus: Record<string, { done: boolean; detail: string }> = {
      anamnesis: {
        done: nAnam > 0,
        detail: nAnam > 0 ? 'ثبت شده' : nAnamRaw > 0 ? `ثبت شده اما${staleNote}` : 'هنوز ثبت نشده'
      },
      wechsler: {
        done: nWisc > 0,
        detail: nWisc > 0 ? 'ثبت شده' : nWiscRaw > 0 ? `ثبت شده اما${staleNote}` : 'هنوز ثبت نشده'
      },
      behavioral: {
        done: nBehav >= 2,
        detail: nBehav > 0 ? `${nBehav} چک‌لیست معتبر در ۱۲ ماه اخیر` : nBehav === 0 && rawCount(BEHAVIORAL_KEYS) > 0 ? 'ثبت شده اما خارج از پنجرهٔ ۱۲ ماه' : 'هنوز ثبت نشده'
      },
      skills: skillsStatus,
      needs: {
        done: protocol !== null,
        detail: protocol ? `پروتکل فعال: ${STUDENT_PROTOCOL_LABELS[protocol]}` : isRehab ? 'پس از شرح‌حال و ارزیابی عملکردی' : 'پس از چهار ورودی دیگر'
      }
    };
    const activeOrder: readonly string[] = isRehab ? REHAB_PATHWAY_ORDER : ['anamnesis', 'wechsler', 'behavioral', 'skills', 'needs'];
    const gates: IdentificationGate[] = activeOrder.map((key) => {
      const label = key === 'skills' && isRehab
        ? 'ارزیابی عملکردی توانبخشی — ثبت درمانگر'
        : key === 'skills' && isLearning
          ? 'ارزیابی عملکردی درمانگر — چک‌لیست‌های خواندن/نوشتن/ریاضی'
          : key === 'skills'
            ? 'ارزیابی مهارتی — چک‌لیست ۷ حیطه‌ای'
            : key === 'anamnesis'
              ? 'شرح‌حال و گفت‌وگوی اول'
              : key === 'wechsler'
                ? 'آزمون هوش وکسلر ۴'
                : key === 'behavioral'
                  ? 'چک‌لیست‌های رفتاری (حداقل ۲ تازه)'
                  : 'نتیجهٔ نیاز ویژه (دروازهٔ مداخله)';
      const hint = key === 'skills' && isRehab
        ? 'شش حیطهٔ شناختی پایه با دادهٔ خام + سطح راهنما — حین جلسهٔ اول مرکز؛ وکسلر و چک‌لیست‌های خانواده/معلم اختیاری‌اند'
        : key === 'skills' && isLearning
          ? 'حداقل ۲ از ۳ چک‌لیست — بنا به نشانه‌های شرح‌حال و غربالگری'
          : key === 'skills'
            ? 'حین جلسات کاردرمانی ذهنی — ملاک: حداقل ۳ نمره در هر ۷ حیطه (نزدیک سن + پایین‌تر + بالاتر)'
            : key === 'anamnesis'
              ? 'فرم «گفت‌وگوی اول» با خانواده — پایهٔ همهٔ تصمیم‌ها'
              : key === 'wechsler'
                ? 'فرم نتایج وکسلر — تحلیل ساخت‌یافته زیر فرم؛ زیر ۶ سال WPPSI/Leiter'
                : key === 'behavioral'
                  ? 'SNAP-IV والد و معلم، SDQ، SCARED، DCDQ — با بله ارسال می‌شود؛ پنجرهٔ اعتبار ۱۲ ماه'
                  : 'جمع‌بندی شواهد + انتخاب پروتکل مداخله — پرونده وارد فاز مداخله می‌شود';
      return {
        key: key as IdentificationGate['key'],
        ord: activeOrder.indexOf(key) + 1,
        label,
        hint,
        done: stageStatus[key].done,
        detail: stageStatus[key].detail
      };
    });

    return {
      phase: protocol ? 'intervention' : 'identification',
      protocol,
      gates,
      suspicion: computeSuspicion(
        stageEvents.filter((e) => BEHAVIORAL_KEYS.includes(e.toolKey)),
        stageEvents.find((e) => e.toolKey === SUSPICION_EVENT_KEY) ?? null,
        makeIsFreshIso(now)
      ),
      wechslerSummary: wechslerSummaryOf(stageEvents),
      otCoverage,
      protocolSuggestions: NEED_PROTOCOL_SUGGESTIONS,
      pathway: student.pathway
    };
  }

  async function getGates(studentId: string, actor: AuthContext): Promise<GatesOutput> {
    const student = await loadStudent(studentId);
    assertCanView(student, actor);
    return computeGates(student);
  }

  async function getOtProfile(studentId: string, actor: AuthContext): Promise<OtProfile> {
    const student = await loadStudent(studentId);
    assertCanView(student, actor);

    const [skillRows, progressRows, sessionCount] = await Promise.all([
      db.query<{ id: string; domain: string; ord: number; title: string; criterion: string; expected_age: string | null; skill_group: string | null; is_primary: number }>(
        `SELECT id, domain, ord, title, criterion, expected_age, skill_group, is_primary FROM ot_skills`
      ),
      db.query<OtProgressRow>(
        `SELECT id, student_id, skill_id, status, note, prompt_level, session_id, occurred_at, created_at
           FROM ot_progress WHERE student_id = ?
          ORDER BY occurred_at ASC, created_at ASC, rowid ASC`,
        [studentId]
      ),
      db.queryOne<{ n: number; last: string | null }>(
        `SELECT COUNT(DISTINCT session_id) AS n, MAX(occurred_at) AS last FROM ot_progress WHERE student_id = ?`,
        [studentId]
      )
    ]);

    interface Rec {
      status: OtSkillStatus;
      sessionKey: string;
      at: string;
      note: string | null;
      prompt: OtPromptLevel | null;
    }

    const recsBySkill = new Map<string, Rec[]>();
    for (const r of progressRows) {
      if (!(r.status in OT_SKILL_STATUS_LABELS)) continue; // ردیف نامعتبر — نادیده (D7)
      const rec: Rec = {
        status: r.status as OtSkillStatus,
        sessionKey: r.session_id ?? `raw:${r.id}`,
        at: r.occurred_at,
        note: r.note,
        prompt: r.prompt_level && r.prompt_level in OT_PROMPT_LEVEL_LABELS ? (r.prompt_level as OtPromptLevel) : null
      };
      const list = recsBySkill.get(r.skill_id);
      if (list) list.push(rec);
      else recsBySkill.set(r.skill_id, [rec]);
    }

    const skillById = new Map(skillRows.map((s) => [s.id, s]));
    void skillById; // رزرو برای گزارش‌های آینده
    const domains: OtDomainProgress[] = [];

    for (const d of OT_DOMAINS) {
      const skills = skillRows
        .filter((s) => s.domain === d)
        .sort((a, b) => a.ord - b.ord)
        .map<OtSkillState>((s) => {
          const list = recsBySkill.get(s.id) ?? [];
          const last = list.length > 0 ? list[list.length - 1] : null;
          let masteryConfirmed = false;
          if (last && last.status === 'mastered') {
            for (let i = list.length - 2; i >= 0; i--) {
              if (list[i].sessionKey !== last.sessionKey) {
                masteryConfirmed = list[i].status === 'mastered';
                break;
              }
            }
          }
          let promptLevel: OtPromptLevel | null = null;
          for (let i = list.length - 1; i >= 0; i--) {
            if (list[i].prompt) { promptLevel = list[i].prompt; break; }
          }
          return {
            skillId: s.id,
            ord: s.ord,
            title: s.title,
            criterion: s.criterion,
            status: last?.status ?? null,
            firstStatus: list.length > 0 ? list[0].status : null,
            masteryConfirmed,
            promptLevel,
            expectedAge: s.expected_age ?? null,
            skillGroup: s.skill_group ?? null,
            isPrimary: (s.is_primary ?? 1) === 1,
            latestAt: last?.at ?? null,
            latestNote: last?.note ?? null,
            sessions: new Set(list.map((r) => r.sessionKey)).size
          };
        });

      const firstNotConfirmed = skills.find((s) => s.isPrimary && !(s.status === 'mastered' && s.masteryConfirmed));
      const primary = skills.filter((s) => s.isPrimary);
      domains.push({
        key: d,
        title: OT_DOMAIN_LABELS[d],
        resumeSkillId: firstNotConfirmed?.skillId ?? null,
        mastered: primary.filter((s) => s.status === 'mastered' && s.masteryConfirmed).length,
        masteredPending: primary.filter((s) => s.status === 'mastered' && !s.masteryConfirmed).length,
        withHelp: primary.filter((s) => s.status === 'with_help').length,
        notYet: primary.filter((s) => s.status === 'not_yet').length,
        scored: primary.filter((s) => s.status !== null).length,
        total: primary.length,
        totalAll: skills.length,
        skills
      });
    }

    const totals = domains.reduce(
      (acc, d) => ({
        scored: acc.scored + d.scored,
        total: acc.total + d.total,
        mastered: acc.mastered + d.mastered,
        masteredPending: acc.masteredPending + d.masteredPending,
        withHelp: acc.withHelp + d.withHelp,
        notYet: acc.notYet + d.notYet
      }),
      { scored: 0, total: 0, mastered: 0, masteredPending: 0, withHelp: 0, notYet: 0 }
    );

    const secondarySkills = skillRows.filter((s) => (s.is_primary ?? 1) !== 1).length;

    return {
      domains,
      totals: {
        ...totals,
        secondarySkills,
        sessions: sessionCount?.n ?? 0,
        lastSessionAt: sessionCount?.last ?? null
      }
    };
  }

  const REHAB_FX_BASELINE_LABELS: Record<string, string> = {
    att_sus: 'توجه پایدار',
    att_sel: 'توجه انتخابی',
    wm: 'حافظهٔ کاری',
    inh: 'بازداری',
    flex: 'انعطاف ذهنی',
    ps: 'حل مسئله'
  };
  const REHAB_FX_BAND_COLORS: Record<string, string> = {
    'در انتظار': 'ok',
    'مرزی': 'warn',
    'ضعف آشکار': 'danger'
  };

  async function getOtProgress(studentId: string, actor: AuthContext): Promise<OtProgressOutput> {
    const student = await loadStudent(studentId);
    assertCanView(student, actor);

    const [rows, baselineEvent] = await Promise.all([
      db.query<{ id: string; skill_id: string; session_id: string | null; occurred_at: string; status: string; prompt_level: string | null; domain: string; is_primary: number | null }>(
        `SELECT p.id, p.skill_id, p.session_id, p.occurred_at, p.status, p.prompt_level, s.domain, s.is_primary
           FROM ot_progress p
           JOIN ot_skills s ON s.id = p.skill_id
          WHERE p.student_id = ?
          ORDER BY p.occurred_at ASC, p.created_at ASC, p.rowid ASC`,
        [studentId]
      ),
      db.queryOne<{ payload: string; occurred_at: string }>(
        `SELECT e.payload, e.occurred_at
           FROM case_events e
           JOIN case_event_types t ON t.id = e.event_type_id
          WHERE e.student_id = ? AND t.key = ? AND e.status = 'completed' AND e.deleted_at IS NULL
          ORDER BY e.occurred_at DESC, e.created_at DESC
          LIMIT 1`,
        [studentId, REHAB_FX_EVENT_KEY]
      )
    ]);

    interface SessionAgg {
      sessionId: string;
      occurredAt: string;
      total: number;
      mastered: number;
      withHelp: number;
      notYet: number;
      confirmedNew: number;
      prompts: Record<string, number>;
      domains: Map<OtDomain, { mastered: number; withHelp: number; notYet: number }>;
    }
    const sessionsBy = new Map<string, SessionAgg>();
    const skillHistory = new Map<string, { sessionKey: string; status: string }[]>();

    for (const r of rows) {
      if (!(r.status in OT_SKILL_STATUS_LABELS)) continue; // ردیف نامعتبر — نادیده (D7)
      const isPrimary = (r.is_primary ?? 1) === 1;
      const sessionKey = r.session_id ?? `raw:${r.id}`;
      let agg = sessionsBy.get(sessionKey);
      if (!agg) {
        agg = {
          sessionId: sessionKey,
          occurredAt: r.occurred_at,
          total: 0, mastered: 0, withHelp: 0, notYet: 0, confirmedNew: 0,
          prompts: {},
          domains: new Map()
        };
        sessionsBy.set(sessionKey, agg);
      }
      const hist = skillHistory.get(r.skill_id) ?? [];
      if (r.status === 'mastered') {
        for (let i = hist.length - 1; i >= 0; i--) {
          if (hist[i].sessionKey !== sessionKey) {
            if (hist[i].status === 'mastered') agg.confirmedNew += 1;
            break;
          }
        }
      }
      hist.push({ sessionKey, status: r.status });
      skillHistory.set(r.skill_id, hist);

      if (!isPrimary) continue; // مکمل‌ها خارج از شمارش پیشرفت (هم‌قرارداد پروفایل)
      agg.total += 1;
      if (r.status === 'mastered') agg.mastered += 1;
      else if (r.status === 'with_help') agg.withHelp += 1;
      else agg.notYet += 1;
      if (r.status === 'with_help' && r.prompt_level && r.prompt_level in OT_PROMPT_LEVEL_LABELS) {
        agg.prompts[r.prompt_level] = (agg.prompts[r.prompt_level] ?? 0) + 1;
      }
      const domAgg = agg.domains.get(r.domain as OtDomain) ?? { mastered: 0, withHelp: 0, notYet: 0 };
      if (r.status === 'mastered') domAgg.mastered += 1;
      else if (r.status === 'with_help') domAgg.withHelp += 1;
      else domAgg.notYet += 1;
      agg.domains.set(r.domain as OtDomain, domAgg);
    }

    const sessionList: OtProgressSessionEntry[] = [...sessionsBy.values()]
      .filter((s) => s.total > 0) // جلسهٔ بی‌مهارتِ primary (فقط مکمل/نامعتبر) شمرده نمی‌شود
      .sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : a.occurredAt > b.occurredAt ? 1 : 0))
      .map((s, i) => ({
        sessionId: s.sessionId,
        ord: i + 1,
        occurredAt: s.occurredAt,
        total: s.total,
        mastered: s.mastered,
        withHelp: s.withHelp,
        notYet: s.notYet,
        confirmedNew: s.confirmedNew,
        prompts: s.prompts,
        domains: OT_DOMAINS.map((d) => ({
          key: d,
          ...(s.domains.get(d) ?? { mastered: 0, withHelp: 0, notYet: 0 })
        }))
      }));

    let confirmedMastered = 0;
    let currentWithHelp = 0;
    for (const [, hist] of skillHistory) {
      const last = hist[hist.length - 1];
      if (!last) continue;
      if (last.status === 'with_help') currentWithHelp += 1;
      if (last.status === 'mastered') {
        for (let i = hist.length - 2; i >= 0; i--) {
          if (hist[i].sessionKey !== last.sessionKey) {
            if (hist[i].status === 'mastered') confirmedMastered += 1;
            break;
          }
        }
      }
    }

    let baseline: OtProgressBaselineEntry[] | null = null;
    let baselineSummary: string | null = null;
    let baselineAt: string | null = null;
    if (baselineEvent) {
      try {
        const payload = JSON.parse(baselineEvent.payload ?? '{}') as Record<string, { value?: unknown; label?: string } | undefined>;
        const entries: OtProgressBaselineEntry[] = [];
        for (const [key, label] of Object.entries(REHAB_FX_BASELINE_LABELS)) {
          const dRow = payload[`d_${key}`];
          const bandRow = payload[`fx_${key}_band`];
          if (!dRow || typeof dRow.value !== 'string' || !bandRow || typeof bandRow.value !== 'string') continue;
          const unit = (dRow.label ?? '').split(' — ')[1] ?? '';
          entries.push({
            key,
            label,
            valueFa: unit ? `${dRow.value} ${unit}` : dRow.value,
            band: bandRow.value,
            color: REHAB_FX_BAND_COLORS[bandRow.value] ?? 'diff',
            prompt: typeof payload[`fx_${key}_prompt`]?.value === 'string'
              ? String(payload[`fx_${key}_prompt`]!.value)
              : 'بدون راهنما'
          });
        }
        if (entries.length > 0) {
          baseline = entries;
          baselineSummary = typeof payload['fa_summary']?.value === 'string' ? String(payload['fa_summary']!.value) : null;
          baselineAt = baselineEvent.occurred_at;
        }
      } catch {
        baseline = null; // payload خراب — خط پایه نمایش داده نمی‌شود
      }
    }

    return {
      sessions: sessionList,
      baseline,
      baselineSummary,
      baselineAt,
      summary: {
        sessions: sessionList.length,
        confirmedMastered,
        withHelp: currentWithHelp,
        lastAt: sessionList.length > 0 ? sessionList[sessionList.length - 1].occurredAt : null
      }
    };
  }

  async function saveOtSession(studentId: string, input: OtSessionSaveInput, actor: AuthContext): Promise<OtSessionSaveResult> {
    const student = await loadStudent(studentId);
    assertCanWrite(student, actor);

    const bySkill = new Map<string, { status: OtSkillStatus; note: string | null; promptLevel: OtPromptLevel | null }>();
    for (const it of input.items) {
      const prompt = it.status === 'with_help' && it.promptLevel && it.promptLevel in OT_PROMPT_LEVEL_LABELS
        ? it.promptLevel
        : null;
      bySkill.set(it.skillId, {
        status: it.status,
        note: parseText(it.note, OT_SKILL_NOTE_MAX),
        promptLevel: prompt
      });
    }

    const ids = [...bySkill.keys()];
    if (ids.length === 0) throw new ValidationError('حداقل یک مهارت با وضعیت لازم است');

    const validRows = await db.query<{ id: string }>(
      `SELECT id FROM ot_skills WHERE id IN (${ids.map(() => '?').join(', ')})`,
      ids
    );
    const valid = new Set(validRows.map((r) => r.id));
    const unknown = ids.filter((x) => !valid.has(x));
    if (unknown.length > 0) throw new ValidationError(`شناسهٔ مهارت نامعتبر: ${unknown[0]}`);

    const prevRows = await db.query<{ skill_id: string; status: string }>(
      `SELECT skill_id, status
         FROM ot_progress
        WHERE student_id = ? AND skill_id IN (${ids.map(() => '?').join(', ')})
        ORDER BY occurred_at ASC, created_at ASC, rowid ASC`,
      [studentId, ...ids]
    );
    const prevLatest = new Map<string, string>();
    for (const r of prevRows) prevLatest.set(r.skill_id, r.status); // آخرین ردیف هر مهارت
    const masteryConfirmed = ids.filter((id) => {
      const item = bySkill.get(id)!;
      return item.status === 'mastered' && prevLatest.get(id) === 'mastered';
    }).length;

    const sessionId = crypto.randomUUID();
    const occurredAt = iso();
    const mastered = [...bySkill.values()].filter((v) => v.status === 'mastered').length;
    const withHelp = [...bySkill.values()].filter((v) => v.status === 'with_help').length;
    const notYet = bySkill.size - mastered - withHelp;

    const focus = parseText(input.focus, OT_FOCUS_MAX);
    const summaryText = parseText(input.summary, OT_SUMMARY_MAX);
    const homework = parseText(input.homework, OT_HOMEWORK_MAX);

    const payload: Record<string, { value: string; label: string }> = {};
    if (focus) payload.focus = { value: focus, label: 'حیطه‌های تمرکز' };
    if (summaryText) payload.summary = { value: summaryText, label: 'خلاصهٔ جلسه' };
    if (homework) payload.homework = { value: homework, label: 'تمرین خانگی' };

    let timelineSummary = focus
      ? `جلسهٔ کاردرمانی ذهنی — ${bySkill.size} مهارت ثبت شد (${mastered} بلد، ${withHelp} با کمک، ${notYet} هنوز نه) — تمرکز: ${focus}`
      : `جلسهٔ کاردرمانی ذهنی — ${bySkill.size} مهارت ثبت شد (${mastered} بلد، ${withHelp} با کمک، ${notYet} هنوز نه)`;
    if (masteryConfirmed > 0) timelineSummary += ` — ${masteryConfirmed} تسلط دوجلسه‌ای تأیید شد`;

    const typeRow = await db.queryOne<EventTypeRow>(
      `SELECT id, key FROM case_event_types WHERE key = ? AND active = 1`,
      [OT_SESSION_EVENT_KEY]
    );

    await db.transaction(async (tx) => {
      for (const [skillId, v] of bySkill) {
        await tx.execute(
          `INSERT INTO ot_progress (id, student_id, skill_id, status, note, prompt_level, session_id, appointment_id, staff_id, occurred_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [crypto.randomUUID(), studentId, skillId, v.status, v.note, v.promptLevel, sessionId, input.appointmentId ?? null, actor.staffId, occurredAt, iso()]
        );
      }
      if (typeRow) {
        await tx.execute(
          `INSERT INTO case_events (id, event_type_id, student_id, staff_id, appointment_id, occurred_at,
                                    status, payload, analysis, summary, fill_token, fill_expires_at, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, NULL, ?, NULL, NULL, ?, ?, ?)`,
          [
            crypto.randomUUID(),
            typeRow.id,
            studentId,
            actor.staffId,
            input.appointmentId ?? null,
            occurredAt,
            JSON.stringify(payload),
            timelineSummary.slice(0, 300),
            actor.staffId,
            iso(),
            iso()
          ]
        );
      }
      await audit.logInTransaction(tx, {
        actorId: actor.staffId,
        action: 'ot.session.saved',
        resourceType: 'student',
        resourceId: studentId,
        changes: {
          session_id: { from: null, to: sessionId },
          skills: { from: null, to: bySkill.size }
        }
      });
    });

    log.info('ot session saved', { studentId, sessionId, skills: bySkill.size, masteryConfirmed });
    return { sessionId, saved: bySkill.size, masteryConfirmed, summary: timelineSummary };
  }

  async function setNeeds(studentId: string, input: NeedsSummaryInput, actor: AuthContext): Promise<NeedsSummaryResult> {
    const student = await loadStudent(studentId);
    assertCanWrite(student, actor);

    const needTypeLabel = NEED_TYPE_LABELS[input.needType];
    if (!needTypeLabel) throw new ValidationError('نیاز ویژهٔ انتخابی معتبر نیست');

    const secondary = input.protocolSecondary ?? null;
    if (secondary === input.protocol) throw new ValidationError('پروتکل پشتیبان نمی‌تواند با پروتکل اصلی یکی باشد');

    const protocolLabel = STUDENT_PROTOCOL_LABELS[input.protocol];
    const secondaryLabel = secondary ? STUDENT_PROTOCOL_LABELS[secondary] : null;

    const evidence = parseText(input.evidence, NEEDS_TEXT_MAX);
    const goals = parseText(input.goals, NEEDS_TEXT_MAX);
    const sessionPlan = parseText(input.sessionPlan, NEEDS_PLAN_MAX);

    const payload: Record<string, { value: string; label: string }> = {};
    if (evidence) payload.evidence = { value: evidence, label: 'خلاصهٔ شواهد' };
    payload.need_type = { value: needTypeLabel, label: 'نیاز ویژهٔ نهایی' };
    payload.protocol = { value: protocolLabel, label: 'پروتکل مداخله' };
    if (secondaryLabel) payload.protocol_secondary = { value: secondaryLabel, label: 'پروتکل پشتیبان' };
    if (goals) payload.goals = { value: goals, label: 'اهداف کوچک دورهٔ اول' };
    if (sessionPlan) payload.session_plan = { value: sessionPlan, label: 'برنامهٔ جلسات' };

    const gatesSnapshot = await computeGates(student);
    payload.gates_snapshot = {
      value: JSON.stringify({
        phase: gatesSnapshot.phase,
        gates: gatesSnapshot.gates.map((g) => ({ key: g.key, done: g.done, detail: g.detail })),
        otCoverage: gatesSnapshot.otCoverage
      }),
      label: 'وضعیت گیت‌ها هنگام ثبت'
    };

    const typeRow = await db.queryOne<EventTypeRow>(
      `SELECT id, key FROM case_event_types WHERE key = ? AND active = 1`,
      [NEEDS_EVENT_KEY]
    );

    const eventId = crypto.randomUUID();
    const occurredAt = iso();
    const timelineSummary = `نتیجهٔ نیاز ویژه: ${needTypeLabel} — پروتکل: ${protocolLabel}${secondaryLabel ? ` (پشتیبان: ${secondaryLabel})` : ''}`;

    await db.transaction(async (tx) => {
      if (typeRow) {
        await tx.execute(
          `INSERT INTO case_events (id, event_type_id, student_id, staff_id, appointment_id, occurred_at,
                                    status, payload, analysis, summary, fill_token, fill_expires_at, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, NULL, ?, 'completed', ?, NULL, ?, NULL, NULL, ?, ?, ?)`,
          [eventId, typeRow.id, studentId, actor.staffId, occurredAt, JSON.stringify(payload), timelineSummary.slice(0, 300), actor.staffId, iso(), iso()]
        );
      }
      await tx.execute(`UPDATE students SET protocol = ? WHERE id = ?`, [input.protocol, studentId]);
      const prevStatus = student.case_status ?? null;
      if (prevStatus !== 'in_intervention' && prevStatus !== 'monitoring' && prevStatus !== 'archived') {
        await tx.execute(`UPDATE students SET case_status = 'in_intervention' WHERE id = ?`, [studentId]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'student.case_status.changed',
          resourceType: 'student',
          resourceId: studentId,
          changes: { case_status: { from: prevStatus, to: 'in_intervention' } }
        });
      }
      await audit.logInTransaction(tx, {
        actorId: actor.staffId,
        action: 'student.protocol.changed',
        resourceType: 'student',
        resourceId: studentId,
        changes: {
          protocol: { from: student.protocol, to: input.protocol },
          need_type: { from: null, to: input.needType }
        }
      });
    });

    log.info('needs recorded — protocol active', { studentId, protocol: input.protocol, needType: input.needType });
    return { protocol: input.protocol, needType: input.needType, needTypeLabel, eventId: typeRow ? eventId : '' };
  }

  return { getGates, getOtProfile, getOtProgress, saveOtSession, setNeeds };
}

export type OtEngineService = ReturnType<typeof createOtEngineService>;

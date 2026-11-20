import type { AuthContext } from '@core/shared';
import { schoolYearOfYmd, tehranTodayYmd } from '@core/shared';
import { NotFoundError, ValidationError } from '@core/errors';
import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type {
  IqEvaluation,
  IqEvaluationInput,
  ScreeningDayCount,
  ScreeningEntry,
  ScreeningEntryInput,
  ScreeningEntryPatch,
  ScreeningListFilters,
  ScreeningListResult,
  ScreeningRangeSummary,
  ScreeningTagCount
} from './types';
import { SCREENING_PREDEFINED_TAGS, SCREENING_REFERRAL_TAGS } from './types';
import {
  SCREENING_LIMITS,
  applyTagFilter,
  hasPredefinedTag,
  mergeTags,
  normalizeName,
  parseEntryInput,
  sanitizeTags,
  screeningStats
} from './pure';

const KIND_BY_LABEL = new Map<string, ScreeningTagCount['kind']>(
  SCREENING_PREDEFINED_TAGS.map((t) => [t.label, t.kind as ScreeningTagCount['kind']])
);

const REFERRAL_SET = new Set<string>(SCREENING_REFERRAL_TAGS);

function parseTagsJson(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

/* ─── نتیجهٔ ارزیابی تخصصی (v1.27.33) ─── */
interface IqEvalRow {
  id: string;
  screening_entry_id: string;
  result_option: number;
  autism_referral: number;
  leiter_score: number | null;
  wechsler_verbal_score: number | null;
  goodenough_score: number | null;
  clinical_observations: string | null;
  academic_year: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

const IQ_EVAL_BY_ENTRY = `SELECT * FROM iq_evaluations WHERE screening_entry_id = ? AND deleted_at IS NULL`;

function iqRowToEval(r: IqEvalRow): IqEvaluation {
  return {
    id: r.id,
    screeningEntryId: r.screening_entry_id,
    resultOption: r.result_option,
    autismReferral: r.autism_referral === 1,
    leiterScore: r.leiter_score,
    wechslerVerbalScore: r.wechsler_verbal_score,
    goodenoughScore: r.goodenough_score,
    clinicalObservations: r.clinical_observations,
    academicYear: r.academic_year,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

export interface ScreeningDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
}

interface Row {
  id: string;
  name: string;
  day: string;
  tags: string;
  birth_date: string | null;      /* ۱.۲۵.۵۰ */
  readiness_score: number | null; /* ۱.۲۵.۵۰ */
  note: string | null;            /* ۱.۲۵.۵۷ */
  iq_referral_handled_at: string | null; /* ۱.۲۷.۳۳ */
  created_by: string;
  created_at: string;
  updated_at: string;
  creator_name: string | null;
}

function rowToEntry(r: Row): ScreeningEntry {
  return {
    id: r.id,
    name: r.name,
    day: r.day,
    tags: parseTagsJson(r.tags),
    birthDate: r.birth_date ?? null,
    readinessScore: r.readiness_score ?? null,
    note: r.note ?? null,
    iqHandledAt: r.iq_referral_handled_at ?? null,
    createdBy: r.created_by,
    creatorName: r.creator_name,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

const SELECT = `
  SELECT e.id, e.name, e.day, e.tags, e.birth_date, e.readiness_score, e.note,
         e.iq_referral_handled_at, e.created_by, e.created_at, e.updated_at,
         st.full_name AS creator_name
    FROM screening_entries e
    LEFT JOIN staff st ON st.id = e.created_by
`;

function nowSql(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

export function createScreeningService(deps: ScreeningDeps) {
  const { db, audit, logger } = deps;
  const log = logger.child('screening');

  async function getEntryRow(id: string): Promise<Row> {
    const row = await db.queryOne<Row>(`${SELECT} WHERE e.id = ?`, [id]);
    if (!row) throw new NotFoundError('سنجش');
    return row;
  }

  return {
    async list(filters: ScreeningListFilters): Promise<ScreeningListResult> {
      const where: string[] = [];
      const params: string[] = [];
      if (filters.from) {
        where.push('e.day >= ?');
        params.push(filters.from);
      }
      if (filters.to) {
        where.push('e.day <= ?');
        params.push(filters.to);
      }
      if (filters.q) {
        where.push('e.name LIKE ?');
        params.push(`%${filters.q}%`);
      }

      const rows = await db.query<Row>(
        `${SELECT}${where.length ? ` WHERE ${where.join(' AND ')}` : ''}
          ORDER BY e.day DESC, e.created_at DESC, e.id DESC
          LIMIT ${SCREENING_LIMITS.listTake}`,
        params
      );

      let entries = rows.map(rowToEntry);
      if (filters.tags && filters.tags.length > 0) {
        entries = applyTagFilter(entries, filters.tags);
      }
      return { entries, stats: screeningStats(entries) };
    },

    async tagsSummary(): Promise<ScreeningTagCount[]> {
      const tagRows = await db.query<{ tags: string }>(
        `SELECT tags FROM screening_entries LIMIT 5000`,
        []
      );
      const counts = new Map<string, number>();
      for (const r of tagRows) {
        for (const t of parseTagsJson(r.tags)) {
          counts.set(t, (counts.get(t) ?? 0) + 1);
        }
      }
      return [...counts.entries()]
        .map(([label, count]) => ({ label, count, kind: KIND_BY_LABEL.get(label) ?? 'custom' }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'fa'));
    },

    async dayCounts(from: string, to: string): Promise<ScreeningDayCount[]> {
      const rows = await db.query<{ day: string; count: number }>(
        `SELECT day, COUNT(*) AS count
           FROM screening_entries
          WHERE day >= ? AND day <= ?
          GROUP BY day
          ORDER BY day`,
        [from, to]
      );
      return rows.map((r) => ({ day: r.day, count: r.count }));
    },

    async rangeSummary(from: string, to: string): Promise<ScreeningRangeSummary> {
      const rows = await db.query<{ tags: string }>(
        `SELECT tags FROM screening_entries WHERE day >= ? AND day <= ?`,
        [from, to]
      );
      const summary: ScreeningRangeSummary = { total: rows.length, normal: 0, referrals: 0, noCoop: 0, noReg: 0 };
      for (const r of rows) {
        const tags = parseTagsJson(r.tags);
        if (!hasPredefinedTag(tags)) {
          summary.normal += 1;
          continue;
        }
        if (tags.some((t) => REFERRAL_SET.has(t))) summary.referrals += 1;
        if (tags.includes('عدم همکاری')) summary.noCoop += 1;
        if (tags.includes('نداشتن ثبت‌نام')) summary.noReg += 1;
      }
      return summary;
    },

    async create(
      input: ScreeningEntryInput,
      actor: AuthContext
    ): Promise<ScreeningEntry> {
      const parsed = parseEntryInput(input.name);
      const name = normalizeName(parsed.name);
      if (!name) {
        throw new ValidationError('نام و فامیل باید بین ۲ تا ۸۰ نویسه باشد');
      }
      const tags = mergeTags(parsed, sanitizeTags(input.tags));
      const day = /^\d{4}-\d{2}-\d{2}$/.test(input.day ?? '') ? (input.day as string) : tehranTodayYmd();
      /* ۱.۲۵.۵۰ — فیلدهای اختیاری؛ الگوی تاریخ مثل day (فقط قالب معتبر می‌نشیند) */
      const birthDate = /^\d{4}-\d{2}-\d{2}$/.test(input.birth_date ?? '') ? (input.birth_date as string) : null;
      const readinessScore =
        typeof input.readiness_score === 'number' && Number.isFinite(input.readiness_score)
          ? Math.trunc(input.readiness_score)
          : null;
      /* ۱.۲۵.۵۷ — توضیحات اختیاری؛ خالی/undefined = null */
      const note =
        typeof input.note === 'string' && input.note.trim().length > 0 ? input.note.trim() : null;
      const id = crypto.randomUUID();
      const now = nowSql();

      await db.transaction(async (tx) => {
        await tx.execute(
          `INSERT INTO screening_entries
             (id, name, day, tags, birth_date, readiness_score, note, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, name, day, JSON.stringify(tags), birthDate, readinessScore, note, actor.staffId, now, now]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'screening.create',
          resourceType: 'screening_entry',
          resourceId: id,
          changes: {
            day: { from: null, to: day },
            tags: { from: null, to: tags.join('|') },
            birth_date: { from: null, to: birthDate },
            readiness_score: { from: null, to: readinessScore },
            note: { from: null, to: note }
          }
        });
      });

      log.info('screening.created', { day, tagged: tags.length > 0, hasBirth: birthDate !== null });
      return rowToEntry(await getEntryRow(id));
    },

    async update(
      id: string,
      input: ScreeningEntryPatch,
      actor: AuthContext
    ): Promise<ScreeningEntry> {
      const current = await getEntryRow(id);
      const prevTags = (JSON.parse(current.tags) as string[]) ?? [];

      let name = current.name;
      let parsed = parseEntryInput('');
      if (input.name !== undefined) {
        parsed = parseEntryInput(input.name);
        name = normalizeName(parsed.name);
        if (!name) {
          throw new ValidationError('نام و فامیل باید بین ۲ تا ۸۰ نویسه باشد');
        }
      }
      const tags =
        input.tags !== undefined || parsed.hashTags.length > 0
          ? mergeTags(parsed, sanitizeTags(input.tags ?? []))
          : prevTags;
      /* ۱.۲۵.۵۰ — فیلدهای اختیاری: undefined = دست‌نخورده؛ null = پاک‌کردن */
      const birthDate =
        input.birth_date === undefined
          ? current.birth_date
          : /^\d{4}-\d{2}-\d{2}$/.test(input.birth_date ?? '')
            ? (input.birth_date as string)
            : null;
      const readinessScore =
        input.readiness_score === undefined
          ? current.readiness_score
          : typeof input.readiness_score === 'number' && Number.isFinite(input.readiness_score)
            ? Math.trunc(input.readiness_score)
            : null;
      /* ۱.۲۵.۵۷ — توضیحات: undefined = دست‌نخورده؛ خالی/null = پاک‌کردن */
      const note =
        input.note === undefined
          ? current.note
          : typeof input.note === 'string' && input.note.trim().length > 0
            ? input.note.trim()
            : null;

      await db.transaction(async (tx) => {
        await tx.execute(
          `UPDATE screening_entries
             SET name = ?, tags = ?, birth_date = ?, readiness_score = ?, note = ?, updated_at = ?
           WHERE id = ?`,
          [name, JSON.stringify(tags), birthDate, readinessScore, note, nowSql(), id]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'screening.update',
          resourceType: 'screening_entry',
          resourceId: id,
          changes: {
            tags: { from: prevTags.join('|'), to: tags.join('|') },
            birth_date: { from: current.birth_date, to: birthDate },
            readiness_score: { from: current.readiness_score, to: readinessScore },
            note: { from: current.note, to: note }
          }
        });
      });

      log.info('screening.updated', { id });
      return rowToEntry(await getEntryRow(id));
    },

    async remove(id: string, actor: AuthContext): Promise<void> {
      const current = await getEntryRow(id);
      await db.transaction(async (tx) => {
        await tx.execute(`DELETE FROM screening_entries WHERE id = ?`, [id]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'screening.delete',
          resourceType: 'screening_entry',
          resourceId: id,
          changes: {
            name: { from: current.name.slice(0, 60), to: null },
            day: { from: current.day, to: null }
          }
        });
      });
      log.info('screening.deleted', { id });
    },

    /* ─── نتیجهٔ ارزیابی تخصصی «اظهارنظر و پیشنهاد» (v1.27.33 — خواست کارفرما) ───
     * یک ردیف فعال به‌ازای هر سنجش — ثبت دوباره = ویرایش همان ردیف (upsert)؛ ثبت نتیجه،
     * ردیف را از پیگیری فعال خارج می‌کند (iq_referral_handled_at) و سال تحصیلی از day سنجش می‌نشیند. */
    async getIqEvaluation(entryId: string): Promise<IqEvaluation | null> {
      const row = await db.queryOne<IqEvalRow>(IQ_EVAL_BY_ENTRY, [entryId]);
      return row ? iqRowToEval(row) : null;
    },

    async saveIqEvaluation(entryId: string, input: IqEvaluationInput, actor: AuthContext): Promise<IqEvaluation> {
      const entry = await getEntryRow(entryId);
      const existing = await db.queryOne<IqEvalRow>(IQ_EVAL_BY_ENTRY, [entryId]);
      /* نمرات: فقط عدد متناهی می‌نشیند — هیچ محاسبه یا تفسیری انجام نمی‌شود؛ متن مشاهدات عیناً ذخیره می‌شود */
      const score = (v: number | null | undefined): number | null =>
        typeof v === 'number' && Number.isFinite(v) ? v : null;
      const observations =
        typeof input.clinical_observations === 'string' && input.clinical_observations.length > 0
          ? input.clinical_observations
          : null;
      const autism = input.autism_referral ? 1 : 0;
      const academicYear = String(schoolYearOfYmd(entry.day));
      const id = existing?.id ?? crypto.randomUUID();
      const now = nowSql();

      await db.transaction(async (tx) => {
        if (existing) {
          await tx.execute(
            `UPDATE iq_evaluations
               SET result_option = ?, autism_referral = ?, leiter_score = ?, wechsler_verbal_score = ?,
                   goodenough_score = ?, clinical_observations = ?, academic_year = ?, updated_at = ?
             WHERE id = ?`,
            [
              input.result_option,
              autism,
              score(input.leiter_score),
              score(input.wechsler_verbal_score),
              score(input.goodenough_score),
              observations,
              academicYear,
              now,
              id
            ]
          );
        } else {
          await tx.execute(
            `INSERT INTO iq_evaluations
               (id, screening_entry_id, result_option, autism_referral, leiter_score, wechsler_verbal_score,
                goodenough_score, clinical_observations, academic_year, created_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              id,
              entryId,
              input.result_option,
              autism,
              score(input.leiter_score),
              score(input.wechsler_verbal_score),
              score(input.goodenough_score),
              observations,
              academicYear,
              actor.staffId,
              now,
              now
            ]
          );
        }
        await tx.execute(
          `UPDATE screening_entries SET iq_referral_handled_at = COALESCE(iq_referral_handled_at, ?) WHERE id = ?`,
          [now, entryId]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'screening.iq_result',
          resourceType: 'screening_entry',
          resourceId: entryId,
          changes: {
            result_option: { from: existing?.result_option ?? null, to: input.result_option },
            autism_referral: { from: existing?.autism_referral ?? null, to: autism }
          }
        });
      });
      log.info('screening.iq_result.saved', { entryId, edited: Boolean(existing) });
      const saved = await db.queryOne<IqEvalRow>(IQ_EVAL_BY_ENTRY, [entryId]);
      if (!saved) throw new NotFoundError('نتیجهٔ ارزیابی');
      return iqRowToEval(saved);
    }
  };
}

export type ScreeningService = ReturnType<typeof createScreeningService>;

import type { AuthContext } from '@core/shared';
import { tehranTodayYmd } from '@core/shared';
import { NotFoundError, ValidationError } from '@core/errors';
import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type {
  ScreeningDayCount,
  ScreeningEntry,
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
    createdBy: r.created_by,
    creatorName: r.creator_name,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

const SELECT = `
  SELECT e.id, e.name, e.day, e.tags, e.created_by, e.created_at, e.updated_at,
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
      input: { name: string; tags: string[]; day?: string },
      actor: AuthContext
    ): Promise<ScreeningEntry> {
      const parsed = parseEntryInput(input.name);
      const name = normalizeName(parsed.name);
      if (!name) {
        throw new ValidationError('نام و فامیل باید بین ۲ تا ۸۰ نویسه باشد');
      }
      const tags = mergeTags(parsed, sanitizeTags(input.tags));
      const day = /^\d{4}-\d{2}-\d{2}$/.test(input.day ?? '') ? (input.day as string) : tehranTodayYmd();
      const id = crypto.randomUUID();
      const now = nowSql();

      await db.transaction(async (tx) => {
        await tx.execute(
          `INSERT INTO screening_entries (id, name, day, tags, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [id, name, day, JSON.stringify(tags), actor.staffId, now, now]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'screening.create',
          resourceType: 'screening_entry',
          resourceId: id,
          changes: {
            day: { from: null, to: day },
            tags: { from: null, to: tags.join('|') }
          }
        });
      });

      log.info('screening.created', { day, tagged: tags.length > 0 });
      return rowToEntry(await getEntryRow(id));
    },

    async update(
      id: string,
      input: { name?: string; tags?: string[] },
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

      await db.transaction(async (tx) => {
        await tx.execute(
          `UPDATE screening_entries SET name = ?, tags = ?, updated_at = ? WHERE id = ?`,
          [name, JSON.stringify(tags), nowSql(), id]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'screening.update',
          resourceType: 'screening_entry',
          resourceId: id,
          changes: {
            tags: { from: prevTags.join('|'), to: tags.join('|') }
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
    }
  };
}

export type ScreeningService = ReturnType<typeof createScreeningService>;

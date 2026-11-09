
import { ConflictError, NotFoundError, ValidationError } from '@core/errors';
import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type {
  ContentKind,
  ContentListOpts,
  ContentListResult,
  NetworkContentRecord,
  NetworkContentService,
  NewContentInput,
  ContentStatus
} from './types';
import { CONTENT_KINDS, CONTENT_KIND_LABELS } from './types';

// ─── کتابخانهٔ شبکه: سرویس ───
// گیت‌های طلایی این دامنه:
//  • ردیف‌های origin='cp' فقط از مسیر سینک (UPSERT با پیشوند cp-content-) می‌آیند؛
//    هیچ متدی اینجا روی آن‌ها می‌نویسد.
//  • «همرسانی» = صف محلی؛ push واقعی به CP در ماژول cp-content با کلید نود انجام می‌شود.

const TITLE_MAX = 150;
const SUMMARY_MAX = 600;
const BODY_MAX = 8000;
const TAG_MAX = 40;
const TAGS_MAX = 8;
const LIST_PAGE_MAX = 100;

interface ContentRow {
  id: string;
  kind: string;
  title: string;
  summary: string | null;
  body: string | null;
  tags: string | null;
  origin: string;
  status: string;
  source_center: string | null;
  source_ref: string | null;
  active: number;
  submitted_at: string | null;
  synced_at: string | null;
  created_by: string | null;
  created_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

function normalizeTag(raw: string): string {
  return String(raw ?? '')
    .replace(/[\u200c\u200f\u200e]/g, '\u200c')
    .replace(/\s+/g, ' ')
    .trim();
}

function isContentKind(v: unknown): v is ContentKind {
  return typeof v === 'string' && (CONTENT_KINDS as readonly string[]).includes(v);
}

function mapRow(row: ContentRow): NetworkContentRecord {
  let tags: string[] = [];
  const parsed = row.tags ? (JSON.parse(row.tags) as unknown) : null;
  if (Array.isArray(parsed)) tags = parsed.filter((t): t is string => typeof t === 'string');
  const kind = isContentKind(row.kind) ? row.kind : 'exercise';
  return {
    id: row.id,
    kind,
    kindLabel: CONTENT_KIND_LABELS[kind],
    title: row.title,
    summary: row.summary ?? '',
    body: row.body ?? '',
    tags,
    origin: row.origin === 'cp' ? 'cp' : 'local',
    status: row.status as ContentStatus,
    sourceCenter: row.source_center,
    sourceRef: row.source_ref,
    active: row.active === 1,
    submittedAt: row.submitted_at,
    syncedAt: row.synced_at,
    createdBy: row.created_by,
    createdByName: row.created_by_name ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const SELECT_COLS = `nc.id, nc.kind, nc.title, nc.summary, nc.body, nc.tags, nc.origin, nc.status,
  nc.source_center, nc.source_ref, nc.active, nc.submitted_at, nc.synced_at, nc.created_by,
  s.full_name AS created_by_name, nc.created_at, nc.updated_at`;

export function createNetworkContentService(deps: { db: DbClient; audit: AuditWriter }): NetworkContentService {
  const db = deps.db;
  const audit = deps.audit;

  async function counts(): Promise<{ local: number; network: number }> {
    const rows = await db.query<{ origin: string; c: number }>(
      `SELECT origin, COUNT(*) AS c FROM network_content
       WHERE active = 1 AND status NOT IN ('withdrawn') GROUP BY origin`
    );
    let local = 0;
    let network = 0;
    for (const r of rows) {
      if (r.origin === 'cp') network += r.c;
      else local += r.c;
    }
    return { local, network };
  }

  async function getById(id: string): Promise<NetworkContentRecord | null> {
    const row = await db.queryOne<ContentRow>(
      `SELECT ${SELECT_COLS} FROM network_content nc
       LEFT JOIN staff s ON s.id = nc.created_by WHERE nc.id = ?`,
      [id]
    );
    return row ? mapRow(row) : null;
  }

  async function requireEditable(id: string): Promise<NetworkContentRecord> {
    const rec = await getById(id);
    if (!rec) throw new NotFoundError('محتوای شبکه');
    if (rec.origin !== 'local') {
      // ردیف‌های CP فقط از مسیر سینک می‌آیند — هیچ ویرایش محلی مجاز نیست
      throw new ConflictError('این آیتم از کنترل‌پلین آمده و در مرکز قابل تغییر نیست');
    }
    return rec;
  }

  return {
    async list(opts: ContentListOpts): Promise<ContentListResult> {
      const limit = Math.min(Math.max(1, Math.floor(opts.limit) || 20), LIST_PAGE_MAX);
      const offset = Math.max(0, Math.floor(opts.offset) || 0);
      const where: string[] = [];
      const params: unknown[] = [];
      if (opts.origin === 'cp') where.push(`nc.origin = 'cp' AND nc.active = 1`);
      else if (opts.origin === 'local') where.push(`nc.origin = 'local' AND nc.status != 'withdrawn'`);
      if (opts.kind && isContentKind(opts.kind)) {
        where.push('nc.kind = ?');
        params.push(opts.kind);
      }
      if (opts.q && opts.q.trim()) {
        where.push('(nc.title LIKE ? OR nc.summary LIKE ?)');
        const like = `%${opts.q.trim()}%`;
        params.push(like, like);
      }
      const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
      const rows = await db.query<ContentRow>(
        `SELECT ${SELECT_COLS} FROM network_content nc
         LEFT JOIN staff s ON s.id = nc.created_by
         ${whereSql}
         ORDER BY nc.updated_at DESC, nc.created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, limit + 1, offset]
      );
      const hasMore = rows.length > limit;
      return {
        items: rows.slice(0, limit).map(mapRow),
        hasMore,
        counts: await counts()
      };
    },

    async get(id: string): Promise<NetworkContentRecord | null> {
      return getById(id);
    },

    async create(actor: { id: string }, input: NewContentInput): Promise<NetworkContentRecord> {
      const title = String(input.title ?? '').trim();
      if (title.length < 2 || title.length > TITLE_MAX) {
        throw new ValidationError(`عنوان باید بین ۲ تا ${TITLE_MAX} نویسه باشد`);
      }
      const summary = String(input.summary ?? '').trim();
      if (summary.length > SUMMARY_MAX) throw new ValidationError(`خلاصه حداکثر ${SUMMARY_MAX} نویسه است`);
      const body = String(input.body ?? '').trim();
      if (body.length > BODY_MAX) throw new ValidationError(`محتوا حداکثر ${BODY_MAX} نویسه است`);
      if (!isContentKind(input.kind)) throw new ValidationError('نوع محتوا نامعتبر است');
      const tags = (Array.isArray(input.tags) ? input.tags : [])
        .map(normalizeTag)
        .filter((t) => t.length >= 2 && t.length <= TAG_MAX)
        .slice(0, TAGS_MAX);
      const uniqueTags = [...new Set(tags)];

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const status: ContentStatus = input.queueNow ? 'queued' : 'draft';
      await db.execute(
        `INSERT INTO network_content
           (id, kind, title, summary, body, tags, origin, status, source_ref, active,
            submitted_at, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'local', ?, ?, 1, ?, ?, ?, ?)`,
        [
          id,
          input.kind,
          title,
          summary,
          body,
          JSON.stringify(uniqueTags),
          status,
          input.sourceRef ?? null,
          input.queueNow ? now : null,
          actor.id,
          now,
          now
        ]
      );
      await audit.log({
        actorId: actor.id,
        action: 'network_content.create',
        resourceType: 'network_content',
        resourceId: id,
        changes: { kind: { from: null, to: input.kind }, status: { from: null, to: status } }
      });
      const rec = await getById(id);
      if (!rec) throw new NotFoundError('محتوای شبکه');
      return rec;
    },

    async queue(actor: { id: string }, id: string): Promise<NetworkContentRecord> {
      const rec = await requireEditable(id);
      if (rec.status !== 'draft' && rec.status !== 'withdrawn') {
        throw new ConflictError('فقط پیش‌نویس یا کنارگذاشته را می‌توان به صف همرسانی فرستاد');
      }
      const now = new Date().toISOString();
      await db.execute(
        `UPDATE network_content SET status = 'queued', submitted_at = ?, updated_at = ? WHERE id = ?`,
        [now, now, id]
      );
      await audit.log({
        actorId: actor.id,
        action: 'network_content.queue',
        resourceType: 'network_content',
        resourceId: id,
        changes: { status: { from: rec.status, to: 'queued' } }
      });
      const next = await getById(id);
      if (!next) throw new NotFoundError('محتوای شبکه');
      return next;
    },

    async withdraw(actor: { id: string }, id: string): Promise<NetworkContentRecord> {
      const rec = await requireEditable(id);
      if (rec.status !== 'queued' && rec.status !== 'submitted' && rec.status !== 'draft') {
        throw new ConflictError('این آیتم قابل کنارگذاری نیست');
      }
      const now = new Date().toISOString();
      await db.execute(
        `UPDATE network_content SET status = 'withdrawn', updated_at = ? WHERE id = ?`,
        [now, id]
      );
      await audit.log({
        actorId: actor.id,
        action: 'network_content.withdraw',
        resourceType: 'network_content',
        resourceId: id,
        changes: { status: { from: rec.status, to: 'withdrawn' } }
      });
      const next = await getById(id);
      if (!next) throw new NotFoundError('محتوای شبکه');
      return next;
    }
  };
}

import type { AuthContext, ClearbookPlanStatus } from '@core/shared';
import {
  ALLOWED_FILE_MIME_TYPES,
  CLEARBOOK_ATTACHMENTS_PER_ENTRY_MAX,
  CLEARBOOK_ENTRY_PAGE_MAX,
  CLEARBOOK_ENTRY_PAGE_SIZE,
  CLEARBOOK_FILES_PER_UPLOAD_MAX,
  MAX_EXERCISE_PANEL_FILE_BYTES,
  MAX_EXERCISE_UPLOAD_CHUNK_BYTES,
  faDigits
} from '@core/shared';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@core/errors';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { DbClient } from '@core/db';
import type { ObjectStore } from '@core/storage';
import { sanitizeFilename } from '@domain/exercise-bank/pure';
import {
  buildSeedPlans,
  dedupeTags,
  escapeLike,
  schoolYearOfYmd,
  normalizeTag,
  shiftYmdByJalaliYears
} from './pure';
import type {
  ClearbookAttachmentMeta,
  ClearbookEntryRecord,
  ClearbookEntryListOpts,
  ClearbookFileBytesInput,
  ClearbookNewEntryInput,
  ClearbookNewPlanInput,
  ClearbookPlanRecord,
  ClearbookService,
  ClearbookUpdateEntryInput,
  ClearbookUpdatePlanInput
} from './types';

// ─── m188 — کلر بوک مرکز: سرویس ───

interface EntryRow {
  id: string;
  plan_id: string | null;
  title: string;
  body: string;
  event_date: string;
  created_by: string;
  created_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

interface AttachmentRow {
  id: string;
  entry_id: string;
  file_key: string;
  file_name: string;
  file_mime: string;
  file_size: number;
  kind: 'image' | 'doc';
  caption: string | null;
  created_at: string;
}

interface PlanRow {
  id: string;
  title: string;
  admin_actions: string;
  center_actions: string;
  from_date: string;
  to_date: string | null;
  status: string;
  tag: string | null;
  sort_order: number;
  created_by: string;
  created_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

const ENTRY_COLS = `e.id, e.plan_id, e.title, e.body, e.event_date, e.created_by,
       s.full_name AS created_by_name, e.created_at, e.updated_at`;

const PLAN_COLS = `p.id, p.title, p.admin_actions, p.center_actions, p.from_date, p.to_date,
       p.status, p.tag, p.sort_order, p.created_by, s.full_name AS created_by_name,
       p.created_at, p.updated_at`;

function concatSegments(segments: Uint8Array[]): Uint8Array {
  if (segments.length === 1) return segments[0];
  const total = segments.reduce((n, s) => n + s.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const s of segments) {
    out.set(s, off);
    off += s.length;
  }
  return out;
}

function bytesToBase64Str(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function sizeLimitMessage(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  const label = mb >= 1 ? `${faDigits(String(Math.round(mb)))} مگابایت` : `${faDigits(String(Math.round(bytes / 1024)))} کیلوبایت`;
  return `حجم فایل بیش از ${label} است`;
}

export interface ClearbookDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
  storage: ObjectStore;
}

export function createClearbookService(deps: ClearbookDeps): ClearbookService {
  const { db, audit, logger, storage } = deps;
  const log = logger.child('clearbook');

  // کلر بوک کاملاً دفتر مرکز است — خواندن و نوشتن فقط مدیر/منشی
  function assertOffice(actor: AuthContext): void {
    if (actor.role !== 'manager' && actor.role !== 'secretary') {
      throw new ForbiddenError('کلر بوک فقط برای دفتر مرکز (مدیر/منشی) فعال است');
    }
  }

  // ─── ردیف‌به‌رکورد ───

  function rowToEntry(row: EntryRow, tags: string[], attachments: ClearbookAttachmentMeta[]): ClearbookEntryRecord {
    return {
      id: row.id,
      planId: row.plan_id,
      title: row.title,
      body: row.body ?? '',
      eventDate: row.event_date,
      tags,
      attachments,
      createdByName: row.created_by_name ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  function rowToPlan(row: PlanRow, evidence: ClearbookPlanRecord['evidence']): ClearbookPlanRecord {
    return {
      id: row.id,
      title: row.title,
      adminActions: row.admin_actions ?? '',
      centerActions: row.center_actions ?? '',
      fromDate: row.from_date,
      toDate: row.to_date,
      status: (row.status as ClearbookPlanStatus) ?? 'planned',
      tag: row.tag,
      sortOrder: row.sort_order,
      evidence,
      createdByName: row.created_by_name ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async function tagsOfEntries(entryIds: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (entryIds.length === 0) return map;
    const ph = entryIds.map(() => '?').join(', ');
    const rows = await db.query<{ entry_id: string; tag: string }>(
      `SELECT entry_id, tag FROM clearbook_entry_tags WHERE entry_id IN (${ph}) ORDER BY rowid`,
      entryIds
    );
    for (const r of rows) {
      const list = map.get(r.entry_id) ?? [];
      list.push(r.tag);
      map.set(r.entry_id, list);
    }
    return map;
  }

  async function attachmentsOfEntries(entryIds: string[]): Promise<Map<string, ClearbookAttachmentMeta[]>> {
    const map = new Map<string, ClearbookAttachmentMeta[]>();
    if (entryIds.length === 0) return map;
    const ph = entryIds.map(() => '?').join(', ');
    const rows = await db.query<AttachmentRow>(
      `SELECT id, entry_id, file_key, file_name, file_mime, file_size, kind, caption, created_at
         FROM clearbook_attachments WHERE entry_id IN (${ph}) ORDER BY created_at, rowid`,
      entryIds
    );
    for (const r of rows) {
      const list = map.get(r.entry_id) ?? [];
      list.push({ id: r.id, filename: r.file_name, mime: r.file_mime, size: r.file_size, kind: r.kind, caption: r.caption });
      map.set(r.entry_id, list);
    }
    return map;
  }

  async function getEntryRow(id: string): Promise<EntryRow | null> {
    return db.queryOne<EntryRow>(
      `SELECT ${ENTRY_COLS} FROM clearbook_entries e JOIN staff s ON s.id = e.created_by WHERE e.id = ?`,
      [id]
    );
  }

  async function getPlanRow(id: string): Promise<PlanRow | null> {
    return db.queryOne<PlanRow>(
      `SELECT ${PLAN_COLS} FROM clearbook_plans p JOIN staff s ON s.id = p.created_by WHERE p.id = ?`,
      [id]
    );
  }

  async function getEntryRecord(id: string): Promise<ClearbookEntryRecord | null> {
    const row = await getEntryRow(id);
    if (!row) return null;
    const [tags, atts] = await Promise.all([tagsOfEntries([id]), attachmentsOfEntries([id])]);
    return rowToEntry(row, tags.get(id) ?? [], atts.get(id) ?? []);
  }

  async function getPlanRecord(row: PlanRow): Promise<ClearbookPlanRecord> {
    const countRow = await db.queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM clearbook_entries WHERE plan_id = ?`,
      [row.id]
    );
    const thumbRows = await db.query<{ file_id: string; entry_id: string }>(
      `SELECT a.id AS file_id, a2.id AS entry_id
         FROM clearbook_attachments a
         JOIN clearbook_entries a2 ON a2.id = a.entry_id
        WHERE a2.plan_id = ? AND a.kind = 'image'
        ORDER BY a.created_at DESC, a.rowid DESC
        LIMIT 3`,
      [row.id]
    );
    return rowToPlan(row, { count: countRow?.n ?? 0, thumbs: thumbRows.map((t) => ({ entryId: t.entry_id, fileId: t.file_id })) });
  }

  // ─── اعتبارسنجی فایل ───

  function validatePrepared(file: { filename: string; mimeType: string; size: number }): { filename: string; mime: string; kind: 'image' | 'doc' } {
    const mime = String(file.mimeType ?? '').toLowerCase();
    if (!(ALLOWED_FILE_MIME_TYPES as readonly string[]).includes(mime)) {
      throw new ValidationError('نوع فایل مجاز نیست — فقط تصویر (JPG/PNG/WebP) و سند (PDF/Word/Excel/متن)');
    }
    const filename = sanitizeFilename(file.filename);
    if (!filename) throw new ValidationError('نام فایل نامعتبر است');
    if (!Number.isFinite(file.size) || file.size <= 0) throw new ValidationError('محتوای فایل خالی است');
    if (file.size > Math.min(storage.maxObjectBytes, MAX_EXERCISE_PANEL_FILE_BYTES)) {
      throw new ValidationError(sizeLimitMessage(MAX_EXERCISE_PANEL_FILE_BYTES));
    }
    return { filename, mime, kind: mime.startsWith('image/') ? 'image' : 'doc' };
  }

  async function assertEntryExists(id: string): Promise<EntryRow> {
    const row = await getEntryRow(id);
    if (!row) throw new NotFoundError('رویداد کلر بوک');
    return row;
  }

  async function assertAttachment(entryId: string, fileId: string): Promise<AttachmentRow> {
    const att = await db.queryOne<AttachmentRow>(
      `SELECT id, entry_id, file_key, file_name, file_mime, file_size, kind, caption, created_at
         FROM clearbook_attachments WHERE id = ? AND entry_id = ?`,
      [fileId, entryId]
    );
    if (!att) throw new NotFoundError('فایل رویداد');
    return att;
  }

  async function assertAttachmentCount(entryId: string, adding: number): Promise<void> {
    const countRow = await db.queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM clearbook_attachments WHERE entry_id = ?`,
      [entryId]
    );
    if ((countRow?.n ?? 0) + adding > CLEARBOOK_ATTACHMENTS_PER_ENTRY_MAX) {
      throw new ValidationError(`حداکثر ${CLEARBOOK_ATTACHMENTS_PER_ENTRY_MAX} فایل برای هر رویداد`);
    }
  }

  function assertPlanRange(fromDate: string, toDate: string | null): void {
    if (toDate && toDate < fromDate) throw new ValidationError('بازهٔ زمانی فاز نامعتبر است — «تا» نباید قبل از «از» باشد');
  }

  return {
    // ─── رویدادها ───

    async listEntries(opts) {
      const limit = Math.min(Math.max(1, opts.limit || CLEARBOOK_ENTRY_PAGE_SIZE), CLEARBOOK_ENTRY_PAGE_MAX);
      const where: string[] = [];
      const params: unknown[] = [];
      if (opts.from) { where.push('e.event_date >= ?'); params.push(opts.from); }
      if (opts.to) { where.push('e.event_date <= ?'); params.push(opts.to); }
      if (opts.planId) { where.push('e.plan_id = ?'); params.push(opts.planId); }
      if (opts.tag) {
        where.push(`EXISTS (SELECT 1 FROM clearbook_entry_tags t WHERE t.entry_id = e.id AND t.tag = ?)`);
        params.push(normalizeTag(opts.tag));
      }
      if (opts.q) {
        const like = `%${escapeLike(opts.q)}%`;
        where.push(`(e.title LIKE ? ESCAPE '\\' OR e.body LIKE ? ESCAPE '\\')`);
        params.push(like, like);
      }
      const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
      const rows = await db.query<EntryRow>(
        `SELECT ${ENTRY_COLS} FROM clearbook_entries e JOIN staff s ON s.id = e.created_by
          ${whereSql}
          ORDER BY e.event_date ASC, e.created_at ASC, e.id ASC
          LIMIT ${limit + 1} OFFSET ${Math.max(0, opts.offset)}`,
        params
      );
      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit);
      const ids = page.map((r) => r.id);
      const [tagMap, attMap] = await Promise.all([tagsOfEntries(ids), attachmentsOfEntries(ids)]);
      return {
        items: page.map((r) => rowToEntry(r, tagMap.get(r.id) ?? [], attMap.get(r.id) ?? [])),
        hasMore
      };
    },

    async getEntry(id) {
      return getEntryRecord(id);
    },

    async createEntry(input, actor) {
      assertOffice(actor);
      const id = crypto.randomUUID();
      const nowIso = new Date().toISOString();
      const tags = dedupeTags(input.tags ?? []);
      if (input.planId) await assertPlanExists(input.planId);
      await db.transaction(async (tx) => {
        await tx.execute(
          `INSERT INTO clearbook_entries (id, plan_id, title, body, event_date, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, input.planId, input.title, input.body ?? '', input.eventDate, actor.staffId, nowIso, nowIso]
        );
        for (const tag of tags) {
          await tx.execute(`INSERT INTO clearbook_entry_tags (entry_id, tag) VALUES (?, ?)`, [id, tag]);
        }
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'clearbook.entry.create',
          resourceType: 'clearbook_entry',
          resourceId: id,
          changes: {
            title: { from: null, to: input.title },
            event_date: { from: null, to: input.eventDate },
            plan_id: { from: null, to: input.planId },
            tags: { from: null, to: tags.length }
          }
        });
      });
      log.info('clearbook.entry.created', { id });
      return (await getEntryRecord(id)) as ClearbookEntryRecord;
    },

    async updateEntry(id, input, actor) {
      assertOffice(actor);
      const existingRow = await assertEntryExists(id);
      const existing = (await getEntryRecord(id)) as ClearbookEntryRecord;
      const next = {
        title: input.title ?? existing.title,
        body: input.body ?? existing.body,
        eventDate: input.eventDate ?? existing.eventDate,
        planId: input.planId !== undefined ? input.planId : existing.planId
      };
      if (next.planId) await assertPlanExists(next.planId);
      const tags = input.tags !== undefined ? dedupeTags(input.tags) : null;
      await db.transaction(async (tx) => {
        await tx.execute(
          `UPDATE clearbook_entries SET title = ?, body = ?, event_date = ?, plan_id = ?, updated_at = ? WHERE id = ?`,
          [next.title, next.body, next.eventDate, next.planId, new Date().toISOString(), id]
        );
        if (tags) {
          await tx.execute(`DELETE FROM clearbook_entry_tags WHERE entry_id = ?`, [id]);
          for (const tag of tags) {
            await tx.execute(`INSERT INTO clearbook_entry_tags (entry_id, tag) VALUES (?, ?)`, [id, tag]);
          }
        }
        const changes: Record<string, { from: unknown; to: unknown }> = {
          title: { from: existing.title, to: next.title },
          event_date: { from: existing.eventDate, to: next.eventDate },
          plan_id: { from: existing.planId, to: next.planId }
        };
        if (tags) changes.tags = { from: existing.tags.length, to: tags.length };
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'clearbook.entry.update',
          resourceType: 'clearbook_entry',
          resourceId: id,
          changes
        });
      });
      log.info('clearbook.entry.updated', { id });
      return (await getEntryRecord(id)) as ClearbookEntryRecord;
    },

    async removeEntry(id, actor) {
      assertOffice(actor);
      const existing = (await assertEntryExists(id)) as EntryRow;
      const attRows = await db.query<{ file_key: string }>(
        `SELECT file_key FROM clearbook_attachments WHERE entry_id = ?`,
        [id]
      );
      await db.transaction(async (tx) => {
        await tx.execute(`DELETE FROM clearbook_entry_tags WHERE entry_id = ?`, [id]);
        await tx.execute(`DELETE FROM clearbook_attachments WHERE entry_id = ?`, [id]);
        await tx.execute(`DELETE FROM clearbook_entries WHERE id = ?`, [id]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'clearbook.entry.delete',
          resourceType: 'clearbook_entry',
          resourceId: id,
          changes: { title: { from: existing.title, to: null } }
        });
      });
      for (const k of attRows) {
        await storage.delete(k.file_key).catch((err: unknown) => {
          log.warn('clearbook.attachment.storage.delete.failed', { key: k.file_key, error: err instanceof Error ? err.message : String(err) });
        });
      }
      log.info('clearbook.entry.deleted', { id, attachments: attRows.length });
      return { id };
    },

    // ─── پیوست‌ها ───

    async addFiles(id, files, actor) {
      assertOffice(actor);
      await assertEntryExists(id);
      if (!Array.isArray(files) || files.length === 0) throw new ValidationError('حداقل یک فایل لازم است');
      if (files.length > CLEARBOOK_FILES_PER_UPLOAD_MAX) {
        throw new ValidationError(`حداکثر ${CLEARBOOK_FILES_PER_UPLOAD_MAX} فایل در هر بار بارگذاری`);
      }
      await assertAttachmentCount(id, files.length);
      const preparedList = files.map((f) => ({ ...validatePrepared(f), segments: f.segments, size: f.size }));
      for (const prepared of preparedList) {
        const attId = crypto.randomUUID();
        const key = `clearbook/${id}/${attId}`;
        if (storage.putSegments) {
          await storage.putSegments(key, prepared.segments);
        } else {
          await storage.put(key, concatSegments(prepared.segments), prepared.mime);
        }
        await db.transaction(async (tx) => {
          await tx.execute(
            `INSERT INTO clearbook_attachments (id, entry_id, file_key, file_name, file_mime, file_size, kind)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [attId, id, key, prepared.filename, prepared.mime, prepared.size, prepared.kind]
          );
          await audit.logInTransaction(tx, {
            actorId: actor.staffId,
            action: 'clearbook.entry.files.added',
            resourceType: 'clearbook_entry',
            resourceId: id,
            changes: {
              filename: { from: null, to: prepared.filename },
              kind: { from: null, to: prepared.kind },
              sizeBytes: { from: null, to: prepared.size }
            }
          });
        });
      }
      log.info('clearbook.entry.files.added', { id, count: preparedList.length });
      return (await getEntryRecord(id)) as ClearbookEntryRecord;
    },

    async beginChunkedUpload(id, input, actor) {
      assertOffice(actor);
      await assertEntryExists(id);
      const prepared = validatePrepared({ filename: input.filename, mimeType: input.mimeType, size: input.size });
      await assertAttachmentCount(id, 1);
      const attId = crypto.randomUUID();
      const key = `clearbook/${id}/${attId}`;
      await db.transaction(async (tx) => {
        await tx.execute(
          `INSERT INTO clearbook_attachments (id, entry_id, file_key, file_name, file_mime, file_size, kind)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [attId, id, key, prepared.filename, prepared.mime, input.size, prepared.kind]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'clearbook.entry.file.upload.began',
          resourceType: 'clearbook_entry',
          resourceId: id,
          changes: { filename: { from: null, to: prepared.filename }, sizeBytes: { from: null, to: input.size } }
        });
      });
      log.info('clearbook.entry.file.upload.began', { id, fileId: attId, size: input.size });
      return { fileId: attId };
    },

    async putUploadChunk(id, fileId, seq, bytes, actor) {
      assertOffice(actor);
      const att = await assertAttachment(id, fileId);
      if (!Number.isInteger(seq) || seq < 0 || seq > 1024) throw new ValidationError('شماره تکه نامعتبر است');
      if (bytes.length === 0) throw new ValidationError('تکهٔ خالی');
      if (bytes.length > MAX_EXERCISE_UPLOAD_CHUNK_BYTES) throw new ValidationError('حجم تکه بیش از حد مجاز است');
      await db.execute(
        `INSERT INTO exercise_file_chunks (key, seq, content) VALUES (?, ?, ?)
         ON CONFLICT(key, seq) DO UPDATE SET content = excluded.content`,
        [att.file_key, seq, bytesToBase64Str(bytes)]
      );
      return { received: bytes.length };
    },

    async completeChunkedUpload(id, fileId, actor) {
      assertOffice(actor);
      const att = await assertAttachment(id, fileId);
      const stat = await db.queryOne<{ n: number; bl: number | null }>(
        `SELECT COUNT(*) AS n, SUM(length(content)) AS bl FROM exercise_file_chunks WHERE key = ?`,
        [att.file_key]
      );
      const b64Len = (n: number): number => Math.ceil(n / 3) * 4;
      const fullChunks = Math.floor(att.file_size / MAX_EXERCISE_UPLOAD_CHUNK_BYTES);
      const rest = att.file_size % MAX_EXERCISE_UPLOAD_CHUNK_BYTES;
      const expectedRows = rest === 0 ? fullChunks : fullChunks + 1;
      const expectedB64 = fullChunks * b64Len(MAX_EXERCISE_UPLOAD_CHUNK_BYTES) + (rest === 0 ? 0 : b64Len(rest));
      if (!stat || stat.n !== expectedRows || (stat.bl ?? 0) !== expectedB64) {
        throw new ConflictError('بارگذاری ناقص است — تکه‌ها با حجم اعلام‌شده هم‌خوان نیستند؛ دوباره تلاش کنید یا فایل را حذف کنید');
      }
      await db.transaction(async (tx) => {
        await tx.execute(`UPDATE clearbook_entries SET updated_at = datetime('now') WHERE id = ?`, [id]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'clearbook.entry.files.added',
          resourceType: 'clearbook_entry',
          resourceId: id,
          changes: { filename: { from: null, to: att.file_name }, sizeBytes: { from: null, to: att.file_size }, mode: { from: null, to: 'chunked' } }
        });
      });
      log.info('clearbook.entry.files.chunked.completed', { id, fileId, size: att.file_size });
      return (await getEntryRecord(id)) as ClearbookEntryRecord;
    },

    async updateAttachmentCaption(id, fileId, caption, actor) {
      assertOffice(actor);
      await assertEntryExists(id);
      const att = await assertAttachment(id, fileId);
      await db.transaction(async (tx) => {
        await tx.execute(`UPDATE clearbook_attachments SET caption = ? WHERE id = ?`, [caption, att.id]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'clearbook.entry.file.caption',
          resourceType: 'clearbook_entry',
          resourceId: id,
          changes: { caption: { from: att.caption, to: caption } }
        });
      });
      log.info('clearbook.entry.file.caption', { id, fileId });
      return (await getEntryRecord(id)) as ClearbookEntryRecord;
    },

    async deleteAttachment(id, fileId, actor) {
      assertOffice(actor);
      await assertEntryExists(id);
      const att = await assertAttachment(id, fileId);
      await storage.delete(att.file_key).catch((err: unknown) => {
        log.warn('clearbook.attachment.storage.delete.failed', { key: att.file_key, error: err instanceof Error ? err.message : String(err) });
      });
      await db.transaction(async (tx) => {
        await tx.execute(`DELETE FROM clearbook_attachments WHERE id = ?`, [att.id]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'clearbook.entry.file.deleted',
          resourceType: 'clearbook_entry',
          resourceId: id,
          changes: { filename: { from: att.file_name, to: null }, sizeBytes: { from: att.file_size, to: null } }
        });
      });
      log.info('clearbook.entry.file.deleted', { id, fileId });
      return (await getEntryRecord(id)) as ClearbookEntryRecord;
    },

    async getAttachmentFile(id, fileId) {
      const att = await assertAttachment(id, fileId);
      const obj = await storage.get(att.file_key);
      if (!obj) return null;
      return { bytes: obj.bytes, filename: att.file_name, mime: att.file_mime ?? obj.mime, kind: att.kind };
    },

    // ─── تقویم اجرایی ───

    async listPlans() {
      const rows = await db.query<PlanRow>(
        `SELECT ${PLAN_COLS} FROM clearbook_plans p JOIN staff s ON s.id = p.created_by
          ORDER BY p.from_date ASC, p.sort_order ASC, p.created_at ASC`
      );
      return Promise.all(rows.map((r) => getPlanRecord(r)));
    },

    async createPlan(input, actor) {
      assertOffice(actor);
      assertPlanRange(input.fromDate, input.toDate);
      const id = crypto.randomUUID();
      await db.transaction(async (tx) => {
        await tx.execute(
          `INSERT INTO clearbook_plans (id, title, admin_actions, center_actions, from_date, to_date, status, tag, sort_order, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT MAX(sort_order) + 1 FROM clearbook_plans), 0), ?, datetime('now'), datetime('now'))`,
          [id, input.title, input.adminActions ?? '', input.centerActions ?? '', input.fromDate, input.toDate, input.status, input.tag, actor.staffId]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'clearbook.plan.create',
          resourceType: 'clearbook_plan',
          resourceId: id,
          changes: {
            title: { from: null, to: input.title },
            from_date: { from: null, to: input.fromDate },
            status: { from: null, to: input.status }
          }
        });
      });
      log.info('clearbook.plan.created', { id });
      const row = await getPlanRow(id);
      return getPlanRecord(row as PlanRow);
    },

    async updatePlan(id, input, actor) {
      assertOffice(actor);
      const existingRow = await getPlanRow(id);
      if (!existingRow) throw new NotFoundError('فاز تقویم اجرایی');
      const next = {
        title: input.title ?? existingRow.title,
        adminActions: input.adminActions ?? existingRow.admin_actions,
        centerActions: input.centerActions ?? existingRow.center_actions,
        fromDate: input.fromDate ?? existingRow.from_date,
        toDate: input.toDate !== undefined ? input.toDate : existingRow.to_date,
        status: input.status ?? existingRow.status,
        tag: input.tag !== undefined ? input.tag : existingRow.tag
      };
      assertPlanRange(next.fromDate, next.toDate);
      await db.transaction(async (tx) => {
        await tx.execute(
          `UPDATE clearbook_plans SET title = ?, admin_actions = ?, center_actions = ?, from_date = ?, to_date = ?, status = ?, tag = ?, updated_at = datetime('now')
           WHERE id = ?`,
          [next.title, next.adminActions, next.centerActions, next.fromDate, next.toDate, next.status, next.tag, id]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'clearbook.plan.update',
          resourceType: 'clearbook_plan',
          resourceId: id,
          changes: {
            title: { from: existingRow.title, to: next.title },
            status: { from: existingRow.status, to: next.status },
            from_date: { from: existingRow.from_date, to: next.fromDate }
          }
        });
      });
      log.info('clearbook.plan.updated', { id });
      const row = await getPlanRow(id);
      return getPlanRecord(row as PlanRow);
    },

    async removePlan(id, actor) {
      assertOffice(actor);
      const existingRow = await getPlanRow(id);
      if (!existingRow) throw new NotFoundError('فاز تقویم اجرایی');
      await db.transaction(async (tx) => {
        await tx.execute(`UPDATE clearbook_entries SET plan_id = NULL WHERE plan_id = ?`, [id]);
        await tx.execute(`DELETE FROM clearbook_plans WHERE id = ?`, [id]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'clearbook.plan.delete',
          resourceType: 'clearbook_plan',
          resourceId: id,
          changes: { title: { from: existingRow.title, to: null } }
        });
      });
      log.info('clearbook.plan.deleted', { id });
      return { id };
    },

    async reorderPlans(ids, actor) {
      assertOffice(actor);
      await db.transaction(async (tx) => {
        for (let i = 0; i < ids.length; i += 1) {
          await tx.execute(`UPDATE clearbook_plans SET sort_order = ?, updated_at = datetime('now') WHERE id = ?`, [i, ids[i]]);
        }
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'clearbook.plan.reorder',
          resourceType: 'clearbook_plan',
          resourceId: ids[0],
          changes: { count: { from: null, to: ids.length } }
        });
      });
      log.info('clearbook.plan.reordered', { count: ids.length });
      return { count: ids.length };
    },

    async seedTemplate(startYear, actor) {
      assertOffice(actor);
      const seeds = buildSeedPlans(startYear);
      const windowFrom = seeds.reduce((min, s) => (s.from_date < min ? s.from_date : min), seeds[0].from_date);
      const windowTo = seeds.reduce((max, s) => (s.to_date && s.to_date > max ? s.to_date : max), seeds[0].from_date);
      const overlap = await db.queryOne<{ n: number }>(
        `SELECT COUNT(*) AS n FROM clearbook_plans WHERE from_date <= ? AND COALESCE(to_date, from_date) >= ?`,
        [windowTo, windowFrom]
      );
      if ((overlap?.n ?? 0) > 0) {
        throw new ConflictError('برای این بازه قبلاً تقویم اجرایی ثبت شده است — ابتدا فازهای همان بازه را حذف کنید');
      }
      await db.transaction(async (tx) => {
        for (const seed of seeds) {
          const id = crypto.randomUUID();
          await tx.execute(
            `INSERT INTO clearbook_plans (id, title, admin_actions, center_actions, from_date, to_date, status, tag, sort_order, created_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, 'planned', ?, ?, ?, datetime('now'), datetime('now'))`,
            [id, seed.title, seed.admin_actions, seed.center_actions, seed.from_date, seed.to_date, seed.tag, seed.sort_order, actor.staffId]
          );
        }
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'clearbook.plan.seed',
          resourceType: 'clearbook_plan',
          resourceId: windowFrom,
          changes: { start_year: { from: null, to: startYear }, count: { from: null, to: seeds.length } }
        });
      });
      log.info('clearbook.plan.seeded', { startYear, count: seeds.length });
      return { count: seeds.length };
    },

    async copyYear(fromYear, toYear, actor) {
      assertOffice(actor);
      const all = await db.query<PlanRow>(`SELECT id, from_date FROM clearbook_plans`);
      const source = all.filter((r) => schoolYearOfYmd(r.from_date) === fromYear);
      if (source.length === 0) throw new ValidationError('برای سال تحصیلی مبدأ فازی ثبت نشده است');
      const targetExists = all.some((r) => schoolYearOfYmd(r.from_date) === toYear);
      if (targetExists) throw new ConflictError('سال مقصد از قبل تقویم دارد — ابتدا فازهای آن سال را حذف کنید');
      const shift = toYear - fromYear;
      const sourceIds = source.map((r) => r.id);
      const ph = sourceIds.map(() => '?').join(', ');
      const rows = await db.query<PlanRow>(
        `SELECT ${PLAN_COLS} FROM clearbook_plans p JOIN staff s ON s.id = p.created_by WHERE p.id IN (${ph})`,
        sourceIds
      );
      await db.transaction(async (tx) => {
        for (const row of rows) {
          const id = crypto.randomUUID();
          await tx.execute(
            `INSERT INTO clearbook_plans (id, title, admin_actions, center_actions, from_date, to_date, status, tag, sort_order, created_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, 'planned', ?, ?, ?, datetime('now'), datetime('now'))`,
            [
              id,
              row.title,
              row.admin_actions,
              row.center_actions,
              shiftYmdByJalaliYears(row.from_date, shift),
              row.to_date ? shiftYmdByJalaliYears(row.to_date, shift) : null,
              row.tag,
              row.sort_order,
              actor.staffId
            ]
          );
        }
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'clearbook.plan.copy',
          resourceType: 'clearbook_plan',
          resourceId: rows[0].id,
          changes: { from_year: { from: null, to: fromYear }, to_year: { from: null, to: toYear }, count: { from: null, to: rows.length } }
        });
      });
      log.info('clearbook.plan.copied', { fromYear, toYear, count: rows.length });
      return { count: rows.length };
    },

    // ─── فیلترها ───

    async listTags() {
      const rows = await db.query<{ tag: string; n: number }>(
        `SELECT tag, COUNT(*) AS n FROM clearbook_entry_tags GROUP BY tag ORDER BY n DESC, tag ASC LIMIT 60`
      );
      return rows.map((r) => ({ tag: r.tag, count: r.n }));
    },

    async listYears() {
      const rows = await db.query<{ d: string }>(
        `SELECT event_date AS d FROM clearbook_entries UNION SELECT from_date AS d FROM clearbook_plans`
      );
      const years = new Set<number>();
      for (const r of rows) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(r.d)) years.add(schoolYearOfYmd(r.d));
      }
      return [...years].sort((a, b) => b - a);
    }
  };

  async function assertPlanExists(planId: string): Promise<void> {
    const row = await db.queryOne<{ id: string }>(`SELECT id FROM clearbook_plans WHERE id = ?`, [planId]);
    if (!row) throw new NotFoundError('فاز تقویم اجرایی');
  }
}

import type { AuthContext, KnowledgeCategory, KnowledgeFileMeta, KnowledgeRecord } from '@core/shared';
import { MAX_EXERCISE_ATTACHMENT_COUNT, MAX_EXERCISE_FILES_PER_UPLOAD, MAX_EXERCISE_UPLOAD_CHUNK_BYTES } from '@core/shared';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@core/errors';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { DbClient } from '@core/db';
import type { ObjectStore } from '@core/storage';
import { sanitizeFilename, validateExerciseFileBytes } from '@domain/exercise-bank/pure';
import type { KnowledgeService, NewKnowledgeInput, UpdateKnowledgeInput } from './types';

interface KnowledgeRow {
  id: string;
  title: string;
  body: string;
  category: string;
  pinned: number;
  published: number;
  created_by: string;
  created_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

interface AttachmentRow {
  id: string;
  knowledge_id: string;
  file_key: string;
  file_name: string;
  file_mime: string;
  file_size: number;
  created_at: string;
}

function rowToRecord(row: KnowledgeRow, attachments: KnowledgeFileMeta[]): KnowledgeRecord {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    category: row.category as KnowledgeCategory,
    pinned: row.pinned === 1,
    published: row.published === 1,
    attachments,
    createdBy: row.created_by,
    createdByName: row.created_by_name ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const SELECT_COLS = `k.id, k.title, k.body, k.category, k.pinned, k.published,
       k.created_by, s.full_name AS created_by_name, k.created_at, k.updated_at`;

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

export interface KnowledgeDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
  storage: ObjectStore;
}

export function createKnowledgeService(deps: KnowledgeDeps): KnowledgeService {
  const { db, audit, logger, storage } = deps;
  const log = logger.child('knowledge');

  function assertWriter(actor: AuthContext): void {
    if (actor.role !== 'manager' && actor.role !== 'secretary') {
      throw new ForbiddenError('مدیریت دانش‌افزایی فقط برای دفتر (مدیر/منشی) مجاز است');
    }
  }

  async function getById(id: string): Promise<KnowledgeRecord | null> {
    const row = await db.queryOne<KnowledgeRow>(
      `SELECT ${SELECT_COLS} FROM knowledge_items k JOIN staff s ON s.id = k.created_by WHERE k.id = ?`,
      [id]
    );
    if (!row) return null;
    return rowToRecord(row, await attachmentsOf(id));
  }

  async function attachmentsOf(itemId: string): Promise<KnowledgeFileMeta[]> {
    const rows = await db.query<AttachmentRow>(
      `SELECT id, knowledge_id, file_key, file_name, file_mime, file_size, created_at
         FROM knowledge_attachments WHERE knowledge_id = ? ORDER BY created_at, rowid`,
      [itemId]
    );
    return rows.map((r) => ({ id: r.id, filename: r.file_name, mime: r.file_mime, size: r.file_size }));
  }

  async function attachmentsForItems(itemIds: string[]): Promise<Map<string, KnowledgeFileMeta[]>> {
    const map = new Map<string, KnowledgeFileMeta[]>();
    if (itemIds.length === 0) return map;
    const placeholders = itemIds.map(() => '?').join(', ');
    const rows = await db.query<AttachmentRow>(
      `SELECT id, knowledge_id, file_key, file_name, file_mime, file_size, created_at
         FROM knowledge_attachments
        WHERE knowledge_id IN (${placeholders})
        ORDER BY created_at, rowid`,
      itemIds
    );
    for (const r of rows) {
      const list = map.get(r.knowledge_id) ?? [];
      list.push({ id: r.id, filename: r.file_name, mime: r.file_mime, size: r.file_size });
      map.set(r.knowledge_id, list);
    }
    return map;
  }

  async function assertAttachment(itemId: string, fileId: string): Promise<AttachmentRow> {
    const att = await db.queryOne<AttachmentRow>(
      `SELECT id, knowledge_id, file_key, file_name, file_mime, file_size, created_at
         FROM knowledge_attachments WHERE id = ? AND knowledge_id = ?`,
      [fileId, itemId]
    );
    if (!att) throw new NotFoundError('فایل مقاله');
    return att;
  }

  function validatePrepared(file: { filename: string; mimeType: string; size: number }): { filename: string; mime: string } {
    const verdict = validateExerciseFileBytes(file, storage.maxObjectBytes);
    if (!verdict.ok) throw new ValidationError(verdict.reason);
    return { filename: sanitizeFilename(file.filename), mime: file.mimeType.toLowerCase() };
  }

  async function assertAttachmentCount(itemId: string, adding: number): Promise<void> {
    const countRow = await db.queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM knowledge_attachments WHERE knowledge_id = ?`,
      [itemId]
    );
    if ((countRow?.n ?? 0) + adding > MAX_EXERCISE_ATTACHMENT_COUNT) {
      throw new ValidationError(`حداکثر ${MAX_EXERCISE_ATTACHMENT_COUNT} فایل برای هر مقاله`);
    }
  }

  return {
    async listPublished() {
      const rows = await db.query<KnowledgeRow>(
        `SELECT ${SELECT_COLS} FROM knowledge_items k JOIN staff s ON s.id = k.created_by
          WHERE k.published = 1
          ORDER BY k.pinned DESC, k.created_at DESC
          LIMIT 30`
      );
      const attMap = await attachmentsForItems(rows.map((r) => r.id));
      return rows.map((r) => rowToRecord(r, attMap.get(r.id) ?? []));
    },

    async listAll() {
      const rows = await db.query<KnowledgeRow>(
        `SELECT ${SELECT_COLS} FROM knowledge_items k JOIN staff s ON s.id = k.created_by
          ORDER BY k.pinned DESC, k.created_at DESC
          LIMIT 200`
      );
      const attMap = await attachmentsForItems(rows.map((r) => r.id));
      return rows.map((r) => rowToRecord(r, attMap.get(r.id) ?? []));
    },

    async create(input, actor) {
      const id = crypto.randomUUID();
      const nowIso = new Date().toISOString();
      await db.transaction(async (tx) => {
        await tx.execute(
          `INSERT INTO knowledge_items (id, title, body, category, pinned, published, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, input.title, input.body, input.category, input.pinned ? 1 : 0, input.published ? 1 : 0, actor.staffId, nowIso, nowIso]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'knowledge.create',
          resourceType: 'knowledge',
          resourceId: id,
          changes: {
            title: { from: null, to: input.title },
            category: { from: null, to: input.category },
            published: { from: null, to: input.published ? 1 : 0 }
          }
        });
      });
      log.info('knowledge.created', { id });
      return (await getById(id)) as KnowledgeRecord;
    },

    async update(id, input, actor) {
      const existing = await getById(id);
      if (!existing) throw new NotFoundError('مقالهٔ دانش');

      const next = {
        title: input.title ?? existing.title,
        body: input.body ?? existing.body,
        category: input.category ?? existing.category,
        pinned: input.pinned ?? existing.pinned,
        published: input.published ?? existing.published
      };

      await db.transaction(async (tx) => {
        await tx.execute(
          `UPDATE knowledge_items
              SET title = ?, body = ?, category = ?, pinned = ?, published = ?, updated_at = ?
            WHERE id = ?`,
          [next.title, next.body, next.category, next.pinned ? 1 : 0, next.published ? 1 : 0, new Date().toISOString(), id]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'knowledge.update',
          resourceType: 'knowledge',
          resourceId: id,
          changes: {
            title: { from: existing.title, to: next.title },
            published: { from: existing.published ? 1 : 0, to: next.published ? 1 : 0 },
            pinned: { from: existing.pinned ? 1 : 0, to: next.pinned ? 1 : 0 }
          }
        });
      });
      log.info('knowledge.updated', { id });
      return (await getById(id)) as KnowledgeRecord;
    },

    async remove(id, actor) {
      const existing = await getById(id);
      if (!existing) throw new NotFoundError('مقالهٔ دانش');
      const attRows = await db.query<{ file_key: string }>(
        `SELECT file_key FROM knowledge_attachments WHERE knowledge_id = ?`,
        [id]
      );
      await db.transaction(async (tx) => {
        await tx.execute(`DELETE FROM knowledge_attachments WHERE knowledge_id = ?`, [id]);
        await tx.execute(`DELETE FROM knowledge_items WHERE id = ?`, [id]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'knowledge.delete',
          resourceType: 'knowledge',
          resourceId: id,
          changes: { title: { from: existing.title, to: null } }
        });
      });
      for (const k of attRows) {
        await storage.delete(k.file_key).catch((err: unknown) => {
          log.warn('knowledge.attachment.storage.delete.failed', { key: k.file_key, error: err instanceof Error ? err.message : String(err) });
        });
      }
      log.info('knowledge.deleted', { id, attachments: attRows.length });
      return { id };
    },

    async addFiles(id, files, actor) {
      assertWriter(actor);
      const existing = await getById(id);
      if (!existing) throw new NotFoundError('مقالهٔ دانش');
      if (!Array.isArray(files) || files.length === 0) throw new ValidationError('حداقل یک فایل لازم است');
      if (files.length > MAX_EXERCISE_FILES_PER_UPLOAD) {
        throw new ValidationError(`حداکثر ${MAX_EXERCISE_FILES_PER_UPLOAD} فایل در هر بار بارگذاری`);
      }
      await assertAttachmentCount(id, files.length);

      const preparedList = files.map((f) => ({ ...validatePrepared(f), segments: f.segments, size: f.size }));

      for (const prepared of preparedList) {
        const attId = crypto.randomUUID();
        const key = `knowledge/${id}/${attId}`;
        if (storage.putSegments) {
          await storage.putSegments(key, prepared.segments);
        } else {
          await storage.put(key, concatSegments(prepared.segments), prepared.mime);
        }
        await db.transaction(async (tx) => {
          await tx.execute(
            `INSERT INTO knowledge_attachments (id, knowledge_id, file_key, file_name, file_mime, file_size)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [attId, id, key, prepared.filename, prepared.mime, prepared.size]
          );
          await audit.logInTransaction(tx, {
            actorId: actor.staffId,
            action: 'knowledge.files.added',
            resourceType: 'knowledge',
            resourceId: id,
            changes: {
              filename: { from: null, to: prepared.filename },
              sizeBytes: { from: null, to: prepared.size }
            }
          });
        });
      }

      log.info('knowledge.files.added', { id, count: preparedList.length });
      return (await getById(id)) as KnowledgeRecord;
    },

    async beginChunkedUpload(id, input, actor) {
      assertWriter(actor);
      const existing = await getById(id);
      if (!existing) throw new NotFoundError('مقالهٔ دانش');
      const prepared = validatePrepared({ filename: input.filename, mimeType: input.mimeType, size: input.size });
      await assertAttachmentCount(id, 1);
      const attId = crypto.randomUUID();
      const key = `knowledge/${id}/${attId}`;
      await db.transaction(async (tx) => {
        await tx.execute(
          `INSERT INTO knowledge_attachments (id, knowledge_id, file_key, file_name, file_mime, file_size)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [attId, id, key, prepared.filename, prepared.mime, input.size]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'knowledge.file.upload.began',
          resourceType: 'knowledge',
          resourceId: id,
          changes: { filename: { from: null, to: prepared.filename }, sizeBytes: { from: null, to: input.size } }
        });
      });
      log.info('knowledge.file.upload.began', { id, fileId: attId, size: input.size });
      return { fileId: attId };
    },

    async putUploadChunk(id, fileId, seq, bytes, actor) {
      assertWriter(actor);
      const att = await assertAttachment(id, fileId);
      if (!Number.isInteger(seq) || seq < 0 || seq > 1024) throw new ValidationError('شماره تکه نامعتبر است');
      if (bytes.length === 0) throw new ValidationError('تکهٔ خالی');
      if (bytes.length > MAX_EXERCISE_UPLOAD_CHUNK_BYTES) {
        throw new ValidationError('حجم تکه بیش از حد مجاز است');
      }
      await db.execute(
        `INSERT INTO exercise_file_chunks (key, seq, content) VALUES (?, ?, ?)
         ON CONFLICT(key, seq) DO UPDATE SET content = excluded.content`,
        [att.file_key, seq, bytesToBase64Str(bytes)]
      );
      return { received: bytes.length };
    },

    async completeChunkedUpload(id, fileId, actor) {
      assertWriter(actor);
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
        await tx.execute(`UPDATE knowledge_items SET updated_at = datetime('now') WHERE id = ?`, [id]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'knowledge.files.added',
          resourceType: 'knowledge',
          resourceId: id,
          changes: { filename: { from: null, to: att.file_name }, sizeBytes: { from: null, to: att.file_size }, mode: { from: null, to: 'chunked' } }
        });
      });
      log.info('knowledge.files.chunked.completed', { id, fileId, size: att.file_size });
      return (await getById(id)) as KnowledgeRecord;
    },

    async deleteAttachment(id, fileId, actor) {
      assertWriter(actor);
      const existing = await getById(id);
      if (!existing) throw new NotFoundError('مقالهٔ دانش');
      const att = await assertAttachment(id, fileId);
      await storage.delete(att.file_key);
      await db.transaction(async (tx) => {
        await tx.execute(`DELETE FROM knowledge_attachments WHERE id = ?`, [att.id]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'knowledge.file.deleted',
          resourceType: 'knowledge',
          resourceId: id,
          changes: { filename: { from: att.file_name, to: null }, sizeBytes: { from: att.file_size, to: null } }
        });
      });
      log.info('knowledge.file.deleted', { id, fileId });
      return (await getById(id)) as KnowledgeRecord;
    },

    async getAttachmentFile(id, fileId) {
      const row = await db.queryOne<{ id: string }>(`SELECT id FROM knowledge_items WHERE id = ?`, [id]);
      if (!row) return null;
      const att = await db.queryOne<AttachmentRow>(
        `SELECT id, knowledge_id, file_key, file_name, file_mime, file_size
           FROM knowledge_attachments WHERE id = ? AND knowledge_id = ?`,
        [fileId, id]
      );
      if (!att) return null;
      const obj = await storage.get(att.file_key);
      if (!obj) return null;
      return { bytes: obj.bytes, filename: att.file_name, mime: att.file_mime ?? obj.mime };
    }
  };
}

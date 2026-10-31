import type { AuthContext } from '@core/shared';
import {
  ALLOWED_FILE_MIME_TYPES,
  MAX_EXERCISE_PANEL_FILE_BYTES,
  MAX_EXERCISE_UPLOAD_CHUNK_BYTES,
  faDigits
} from '@core/shared';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@core/errors';
import type { DocsDeps, DocCategory, DocFileBytesInput, DocFileMeta, DocListOpts, DocRecord, DocsService, NewDocInput, UpdateDocInput } from './types';
import { DOC_CATEGORIES } from './types';

// ─── نمون‌برگ‌ها و اسناد خام: سرویس ───
// مخزن فایل‌های اداری مرکز (بخشنامه، فرم، آیین‌نامه، گزارش، …)
// دسترسی نوشتن/خواندن فقط مدیر و منشی — گیت در routes و اینجا assertOffice

const DOCS_FILES_PER_UPLOAD_MAX = 10; // حداکثر فایل در هر بار بارگذاری
const DOCS_FILES_PER_DOC_MAX = 30; // حداکثر فایل روی هر سند
const TITLE_MAX = 150;
const DESCRIPTION_MAX = 4000;
const TAG_MAX = 40;
const TAGS_PER_DOC_MAX = 8;

interface DocRow {
  id: string;
  title: string;
  category: string;
  description: string;
  tags: string;
  created_by: string;
  created_by_name?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface FileRow {
  id: string;
  doc_id: string;
  file_key: string;
  file_name: string;
  file_mime: string;
  file_size: number;
  created_at: string;
}

const DOC_COLS = `d.id, d.title, d.category, d.description, d.tags, d.created_by,
       s.full_name AS created_by_name, d.created_at, d.updated_at, d.deleted_at`;

// ─── کمک‌های محلی دامنه (خودکفا — بدون وابستگی به دامنه‌های دیگر) ───

function normalizeTag(raw: string): string {
  return String(raw ?? '')
    .replace(/[\u200c\u200f\u200e]/g, '\u200c') // نیم‌فاصله و کاراکترهای جهت یکدست شود
    .replace(/\s+/g, ' ')
    .trim();
}

function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const norm = normalizeTag(t);
    if (norm.length < 2) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
  }
  return out.slice(0, TAGS_PER_DOC_MAX);
}

function escapeLike(raw: string): string {
  return String(raw ?? '').replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

function sanitizeFilename(raw: string): string {
  const base = String(raw ?? '').split(/[/\\]/).pop() ?? '';
  return base.replace(/\s+/g, ' ').trim().slice(0, 200);
}

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

function parseTagsColumn(raw: string): string[] {
  try {
    const arr = JSON.parse(raw ?? '[]');
    return Array.isArray(arr) ? arr.map((t) => String(t)).filter((t) => t.length > 0) : [];
  } catch {
    return [];
  }
}

export function createDocsService(deps: DocsDeps): DocsService {
  const { db, audit, logger, storage } = deps;
  const log = logger.child('docs');

  // نمون‌برگ‌ها فقط دفتر مرکز است — خواندن و نوشتن فقط مدیر/منشی
  function assertOffice(actor: AuthContext): void {
    if (actor.role !== 'manager' && actor.role !== 'secretary') {
      throw new ForbiddenError('نمون‌برگ‌ها و اسناد خام فقط برای دفتر مرکز (مدیر/منشی) فعال است');
    }
  }

  // ─── ردیف‌به‌رکورد ───

  function rowToRecord(row: DocRow, files: DocFileMeta[]): DocRecord {
    return {
      id: row.id,
      title: row.title,
      category: (DOC_CATEGORIES as readonly string[]).includes(row.category) ? (row.category as DocCategory) : 'other',
      description: row.description ?? '',
      tags: parseTagsColumn(row.tags),
      files,
      createdBy: row.created_by,
      createdByName: row.created_by_name ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async function filesOfDocs(docIds: string[]): Promise<Map<string, DocFileMeta[]>> {
    const map = new Map<string, DocFileMeta[]>();
    if (docIds.length === 0) return map;
    const ph = docIds.map(() => '?').join(', ');
    const rows = await db.query<FileRow>(
      `SELECT id, doc_id, file_key, file_name, file_mime, file_size, created_at
         FROM docs_files WHERE doc_id IN (${ph}) ORDER BY created_at, rowid`,
      docIds
    );
    for (const r of rows) {
      const list = map.get(r.doc_id) ?? [];
      list.push({ id: r.id, filename: r.file_name, mime: r.file_mime, size: r.file_size });
      map.set(r.doc_id, list);
    }
    return map;
  }

  async function getDocRow(id: string): Promise<DocRow | null> {
    return db.queryOne<DocRow>(
      `SELECT ${DOC_COLS} FROM docs d JOIN staff s ON s.id = d.created_by
        WHERE d.id = ? AND d.deleted_at IS NULL`,
      [id]
    );
  }

  async function getDocRecord(id: string): Promise<DocRecord | null> {
    const row = await getDocRow(id);
    if (!row) return null;
    const fileMap = await filesOfDocs([id]);
    return rowToRecord(row, fileMap.get(id) ?? []);
  }

  async function assertDocExists(id: string): Promise<DocRow> {
    const row = await getDocRow(id);
    if (!row) throw new NotFoundError('سند');
    return row;
  }

  async function assertFileRow(docId: string, fileId: string): Promise<FileRow> {
    const row = await db.queryOne<FileRow>(
      `SELECT id, doc_id, file_key, file_name, file_mime, file_size, created_at
         FROM docs_files WHERE id = ? AND doc_id = ?`,
      [fileId, docId]
    );
    if (!row) throw new NotFoundError('فایل سند');
    return row;
  }

  // ─── اعتبارسنجی ───

  function validateTitle(title: string): string {
    const t = String(title ?? '').replace(/\s+/g, ' ').trim();
    if (t.length < 2) throw new ValidationError('عنوان سند حداقل ۲ نویسه است');
    if (t.length > TITLE_MAX) throw new ValidationError(`عنوان سند حداکثر ${faDigits(TITLE_MAX)} نویسه است`);
    return t;
  }

  function validateCategory(category: string): DocCategory {
    if (!(DOC_CATEGORIES as readonly string[]).includes(category)) {
      throw new ValidationError('دستهٔ سند نامعتبر است');
    }
    return category as DocCategory;
  }

  function validateDescription(description: string): string {
    const d = String(description ?? '');
    if (d.length > DESCRIPTION_MAX) throw new ValidationError(`توضیح سند حداکثر ${faDigits(DESCRIPTION_MAX)} نویسه است`);
    return d;
  }

  function validatePrepared(file: { filename: string; mimeType: string; size: number }): { filename: string; mime: string } {
    const mime = String(file.mimeType ?? '').toLowerCase();
    if (!(ALLOWED_FILE_MIME_TYPES as readonly string[]).includes(mime)) {
      throw new ValidationError('نوع فایل مجاز نیست — فقط سند (PDF/Word/Excel/متن) و تصویر (JPG/PNG/WebP)');
    }
    const filename = sanitizeFilename(file.filename);
    if (!filename) throw new ValidationError('نام فایل نامعتبر است');
    if (!Number.isFinite(file.size) || file.size <= 0) throw new ValidationError('محتوای فایل خالی است');
    if (file.size > Math.min(storage.maxObjectBytes, MAX_EXERCISE_PANEL_FILE_BYTES)) {
      throw new ValidationError(sizeLimitMessage(MAX_EXERCISE_PANEL_FILE_BYTES));
    }
    return { filename, mime };
  }

  async function assertFileCount(docId: string, adding: number): Promise<void> {
    const countRow = await db.queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM docs_files WHERE doc_id = ?`,
      [docId]
    );
    if ((countRow?.n ?? 0) + adding > DOCS_FILES_PER_DOC_MAX) {
      throw new ValidationError(`حداکثر ${faDigits(DOCS_FILES_PER_DOC_MAX)} فایل برای هر سند`);
    }
  }

  return {
    // ─── اسناد ───

    async list(opts: DocListOpts) {
      const limit = Math.min(Math.max(1, opts.limit || 100), 200);
      const where: string[] = ['d.deleted_at IS NULL'];
      const params: unknown[] = [];
      if (opts.category) {
        where.push('d.category = ?');
        params.push(validateCategory(opts.category));
      }
      if (opts.q) {
        const like = `%${escapeLike(opts.q)}%`;
        where.push(`(d.title LIKE ? ESCAPE '\\' OR d.description LIKE ? ESCAPE '\\' OR d.tags LIKE ? ESCAPE '\\')`);
        params.push(like, like, like);
      }
      const rows = await db.query<DocRow>(
        `SELECT ${DOC_COLS} FROM docs d JOIN staff s ON s.id = d.created_by
          WHERE ${where.join(' AND ')}
          ORDER BY d.created_at DESC, d.id DESC
          LIMIT ${limit + 1} OFFSET ${Math.max(0, opts.offset)}`,
        params
      );
      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit);
      const fileMap = await filesOfDocs(page.map((r) => r.id));
      return {
        items: page.map((r) => rowToRecord(r, fileMap.get(r.id) ?? [])),
        hasMore
      };
    },

    async get(id: string) {
      return getDocRecord(id);
    },

    async create(input: NewDocInput, actor: AuthContext) {
      assertOffice(actor);
      const id = crypto.randomUUID();
      const nowIso = new Date().toISOString();
      const title = validateTitle(input.title);
      const category = validateCategory(input.category);
      const description = validateDescription(input.description);
      const tags = dedupeTags(input.tags ?? []);
      await db.transaction(async (tx) => {
        await tx.execute(
          `INSERT INTO docs (id, title, category, description, tags, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, title, category, description, JSON.stringify(tags), actor.staffId, nowIso, nowIso]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'docs.create',
          resourceType: 'doc',
          resourceId: id,
          changes: {
            title: { from: null, to: title },
            category: { from: null, to: category },
            tags: { from: null, to: tags.length }
          }
        });
      });
      log.info('docs.created', { id });
      return (await getDocRecord(id)) as DocRecord;
    },

    async update(id: string, input: UpdateDocInput, actor: AuthContext) {
      assertOffice(actor);
      const existingRow = await assertDocExists(id);
      const existing = (await getDocRecord(id)) as DocRecord;
      const next = {
        title: input.title !== undefined ? validateTitle(input.title) : existing.title,
        category: input.category !== undefined ? validateCategory(input.category) : existing.category,
        description: input.description !== undefined ? validateDescription(input.description) : existing.description,
        tags: input.tags !== undefined ? dedupeTags(input.tags) : existing.tags
      };
      await db.transaction(async (tx) => {
        await tx.execute(
          `UPDATE docs SET title = ?, category = ?, description = ?, tags = ?, updated_at = ?
           WHERE id = ? AND deleted_at IS NULL`,
          [next.title, next.category, next.description, JSON.stringify(next.tags), new Date().toISOString(), id]
        );
        const changes: Record<string, { from: unknown; to: unknown }> = {
          title: { from: existing.title, to: next.title },
          category: { from: existing.category, to: next.category }
        };
        if (input.tags !== undefined) changes.tags = { from: existing.tags.length, to: next.tags.length };
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'docs.update',
          resourceType: 'doc',
          resourceId: id,
          changes
        });
      });
      log.info('docs.updated', { id });
      void existingRow;
      return (await getDocRecord(id)) as DocRecord;
    },

    async remove(id: string, actor: AuthContext) {
      assertOffice(actor);
      const existingRow = await assertDocExists(id);
      await db.transaction(async (tx) => {
        await tx.execute(
          `UPDATE docs SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
          [new Date().toISOString(), new Date().toISOString(), id]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'docs.delete',
          resourceType: 'doc',
          resourceId: id,
          changes: { title: { from: existingRow.title, to: null } }
        });
      });
      // حذف نرم است — فایل‌ها و ردیف‌ها برای امکان بازیابی سر جایشان می‌مانند
      log.info('docs.deleted', { id, soft: true });
      return { id };
    },

    // ─── فایل‌ها ───

    async addFiles(id, files, actor) {
      assertOffice(actor);
      await assertDocExists(id);
      if (!Array.isArray(files) || files.length === 0) throw new ValidationError('حداقل یک فایل لازم است');
      if (files.length > DOCS_FILES_PER_UPLOAD_MAX) {
        throw new ValidationError(`حداکثر ${faDigits(DOCS_FILES_PER_UPLOAD_MAX)} فایل در هر بار بارگذاری`);
      }
      await assertFileCount(id, files.length);
      const preparedList = files.map((f) => ({ ...validatePrepared(f), segments: f.segments, size: f.size }));
      for (const prepared of preparedList) {
        const fileId = crypto.randomUUID();
        const key = `docs/${id}/${fileId}`;
        if (storage.putSegments) {
          await storage.putSegments(key, prepared.segments);
        } else {
          await storage.put(key, concatSegments(prepared.segments), prepared.mime);
        }
        await db.transaction(async (tx) => {
          await tx.execute(
            `INSERT INTO docs_files (id, doc_id, file_key, file_name, file_mime, file_size)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [fileId, id, key, prepared.filename, prepared.mime, prepared.size]
          );
          await tx.execute(`UPDATE docs SET updated_at = ? WHERE id = ?`, [new Date().toISOString(), id]);
          await audit.logInTransaction(tx, {
            actorId: actor.staffId,
            action: 'docs.file.add',
            resourceType: 'doc',
            resourceId: id,
            changes: {
              filename: { from: null, to: prepared.filename },
              sizeBytes: { from: null, to: prepared.size }
            }
          });
        });
      }
      log.info('docs.files.added', { id, count: preparedList.length });
      return (await getDocRecord(id)) as DocRecord;
    },

    async beginChunkedUpload(id, input, actor) {
      assertOffice(actor);
      await assertDocExists(id);
      const prepared = validatePrepared({ filename: input.filename, mimeType: input.mimeType, size: input.size });
      await assertFileCount(id, 1);
      const fileId = crypto.randomUUID();
      const key = `docs/${id}/${fileId}`;
      await db.transaction(async (tx) => {
        await tx.execute(
          `INSERT INTO docs_files (id, doc_id, file_key, file_name, file_mime, file_size)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [fileId, id, key, prepared.filename, prepared.mime, input.size]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'docs.file.upload.began',
          resourceType: 'doc',
          resourceId: id,
          changes: { filename: { from: null, to: prepared.filename }, sizeBytes: { from: null, to: input.size } }
        });
      });
      log.info('docs.file.upload.began', { id, fileId, size: input.size });
      return { fileId };
    },

    async putUploadChunk(id, fileId, seq, bytes, actor) {
      assertOffice(actor);
      const fileRow = await assertFileRow(id, fileId);
      if (!Number.isInteger(seq) || seq < 0 || seq > 1024) throw new ValidationError('شماره تکه نامعتبر است');
      if (bytes.length === 0) throw new ValidationError('تکهٔ خالی');
      if (bytes.length > MAX_EXERCISE_UPLOAD_CHUNK_BYTES) throw new ValidationError('حجم تکه بیش از حد مجاز است');
      await db.execute(
        `INSERT INTO exercise_file_chunks (key, seq, content) VALUES (?, ?, ?)
         ON CONFLICT(key, seq) DO UPDATE SET content = excluded.content`,
        [fileRow.file_key, seq, bytesToBase64Str(bytes)]
      );
      return { received: bytes.length };
    },

    async completeChunkedUpload(id, fileId, actor) {
      assertOffice(actor);
      const fileRow = await assertFileRow(id, fileId);
      const stat = await db.queryOne<{ n: number; bl: number | null }>(
        `SELECT COUNT(*) AS n, SUM(length(content)) AS bl FROM exercise_file_chunks WHERE key = ?`,
        [fileRow.file_key]
      );
      const b64Len = (n: number): number => Math.ceil(n / 3) * 4;
      const fullChunks = Math.floor(fileRow.file_size / MAX_EXERCISE_UPLOAD_CHUNK_BYTES);
      const rest = fileRow.file_size % MAX_EXERCISE_UPLOAD_CHUNK_BYTES;
      const expectedRows = rest === 0 ? fullChunks : fullChunks + 1;
      const expectedB64 = fullChunks * b64Len(MAX_EXERCISE_UPLOAD_CHUNK_BYTES) + (rest === 0 ? 0 : b64Len(rest));
      if (!stat || stat.n !== expectedRows || (stat.bl ?? 0) !== expectedB64) {
        throw new ConflictError('بارگذاری ناقص است — تکه‌ها با حجم اعلام‌شده هم‌خوان نیستند؛ دوباره تلاش کنید یا فایل را حذف کنید');
      }
      await db.transaction(async (tx) => {
        await tx.execute(`UPDATE docs SET updated_at = datetime('now') WHERE id = ?`, [id]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'docs.file.add',
          resourceType: 'doc',
          resourceId: id,
          changes: { filename: { from: null, to: fileRow.file_name }, sizeBytes: { from: null, to: fileRow.file_size }, mode: { from: null, to: 'chunked' } }
        });
      });
      log.info('docs.files.chunked.completed', { id, fileId, size: fileRow.file_size });
      return (await getDocRecord(id)) as DocRecord;
    },

    async deleteFile(id, fileId, actor) {
      assertOffice(actor);
      await assertDocExists(id);
      const fileRow = await assertFileRow(id, fileId);
      await storage.delete(fileRow.file_key).catch((err: unknown) => {
        log.warn('docs.file.storage.delete.failed', { key: fileRow.file_key, error: err instanceof Error ? err.message : String(err) });
      });
      await db.transaction(async (tx) => {
        await tx.execute(`DELETE FROM docs_files WHERE id = ?`, [fileRow.id]);
        await tx.execute(`UPDATE docs SET updated_at = ? WHERE id = ?`, [new Date().toISOString(), id]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'docs.file.delete',
          resourceType: 'doc',
          resourceId: id,
          changes: { filename: { from: fileRow.file_name, to: null }, sizeBytes: { from: fileRow.file_size, to: null } }
        });
      });
      log.info('docs.file.deleted', { id, fileId });
      return (await getDocRecord(id)) as DocRecord;
    },

    async getFile(id, fileId) {
      // سند حذف‌نرم‌شده فایلش را هم نمی‌دهد
      const docRow = await db.queryOne<{ id: string }>(`SELECT id FROM docs WHERE id = ? AND deleted_at IS NULL`, [id]);
      if (!docRow) return null;
      const fileRow = await db.queryOne<FileRow>(
        `SELECT id, doc_id, file_key, file_name, file_mime, file_size, created_at
           FROM docs_files WHERE id = ? AND doc_id = ?`,
        [fileId, id]
      );
      if (!fileRow) return null;
      const obj = await storage.get(fileRow.file_key);
      if (!obj) return null;
      return { bytes: obj.bytes, filename: fileRow.file_name, mime: fileRow.file_mime ?? obj.mime };
    }
  };
}

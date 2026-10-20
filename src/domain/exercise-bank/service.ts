/**
 * ماژول بانک تمرین — سرویس اصلی و منطق کسب‌وکار
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// Business logic بانک تمرین — audit هم‌تراکنش (قانون ۴)
// فایل: رابط ObjectStore (D1 پیش‌فرض / R2 اختیاری) — لینک خانواده: HMAC امضاشده با انقضا

import type { AuthContext, TagCategory, TagRef } from '@core/shared';
import { EXB_DOWNLOAD_TTL_SECONDS, EXERCISE_FEEDBACK_MAX, EXERCISE_FEEDBACK_MIN, SUBMISSION_ATTACH_WINDOW_HOURS, SUBMISSION_NOTE_MAX } from '@core/shared';
import { EXERCISE_BATCH_NOTE_MAX, MAX_EXERCISE_ATTACHMENT_COUNT, MAX_EXERCISE_BATCH_LINKS, MAX_EXERCISE_FILES_PER_UPLOAD, MAX_EXERCISE_FILE_BYTES, MAX_EXERCISE_UPLOAD_CHUNK_BYTES } from '@core/shared';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@core/errors';
import {
  clampPage,
  estimateBase64Bytes,
  normalizeExerciseTitle,
  pageWindow,
  sanitizeFilename,
  stripDataUrlPrefix,
  validateExerciseFileBytes,
  validateExerciseFileInput
} from './pure';
import type {
  AddSubmissionInput,
  AssignExerciseInput,
  AssignmentRecord,
  AssignmentStatus,
  AssignmentVia,
  BatchItemRecord,
  BatchSendObserver,
  BatchRecord,
  CreateBatchInput,
  ExerciseBankDeps,
  ExerciseCategoryGroup,
  ExerciseFacets,
  ExerciseFileMetaWithId,
  ExerciseFormat,
  ExerciseListResult,
  ExercisePackageRecord,
  ExerciseRecord,
  ExerciseSuggestion,
  ExerciseUploadLimits,
  ListExercisesFilters,
  ListPackagesFilters,
  ListSubmissionsFilters,
  NewExerciseFileBytesInput,
  NewExerciseFileInput,
  NewExerciseInput,
  NewPackageInput,
  PackageItem,
  PackageListResult,
  PackageSuggestion,
  ReassignExerciseInput,
  ReassignExerciseResult,
  StudentExerciseSuggestions,
  SubmissionRecord,
  SubmissionTarget,
  UpdateExerciseInput,
  UpdatePackageInput
} from './types';

/** اتصال قطعات — فقط برای آداپترهای بدون putSegments (فایل‌های کوچک مسیر JSON) */
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

interface ExerciseRow {
  id: string;
  title: string;
  description: string | null;
  format: string;
  published: number;
  /** — لینک بازی/تمرین آنلاین بیرونی */
  external_url?: string | null;
  file_name: string | null;
  file_mime: string | null;
  file_size: number | null;
  file_key: string | null;
  /** — آمار مصرف */
  assign_count?: number;
  created_by: string;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
}

interface TagRow {
  id: string;
  name: string;
  category: string;
  color: string | null;
}

interface TagJoinRow extends TagRow {
  exercise_id: string;
}

/** — ردیف پیوست تمرین */
interface AttachmentRow {
  id: string;
  exercise_id: string;
  file_key: string;
  file_name: string;
  file_mime: string;
  file_size: number;
  created_at: string;
}

interface AssignmentRow {
  id: string;
  exercise_id: string;
  student_id: string;
  assigned_by: string;
  assigned_via: string;
  note: string | null;
  status: string;
  created_at: string;
  // -c — تصحیح
  feedback: string | null;
  graded_by: string | null;
  graded_at: string | null;
  graded_by_name: string | null;
  exercise_title: string;
  first_name: string;
  last_name: string;
}

interface SubmissionRow {
  id: string;
  assignment_id: string;
  student_id: string;
  file_name: string | null;
  file_mime: string | null;
  file_size: number | null;
  file_key: string | null;
  source_chat_id: string | null;
  note: string | null;
  created_at: string;
  exercise_id: string;
  exercise_title: string;
  first_name: string;
  last_name: string;
  // -c — وضعیت تکلیف مادر + بازخورد تصحیح
  assignment_status: string;
  assignment_feedback: string | null;
  assignment_graded_at: string | null;
}

// ─── ردیف‌های بستهٔ تمرینی/تکلیف ───

interface PackageDbRow {
  id: string;
  title: string;
  description: string | null;
  published: number;
  send_count: number;
  created_by: string;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
}

interface PackageItemDbRow {
  package_id: string;
  exercise_id: string;
  position: number;
  exercise_title: string;
  format: string;
}

interface BatchDbRow {
  id: string;
  student_id: string;
  package_id: string | null;
  title: string;
  note: string | null;
  assigned_by: string;
  assigned_via: string;
  sent_at: string | null;
  sent_count: number;
  created_at: string;
  first_name?: string | null;
  last_name?: string | null;
  assigned_by_name?: string | null;
}

interface BatchItemDbRow {
  id: string;
  batch_id: string;
  exercise_id: string;
  status: string;
  feedback: string | null;
  graded_at: string | null;
  exercise_title: string;
  format: string;
  external_url: string | null;
  submission_id: string | null;
  submission_file: string | null;
  submission_note: string | null;
  submission_at: string | null;
}

/** decode base64 → بایت (محیط Workers: atob در دسترس است) */
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function base64UrlEncode(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(part: string): string {
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  return atob(padded);
}

async function hmacSign(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  const bytes = new Uint8Array(sig);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmacVerify(message: string, signature: string, secret: string): Promise<boolean> {
  const expected = await hmacSign(message, secret);
  // مقایسهٔ ثابت‌زمان ساده — طول برابر نهایتاً بررسی نویسه‌به‌نویسه
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

/** گارد RBAC نوشتن — هر سه نقش پنل مرکز (معلم مدرسه از پنل دسترسی ندارد) */
function assertStaffRole(actor: AuthContext): void {
  if (actor.role !== 'manager' && actor.role !== 'therapist' && actor.role !== 'secretary') {
    throw new ForbiddenError('مدیریت بانک تمرین فقط برای کارکنان مرکز مجاز است');
  }
}

/** — اعتبارسنجی و نوشتن برچسب‌های بسته — همه باید فعال و موجود باشند */
async function replacePackageTags(tx: { execute: (sql: string, params?: unknown[]) => Promise<unknown>; query: <T>(sql: string, params?: unknown[]) => Promise<T[]> }, packageId: string, tagIds: string[]): Promise<void> {
  const unique = [...new Set(tagIds)];
  await tx.execute(`DELETE FROM exercise_package_tags WHERE package_id = ?`, [packageId]);
  if (unique.length === 0) return;
  const placeholders = unique.map(() => '?').join(', ');
  const found = await tx.query<{ id: string }>(
    `SELECT id FROM tags WHERE active = 1 AND id IN (${placeholders})`,
    unique
  );
  if (found.length !== unique.length) throw new NotFoundError('برچسب');
  for (const t of found) {
    await tx.execute(`INSERT INTO exercise_package_tags (package_id, tag_id) VALUES (?, ?)`, [packageId, t.id]);
  }
}

/** LIKE امن — % و _ و \ ورودی خنثی می‌شود */
function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (m) => '\\' + m);
}

/** ردیف join تکلیف → رکورد API (camelCase) — مشترک بین listAssignments و حلقهٔ بازگشت */
function assignmentRowToRecord(r: AssignmentRow): AssignmentRecord {
  return {
    id: r.id,
    exerciseId: r.exercise_id,
    exerciseTitle: r.exercise_title,
    studentId: r.student_id,
    studentName: `${r.first_name} ${r.last_name}`,
    assignedBy: r.assigned_by,
    via: r.assigned_via as AssignmentVia,
    note: r.note,
    status: r.status as AssignmentStatus,
    createdAt: r.created_at,
    feedback: r.feedback,
    gradedBy: r.graded_by,
    gradedByName: r.graded_by_name,
    gradedAt: r.graded_at
  };
}

/** SELECT مشترک تکلیف با join تمرین/دانش‌آموز و نام تصحیح‌کننده */
const ASSIGNMENT_SELECT = `
  SELECT a.id, a.exercise_id, a.student_id, a.assigned_by, a.assigned_via, a.note, a.status, a.created_at,
         a.feedback, a.graded_by, a.graded_at, gs.full_name AS graded_by_name,
         e.title AS exercise_title, s.first_name, s.last_name
    FROM exercise_assignments a
    JOIN exercises e ON e.id = a.exercise_id
    JOIN students s ON s.id = a.student_id
    LEFT JOIN staff gs ON gs.id = a.graded_by`;

export function createExerciseBankService(deps: ExerciseBankDeps) {
  const { db, audit, logger, storage, downloadSecret } = deps;
  const log = logger.child('exercise-bank');
  const now = deps.now ?? (() => new Date());

  // -c — ناظر تصحیح (اعلان خانواده) — در api-routing وصل می‌شود
  let gradeObserver: ((record: AssignmentRecord) => Promise<void>) | null = null;

  // ناظر ارسال بستهٔ تکلیف (صف بله) — در api-routing وصل می‌شود
  let sendFn: BatchSendObserver | null = null;

  async function tagsForExercises(exerciseIds: string[]): Promise<Map<string, TagRef[]>> {
    const map = new Map<string, TagRef[]>();
    if (exerciseIds.length === 0) return map;
    const placeholders = exerciseIds.map(() => '?').join(', ');
    const rows = await db.query<TagJoinRow>(
      `SELECT et.exercise_id, t.id, t.name, t.category, t.color
         FROM exercise_tags et
         JOIN tags t ON t.id = et.tag_id
        WHERE et.exercise_id IN (${placeholders}) AND t.active = 1
        ORDER BY t.category, t.name`,
      exerciseIds
    );
    for (const r of rows) {
      const list = map.get(r.exercise_id) ?? [];
      list.push({ id: r.id, name: r.name, category: r.category as TagCategory, color: r.color });
      map.set(r.exercise_id, list);
    }
    return map;
  }

  function rowToRecord(row: ExerciseRow, tags: TagRef[], files: ExerciseFileMetaWithId[] = []): ExerciseRecord {
    const primary =
      files[0] ??
      (row.file_key && row.file_name
        ? { id: '', filename: row.file_name, mime: row.file_mime ?? 'application/octet-stream', size: row.file_size ?? 0 }
        : null);
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      format: row.format as ExerciseFormat,
      published: row.published === 1,
      externalUrl: row.external_url ?? null,
      tags,
      file: primary ? { filename: primary.filename, mime: primary.mime, size: primary.size } : null,
      files,
      assignCount: row.assign_count ?? 0,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /** — پیوست‌های چند تمرین به‌صورت دسته‌ای (برای فهرست) */
  async function attachmentsForExercises(exerciseIds: string[]): Promise<Map<string, ExerciseFileMetaWithId[]>> {
    const map = new Map<string, ExerciseFileMetaWithId[]>();
    if (exerciseIds.length === 0) return map;
    const placeholders = exerciseIds.map(() => '?').join(', ');
    const rows = await db.query<AttachmentRow>(
      `SELECT id, exercise_id, file_key, file_name, file_mime, file_size, created_at
         FROM exercise_attachments
        WHERE exercise_id IN (${placeholders})
        ORDER BY created_at, rowid`,
      exerciseIds
    );
    for (const r of rows) {
      const list = map.get(r.exercise_id) ?? [];
      list.push({ id: r.id, filename: r.file_name, mime: r.file_mime, size: r.file_size });
      map.set(r.exercise_id, list);
    }
    return map;
  }

  /** — پیوست‌های یک تمرین به ترتیب ثبت */
  async function attachmentsOf(exerciseId: string): Promise<ExerciseFileMetaWithId[]> {
    const rows = await db.query<AttachmentRow>(
      `SELECT id, exercise_id, file_key, file_name, file_mime, file_size, created_at
         FROM exercise_attachments WHERE exercise_id = ? ORDER BY created_at, rowid`,
      [exerciseId]
    );
    return rows.map((r) => ({ id: r.id, filename: r.file_name, mime: r.file_mime, size: r.file_size }));
  }


  /** — چت‌های ولیّ‌های متصل یک دانش‌آموز (bot_links + notification_prefs — الگوی ) */
  async function guardianChatsOf(studentId: string): Promise<string[]> {
    const linkRows = await db.query<{ chat_id: string }>(
      `SELECT DISTINCT chat_id FROM bot_links
        WHERE student_id = ? AND status = 'linked' AND chat_id IS NOT NULL`,
      [studentId]
    );
    const prefRows = await db.query<{ chat_id: string }>(
      `SELECT chat_id FROM notification_prefs
        WHERE student_id = ? AND chat_id IS NOT NULL AND channel = 'bale'`,
      [studentId]
    );
    return [...new Set([...linkRows.map((r) => r.chat_id), ...prefRows.map((r) => r.chat_id)])];
  }

  async function getExerciseRow(id: string): Promise<ExerciseRow | null> {
    return db.queryOne<ExerciseRow>(
      `SELECT id, title, description, format, published, external_url,
              file_name, file_mime, file_size, file_key, assign_count,
              created_by, created_at, updated_at
         FROM exercises WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );
  }

  /** اعتبارسنجی و نوشتن برچسب‌ها — همه باید فعال و موجود باشند */
  async function replaceTags(tx: typeof db, exerciseId: string, tagIds: string[]): Promise<void> {
    const unique = [...new Set(tagIds)];
    await tx.execute(`DELETE FROM exercise_tags WHERE exercise_id = ?`, [exerciseId]);
    if (unique.length === 0) return;
    const placeholders = unique.map(() => '?').join(', ');
    const found = await tx.query<{ id: string }>(
      `SELECT id FROM tags WHERE active = 1 AND id IN (${placeholders})`,
      unique
    );
    if (found.length !== unique.length) throw new NotFoundError('برچسب');
    for (const t of found) {
      await tx.execute(`INSERT INTO exercise_tags (exercise_id, tag_id) VALUES (?, ?)`, [exerciseId, t.id]);
    }
  }

  async function validateFile(file: NewExerciseFileInput): Promise<{ bytes: Uint8Array; mime: string; filename: string; size: number }> {
    // مسیر JSON قدیمی (base64) همان سقف محافظه‌کارانهٔ ۵۱۲ کیلوبایت را دارد؛
    // فایل‌های بزرگ از مسیر multipart باینری (سقف آداپتر: ۵۰ مگابایت) می‌روند
    const verdict = validateExerciseFileInput(file, MAX_EXERCISE_FILE_BYTES);
    if (!verdict.ok) throw new ValidationError(verdict.reason);
    const filename = sanitizeFilename(file.filename);
    const mime = file.mimeType.toLowerCase();
    const b64 = stripDataUrlPrefix(file.contentB64);
    return { bytes: base64ToBytes(b64), mime, filename, size: estimateBase64Bytes(b64) };
  }

  /** — آماده‌سازی فایل باینری مستقیم (مسیر multipart پخش‌جریانی) */
  function validatePreparedBytes(file: NewExerciseFileBytesInput): { segments: Uint8Array[]; mime: string; filename: string; size: number } {
    const verdict = validateExerciseFileBytes({ filename: file.filename, mimeType: file.mimeType, size: file.size }, storage.maxObjectBytes);
    if (!verdict.ok) throw new ValidationError(verdict.reason);
    return {
      segments: file.segments,
      mime: file.mimeType.toLowerCase(),
      filename: sanitizeFilename(file.filename),
      size: file.size
    };
  }

  /** — پیوست باید موجود و متعلق به همین تمرین باشد */
  async function assertAttachment(exerciseId: string, fileId: string): Promise<AttachmentRow> {
    const att = await db.queryOne<AttachmentRow>(
      `SELECT id, exercise_id, file_key, file_name, file_mime, file_size, created_at
         FROM exercise_attachments WHERE id = ? AND exercise_id = ?`,
      [fileId, exerciseId]
    );
    if (!att) throw new NotFoundError('فایل تمرین');
    return att;
  }

  /** بایت → base64 (برای تکه‌های بارگذاری پیوسته) */
  function bytesToBase64Str(bytes: Uint8Array): string {
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
  }

  /** — آیتم‌های چند بسته به‌صورت دسته‌ای */
  async function itemsForPackages(packageIds: string[]): Promise<Map<string, PackageItem[]>> {
    const map = new Map<string, PackageItem[]>();
    if (packageIds.length === 0) return map;
    const placeholders = packageIds.map(() => '?').join(', ');
    const rows = await db.query<PackageItemDbRow>(
      `SELECT pi.package_id, pi.exercise_id, pi.position, e.title AS exercise_title, e.format
         FROM exercise_package_items pi
         JOIN exercises e ON e.id = pi.exercise_id AND e.deleted_at IS NULL
        WHERE pi.package_id IN (${placeholders})
        ORDER BY pi.position, pi.exercise_id`,
      packageIds
    );
    for (const r of rows) {
      const list = map.get(r.package_id) ?? [];
      list.push({ exerciseId: r.exercise_id, exerciseTitle: r.exercise_title, format: r.format as ExerciseFormat, position: r.position });
      map.set(r.package_id, list);
    }
    return map;
  }

  /** — ردیف بسته → رکورد API (با آیتم‌ها و برچسب‌ها) */
  async function packageRowToRecord(row: PackageDbRow): Promise<ExercisePackageRecord> {
    const [tagRows, itemMap] = await Promise.all([
      db.query<TagRow>(
        `SELECT t.id, t.name, t.category, t.color
           FROM exercise_package_tags pt
           JOIN tags t ON t.id = pt.tag_id
          WHERE pt.package_id = ? AND t.active = 1
          ORDER BY t.category, t.name`,
        [row.id]
      ),
      itemsForPackages([row.id])
    ]);
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      published: row.published === 1,
      tags: tagRows.map((r) => ({ id: r.id, name: r.name, category: r.category as TagCategory, color: r.color })),
      items: itemMap.get(row.id) ?? [],
      sendCount: row.send_count,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  return {
    storageName: storage.name,

    limits: {
      storage: storage.name,
      maxFileBytes: storage.maxObjectBytes,
      maxFilesPerUpload: MAX_EXERCISE_FILES_PER_UPLOAD
    } as ExerciseUploadLimits,

    /** -c — اتصال ناظر تصحیح (اعلان خانواده) */
    setGradeObserver(observer: (record: AssignmentRecord) => Promise<void>): void {
      gradeObserver = observer;
    },

    async list(filters: ListExercisesFilters, _actor: AuthContext): Promise<ExerciseListResult> {
      const pageSize = Math.min(Math.max(filters.pageSize ?? 20, 1), 100);
      const page = clampPage(filters.page);
      const conds: string[] = ['e.deleted_at IS NULL'];
      const params: unknown[] = [];

      if (filters.publishedOnly) conds.push('e.published = 1');
      if (filters.q && filters.q.trim().length > 0) {
        const like = `%${escapeLike(filters.q.trim())}%`;
        conds.push("(e.title LIKE ? ESCAPE '\\' OR e.description LIKE ? ESCAPE '\\')");
        params.push(like, like);
      }
      if (filters.tagId) {
        conds.push('EXISTS (SELECT 1 FROM exercise_tags et WHERE et.exercise_id = e.id AND et.tag_id = ?)');
        params.push(filters.tagId);
      }
      // فیلتر چندبرچسبی AND (ناوبری تو در تو: اختلال + پایه همزمان)
      for (const tid of filters.tagIds ?? []) {
        if (!tid) continue;
        conds.push('EXISTS (SELECT 1 FROM exercise_tags et WHERE et.exercise_id = e.id AND et.tag_id = ?)');
        params.push(tid);
      }
      const where = `WHERE ${conds.join(' AND ')}`;

      const totalRow = await db.queryOne<{ total: number }>(
        `SELECT COUNT(*) AS total FROM exercises e ${where}`,
        params
      );
      const total = totalRow?.total ?? 0;
      const win = pageWindow(total, page, pageSize);

      const rows = await db.query<ExerciseRow>(
        `SELECT e.id, e.title, e.description, e.format, e.published, e.external_url,
                e.file_name, e.file_mime, e.file_size, e.file_key, e.assign_count,
                e.created_by, e.created_at, e.updated_at
           FROM exercises e ${where}
          ORDER BY e.created_at DESC, e.id DESC
          LIMIT ${pageSize} OFFSET ${win.offset}`,
        params
      );
      const tagMap = await tagsForExercises(rows.map((r) => r.id));
      const attMap = await attachmentsForExercises(rows.map((r) => r.id));
      const items = await Promise.all(
        rows.map((r) => rowToRecord(r, tagMap.get(r.id) ?? [], attMap.get(r.id) ?? []))
      );

      return { items, total: total, page: win.page, pageSize, hasMore: win.hasMore };
    },

    /** — شمارش تمرین هر برچسب + کل — برای کاشی‌های دستهٔ اختلال در ناوبری تو در تو */
    async facets(): Promise<ExerciseFacets> {
      const totalRow = await db.queryOne<{ total: number }>(
        'SELECT COUNT(*) AS total FROM exercises WHERE deleted_at IS NULL'
      );
      const rows = await db.query<{ tag_id: string; n: number }>(
        `SELECT et.tag_id AS tag_id, COUNT(*) AS n
           FROM exercise_tags et
           JOIN exercises e ON e.id = et.exercise_id
          WHERE e.deleted_at IS NULL
          GROUP BY et.tag_id`
      );
      const counts: Record<string, number> = {};
      for (const r of rows) counts[r.tag_id] = r.n;
      return { counts, total: totalRow?.total ?? 0 };
    },

    async getById(id: string): Promise<ExerciseRecord | null> {
      const row = await getExerciseRow(id);
      if (!row) return null;
      const tagMap = await tagsForExercises([id]);
      const files = await attachmentsOf(id);
      return rowToRecord(row, tagMap.get(id) ?? [], files);
    },

    async create(input: NewExerciseInput, actor: AuthContext): Promise<ExerciseRecord> {
      assertStaffRole(actor);
      const title = normalizeExerciseTitle(input.title);
      if (title.length < 2) throw new ValidationError('عنوان تمرین حداقل ۲ نویسه است');

      const id = crypto.randomUUID();
      let fileMeta: ExerciseRecord['file'] = null;

      if (input.file) {
        const prepared = await validateFile(input.file);
        const key = `exercise/${id}`;
        await storage.put(key, prepared.bytes, prepared.mime);
        fileMeta = { filename: prepared.filename, mime: prepared.mime, size: prepared.size };
      }

      await db.transaction(async (tx) => {
        await tx.execute(
          `INSERT INTO exercises (id, title, description, format, published, external_url, file_name, file_mime, file_size, file_key, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            title,
            input.description?.trim() ? input.description.trim() : null,
            input.format,
            input.published === false ? 0 : 1,
            input.externalUrl?.trim() ? input.externalUrl.trim() : null,
            fileMeta?.filename ?? null,
            fileMeta?.mime ?? null,
            fileMeta?.size ?? null,
            fileMeta ? `exercise/${id}` : null,
            actor.staffId
          ]
        );
        // اولین فایل هم‌زمان یک پیوست ثبت می‌شود (منبع حقیقت پیوست‌ها)
        if (fileMeta) {
          await tx.execute(
            `INSERT INTO exercise_attachments (id, exercise_id, file_key, file_name, file_mime, file_size)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [crypto.randomUUID(), id, `exercise/${id}`, fileMeta.filename, fileMeta.mime, fileMeta.size]
          );
        }
        await replaceTags(tx, id, input.tagIds ?? []);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'exercise.created',
          resourceType: 'exercise',
          resourceId: id,
          changes: {
            title: { from: null, to: title },
            format: { from: null, to: input.format },
            hasFile: { from: null, to: Boolean(fileMeta) },
            storage: { from: null, to: storage.name }
          }
        });
      });

      log.info('exercise.created', { id, hasFile: Boolean(fileMeta) });
      const created = await this.getById(id);
      return created as ExerciseRecord;
    },

    async update(id: string, input: UpdateExerciseInput, actor: AuthContext): Promise<ExerciseRecord> {
      assertStaffRole(actor);
      const row = await getExerciseRow(id);
      if (!row) throw new NotFoundError('تمرین');

      const title = input.title !== undefined ? normalizeExerciseTitle(input.title) : undefined;
      if (title !== undefined && title.length < 2) throw new ValidationError('عنوان تمرین حداقل ۲ نویسه است');

      await db.transaction(async (tx) => {
        await tx.execute(
          `UPDATE exercises
              SET title = COALESCE(?, title),
                  description = CASE WHEN ? THEN ? ELSE description END,
                  format = COALESCE(?, format),
                  published = COALESCE(?, published),
                  external_url = CASE WHEN ? THEN ? ELSE external_url END,
                  updated_at = datetime('now')
            WHERE id = ?`,
          [
            title ?? null,
            input.description !== undefined ? 1 : 0,
            input.description !== undefined ? (input.description?.trim() ? input.description.trim() : null) : null,
            input.format ?? null,
            input.published === undefined ? null : input.published ? 1 : 0,
            input.externalUrl !== undefined ? 1 : 0,
            input.externalUrl !== undefined ? (input.externalUrl?.trim() ? input.externalUrl.trim() : null) : null,
            id
          ]
        );
        if (input.tagIds !== undefined) {
          await replaceTags(tx, id, input.tagIds);
        }
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'exercise.updated',
          resourceType: 'exercise',
          resourceId: id,
          changes: {
            ...(input.title !== undefined ? { title: { from: row.title, to: title ?? null } } : {}),
            ...(input.published !== undefined ? { published: { from: row.published === 1, to: input.published } } : {})
          }
        });
      });

      log.info('exercise.updated', { id });
      const updated = await this.getById(id);
      return updated as ExerciseRecord;
    },

    // — m140: انتقال مالکیت تمرین — فقط مدیر؛ مسیر اختصاصی با audit «exercise.reassigned»
    // (ویرایش ساده هرگز created_by را تغییر نمی‌دهد — درس 43-A: فرم ویرایشِ کهنه
    // owner_staff_id قدیمی را دوباره می‌فرستاد و انتساب مدیر را بی‌صدا برمی‌گرداند)
    async reassign(id: string, input: ReassignExerciseInput, actor: AuthContext): Promise<ReassignExerciseResult> {
      assertStaffRole(actor);
      if (actor.role !== 'manager') {
        throw new ForbiddenError('تغییر سازندهٔ تمرین فقط توسط مدیر مجاز است');
      }
      const row = await getExerciseRow(id);
      if (!row) throw new NotFoundError('تمرین');

      const ownerRow = await db.queryOne<{ id: string }>(
        `SELECT id FROM staff WHERE id = ? AND active = 1`,
        [input.staffId]
      );
      if (!ownerRow) throw new NotFoundError('کارمند');

      // بدون‌عمل — مالک از قبل همان است؛ هیچ نوشتنی انجام نمی‌شود
      if (input.staffId === row.created_by) {
        const current = await this.getById(id);
        return { record: current as ExerciseRecord, unchanged: true };
      }

      await db.transaction(async (tx) => {
        await tx.execute(
          `UPDATE exercises SET created_by = ?, updated_at = datetime('now') WHERE id = ?`,
          [input.staffId, id]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'exercise.reassigned',
          resourceType: 'exercise',
          resourceId: id,
          changes: {
            createdBy: { from: row.created_by, to: input.staffId },
            ...(input.reason ? { reason: { from: null, to: input.reason } } : {})
          }
        });
      });

      log.info('exercise.reassigned', { id, from: row.created_by, to: input.staffId });
      const updated = await this.getById(id);
      return { record: updated as ExerciseRecord, unchanged: false };
    },

    async softDelete(id: string, actor: AuthContext): Promise<void> {
      assertStaffRole(actor);
      const row = await getExerciseRow(id);
      if (!row) throw new NotFoundError('تمرین');

      await db.transaction(async (tx) => {
        await tx.execute(`UPDATE exercises SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`, [id]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'exercise.deleted',
          resourceType: 'exercise',
          resourceId: id,
          changes: { title: { from: row.title, to: null } }
        });
      });
      log.info('exercise.deleted', { id });
    },

    async putFile(id: string, file: NewExerciseFileInput, actor: AuthContext): Promise<ExerciseRecord> {
      assertStaffRole(actor);
      const row = await getExerciseRow(id);
      if (!row) throw new NotFoundError('تمرین');

      const prepared = await validateFile(file);
      // تعویض «فایل اصلی»: اگر اصلی یک پیوست است، محتوای همان کلید در‌جا عوض می‌شود؛
      // وگرنه فایل جدید با کلید کلاسیک exercise/<id> به‌عنوان اولین پیوست ثبت می‌شود
      const first = (await attachmentsOf(id))[0] ?? null;
      const key = first ? row.file_key! : `exercise/${id}`;
      await storage.put(key, prepared.bytes, prepared.mime);

      await db.transaction(async (tx) => {
        if (first) {
          await tx.execute(
            `UPDATE exercise_attachments SET file_name = ?, file_mime = ?, file_size = ? WHERE id = ?`,
            [prepared.filename, prepared.mime, prepared.size, first.id]
          );
        } else {
          await tx.execute(
            `INSERT INTO exercise_attachments (id, exercise_id, file_key, file_name, file_mime, file_size)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [crypto.randomUUID(), id, key, prepared.filename, prepared.mime, prepared.size]
          );
        }
        await tx.execute(
          `UPDATE exercises
              SET file_name = ?, file_mime = ?, file_size = ?, file_key = ?, updated_at = datetime('now')
            WHERE id = ?`,
          [prepared.filename, prepared.mime, prepared.size, key, id]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'exercise.file.replaced',
          resourceType: 'exercise',
          resourceId: id,
          changes: {
            filename: { from: row.file_name, to: prepared.filename },
            sizeBytes: { from: row.file_size, to: prepared.size }
          }
        });
      });

      log.info('exercise.file.replaced', { id, size: prepared.size });
      const updated = await this.getById(id);
      return updated as ExerciseRecord;
    },

    /** — افزودن چند فایل (multipart باینری) — هر فایل مستقل اعتبارسنجی و ذخیره می‌شود */
    async addFiles(id: string, files: NewExerciseFileBytesInput[], actor: AuthContext): Promise<ExerciseRecord> {
      assertStaffRole(actor);
      const row = await getExerciseRow(id);
      if (!row) throw new NotFoundError('تمرین');
      if (!Array.isArray(files) || files.length === 0) throw new ValidationError('حداقل یک فایل لازم است');
      if (files.length > MAX_EXERCISE_FILES_PER_UPLOAD) {
        throw new ValidationError(`حداکثر ${MAX_EXERCISE_FILES_PER_UPLOAD} فایل در هر بار بارگذاری`);
      }

      // اعتبارسنجی همه قبل از هر نوشتنی — نیمه‌تمام نمی‌ماند
      const preparedList = files.map((f) => validatePreparedBytes(f));

      const hasPrimary = Boolean(row.file_key);
      let firstMeta: { filename: string; mime: string; size: number; key: string } | null = null;

      for (let i = 0; i < preparedList.length; i += 1) {
        const prepared = preparedList[i];
        const attId = crypto.randomUUID();
        const key = `exercise/${id}/${attId}`;
        // نوشتن از قطعات (بدون concat کامل) با fallback به put ساده
        if (storage.putSegments) {
          await storage.putSegments(key, prepared.segments);
        } else {
          await storage.put(key, concatSegments(prepared.segments), prepared.mime);
        }
        await db.transaction(async (tx) => {
          await tx.execute(
            `INSERT INTO exercise_attachments (id, exercise_id, file_key, file_name, file_mime, file_size)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [attId, id, key, prepared.filename, prepared.mime, prepared.size]
          );
          // اگر تمرین فایل اصلی نداشت، اولین فایلِ این دسته اصلی می‌شود
          if (!hasPrimary && i === 0) {
            await tx.execute(
              `UPDATE exercises SET file_name = ?, file_mime = ?, file_size = ?, file_key = ?, updated_at = datetime('now') WHERE id = ?`,
              [prepared.filename, prepared.mime, prepared.size, key, id]
            );
          }
          await audit.logInTransaction(tx, {
            actorId: actor.staffId,
            action: 'exercise.files.added',
            resourceType: 'exercise',
            resourceId: id,
            changes: {
              filename: { from: null, to: prepared.filename },
              sizeBytes: { from: null, to: prepared.size }
            }
          });
        });
        if (!hasPrimary && i === 0) firstMeta = { ...prepared, key };
      }

      log.info('exercise.files.added', { id, count: preparedList.length, promotedPrimary: Boolean(firstMeta) });
      const updated = await this.getById(id);
      return updated as ExerciseRecord;
    },

    /** — شروع بارگذاری پیوسته: ردیف پیوست با متادیتا ساخته می‌شود؛ تکه‌ها بعداً می‌آیند */
    async beginChunkedUpload(
      id: string,
      input: { filename: string; mimeType: string; size: number },
      actor: AuthContext
    ): Promise<{ fileId: string }> {
      assertStaffRole(actor);
      const row = await getExerciseRow(id);
      if (!row) throw new NotFoundError('تمرین');
      const prepared = validatePreparedBytes({ filename: input.filename, mimeType: input.mimeType, segments: [], size: input.size });
      const countRow = await db.queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM exercise_attachments WHERE exercise_id = ?`, [id]);
      if ((countRow?.n ?? 0) >= MAX_EXERCISE_ATTACHMENT_COUNT) {
        throw new ValidationError(`حداکثر ${MAX_EXERCISE_ATTACHMENT_COUNT} فایل برای هر تمرین`);
      }
      const attId = crypto.randomUUID();
      const key = `exercise/${id}/${attId}`;
      const hasPrimary = Boolean(row.file_key);
      await db.transaction(async (tx) => {
        await tx.execute(
          `INSERT INTO exercise_attachments (id, exercise_id, file_key, file_name, file_mime, file_size)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [attId, id, key, prepared.filename, prepared.mime, prepared.size]
        );
        if (!hasPrimary) {
          await tx.execute(
            `UPDATE exercises SET file_name = ?, file_mime = ?, file_size = ?, file_key = ?, updated_at = datetime('now') WHERE id = ?`,
            [prepared.filename, prepared.mime, prepared.size, key, id]
          );
        }
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'exercise.file.upload.began',
          resourceType: 'exercise',
          resourceId: id,
          changes: { filename: { from: null, to: prepared.filename }, sizeBytes: { from: null, to: prepared.size } }
        });
      });
      log.info('exercise.file.upload.began', { id, fileId: attId, size: prepared.size });
      return { fileId: attId };
    },

    /** — دریافت یک تکهٔ باینری (بدنهٔ خام ≤ ۱ مگابایت) و پیوستن به تکه‌های همان پیوست */
    async putUploadChunk(id: string, fileId: string, seq: number, bytes: Uint8Array, actor: AuthContext): Promise<{ received: number }> {
      assertStaffRole(actor);
      await assertAttachment(id, fileId);
      if (!Number.isInteger(seq) || seq < 0 || seq > 1024) throw new ValidationError('شماره تکه نامعتبر است');
      if (bytes.length === 0) throw new ValidationError('تکهٔ خالی');
      if (bytes.length > MAX_EXERCISE_UPLOAD_CHUNK_BYTES) {
        throw new ValidationError('حجم تکه بیش از حد مجاز است');
      }
      await db.execute(
        `INSERT INTO exercise_file_chunks (key, seq, content) VALUES (?, ?, ?)
         ON CONFLICT(key, seq) DO UPDATE SET content = excluded.content`,
        [`exercise/${id}/${fileId}`, seq, bytesToBase64Str(bytes)]
      );
      return { received: bytes.length };
    },

    /** — پایان بارگذاری پیوسته: شمار و مجموع تکه‌ها با متادیتای اعلام‌شده سنجیده می‌شود */
    async completeChunkedUpload(id: string, fileId: string, actor: AuthContext): Promise<ExerciseRecord> {
      assertStaffRole(actor);
      const att = await assertAttachment(id, fileId);
      const stat = await db.queryOne<{ n: number; bl: number | null }>(
        `SELECT COUNT(*) AS n, SUM(length(content)) AS bl FROM exercise_file_chunks WHERE key = ?`,
        [att.file_key]
      );
      const expectedRows = Math.ceil(att.file_size / MAX_EXERCISE_UPLOAD_CHUNK_BYTES);
      const expectedB64 = Math.ceil(att.file_size / 3) * 4;
      if (!stat || stat.n !== expectedRows || (stat.bl ?? 0) !== expectedB64) {
        throw new ConflictError('بارگذاری ناقص است — تکه‌ها با حجم اعلام‌شده هم‌خوان نیستند؛ دوباره تلاش کنید یا فایل را حذف کنید');
      }
      await db.transaction(async (tx) => {
        await tx.execute(`UPDATE exercises SET updated_at = datetime('now') WHERE id = ?`, [id]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'exercise.files.added',
          resourceType: 'exercise',
          resourceId: id,
          changes: { filename: { from: null, to: att.file_name }, sizeBytes: { from: null, to: att.file_size }, mode: { from: null, to: 'chunked' } }
        });
      });
      log.info('exercise.files.chunked.completed', { id, fileId, size: att.file_size });
      const updated = await this.getById(id);
      return updated as ExerciseRecord;
    },

    /** — حذف یک پیوست؛ اگر اصلی بود، قدیمی‌ترین پیوست بعدی جای آن را می‌گیرد */
    async deleteAttachment(id: string, fileId: string, actor: AuthContext): Promise<ExerciseRecord> {
      assertStaffRole(actor);
      const row = await getExerciseRow(id);
      if (!row) throw new NotFoundError('تمرین');
      const att = await db.queryOne<AttachmentRow>(
        `SELECT id, exercise_id, file_key, file_name, file_mime, file_size, created_at
           FROM exercise_attachments WHERE id = ? AND exercise_id = ?`,
        [fileId, id]
      );
      if (!att) throw new NotFoundError('فایل تمرین');

      // تراکنش D1 تعاملی نیست — «پیوست بعدی» قبل از شروع تراکنش محاسبه می‌شود
      const remaining = await db.query<AttachmentRow>(
        `SELECT id, exercise_id, file_key, file_name, file_mime, file_size, created_at
           FROM exercise_attachments WHERE exercise_id = ? ORDER BY created_at, rowid`,
        [id]
      );
      const next = remaining.find((a) => a.id !== att.id) ?? null;

      await storage.delete(att.file_key);
      await db.transaction(async (tx) => {
        await tx.execute(`DELETE FROM exercise_attachments WHERE id = ?`, [att.id]);
        // اگر حذف‌شده فایل اصلی بود → قدیمی‌ترین پیوست باقی‌مانده اصلی می‌شود (یا اصلی حذف می‌شود)
        if (row.file_key === att.file_key) {
          await tx.execute(
            `UPDATE exercises SET file_name = ?, file_mime = ?, file_size = ?, file_key = ?, updated_at = datetime('now') WHERE id = ?`,
            [next?.file_name ?? null, next?.file_mime ?? null, next?.file_size ?? null, next?.file_key ?? null, id]
          );
        }
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'exercise.file.deleted',
          resourceType: 'exercise',
          resourceId: id,
          changes: { filename: { from: att.file_name, to: null }, sizeBytes: { from: att.file_size, to: null } }
        });
      });

      log.info('exercise.file.deleted', { id, fileId });
      const updated = await this.getById(id);
      return updated as ExerciseRecord;
    },

    /** — دانلود یک پیوست مشخص (کارکنان) */
    async getAttachmentFile(id: string, fileId: string): Promise<{ bytes: Uint8Array; filename: string; mime: string } | null> {
      const row = await getExerciseRow(id);
      if (!row) return null;
      const att = await db.queryOne<AttachmentRow>(
        `SELECT id, exercise_id, file_key, file_name, file_mime, file_size
           FROM exercise_attachments WHERE id = ? AND exercise_id = ?`,
        [fileId, id]
      );
      if (!att) return null;
      const obj = await storage.get(att.file_key);
      if (!obj) return null;
      return { bytes: obj.bytes, filename: att.file_name, mime: att.file_mime ?? obj.mime };
    },

    async getFile(id: string): Promise<{ bytes: Uint8Array; filename: string; mime: string } | null> {
      const row = await getExerciseRow(id);
      if (!row || !row.file_key || !row.file_name) return null;
      const obj = await storage.get(row.file_key);
      if (!obj) return null;
      return { bytes: obj.bytes, filename: row.file_name, mime: row.file_mime ?? obj.mime };
    },

    async mintDownloadToken(exerciseId: string, fileId?: string | null): Promise<string> {
      const exp = Math.floor(Date.now() / 1000) + EXB_DOWNLOAD_TTL_SECONDS;
      // fileId اختیاری: «exerciseId.fileId.exp» (UUID نقطه ندارد — parse از راست امن است)
      const payload = fileId ? `${exerciseId}.${fileId}.${exp}` : `${exerciseId}.${exp}`;
      const signature = await hmacSign(payload, downloadSecret);
      return `${base64UrlEncode(payload)}.${signature}`;
    },

    async verifyDownloadToken(token: string): Promise<{ exerciseId: string; fileId: string | null } | null> {
      const dot = token.lastIndexOf('.');
      if (dot <= 0) return null;
      let payload: string;
      let signature: string;
      try {
        payload = base64UrlDecode(token.slice(0, dot));
        signature = token.slice(dot + 1);
      } catch {
        return null;
      }
      const sep = payload.lastIndexOf('.');
      if (sep <= 0) return null;
      const head = payload.slice(0, sep);
      const exp = Number(payload.slice(sep + 1));
      if (!Number.isInteger(exp) || exp * 1000 < Date.now()) return null;
      // سرِ payload ممکن است «exerciseId» یا «exerciseId.fileId» باشد
      const headDot = head.indexOf('.');
      const exerciseId = headDot > 0 ? head.slice(0, headDot) : head;
      const fileId = headDot > 0 ? head.slice(headDot + 1) : null;
      if (!exerciseId) return null;
      const valid = await hmacVerify(payload, signature, downloadSecret);
      if (!valid) return null;
      return { exerciseId, fileId };
    },

    async getPublicFile(id: string, token: string): Promise<{ bytes: Uint8Array; filename: string; mime: string } | null> {
      const verified = await this.verifyDownloadToken(token);
      if (!verified || verified.exerciseId !== id) return null;
      const row = await db.queryOne<ExerciseRow>(
        `SELECT id, title, description, format, published,
                file_name, file_mime, file_size, file_key,
                created_by, created_at, updated_at
           FROM exercises WHERE id = ? AND deleted_at IS NULL AND published = 1`,
        [id]
      );
      if (!row) return null;
      // توکنِ پیوست مشخص → خواندن از جدول پیوست‌ها
      if (verified.fileId) {
        const att = await db.queryOne<AttachmentRow>(
          `SELECT id, exercise_id, file_key, file_name, file_mime, file_size
             FROM exercise_attachments WHERE id = ? AND exercise_id = ?`,
          [verified.fileId, id]
        );
        if (!att) return null;
        const obj = await storage.get(att.file_key);
        if (!obj) return null;
        return { bytes: obj.bytes, filename: att.file_name, mime: att.file_mime ?? obj.mime };
      }
      if (!row.file_key || !row.file_name) return null;
      const obj = await storage.get(row.file_key);
      if (!obj) return null;
      return { bytes: obj.bytes, filename: row.file_name, mime: row.file_mime ?? obj.mime };
    },

    async categories(): Promise<ExerciseCategoryGroup> {
      const rows = await db.query<TagRow>(
        `SELECT id, name, category, color FROM tags WHERE active = 1 AND category IN ('disorder', 'grade', 'school_type', 'custom')
          ORDER BY category, name`
      );
      const ref = (r: TagRow): TagRef => ({ id: r.id, name: r.name, category: r.category as TagCategory, color: r.color });
      return {
        disorder: rows.filter((r) => r.category === 'disorder').map(ref),
        grade: rows.filter((r) => r.category === 'grade').map(ref),
        other: rows.filter((r) => r.category === 'school_type' || r.category === 'custom').map(ref)
      };
    },

    // ───────────── بستهٔ تمرینی ─────────────

    async listPackages(filters: ListPackagesFilters, _actor: AuthContext): Promise<PackageListResult> {
      const pageSize = Math.min(Math.max(filters.pageSize ?? 20, 1), 100);
      const page = clampPage(filters.page);
      const conds: string[] = ['p.deleted_at IS NULL'];
      const params: unknown[] = [];

      if (filters.publishedOnly) conds.push('p.published = 1');
      if (filters.q && filters.q.trim().length > 0) {
        const like = `%${escapeLike(filters.q.trim())}%`;
        conds.push("(p.title LIKE ? ESCAPE '\\' OR p.description LIKE ? ESCAPE '\\')");
        params.push(like, like);
      }
      if (filters.tagId) {
        conds.push('EXISTS (SELECT 1 FROM exercise_package_tags pt WHERE pt.package_id = p.id AND pt.tag_id = ?)');
        params.push(filters.tagId);
      }
      const where = `WHERE ${conds.join(' AND ')}`;

      const totalRow = await db.queryOne<{ total: number }>(
        `SELECT COUNT(*) AS total FROM exercise_packages p ${where}`,
        params
      );
      const total = totalRow?.total ?? 0;
      const win = pageWindow(total, page, pageSize);

      const rows = await db.query<PackageDbRow>(
        `SELECT p.* FROM exercise_packages p ${where}
          ORDER BY p.created_at DESC, p.id DESC
          LIMIT ${pageSize} OFFSET ${win.offset}`,
        params
      );
      const items = await Promise.all(rows.map((r) => packageRowToRecord(r)));
      return { items, total, page: win.page, pageSize, hasMore: win.hasMore };
    },

    async getPackageById(id: string): Promise<ExercisePackageRecord | null> {
      const row = await db.queryOne<PackageDbRow>(`SELECT * FROM exercise_packages WHERE id = ? AND deleted_at IS NULL`, [id]);
      if (!row) return null;
      return packageRowToRecord(row);
    },

    async createPackage(input: NewPackageInput, actor: AuthContext): Promise<ExercisePackageRecord> {
      assertStaffRole(actor);
      const title = normalizeExerciseTitle(input.title);
      if (title.length < 2) throw new ValidationError('عنوان بسته حداقل ۲ نویسه است');

      // تمرین‌ها باید موجود و فعال باشند — ترتیب ورودی حفظ می‌شود
      const uniqueIds = [...new Set(input.exerciseIds)];
      const found = await db.query<{ id: string }>(
        `SELECT id FROM exercises WHERE deleted_at IS NULL AND id IN (${uniqueIds.map(() => '?').join(', ')})`,
        uniqueIds
      );
      if (found.length !== uniqueIds.length) throw new NotFoundError('برخی تمرین‌های بسته پیدا نشدند');
      const orderIndex = new Map(uniqueIds.map((id, i) => [id, i]));

      const id = crypto.randomUUID();
      await db.transaction(async (tx) => {
        await tx.execute(
          `INSERT INTO exercise_packages (id, title, description, published, created_by)
           VALUES (?, ?, ?, ?, ?)`,
          [id, title, input.description?.trim() ? input.description.trim() : null, input.published === false ? 0 : 1, actor.staffId]
        );
        for (const exId of uniqueIds) {
          await tx.execute(
            `INSERT INTO exercise_package_items (package_id, exercise_id, position) VALUES (?, ?, ?)`,
            [id, exId, orderIndex.get(exId) ?? 0]
          );
        }
        await replacePackageTags(tx, id, input.tagIds ?? []);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'exercise_package.created',
          resourceType: 'exercise_package',
          resourceId: id,
          changes: {
            title: { from: null, to: title },
            itemCount: { from: null, to: uniqueIds.length },
            tagCount: { from: null, to: (input.tagIds ?? []).length }
          }
        });
      });
      log.info('exercise_package.created', { id, items: uniqueIds.length });

      const created = await this.getPackageById(id);
      return created as ExercisePackageRecord;
    },

    async updatePackage(id: string, input: UpdatePackageInput, actor: AuthContext): Promise<ExercisePackageRecord> {
      assertStaffRole(actor);
      const row = await db.queryOne<PackageDbRow>(`SELECT * FROM exercise_packages WHERE id = ? AND deleted_at IS NULL`, [id]);
      if (!row) throw new NotFoundError('بستهٔ تمرینی');

      if (input.exerciseIds) {
        const uniqueIds = [...new Set(input.exerciseIds)];
        const found = await db.query<{ id: string }>(
          `SELECT id FROM exercises WHERE deleted_at IS NULL AND id IN (${uniqueIds.map(() => '?').join(', ')})`,
          uniqueIds
        );
        if (found.length !== uniqueIds.length) throw new NotFoundError('برخی تمرین‌های بسته پیدا نشدند');
      }

      await db.transaction(async (tx) => {
        if (input.title !== undefined || input.description !== undefined || input.published !== undefined) {
          const title = input.title !== undefined ? normalizeExerciseTitle(input.title) : row.title;
          if (title.length < 2) throw new ValidationError('عنوان بسته حداقل ۲ نویسه است');
          await tx.execute(
            `UPDATE exercise_packages SET title = ?, description = ?, published = ?, updated_at = datetime('now') WHERE id = ?`,
            [
              title,
              input.description !== undefined ? (input.description?.trim() ? input.description.trim() : null) : row.description,
              input.published !== undefined ? (input.published ? 1 : 0) : row.published,
              id
            ]
          );
        }
        if (input.exerciseIds) {
          const uniqueIds = [...new Set(input.exerciseIds)];
          const orderIndex = new Map(uniqueIds.map((exId, i) => [exId, i]));
          await tx.execute(`DELETE FROM exercise_package_items WHERE package_id = ?`, [id]);
          for (const exId of uniqueIds) {
            await tx.execute(
              `INSERT INTO exercise_package_items (package_id, exercise_id, position) VALUES (?, ?, ?)`,
              [id, exId, orderIndex.get(exId) ?? 0]
            );
          }
        }
        if (input.tagIds) {
          await replacePackageTags(tx, id, input.tagIds);
        }
        const pkgChanges: Record<string, { from: unknown; to: unknown }> = {};
        if (input.title !== undefined) pkgChanges.title = { from: row.title, to: normalizeExerciseTitle(input.title) };
        if (input.exerciseIds !== undefined) pkgChanges.items = { from: null, to: [...new Set(input.exerciseIds)].length };
        if (input.published !== undefined) pkgChanges.published = { from: row.published === 1, to: input.published };
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'exercise_package.updated',
          resourceType: 'exercise_package',
          resourceId: id,
          changes: pkgChanges
        });
      });
      log.info('exercise_package.updated', { id });

      const updated = await this.getPackageById(id);
      return updated as ExercisePackageRecord;
    },

    async softDeletePackage(id: string, actor: AuthContext): Promise<void> {
      assertStaffRole(actor);
      const row = await db.queryOne<{ id: string }>(`SELECT id FROM exercise_packages WHERE id = ? AND deleted_at IS NULL`, [id]);
      if (!row) throw new NotFoundError('بستهٔ تمرینی');
      const at = now().toISOString();
      await db.transaction(async (tx) => {
        await tx.execute(`UPDATE exercise_packages SET deleted_at = ?, updated_at = datetime('now') WHERE id = ?`, [at, id]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'exercise_package.deleted',
          resourceType: 'exercise_package',
          resourceId: id,
          changes: { deletedAt: { from: null, to: at } }
        });
      });
      log.info('exercise_package.deleted', { id });
    },

    // ───────────── پیشنهاد برچسب‌محور + بستهٔ تکلیف + ارسال پنل ─────────────

    /** تطبیق برچسب دانش‌آموز × برچسب تمرین/بسته — همان الگوی suggestTypesForStudent چک‌لیست */
    async suggestForStudent(studentId: string): Promise<StudentExerciseSuggestions> {
      const [tagRows, exerciseRows, packageRows] = await Promise.all([
        db.query<{ id: string; name: string }>(
          `SELECT t.id, t.name
             FROM student_tags st
             JOIN tags t ON t.id = st.tag_id
            WHERE st.student_id = ? AND t.active = 1`,
          [studentId]
        ),
        db.query<ExerciseRow>(
          `SELECT id, title, description, format, published,
                  file_name, file_mime, file_size, file_key, assign_count,
                  created_by, created_at, updated_at
             FROM exercises
            WHERE deleted_at IS NULL AND published = 1
            ORDER BY created_at DESC LIMIT 200`
        ),
        db.query<PackageDbRow>(
          `SELECT * FROM exercise_packages WHERE deleted_at IS NULL AND published = 1
            ORDER BY created_at DESC LIMIT 100`
        )
      ]);
      const studentTagIds = new Set(tagRows.map((r) => r.id));
      const tagNames = new Map(tagRows.map((r) => [r.id, r.name] as const));

      const exTagMap = await tagsForExercises(exerciseRows.map((r) => r.id));
      const attMap = await attachmentsForExercises(exerciseRows.map((r) => r.id));
      const exercises: ExerciseSuggestion[] = exerciseRows.map((row) => {
        const exercise = rowToRecord(row, exTagMap.get(row.id) ?? [], attMap.get(row.id) ?? []);
        const matched = exercise.tags.filter((t) => studentTagIds.has(t.id)).map((t) => ({ id: t.id, name: tagNames.get(t.id) ?? t.name }));
        return { exercise, matched, score: matched.length };
      });
      // ترتیب: تطابق بیشتر → پرکاربردتر → جدیدتر
      exercises.sort(
        (a, b) => b.score - a.score || (b.exercise.assignCount ?? 0) - (a.exercise.assignCount ?? 0) || a.exercise.title.localeCompare(b.exercise.title, 'fa')
      );

      const packages: PackageSuggestion[] = [];
      for (const row of packageRows) {
        const pkg = await packageRowToRecord(row);
        const matched = pkg.tags.filter((t) => studentTagIds.has(t.id)).map((t) => ({ id: t.id, name: tagNames.get(t.id) ?? t.name }));
        packages.push({ pkg, matched, score: matched.length });
      }
      packages.sort(
        (a, b) => b.score - a.score || b.pkg.sendCount - a.pkg.sendCount || a.pkg.title.localeCompare(b.pkg.title, 'fa')
      );

      return { exercises, packages };
    },

    async createBatch(input: CreateBatchInput, actor: AuthContext): Promise<BatchRecord> {
      // گارد نقش پنل در route انجام می‌شود؛ بات با EXB_ACTOR صدا می‌زند
      const student = await db.queryOne<{ id: string; first_name: string; last_name: string }>(
        `SELECT id, first_name, last_name FROM students WHERE id = ? AND active = 1`,
        [input.studentId]
      );
      if (!student) throw new NotFoundError('دانش‌آموز');

      // تعیین تمرین‌ها: بستهٔ آماده یا فهرست مستقیم
      let exercises: { id: string; title: string }[] = [];
      let packageTitle: string | null = null;
      if (input.packageId) {
        const pkg = await db.queryOne<PackageDbRow>(
          `SELECT * FROM exercise_packages WHERE id = ? AND deleted_at IS NULL`,
          [input.packageId]
        );
        if (!pkg) throw new NotFoundError('بستهٔ تمرینی');
        if (pkg.published !== 1) throw new ConflictError('بستهٔ تمرینی منتشرشده نیست — ابتدا آن را منتشر کنید');
        packageTitle = pkg.title;
        const itemRows = await db.query<{ exercise_id: string; title: string }>(
          `SELECT pi.exercise_id, e.title
             FROM exercise_package_items pi
             JOIN exercises e ON e.id = pi.exercise_id AND e.deleted_at IS NULL AND e.published = 1
            WHERE pi.package_id = ?
            ORDER BY pi.position, pi.exercise_id`,
          [input.packageId]
        );
        if (itemRows.length === 0) throw new ConflictError('بستهٔ تمرینی هیچ تمرین منتشرشده‌ای ندارد');
        exercises = itemRows.map((r) => ({ id: r.exercise_id, title: r.title }));
      } else {
        const ids = [...new Set(input.exerciseIds ?? [])];
        if (ids.length === 0) throw new ValidationError('حداقل یک تمرین لازم است');
        const rows = await db.query<{ id: string; title: string; published: number; deleted_at: string | null }>(
          `SELECT id, title, published, deleted_at FROM exercises WHERE id IN (${ids.map(() => '?').join(', ')})`,
          ids
        );
        const byId = new Map(rows.map((r) => [r.id, r]));
        for (const exId of ids) {
          const r = byId.get(exId);
          if (!r || r.deleted_at) throw new NotFoundError('تمرین');
          if (r.published !== 1) throw new ConflictError(`تمرین «${r.title}» منتشرشده نیست — ابتدا آن را منتشر کنید`);
        }
        exercises = ids.map((exId) => ({ id: exId, title: byId.get(exId)!.title }));
      }

      const batchId = crypto.randomUUID();
      const title = packageTitle ?? (exercises.length === 1 ? exercises[0].title : `تمرین‌های انتخابی (${exercises.length} تمرین)`);
      const note = input.note?.trim() ? Array.from(input.note.trim()).slice(0, EXERCISE_BATCH_NOTE_MAX).join('') : null;

      await db.transaction(async (tx) => {
        await tx.execute(
          `INSERT INTO exercise_batches (id, student_id, package_id, title, note, assigned_by, assigned_via)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [batchId, input.studentId, input.packageId ?? null, title, note, input.assignedBy, input.via === 'bot' ? 'bot' : 'panel']
        );
        for (const ex of exercises) {
          const assignmentId = crypto.randomUUID();
          await tx.execute(
            `INSERT INTO exercise_assignments (id, exercise_id, student_id, assigned_by, assigned_via, note, status, batch_id)
             VALUES (?, ?, ?, ?, ?, ?, 'assigned', ?)`,
            [assignmentId, ex.id, input.studentId, input.assignedBy, input.via === 'bot' ? 'bot' : 'panel', null, batchId]
          );
          // آمار مصرف تمرین
          await tx.execute(`UPDATE exercises SET assign_count = assign_count + 1 WHERE id = ?`, [ex.id]);
          // تایم‌لاین پرونده از audit «exercise.assigned» تغذیه می‌شود — همان الگوی تکلیف تکی
          await audit.logInTransaction(tx, {
            actorId: actor.staffId,
            action: 'exercise.assigned',
            resourceType: 'exercise_assignment',
            resourceId: assignmentId,
            changes: {
              exerciseId: { from: null, to: ex.id },
              studentId: { from: null, to: input.studentId },
              via: { from: null, to: input.via === 'bot' ? 'bot' : 'panel' },
              batchId: { from: null, to: batchId }
            }
          });
        }
        if (input.packageId) {
          await tx.execute(`UPDATE exercise_packages SET send_count = send_count + 1 WHERE id = ?`, [input.packageId]);
        }
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'exercise.batch.assigned',
          resourceType: 'exercise_batch',
          resourceId: batchId,
          changes: {
            studentId: { from: null, to: input.studentId },
            packageId: { from: null, to: input.packageId ?? null },
            itemCount: { from: null, to: exercises.length }
          }
        });
      });
      log.info('exercise.batch.assigned', { batchId, items: exercises.length, via: input.via });

      const batches = await this.listBatches({ studentId: input.studentId, limit: 20 });
      const found = batches.find((b) => b.id === batchId);
      return found as BatchRecord;
    },

    async listBatches(filters: { studentId: string; limit?: number }): Promise<BatchRecord[]> {
      const limit = Math.min(Math.max(filters.limit ?? 30, 1), 100);
      const batchRows = await db.query<BatchDbRow>(
        `SELECT b.id, b.student_id, b.package_id, b.title, b.note, b.assigned_by, b.assigned_via,
                b.sent_at, b.sent_count, b.created_at,
                s.first_name, s.last_name, st.full_name AS assigned_by_name
           FROM exercise_batches b
           JOIN students s ON s.id = b.student_id
           LEFT JOIN staff st ON st.id = b.assigned_by
          WHERE b.student_id = ?
          ORDER BY b.created_at DESC, b.id DESC
          LIMIT ?`,
        [filters.studentId, limit]
      );
      if (batchRows.length === 0) return [];

      const ids = batchRows.map((r) => r.id);
      const ph = ids.map(() => '?').join(', ');
      const itemRows = await db.query<BatchItemDbRow>(
        `SELECT a.id, a.batch_id, a.exercise_id, a.status, a.feedback, a.graded_at,
                e.title AS exercise_title, e.format, e.external_url,
                (SELECT sub.id FROM exercise_submissions sub WHERE sub.assignment_id = a.id ORDER BY sub.created_at DESC, sub.id DESC LIMIT 1) AS submission_id,
                (SELECT sub.file_name FROM exercise_submissions sub WHERE sub.assignment_id = a.id ORDER BY sub.created_at DESC, sub.id DESC LIMIT 1) AS submission_file,
                (SELECT sub.note FROM exercise_submissions sub WHERE sub.assignment_id = a.id ORDER BY sub.created_at DESC, sub.id DESC LIMIT 1) AS submission_note,
                (SELECT sub.created_at FROM exercise_submissions sub WHERE sub.assignment_id = a.id ORDER BY sub.created_at DESC, sub.id DESC LIMIT 1) AS submission_at
           FROM exercise_assignments a
           JOIN exercises e ON e.id = a.exercise_id
          WHERE a.batch_id IN (${ph})
          ORDER BY e.created_at, a.id`,
        ids
      );
      const itemsByBatch = new Map<string, BatchItemRecord[]>();
      for (const r of itemRows) {
        const list = itemsByBatch.get(r.batch_id) ?? [];
        list.push({
          assignmentId: r.id,
          exerciseId: r.exercise_id,
          exerciseTitle: r.exercise_title,
          format: r.format as ExerciseFormat,
          externalUrl: r.external_url ?? null,
          status: r.status as AssignmentStatus,
          feedback: r.feedback,
          gradedAt: r.graded_at,
          submission: r.submission_id
            ? { id: r.submission_id, filename: r.submission_file ?? null, note: r.submission_note ?? null, createdAt: r.submission_at ?? r.submission_id }
            : null
        });
        itemsByBatch.set(r.batch_id, list);
      }

      return batchRows.map((r) => ({
        id: r.id,
        studentId: r.student_id,
        studentName: `${r.first_name} ${r.last_name}`,
        packageId: r.package_id,
        title: r.title,
        note: r.note,
        assignedBy: r.assigned_by,
        assignedByName: r.assigned_by_name ?? null,
        assignedVia: r.assigned_via as AssignmentVia,
        sentAt: r.sent_at,
        sentCount: r.sent_count,
        createdAt: r.created_at,
        items: itemsByBatch.get(r.id) ?? []
      }));
    },

    /** ارسال/یادآوری: چت ولیّ‌ها → پیام با لینک امن دانلود هر فایل → sent_at/count + audit */
    async sendBatch(batchId: string, input: { note?: string | null }, actor: AuthContext): Promise<{ sent: number; targets: string[] }> {
      if (!sendFn) throw new ConflictError('سرویس اعلان در دسترس نیست');
      const batch = await db.queryOne<BatchDbRow>(
        `SELECT b.*, s.first_name, s.last_name
           FROM exercise_batches b
           JOIN students s ON s.id = b.student_id
          WHERE b.id = ?`,
        [batchId]
      );
      if (!batch) throw new NotFoundError('بستهٔ تکلیف');

      const chats = await guardianChatsOf(batch.student_id);
      if (chats.length === 0) {
        throw new ConflictError('هیچ چت متصلی برای این دانش‌آموز پیدا نشد — اول ولیّ را با کد اتصال به بات وصل کنید');
      }

      // تکلیف‌های فعال بسته + فایل‌های هر تمرین
      const items = await db.query<{ id: string; exercise_id: string; status: string; title: string }>(
        `SELECT a.id, a.exercise_id, a.status, e.title
           FROM exercise_assignments a
           JOIN exercises e ON e.id = a.exercise_id AND e.deleted_at IS NULL
          WHERE a.batch_id = ?
          ORDER BY e.created_at, a.id`,
        [batchId]
      );
      if (items.length === 0) throw new ConflictError('این بستهٔ تکلیف تمرین فعالی ندارد');

      const base = deps.publicBaseUrl ?? null;
      const lines: string[] = [`📚 «${batch.title}»`];
      if (input.note?.trim()) lines.push(`یادداشت: ${input.note.trim()}`);
      else if (batch.note) lines.push(`یادداشت: ${batch.note}`);
      let linkBudget = MAX_EXERCISE_BATCH_LINKS;
      for (const item of items) {
        lines.push('', `• ${item.title}`);
        const ex = await this.getById(item.exercise_id);
        // لینک بازی/تمرین آنلاین بیرونی: مستقیم در پیام خانواده
        if (ex?.externalUrl) lines.push(`🎮 باز کردن بازی/تمرین آنلاین: ${ex.externalUrl}`);
        if (base && linkBudget > 0) {
          const files = ex?.files ?? [];
          for (const f of files) {
            if (linkBudget <= 0) break;
            const token = await this.mintDownloadToken(item.exercise_id, f.id || null);
            lines.push(`📎 ${f.filename}: ${base.replace(/\/+$/, '')}/public/exercise-files/${item.exercise_id}?token=${token}`);
            linkBudget -= 1;
          }
        }
      }
      if (linkBudget <= 0 && base) {
        lines.push(`و فایل‌های بیشتر — با دفتر مرکز تماس بگیرید.`);
      }
      lines.push('', 'پس از انجام تمرین‌ها، نتیجه را با عکس برای همین چت بفرستید.');

      // dedup داخل همان دقیقه (ضد دابل‌کلیک) — یادآوری در دقیقهٔ بعد آزاد است
      const minuteBucket = Math.floor(now().getTime() / 60_000);
      const sent = await sendFn({
        studentId: batch.student_id,
        chats,
        template: 'homework_assigned',
        vars: { studentName: `${batch.first_name ?? ''} ${batch.last_name ?? ''}`.trim() || 'دانش‌آموز', extra: lines.join('\n') },
        dedupBase: `hwb:${batchId}:${minuteBucket}`
      });

      const sentAt = now().toISOString();
      await db.execute(
        `UPDATE exercise_batches SET sent_at = ?, sent_count = sent_count + ? WHERE id = ?`,
        [sentAt, sent, batchId]
      );
      await audit.log({
        actorId: actor.staffId,
        action: 'exercise.batch.sent',
        resourceType: 'exercise_batch',
        resourceId: batchId,
        changes: {
          targets: { from: null, to: chats.length },
          sent: { from: null, to: sent }
        }
      });
      log.info('exercise.batch.sent', { batchId, targets: chats.length, sent });
      return { sent, targets: chats };
    },

    setSendObserver(fn: BatchSendObserver | null): void {
      sendFn = fn;
    },


    async assign(input: AssignExerciseInput, actor: AuthContext): Promise<AssignmentRecord> {
      const row = await db.queryOne<ExerciseRow>(
        `SELECT id, title, published, deleted_at FROM exercises WHERE id = ?`,
        [input.exerciseId]
      );
      if (!row || row.deleted_at) throw new NotFoundError('تمرین');
      if (row.published !== 1) throw new ConflictError('تمرین منتشرشده نیست — ابتدا آن را منتشر کنید');

      const student = await db.queryOne<{ id: string; first_name: string; last_name: string }>(
        `SELECT id, first_name, last_name FROM students WHERE id = ? AND active = 1`,
        [input.studentId]
      );
      if (!student) throw new NotFoundError('دانش‌آموز');

      const id = crypto.randomUUID();
      const via: AssignmentVia = input.via === 'panel' ? 'panel' : 'bot';
      const status: AssignmentStatus = 'assigned';

      await db.transaction(async (tx) => {
        await tx.execute(
          `INSERT INTO exercise_assignments (id, exercise_id, student_id, assigned_by, assigned_via, note, status)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [id, input.exerciseId, input.studentId, input.assignedBy, via, input.note?.trim() ? input.note.trim() : null, status]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'exercise.assigned',
          resourceType: 'exercise_assignment',
          resourceId: id,
          changes: {
            exerciseId: { from: null, to: input.exerciseId },
            studentId: { from: null, to: input.studentId },
            via: { from: null, to: via }
          }
        });
      });

      log.info('exercise.assigned', { id, exerciseId: input.exerciseId, studentId: input.studentId, via });
      const records = await this.listAssignments({ exerciseId: input.exerciseId, limit: 200 });
      const found = records.find((r) => r.id === id);
      return found as AssignmentRecord;
    },

    async listAssignments(filters: { studentId?: string; exerciseId?: string; limit?: number }): Promise<AssignmentRecord[]> {
      const conds: string[] = ['1 = 1'];
      const params: unknown[] = [];
      if (filters.studentId) {
        conds.push('a.student_id = ?');
        params.push(filters.studentId);
      }
      if (filters.exerciseId) {
        conds.push('a.exercise_id = ?');
        params.push(filters.exerciseId);
      }
      const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
      params.push(limit);
      const rows = await db.query<AssignmentRow>(
        `${ASSIGNMENT_SELECT}
          WHERE ${conds.join(' AND ')}
          ORDER BY a.created_at DESC, a.id DESC
          LIMIT ?`,
        params
      );
      return rows.map((r) => ({
        id: r.id,
        exerciseId: r.exercise_id,
        exerciseTitle: r.exercise_title,
        studentId: r.student_id,
        studentName: `${r.first_name} ${r.last_name}`,
        assignedBy: r.assigned_by,
        via: r.assigned_via as AssignmentVia,
        note: r.note,
        status: r.status as AssignmentStatus,
        createdAt: r.created_at,
        feedback: r.feedback,
        gradedBy: r.graded_by,
        gradedByName: r.graded_by_name,
        gradedAt: r.graded_at
      }));
    },

    // ───────────── c — تصحیح تکلیف ─────────────

    async gradeAssignment(assignmentId: string, input: { feedback: string }, actor: AuthContext): Promise<AssignmentRecord> {
      const feedback = input.feedback.replace(/\s+/g, ' ').trim();
      const len = Array.from(feedback).length;
      if (len < EXERCISE_FEEDBACK_MIN) {
        throw new ValidationError(`بازخورد باید حداقل ${EXERCISE_FEEDBACK_MIN} نویسه باشد`);
      }
      const trimmed = Array.from(feedback).slice(0, EXERCISE_FEEDBACK_MAX).join('');

      const row = await db.queryOne<AssignmentRow>(
        `${ASSIGNMENT_SELECT}
          WHERE a.id = ?`,
        [assignmentId]
      );
      if (!row) throw new NotFoundError('تکلیف');
      if (row.status === 'cancelled') throw new ConflictError('این تکلیف لغو شده است');
      if (row.status === 'corrected') throw new ConflictError('این تکلیف قبلاً تصحیح شده است');
      if (row.status !== 'done') {
        throw new ConflictError('تصحیح فقط برای تکلیفِ انجام‌شده (بازگشتی ثبت‌شده) ممکن است');
      }

      // گیت: ثبت‌کنندهٔ تکلیف (staff) یا مدیر — ثبت‌کنندهٔ کلاس (class:*) هر همکار مرکز مجاز
      const isClassAssigner = row.assigned_by.startsWith('class:');
      if (!isClassAssigner && row.assigned_by !== actor.staffId && actor.role !== 'manager') {
        throw new ForbiddenError('تصحیح فقط توسط ثبت‌کنندهٔ تکلیف یا مدیر مجاز است');
      }

      await db.execute(
        `UPDATE exercise_assignments SET status = 'corrected', feedback = ?, graded_by = ?, graded_at = ? WHERE id = ?`,
        [trimmed, actor.staffId, now().toISOString(), assignmentId]
      );
      await audit.log({
        actorId: actor.staffId,
        action: 'exercise.corrected',
        resourceType: 'exercise_assignment',
        resourceId: assignmentId,
        changes: {
          status: { from: row.status, to: 'corrected' },
          feedbackLength: { from: null, to: len } // §20 — متن بازخورد در audit نمی‌آید
        }
      });
      log.info('exercise.corrected', { assignmentId, len, by: actor.staffId });

      const updated = await db.queryOne<AssignmentRow>(
        `${ASSIGNMENT_SELECT}
          WHERE a.id = ?`,
        [assignmentId]
      );
      const record = assignmentRowToRecord(updated!);
      // ناظر اعلان — خطا عملیات را fail نمی‌کند (الگوی todos.setNotifier)
      if (gradeObserver) {
        try {
          await gradeObserver(record);
        } catch (err) {
          log.warn('exercise.grade_observer_failed', { assignmentId, error: String(err) });
        }
      }
      return record;
    },

    // ───────────── حلقهٔ بازگشت فایل ─────────────

    /**
     * تصمیم قطعی مسیر پیام رسانه‌ای خانواده:
     * دقیقاً یک تکلیف باز → auto | چند تکلیف باز → pick (سقف ۱۰) |
     * بدون باز ولی بازگشتی در پنجرهٔ ۴۸ ساعت → extra (صفحهٔ بعدی همان تکلیف) | none
     */
    async resolveSubmissionTarget(studentIds: string[]): Promise<SubmissionTarget> {
      const unique = [...new Set(studentIds)].filter((id) => id.length > 0);
      if (unique.length === 0) return { mode: 'none' };

      const placeholders = unique.map(() => '?').join(', ');
      const pendingRows = await db.query<AssignmentRow>(
        `SELECT a.id, a.exercise_id, a.student_id, a.assigned_by, a.assigned_via, a.note, a.status, a.created_at,
                a.feedback, a.graded_by, a.graded_at, gs.full_name AS graded_by_name,
                e.title AS exercise_title, s.first_name, s.last_name
           FROM exercise_assignments a
           JOIN exercises e ON e.id = a.exercise_id AND e.deleted_at IS NULL
           JOIN students s ON s.id = a.student_id
           LEFT JOIN staff gs ON gs.id = a.graded_by
          WHERE a.student_id IN (${placeholders}) AND a.status = 'assigned'
          ORDER BY a.created_at DESC, a.id DESC`,
        unique
      );

      if (pendingRows.length === 1) {
        return { mode: 'auto', assignment: assignmentRowToRecord(pendingRows[0]) };
      }
      if (pendingRows.length > 1) {
        return {
          mode: 'pick',
          assignments: pendingRows.slice(0, 10).map((r) => assignmentRowToRecord(r))
        };
      }

      // پنجرهٔ پیوست: آخرین بازگشتیِ اخیر → صفحهٔ بعدی همان تکلیف
      const windowLabel = `-${SUBMISSION_ATTACH_WINDOW_HOURS} hours`;
      const extraRow = await db.queryOne<AssignmentRow>(
        `SELECT a.id, a.exercise_id, a.student_id, a.assigned_by, a.assigned_via, a.note, a.status, a.created_at,
                a.feedback, a.graded_by, a.graded_at, gs.full_name AS graded_by_name,
                e.title AS exercise_title, s.first_name, s.last_name
           FROM exercise_submissions sub
           JOIN exercise_assignments a ON a.id = sub.assignment_id AND a.status != 'cancelled'
           JOIN exercises e ON e.id = a.exercise_id AND e.deleted_at IS NULL
           JOIN students s ON s.id = a.student_id
           LEFT JOIN staff gs ON gs.id = a.graded_by
          WHERE sub.student_id IN (${placeholders}) AND sub.created_at >= datetime('now', ?)
          ORDER BY sub.created_at DESC, sub.id DESC
          LIMIT 1`,
        [...unique, windowLabel]
      );
      if (extraRow) {
        return { mode: 'extra', assignment: assignmentRowToRecord(extraRow) };
      }
      return { mode: 'none' };
    },

    /** ثبت نتیجهٔ بازگشتی: فایل در ObjectStore + رکورد + done تکلیف + audit هم‌تراکنش */
    async addSubmission(input: AddSubmissionInput, actor: AuthContext): Promise<SubmissionRecord> {
      const assignment = await db.queryOne<{ id: string; student_id: string; status: string }>(
        `SELECT a.id, a.student_id, a.status
           FROM exercise_assignments a
           JOIN exercises e ON e.id = a.exercise_id AND e.deleted_at IS NULL
          WHERE a.id = ?`,
        [input.assignmentId]
      );
      if (!assignment) throw new NotFoundError('تکلیف');
      if (assignment.student_id !== input.studentId) {
        throw new ValidationError('تکلیف متعلق به این دانش‌آموز نیست');
      }
      if (assignment.status === 'cancelled') {
        throw new ConflictError('این تکلیف لغو شده است');
      }

      const prepared = await validateFile(input.file);

      const note = input.note?.trim() ? Array.from(input.note.trim()).slice(0, SUBMISSION_NOTE_MAX).join('') : null;
      const id = crypto.randomUUID();
      const key = `submission/${id}`;
      await storage.put(key, prepared.bytes, prepared.mime);

      await db.transaction(async (tx) => {
        await tx.execute(
          `INSERT INTO exercise_submissions (id, assignment_id, student_id, file_name, file_mime, file_size, file_key, source_chat_id, note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            input.assignmentId,
            input.studentId,
            prepared.filename,
            prepared.mime,
            prepared.size,
            key,
            input.sourceChatId?.trim() ? input.sourceChatId.trim() : null,
            note
          ]
        );
        if (assignment.status === 'assigned') {
          await tx.execute(
            `UPDATE exercise_assignments SET status = 'done' WHERE id = ?`,
            [input.assignmentId]
          );
        }
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'exercise.submitted',
          resourceType: 'exercise_assignment',
          resourceId: input.assignmentId,
          changes: {
            submissionId: { from: null, to: id },
            studentId: { from: null, to: input.studentId },
            filename: { from: null, to: prepared.filename },
            sizeBytes: { from: null, to: prepared.size }
          }
        });
      });

      log.info('exercise.submitted', { id, assignmentId: input.assignmentId, size: prepared.size });
      const records = await this.listSubmissions({ assignmentId: input.assignmentId, limit: 50 });
      const found = records.find((r) => r.id === id);
      return found as SubmissionRecord;
    },

    /** فهرست بازگشتی‌ها — پنل و تایید بات */
    async listSubmissions(filters: ListSubmissionsFilters): Promise<SubmissionRecord[]> {
      const conds: string[] = ['1 = 1'];
      const params: unknown[] = [];
      if (filters.studentId) {
        conds.push('sub.student_id = ?');
        params.push(filters.studentId);
      }
      if (filters.assignmentId) {
        conds.push('sub.assignment_id = ?');
        params.push(filters.assignmentId);
      }
      const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
      params.push(limit);
      const rows = await db.query<SubmissionRow>(
        `SELECT sub.id, sub.assignment_id, sub.student_id, sub.file_name, sub.file_mime, sub.file_size,
                sub.file_key, sub.source_chat_id, sub.note, sub.created_at,
                a.exercise_id, a.status AS assignment_status, a.feedback AS assignment_feedback, a.graded_at AS assignment_graded_at,
                e.title AS exercise_title, s.first_name, s.last_name
           FROM exercise_submissions sub
           JOIN exercise_assignments a ON a.id = sub.assignment_id
           JOIN exercises e ON e.id = a.exercise_id
           JOIN students s ON s.id = sub.student_id
          WHERE ${conds.join(' AND ')}
          ORDER BY sub.created_at DESC, sub.id DESC
          LIMIT ?`,
        params
      );
      return rows.map((r) => ({
        id: r.id,
        assignmentId: r.assignment_id,
        exerciseId: r.exercise_id,
        exerciseTitle: r.exercise_title,
        studentId: r.student_id,
        studentName: `${r.first_name} ${r.last_name}`,
        file:
          r.file_key && r.file_name
            ? { filename: r.file_name, mime: r.file_mime ?? 'application/octet-stream', size: r.file_size ?? 0 }
            : null,
        note: r.note,
        sourceChatId: r.source_chat_id,
        createdAt: r.created_at,
        assignment: {
          status: r.assignment_status as SubmissionRecord['assignment']['status'],
          feedback: r.assignment_feedback,
          gradedAt: r.assignment_graded_at
        }
      }));
    },

    /** دانلود فایل بازگشتی برای کارکنان — بدون گیت نقش اضافه (خواندن پنل) */
    async getSubmissionFile(submissionId: string): Promise<{ bytes: Uint8Array; filename: string; mime: string } | null> {
      const row = await db.queryOne<{ file_key: string | null; file_name: string | null; file_mime: string | null }>(
        `SELECT file_key, file_name, file_mime FROM exercise_submissions WHERE id = ?`,
        [submissionId]
      );
      if (!row || !row.file_key || !row.file_name) return null;
      const obj = await storage.get(row.file_key);
      if (!obj) return null;
      return { bytes: obj.bytes, filename: row.file_name, mime: row.file_mime ?? obj.mime };
    }
  };
}

/** نوع بازگشتی کارخانه — برای وایرینگ و تزریق در notify */
export type ExerciseBankService = ReturnType<typeof createExerciseBankService>;

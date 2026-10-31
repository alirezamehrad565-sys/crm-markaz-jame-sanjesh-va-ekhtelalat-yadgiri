import type { AuthContext } from '@core/shared';
import { ConflictError, NotFoundError, ValidationError } from '@core/errors';
import type { NotifyService, MediaFetcher, BotMedia } from '@core/notify';
import type { ObjectStore } from '@core/storage';
import { renderTemplate } from '@core/notify';
import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { SettingsService } from '@app/settings';
import type {
  DocBotReply,
  DocRecipient,
  DocumentRequest,
  DocumentRequestDeps,
  NewDocumentRequestInput,
  ReceivedDoc
} from './types';
import {
  buildDocRequestBody,
  guardDocMedia,
  normalizeDocNote,
  parseDocRecipients,
  parseDocTags,
  resolveDocFileName
} from './pure';

interface DocRequestRow {
  id: string;
  student_id: string;
  templates: string;
  custom_note: string | null;
  status: string;
  sent_at: string;
  closed_at: string | null;
  due_hint: string | null;
  requested_by: string | null;
  requested_by_name: string | null;
  delivered_chats: number;
}

interface ReceivedDocRow {
  id: string;
  student_id: string;
  request_id: string | null;
  media_kind: string;
  file_name: string;
  file_mime: string;
  file_size: number;
  file_key: string;
  caption: string | null;
  chat_id: string | null;
  stored_at: string;
}

const DOC_RECIPIENT_KEYS: readonly DocRecipient[] = ['family', 'teacher'];

function parseStoredDocPayload(raw: string): { tags: string[]; recipients: DocRecipient[] } {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return { tags: parsed.filter((x): x is string => typeof x === 'string'), recipients: ['family'] };
    }
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as { t?: unknown; r?: unknown };
      const tags = Array.isArray(obj.t) ? obj.t.filter((x): x is string => typeof x === 'string') : [];
      const recipients = Array.isArray(obj.r)
        ? obj.r.filter((x): x is DocRecipient => DOC_RECIPIENT_KEYS.includes(x as DocRecipient))
        : [];
      return { tags, recipients: recipients.length > 0 ? recipients : ['family'] };
    }
  } catch {
  }
  return { tags: [], recipients: ['family'] };
}

function serializeDocPayload(tags: string[], recipients: DocRecipient[]): string {
  return JSON.stringify({ t: tags, r: recipients });
}

function requestRowToRecord(r: DocRequestRow): DocumentRequest {
  const { tags, recipients } = parseStoredDocPayload(r.templates);
  return {
    id: r.id,
    studentId: r.student_id,
    tags,
    recipients,
    customNote: r.custom_note,
    status: r.status as DocumentRequest['status'],
    sentAt: r.sent_at,
    closedAt: r.closed_at,
    dueHint: r.due_hint,
    requestedByName: r.requested_by_name,
    deliveredChats: r.delivered_chats ?? 0
  };
}

function docRowToRecord(r: ReceivedDocRow): ReceivedDoc {
  return {
    id: r.id,
    studentId: r.student_id,
    requestId: r.request_id,
    mediaKind: r.media_kind as ReceivedDoc['mediaKind'],
    fileName: r.file_name,
    mime: r.file_mime,
    size: r.file_size ?? 0,
    caption: r.caption,
    storedAt: r.stored_at,
    chatId: r.chat_id ?? ''
  };
}

const DOC_BOT_ACTOR: AuthContext = {
  staffId: 'bale-bot',
  email: 'bale-bot@system.local',
  role: 'manager',
  displayName: 'بات بله'
};

const DOC_REQUEST_SELECT = `SELECT r.id, r.student_id, r.templates, r.custom_note, r.status, r.sent_at,
       r.closed_at, r.due_hint, r.requested_by, r.delivered_chats,
       s.full_name AS requested_by_name
  FROM document_requests r
  LEFT JOIN staff s ON s.id = r.requested_by`;

export function createDocumentRequestService(deps: DocumentRequestDeps) {
  const { db, audit, logger, storage, mediaFetcher, notify, settings } = deps;
  const log = logger.child('doc-requests');
  const now = deps.now ?? (() => new Date());

  async function familyChatsOf(studentId: string): Promise<string[]> {
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

  async function teacherChatsOf(studentId: string): Promise<string[]> {
    const rows = await db.query<{ chat_id: string }>(
      `SELECT DISTINCT l.chat_id
         FROM class_bot_links l
         JOIN students s ON s.class_id = l.class_id
        WHERE s.id = ? AND l.status = 'linked' AND l.chat_id IS NOT NULL`,
      [studentId]
    );
    return [...new Set(rows.map((r) => r.chat_id))];
  }

  async function linkedStudentIds(chatId: string): Promise<string[]> {
    const rows = await db.query<{ student_id: string }>(
      `SELECT DISTINCT student_id FROM bot_links WHERE chat_id = ? AND status = 'linked' AND student_id IS NOT NULL`,
      [chatId]
    );
    return [...new Set(rows.map((r) => r.student_id))];
  }

  async function classStudentIds(chatId: string): Promise<string[]> {
    const rows = await db.query<{ student_id: string }>(
      `SELECT DISTINCT s.id AS student_id
         FROM class_bot_links l
         JOIN students s ON s.class_id = l.class_id
        WHERE l.chat_id = ? AND l.status = 'linked'`,
      [chatId]
    );
    return [...new Set(rows.map((r) => r.student_id))];
  }

  async function newestOpenRequest(studentIds: string[], needRecipient: DocRecipient | null): Promise<{ id: string; student_id: string } | null> {
    const placeholders = studentIds.map(() => '?').join(', ');
    const rows = await db.query<{ id: string; student_id: string; templates: string }>(
      `SELECT id, student_id, templates FROM document_requests
        WHERE status != 'closed' AND student_id IN (${placeholders})
        ORDER BY sent_at DESC, id DESC LIMIT 25`,
      studentIds
    );
    for (const row of rows) {
      if (!needRecipient) return row;
      if (parseStoredDocPayload(row.templates).recipients.includes(needRecipient)) return row;
    }
    return null;
  }

  return {
    async create(studentId: string, input: NewDocumentRequestInput, actor: AuthContext): Promise<{ request: DocumentRequest; deliveredChats: number }> {
      const student = await db.queryOne<{ id: string; first_name: string; last_name: string }>(
        `SELECT id, first_name, last_name FROM students WHERE id = ?`,
        [studentId]
      );
      if (!student) throw new NotFoundError('دانش‌آموز');

      const tags = parseDocTags(input.tags);
      if (!tags) {
        throw new ValidationError('حداقل یک تگ مدرک انتخاب کنید');
      }
      const recipients = input.recipients === undefined || input.recipients === null
        ? (['family'] as DocRecipient[])
        : parseDocRecipients(input.recipients);
      if (!recipients) {
        throw new ValidationError('گیرندهٔ درخواست نامعتبر است — «خانواده» و/یا «معلم» را انتخاب کنید');
      }
      const customNote = normalizeDocNote(input.customNote);
      const dueHint = normalizeDocNote(input.dueHint, 60);

      const wantFamily = recipients.includes('family');
      const wantTeacher = recipients.includes('teacher');
      const familyChats = wantFamily ? await familyChatsOf(studentId) : [];
      const teacherChats = wantTeacher ? await teacherChatsOf(studentId) : [];
      if (wantFamily && familyChats.length === 0) {
        throw new ValidationError('هیچ گفتگوی بله‌ای به پروندهٔ این دانش‌آموز متصل نیست — ابتدا از کارت «یادآوری و اعلان‌ها» لینک اتصال خانواده را بسازید');
      }
      if (wantTeacher && teacherChats.length === 0) {
        throw new ValidationError('چت معلمِ کلاس این دانش‌آموز در بله متصل نیست — درخواست ارسال نشد؛ گیرندهٔ «معلم» را بردارید یا اتصال چت کلاس را بسازید');
      }
      const chats = [...new Set([...familyChats, ...teacherChats])];

      const id = crypto.randomUUID();
      const studentName = `${student.first_name} ${student.last_name}`.trim();

      await db.execute(
        `INSERT INTO document_requests (id, student_id, templates, custom_note, status, sent_at, due_hint, requested_by, delivered_chats)
         VALUES (?, ?, ?, ?, 'sent', ?, ?, ?, 0)`,
        [id, studentId, serializeDocPayload(tags, recipients), customNote, now().toISOString(), dueHint, actor.staffId]
      );

      const extra = buildDocRequestBody(tags, customNote, dueHint);
      const clinicName = await settings.getClinicName();
      const channel: 'bale' | 'internal' = notify.getChannel('bale') ? 'bale' : 'internal';
      let delivered = 0;
      for (const chatId of chats) {
        const outcome = await notify.enqueue({
          channel,
          template: 'doc_request_sent',
          recipient: chatId,
          studentId,
          payload: { studentName, extra, clinicName },
          dedupKey: `docreq:${id}:${chatId}`
        });
        if (!outcome.duplicate) delivered += 1;
      }
      if (delivered > 0) await notify.dispatchPending(50);

      if (delivered > 0) {
        await db.execute(`UPDATE document_requests SET delivered_chats = ? WHERE id = ?`, [delivered, id]);
      }

      await audit.log({
        actorId: actor.staffId,
        action: 'document.request.sent',
        resourceType: 'document_request',
        resourceId: id,
        changes: {
          studentId: { from: null, to: studentId },
          tags: { from: null, to: tags },
          recipients: { from: null, to: recipients },
          deliveredChats: { from: null, to: delivered }
        }
      });
      log.info('doc.request.sent', { id, studentId, tags, recipients, delivered });

      const row = await db.queryOne<DocRequestRow>(`${DOC_REQUEST_SELECT} WHERE r.id = ?`, [id]);
      return { request: requestRowToRecord(row!), deliveredChats: delivered };
    },

    async listRequests(studentId: string): Promise<DocumentRequest[]> {
      const rows = await db.query<DocRequestRow>(
        `${DOC_REQUEST_SELECT} WHERE r.student_id = ? ORDER BY r.sent_at DESC, r.id DESC LIMIT 100`,
        [studentId]
      );
      return rows.map(requestRowToRecord);
    },

    async listDocs(studentId: string): Promise<ReceivedDoc[]> {
      const rows = await db.query<ReceivedDocRow>(
        `SELECT id, student_id, request_id, media_kind, file_name, file_mime, file_size, file_key, caption, chat_id, stored_at
           FROM student_received_docs
          WHERE student_id = ?
          ORDER BY stored_at DESC, id DESC
          LIMIT 200`,
        [studentId]
      );
      return rows.map(docRowToRecord);
    },

    async close(requestId: string, actor: AuthContext): Promise<DocumentRequest> {
      const row = await db.queryOne<DocRequestRow>(`${DOC_REQUEST_SELECT} WHERE r.id = ?`, [requestId]);
      if (!row) throw new NotFoundError('درخواست مدارک');
      if (row.status === 'closed') throw new ConflictError('این درخواست قبلاً بسته شده است');
      await db.execute(
        `UPDATE document_requests SET status = 'closed', closed_at = ? WHERE id = ?`,
        [now().toISOString(), requestId]
      );
      await audit.log({
        actorId: actor.staffId,
        action: 'document.request.closed',
        resourceType: 'document_request',
        resourceId: requestId,
        changes: { status: { from: row.status, to: 'closed' } }
      });
      log.info('doc.request.closed', { requestId, by: actor.staffId });
      const fresh = await db.queryOne<DocRequestRow>(`${DOC_REQUEST_SELECT} WHERE r.id = ?`, [requestId]);
      return requestRowToRecord(fresh!);
    },

    async tryHandleMedia(chatId: string, media: BotMedia, caption: string | null): Promise<DocBotReply | null> {
      const familyIds = await linkedStudentIds(chatId);
      let openRow = familyIds.length > 0 ? await newestOpenRequest(familyIds, null) : null;
      if (!openRow) {
        const classIds = await classStudentIds(chatId);
        openRow = classIds.length > 0 ? await newestOpenRequest(classIds, 'teacher') : null;
      }
      if (!openRow) return null;

      const studentNameRow = await db.queryOne<{ name: string }>(
        `SELECT first_name || ' ' || last_name AS name FROM students WHERE id = ?`,
        [openRow.student_id]
      );
      const studentName = studentNameRow?.name ?? 'دانش‌آموز';

      const guard = guardDocMedia(media);
      if (guard === 'bad_type') {
        return { text: renderTemplate('bot_doc_bad_type'), buttons: null };
      }
      if (guard === 'too_large') {
        return { text: renderTemplate('bot_doc_too_large'), buttons: null };
      }
      if (!mediaFetcher) {
        return { text: renderTemplate('bot_doc_failed'), buttons: null };
      }

      let fetched;
      try {
        fetched = await mediaFetcher.fetch(media.fileId);
      } catch (err) {
        log.warn('doc.fetch.failed', { chatId, error: err instanceof Error ? err.message : String(err) });
        return { text: renderTemplate('bot_doc_failed'), buttons: null };
      }

      const mime = media.type === 'photo' ? 'image/jpeg' : (media.mime ?? fetched.mime ?? 'application/octet-stream').toLowerCase();
      if (fetched.bytes.length === 0) {
        return { text: renderTemplate('bot_doc_failed'), buttons: null };
      }
      if (guardDocMedia({ type: media.type, mime, size: fetched.bytes.length }) === 'too_large') {
        return { text: renderTemplate('bot_doc_too_large'), buttons: null };
      }

      const id = crypto.randomUUID();
      const key = `doc/${id}`;
      await storage.put(key, fetched.bytes, mime);
      const fileName = resolveDocFileName(media, mime, now().toISOString());

      await db.transaction(async (tx) => {
        await tx.execute(
          `INSERT INTO student_received_docs (id, student_id, request_id, media_kind, file_name, file_mime, file_size, file_key, caption, chat_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, openRow.student_id, openRow.id, media.type, fileName, mime, fetched.bytes.length, key, caption, chatId]
        );
        await tx.execute(
          `UPDATE document_requests SET status = 'received' WHERE id = ? AND status = 'sent'`,
          [openRow.id]
        );
        await audit.logInTransaction(tx, {
          actorId: DOC_BOT_ACTOR.staffId,
          action: 'document.doc.received',
          resourceType: 'student_received_doc',
          resourceId: id,
          changes: {
            requestId: { from: null, to: openRow.id },
            studentId: { from: null, to: openRow.student_id },
            fileName: { from: null, to: fileName },
            sizeBytes: { from: null, to: fetched.bytes.length }
          }
        });
      });

      log.info('doc.received', { id, requestId: openRow.id, studentId: openRow.student_id, size: fetched.bytes.length });
      return { text: renderTemplate('bot_doc_received', { studentName, title: media.type === 'photo' ? 'عکس' : 'فایل' }), buttons: null };
    },

    async getDocFile(docId: string): Promise<{ bytes: Uint8Array; filename: string; mime: string } | null> {
      const row = await db.queryOne<ReceivedDocRow>(
        `SELECT id, student_id, request_id, media_kind, file_name, file_mime, file_size, file_key, caption, chat_id, stored_at
           FROM student_received_docs WHERE id = ?`,
        [docId]
      );
      if (!row) return null;
      const obj = await storage.get(row.file_key);
      if (!obj) return null;
      return { bytes: obj.bytes, filename: row.file_name, mime: row.file_mime ?? obj.mime };
    }
  };
}

export type DocumentRequestService = ReturnType<typeof createDocumentRequestService>;

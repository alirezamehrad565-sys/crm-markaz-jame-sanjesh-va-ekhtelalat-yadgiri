/**
 * ماژول درخواست مدارک از خانواده با بله — سرویس اصلی و منطق کسب‌وکار (m151 — T2)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// جریان: درمانگر درخواست می‌سازد → پیام بله به چت‌های خانوادهٔ متصل (bot_links +
// notification_prefs — همان الگوی notifyHomeworkGraded) → خانواده عکس/فایل می‌فرستد →
// webhook رسانه‌ای (media_received) → tryHandleMedia:
//   * چت بدون اتصال یا بدون درخواست باز → null (جریان بازگشت تکلیف بدون تغییر ادامه می‌دهد)
//   * درخواست باز → دانلود با MediaFetcher → ObjectStore (انبار مشترک بانک تمرین) →
//     رکورد student_received_docs + ارتقای status درخواست sent→received
// الگوها: enqueue/dedup از notify، audit هم‌تراکنش از exercise.addSubmission

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
  DocRequestTemplate,
  DocumentRequest,
  DocumentRequestDeps,
  NewDocumentRequestInput,
  ReceivedDoc
} from './types';
import {
  buildDocRequestBody,
  guardDocMedia,
  normalizeDocNote,
  parseDocTemplates,
  resolveDocFileName
} from './pure';

// ───────────── Row shapes ─────────────

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

function requestRowToRecord(r: DocRequestRow): DocumentRequest {
  let templates: DocRequestTemplate[] = [];
  try {
    const parsed = JSON.parse(r.templates) as unknown;
    if (Array.isArray(parsed)) templates = parsed as DocRequestTemplate[];
  } catch {
    templates = [];
  }
  return {
    id: r.id,
    studentId: r.student_id,
    templates,
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

/** بازیگر بات برای ثبت مدرک و audit — الگوی SUB_ACTOR بات بازگشت تکلیف */
const DOC_BOT_ACTOR: AuthContext = {
  staffId: 'bale-bot',
  email: 'bale-bot@system.local',
  role: 'manager',
  displayName: 'بات بله'
};

/** SELECT مشترک درخواست با نام ثبت‌کننده */
const DOC_REQUEST_SELECT = `SELECT r.id, r.student_id, r.templates, r.custom_note, r.status, r.sent_at,
       r.closed_at, r.due_hint, r.requested_by, r.delivered_chats,
       s.full_name AS requested_by_name
  FROM document_requests r
  LEFT JOIN staff s ON s.id = r.requested_by`;

export function createDocumentRequestService(deps: DocumentRequestDeps) {
  const { db, audit, logger, storage, mediaFetcher, notify, settings } = deps;
  const log = logger.child('doc-requests');
  const now = deps.now ?? (() => new Date());

  /** چت‌های خانوادهٔ متصل — bot_links + prefs بله، ادغام و یکتاسازی (الگوی اعلان غیبت) */
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

  /** دانش‌آموزان متصل به یک chat — bot_links منبع حقیقت اتصال (الگوی بات بازگشت تکلیف) */
  async function linkedStudentIds(chatId: string): Promise<string[]> {
    const rows = await db.query<{ student_id: string }>(
      `SELECT DISTINCT student_id FROM bot_links WHERE chat_id = ? AND status = 'linked' AND student_id IS NOT NULL`,
      [chatId]
    );
    return [...new Set(rows.map((r) => r.student_id))];
  }

  return {
    async create(studentId: string, input: NewDocumentRequestInput, actor: AuthContext): Promise<{ request: DocumentRequest; deliveredChats: number }> {
      const student = await db.queryOne<{ id: string; first_name: string; last_name: string }>(
        `SELECT id, first_name, last_name FROM students WHERE id = ?`,
        [studentId]
      );
      if (!student) throw new NotFoundError('دانش‌آموز');

      const templates = parseDocTemplates(input.templates);
      if (!templates) {
        throw new ValidationError('حداقل یک قالب مدرک معتبر انتخاب کنید');
      }
      const customNote = normalizeDocNote(input.customNote);
      const dueHint = normalizeDocNote(input.dueHint, 60);

      const chats = await familyChatsOf(studentId);
      if (chats.length === 0) {
        throw new ValidationError('هیچ گفتگوی بله‌ای به پروندهٔ این دانش‌آموز متصل نیست — ابتدا از کارت «یادآوری و اعلان‌ها» لینک اتصال خانواده را بسازید');
      }

      const id = crypto.randomUUID();
      const studentName = `${student.first_name} ${student.last_name}`.trim();

      await db.execute(
        `INSERT INTO document_requests (id, student_id, templates, custom_note, status, sent_at, due_hint, requested_by, delivered_chats)
         VALUES (?, ?, ?, ?, 'sent', ?, ?, ?, 0)`,
        [id, studentId, JSON.stringify(templates), customNote, now().toISOString(), dueHint, actor.staffId]
      );

      const extra = buildDocRequestBody(templates, customNote, dueHint);
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
          templates: { from: null, to: templates },
          deliveredChats: { from: null, to: delivered }
        }
      });
      log.info('doc.request.sent', { id, studentId, templates, delivered });

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
      const studentIds = await linkedStudentIds(chatId);
      if (studentIds.length === 0) return null;

      // — درخواست باز همان خانواده (sent یا received؛ closed دیگر نمی‌گیرد) — جدیدترین
      const placeholders = studentIds.map(() => '?').join(', ');
      const openRow = await db.queryOne<{ id: string; student_id: string }>(
        `SELECT id, student_id FROM document_requests
          WHERE status != 'closed' AND student_id IN (${placeholders})
          ORDER BY sent_at DESC, id DESC LIMIT 1`,
        studentIds
      );
      if (!openRow) return null;

      const studentNameRow = await db.queryOne<{ name: string }>(
        `SELECT first_name || ' ' || last_name AS name FROM students WHERE id = ?`,
        [openRow.student_id]
      );
      const studentName = studentNameRow?.name ?? 'دانش‌آموز';

      // گاردها — همان ترتیب بات بازگشت تکلیف: نوع قبل از دانلود، حجم قبل و بعد
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
        // — اولین مدرک، درخواست را به «received» می‌برد (باز می‌ماند تا بسته شود)
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

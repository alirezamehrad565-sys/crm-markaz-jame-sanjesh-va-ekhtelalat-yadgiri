/**
 * اعلان‌های کاربردی و بات‌های نقش‌آگاه بله — بات دریافت بازگشت تمرین
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// حلقهٔ بازگشت فایل تکلیف (سمت خانواده):
// والد عکس/فایل نتیجه را در بله می‌فرستد → تطبیق با تکلیف‌های باز فرزندان →
// دانلود رسانه از بله (MediaFetcher) → ObjectStore → ثبت بازگشت + done تکلیف →
// اعلان به معلم/درمانگر ثبت‌کننده (صف اعلان با dedup)
// تصمیم مسیر قطعی است (resolveSubmissionTarget):
// دقیقاً یک تکلیف باز → پیوست مستقیم | چند تکلیف → منوی انتخاب (state) |
// بدون باز + بازگشتی در پنجرهٔ ۴۸ ساعت → پیوست به همان تکلیف (صفحهٔ بعد) | none
// وضعیت منوی انتخاب در bot_menu_state (کلید sub داخل payload JSON) — همان جدول exb
// با خواندن-نوشتن کل payload تا کلیدهای دیگر از بین نروند.

import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { AuthContext } from '@core/shared';
import { MAX_EXERCISE_FILE_BYTES } from '@core/shared';
import type { InlineButton, NotifyService, MediaFetcher } from '@core/notify';
import { selectClassChats, selectStudentIdsByChat } from '@core/notify';
import { isAllowedExerciseMimeType, sanitizeFilename, truncateLabel } from '@domain/exercise-bank';
import type { AssignmentRecord, ExerciseBankService, SubmissionRecord } from '@domain/exercise-bank';
import type { SettingsService } from '@app/settings';
import { renderTemplate } from '@core/notify';
import type { BotMedia } from '@core/notify';
import type { BotReply } from './exercise-bank-bot';

export interface SubmissionBotDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
  /** هستهٔ صف اعلان — اعلان بازگشت به کارکنان از همین مسیر با dedup */
  notify: NotifyService;
  settings: SettingsService;
  exerciseBank: ExerciseBankService;
  /** دریافت رسانه از بله — بدون توکن بله null است (پاسخ «فعال نیست») */
  mediaFetcher: MediaFetcher | null;
  now?: () => Date;
}

/** بازیگر بات برای ثبت بازگشت و audit */
const SUB_ACTOR: AuthContext = {
  staffId: 'bale-bot',
  email: 'bale-bot@system.local',
  role: 'manager',
  displayName: 'بات بله'
};

/** آیتم منوی انتخاب تکلیف — اندیس callback به این لیست اشاره می‌کند */
interface SubAsgLite {
  id: string;
  studentId: string;
  label: string;
}

/** رسانهٔ موقت پیام خانواده در منوی انتخاب — فقط شناسه (نه بایت) */
interface StashedMedia {
  fileId: string;
  type: 'photo' | 'document';
  fileName: string | null;
  mime: string | null;
  size: number | null;
}

/** سقف آیتم منوی انتخاب (callback فقط اندیس حمل می‌کند) */
const PICK_LIMIT = 10;

export function createExerciseSubmissionBot(deps: SubmissionBotDeps) {
  const { db, audit, logger, notify, settings, exerciseBank, mediaFetcher } = deps;
  const log = logger.child('sub-bot');
  const now = deps.now ?? (() => new Date());

  // ───────────── state helpers — حفظ کلیدهای دیگر payload ─────────────

  interface SubState {
    sub?: { asg?: SubAsgLite[]; media?: StashedMedia; caption?: string | null };
    [key: string]: unknown;
  }

  async function readState(chatId: string): Promise<SubState> {
    const row = await db.queryOne<{ payload: string }>(
      `SELECT payload FROM bot_menu_state WHERE chat_id = ?`,
      [chatId]
    );
    if (!row) return {};
    try {
      const parsed = JSON.parse(row.payload) as SubState;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  async function writeState(chatId: string, state: SubState): Promise<void> {
    await db.execute(
      `INSERT INTO bot_menu_state (chat_id, payload, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(chat_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
      [chatId, JSON.stringify(state), now().toISOString()]
    );
  }

  // ───────────── گیت‌ها ─────────────

  /** کلید قطع مشترک با بانک تمرین (همان سناریوی S3) */
  async function isEnabled(): Promise<boolean> {
    return settings.getExerciseBankEnabled();
  }

  /** دانش‌آموزان متصل chat (والد) — bot_links منبع حقیقت اتصال است */
  async function linkedStudentIds(chatId: string): Promise<string[]> {
    const stmt = selectStudentIdsByChat(chatId);
    const rows = await db.query<{ student_id: string }>(stmt.sql, stmt.params);
    return rows.map((r) => r.student_id);
  }

  const STALE: BotReply = {
    text: '⏳ این فهرست قدیمی است — فایل نتیجه را دوباره در همین چت بفرستید.',
    buttons: null
  };

  // ───────────── پیوست + اعلان ─────────────

  /** نام فایل نهایی — سند: نام اعلامی بله؛ عکس: نام تولیدی خوانا */
  function resolveFileName(media: BotMedia, fetchedMime: string): string {
    if (media.type === 'document' && media.fileName) {
      return sanitizeFilename(media.fileName);
    }
    const stamp = now().toISOString().slice(0, 19).replace(/[-:T]/g, '');
    const ext = fetchedMime.includes('png') ? 'png' : fetchedMime.includes('webp') ? 'webp' : 'jpg';
    return `نتیجه-تمرین-${stamp}.${ext}`;
  }

  /** اعلان بازگشت به ثبت‌کنندهٔ تکلیف (معلم کلاس یا همکار مرکز) — best-effort با dedup */
  async function notifyCreator(assignment: AssignmentRecord, submission: SubmissionRecord): Promise<number> {
    let targets: string[] = [];
    if (assignment.assignedBy.startsWith('class:')) {
      const classId = assignment.assignedBy.slice('class:'.length);
      const rows = await db.query<{ chat_id: string }>(...spreadStmt(selectClassChats(classId)));
      targets = [...new Set(rows.map((r) => r.chat_id))];
    } else {
      const rows = await db.query<{ chat_id: string }>(
        `SELECT chat_id FROM staff_bot_links WHERE staff_id = ? AND status = 'linked' AND chat_id IS NOT NULL`,
        [assignment.assignedBy]
      );
      targets = [...new Set(rows.map((r) => r.chat_id))];
    }

    const clinicName = await settings.getClinicName();
    const extraLines = [`فایل: ${submission.file?.filename ?? '—'}${submission.note ? `\nپیام خانواده: ${submission.note}` : ''}`];
    let enqueued = 0;
    for (const target of targets) {
      const outcome = await notify.enqueue({
        channel: notify.getChannel('bale') ? 'bale' : 'internal',
        template: 'homework_returned',
        recipient: target,
        studentId: assignment.studentId,
        payload: {
          studentName: assignment.studentName,
          exerciseTitle: assignment.exerciseTitle,
          extra: extraLines.join('\n'),
          clinicName
        },
        dedupKey: `hwret:${submission.id}:${target}`
      });
      if (!outcome.duplicate) enqueued += 1;
    }
    if (enqueued > 0) await notify.dispatchPending(50);
    return enqueued;
  }

  /** مسیر مشترک پیوست: گارد حجم/نوع → دانلود → ثبت → اعلان → پاسخ */
  async function attachMedia(
    chatId: string,
    assignment: AssignmentRecord,
    media: BotMedia,
    caption: string | null
  ): Promise<BotReply> {
    if (!mediaFetcher) {
      return { text: renderTemplate('bot_submission_unavailable'), buttons: null };
    }

    // گارد نوع قبل از دانلود — عکس همیشه مجاز؛ سند با لیست whitelist
    const declaredMime = (media.mime ?? 'application/octet-stream').toLowerCase();
    if (media.type === 'document' && !isAllowedExerciseMimeType(declaredMime)) {
      return { text: renderTemplate('bot_submission_bad_type'), buttons: null };
    }
    if (media.size !== null && media.size > MAX_EXERCISE_FILE_BYTES) {
      return { text: renderTemplate('bot_submission_too_large'), buttons: null };
    }

    let fetched;
    try {
      fetched = await mediaFetcher.fetch(media.fileId);
    } catch (err) {
      log.warn('submission.fetch.failed', { chatId, error: err instanceof Error ? err.message : String(err) });
      return { text: renderTemplate('bot_submission_failed'), buttons: null };
    }

    const mime = media.type === 'photo' ? 'image/jpeg' : (media.mime ?? fetched.mime ?? 'application/octet-stream').toLowerCase();
    if (fetched.bytes.length > MAX_EXERCISE_FILE_BYTES) {
      return { text: renderTemplate('bot_submission_too_large'), buttons: null };
    }

    const b64 = bytesToBase64(fetched.bytes);
    const submission = await exerciseBank.addSubmission(
      {
        assignmentId: assignment.id,
        studentId: assignment.studentId,
        file: {
          filename: resolveFileName(media, mime),
          mimeType: mime,
          contentB64: b64
        },
        sourceChatId: chatId,
        note: caption
      },
      SUB_ACTOR
    );

    let enqueued = 0;
    try {
      enqueued = await notifyCreator(assignment, submission);
    } catch (err) {
      // اعلان best-effort است — ثبت بازگشت باید سر جایش بماند
      log.warn('submission.notify.failed', { submissionId: submission.id, error: err instanceof Error ? err.message : String(err) });
    }

    await audit.log({
      actorId: 'bale-bot',
      action: 'exercise.homework.returned',
      resourceType: 'exercise_submission',
      resourceId: submission.id,
      changes: {
        assignmentId: { from: null, to: assignment.id },
        studentId: { from: null, to: assignment.studentId },
        sizeBytes: { from: null, to: submission.file?.size ?? 0 },
        notified: { from: null, to: enqueued }
      }
    });
    log.info('submission.received', {
      submissionId: submission.id,
      assignmentId: assignment.id,
      studentId: assignment.studentId,
      size: submission.file?.size ?? 0,
      enqueued
    });

    return { text: renderTemplate('bot_submission_received', { exerciseTitle: assignment.exerciseTitle }), buttons: null };
  }

  /** base64 تکه‌تکه — همان الگوی d1-store برای دور شدن از محدودیت apply موتورها */
  function bytesToBase64(bytes: Uint8Array): string {
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
  }

  function spreadStmt(stmt: { sql: string; params: unknown[] }): [string, unknown[]] {
    return [stmt.sql, stmt.params];
  }

  // ───────────── نقطهٔ ورود ─────────────

  return {
    /** پیام رسانه‌ای (عکس/سند) از هر chat — نقطهٔ ورود حلقهٔ بازگشت */
    async handleMedia(chatId: string, media: BotMedia, caption: string | null): Promise<BotReply> {
      if (!(await isEnabled())) {
        return { text: renderTemplate('bot_exercise_disabled'), buttons: null };
      }

      const studentIds = await linkedStudentIds(chatId);
      if (studentIds.length === 0) {
        return { text: renderTemplate('bot_submission_denied'), buttons: null };
      }

      const target = await exerciseBank.resolveSubmissionTarget(studentIds);

      if (target.mode === 'none') {
        return { text: renderTemplate('bot_submission_no_pending'), buttons: null };
      }

      if (target.mode === 'pick') {
        // file_id (نه بایت) در state می‌ماند — بعد از انتخاب دوباره از بله دانلود می‌شود
        const state = await readState(chatId);
        state.sub = {
          asg: target.assignments.map((a) => ({
            id: a.id,
            studentId: a.studentId,
            label: `${a.studentName} — ${a.exerciseTitle}`
          })),
          media: { fileId: media.fileId, type: media.type, fileName: media.fileName, mime: media.mime, size: media.size },
          caption: caption
        };
        await writeState(chatId, state);

        const rows: InlineButton[][] = target.assignments.slice(0, PICK_LIMIT).map((a, i) => [
          { text: truncateLabel(`${a.studentName} — ${a.exerciseTitle}`, 40), callbackData: `sub:pick:${i}` }
        ]);
        return {
          text: '📤 نتیجهٔ کدام تکلیف است؟ یکی را انتخاب کنید:',
          buttons: rows
        };
      }

      // auto و extra هر دو یک تکلیف مشخص دارند
      return attachMedia(chatId, target.assignment, media, caption);
    },

    /** «sub:pick:<idx>» — انتخاب تکلیف از منوی خانواده + رسانهٔ موقت همان پیام */
    async handlePick(chatId: string, idx: number): Promise<BotReply> {
      if (!(await isEnabled())) {
        return { text: renderTemplate('bot_exercise_disabled'), buttons: null };
      }
      const state = await readState(chatId);
      const lite = state.sub?.asg?.[idx];
      const stashed = state.sub?.media;
      const caption = (state.sub?.caption as string | null | undefined) ?? null;
      if (!lite || !stashed) return STALE;

      // گیت مجدد — تکلیف باید هنوز باز باشد (نه لغو، نه done از مسیر دیگر)
      const fresh = await db.queryOne<{ status: string }>(
        `SELECT status FROM exercise_assignments WHERE id = ?`,
        [lite.id]
      );
      if (!fresh || fresh.status !== 'assigned') {
        delete state.sub;
        await writeState(chatId, state);
        return STALE;
      }

      const assignments = await exerciseBank.listAssignments({ limit: 200 });
      const assignment = assignments.find((a) => a.id === lite.id);
      if (!assignment) return STALE;

      // state قبل از دانلود پاک می‌شود — دوباره‌فشردن دکمهٔ قدیمی منجر به دوباره‌ثبت نمی‌شود
      delete state.sub;
      await writeState(chatId, state);

      return attachMedia(chatId, assignment, stashed, caption);
    }
  };
}

export type ExerciseSubmissionBot = ReturnType<typeof createExerciseSubmissionBot>;

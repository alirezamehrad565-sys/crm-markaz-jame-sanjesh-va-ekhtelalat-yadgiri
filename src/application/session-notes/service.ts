/**
 * سرویس گزارش جلسه و اقدام بعدی — سرویس اصلی و منطق کسب‌وکار
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// فاز ۲ (گزارش جلسه — Master Spec v2.0 §8) — مالک WRITE فقط سه ستون
// session_note / next_action / session_type_id در appointment_students
// (attendance و بقیهٔ ستون‌ها دست ماژول‌های مالک خودشان است — همان الگوی attendance)
// قواعد:
// - نویسنده: همکارِ همان نوبت یا مدیر؛ منشی/سایرین ۴۰۳ (§8.2)
// - خواندن: همهٔ نقش‌های داخلی آزاد است
// - نوشتن فقط روی نوبتِ غیرلغوشده (لغوشده → ۴۰۹)
// - جایگزینی کامل متن (نه append)؛ متن خالی = پاک کردن گزارش
// - 'none' در ورودی = «هیچ اقدامی» → در DB به‌صورت NULL ذخیره می‌شود (D7)
// - PII §20: متن گزارش هرگز در audit نمی‌آید — فقط طول متن + کد اقدام
// - audit هم‌تراکنش (قانون ۴)؛ بدون bump نسخه نوبت (ستون‌های مستقل)
// فاز ۳ (هوک §37): ورود به next_action=follow_up در همان تراکنش یک پیگیری
// متصل به همان student/appointment می‌سازد (مسئول = نویسنده، مهلت پیش‌فرض +۷ روز).
// فقط روی «ورود» — قبلاً follow_up بود دوباره ساخته نمی‌شود؛ خروج از follow_up
// پیگیری موجود را تغییر نمی‌دهد (مدیریت وضعیت پیگیری با PATCH خودش است).

import type { AuthContext, NextAction } from '@core/shared';
import { FOLLOWUP_DEFAULT_DUE_DAYS, SESSION_NOTE_MAX } from '@core/shared';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@core/errors';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { DbClient } from '@core/db';
import type { FollowUpsService } from '@domain/followups';

export interface SessionNoteDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
  /** فاز ۳ — هوک ساخت پیگیری در همان تراکنش PUT note */
  followups: Pick<FollowUpsService, 'createWithinTx'>;
}

/** رکورد گزارش جلسه — شکل پاسخ API */
export interface SessionNoteRecord {
  appointmentId: string;
  studentId: string;
  /** NULL = ثبت‌نشده/پاک‌شده */
  sessionNote: string | null;
  /** NULL = هیچ اقدامی ('none') */
  nextAction: NextAction | null;
}

export interface SaveSessionNoteInput {
  /** متن کامل گزارش — پس از trim؛ خالی = پاک کردن */
  sessionNote: string;
  /** 'none' = پاک کردن اقدام */
  nextAction: NextAction;
}

export interface SessionNotesService {
  save(appointmentId: string, studentId: string, input: SaveSessionNoteInput, actor: AuthContext): Promise<SessionNoteRecord>;
  get(appointmentId: string, studentId: string): Promise<SessionNoteRecord>;
}

interface SessionNoteRow {
  appt_status: 'scheduled' | 'cancelled';
  staff_id: string;
  student_name: string | null;
  session_note: string | null;
  next_action: string | null;
}

/** 'none' → NULL (قرارداد ذخیره‌سازی D7) */
export function normalizeNextAction(value: NextAction): NextAction | null {
  return value === 'none' ? null : value;
}

const SELECT_NOTE = `
  SELECT a.status AS appt_status, a.staff_id,
         (st.first_name || ' ' || st.last_name) AS student_name,
         s.session_note, s.next_action
    FROM appointments a
    JOIN appointment_students s ON s.appointment_id = a.id
    LEFT JOIN students st ON st.id = s.student_id
   WHERE a.id = ? AND s.student_id = ?`;

export function createSessionNotesService(deps: SessionNoteDeps): SessionNotesService {
  const { db, audit, logger } = deps;
  const log = logger.child('session-notes');

  return {
    async save(appointmentId, studentId, input, actor): Promise<SessionNoteRecord> {
      const note = input.sessionNote.trim();
      if (note.length > SESSION_NOTE_MAX) {
        throw new ValidationError(`متن گزارش جلسه بیش از ${SESSION_NOTE_MAX} نویسه است`);
      }
      const nextAction = normalizeNextAction(input.nextAction);

      return db.transaction(async (tx) => {
        const row = await tx.queryOne<SessionNoteRow>(SELECT_NOTE, [appointmentId, studentId]);
        if (!row) throw new NotFoundError('دانش‌آموز در این نوبت');
        if (row.appt_status === 'cancelled') {
          throw new ConflictError('نوبت لغوشده گزارش جلسه نمی‌گیرد');
        }

        // قاعدهٔ نویسنده (§8.2): همکارِ همان نوبت یا مدیر — بقیه ۴۰۳
        const isOwner = row.staff_id === actor.staffId;
        if (actor.role !== 'manager' && !isOwner) {
          throw new ForbiddenError('ثبت گزارش جلسه فقط توسط همکارِ همان نوبت یا مدیر مجاز است');
        }

        const prevNote = row.session_note ?? '';
        const prevAction = (row.next_action ?? null) as NextAction | null;

        // no-op idempotent — همان محتوا بدون تغییر
        if (prevNote === note && prevAction === nextAction) {
          return { appointmentId, studentId, sessionNote: prevNote.length > 0 ? prevNote : null, nextAction: prevAction };
        }

        await tx.execute(
          `UPDATE appointment_students SET session_note = ?, next_action = ? WHERE appointment_id = ? AND student_id = ?`,
          [note.length > 0 ? note : null, nextAction, appointmentId, studentId]
        );

        // PII §20 — فقط طول متن و کد اقدام؛ نه خود متن
        const created = prevNote.length === 0 && note.length > 0;
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: created ? 'session_note.created' : 'session_note.updated',
          resourceType: 'appointment_student',
          resourceId: `${appointmentId}/${studentId}`,
          changes: {
            session_note: { from: prevNote.length, to: note.length },
            next_action: { from: prevAction, to: nextAction }
          }
        });

        // ─── فاز ۳ — هوک §37: ورود به follow_up → ساخت پیگیری در همین تراکنش ───
        if (nextAction === 'follow_up' && prevAction !== 'follow_up') {
          const studentLabel = (row.student_name ?? '').trim();
          await deps.followups.createWithinTx(
            tx,
            {
              entityType: 'appointment',
              entityId: appointmentId,
              studentId,
              title: studentLabel
                ? `پیگیری اقدام بعدی جلسه — ${studentLabel}`
                : 'پیگیری اقدام بعدی جلسه',
              assigneeId: actor.staffId,
              dueAt: new Date(Date.now() + FOLLOWUP_DEFAULT_DUE_DAYS * 24 * 60 * 60 * 1000).toISOString()
            },
            actor
          );
        }

        log.info(created ? 'session_note.created' : 'session_note.updated', { appointmentId });
        return { appointmentId, studentId, sessionNote: note.length > 0 ? note : null, nextAction };
      });
    },

    async get(appointmentId, studentId): Promise<SessionNoteRecord> {
      const row = await db.queryOne<SessionNoteRow>(SELECT_NOTE, [appointmentId, studentId]);
      if (!row) throw new NotFoundError('دانش‌آموز در این نوبت');
      return {
        appointmentId,
        studentId,
        sessionNote: row.session_note,
        nextAction: (row.next_action ?? null) as NextAction | null
      };
    }
  };
}

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
  followups: Pick<FollowUpsService, 'createWithinTx'>;
}

export interface SessionNoteRecord {
  appointmentId: string;
  studentId: string;
  sessionNote: string | null;
  nextAction: NextAction | null;
}

export interface SaveSessionNoteInput {
  sessionNote: string;
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

        const isOwner = row.staff_id === actor.staffId;
        if (actor.role !== 'manager' && !isOwner) {
          throw new ForbiddenError('ثبت گزارش جلسه فقط توسط همکارِ همان نوبت یا مدیر مجاز است');
        }

        const prevNote = row.session_note ?? '';
        const prevAction = (row.next_action ?? null) as NextAction | null;

        if (prevNote === note && prevAction === nextAction) {
          return { appointmentId, studentId, sessionNote: prevNote.length > 0 ? prevNote : null, nextAction: prevAction };
        }

        await tx.execute(
          `UPDATE appointment_students SET session_note = ?, next_action = ? WHERE appointment_id = ? AND student_id = ?`,
          [note.length > 0 ? note : null, nextAction, appointmentId, studentId]
        );

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

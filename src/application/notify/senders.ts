// بخش «ارسال‌کننده‌ها»: اعلان‌های گزارش، آزادشدن نوبت، چرخهٔ نوبت، پیام آزمایشی و
// اعلان‌های عملیات روزانه (حضور/تمرین/کار ارجاعی). بدنه‌ها عیناً از service.ts آمده‌اند.

import { ConflictError, NotFoundError } from '@core/errors';
import type { AuthContext, Appointment, Todo } from '@core/shared';
import { addDaysYmd, faDigits, jalaliFullLabel, tehranRange, tehranTimeLabel, tehranTodayYmd, tehranYmdOf } from '@core/shared';
import { renderTemplate, rowToPrefs, selectPrefsMany, selectStaffChats, selectClassChats } from '@core/notify';
import type { PrefsRow, SendResult } from '@core/notify';
import { planLifecycleNotifications } from './lifecycle';
import type { LifecycleEvent } from './lifecycle';
import { computeBatchSendAt, isCreatedTemplate } from './batch';
import type { NotifyAppService } from './service';
import { spreadStmt } from './context';
import type { NotifyCtx } from './context';

export function createNotificationSendersSection(ctx: NotifyCtx): Pick<NotifyAppService, 'sendReportToStudentTeacher' | 'sendReportToStudentFamily' | 'notifyWaitlistSlotFreed' | 'notifyAppointmentCreated' | 'notifyAppointmentMoved' | 'notifyAppointmentCancelled' | 'notifyLifecycle' | 'sendTest' | 'notifyAttendanceMarked' | 'notifyHomeworkGraded' | 'notifyTodoAssigned' | 'enqueuePendingAttendanceNudges'> {
  const { deps, db, audit, log, notify, now, appointments, students, studentNamesMap, staffNamesMap } = ctx;

  return {
    async sendReportToStudentTeacher(studentId: string, text: string, actor: AuthContext): Promise<{ enqueued: number; className: string | null }> {
      const student = await students.getStudentById(studentId);
      if (!student) throw new NotFoundError('دانش‌آموز');
      if (!student.classId) throw new ConflictError('این دانش‌آموز کلاسی ندارد — اول در پروفایل، کلاس مدرسه را انتخاب کنید');

      const cls = await db.queryOne<{ name: string }>(`SELECT name FROM classes WHERE id = ?`, [student.classId]);
      const chatRows = await db.query<{ chat_id: string }>(...spreadStmt(selectClassChats(student.classId)));
      const targets = [...new Set(chatRows.map((r) => r.chat_id))];
      if (targets.length === 0) {
        throw new ConflictError('معلم این کلاس هنوز بات را متصل نکرده است — با ساخت «کد اتصال معلم» در بخش مدارس، او را متصل کنید');
      }

      const clinicName = await deps.settings.getClinicName();
      let enqueued = 0;
      for (const chatId of targets) {
        const outcome = await notify.enqueue({
          channel: notify.getChannel('bale') ? 'bale' : 'internal',
          template: 'teacher_report',
          recipient: chatId,
          studentId,
          payload: {
            studentName: `${student.firstName} ${student.lastName}`,
            className: cls?.name ?? '',
            extra: text,
            clinicName
          },
          dedupKey: `teacher-report:${studentId}:${now().toISOString()}:${chatId}`
        });
        if (!outcome.duplicate) enqueued++;
      }
      if (enqueued > 0) await notify.dispatchPending(50);

      await audit.log({
        actorId: actor.staffId,
        action: 'notification.teacher_report',
        resourceType: 'student',
        resourceId: studentId,
        changes: { enqueued: { from: null, to: enqueued }, classId: { from: null, to: student.classId } }
      });
      log.info('teacher.report.sent', { studentId, targets: targets.length, enqueued });
      return { enqueued, className: cls?.name ?? null };
    },

    // پیام آزاد به خانواده: گفتگوهای متصلِ خانواده (bot_links + notification_prefs)
    async sendReportToStudentFamily(studentId: string, text: string, actor: AuthContext): Promise<{ enqueued: number }> {
      const student = await students.getStudentById(studentId);
      if (!student) throw new NotFoundError('دانش‌آموز');

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
      const targets = [...new Set([...linkRows.map((r) => r.chat_id), ...prefRows.map((r) => r.chat_id)])];
      if (targets.length === 0) {
        throw new ConflictError('خانوادهٔ این دانش‌آموز هنوز بات را متصل نکرده است — ابتدا در تب ارتباطات «لینک اتصال خانواده» بسازید و به آنها بدهید');
      }

      const clinicName = await deps.settings.getClinicName();
      let enqueued = 0;
      for (const chatId of targets) {
        const outcome = await notify.enqueue({
          channel: notify.getChannel('bale') ? 'bale' : 'internal',
          template: 'family_report',
          recipient: chatId,
          studentId,
          payload: {
            studentName: `${student.firstName} ${student.lastName}`,
            extra: text,
            clinicName
          },
          dedupKey: `family-report:${studentId}:${now().toISOString()}:${chatId}`
        });
        if (!outcome.duplicate) enqueued++;
      }
      if (enqueued > 0) await notify.dispatchPending(50);

      await audit.log({
        actorId: actor.staffId,
        action: 'notification.family_report',
        resourceType: 'student',
        resourceId: studentId,
        changes: { enqueued: { from: null, to: enqueued } }
      });
      log.info('family.report.sent', { studentId, targets: targets.length, enqueued });
      return { enqueued };
    },


    async notifyWaitlistSlotFreed(appointment: Appointment): Promise<void> {
      try {
        const flags = await deps.settings.getNotifyFlags();
        if (!flags.waitlistEnabled) return;

        const openRow = await db.queryOne<{ n: number }>(
          `SELECT COUNT(*) AS n FROM waitlist WHERE deleted_at IS NULL AND status IN ('waiting', 'called')`
        );
        const openCount = openRow?.n ?? 0;
        if (openCount === 0) return; // لیست انتظار خالی — پیام بی‌مصرف نیست

        const officeRows = await db.query<{ chat_id: string }>(
          `SELECT DISTINCT l.chat_id
             FROM staff_bot_links l JOIN staff s ON s.id = l.staff_id
            WHERE l.status = 'linked' AND s.active = 1 AND s.role_ext IS NULL
              AND s.role IN ('manager', 'secretary')`,
          []
        );
        if (officeRows.length === 0) return;

        const [staffNames, clinicName] = await Promise.all([
          staffNamesMap(),
          deps.settings.getClinicName()
        ]);
        const nameRows = await db.query<{ first_name: string; last_name: string }>(
          `SELECT first_name, last_name FROM waitlist
            WHERE deleted_at IS NULL AND status IN ('waiting', 'called')
            ORDER BY created_at LIMIT 3`,
          []
        );
        const namesLine =
          nameRows.map((r) => `${r.first_name} ${r.last_name}`).join('، ') || '';

        const channel: 'bale' | 'internal' = notify.getChannel('bale') ? 'bale' : 'internal';
        let enqueued = 0;
        let duplicates = 0;
        for (const { chat_id } of officeRows) {
          const outcome = await notify.enqueue({
            channel,
            template: 'waitlist_slot_freed',
            recipient: chat_id,
            staffId: appointment.staffId,
            appointmentId: appointment.id,
            payload: {
              staffName: staffNames.get(appointment.staffId) ?? '',
              dateYmd: tehranYmdOf(appointment.startAt),
              timeLabel: tehranTimeLabel(appointment.startAt),
              extra: namesLine ? `متقاضیان در انتظار: ${namesLine}` : undefined,
              clinicName
            },
            dedupKey: `wl-free:${appointment.id}:${chat_id}`
          });
          if (outcome.duplicate) duplicates += 1;
          else enqueued += 1;
        }
        if (enqueued > 0) await notify.dispatchPending(50);

        await audit.log({
          actorId: 'system',
          action: 'notification.waitlist_slot_freed',
          resourceType: 'appointment',
          resourceId: appointment.id,
          changes: {
            enqueued: { from: null, to: enqueued },
            duplicates: { from: null, to: duplicates },
            openWaitlist: { from: null, to: openCount }
          }
        });
        log.info('waitlist.slot_freed', { appointmentId: appointment.id, enqueued, duplicates });
      } catch (err) {
        log.warn('waitlist.slot_freed.failed', { appointmentId: appointment.id, error: String(err) });
      }
    },


    async notifyAppointmentCreated(appointment: Appointment): Promise<void> {
      await this.notifyLifecycle('created', appointment);
    },

    async notifyAppointmentMoved(appointment: Appointment, previous: { startAt: string; endAt: string }): Promise<void> {
      await this.notifyLifecycle('moved', appointment, previous);
    },

    async notifyAppointmentCancelled(appointment: Appointment): Promise<void> {
      await this.notifyLifecycle('cancelled', appointment);
    },

    async notifyLifecycle(event: LifecycleEvent, appointment: Appointment, previous?: { startAt: string; endAt: string }): Promise<void> {
      const flags = await deps.settings.getNotifyFlags();
      const enabled =
        event === 'created' ? flags.onCreate : event === 'moved' ? flags.onMove : flags.onCancel;
      if (!enabled) return;

      const studentIds = [...new Set(appointment.students.map((s) => s.studentId))];
      const prefsRows = studentIds.length > 0
        ? await db.query<PrefsRow>(...spreadStmt(selectPrefsMany(studentIds)))
        : [];
      const studentTargets = new Map<string, { channel: 'bale' | 'internal'; chatId: string }>();
      for (const row of prefsRows) {
        const prefs = rowToPrefs(row);
        if (prefs.chatId) {
          studentTargets.set(prefs.studentId, { channel: prefs.channel, chatId: prefs.chatId });
        }
      }

      const staffChatRows = await db.query<{ chat_id: string }>(
        ...spreadStmt(selectStaffChats(appointment.staffId))
      );
      const staffChannel: 'bale' | 'internal' = notify.getChannel('bale') ? 'bale' : 'internal';
      const staffChats = staffChatRows.map((r) => r.chat_id);

      const classMap = await students.getClassesForStudents(studentIds);
      const classTargets = new Map<string, { channel: 'bale' | 'internal'; chatId: string; className: string }>();
      for (const [sid, info] of classMap) {
        const chats = await db.query<{ chat_id: string }>(...spreadStmt(selectClassChats(info.classId)));
        for (const r of chats) {
          classTargets.set(sid, { channel: staffChannel, chatId: r.chat_id, className: info.className });
        }
      }

      if (studentTargets.size === 0 && staffChats.length === 0 && classTargets.size === 0) return;

      const [studentNames, staffNames, clinicName] = await Promise.all([
        studentNamesMap(studentIds),
        staffNamesMap(),
        deps.settings.getClinicName()
      ]);

      const plans = planLifecycleNotifications({
        event,
        appointment,
        previous,
        staffName: staffNames.get(appointment.staffId) ?? '',
        studentNames,
        studentTargets,
        staffChats,
        classTargets,
        staffChannel,
        enabled: true, // پرچم بالاتر بررسی شد
        clinicName
      });

      const batchHour = await deps.settings.getBatchHour();
      const nowIsoBatch = now().toISOString();

      let enqueued = 0;
      let duplicates = 0;
      for (const p of plans) {
        const sendAt =
          event === 'created' && isCreatedTemplate(p.template)
            ? computeBatchSendAt({ nowIso: nowIsoBatch, appointmentStartIso: appointment.startAt, batchHour })
            : null;
        const outcome = await notify.enqueue({
          channel: p.channel,
          template: p.template,
          payload: p.payload,
          recipient: p.recipient,
          studentId: p.studentId,
          staffId: p.staffId,
          appointmentId: p.appointmentId,
          dedupKey: p.dedupKey,
          sendAt
        });
        if (outcome.duplicate) duplicates += 1;
        else enqueued += 1;
      }

      if (enqueued > 0) {
        await notify.dispatchPending(50);
      }

      await audit.log({
        actorId: 'system',
        action: `notification.lifecycle.${event}`,
        resourceType: 'appointment',
        resourceId: appointment.id,
        changes: {
          enqueued: { from: null, to: enqueued },
          duplicates: { from: null, to: duplicates }
        }
      });
      log.info('lifecycle.notified', { event, appointmentId: appointment.id, enqueued, duplicates });
    },


    async sendTest(input, actor: AuthContext): Promise<SendResult> {
      const channel = notify.getChannel(input.channel);
      if (!channel) {
        return { ok: false, error: 'CHANNEL_UNAVAILABLE' };
      }
      const text = input.text?.trim() || renderTemplate('generic', { extra: 'پیام آزمایشی سامانه' });
      const result = await channel.send({ to: input.recipient, text });

      await audit.log({
        actorId: actor.staffId,
        action: 'notification.test.send',
        resourceType: 'notification',
        resourceId: input.channel,
        changes: { ok: { from: null, to: result.ok } }
      });
      return result;
    },


    async notifyAttendanceMarked(appointmentId, studentId, status) {
      if (status !== 'absent') return;

      const appt = await db.queryOne<{ start_at: string; status: string }>(
        `SELECT start_at, status FROM appointments WHERE id = ?`,
        [appointmentId]
      );
      if (!appt || appt.status === 'cancelled') return;

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
      const targets = [...new Set([...linkRows.map((r) => r.chat_id), ...prefRows.map((r) => r.chat_id)])];
      if (targets.length === 0) return;

      const [names, clinicName] = await Promise.all([
        studentNamesMap([studentId]),
        deps.settings.getClinicName()
      ]);
      const studentName = names.get(studentId) ?? '';

      const payload = {
        studentName,
        dateYmd: tehranYmdOf(appt.start_at),
        timeLabel: tehranTimeLabel(appt.start_at),
        clinicName
      };

      let enqueued = 0;
      for (const chatId of targets) {
        const outcome = await notify.enqueue({
          channel: notify.getChannel('bale') ? 'bale' : 'internal',
          template: 'attendance_absent',
          recipient: chatId,
          studentId,
          appointmentId,
          payload,
          dedupKey: `att-absent:${appointmentId}:${studentId}:${chatId}`
        });
        if (!outcome.duplicate) enqueued++;
      }
      if (enqueued > 0) await notify.dispatchPending(50);

      await audit.log({
        actorId: 'system',
        action: 'notification.attendance_absent',
        resourceType: 'appointment_student',
        resourceId: `${appointmentId}/${studentId}`,
        changes: { enqueued: { from: null, to: enqueued }, targets: { from: null, to: targets.length } }
      });
      log.info('attendance.absent.notified', { appointmentId, targets: targets.length, enqueued });
    },

    async notifyHomeworkGraded(input) {
      const linkRows = await db.query<{ chat_id: string }>(
        `SELECT DISTINCT chat_id FROM bot_links
          WHERE student_id = ? AND status = 'linked' AND chat_id IS NOT NULL`,
        [input.studentId]
      );
      const prefRows = await db.query<{ chat_id: string }>(
        `SELECT chat_id FROM notification_prefs
          WHERE student_id = ? AND chat_id IS NOT NULL AND channel = 'bale'`,
        [input.studentId]
      );
      const targets = [...new Set([...linkRows.map((r) => r.chat_id), ...prefRows.map((r) => r.chat_id)])];
      if (targets.length === 0) return;

      const clinicName = await deps.settings.getClinicName();
      const channel: 'bale' | 'internal' = notify.getChannel('bale') ? 'bale' : 'internal';
      let enqueued = 0;
      for (const chatId of targets) {
        const outcome = await notify.enqueue({
          channel,
          template: 'homework_graded',
          recipient: chatId,
          studentId: input.studentId,
          payload: {
            studentName: input.studentName,
            exerciseTitle: input.exerciseTitle,
            feedback: input.feedback,
            senderName: input.gradedByName ?? undefined,
            clinicName
          },
          dedupKey: `hw-graded:${input.studentId}:${input.exerciseTitle}:${chatId}`
        });
        if (!outcome.duplicate) enqueued += 1;
      }
      if (enqueued > 0) await notify.dispatchPending(50);

      await audit.log({
        actorId: 'system',
        action: 'notification.homework_graded',
        resourceType: 'exercise_assignment',
        resourceId: input.studentId,
        changes: { enqueued: { from: null, to: enqueued }, targets: { from: null, to: targets.length } }
      });
      log.info('homework.graded.notified', { studentId: input.studentId, targets: targets.length, enqueued });
    },
    async notifyTodoAssigned(todo: Todo): Promise<void> {
      const chatRows = await db.query<{ chat_id: string }>(
        ...spreadStmt(selectStaffChats(todo.assigneeId))
      );
      if (chatRows.length === 0) return;

      const channel: 'bale' | 'internal' = notify.getChannel('bale') ? 'bale' : 'internal';
      const [allStaffNames, clinicName] = await Promise.all([
        staffNamesMap(),
        deps.settings.getClinicName()
      ]);
      const assigneeName = allStaffNames.get(todo.assigneeId) ?? '';
      const assignerName = allStaffNames.get(todo.assignerId) ?? '';

      const extraLines = [`ثبت‌کننده: ${assignerName || '—'}`];
      if (todo.dueAt) {
        extraLines.push(`مهلت: ${jalaliFullLabel(tehranYmdOf(todo.dueAt))} ساعت ${faDigits(tehranTimeLabel(todo.dueAt))}`);
      }

      let enqueued = 0;
      let duplicates = 0;
      for (const r of chatRows) {
        const outcome = await notify.enqueue({
          channel,
          template: 'todo_assigned',
          recipient: r.chat_id,
          staffId: todo.assigneeId,
          payload: {
            staffName: assigneeName,
            taskTitle: todo.title,
            extra: extraLines.join('\n'),
            clinicName
          },
          dedupKey: `todo-assigned:${todo.id}:${todo.assigneeId}`
        });
        if (outcome.duplicate) duplicates += 1;
        else enqueued += 1;
      }
      if (enqueued > 0) await notify.dispatchPending(50);
      log.info('todo.assigned.notified', { todoId: todo.id, enqueued, duplicates, channel });
    },

    async enqueuePendingAttendanceNudges() {
      const today = tehranTodayYmd();
      const weekAgo = addDaysYmd(today, -7);
      const range = tehranRange(weekAgo, today);

      const rows = await db.query<{ staff_id: string; n: number }>(
        `SELECT a.staff_id, COUNT(*) AS n
           FROM appointments a
           JOIN appointment_students s ON s.appointment_id = a.id
          WHERE a.status = 'scheduled'
            AND s.attendance = 'pending'
            AND a.end_at <= ?
            AND a.start_at >= ?
          GROUP BY a.staff_id`,
        [range.end, range.start]
      );
      if (rows.length === 0) return 0;

      const channel: 'bale' | 'internal' = notify.getChannel('bale') ? 'bale' : 'internal';
      const staffNames = await staffNamesMap();
      let enqueued = 0;

      for (const row of rows) {
        const chatRows = await db.query<{ chat_id: string }>(
          ...spreadStmt(selectStaffChats(row.staff_id))
        );
        for (const chatRow of chatRows) {
          const outcome = await notify.enqueue({
            channel,
            template: 'staff_attendance_nudge',
            recipient: chatRow.chat_id,
            staffId: row.staff_id,
            payload: {
              staffName: staffNames.get(row.staff_id) ?? '',
              extra: `${faDigits(String(row.n))} نوبت از جلسات هفته اخیر شما بدون ثبت حضور دانش‌آموز است.`,
              clinicName: await deps.settings.getClinicName()
            },
            dedupKey: `att-nudge:${today}:${row.staff_id}:${chatRow.chat_id}`
          });
          if (!outcome.duplicate) enqueued++;
        }
      }
      if (enqueued > 0) await notify.dispatchPending(50);
      log.info('attendance.nudge.enqueued', { staff: rows.length, enqueued });
      return enqueued;
    },

  };
}

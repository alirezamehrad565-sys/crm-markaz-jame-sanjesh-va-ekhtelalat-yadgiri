// بخش «گفت‌وگوی بات» سرویس اعلان: هر پیامی که از بله می‌رسد همین‌جا تفسیر می‌شود —
// دستورها، احراز با کد، فایل‌های والد و منوها. بدنه‌ها عیناً از service.ts آمده‌اند ().

import { ConflictError } from '@core/errors';
import type { Appointment } from '@core/shared';
import { LINK_CODE_LENGTH, MAX_EXB_PARENT_FILES, addDaysYmd, addMinutes, faDigits, jalaliFullLabel, iranianWeekdayOfYmd, tehranRange, tehranTimeLabel, tehranTodayYmd, tehranYmdOf } from '@core/shared';
import { listStaff } from '@core/auth';
import { generateLinkCode, parseBotUpdate, renderScheduleMessage, renderTemplate, rowToBotLink, rowToStaffBotLink, rowToClassBotLink, selectBotLinkByCode, selectStaffLinkByCode, selectClassLinkByCode, linkBotLink, linkStaffLink, linkClassLink, resolveChatOwner, unlinkBotLinksByChat, unlinkStaffLinksByChat, unlinkClassLinksByChat, clearPrefsChatByChat, deleteBotMenuStateByChat, upsertPrefs, insertBotLinkLinked, selectBotLinkIdFor, selectStudentIdsByChat, insertStaffLinkLinked, selectStaffLinkIdFor, normalizePhoneDigits, renderFollowupsMessage, renderAttendanceSummary } from '@core/notify';
import type { BotLinkRow, StaffBotLinkRow, ClassBotLinkRow, InlineButton, IdentityFormat, AttendanceChildSummary, BotMedia, AwSection } from '@core/notify';
import { truncateLabel } from '@domain/exercise-bank';
import { buildScheduleEntries } from './lifecycle';
import { groupFollowUpsForBot } from './digest';
import type { AwBotReply } from './awareness-bot';
import type { NotifyAppService, BotReply } from './service';
import { BOT_ACTOR, spreadStmt } from './context';
import type { NotifyCtx } from './context';

const STAFF_ROLE_LABEL: Record<string, string> = {
  manager: 'سمت: مدیر مرکز',
  therapist: 'سمت: همکار (متخصص)',
  secretary: 'سمت: منشی',
  supervisor: 'سمت: ناظر اداره'
};


export function buildBotKeyboard(owner: { kind: string; role: string | null } | null): string[][] {
  const aboutRow = ['درباره مرکز', 'راهنما'];
  const unlinkRow = ['قطع اتصال'];
  if (!owner) {
    return [
      ['معرفی مرکز', 'خدمات مرکز'],
      ['راه‌های ارتباطی', 'احراز هویت'],
      ['فایل‌های آموزشی']
    ];
  }
  if (owner.kind === 'staff') {
    if (owner.role === 'manager' || owner.role === 'secretary' || owner.role === 'therapist') {
      return [
        ['نوبت‌های من', 'پیگیری‌های من'],
        ['کارت‌های آماده', 'فایل‌های آموزشی'],
        aboutRow,
        unlinkRow
      ];
    }
    if (owner.role === 'supervisor') {
      return [aboutRow, unlinkRow];
    }
    return [['نوبت‌های من'], aboutRow, unlinkRow];
  }
  if (owner.kind === 'class') {
    return [
      ['نوبت‌های کلاس من', 'فعالیت کلاس'],
      ['کارت‌های آماده', 'آگاهی‌های اختلالات'],
      aboutRow,
      unlinkRow
    ];
  }
  return [
    ['نوبت‌های دانش‌آموز من', 'تمرین‌های انجام‌نشده'],
    ['چک‌لیست‌های من', 'حضور فرزند'],
    ['فایل‌های آموزشی'],
    aboutRow,
    unlinkRow
  ];
}


function extractMessageText(update: unknown): string | null {
  if (typeof update !== 'object' || update === null) return null;
  const u = update as { message?: { text?: unknown }; edited_message?: { text?: unknown } };
  const msg = u.message ?? u.edited_message;
  const t = msg?.text;
  return typeof t === 'string' && t.trim().length > 0 ? t.trim() : null;
}


export function createBotCommandsSection(ctx: NotifyCtx): Pick<NotifyAppService, 'handleBotUpdate' | 'processLinkCode' | 'handleScheduleCommand' | 'identifyAndReply' | 'handleMyNextCommand' | 'handleBotCancel' | 'resolveOwner' | 'handleFollowupsCommand' | 'handleFollowupDone' | 'handleAttendanceSummary' | 'handleUnlinkCommand' | 'handleClassActivityCommand' | 'handleHelpCommand' | 'handleContactCommand' | 'handleServicesCommand' | 'handleAuthGuideCommand' | 'handlePendingHomeworkCommand' | 'handlePublicFilesCommand' | 'handleParentFileGet'> {
  const { deps, db, audit, log, now, appointments, students, followups, exbBot, subBot, clfBot, awBot, readPfState, writePfState, studentNamesMap, staffNamesMap } = ctx;

  return {
    async handleBotUpdate(update: unknown): Promise<{ handled: boolean; reply: string | null; buttons?: InlineButton[][] | null; keyboard?: string[][] | null }> {
      const cmd = parseBotUpdate(update);
      const rawText = extractMessageText(update);
      if (!cmd) {
        return { handled: false, reply: null };
      }

      if (cmd.kind === 'flow_cancel') {
        const clfActive = await clfBot.readClfFormState(cmd.chatId);
        if (clfActive) {
          const out = await clfBot.abortFill(cmd.chatId);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        return { handled: false, reply: null };
      }

      const clfFormActive = await clfBot.readClfFormState(cmd.chatId);
      if (clfFormActive) {
        if (cmd.kind === 'identify' || cmd.kind === 'unknown') {
          const input = (rawText ?? (cmd.kind === 'unknown' ? cmd.text : cmd.value) ?? '').trim();
          const digits = input.replace(/[^۰-۹0-9]/g, '');
          const norm = digits.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
          if (norm.length > 0) {
            const out = await clfBot.answerItem(cmd.chatId, Number(norm));
            return { handled: true, reply: out.text, buttons: out.buttons };
          }
          return {
            handled: true,
            reply: '📝 پاسخ هر آیتم فقط با دکمه‌های نمره (۰ تا سقف آیتم) ثبت می‌شود — لطفاً از دکمه‌های زیر پیام قبلی استفاده کنید. برای خروج: /cancel',
            buttons: null
          };
        }
        if (cmd.kind !== 'media_received' && cmd.kind !== 'sub_pick' && cmd.kind !== 'clf_do' && cmd.kind !== 'clf_no' && cmd.kind !== 'clf_a') {
          await clfBot.abortFill(cmd.chatId);
        }
      }

      switch (cmd.kind) {
        case 'start': {
          if (cmd.payload) {
            return await this.processLinkCode(cmd.chatId, cmd.payload);
          }
          const owner0 = await this.resolveOwner(cmd.chatId);
          return { handled: true, reply: renderTemplate('bot_welcome', { clinicName: await deps.settings.getClinicName() }), keyboard: buildBotKeyboard(owner0) };
        }

        case 'help': {
          const ownerHelp = await this.resolveOwner(cmd.chatId);
          return { handled: true, reply: await this.handleHelpCommand(cmd.chatId), keyboard: buildBotKeyboard(ownerHelp) };
        }

        case 'about': {
          const ownerAbout = await this.resolveOwner(cmd.chatId);
          return { handled: true, reply: renderTemplate('bot_about', { clinicName: await deps.settings.getClinicName() }), keyboard: buildBotKeyboard(ownerAbout) };
        }

        case 'myid':
          return { handled: true, reply: renderTemplate('bot_myid', { chatId: cmd.chatId }) };

        case 'unknown': {
          const ownerUnknown = await this.resolveOwner(cmd.chatId);
          return { handled: true, reply: await this.handleHelpCommand(cmd.chatId), keyboard: buildBotKeyboard(ownerUnknown) };
        }

        case 'schedule':
          return { handled: true, reply: await this.handleScheduleCommand(cmd.chatId, cmd.scope) };

        case 'my_next': {
          const out = await this.handleMyNextCommand(cmd.chatId);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }

        case 'identify': {
          const reply = await this.identifyAndReply(cmd.chatId, cmd.format, cmd.value);
          const ownerIdentify = await this.resolveOwner(cmd.chatId);
          return { handled: true, reply, keyboard: buildBotKeyboard(ownerIdentify) };
        }

        case 'cancel_ask': {
          const out = await this.handleBotCancel(cmd.chatId, cmd.appointmentId, false);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'cancel_do': {
          const out = await this.handleBotCancel(cmd.chatId, cmd.appointmentId, true);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }

        case 'followups_me': {
          const out = await this.handleFollowupsCommand(cmd.chatId);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'followup_done': {
          const out = await this.handleFollowupDone(cmd.chatId, cmd.followupId);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'attendance_summary': {
          const out = await this.handleAttendanceSummary(cmd.chatId);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'unlink_ask':
        case 'unlink_do':
        case 'unlink_no': {
          const out = await this.handleUnlinkCommand(cmd.chatId, cmd.kind === 'unlink_ask' ? 'ask' : cmd.kind === 'unlink_do' ? 'do' : 'no');
          const ownerAfter = await this.resolveOwner(cmd.chatId);
          return { handled: true, reply: out.text, buttons: out.buttons, keyboard: out.buttons ? undefined : buildBotKeyboard(ownerAfter) };
        }

        case 'contact': {
          const out = await this.handleContactCommand();
          return { handled: true, reply: out.text, buttons: out.buttons, keyboard: buildBotKeyboard(await this.resolveOwner(cmd.chatId)) };
        }
        case 'public_files': {
          const out = await this.handlePublicFilesCommand(cmd.chatId);
          return { handled: true, reply: out.text, buttons: out.buttons, keyboard: buildBotKeyboard(await this.resolveOwner(cmd.chatId)) };
        }
        case 'pfile_get': {
          const out = await this.handleParentFileGet(cmd.chatId, cmd.idx);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }

        case 'services': {
          const out = await this.handleServicesCommand();
          return { handled: true, reply: out.text, buttons: out.buttons, keyboard: buildBotKeyboard(await this.resolveOwner(cmd.chatId)) };
        }
        case 'auth_guide': {
          const out = await this.handleAuthGuideCommand();
          return { handled: true, reply: out.text, buttons: out.buttons, keyboard: buildBotKeyboard(await this.resolveOwner(cmd.chatId)) };
        }
        case 'pending_homework': {
          const out = await this.handlePendingHomeworkCommand(cmd.chatId);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'class_activity': {
          const out = await this.handleClassActivityCommand(cmd.chatId);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'awareness_root': {
          const out: AwBotReply = await awBot.root();
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'awareness_section': {
          const out: AwBotReply = await awBot.section(cmd.section as AwSection, cmd.page);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'awareness_item': {
          const out: AwBotReply = await awBot.item(cmd.section as AwSection, cmd.idx);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'clf_list': {
          const out = await clfBot.listMine(cmd.chatId);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'clf_fill': {
          const out = await clfBot.startFill(cmd.chatId, cmd.eventId);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'clf_a': {
          const out = await clfBot.answerItem(cmd.chatId, cmd.value);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'clf_do': {
          const out = await clfBot.confirmFill(cmd.chatId);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'clf_no': {
          const out = await clfBot.abortFill(cmd.chatId);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }

        case 'exb_root':
        case 'exb_cats':
        case 'exb_list':
        case 'exb_item':
        case 'exb_send':
        case 'exb_file': {
          if (!exbBot) {
            return { handled: true, reply: renderTemplate('bot_exercise_disabled') };
          }
          const out = cmd.kind === 'exb_root'
            ? await exbBot.root(cmd.chatId)
            : await exbBot.handle(cmd.chatId, cmd);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }

        case 'media_received': {
          if (deps.documentRequests) {
            const docOut = await deps.documentRequests.tryHandleMedia(cmd.chatId, cmd.media, cmd.caption);
            if (docOut) return { handled: true, reply: docOut.text, buttons: docOut.buttons };
          }
          if (!subBot) {
            return {
              handled: true,
              reply: deps.exerciseBank
                ? renderTemplate('bot_submission_unavailable')
                : renderTemplate('bot_exercise_disabled')
            };
          }
          const media: BotMedia = cmd.media;
          const out = await subBot.handleMedia(cmd.chatId, media, cmd.caption);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }
        case 'sub_pick': {
          if (!subBot) {
            return { handled: true, reply: renderTemplate('bot_exercise_disabled') };
          }
          const out = await subBot.handlePick(cmd.chatId, cmd.idx);
          return { handled: true, reply: out.text, buttons: out.buttons };
        }

        case 'link':
          return await this.processLinkCode(cmd.chatId, cmd.code);
      }
    },

    async processLinkCode(chatId: string, code: string): Promise<{ handled: boolean; reply: string | null; buttons?: InlineButton[][] | null; keyboard?: string[][] | null }> {
      const cmd = { chatId, code };
      {
        const staffRow = await db.queryOne<StaffBotLinkRow>(...spreadStmt(selectStaffLinkByCode(cmd.code)));
        const staffLink = staffRow ? rowToStaffBotLink(staffRow) : null;

        if (staffLink) {
          const result = await db.execute(
            ...spreadStmt(linkStaffLink(staffLink.id, cmd.chatId, now().toISOString()))
          );
          const changed = (result.meta as { changes?: number } | undefined)?.changes ?? 0;
          if (changed > 0) {
            await audit.log({
              actorId: 'bale-bot',
              action: 'notification.bot.staff_link',
              resourceType: 'staff_bot_link',
              resourceId: staffLink.id,
              changes: { chatId: { from: staffLink.chatId, to: cmd.chatId }, staffId: { from: null, to: staffLink.staffId } }
            });
            const member = await listStaff(db, true).then((rows) => rows.find((r) => r.id === staffLink.staffId));
            const staffOwner = await this.resolveOwner(cmd.chatId);
            return {
              handled: true,
              reply: renderTemplate('bot_link_success', {
                studentName: member?.full_name ?? 'کارمند',
                extra: 'برنامه کلاس‌های خود را با /today و /week بگیرید.'
              }),
              keyboard: buildBotKeyboard(staffOwner)
            };
          }
          if (staffLink.chatId === cmd.chatId) {
            return { handled: true, reply: renderTemplate('bot_link_already'), keyboard: buildBotKeyboard(await this.resolveOwner(cmd.chatId)) };
          }
          log.warn('bot.staff_link.revoked', { code: cmd.code });
          return { handled: true, reply: renderTemplate('bot_link_invalid') };
        }

        const classRow = await db.queryOne<ClassBotLinkRow>(...spreadStmt(selectClassLinkByCode(cmd.code)));
        const classLink = classRow ? rowToClassBotLink(classRow) : null;

        if (classLink) {
          const result = await db.execute(
            ...spreadStmt(linkClassLink(classLink.id, cmd.chatId, now().toISOString()))
          );
          const changed = (result.meta as { changes?: number } | undefined)?.changes ?? 0;
          if (changed > 0) {
            await audit.log({
              actorId: 'bale-bot',
              action: 'notification.bot.class_link',
              resourceType: 'class_bot_link',
              resourceId: classLink.id,
              changes: { chatId: { from: classLink.chatId, to: cmd.chatId }, classId: { from: null, to: classLink.classId } }
            });
            const cls = await db.queryOne<{ name: string; school_name: string }>(
              `SELECT c.name, sc.name AS school_name FROM classes c JOIN schools sc ON sc.id = c.school_id WHERE c.id = ?`,
              [classLink.classId]
            );
            return {
              handled: true,
              reply: renderTemplate('bot_link_success', {
                studentName: cls ? `کلاس ${cls.name} — ${cls.school_name}` : 'کلاس مدرسه',
                extra: 'اعلان مراجعه دانش‌آموزان کلاس شما ارسال می‌شود. برنامه کامل: /today و /week'
              }),
              keyboard: buildBotKeyboard(await this.resolveOwner(cmd.chatId))
            };
          }
          log.warn('bot.class_link.revoked', { code: cmd.code });
          return { handled: true, reply: renderTemplate('bot_link_invalid') };
        }

        const row = await db.queryOne<BotLinkRow>(...spreadStmt(selectBotLinkByCode(cmd.code)));
        const link = row ? rowToBotLink(row) : null;

        if (!link) {
          log.warn('bot.link.invalid', { code: cmd.code });
          return { handled: true, reply: renderTemplate('bot_link_invalid') };
        }

        const result = await db.execute(
          ...spreadStmt(linkBotLink(link.id, cmd.chatId, now().toISOString()))
        );
        const changed = (result.meta as { changes?: number } | undefined)?.changes ?? 0;
        if (changed === 0) {
          if (link.chatId === cmd.chatId) {
            return { handled: true, reply: renderTemplate('bot_link_already'), keyboard: buildBotKeyboard(await this.resolveOwner(cmd.chatId)) };
          }
          log.warn('bot.link.failed', { code: cmd.code });
          return { handled: true, reply: renderTemplate('bot_link_invalid') };
        }

        const flags = await deps.settings.getNotifyFlags();
        await db.execute(
          ...spreadStmt(
            upsertPrefs({
              studentId: link.studentId,
              channel: 'bale',
              chatId: cmd.chatId,
              remindersEnabled: true,
              reminderHoursBefore: flags.defaultReminderHours,
              nowIso: now().toISOString()
            })
          )
        );

        await audit.log({
          actorId: 'bale-bot',
          action: 'notification.bot.link',
          resourceType: 'bot_link',
          resourceId: link.id,
          changes: { chatId: { from: link.chatId, to: cmd.chatId }, studentId: { from: null, to: link.studentId } }
        });

        const student = await students.getStudentById(link.studentId);
        const studentName = student ? `${student.firstName} ${student.lastName}` : '';
        const rebindNote = link.chatId && link.chatId !== cmd.chatId
          ? 'اتصال قبلی این پرونده به این گفتگو منتقل شد.'
          : 'برنامه کلاس‌های خود را با /today و /week بگیرید.';
        return {
          handled: true,
          reply: renderTemplate('bot_link_success', {
            studentName,
            extra: rebindNote
          }),
          keyboard: buildBotKeyboard(await this.resolveOwner(cmd.chatId))
        };
      }
    },

    async handleScheduleCommand(chatId: string, scope: 'today' | 'week'): Promise<string> {
      const owner = await db.queryOne<{ kind: string; ref_id: string }>(
        ...spreadStmt(resolveChatOwner(chatId))
      );
      if (!owner) {
        return renderTemplate('bot_help_guest');
      }

      const clinicName = await deps.settings.getClinicName();
      const todayYmd = tehranTodayYmd();

      let fromYmd: string;
      let toYmd: string;
      let title: string;
      if (scope === 'today') {
        fromYmd = todayYmd;
        toYmd = todayYmd;
        title = `🗓 برنامه امروز شما — ${jalaliFullLabel(todayYmd)}`;
      } else {
        const weekday = iranianWeekdayOfYmd(todayYmd);
        fromYmd = addDaysYmd(todayYmd, -weekday);
        toYmd = addDaysYmd(fromYmd, 6);
        title = `🗓 برنامه این هفته شما — ${jalaliFullLabel(fromYmd)} تا ${jalaliFullLabel(toYmd)}`;
      }

      const { start, end } = tehranRange(fromYmd, toYmd);

      if (owner.kind === 'class') {
        const studentIds = await students.listStudentIdsByClass(owner.ref_id);
        const merged: Appointment[] = [];
        const seen = new Set<string>();
        for (const sid of studentIds) {
          const list = await appointments.list({ studentId: sid, from: start, to: end });
          for (const a of list) {
            if (!seen.has(a.id)) {
              seen.add(a.id);
              merged.push(a);
            }
          }
        }
        const names = await studentNamesMap(studentIds);
        return renderScheduleMessage({
          title,
          entries: buildScheduleEntries(merged, { kind: 'staff', names }),
          clinicName
        });
      }

      const rangeAppointments =
        owner.kind === 'staff'
          ? await appointments.list({ staffId: owner.ref_id, from: start, to: end })
          : await appointments.list({ studentId: owner.ref_id, from: start, to: end });

      const names = new Map<string, string>();
      if (owner.kind === 'staff') {
        const studentIds = [...new Set(rangeAppointments.flatMap((a) => a.students.map((s) => s.studentId)))];
        for (const id of studentIds) {
          const st = await students.getStudentById(id);
          if (st) names.set(id, `${st.firstName} ${st.lastName}`);
        }
        return renderScheduleMessage({
          title,
          entries: buildScheduleEntries(rangeAppointments, { kind: 'staff', names }),
          clinicName
        });
      }

      const staffNames = await staffNamesMap();
      return renderScheduleMessage({
        title,
        entries: buildScheduleEntries(rangeAppointments, { kind: 'student', names: staffNames }),
        clinicName
      });
    },

    async identifyAndReply(chatId: string, format: IdentityFormat, value: string): Promise<string> {
      if (format === 'invalid') {
        return renderTemplate('bot_identify_invalid');
      }

      const nid = format === 'national_id' ? value : null;
      const phone = format === 'phone' ? normalizePhoneDigits(value) : '0' + value;

      const staffConds: string[] = [];
      const staffParams: unknown[] = [];
      if (nid) { staffConds.push('national_id = ?'); staffParams.push(nid); }
      if (phone) { staffConds.push('phone = ?'); staffParams.push(phone); }
      const staffRows = await db.query<{ id: string; full_name: string; role: string }>(
        `SELECT id, full_name, role FROM staff WHERE active = 1 AND (${staffConds.join(' OR ')})`,
        staffParams
      );

      if (staffRows.length === 1) {
        const member = staffRows[0];
        const existing = await db.queryOne<{ id: string }>(
          ...spreadStmt(selectStaffLinkIdFor(member.id, chatId))
        );
        if (!existing) {
          await db.execute(
            ...spreadStmt(
              insertStaffLinkLinked({
                id: crypto.randomUUID(),
                code: generateLinkCode(LINK_CODE_LENGTH),
                staffId: member.id,
                chatId,
                nowIso: now().toISOString()
              })
            )
          );
          await audit.log({
            actorId: 'bale-bot',
            action: 'notification.bot.staff_identify',
            resourceType: 'staff_bot_link',
            resourceId: member.id,
            changes: { chatId: { from: null, to: chatId }, staffId: { from: null, to: member.id } }
          });
          log.info('bot.identify.staff', { staffId: member.id });
        }
        return renderTemplate('bot_identify_staff', {
          name: member.full_name,
          roleLine: STAFF_ROLE_LABEL[member.role]
        });
      }

      if (staffRows.length > 1) {
        log.warn('bot.identify.staff_ambiguous', { count: staffRows.length });
        return renderTemplate('bot_identify_ambiguous');
      }

      const studentConds: string[] = [];
      const studentParams: unknown[] = [];
      if (nid) { studentConds.push('national_id = ?'); studentParams.push(nid); }
      if (phone) { studentConds.push('guardian_phone = ?'); studentParams.push(phone); }
      const studentRows = await db.query<{ id: string; first_name: string; last_name: string }>(
        `SELECT id, first_name, last_name FROM students WHERE active = 1 AND (${studentConds.join(' OR ')})`,
        studentParams
      );

      if (studentRows.length === 0) {
        log.warn('bot.identify.notfound', { format });
        return renderTemplate('bot_identify_notfound');
      }

      const studentIds = studentRows.map((s) => s.id);
      const placeholders = studentIds.map(() => '?').join(',');
      const claimedRows = await db.query<{ student_id: string; chat_id: string }>(
        `SELECT student_id, chat_id FROM bot_links
          WHERE status = 'linked' AND chat_id IS NOT NULL AND chat_id != ?
            AND student_id IN (${placeholders})`,
        [chatId, ...studentIds]
      );
      if (claimedRows.length > 0) {
        await audit.log({
          actorId: 'bale-bot',
          action: 'notification.bot.family_link_denied',
          resourceType: 'bot_link',
          resourceId: claimedRows[0].student_id,
          changes: {
            chatId: { from: null, to: chatId },
            claimedBy: { from: null, to: claimedRows[0].chat_id }
          }
        });
        log.warn('bot.identify.family_link_denied', { claimed: claimedRows.length });
        return renderTemplate('bot_family_link_denied', { clinicName: await deps.settings.getClinicName() });
      }

      const flags = await deps.settings.getNotifyFlags();
      const nameLines: string[] = [];
      for (const s of studentRows) {
        const existing = await db.queryOne<{ id: string }>(
          ...spreadStmt(selectBotLinkIdFor(s.id, chatId))
        );
        if (!existing) {
          await db.execute(
            ...spreadStmt(
              insertBotLinkLinked({
                id: crypto.randomUUID(),
                code: generateLinkCode(LINK_CODE_LENGTH),
                studentId: s.id,
                chatId,
                nowIso: now().toISOString()
              })
            )
          );
          await audit.log({
            actorId: 'bale-bot',
            action: 'notification.bot.identify',
            resourceType: 'bot_link',
            resourceId: s.id,
            changes: { chatId: { from: null, to: chatId }, studentId: { from: null, to: s.id } }
          });
        }
        await db.execute(
          ...spreadStmt(
            upsertPrefs({
              studentId: s.id,
              channel: 'bale',
              chatId,
              remindersEnabled: true,
              reminderHoursBefore: flags.defaultReminderHours,
              nowIso: now().toISOString()
            })
          )
        );
        nameLines.push(`• ${s.first_name} ${s.last_name}`);
      }
      log.info('bot.identify.students', { count: studentRows.length });
      return renderTemplate('bot_identify_students', { extra: nameLines.join('\n') });
    },

    async handleMyNextCommand(chatId: string): Promise<BotReply> {
      const owner = await db.queryOne<{ kind: string; ref_id: string }>(
        ...spreadStmt(resolveChatOwner(chatId))
      );
      if (!owner) {
        return { text: renderTemplate('bot_help_guest'), buttons: null };
      }

      const clinicName = await deps.settings.getClinicName();
      const nowIso = now().toISOString();

      if (owner.kind === 'class') {
        const text = await this.handleScheduleCommand(chatId, 'week');
        return { text, buttons: null };
      }

      if (owner.kind === 'staff') {
        const list = await appointments.list({ staffId: owner.ref_id, from: nowIso, to: addMinutes(nowIso, 7 * 24 * 60) });
        const studentIds = [...new Set(list.flatMap((a) => a.students.map((s) => s.studentId)))];
        const names = await studentNamesMap(studentIds);
        const entries = buildScheduleEntries(list, { kind: 'staff', names });
        const title = `🗓 نوبت‌های پیش‌روی شما — از ${jalaliFullLabel(tehranYmdOf(nowIso))}`;
        const text = renderScheduleMessage({ title, entries, clinicName });

        const sorted = [...list].sort((a, b) => a.startAt.localeCompare(b.startAt));
        const buttons = sorted
          .filter((a) => a.status === 'scheduled')
          .slice(0, 8)
          .map((a) => [{ text: `لغو ${tehranTimeLabel(a.startAt)}`, callbackData: `ask:${a.id}` }]);
        return { text, buttons: buttons.length > 0 ? buttons : null };
      }

      const chatStudentRows = await db.query<{ student_id: string }>(
        ...spreadStmt(selectStudentIdsByChat(chatId))
      );
      const studentIds = [...new Set([...chatStudentRows.map((r) => r.student_id), owner.ref_id])];

      const merged: Appointment[] = [];
      const seen = new Set<string>();
      for (const sid of studentIds) {
        const list = await appointments.list({ studentId: sid, from: nowIso, to: addMinutes(nowIso, 14 * 24 * 60) });
        for (const a of list) {
          if (!seen.has(a.id)) {
            seen.add(a.id);
            merged.push(a);
          }
        }
      }
      merged.sort((a, b) => a.startAt.localeCompare(b.startAt));

      const [staffNames, studentNames] = await Promise.all([
        staffNamesMap(),
        studentNamesMap(studentIds)
      ]);
      const multi = studentIds.length > 1;
      const entries = merged.map((a) => ({
        timeLabel: tehranTimeLabel(a.startAt),
        title: staffNames.get(a.staffId) ?? 'متخصص',
        subtitle: multi
          ? `فرزند: ${a.students.map((s) => studentNames.get(s.studentId)).filter((n): n is string => Boolean(n)).join('، ') || '—'}`
          : undefined,
        cancelled: a.status === 'cancelled'
      }));

      let text = renderScheduleMessage({
        title: '🗓 نوبت‌های پیش‌روی شما',
        entries,
        clinicName
      });
      if (merged.length > 0) {
        text += '\n\nبرای تغییر یا لغو نوبت با دفتر مرکز در تماس باشید.';
      }
      return { text, buttons: null };
    },

    async handleBotCancel(chatId: string, appointmentId: string, confirm: boolean): Promise<BotReply> {
      const owner = await db.queryOne<{ kind: string; ref_id: string }>(
        ...spreadStmt(resolveChatOwner(chatId))
      );
      if (!owner || owner.kind !== 'staff') {
        return { text: renderTemplate('bot_cancel_rejected'), buttons: null };
      }

      const appt = await appointments.getById(appointmentId);
      if (!appt || appt.staffId !== owner.ref_id) {
        return { text: renderTemplate('bot_cancel_rejected'), buttons: null };
      }
      if (appt.status !== 'scheduled') {
        return { text: renderTemplate('bot_cancel_rejected'), buttons: null };
      }

      const vars = {
        dateYmd: jalaliFullLabel(tehranYmdOf(appt.startAt)),
        timeLabel: tehranTimeLabel(appt.startAt),
        studentNames: await studentNamesMap(appt.students.map((s) => s.studentId)).then((m) =>
          appt.students.map((s) => m.get(s.studentId)).filter((n): n is string => Boolean(n)).join('، ')
        )
      };

      if (!confirm) {
        return {
          text: renderTemplate('bot_cancel_ask', vars),
          buttons: [[{ text: 'بله، لغو شود', callbackData: `cancel:${appt.id}` }]]
        };
      }

      try {
        await appointments.cancel(appt.id, appt.version, BOT_ACTOR);
      } catch (err) {
        if (err instanceof ConflictError) {
          log.warn('bot.cancel.conflict', { appointmentId });
          return { text: renderTemplate('bot_cancel_conflict'), buttons: null };
        }
        throw err;
      }
      log.info('bot.cancel.done', { appointmentId });
      return { text: renderTemplate('bot_cancel_success', vars), buttons: null };
    },

    async resolveOwner(chatId: string): Promise<{ kind: string; ref_id: string; role: string | null } | null> {
      return db.queryOne<{ kind: string; ref_id: string; role: string | null }>(
        ...spreadStmt(resolveChatOwner(chatId))
      );
    },

    async handleFollowupsCommand(chatId: string): Promise<BotReply> {
      const owner = await this.resolveOwner(chatId);
      if (!owner) {
        return { text: renderTemplate('bot_help_guest'), buttons: null };
      }
      if (owner.kind !== 'staff') {
        return { text: renderTemplate('bot_followups_denied'), buttons: null };
      }

      const [clinicName, list] = await Promise.all([
        deps.settings.getClinicName(),
        followups.list({ assigneeId: owner.ref_id, group: 'open' }, BOT_ACTOR)
      ]);
      const groups = groupFollowUpsForBot(list, now());
      const text = renderFollowupsMessage({
        title: `✅ پیگیری‌های روی میز شما — ${jalaliFullLabel(tehranTodayYmd(now()))}`,
        groups,
        clinicName
      });

      const ordered = [...groups.overdue, ...groups.today, ...groups.week, ...groups.open];
      const buttons = ordered
        .slice(0, 8)
        .map((it) => [{ text: 'انجام شد', callbackData: `fudone:${it.id}` }]);
      return { text, buttons: buttons.length > 0 ? buttons : null };
    },

    async handleFollowupDone(chatId: string, followupId: string): Promise<BotReply> {
      const owner = await this.resolveOwner(chatId);
      if (!owner || owner.kind !== 'staff') {
        return { text: renderTemplate('bot_followup_rejected'), buttons: null };
      }

      const f = await followups.getById(followupId);
      if (!f || f.assigneeId !== owner.ref_id || (f.status !== 'open' && f.status !== 'in_progress')) {
        return { text: renderTemplate('bot_followup_rejected'), buttons: null };
      }

      try {
        await followups.update(followupId, { status: 'done' }, BOT_ACTOR);
      } catch (err) {
        if (err instanceof ConflictError) {
          log.warn('bot.followup.conflict', { followupId });
          return { text: renderTemplate('bot_followup_rejected'), buttons: null };
        }
        throw err;
      }
      log.info('bot.followup.done', { followupId, chatId });
      return { text: renderTemplate('bot_followup_done', { taskTitle: f.title }), buttons: null };
    },

    async handleAttendanceSummary(chatId: string): Promise<BotReply> {
      const owner = await this.resolveOwner(chatId);
      if (!owner) {
        return { text: renderTemplate('bot_help_guest'), buttons: null };
      }

      let studentIds: string[] = [];
      if (owner.kind === 'student') {
        const chatStudentRows = await db.query<{ student_id: string }>(
          ...spreadStmt(selectStudentIdsByChat(chatId))
        );
        const prefIds = await db.query<{ student_id: string }>(
          `SELECT student_id FROM notification_prefs WHERE chat_id = ? AND reminders_enabled = 1`,
          [chatId]
        );
        studentIds = [...new Set([...chatStudentRows.map((r) => r.student_id), ...prefIds.map((r) => r.student_id), owner.ref_id])];
      }
      if (studentIds.length === 0) {
        return { text: renderTemplate('bot_attendance_denied'), buttons: null };
      }

      const todayYmd = tehranTodayYmd(now());
      const fromYmd = addDaysYmd(todayYmd, -30);
      const { start, end } = tehranRange(fromYmd, todayYmd);
      const names = await studentNamesMap(studentIds);

      const children: AttendanceChildSummary[] = [];
      for (const sid of studentIds) {
        const rows = await db.query<{ attendance: string; cnt: number }>(
          `SELECT s.attendance, COUNT(*) AS cnt
             FROM appointment_students s
             JOIN appointments a ON a.id = s.appointment_id
            WHERE s.student_id = ? AND a.start_at >= ? AND a.start_at <= ?
            GROUP BY s.attendance`,
          [sid, start, end]
        );
        const c: AttendanceChildSummary = { name: names.get(sid) ?? '', present: 0, absent: 0, pending: 0, cancelled: 0 };
        for (const r of rows) {
          if (r.attendance === 'present') c.present += r.cnt;
          else if (r.attendance === 'late') c.present += r.cnt; // — تأخیر هم حضور است
          else if (r.attendance === 'absent') c.absent += r.cnt;
          else if (r.attendance === 'pending') c.pending += r.cnt;
          else if (r.attendance === 'cancelled') c.cancelled += r.cnt;
        }
        children.push(c);
      }

      const clinicName = await deps.settings.getClinicName();
      const text = renderAttendanceSummary({
        title: `📊 حضور فرزند — ۳۰ روز اخیر (از ${jalaliFullLabel(fromYmd)})`,
        children,
        clinicName
      });
      return { text, buttons: null };
    },

    async handleUnlinkCommand(chatId: string, phase: 'ask' | 'do' | 'no'): Promise<BotReply> {
      if (phase === 'ask') {
        const owner2 = await this.resolveOwner(chatId);
        if (!owner2) {
          return { text: renderTemplate('bot_unlink_not_connected'), buttons: null };
        }
        return { text: renderTemplate('bot_unlink_confirm'), buttons: [[
          { text: '✅ بله، قطع شود', callbackData: 'unlink:do' },
          { text: '✖️ انصراف', callbackData: 'unlink:no' }
        ]] };
      }
      if (phase === 'no') {
        return { text: renderTemplate('bot_unlink_cancelled'), buttons: null };
      }
      const owner = await this.resolveOwner(chatId);
      if (!owner) {
        return { text: renderTemplate('bot_unlink_not_connected'), buttons: null };
      }
      const nowIso = now().toISOString();
      const [familyRes, staffRes, classRes, prefsRes, stateRes] = await Promise.all([
        db.execute(...spreadStmt(unlinkBotLinksByChat(chatId))),
        db.execute(...spreadStmt(unlinkStaffLinksByChat(chatId))),
        db.execute(...spreadStmt(unlinkClassLinksByChat(chatId))),
        db.execute(...spreadStmt(clearPrefsChatByChat(chatId))),
        db.execute(...spreadStmt(deleteBotMenuStateByChat(chatId)))
      ]);
      const family = familyRes.meta?.changes ?? 0;
      const staff = staffRes.meta?.changes ?? 0;
      const classes = classRes.meta?.changes ?? 0;
      const prefs = prefsRes.meta?.changes ?? 0;
      await audit.log({
        actorId: 'bale-bot',
        action: 'notification.bot.chat_unlinked',
        resourceType: 'bot_link',
        resourceId: chatId,
        changes: {
          familyLinks: { from: null, to: family },
          staffLinks: { from: null, to: staff },
          classLinks: { from: null, to: classes },
          prefsCleared: { from: null, to: prefs }
        }
      });
      log.info('bot.unlink.done', { chatId, family, staff, classes, prefs, state: stateRes.meta?.changes ?? 0 });
      return { text: renderTemplate('bot_unlink_done'), buttons: null };
    },

    async handleClassActivityCommand(chatId: string): Promise<BotReply> {
      const owner = await this.resolveOwner(chatId);
      if (!owner || owner.kind !== 'class') {
        return { text: renderTemplate('bot_class_activity_denied'), buttons: null };
      }
      const cls = await db.queryOne<{ name: string; school_name: string }>(
        `SELECT c.name, sc.name AS school_name
           FROM classes c JOIN schools sc ON sc.id = c.school_id
          WHERE c.id = ?`,
        [owner.ref_id]
      );
      const openRow = await db.queryOne<{ n: number; students: number }>(
        `SELECT COUNT(*) AS n, COUNT(DISTINCT ea.student_id) AS students
           FROM exercise_assignments ea
           JOIN students s ON s.id = ea.student_id
          WHERE s.class_id = ? AND s.active = 1 AND ea.status = 'assigned'`,
        [owner.ref_id]
      );
      const latest = await db.query<{ exercise_title: string; student_name: string; status: string; created_at: string }>(
        `SELECT e.title AS exercise_title, s.first_name || ' ' || s.last_name AS student_name,
                ea.status, ea.created_at
           FROM exercise_assignments ea
           JOIN exercises e ON e.id = ea.exercise_id
           JOIN students s ON s.id = ea.student_id
          WHERE s.class_id = ? AND s.active = 1
          ORDER BY ea.created_at DESC
          LIMIT 8`,
        [owner.ref_id]
      );
      const HW_STATUS_LABELS: Record<string, string> = {
        assigned: 'باز',
        done: 'انجام‌شده',
        cancelled: 'لغوشده'
      };
      const lines = [
        `تکلیف باز کلاس: ${faDigits(String(openRow?.n ?? 0))} برای ${faDigits(String(openRow?.students ?? 0))} دانش‌آموز`
      ];
      if (latest.length > 0) {
        lines.push('', 'آخرین تکلیف‌ها:');
        for (const r of latest) {
          lines.push(`• ${r.exercise_title} — ${r.student_name} — ${HW_STATUS_LABELS[r.status] ?? r.status}`);
        }
      } else {
        lines.push('', 'هنوز تکلیفی برای دانش‌آموزان کلاس ثبت نشده است.');
      }
      return {
        text: renderTemplate('bot_class_activity', {
          className: cls ? `${cls.name} — ${cls.school_name}` : 'کلاس',
          list: lines.join('\n'),
          clinicName: await deps.settings.getClinicName()
        }),
        buttons: null
      };
    },

    async handleHelpCommand(chatId: string): Promise<string> {
      const owner = await this.resolveOwner(chatId);
      if (!owner) return renderTemplate('bot_help_guest');

      if (owner.kind === 'staff') {
        if (owner.role === 'manager' || owner.role === 'secretary') return renderTemplate('bot_help_office');
        if (owner.role === 'therapist') return renderTemplate('bot_help_therapist');
        if (owner.role === 'supervisor') return renderTemplate('bot_help_supervisor');
        return renderTemplate('bot_help'); // نقش ناشناخته — راهنمای عمومی
      }
      if (owner.kind === 'class') return renderTemplate('bot_help_class');
      return renderTemplate('bot_help_parent');
    },

    async handleContactCommand(): Promise<BotReply> {
      const [phone, clinicName] = await Promise.all([
        deps.settings.getClinicPhone(),
        deps.settings.getClinicName()
      ]);
      return { text: renderTemplate('bot_contact', { phone, clinicName }), buttons: null };
    },

    async handleServicesCommand(): Promise<BotReply> {
      return { text: renderTemplate('bot_services', { clinicName: await deps.settings.getClinicName() }), buttons: null };
    },

    async handleAuthGuideCommand(): Promise<BotReply> {
      return { text: renderTemplate('bot_auth_guide'), buttons: null };
    },

    async handlePendingHomeworkCommand(chatId: string): Promise<BotReply> {
      const owner = await this.resolveOwner(chatId);
      if (!owner) return { text: renderTemplate('bot_help_guest'), buttons: null };
      if (owner.kind !== 'student') {
        return { text: renderTemplate('bot_attendance_denied'), buttons: null };
      }
      if (!deps.exerciseBank) {
        return { text: renderTemplate('bot_exercise_disabled'), buttons: null };
      }

      const chatStudentRows = await db.query<{ student_id: string }>(
        ...spreadStmt(selectStudentIdsByChat(chatId))
      );
      const prefIds = await db.query<{ student_id: string }>(
        `SELECT student_id FROM notification_prefs WHERE chat_id = ? AND reminders_enabled = 1`,
        [chatId]
      );
      const studentIds = [...new Set([...chatStudentRows.map((r) => r.student_id), ...prefIds.map((r) => r.student_id), owner.ref_id])];

      const lines: string[] = [];
      let openTotal = 0;
      const multi = studentIds.length > 1;
      for (const sid of studentIds) {
        const list = await deps.exerciseBank.listAssignments({ studentId: sid, limit: 20 });
        const open = list.filter((a) => a.status === 'assigned');
        if (open.length === 0) continue;
        openTotal += open.length;
        for (const a of open.slice(0, 8)) {
          const who = multi ? `${a.studentName} — ` : '';
          lines.push(`• ${a.exerciseTitle}${who ? ` — ${who}` : ` — ${a.studentName}`}${a.createdAt ? ` (${jalaliFullLabel(tehranYmdOf(a.createdAt))})` : ''}`);
        }
      }

      log.info('bot.pending_homework', { chatId, students: studentIds.length, open: openTotal });
      return {
        text: renderTemplate('bot_pending_homework', {
          clinicName: await deps.settings.getClinicName(),
          list: openTotal > 0
            ? lines.join('\n')
            : '✅ تکلیف بازی برای فرزندان شما باز نیست — عالیت!',
          count: faDigits(String(openTotal))
        }),
        buttons: null
      };
    },

    /* «فایل‌های آموزشی» بر اساس نقش:
       همکار/معلم → راهنمای کارت‌های آماده (دریافت فایل با دکمهٔ جزئیات)
       مهمان → توضیح صادقانه + راه اتصال
       خانواده → فهرست تمرین‌های بازِ فرزندان که فایل دارند + دکمهٔ دریافت با sendDocument */
    async handlePublicFilesCommand(chatId: string): Promise<BotReply> {
      const clinicName = await deps.settings.getClinicName();
      const owner = await this.resolveOwner(chatId);
      if (owner && (owner.kind === 'staff' || owner.kind === 'class')) {
        return { text: renderTemplate('bot_public_files', { clinicName, mode: 'staff' }), buttons: null };
      }
      if (!owner) {
        return { text: renderTemplate('bot_public_files', { clinicName, mode: 'guest' }), buttons: null };
      }
      if (!deps.exerciseBank) {
        return { text: renderTemplate('bot_exercise_disabled'), buttons: null };
      }
      if (!(await deps.settings.getExerciseBankEnabled())) {
        return { text: renderTemplate('bot_exercise_disabled'), buttons: null };
      }
      const chatStudentRows = await db.query<{ student_id: string }>(
        ...spreadStmt(selectStudentIdsByChat(chatId))
      );
      const prefIds = await db.query<{ student_id: string }>(
        `SELECT student_id FROM notification_prefs WHERE chat_id = ? AND reminders_enabled = 1`,
        [chatId]
      );
      const studentIds = [...new Set([...chatStudentRows.map((r) => r.student_id), ...prefIds.map((r) => r.student_id), owner.ref_id])];
      const items: Array<{ e: string; f: string; t: string }> = [];
      const seen = new Set<string>();
      outer:
        for (const sid of studentIds) {
          const list = await deps.exerciseBank.listAssignments({ studentId: sid, limit: 20 });
          const open = list.filter((a) => a.status === 'assigned');
          for (const a of open) {
            const ex = await deps.exerciseBank.getById(a.exerciseId);
            if (!ex || !ex.published)
              continue;
            const fileIds = ex.files.length > 0 ? ex.files.map((f) => f.id) : ex.file ? [''] : [];
            for (const fid of fileIds) {
              const key = `${ex.id}:${fid}`;
              if (seen.has(key))
                continue;
              seen.add(key);
              items.push({ e: ex.id, f: fid, t: a.exerciseTitle });
              if (items.length >= MAX_EXB_PARENT_FILES)
                break outer;
            }
          }
        }
      if (items.length === 0) {
        return { text: renderTemplate('bot_public_files', { clinicName, mode: 'parent_empty' }), buttons: null };
      }
      const state = await readPfState(chatId);
      state.pfl = items;
      await writePfState(chatId, state);
      const buttons = items.map((it, i) => [
        { text: `\u{1F4CE} ${truncateLabel(it.t, 30)}`, callbackData: `pfl:get:${i}` }
      ]);
      log.info('bot.public_files.parent', { chatId, items: items.length });
      return {
        text: renderTemplate('bot_public_files', { clinicName, mode: 'parent', list: items.map((it) => `\u2022 ${it.t}`).join('\n') }),
        buttons
      };
    },

    async handleParentFileGet(chatId: string, idx: number): Promise<BotReply> {
      const owner = await this.resolveOwner(chatId);
      if (!owner)
        return { text: renderTemplate('bot_help_guest'), buttons: null };
      if (!deps.exerciseBank)
        return { text: renderTemplate('bot_exercise_disabled'), buttons: null };
      if (!(await deps.settings.getExerciseBankEnabled())) {
        return { text: renderTemplate('bot_exercise_disabled'), buttons: null };
      }
      const state = await readPfState(chatId);
      const items = state.pfl ?? [];
      const it = items[idx];
      if (!it)
        return { text: renderTemplate('bot_public_files_stale'), buttons: null };
      const ex = await deps.exerciseBank.getById(it.e);
      if (!ex || !ex.published)
        return { text: renderTemplate('bot_file_unavailable'), buttons: null };
      const file = it.f ? await deps.exerciseBank.getAttachmentFile(it.e, it.f) : await deps.exerciseBank.getFile(it.e);
      if (!file)
        return { text: renderTemplate('bot_file_unavailable'), buttons: null };
      if (!deps.fileSender) {
        log.warn('bot.pfile.file_sender_missing', { chatId });
        return { text: renderTemplate('bot_file_failed'), buttons: null };
      }
      let ok = false;
      try {
        ok = await deps.fileSender(chatId, {
          filename: file.filename,
          bytes: file.bytes,
          mime: file.mime,
          caption: `\u{1F4DA} \u00AB${it.t}\u00BB`
        });
      } catch (err) {
        log.warn('bot.pfile.send_error', { chatId, exerciseId: it.e, error: err instanceof Error ? err.message : 'unknown' });
      }
      if (ok) {
        await audit.log({
          actorId: 'bale-bot',
          action: 'exercise.file.sent_to_family',
          resourceType: 'exercise',
          resourceId: it.e,
          changes: { filename: { from: null, to: file.filename } }
        });
      }
      log.info('bot.pfile.sent', { chatId, exerciseId: it.e, ok });
      return { text: renderTemplate(ok ? 'bot_file_sent' : 'bot_file_failed', { filename: file.filename }), buttons: null };
    },

  };
}

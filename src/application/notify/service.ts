import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { AuthContext, BotLinkRecord, ClassBotLinkRecord, DispatchSummary, NotificationPrefs, NotificationRecord, NotificationStatus, ReminderEnqueueSummary, StaffBotLinkRecord, Appointment, Todo } from '@core/shared';
import { REMINDER_HORIZON_HOURS, addMinutes } from '@core/shared';
import { listStaff } from '@core/auth';
import type { AppointmentService } from '@domain/appointment-core';
import type { StudentProfileService } from '@domain/student-profile';
import { createBaleChannel, rowToPrefs, selectPrefsMany, upsertPrefs } from '@core/notify';
import type { NotifyService, NotifyListFilters, PrefsRow, SendResult, InlineButton, IdentityFormat, MediaFetcher } from '@core/notify';
import type { FollowUpsService } from '@domain/followups';
import type { SettingsService } from '@app/settings';
import type { ExerciseBankService, ExerciseFileSender } from '@domain/exercise-bank';
import type { DocumentRequestService } from '@domain/document-requests';

import type { LifecycleEvent } from './lifecycle';
import { buildEnqueueSummary, planReminders } from './reminders';
import type { DigestSummary } from './digest';
import { createExerciseBankBot } from './exercise-bank-bot';
import type { ExerciseBankBot } from './exercise-bank-bot';
import { createExerciseSubmissionBot } from './exercise-submission-bot';
import type { ExerciseSubmissionBot } from './exercise-submission-bot';
import { createCaseEventsBot } from './case-events-bot';
import { createAwarenessBot } from './awareness-bot';
import type { AwarenessBot } from './awareness-bot';
import { BOT_ACTOR, spreadStmt } from './context';
import type { NotifyCtx } from './context';
import { createBotLinksSection } from './bot-links';
import { createBotCommandsSection } from './bot-commands';
import { createDigestSection } from './digest';
import { createNotificationSendersSection } from './senders';

export interface NotifyAppDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
  notify: NotifyService;
  appointments: AppointmentService;
  students: StudentProfileService;
  followups: FollowUpsService;
  settings: SettingsService;
  baleToken?: string | null;
  botUsernameFetcher?: (token: string, fetchImpl?: typeof fetch) => Promise<string | null>;
  webhookSecret?: string | null;
  clinicName?: string;
  exerciseBank?: ExerciseBankService | null;
  documentRequests?: DocumentRequestService | null;
  publicBaseUrl?: string | null;
  mediaFetcher?: MediaFetcher | null;
  caseEvents?: import('@domain/case-events').CaseEventsService | null;
  fileSender?: ExerciseFileSender | null;
  now?: () => Date;
}

export interface UpsertPrefsInput {
  channel?: NotificationPrefs['channel'];
  chatId?: string | null;
  remindersEnabled?: boolean;
  reminderHoursBefore?: number;
}

export async function fetchBaleBotUsername(token: string, fetchImpl?: typeof fetch): Promise<string | null> {
  const doFetch = fetchImpl ?? fetch;
  try {
    const res = await doFetch(`https://tapi.bale.ai/bot${token}/getMe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    });
    const body = (await res.json().catch(() => ({}))) as { result?: { username?: unknown } };
    const username = body?.result?.username;
    if (typeof username !== 'string') return null;
    const clean = username.trim().replace(/^@/, '');
    return /^[A-Za-z0-9_]{2,64}$/.test(clean) ? clean : null;
  } catch {
    return null;
  }
}

export interface BotReply {
  text: string;
  buttons: InlineButton[][] | null;
  keyboard?: string[][] | null;
}

export interface OutboxSummary {
  drafts: NotificationRecord[];
  ready: NotificationRecord[];
  failed: NotificationRecord[];
  counts: Record<NotificationStatus, number>;
}

export interface NotifyAppService {
  listNotifications(filters: NotifyListFilters): Promise<NotificationRecord[]>;
  outbox(): Promise<OutboxSummary>;
  releaseAndDispatch(id: string, actor: AuthContext): Promise<NotificationRecord | null>;
  retryFailed(actor: AuthContext): Promise<number>;
  stats(): Promise<Record<NotificationStatus, number>>;
  dispatchPending(limit?: number): Promise<DispatchSummary>;
  enqueueUpcomingReminders(now?: Date, horizonHours?: number): Promise<ReminderEnqueueSummary>;
  getPrefs(studentId: string): Promise<NotificationPrefs | null>;
  upsertPrefs(studentId: string, input: UpsertPrefsInput, actor: AuthContext): Promise<NotificationPrefs>;
  createLink(studentId: string, actor: AuthContext): Promise<BotLinkRecord>;
  listLinks(studentId: string | undefined, limit?: number): Promise<BotLinkRecord[]>;
  createStaffLink(staffId: string, actor: AuthContext): Promise<StaffBotLinkRecord>;
  listStaffLinks(staffId: string | undefined, limit?: number): Promise<StaffBotLinkRecord[]>;
  createClassLink(classId: string, actor: AuthContext): Promise<ClassBotLinkRecord>;
  listClassLinks(classId: string | undefined, limit?: number): Promise<ClassBotLinkRecord[]>;
  revokeClassLink(id: string, actor: AuthContext): Promise<ClassBotLinkRecord>;
  resolveBotUsername(): Promise<{ username: string | null; source: 'stored' | 'detected' | 'none' }>;
  processLinkCode(chatId: string, code: string): Promise<{ handled: boolean; reply: string | null; buttons?: InlineButton[][] | null; keyboard?: string[][] | null }>;
  sendReportToStudentTeacher(studentId: string, text: string, actor: AuthContext): Promise<{ enqueued: number; className: string | null }>;
  sendReportToStudentFamily(studentId: string, text: string, actor: AuthContext): Promise<{ enqueued: number }>;
  handleBotUpdate(update: unknown): Promise<{ handled: boolean; reply: string | null; buttons?: InlineButton[][] | null; keyboard?: string[][] | null }>;
  handleScheduleCommand(chatId: string, scope: 'today' | 'week'): Promise<string>;
  replyToChat(chatId: string, text: string, buttons?: InlineButton[][] | null, keyboard?: string[][] | null): Promise<SendResult>;
  handleMyNextCommand(chatId: string): Promise<BotReply>;
  identifyAndReply(chatId: string, format: IdentityFormat, value: string): Promise<string>;
  handleBotCancel(chatId: string, appointmentId: string, confirm: boolean): Promise<BotReply>;
  handleFollowupsCommand(chatId: string): Promise<BotReply>;
  handleFollowupDone(chatId: string, followupId: string): Promise<BotReply>;
  handleAttendanceSummary(chatId: string): Promise<BotReply>;
  handleUnlinkCommand(chatId: string, phase: 'ask' | 'do' | 'no'): Promise<BotReply>;
  handleHelpCommand(chatId: string): Promise<string>;
  handleClassActivityCommand(chatId: string): Promise<BotReply>;
  handleContactCommand(): Promise<BotReply>;
  handleServicesCommand(): Promise<BotReply>;
  handleAuthGuideCommand(): Promise<BotReply>;
  handlePendingHomeworkCommand(chatId: string): Promise<BotReply>;
  handlePublicFilesCommand(chatId: string): Promise<BotReply>;
  handleParentFileGet(chatId: string, idx: number): Promise<BotReply>;
  notifyWaitlistSlotFreed(appointment: Appointment): Promise<void>;
  sendDailyDigest(nowDate?: Date): Promise<DigestSummary>;
  enqueueFollowupNudges(nowDate?: Date): Promise<number>;
  enqueueReassessmentNudges(nowDate?: Date): Promise<number>;
  resolveOwner(chatId: string): Promise<{ kind: string; ref_id: string; role: string | null } | null>;
  notifyAppointmentCreated(appointment: Appointment): Promise<void>;
  notifyAppointmentMoved(appointment: Appointment, previous: { startAt: string; endAt: string }): Promise<void>;
  notifyAppointmentCancelled(appointment: Appointment): Promise<void>;
  notifyLifecycle(event: LifecycleEvent, appointment: Appointment, previous?: { startAt: string; endAt: string }): Promise<void>;
  sendTest(input: { channel: NotificationRecord['channel']; recipient: string; text?: string }, actor: AuthContext): Promise<SendResult>;
  isWebhookEnabled(): boolean;
  isWebhookSecretValid(secret: string | undefined): boolean;
  notifyAttendanceMarked(appointmentId: string, studentId: string, status: string): Promise<void>;
  enqueuePendingAttendanceNudges(): Promise<number>;
  notifyHomeworkGraded(input: { studentId: string; studentName: string; exerciseTitle: string; feedback: string; gradedByName: string | null }): Promise<void>;
  notifyTodoAssigned(todo: Todo): Promise<void>;
}

export function createNotifyAppService(deps: NotifyAppDeps): NotifyAppService {
  const { db, audit, logger, notify, appointments, students, followups } = deps;
  const log = logger.child('notifications');
  const now = deps.now ?? (() => new Date());
  const resolveUsernameFromBale = deps.botUsernameFetcher ?? fetchBaleBotUsername;

  const exbBot: ExerciseBankBot | null = deps.exerciseBank
    ? createExerciseBankBot({
        db,
        audit,
        logger,
        notify,
        settings: deps.settings,
        exerciseBank: deps.exerciseBank,
        publicBaseUrl: deps.publicBaseUrl ?? null,
        fileSender: deps.fileSender ?? null,
        now
      })
    : null;

  const subBot: ExerciseSubmissionBot | null =
    deps.exerciseBank && deps.mediaFetcher
      ? createExerciseSubmissionBot({
          db,
          audit,
          logger,
          notify,
          settings: deps.settings,
          exerciseBank: deps.exerciseBank,
          mediaFetcher: deps.mediaFetcher,
          now
        })
      : null;

  const clfBot = createCaseEventsBot({
    db,
    audit,
    logger,
    notify,
    caseEvents: deps.caseEvents ?? null,
    publicBaseUrlEnv: deps.publicBaseUrl ?? null,
    now
  });

  const awBot: AwarenessBot = createAwarenessBot({ publicBaseUrl: deps.publicBaseUrl ?? null });

  async function readPfState(chatId: string): Promise<{ pfl?: Array<{ e: string; f: string; t: string }> }> {
    const row = await db.queryOne<{ payload: string }>(
      `SELECT payload FROM bot_menu_state WHERE chat_id = ?`,
      [chatId]
    );
    if (!row) return {};
    try {
      const parsed = JSON.parse(row.payload);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  async function writePfState(chatId: string, state: { pfl?: Array<{ e: string; f: string; t: string }> }): Promise<void> {
    await db.execute(
      `INSERT INTO bot_menu_state (chat_id, payload, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(chat_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
      [chatId, JSON.stringify(state), now().toISOString()]
    );
  }

  if (deps.baleToken) {
    notify.registerChannel(createBaleChannel({ token: deps.baleToken }));
  }

  async function studentNamesMap(studentIds: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    for (const id of new Set(studentIds)) {
      const st = await students.getStudentById(id);
      if (st) map.set(id, `${st.firstName} ${st.lastName}`);
    }
    return map;
  }

  async function staffNamesMap(): Promise<Map<string, string>> {
    const rows = await listStaff(db, true);
    const map = new Map<string, string>();
    for (const r of rows) map.set(r.id, r.full_name);
    return map;
  }

  let botUsernameCache: string | null = null;
  async function botDeepLinkCache(): Promise<string | null> {
    if (botUsernameCache === null) {
      const stored = await deps.settings.getBotUsername().catch(() => '');
      botUsernameCache = stored || '';
    }
    return botUsernameCache ? `https://ble.ir/${botUsernameCache}` : null;
  }

  async function botDeepLink(code: string): Promise<string | null> {
    const base = await botDeepLinkCache();
    return base ? `${base}?start=${code}` : null;
  }

  // همهٔ بخش‌ها همین سبد مشترک را می‌گیرند؛ این‌جا یک بار ساخته می‌شود
  const ctx: NotifyCtx = { deps, db, audit, log, notify, now, appointments, students, followups, exbBot, subBot, clfBot, awBot, readPfState, writePfState, studentNamesMap, staffNamesMap, botDeepLink, botDeepLinkCache };

  return {
    ...createBotLinksSection(ctx),
    ...createBotCommandsSection(ctx),
    ...createDigestSection(ctx),
    ...createNotificationSendersSection(ctx),

    async listNotifications(filters: NotifyListFilters): Promise<NotificationRecord[]> {
      return notify.list(filters);
    },

    async outbox(): Promise<OutboxSummary> {
      const [pending, failed, counts] = await Promise.all([
        notify.list({ status: 'pending', limit: 100 }),
        notify.list({ status: 'failed', limit: 100 }),
        notify.stats()
      ]);
      return {
        drafts: pending.filter((n) => n.sendAt !== null),
        ready: pending.filter((n) => n.sendAt === null),
        failed,
        counts
      };
    },

    async releaseAndDispatch(id: string, actor: AuthContext): Promise<NotificationRecord | null> {
      const released = await notify.release(id);
      await audit.log({
        actorId: actor.staffId,
        action: 'notification.release',
        resourceType: 'notification',
        resourceId: id,
        changes: { released: { from: null, to: released } }
      });
      await notify.dispatchPending(50);
      return notify.getById(id);
    },

    async retryFailed(actor: AuthContext): Promise<number> {
      const count = await notify.retryFailed(100);
      await audit.log({
        actorId: actor.staffId,
        action: 'notification.retry_failed',
        resourceType: 'notification',
        resourceId: 'outbox',
        changes: { requeued: { from: null, to: count } }
      });
      await notify.dispatchPending(100);
      return count;
    },

    async stats(): Promise<Record<NotificationStatus, number>> {
      return notify.stats();
    },

    async dispatchPending(limit = 50): Promise<DispatchSummary> {
      return notify.dispatchPending(limit);
    },

    async enqueueUpcomingReminders(nowDate = now(), horizonHours = REMINDER_HORIZON_HOURS): Promise<ReminderEnqueueSummary> {
      const nowIso = nowDate.toISOString();
      const horizonTo = addMinutes(nowIso, horizonHours * 60);

      const [settingsFlags, clinicName] = await Promise.all([
        deps.settings.getNotifyFlags(),
        deps.settings.getClinicName()
      ]);

      const upcoming = await appointments.list({ from: nowIso, to: horizonTo });

      const studentIds = [...new Set(upcoming.flatMap((a) => a.students.map((s) => s.studentId)))];
      const prefsRows = studentIds.length > 0
        ? await db.query<PrefsRow>(...spreadStmt(selectPrefsMany(studentIds)))
        : [];
      const prefsByStudent = new Map<string, NotificationPrefs>();
      for (const row of prefsRows) {
        const prefs = rowToPrefs(row);
        prefsByStudent.set(prefs.studentId, prefs);
      }

      const [studentNames, staffNames] = await Promise.all([
        studentNamesMap(studentIds),
        staffNamesMap()
      ]);

      const plan = planReminders({
        appointments: upcoming,
        prefsByStudent,
        studentNames,
        staffNames,
        nowIso,
        horizonHours,
        defaultHoursBefore: settingsFlags.defaultReminderHours,
        clinicName
      });

      let enqueued = 0;
      let duplicates = 0;
      for (const p of plan.plans) {
        const outcome = await notify.enqueue({
          channel: p.channel,
          template: 'appointment_reminder',
          payload: p.payload,
          recipient: p.recipient,
          studentId: p.studentId,
          appointmentId: p.appointmentId,
          staffId: p.staffId,
          dedupKey: p.dedupKey
        });
        if (outcome.duplicate) duplicates += 1;
        else enqueued += 1;
      }

      const summary = buildEnqueueSummary(plan, enqueued, duplicates, nowIso, horizonTo);
      log.info('reminders.enqueued', { ...summary });

      await audit.log({
        actorId: 'system',
        action: 'notification.reminders.enqueue',
        resourceType: 'notification',
        resourceId: 'bulk',
        changes: {
          enqueued: { from: null, to: enqueued },
          duplicates: { from: null, to: duplicates },
          considered: { from: null, to: summary.considered }
        }
      });

      return summary;
    },

    async resolveBotUsername(): Promise<{ username: string | null; source: 'stored' | 'detected' | 'none' }> {
      const stored = await deps.settings.getBotUsername();
      if (stored) return { username: stored, source: 'stored' };
      if (!deps.baleToken) return { username: null, source: 'none' };
      const detected = await resolveUsernameFromBale(deps.baleToken);
      if (!detected) return { username: null, source: 'none' };
      await deps.settings.setBotUsername(detected, BOT_ACTOR);
      await audit.log({
        actorId: 'bale-bot',
        action: 'settings.bot_username.detect',
        resourceType: 'settings',
        resourceId: 'bot_username',
        changes: { bot_username: { from: null, to: detected } }
      });
      log.info('bot_username.detected', { username: detected });
      return { username: detected, source: 'detected' };
    },

    async replyToChat(chatId: string, text: string, buttons?: InlineButton[][] | null, keyboard?: string[][] | null): Promise<SendResult> {
      const channel = notify.getChannel('bale');
      if (!channel) {
        return { ok: false, error: 'CHANNEL_UNAVAILABLE' };
      }
      return channel.send({ to: chatId, text, buttons: buttons ?? undefined, keyboard: keyboard ?? undefined });
    },

    isWebhookEnabled(): boolean {
      return Boolean(deps.webhookSecret);
    },

    isWebhookSecretValid(secret: string | undefined): boolean {
      if (!deps.webhookSecret || !secret) return false;
      return secret === deps.webhookSecret;
    }

  };
}

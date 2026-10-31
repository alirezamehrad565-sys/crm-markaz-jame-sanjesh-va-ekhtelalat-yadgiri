import { faDigits, jalaliFullLabel, tehranYmdOf } from '@core/shared';
import type { FollowUp } from '@core/shared';
import { followUpGroupOf } from '@domain/followups';
import type { FollowupListGroups, FollowupListItem } from '@core/notify';

export interface DigestSummary {
  dateYmd: string;
  flagEnabled: boolean;
  staffSent: number;
  familySent: number;
  classSent: number;
  followupNudges: number;
  reassessNudges: number;
  enqueued: number;
  duplicates: number;
  skippedEmpty: number;
}

function toListItem(f: FollowUp): FollowupListItem {
  return {
    id: f.id,
    title: f.title,
    dueLabel: f.dueAt ? jalaliFullLabel(tehranYmdOf(f.dueAt)) : null
  };
}

export function groupFollowUpsForBot(list: FollowUp[], now: Date): FollowupListGroups {
  const groups: FollowupListGroups = { overdue: [], today: [], week: [], future: [], open: [] };
  for (const f of list) {
    const g = followUpGroupOf({ status: f.status, dueAt: f.dueAt }, now);
    if (!g) continue;
    groups[g].push(toListItem(f));
  }
  return groups;
}

export function followupsNudgeBody(list: FollowUp[], now: Date): {
  total: number;
  overdue: number;
  today: number;
  extra: string;
} {
  const groups = groupFollowUpsForBot(list, now);
  const overdue = groups.overdue.length;
  const today = groups.today.length;
  const lines: string[] = [];
  if (overdue > 0) lines.push(`⚠️ عقب‌افتاده: ${faDigits(String(overdue))}`);
  if (today > 0) lines.push(`🕐 امروز: ${faDigits(String(today))}`);

  const items = [...groups.overdue, ...groups.today].slice(0, 8);
  for (const it of items) {
    lines.push(`• ${it.title}${it.dueLabel ? ` — مهلت: ${it.dueLabel}` : ''}`);
  }
  const rest = overdue + today - items.length;
  if (rest > 0) lines.push(`و ${faDigits(String(rest))} پیگیری دیگر…`);

  return { total: overdue + today, overdue, today, extra: lines.join('\n') };
}

// بخش «گزارش روزانه و یادآورها» از service.ts منتقل شد؛ هلپرهای همین فایل را مستقیم صدا می‌زند.
import type { Appointment } from '@core/shared';
import { tehranRange, tehranTimeLabel, tehranTodayYmd } from '@core/shared';
import { selectStaffChats, selectStudentIdsByChat, renderDigestBody } from '@core/notify';
import { buildScheduleEntries } from './lifecycle';
import type { NotifyAppService } from './service';
import { BOT_ACTOR, spreadStmt } from './context';
import type { NotifyCtx } from './context';

export function createDigestSection(ctx: NotifyCtx): Pick<NotifyAppService, 'sendDailyDigest' | 'enqueueFollowupNudges' | 'enqueueReassessmentNudges'> {
  const { deps, db, audit, log, notify, now, appointments, students, followups, studentNamesMap, staffNamesMap } = ctx;

  return {
    async sendDailyDigest(nowDate = now()): Promise<DigestSummary> {
      const flags = await deps.settings.getNotifyFlags();
      const todayYmd = tehranTodayYmd(nowDate);
      const summary: DigestSummary = {
        dateYmd: todayYmd,
        flagEnabled: flags.digestEnabled,
        staffSent: 0,
        familySent: 0,
        classSent: 0,
        followupNudges: 0,
        reassessNudges: 0,
        enqueued: 0,
        duplicates: 0,
        skippedEmpty: 0
      };

      if (!flags.digestEnabled) {
        log.info('digest.disabled', { dateYmd: todayYmd });
        return summary;
      }

      const channel: 'bale' | 'internal' = notify.getChannel('bale') ? 'bale' : 'internal';
      const clinicName = await deps.settings.getClinicName();
      const { start, end } = tehranRange(todayYmd, todayYmd);
      const staffNames = await staffNamesMap();

      const enqueueDigest = async (
        template: 'digest_staff' | 'digest_family' | 'digest_class',
        chatId: string,
        extra: string
      ): Promise<boolean> => {
        const outcome = await notify.enqueue({
          channel,
          template,
          recipient: chatId,
          payload: { dateYmd: todayYmd, extra, clinicName },
          dedupKey: `digest:${todayYmd}:${chatId}`
        });
        if (outcome.duplicate) summary.duplicates += 1;
        else summary.enqueued += 1;
        return !outcome.duplicate;
      };

      const staffChatRows = await db.query<{ staff_id: string; chat_id: string }>(
        `SELECT staff_id, chat_id FROM staff_bot_links WHERE status = 'linked' AND chat_id IS NOT NULL`
      );
      for (const row of staffChatRows) {
        const list = await appointments.list({ staffId: row.staff_id, from: start, to: end });
        const studentIds = [...new Set(list.flatMap((a) => a.students.map((s) => s.studentId)))];
        const names = await studentNamesMap(studentIds);
        const entries = buildScheduleEntries(list, { kind: 'staff', names });
        if (entries.length === 0) {
          summary.skippedEmpty += 1;
          continue;
        }
        if (await enqueueDigest('digest_staff', row.chat_id, renderDigestBody(entries))) summary.staffSent += 1;
      }

      const parentChatRows = await db.query<{ chat_id: string }>(
        `SELECT DISTINCT chat_id FROM bot_links WHERE status = 'linked' AND chat_id IS NOT NULL
          UNION
         SELECT DISTINCT chat_id FROM notification_prefs WHERE chat_id IS NOT NULL AND reminders_enabled = 1 AND channel = 'bale'`
      );
      for (const row of parentChatRows) {
        const chatStudentRows = await db.query<{ student_id: string }>(
          ...spreadStmt(selectStudentIdsByChat(row.chat_id))
        );
        const prefIds = await db.query<{ student_id: string }>(
          `SELECT student_id FROM notification_prefs WHERE chat_id = ? AND reminders_enabled = 1`,
          [row.chat_id]
        );
        const studentIds = [...new Set([...chatStudentRows.map((r) => r.student_id), ...prefIds.map((r) => r.student_id)])];
        if (studentIds.length === 0) {
          summary.skippedEmpty += 1;
          continue;
        }

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
        merged.sort((a, b) => a.startAt.localeCompare(b.startAt));
        const studentNames = await studentNamesMap(studentIds);
        const multi = studentIds.length > 1;
        const entries = merged.map((a) => ({
          timeLabel: tehranTimeLabel(a.startAt),
          title: staffNames.get(a.staffId) ?? 'متخصص',
          subtitle: multi
            ? `فرزند: ${a.students.map((s) => studentNames.get(s.studentId)).filter((n): n is string => Boolean(n)).join('، ') || '—'}`
            : undefined,
          cancelled: a.status === 'cancelled'
        }));
        if (entries.length === 0) {
          summary.skippedEmpty += 1;
          continue;
        }
        if (await enqueueDigest('digest_family', row.chat_id, renderDigestBody(entries))) summary.familySent += 1;
      }

      const classChatRows = await db.query<{ class_id: string; chat_id: string }>(
        `SELECT class_id, chat_id FROM class_bot_links WHERE status = 'linked' AND chat_id IS NOT NULL`
      );
      for (const row of classChatRows) {
        const classStudentIds = await students.listStudentIdsByClass(row.class_id);
        const merged: Appointment[] = [];
        const seen = new Set<string>();
        for (const sid of classStudentIds) {
          const list = await appointments.list({ studentId: sid, from: start, to: end });
          for (const a of list) {
            if (!seen.has(a.id)) {
              seen.add(a.id);
              merged.push(a);
            }
          }
        }
        merged.sort((a, b) => a.startAt.localeCompare(b.startAt));
        const names = await studentNamesMap(classStudentIds);
        const entries = merged.map((a) => ({
          timeLabel: tehranTimeLabel(a.startAt),
          title:
            a.students
              .map((s) => names.get(s.studentId) ?? '')
              .filter((n) => n.length > 0)
              .join('، ') || 'بدون دانش‌آموز',
          subtitle: undefined,
          cancelled: a.status === 'cancelled'
        }));
        if (entries.length === 0) {
          summary.skippedEmpty += 1;
          continue;
        }
        if (await enqueueDigest('digest_class', row.chat_id, renderDigestBody(entries))) summary.classSent += 1;
      }

      summary.followupNudges = await this.enqueueFollowupNudges(nowDate);

      summary.reassessNudges = await this.enqueueReassessmentNudges(nowDate);

      if (summary.enqueued > 0) {
        await notify.dispatchPending(100);
      }

      await audit.log({
        actorId: 'system',
        action: 'notification.digest',
        resourceType: 'notification',
        resourceId: todayYmd,
        changes: {
          staff: { from: null, to: summary.staffSent },
          family: { from: null, to: summary.familySent },
          class: { from: null, to: summary.classSent },
          followupNudges: { from: null, to: summary.followupNudges },
          reassessNudges: { from: null, to: summary.reassessNudges },
          skippedEmpty: { from: null, to: summary.skippedEmpty },
          duplicates: { from: null, to: summary.duplicates }
        }
      });
      log.info('digest.sent', { ...summary });
      return summary;
    },

    async enqueueFollowupNudges(nowDate = now()): Promise<number> {
      const flags = await deps.settings.getNotifyFlags();
      if (!flags.digestEnabled) return 0;

      const openList = await followups.list({ group: 'open' }, BOT_ACTOR);
      const byAssignee = new Map<string, FollowUp[]>();
      for (const f of openList) {
        const g = followUpGroupOf({ status: f.status, dueAt: f.dueAt }, nowDate);
        if (g !== 'overdue' && g !== 'today') continue;
        const arr = byAssignee.get(f.assigneeId);
        if (arr) arr.push(f);
        else byAssignee.set(f.assigneeId, [f]);
      }
      if (byAssignee.size === 0) return 0;

      const channel: 'bale' | 'internal' = notify.getChannel('bale') ? 'bale' : 'internal';
      const todayYmd = tehranTodayYmd(nowDate);
      const clinicName = await deps.settings.getClinicName();
      let enqueued = 0;

      for (const [assigneeId, list] of byAssignee) {
        const chatRows = await db.query<{ chat_id: string }>(
          ...spreadStmt(selectStaffChats(assigneeId))
        );
        if (chatRows.length === 0) continue;
        const { extra } = followupsNudgeBody(list, nowDate);
        for (const r of chatRows) {
          const outcome = await notify.enqueue({
            channel,
            template: 'followup_nudge',
            recipient: r.chat_id,
            staffId: assigneeId,
            payload: { extra, clinicName },
            dedupKey: `fu-nudge:${todayYmd}:${assigneeId}:${r.chat_id}`
          });
          if (!outcome.duplicate) enqueued += 1;
        }
      }
      log.info('followup.nudge.enqueued', { assignees: byAssignee.size, enqueued });
      return enqueued;
    },

    async enqueueReassessmentNudges(nowDate = now()): Promise<number> {
      const flags = await deps.settings.getNotifyFlags();
      if (!flags.digestEnabled) return 0;

      const dueRows = await db.query<{ id: string; owner_id: string | null; student_name: string; reassess_at: string }>(
        `SELECT p.id, s.owner_staff_id AS owner_id, s.first_name || ' ' || s.last_name AS student_name, p.reassess_at
           FROM intervention_paths p
           JOIN students s ON s.id = p.student_id
          WHERE p.status = 'active' AND p.deleted_at IS NULL
            AND p.reassess_at IS NOT NULL AND p.reassess_at <= ?`,
        [new Date(nowDate.getTime() + 7 * 86400000).toISOString()]
      );
      if (dueRows.length === 0) return 0;

      const channel: 'bale' | 'internal' = notify.getChannel('bale') ? 'bale' : 'internal';
      const todayYmd = tehranTodayYmd(nowDate);
      let enqueued = 0;
      for (const p of dueRows) {
        if (!p.owner_id) continue;
        const chatRows = await db.query<{ chat_id: string }>(
          ...spreadStmt(selectStaffChats(p.owner_id))
        );
        for (const r of chatRows) {
          const outcome = await notify.enqueue({
            channel,
            template: 'reassessment_due',
            recipient: r.chat_id,
            staffId: p.owner_id,
            payload: { studentName: p.student_name, dueYmd: p.reassess_at.slice(0, 10) },
            dedupKey: `reassess:${todayYmd}:${p.id}:${r.chat_id}`
          });
          if (!outcome.duplicate) enqueued += 1;
        }
      }
      log.info('reassessment.nudge.enqueued', { paths: dueRows.length, enqueued });
      return enqueued;
    },

  };
}

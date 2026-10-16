/**
 * سرویس تایم‌لاین پرونده — سرویس اصلی و منطق کسب‌وکار
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// فاز ۶ — گردآوری رویدادهای تایم‌لاین از منابع موجود (read-only — هیچ جدولی نمی‌نویسد)
// منابع §11.2 whitelist: audit_log (student.create/tags.replace/case_status.changed +
// appointment.move + session_note.* + followup.* + waitlist.* + committee.*)، appointments(+ops_status/
// attendance)، notifications (sent)، followups — merge قطعی در pure.ts
// assessments بازنشسته شد (سندها به case_events مهاجرت کردند؛ kind 'assessment' حذف)

import { NotFoundError } from '@core/errors';
import { FOLLOWUP_OPEN_STATUSES } from '@core/shared';
import type { AuthContext } from '@core/shared';
import type { DbClient } from '@core/db';
import type { TimelineEvent, TimelineFilters, TimelineResult, StudentTimelineService } from './types';
import {
  appointmentEventState,
  deriveNextAction,
  filterTimelineEvents,
  jalaliDateTimeLabel,
  jalaliLabelOf,
  mergeTimelineEvents,
  paginateTimeline,
  parseCompositeRef,
  subtitleWith,
  CASE_STATUS_LABELS_FA,
  COMMITTEE_DECISION_LABELS_FA,
  NOTIFICATION_TITLES_FA,
  SPECIAL_NEED_SEVERITY_LABELS_FA,
  SPECIAL_NEED_TYPE_LABELS_FA
} from './pure';

interface AuditRow {
  id: string;
  actor_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  changes: string | null;
  created_at: string;
}

interface ApptRow {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  ops_status: string | null;
  attendance: string;
  staff_name: string | null;
}

interface FollowUpRow {
  id: string;
  title: string;
  due_at: string | null;
  status: string;
}

interface WaitlistRow {
  id: string;
  created_at: string;
}

interface NotificationRow {
  id: string;
  template: string;
  channel: string;
  sent_at: string;
}

/** — مصوبهٔ کمیسیون + جلسهٔ والد آن */
interface CommitteeItemRow {
  id: string;
  topic: string;
  decision_status: string;
  meeting_title: string;
  meeting_date: string;
}

/** — رویداد پرونده (فرم جلسه/چک‌لیست) + عنوان نوع */
interface CaseEventRow {
  id: string;
  occurred_at: string;
  status: string;
  summary: string | null;
  analysis: string | null;
  staff_name: string | null;
  filled_by_chat_id: string | null;
  type_title: string;
  type_icon: string | null;
  type_category: string;
}

export function createStudentTimelineService(db: DbClient): StudentTimelineService {
  function inList(ids: string[]): string {
    return ids.map(() => '?').join(', ');
  }

  /** نام بازیگران از staff — خارج از staff (system/bot) → null */
  async function actorNames(actorIds: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(actorIds)];
    const map = new Map<string, string>();
    if (unique.length === 0) return map;
    const rows = await db.query<{ id: string; full_name: string }>(
      `SELECT id, full_name FROM staff WHERE id IN (${inList(unique)})`,
      unique
    );
    for (const r of rows) map.set(r.id, r.full_name);
    return map;
  }

  return {
    async list(
      studentId: string,
      filters: TimelineFilters,
      _actor: AuthContext
    ): Promise<TimelineResult> {
      const student = await db.queryOne<{ id: string }>(`SELECT id FROM students WHERE id = ?`, [studentId]);
      if (!student) throw new NotFoundError('دانش‌آموز');

      const raw: TimelineEvent[] = [];

      // ─── ۱) audit رویدادهای مستقیم پرونده (whitelist — student.update هرگز) ───
      const studentAudits = await db.query<AuditRow>(
        `SELECT id, actor_id, action, resource_type, resource_id, changes, strftime('%Y-%m-%dT%H:%M:%SZ', created_at) AS created_at
           FROM audit_log
          WHERE resource_type = 'student' AND resource_id = ?
            AND action IN ('student.create', 'student.tags.replace', 'student.case_status.changed', 'student.special_need.changed', 'student.owner.changed')
          ORDER BY created_at ASC`,
        [studentId]
      );

      // ─── ۲) نوبت‌های دانش‌آموز + رویداد state در start_at ───
      const appts = await db.query<ApptRow>(
        `SELECT a.id, a.start_at, a.end_at, a.status, a.ops_status,
                a_s.attendance, s.full_name AS staff_name
           FROM appointment_students a_s
           JOIN appointments a ON a.id = a_s.appointment_id
           LEFT JOIN staff s ON s.id = a.staff_id
          WHERE a_s.student_id = ?
          ORDER BY a.start_at ASC`,
        [studentId]
      );
      const apptIds = appts.map((a) => a.id);

      // ─── ۳) audit جابه‌جایی نوبت‌ها (appointment.move) ───
      const moveAudits: AuditRow[] = apptIds.length
        ? await db.query<AuditRow>(
            `SELECT id, actor_id, action, resource_type, resource_id, changes, strftime('%Y-%m-%dT%H:%M:%SZ', created_at) AS created_at
               FROM audit_log
              WHERE resource_type = 'appointment' AND action = 'appointment.move'
                AND resource_id IN (${inList(apptIds)})
              ORDER BY created_at ASC`,
            apptIds
          )
        : [];

      // ─── ۴) audit گزارش جلسه (composite resource_id «apptId/studentId») ───
      const noteAudits = await db.query<AuditRow>(
        `SELECT id, actor_id, action, resource_type, resource_id, changes, strftime('%Y-%m-%dT%H:%M:%SZ', created_at) AS created_at
           FROM audit_log
          WHERE resource_type = 'appointment_student'
            AND action IN ('session_note.created', 'session_note.updated')
            AND resource_id LIKE ?
          ORDER BY created_at ASC`,
        [`%/${studentId}`]
      );

      // ─── ۵) پیگیری‌های پرونده + audit آنها ───
      const followups = await db.query<FollowUpRow>(
        `SELECT id, title, due_at, status FROM followups WHERE student_id = ?`,
        [studentId]
      );
      const fuIds = followups.map((f) => f.id);
      const followupAudits: AuditRow[] = fuIds.length
        ? await db.query<AuditRow>(
            `SELECT id, actor_id, action, resource_type, resource_id, changes, strftime('%Y-%m-%dT%H:%M:%SZ', created_at) AS created_at
               FROM audit_log
              WHERE resource_type = 'followup' AND resource_id IN (${inList(fuIds)})
              ORDER BY created_at ASC`,
            fuIds
          )
        : [];

      // ─── ۶) لیست انتظار متصل + audit آنها (waiting_set/schedule/admitted) ───
      const waitlistRows = await db.query<WaitlistRow>(
        `SELECT id, created_at FROM waitlist WHERE student_id = ?`,
        [studentId]
      );
      const wlIds = waitlistRows.map((w) => w.id);
      const waitlistAudits: AuditRow[] = wlIds.length
        ? await db.query<AuditRow>(
            `SELECT id, actor_id, action, resource_type, resource_id, changes, strftime('%Y-%m-%dT%H:%M:%SZ', created_at) AS created_at
               FROM audit_log
              WHERE resource_type = 'waitlist' AND resource_id IN (${inList(wlIds)})
                AND action IN ('waitlist.waiting_set', 'waitlist.schedule', 'waitlist.admitted')
              ORDER BY created_at ASC`,
            wlIds
          )
        : [];

      // ─── ۸) پیام‌های ارسال‌شده به خانواده (فقط sent) ───
      const notifications = await db.query<NotificationRow>(
        `SELECT id, template, channel, sent_at
           FROM notifications
          WHERE student_id = ? AND status = 'sent' AND sent_at IS NOT NULL
          ORDER BY sent_at ASC`,
        [studentId]
      );

      // ─── ۹) — مصوبات کمیسیون پرونده + audit آنها ───
      const committeeItems = await db.query<CommitteeItemRow>(
        `SELECT i.id, i.topic, i.decision_status, m.title AS meeting_title, m.meeting_date
           FROM committee_items i
           JOIN committee_meetings m ON m.id = i.meeting_id AND m.deleted_at IS NULL
          WHERE i.student_id = ? AND i.deleted_at IS NULL`,
        [studentId]
      );
      const ciIds = committeeItems.map((ci) => ci.id);
      const committeeAudits: AuditRow[] = ciIds.length
        ? await db.query<AuditRow>(
            `SELECT id, actor_id, action, resource_type, resource_id, changes, strftime('%Y-%m-%dT%H:%M:%SZ', created_at) AS created_at
               FROM audit_log
              WHERE resource_type = 'committee_item' AND resource_id IN (${inList(ciIds)})
                AND action IN ('committee.item.created', 'committee.item.updated')
              ORDER BY created_at ASC`,
            ciIds
          )
        : [];

      // ─── ۱۰) — تکلیف‌های تمرین + audit ارسال/بازگشت/تصحیح ───
      const assignments = await db.query<{ id: string; exercise_title: string }>(
        `SELECT a.id, e.title AS exercise_title
           FROM exercise_assignments a
           JOIN exercises e ON e.id = a.exercise_id
          WHERE a.student_id = ?`,
        [studentId]
      );
      const asgIds = assignments.map((a) => a.id);
      const exerciseAudits: AuditRow[] = asgIds.length
        ? await db.query<AuditRow>(
            `SELECT id, actor_id, action, resource_type, resource_id, changes, strftime('%Y-%m-%dT%H:%M:%SZ', created_at) AS created_at
               FROM audit_log
              WHERE resource_type = 'exercise_assignment' AND resource_id IN (${inList(asgIds)})
                AND action IN ('exercise.assigned', 'exercise.submitted', 'exercise.corrected')
              ORDER BY created_at ASC`,
            asgIds
          )
        : [];

      // ─── ۱۱) — رویدادهای پرونده (فرم جلسه/چک‌لیست) — مستقیم از جدول مالک ───
      const caseEvents = await db.query<CaseEventRow>(
        `SELECT e.id, e.occurred_at, e.status, e.summary, e.analysis, s.full_name AS staff_name,
                e.filled_by_chat_id, t.title AS type_title, t.icon AS type_icon, t.category AS type_category
           FROM case_events e
           JOIN case_event_types t ON t.id = e.event_type_id
           LEFT JOIN staff s ON s.id = e.staff_id
          WHERE e.student_id = ? AND e.deleted_at IS NULL
          ORDER BY e.occurred_at ASC`,
        [studentId]
      );

      // ─── نام بازیگران ───
      const actors = await actorNames([
        ...studentAudits.map((a) => a.actor_id),
        ...moveAudits.map((a) => a.actor_id),
        ...noteAudits.map((a) => a.actor_id),
        ...followupAudits.map((a) => a.actor_id),
        ...waitlistAudits.map((a) => a.actor_id),
        ...committeeAudits.map((a) => a.actor_id),
        ...exerciseAudits.map((a) => a.actor_id)
      ]);
      const actorOf = (id: string): string | null => actors.get(id) ?? null;

      // ─── ساخت رویدادها ───

      for (const a of studentAudits) {
        if (a.action === 'student.create') {
          raw.push({ at: a.created_at, kind: 'student_created', title: 'پرونده تشکیل شد', subtitle: null, actor: actorOf(a.actor_id), ref: { type: 'student', id: studentId } });
        } else if (a.action === 'student.tags.replace') {
          const changes = parseChanges(a.changes);
          const added = Array.isArray(changes?.added?.to) ? (changes!.added.to as unknown[]).length : 0;
          const removed = Array.isArray(changes?.removed?.to) ? (changes!.removed.to as unknown[]).length : 0;
          const detail = tagsDetail(added, removed);
          raw.push({ at: a.created_at, kind: 'tags', title: 'برچسب‌ها به‌روزرسانی شد', subtitle: detail, actor: actorOf(a.actor_id), ref: { type: 'student', id: studentId } });
        } else if (a.action === 'student.case_status.changed') {
          const changes = parseChanges(a.changes);
          const from = labelOf(CASE_STATUS_LABELS_FA, changes?.case_status?.from);
          const to = labelOf(CASE_STATUS_LABELS_FA, changes?.case_status?.to);
          raw.push({ at: a.created_at, kind: 'case_status', title: 'وضعیت پرونده تغییر کرد', subtitle: `از «${from}» به «${to}»`, actor: actorOf(a.actor_id), ref: { type: 'student', id: studentId } });
        } else if (a.action === 'student.special_need.changed') {
          // فاز ۷ — §12: نیاز ویژه در تایم‌لاین — فقط نوع/شدت (id فیلدها، §12.10)
          const changes = parseChanges(a.changes);
          const toType = changes?.special_need_type?.to;
          const toSev = changes?.special_need_severity?.to;
          if (toType === null || toType === undefined) {
            raw.push({ at: a.created_at, kind: 'special_need', title: 'نیاز ویژه حذف شد', subtitle: null, actor: actorOf(a.actor_id), ref: { type: 'student', id: studentId } });
          } else {
            const typeLabel = labelOf(SPECIAL_NEED_TYPE_LABELS_FA, toType);
            const sevLabel = labelOf(SPECIAL_NEED_SEVERITY_LABELS_FA, toSev);
            raw.push({ at: a.created_at, kind: 'special_need', title: 'نیاز ویژه ثبت شد', subtitle: sevLabel === '—' ? typeLabel : `${typeLabel} — شدت: ${sevLabel}`, actor: actorOf(a.actor_id), ref: { type: 'student', id: studentId } });
          }
        } else if (a.action === 'student.owner.changed') {
          // -c — مسئول پرونده — زیرنویس با نام همکاران (نه id)
          const changes = parseChanges(a.changes);
          const fromId = typeof changes?.owner_staff_id?.from === 'string' ? changes.owner_staff_id.from : null;
          const toId = typeof changes?.owner_staff_id?.to === 'string' ? changes.owner_staff_id.to : null;
          const names = await actorNames([fromId, toId].filter((x): x is string => Boolean(x)));
          const fromName = fromId ? names.get(fromId) ?? '—' : null;
          const toName = toId ? names.get(toId) ?? '—' : null;
          const subtitle = fromName ? `از «${fromName}» به «${toName ?? '—'}»` : `مسئول: ${toName ?? '—'}`;
          raw.push({ at: a.created_at, kind: 'case_status', title: toName ? 'مسئول پرونده تغییر کرد' : 'مسئول پرونده برداشته شد', subtitle, actor: actorOf(a.actor_id), ref: { type: 'student', id: studentId } });
        }
      }

      for (const a of appts) {
        const state = appointmentEventState({
          status: a.status,
          opsStatus: a.ops_status,
          attendance: a.attendance,
          startAt: a.start_at,
          endAt: a.end_at
        });
        raw.push({
          at: a.start_at,
          kind: 'appointment',
          title: state.title,
          subtitle: subtitleWith(a.staff_name, state.subtitle),
          actor: null,
          ref: { type: 'appointment', id: a.id }
        });
      }

      for (const m of moveAudits) {
        const changes = parseChanges(m.changes);
        const to = changes?.start_at?.to;
        const from = changes?.start_at?.from;
        if (typeof to !== 'string' || typeof from !== 'string') continue;
        raw.push({
          at: m.created_at,
          kind: 'appointment_moved',
          title: 'نوبت جابه‌جا شد',
          subtitle: `از ${jalaliDateTimeLabel(from)} به ${jalaliDateTimeLabel(to)}`,
          actor: actorOf(m.actor_id),
          ref: { type: 'appointment', id: m.resource_id }
        });
      }

      for (const n of noteAudits) {
        const parsed = parseCompositeRef(n.resource_id);
        if (!parsed || parsed.studentId !== studentId) continue;
        raw.push({
          at: n.created_at,
          kind: 'session_note',
          title: n.action === 'session_note.created' ? 'گزارش جلسه ثبت شد' : 'گزارش جلسه به‌روزرسانی شد',
          subtitle: null,
          actor: actorOf(n.actor_id),
          ref: { type: 'appointment_student', id: n.resource_id }
        });
      }

      const fuById = new Map(followups.map((f) => [f.id, f]));
      for (const fa of followupAudits) {
        const fu = fuById.get(fa.resource_id);
        if (!fu) continue;
        if (fa.action === 'followup.created') {
          raw.push({ at: fa.created_at, kind: 'followup', title: 'پیگیری ایجاد شد', subtitle: fu.title, actor: actorOf(fa.actor_id), ref: { type: 'followup', id: fu.id } });
        } else if (fa.action === 'followup.completed') {
          raw.push({ at: fa.created_at, kind: 'followup', title: 'پیگیری تکمیل شد', subtitle: fu.title, actor: actorOf(fa.actor_id), ref: { type: 'followup', id: fu.id } });
        } else if (fa.action === 'followup.updated') {
          raw.push({ at: fa.created_at, kind: 'followup', title: 'پیگیری به‌روزرسانی شد', subtitle: fu.title, actor: actorOf(fa.actor_id), ref: { type: 'followup', id: fu.id } });
        }
      }

      const wlById = new Map(waitlistRows.map((w) => [w.id, w]));
      for (const wa of waitlistAudits) {
        const wl = wlById.get(wa.resource_id);
        const waited = wl ? waitDays(wl.created_at, wa.created_at) : null;
        if (wa.action === 'waitlist.waiting_set') {
          raw.push({ at: wa.created_at, kind: 'waitlist', title: 'وارد لیست انتظار شد', subtitle: null, actor: actorOf(wa.actor_id), ref: { type: 'waitlist', id: wa.resource_id } });
        } else if (wa.action === 'waitlist.schedule') {
          raw.push({ at: wa.created_at, kind: 'waitlist', title: 'نوبت اول از لیست انتظار ثبت شد', subtitle: waited !== null ? `مدت انتظار: ${faDays(waited)}` : null, actor: actorOf(wa.actor_id), ref: { type: 'waitlist', id: wa.resource_id } });
        } else if (wa.action === 'waitlist.admitted') {
          raw.push({ at: wa.created_at, kind: 'waitlist', title: 'پذیرش شد — پرونده فعال شد', subtitle: waited !== null ? `مدت انتظار: ${faDays(waited)}` : null, actor: null, ref: { type: 'waitlist', id: wa.resource_id } });
        }
      }

      for (const n of notifications) {
        raw.push({
          at: n.sent_at,
          kind: 'notification',
          title: NOTIFICATION_TITLES_FA[n.template] ?? 'پیام به خانواده ارسال شد',
          subtitle: n.channel === 'bale' ? 'کانال: بات بله' : 'کانال: داخلی',
          actor: null,
          ref: { type: 'notification', id: n.id }
        });
      }

      // ─── رویدادهای کمیسیون (مطرح‌شدن + تصمیم) ───
      const ciById = new Map(committeeItems.map((ci) => [ci.id, ci]));
      for (const ca of committeeAudits) {
        const ci = ciById.get(ca.resource_id);
        if (!ci) continue;
        const meetingLabel = `${ci.meeting_title} — ${jalaliLabelOf(ci.meeting_date)}`;
        if (ca.action === 'committee.item.created') {
          raw.push({
            at: ca.created_at,
            kind: 'committee',
            title: 'در کمیسیون مطرح شد',
            subtitle: `${ci.topic} · ${meetingLabel}`,
            actor: actorOf(ca.actor_id),
            ref: { type: 'committee_item', id: ci.id }
          });
        } else {
          const changes = parseChanges(ca.changes);
          if (changes?.decision_status?.to !== undefined) {
            const to = typeof changes.decision_status.to === 'string' ? changes.decision_status.to : null;
            const toLabel = to ? (COMMITTEE_DECISION_LABELS_FA[to] ?? to) : '—';
            raw.push({
              at: ca.created_at,
              kind: 'committee',
              title: `تصمیم کمیسیون: ${toLabel}`,
              subtitle: `${ci.topic} · ${meetingLabel}`,
              actor: actorOf(ca.actor_id),
              ref: { type: 'committee_item', id: ci.id }
            });
          } else {
            raw.push({
              at: ca.created_at,
              kind: 'committee',
              title: 'مصوبهٔ کمیسیون به‌روزرسانی شد',
              subtitle: `${ci.topic} · ${meetingLabel}`,
              actor: actorOf(ca.actor_id),
              ref: { type: 'committee_item', id: ci.id }
            });
          }
        }
      }

      // ─── رویدادهای تکلیف و بازگشت تمرین + -c تصحیح ───
      const asgTitleById = new Map(assignments.map((a) => [a.id, a.exercise_title]));
      for (const ea of exerciseAudits) {
        const title = asgTitleById.get(ea.resource_id) ?? 'تمرین';
        if (ea.action === 'exercise.assigned') {
          raw.push({
            at: ea.created_at,
            kind: 'exercise',
            title: 'تکلیف تمرین ارسال شد',
            subtitle: `تمرین: ${title}`,
            actor: actorOf(ea.actor_id),
            ref: { type: 'exercise_assignment', id: ea.resource_id }
          });
        } else if (ea.action === 'exercise.corrected') {
          raw.push({
            at: ea.created_at,
            kind: 'exercise',
            title: 'تمرین تصحیح شد',
            subtitle: `تمرین: ${title} — بازخورد درمانگر ثبت شد`,
            actor: actorOf(ea.actor_id),
            ref: { type: 'exercise_assignment', id: ea.resource_id }
          });
        } else {
          const changes = parseChanges(ea.changes);
          const filename = typeof changes?.filename?.to === 'string' ? changes.filename.to : null;
          // ref به خود بازگشت (نه تکلیف) — چند صفحهٔ بازگشتیِ یک تکلیف ادغام نمی‌شوند
          const submissionId = typeof changes?.submissionId?.to === 'string' ? changes.submissionId.to : ea.resource_id;
          raw.push({
            at: ea.created_at,
            kind: 'exercise',
            title: 'نتیجهٔ تمرین بازگشت',
            subtitle: filename ? `تمرین: ${title} — ${filename}` : `تمرین: ${title}`,
            actor: actorOf(ea.actor_id),
            ref: { type: 'exercise_submission', id: submissionId }
          });
        }
      }

      // ─── رویدادهای پرونده (فرم جلسه/چک‌لیست خانواده) ───
      for (const ce of caseEvents) {
        const cancelled = ce.status === 'cancelled';
        const pending = ce.status === 'pending_family';
        let subtitle: string | null = ce.summary;
        if (cancelled) subtitle = 'رویداد لغو شد';
        else if (pending) subtitle = 'در انتظار پاسخ خانواده';
        else if (ce.analysis) {
          try {
            const an = JSON.parse(ce.analysis) as { score: number; band: string | null; total: number; maxScore?: number };
            subtitle = `امتیاز ${an.score.toLocaleString('fa-IR')} از ${(an.maxScore ?? an.total * 3).toLocaleString('fa-IR')}${an.band ? ` — ${an.band}` : ''}`;
          } catch { /* keep summary */ }
        }
        raw.push({
          at: ce.occurred_at,
          kind: 'case_event',
          title: `${ce.type_icon ?? ''} رویداد: ${ce.type_title}`.trim(),
          subtitle,
          actor: ce.filled_by_chat_id ? 'خانواده' : ce.staff_name,
          ref: { type: 'case_event', id: ce.id }
        });
      }

      // ─── merge قطعی + فیلتر + صفحه‌بندی ───
      const merged = mergeTimelineEvents(raw);
      const filtered = filterTimelineEvents(merged, filters);
      const { page, hasMore } = paginateTimeline(filtered, filters.limit, filters.offset);

      // ─── «اقدام بعدی» از همان منابع (قبل از فیلتر — همیشه وضعیت فعلی) ───
      const nowIso = new Date().toISOString();
      const nextApptRow = appts
        .filter((a) => a.status === 'scheduled' && a.start_at > nowIso)
        .sort((a, b) => (a.start_at < b.start_at ? -1 : 1))[0] ?? null;
      const nextAppt = nextApptRow
        ? { id: nextApptRow.id, startAt: nextApptRow.start_at, staffName: nextApptRow.staff_name }
        : null;
      const openFus = followups
        .filter((f) => (FOLLOWUP_OPEN_STATUSES as readonly string[]).includes(f.status))
        .map((f) => ({ id: f.id, title: f.title, dueAt: f.due_at }));
      const nextAction = deriveNextAction(nextAppt, openFus);

      return { events: page, nextAction, hasMore };
    }
  };
}

// ───────────── helpers ─────────────

function parseChanges(json: string | null): Record<string, { from?: unknown; to?: unknown }> | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as Record<string, { from?: unknown; to?: unknown }>;
  } catch {
    return null;
  }
}

function labelOf(map: Record<string, string>, value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return '—';
  return map[value] ?? value;
}

/** جزئیات تغییر برچسب‌ها — «+۲ / −۱» (اعداد فارسی) */
function tagsDetail(added: number, removed: number): string | null {
  const parts: string[] = [];
  if (added > 0) parts.push(`+${added.toLocaleString('fa-IR')}`);
  if (removed > 0) parts.push(`−${removed.toLocaleString('fa-IR')}`);
  return parts.length > 0 ? parts.join(' / ') : null;
}

/** تعداد روز انتظار (کف) */
function waitDays(fromIso: string, toIso: string): number | null {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return null;
  return Math.floor((to - from) / 86_400_000);
}

function faDays(days: number): string {
  if (days < 1) return 'کمتر از یک روز';
  return `${days.toLocaleString('fa-IR')} روز`;
}

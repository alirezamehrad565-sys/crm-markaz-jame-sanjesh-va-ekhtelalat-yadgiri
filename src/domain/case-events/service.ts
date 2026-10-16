/**
 * ماژول رویدادساز (فرم/پرسش‌نامه/چک‌لیست) — سرویس اصلی و منطق کسب‌وکار
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// سرویس رویدادهای پرونده — مالک WRITE جداول case_event_types و case_events
// الگوی پروژه: همهٔ writeها با audit هم‌تراکنش؛ حذف فقط نرم؛ اعتبارسنجی در pure.

import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '@core/errors';
import type { AuthContext } from '@core/shared';
import { FOLLOWUP_DEFAULT_DUE_DAYS } from '@core/shared';
import type { DbClient } from '@core/db';
import type {
  CaseEventAnalysis, CaseEventAudience, CaseEventBand, CaseEventDeps, CaseEventField, CaseEventFileMeta,
  CaseEventInput, CaseEventRecord, CaseEventStatus, CaseEventSubscale, CaseEventTypeInput, CaseEventTypeRecord,
  CaseEventsService, ChecklistSuggestion, NewCaseEventFileInput, PendingChecklist, SendObserver
} from './types';
import { CASE_EVENT_STATUSES } from './types';
import {
  analyzeChecklist, base64ToBytes, buildEventPayload, buildSummary, canTransitionStatus,
  estimateBase64Bytes, EVENT_FILES_MAX, extractFollowUpAction, resolveBand, sanitizeFilename,
  stripDataUrlPrefix, validateFileInput, validateTypeDefinition
} from './pure';

interface TypeRow {
  id: string;
  key: string;
  title: string;
  description: string | null;   // — معرفی روایی فرم
  category: string;
  icon: string | null;
  family_fillable: number;
  fields: string;
  bands: string | null;
  tags: string | null;          // — JSON آرایهٔ tag id
  audience: string | null;      // — family | teacher | both
  subscales: string | null;     // — JSON آرایهٔ زیرمقیاس‌ها
  active: number;
  is_system: number;            // — ابزار سیستمی باتری بالینی
  created_at: string;
  updated_at: string;
}

interface EventRow {
  id: string;
  event_type_id: string;
  student_id: string;
  staff_id: string | null;
  staff_name: string | null;
  appointment_id: string | null;
  occurred_at: string;
  status: string;
  payload: string | null;
  analysis: string | null;
  summary: string | null;
  fill_expires_at: string | null;
  sent_at: string | null;       //
  sent_count: number;           //
  created_by: string;
  created_at: string;
  // join
  type_title: string;
  type_category: string;
  type_icon: string | null;
  type_bands: string | null;
  type_audience: string | null; //
  type_family_fillable: number; // — شفافیت «چه کسی فرم را پر می‌کند»
  student_name?: string;        // — join صف انتظار
}

/** — ردیف پیوست */
interface EventFileRow {
  id: string;
  case_event_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  content_b64?: string;
  created_by: string | null;
  created_at: string;
}

function fileRowToMeta(row: EventFileRow): CaseEventFileMeta {
  return {
    id: row.id,
    caseEventId: row.case_event_id,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    createdBy: row.created_by,
    createdAt: row.created_at
  };
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function typeRowToRecord(r: TypeRow): CaseEventTypeRecord {
  return {
    id: r.id,
    key: r.key,
    title: r.title,
    description: r.description ?? null,
    category: r.category as CaseEventTypeRecord['category'],
    icon: r.icon,
    familyFillable: r.family_fillable === 1,
    fields: parseJson<CaseEventField[]>(r.fields, []),
    bands: r.bands ? parseJson<CaseEventBand[] | null>(r.bands, null) : null,
    subscales: r.subscales ? parseJson<CaseEventSubscale[] | null>(r.subscales, null) : null,
    tags: r.tags ? parseJson<string[]>(r.tags, []) : [],
    audience: (r.audience as CaseEventTypeRecord['audience']) ?? 'family',
    active: r.active === 1,
    isSystem: r.is_system === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

function eventRowToRecord(r: EventRow): CaseEventRecord {
  return {
    id: r.id,
    eventTypeId: r.event_type_id,
    typeTitle: r.type_title,
    typeCategory: r.type_category as CaseEventRecord['typeCategory'],
    typeIcon: r.type_icon,
    typeBands: r.type_bands ? parseJson<CaseEventBand[] | null>(r.type_bands, null) : null,
    typeAudience: (r.type_audience as CaseEventRecord['typeAudience']) ?? 'family',
    typeFamilyFillable: r.type_family_fillable === 1,
    studentId: r.student_id,
    staffId: r.staff_id,
    staffName: r.staff_name,
    appointmentId: r.appointment_id,
    occurredAt: r.occurred_at,
    status: r.status as CaseEventStatus,
    payload: r.payload ? parseJson<Record<string, { value: string; label: string }> | null>(r.payload, null) : null,
    analysis: r.analysis ? parseJson<CaseEventAnalysis | null>(r.analysis, null) : null,
    summary: r.summary,
    fillExpiresAt: r.fill_expires_at,
    sentAt: r.sent_at ?? null,
    sentCount: r.sent_count ?? 0,
    createdAt: r.created_at
  };
}

/** تولید کلید یکتا برای نوع ساخته‌شده از پنل */
function newTypeKey(): string {
  const rnd = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  return `t-${rnd}`;
}

/**
 * — گیت ابزار سیستمی: قالب‌های باتری بالینی (is_system=1) از پنل
 * قابل ویرایش/غیرفعال‌سازی/حذف نیستند — تغییر ملاک فقط با نسخهٔ جدید کد.
 */
function assertNotSystemType(row: TypeRow, action: string): void {
  if (row.is_system === 1) {
    throw new ConflictError(`این ابزار سیستمیِ باتری بالینی است و ${action} آن از پنل مجاز نیست — تغییر ملاک فقط با نسخهٔ جدید سامانه`);
  }
}

export function createCaseEventsService(deps: CaseEventDeps): CaseEventsService {
  const { db, audit, logger } = deps;
  const log = logger.child('case-events');
  const now = deps.now ?? (() => new Date());
  const fillExpiryHours = deps.fillExpiryHours ?? 168;
  /** — ناظر ارسال (در api-routing به notify وصل می‌شود) */
  let sendFn: SendObserver | null = null;

  const EVENT_SELECT = `
    SELECT e.id, e.event_type_id, e.student_id, e.staff_id, s.full_name AS staff_name,
           e.appointment_id, e.occurred_at, e.status, e.payload, e.analysis, e.summary,
           e.fill_expires_at, e.sent_at, e.sent_count, e.created_by, e.created_at,
           t.title AS type_title, t.category AS type_category, t.icon AS type_icon, t.bands AS type_bands,
           t.audience AS type_audience, t.family_fillable AS type_family_fillable
      FROM case_events e
      JOIN case_event_types t ON t.id = e.event_type_id
      LEFT JOIN staff s ON s.id = e.staff_id
     WHERE e.deleted_at IS NULL`;

  async function loadTypeRow(id: string): Promise<TypeRow> {
    const row = await db.queryOne<TypeRow>(
      `SELECT * FROM case_event_types WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );
    if (!row) throw new NotFoundError('نوع رویداد');
    return row;
  }

  async function assertStudent(studentId: string): Promise<void> {
    const row = await db.queryOne<{ id: string }>(`SELECT id FROM students WHERE id = ?`, [studentId]);
    if (!row) throw new NotFoundError('دانش‌آموز');
  }

  /** گیت نویسنده/مدیر برای ویرایش و لغو */
  function assertEditor(actor: AuthContext, creatorId: string): void {
    if (actor.role === 'manager') return;
    if (actor.staffId === creatorId) return;
    throw new ForbiddenError('ویرایش رویداد فقط توسط ثبت‌کننده یا مدیر مجاز است');
  }

  async function getEventRow(id: string): Promise<EventRow> {
    const row = await db.queryOne<EventRow>(`${EVENT_SELECT} AND e.id = ?`, [id]);
    if (!row) throw new NotFoundError('رویداد');
    return row;
  }

  /** — هوک «اقدام بعدی»: فیلد next_action=پیگیری → پیگیری خودکار در همان تراکنش */
  async function runFollowUpHook(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    event: { id: string; student_id: string },
    fields: CaseEventField[],
    payload: Record<string, { value: string; label: string }> | null,
    actor: AuthContext
  ): Promise<void> {
    if (!deps.followups) return;
    if (!extractFollowUpAction(fields, payload)) return;
    const name = deps.studentNameOf ? await deps.studentNameOf(event.student_id) : null;
    await deps.followups.createWithinTx(
      tx as never,
      {
        entityType: 'case_event',
        entityId: event.id,
        studentId: event.student_id,
        title: name ? `پیگیری اقدام بعدی جلسه — ${name}` : 'پیگیری اقدام بعدی جلسه',
        assigneeId: actor.staffId,
        dueAt: new Date(now().getTime() + FOLLOWUP_DEFAULT_DUE_DAYS * 24 * 60 * 60 * 1000).toISOString()
      },
      actor
    );
  }

  return {
    // ───────── کاتالوگ انواع ─────────

    async listTypes(filters) {
      const conds: string[] = ['deleted_at IS NULL'];
      const params: unknown[] = [];
      if (filters?.activeOnly) conds.push('active = 1');
      if (filters?.category) {
        conds.push('category = ?');
        params.push(filters.category);
      }
      const rows = await db.query<TypeRow>(
        `SELECT * FROM case_event_types WHERE ${conds.join(' AND ')} ORDER BY category, created_at`,
        params
      );
      return rows.map(typeRowToRecord);
    },

    async getTypeById(id) {
      try {
        const row = await loadTypeRow(id);
        return typeRowToRecord(row);
      } catch {
        return null;
      }
    },

    async createType(input, actor) {
      validateTypeDefinition({ category: input.category, fields: input.fields, bands: input.bands ?? null, familyFillable: input.familyFillable, subscales: input.subscales ?? null });
      const id = crypto.randomUUID();
      const key = newTypeKey();
      await db.execute(
        `INSERT INTO case_event_types (id, key, title, description, category, icon, family_fillable, fields, bands, subscales, tags, audience, active, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
        [
          id, key, input.title, input.description?.trim() || null, input.category, input.icon ?? null,
          input.familyFillable ? 1 : 0,
          JSON.stringify(input.fields),
          input.bands && input.bands.length > 0 ? JSON.stringify(input.bands) : null,
          input.subscales && input.subscales.length > 0 ? JSON.stringify(input.subscales) : null,
          input.tags && input.tags.length > 0 ? JSON.stringify(input.tags) : null,
          input.audience ?? 'family',
          actor.staffId, now().toISOString(), now().toISOString()
        ]
      );
      await audit.log({
        actorId: actor.staffId,
        action: 'case_event.type.created',
        resourceType: 'case_event_type',
        resourceId: id,
        changes: {
          title: { from: null, to: input.title },
          category: { from: null, to: input.category },
          fieldCount: { from: null, to: input.fields.length }
        }
      });
      log.info('type.created', { id, key, category: input.category });
      const row = await loadTypeRow(id);
      return typeRowToRecord(row);
    },

    async updateType(id, input, actor) {
      const row = await loadTypeRow(id);
      assertNotSystemType(row, 'ویرایش');
      const current = typeRowToRecord(row);
      const next = {
        title: input.title ?? current.title,
        description: input.description !== undefined ? input.description?.trim() || null : current.description,
        category: input.category ?? current.category,
        icon: input.icon !== undefined ? input.icon ?? null : current.icon,
        familyFillable: input.familyFillable ?? current.familyFillable,
        fields: input.fields ?? current.fields,
        bands: input.bands !== undefined ? input.bands ?? null : current.bands,
        subscales: input.subscales !== undefined ? input.subscales ?? null : current.subscales,
        tags: input.tags !== undefined ? input.tags ?? [] : current.tags,
        audience: input.audience !== undefined ? input.audience ?? 'family' : current.audience
      };
      validateTypeDefinition({ category: next.category, fields: next.fields, bands: next.bands, familyFillable: next.familyFillable, subscales: next.subscales });
      await db.execute(
        `UPDATE case_event_types
            SET title = ?, description = ?, category = ?, icon = ?, family_fillable = ?, fields = ?, bands = ?, subscales = ?, tags = ?, audience = ?, updated_at = ?
          WHERE id = ?`,
        [
          next.title, next.description, next.category, next.icon, next.familyFillable ? 1 : 0,
          JSON.stringify(next.fields), next.bands ? JSON.stringify(next.bands) : null,
          next.subscales && next.subscales.length > 0 ? JSON.stringify(next.subscales) : null,
          next.tags.length > 0 ? JSON.stringify(next.tags) : null, next.audience,
          now().toISOString(), id
        ]
      );
      await audit.log({
        actorId: actor.staffId,
        action: 'case_event.type.updated',
        resourceType: 'case_event_type',
        resourceId: id,
        changes: {
          title: { from: current.title, to: next.title },
          fieldCount: { from: current.fields.length, to: next.fields.length }
        }
      });
      log.info('type.updated', { id });
      return typeRowToRecord(await loadTypeRow(id));
    },

    async deactivateType(id, actor) {
      const row = await loadTypeRow(id);
      assertNotSystemType(row, 'غیرفعال‌سازی');
      await db.execute(
        `UPDATE case_event_types SET active = 0, updated_at = ? WHERE id = ?`,
        [now().toISOString(), id]
      );
      await audit.log({
        actorId: actor.staffId,
        action: 'case_event.type.deactivated',
        resourceType: 'case_event_type',
        resourceId: id,
        changes: { active: { from: row.active, to: 0 } }
      });
      log.info('type.deactivated', { id });
      return true;
    },

    /** — حذف قالب (فقط مدیر) — فقط وقتی هیچ رویدادی به آن وصل نباشد؛ وگرنه خطا (غیرفعال‌سازی پیشنهاد می‌شود) */
    async deleteType(id, actor) {
      if (actor.role !== 'manager') {
        throw new ForbiddenError('حذف قالب فقط برای مدیر مجاز است');
      }
      const row = await loadTypeRow(id);
      assertNotSystemType(row, 'حذف');
      const used = await db.queryOne<{ n: number }>(
        `SELECT COUNT(*) AS n FROM case_events WHERE event_type_id = ?`,
        [id]
      );
      if ((used?.n ?? 0) > 0) {
        throw new ConflictError('به این قالب رویداد ثبت شده — به‌جای حذف، غیرفعال‌سازی کنید (سابقهٔ پرونده حفظ می‌شود)');
      }
      await db.execute(
        `UPDATE case_event_types SET deleted_at = ?, active = 0, updated_at = ? WHERE id = ?`,
        [now().toISOString(), now().toISOString(), id]
      );
      await audit.log({
        actorId: actor.staffId,
        action: 'case_event.type.deleted',
        resourceType: 'case_event_type',
        resourceId: id,
        changes: { title: { from: row.title, to: null } }
      });
      log.info('type.deleted', { id });
      return true;
    },

    // ───────── رویدادها ─────────

    async listEventsByStudent(studentId, filters) {
      const limit = Math.min(Math.max(filters?.limit ?? 50, 1), 200);
      const rows = await db.query<EventRow>(
        `${EVENT_SELECT} AND e.student_id = ? ORDER BY e.occurred_at DESC, e.created_at DESC LIMIT ?`,
        [studentId, limit]
      );
      return rows.map(eventRowToRecord);
    },

    /** — رویدادهای یک نوبت (نشانگر «گزارش ثبت‌شده» در جلسات/نوبت‌ها) */
    async listEventsByAppointment(appointmentId) {
      const rows = await db.query<EventRow>(
        `${EVENT_SELECT} AND e.appointment_id = ? ORDER BY e.occurred_at DESC, e.created_at DESC`,
        [appointmentId]
      );
      return rows.map(eventRowToRecord);
    },

    /** — رویدادهای چند نوبت یک‌جا (نشانگر گزارش در «گزارش جلسات من») */
    async listEventsByAppointments(appointmentIds) {
      const ids = [...new Set(appointmentIds)].filter((x) => typeof x === 'string' && x.length > 0).slice(0, 100);
      if (ids.length === 0) return new Map();
      const rows = await db.query<EventRow>(
        `${EVENT_SELECT} AND e.appointment_id IN (${ids.map(() => '?').join(', ')})
          ORDER BY e.occurred_at DESC, e.created_at DESC`,
        ids
      );
      const map = new Map<string, CaseEventRecord[]>();
      for (const r of rows) {
        const rec = eventRowToRecord(r);
        const arr = map.get(rec.appointmentId ?? '') ?? [];
        arr.push(rec);
        map.set(rec.appointmentId ?? '', arr);
      }
      return map;
    },

    async getEventById(id) {
      try {
        return eventRowToRecord(await getEventRow(id));
      } catch {
        return null;
      }
    },

    async createEvent(input, actor) {
      await assertStudent(input.studentId);
      const type = typeRowToRecord(await loadTypeRow(input.eventTypeId));
      if (!type.active) throw new ConflictError('این نوع رویداد غیرفعال است');

      const isChecklist = type.category === 'checklist';
      const asDraft = Boolean(input.draft) && !isChecklist; // چک‌لیست هرگز پیش‌نویس نمی‌شود
      let status: CaseEventStatus = 'completed';
      let payload: Record<string, { value: string; label: string }> | null = null;
      let analysis: CaseEventAnalysis | null = null;
      let summary: string | null = null;
      let fillToken: string | null = null;
      let fillExpires: string | null = null;

      if (isChecklist) {
        // چک‌لیست — رویداد با وضعیت «در انتظار پاسخ خانواده» ساخته می‌شود
        status = 'pending_family';
        fillToken = crypto.randomUUID();
        fillExpires = new Date(now().getTime() + fillExpiryHours * 3600_000).toISOString();
      } else {
        payload = buildEventPayload(type.fields, input.values ?? {}, !asDraft);
        summary = buildSummary(payload, null);
        if (asDraft) status = 'draft';
      }

      const id = crypto.randomUUID();
      const occurredAt = input.occurredAt ?? now().toISOString();
      await db.transaction(async (tx) => {
        await tx.execute(
          `INSERT INTO case_events (id, event_type_id, student_id, staff_id, appointment_id, occurred_at,
                                    status, payload, analysis, summary, fill_token, fill_expires_at, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id, type.id, input.studentId, actor.staffId, input.appointmentId ?? null, occurredAt,
            status, payload ? JSON.stringify(payload) : null, analysis ? JSON.stringify(analysis) : null, summary,
            fillToken, fillExpires, actor.staffId, now().toISOString(), now().toISOString()
          ]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'case_event.created',
          resourceType: 'case_event',
          resourceId: id,
          changes: {
            eventTypeId: { from: null, to: type.id },
            studentId: { from: null, to: input.studentId },
            status: { from: null, to: status },
            fieldCount: { from: null, to: type.fields.length }
          }
        });
        // هوک اقدام بعدی فقط برای گزارش نهایی‌شده (نه پیش‌نویس)
        if (!asDraft) {
          await runFollowUpHook(tx, { id, student_id: input.studentId }, type.fields, payload, actor);
        }
      });
      log.info('event.created', { id, type: type.key, studentId: input.studentId, status });
      return eventRowToRecord(await getEventRow(id));
    },

    async updateEvent(id, input, actor) {
      const row = await getEventRow(id);
      assertEditor(actor, row.staff_id ?? row.created_by);
      if (row.status !== 'completed' && row.status !== 'draft') {
        throw new ConflictError('فقط رویداد ثبت‌شده یا پیش‌نویس قابل ویرایش است');
      }
      const type = typeRowToRecord(await loadTypeRow(row.event_type_id));
      const mergedValues: Record<string, string | number | null> = {};
      const currentPayload = parseJson<Record<string, { value: string; label: string }> | null>(row.payload, null) ?? {};
      for (const f of type.fields) {
        if (input.values && f.key in input.values) {
          mergedValues[f.key] = input.values[f.key];
        } else if (f.key in currentPayload) {
          mergedValues[f.key] = currentPayload[f.key].value;
        } else {
          mergedValues[f.key] = null;
        }
      }
      // پیش‌نویس همچنان سخت‌گیری کمتر دارد؛ ثبت‌شده strict می‌ماند
      const payload = buildEventPayload(type.fields, mergedValues, row.status !== 'draft');
      const summary = input.summary?.trim() ? input.summary.trim() : buildSummary(payload, null);
      await db.execute(
        `UPDATE case_events SET payload = ?, summary = ?, updated_at = ? WHERE id = ?`,
        [JSON.stringify(payload), summary, now().toISOString(), id]
      );
      await audit.log({
        actorId: actor.staffId,
        action: 'case_event.updated',
        resourceType: 'case_event',
        resourceId: id,
        changes: { fieldsEdited: { from: null, to: input.values ? Object.keys(input.values).length : 0 } }
      });
      log.info('event.updated', { id });
      return eventRowToRecord(await getEventRow(id));
    },

    /** — نهایی‌سازی پیش‌نویس: اعتبارسنجی الزامی + تولید خلاصه + هوک اقدام بعدی */
    async finalizeEvent(id, actor) {
      await db.transaction(async (tx) => {
        const row = await tx.queryOne<EventRow>(`${EVENT_SELECT} AND e.id = ?`, [id]);
        if (!row) throw new NotFoundError('رویداد');
        assertEditor(actor, row.staff_id ?? row.created_by);
        if (row.status !== 'draft') {
          throw new ConflictError('فقط پیش‌نویس قابل نهایی‌سازی است');
        }
        const type = typeRowToRecord(await loadTypeRow(row.event_type_id));
        const currentPayload = parseJson<Record<string, { value: string; label: string }> | null>(row.payload, null) ?? {};
        const mergedValues: Record<string, string | number | null> = {};
        for (const f of type.fields) {
          mergedValues[f.key] = f.key in currentPayload ? currentPayload[f.key].value : null;
        }
        const payload = buildEventPayload(type.fields, mergedValues, true); // سخت‌گیری کامل
        const summary = buildSummary(payload, null);
        await tx.execute(
          `UPDATE case_events SET status = 'completed', payload = ?, summary = ?, updated_at = ? WHERE id = ?`,
          [JSON.stringify(payload), summary, now().toISOString(), id]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'case_event.finalized',
          resourceType: 'case_event',
          resourceId: id,
          changes: { status: { from: 'draft', to: 'completed' } }
        });
        await runFollowUpHook(tx, { id, student_id: row.student_id }, type.fields, payload, actor);
        log.info('event.finalized', { id });
      });
      // بازخوانی پس از تراکنش
      return eventRowToRecord(await getEventRow(id));
    },

    async cancelEvent(id, actor) {
      const row = await getEventRow(id);
      assertEditor(actor, row.staff_id ?? row.created_by);
      if (!canTransitionStatus(row.status, 'cancelled')) {
        throw new ConflictError('این رویداد در وضعیت فعلی قابل لغو نیست');
      }
      await db.execute(
        `UPDATE case_events SET status = 'cancelled', updated_at = ? WHERE id = ?`,
        [now().toISOString(), id]
      );
      await audit.log({
        actorId: actor.staffId,
        action: 'case_event.cancelled',
        resourceType: 'case_event',
        resourceId: id,
        changes: { status: { from: row.status, to: 'cancelled' } }
      });
      log.info('event.cancelled', { id });
      return eventRowToRecord(await getEventRow(id));
    },

    /** — حذف نرم رویداد (فقط مدیر) — دستور کاربر: «امکان حذف رویداد ها برای مدیر فراهم بشه»
     * از همهٔ فهرست‌ها/تایم‌لاین/صف انتظار پنهان می‌شود؛ audit برای شفافیت می‌ماند */
    async deleteEvent(id, actor) {
      if (actor.role !== 'manager') {
        throw new ForbiddenError('حذف رویداد فقط برای مدیر مجاز است');
      }
      const row = await getEventRow(id); // خودش حذف‌شده‌ها را نمی‌بیند (deleted_at IS NULL)
      await db.execute(
        `UPDATE case_events SET deleted_at = ?, deleted_by = ?, updated_at = ? WHERE id = ?`,
        [now().toISOString(), actor.staffId, now().toISOString(), id]
      );
      await audit.log({
        actorId: actor.staffId,
        action: 'case_event.deleted',
        resourceType: 'case_event',
        resourceId: id,
        changes: {
          typeTitle: { from: row.type_title, to: null },
          studentId: { from: row.student_id, to: null },
          status: { from: row.status, to: 'deleted' }
        }
      });
      log.info('event.deleted', { id, deletedBy: actor.staffId });
    },

    // ───────── پیوست‌ها ─────────

    async addEventFile(eventId, input, actor) {
      const check = validateFileInput(input);
      if (!check.ok) throw new ValidationError(check.reason);

      const contentB64 = stripDataUrlPrefix(input.contentB64);
      const filename = sanitizeFilename(input.filename);

      return db.transaction(async (tx) => {
        const row = await tx.queryOne<{ status: string }>(
          `SELECT status FROM case_events WHERE id = ?`,
          [eventId]
        );
        if (!row) throw new NotFoundError('رویداد');
        if (row.status === 'cancelled') throw new ConflictError('رویداد لغوشده پیوست نمی‌پذیرد');

        const count = await tx.queryOne<{ n: number }>(
          `SELECT COUNT(*) AS n FROM case_event_files WHERE case_event_id = ?`,
          [eventId]
        );
        if ((count?.n ?? 0) >= EVENT_FILES_MAX) {
          throw new ConflictError(`حداکثر ${EVENT_FILES_MAX} پیوست برای هر رویداد مجاز است`);
        }

        const id = crypto.randomUUID();
        const sizeBytes = estimateBase64Bytes(contentB64);
        await tx.execute(
          `INSERT INTO case_event_files (id, case_event_id, filename, mime_type, size_bytes, content_b64, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [id, eventId, filename, input.mimeType.toLowerCase(), sizeBytes, contentB64, actor.staffId]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'case_event.file.add',
          resourceType: 'case_event',
          resourceId: eventId,
          changes: { filename: { from: null, to: filename }, sizeBytes: { from: null, to: sizeBytes } }
        });
        return {
          id,
          caseEventId: eventId,
          filename,
          mimeType: input.mimeType.toLowerCase(),
          sizeBytes,
          createdBy: actor.staffId,
          createdAt: now().toISOString()
        };
      });
    },

    async listEventFiles(eventId) {
      const rows = await db.query<EventFileRow>(
        `SELECT id, case_event_id, filename, mime_type, size_bytes, created_by, created_at
           FROM case_event_files WHERE case_event_id = ? ORDER BY created_at`,
        [eventId]
      );
      return rows.map(fileRowToMeta);
    },

    async getEventFile(eventId, fileId) {
      const row = await db.queryOne<EventFileRow>(
        `SELECT id, case_event_id, filename, mime_type, size_bytes, content_b64, created_by, created_at
           FROM case_event_files WHERE id = ? AND case_event_id = ?`,
        [fileId, eventId]
      );
      if (!row) throw new NotFoundError('پیوست');
      return { ...fileRowToMeta(row), bytes: base64ToBytes(stripDataUrlPrefix(row.content_b64 ?? '')) };
    },

    async deleteEventFile(eventId, fileId, actor) {
      await db.transaction(async (tx) => {
        const row = await tx.queryOne<EventFileRow>(
          `SELECT id, case_event_id, filename, mime_type, size_bytes, content_b64, created_by, created_at
             FROM case_event_files WHERE id = ? AND case_event_id = ?`,
          [fileId, eventId]
        );
        if (!row) throw new NotFoundError('پیوست');
        // گیت: ثبت‌کنندهٔ رویداد یا مدیر — هم‌تراز ویرایش خود رویداد
        const event = await tx.queryOne<{ staff_id: string | null; created_by: string }>(
          `SELECT staff_id, created_by FROM case_events WHERE id = ?`,
          [eventId]
        );
        if (event) assertEditor(actor, event.staff_id ?? event.created_by);

        await tx.execute(`DELETE FROM case_event_files WHERE id = ?`, [fileId]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'case_event.file.delete',
          resourceType: 'case_event',
          resourceId: eventId,
          changes: { filename: { from: row.filename, to: null } }
        });
      });
    },

    // ───────── حلقهٔ خانواده ─────────

    async guardianChats(studentId) {
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
    },

    async assertFamilyChat(studentId, chatId) {
      const chats = await this.guardianChats(studentId);
      return chats.includes(chatId);
    },

    // ───────── موتور تشخیص و مداخله ─────────

    /** چت‌های معلمِ کلاسِ دانش‌آموز — class_bot_links متصل */
    async teacherChats(studentId) {
      const rows = await db.query<{ chat_id: string }>(
        `SELECT DISTINCT l.chat_id
           FROM class_bot_links l
           JOIN students s ON s.class_id = l.class_id
          WHERE s.id = ? AND l.status = 'linked' AND l.chat_id IS NOT NULL`,
        [studentId]
      );
      return [...new Set(rows.map((r) => r.chat_id))];
    },

    /** قالب‌های چک‌لیست مناسب دانش‌آموز — مرتب بر هم‌پوشانی برچسب‌ها (موتور پیشنهاد) */
    async suggestTypesForStudent(studentId) {
      const [tagRows, typeRows] = await Promise.all([
        db.query<{ id: string; name: string }>(
          `SELECT t.id, t.name
             FROM student_tags st
             JOIN tags t ON t.id = st.tag_id
            WHERE st.student_id = ? AND t.active = 1`,
          [studentId]
        ),
        db.query<TypeRow>(
          `SELECT * FROM case_event_types
            WHERE deleted_at IS NULL AND active = 1 AND category = 'checklist'
            ORDER BY created_at`
        )
      ]);
      const studentTagIds = new Set(tagRows.map((r) => r.id));
      const tagNames = new Map(tagRows.map((r) => [r.id, r.name] as const));
      const items: ChecklistSuggestion[] = typeRows.map((row) => {
        const type = typeRowToRecord(row);
        const matched = type.tags
          .filter((id) => studentTagIds.has(id))
          .map((id) => ({ id, name: tagNames.get(id) ?? '' }))
          .filter((m) => m.name.length > 0);
        return { type, matched, score: matched.length };
      });
      // ترتیب: تطابق برچسب بیشتر → مخاطب نزدیک‌تر به خانواده (both > family > teacher) → عنوان فارسی
      const audienceRank: Record<string, number> = { both: 0, family: 1, teacher: 2 };
      items.sort(
        (a, b) =>
          b.score - a.score ||
          (audienceRank[a.type.audience] ?? 3) - (audienceRank[b.type.audience] ?? 3) ||
          a.type.title.localeCompare(b.type.title, 'fa')
      );
      return items;
    },

    /** صف «در انتظار پاسخ» — چک‌لیست‌های pending_family با نام دانش‌آموز و وضعیت ارسال */
    async listPendingChecklists() {
      const rows = await db.query<EventRow>(
        `SELECT e.id, e.event_type_id, e.student_id, e.staff_id, s.full_name AS staff_name,
                e.appointment_id, e.occurred_at, e.status, e.payload, e.analysis, e.summary,
                e.fill_expires_at, e.sent_at, e.sent_count, e.created_by, e.created_at,
                t.title AS type_title, t.category AS type_category, t.icon AS type_icon,
                t.bands AS type_bands, t.audience AS type_audience,
                t.family_fillable AS type_family_fillable,
                st.first_name || ' ' || st.last_name AS student_name
           FROM case_events e
           JOIN case_event_types t ON t.id = e.event_type_id
           LEFT JOIN staff s ON s.id = e.staff_id
           JOIN students st ON st.id = e.student_id
          WHERE e.status = 'pending_family' AND t.category = 'checklist' AND e.deleted_at IS NULL
          ORDER BY e.occurred_at DESC LIMIT 100`
      );
      const nowMs = now().getTime();
      return rows.map((r) => {
        const rec = eventRowToRecord(r);
        return {
          id: rec.id,
          studentId: rec.studentId,
          studentName: r.student_name ?? '',
          typeId: rec.eventTypeId,
          typeTitle: rec.typeTitle,
          typeIcon: rec.typeIcon,
          typeAudience: (r.type_audience as CaseEventAudience) ?? 'family',
          occurredAt: rec.occurredAt,
          fillExpiresAt: rec.fillExpiresAt,
          sentAt: rec.sentAt,
          sentCount: rec.sentCount,
          expired: rec.fillExpiresAt ? new Date(rec.fillExpiresAt).getTime() < nowMs : false
        };
      });
    },

    /**
     * — ارسال با یک کلیک: رویداد باید چک‌لیستِ در انتظار باشد؛
     * گیرنده‌ها از audience قالب (یا صریح درخواست) resolved می‌شوند؛
     * پیام با لینک امن وب‌فرم از observer (notify) می‌رود؛ شمارش واقعی برمی‌گردد.
     */
    async sendChecklistLink(eventId, input, actor) {
      if (!sendFn) throw new ConflictError('سرویس اعلان در دسترس نیست');
      const row = await getEventRow(eventId);
      if (row.type_category !== 'checklist') throw new ValidationError('این رویداد چک‌لیست نیست');
      if (row.status !== 'pending_family') throw new ConflictError('این چک‌لیست در انتظار پاسخ نیست (قبلاً پر یا لغو شده)');
      const type = typeRowToRecord(await loadTypeRow(row.event_type_id));
      if (!type.familyFillable) throw new ValidationError('این فرم برای پر کردن از سمت گیرنده طراحی نشده است');

      const wanted: CaseEventAudience = input.audience ?? type.audience ?? 'family';
      const familyChats = wanted === 'family' || wanted === 'both' ? await this.guardianChats(row.student_id) : [];
      const teacherList = wanted === 'teacher' || wanted === 'both' ? await this.teacherChats(row.student_id) : [];
      const chats = [...new Set([...familyChats, ...teacherList])];
      if (chats.length === 0) {
        throw new ConflictError(
          wanted === 'teacher'
            ? 'چت معلمِ کلاس این دانش‌آموز در بله متصل نیست — اول کد اتصال کلاس را فعال کنید'
            : 'هیچ چت متصلی برای این دانش‌آموز پیدا نشد — اول ولیّ/معلم را با کد اتصال به بات وصل کنید'
        );
      }

      const base = deps.publicBaseUrl ?? null;
      if (!base) throw new ConflictError('آدرس عمومی سایت تنظیم نشده است — ساخت لینک فرم ممکن نیست');
      const link = await this.mintFillLink(eventId, base);
      if (!link) throw new ConflictError('ساخت لینک فرم ممکن نیست');

      const studentName = (await deps.studentNameOf?.(row.student_id)) ?? 'دانش‌آموز';
      const note = input.note?.trim() ? input.note.trim() : null;
      const extra = [
        `چک‌لیست «${type.title}»`,
        note ? `یادداشت: ${note}` : null,
        'فرم امن (۷ روز اعتبار):',
        link
      ].filter((x): x is string => Boolean(x)).join('\n');

      // dedup داخل همان دقیقه (ضد دابل‌کلیک) — ارسال دوباره در دقیقهٔ بعد آزاد است
      const minuteBucket = Math.floor(now().getTime() / 60_000);
      const sent = await sendFn({
        studentId: row.student_id,
        chats,
        template: 'bot_checklist_link',
        vars: { studentName, extra },
        dedupBase: `ce:${eventId}:${minuteBucket}`
      });

      const sentAt = now().toISOString();
      await db.execute(
        `UPDATE case_events SET sent_at = ?, sent_count = sent_count + ?, updated_at = ? WHERE id = ?`,
        [sentAt, sent, sentAt, eventId]
      );
      await audit.log({
        actorId: actor.staffId,
        action: 'case_event.link_sent',
        resourceType: 'case_event',
        resourceId: eventId,
        changes: {
          audience: { from: null, to: wanted },
          targets: { from: null, to: chats.length },
          sent: { from: null, to: sent }
        }
      });
      log.info('event.link_sent', { eventId, wanted, targets: chats.length, sent });
      return { sent, targets: chats };
    },

    setSendObserver(fn) {
      sendFn = fn;
    },

    async verifyFillToken(id, token) {
      if (!token || token.length < 8) return false;
      const row = await db.queryOne<{ fill_token: string | null }>(
        `SELECT fill_token FROM case_events WHERE id = ?`,
        [id]
      );
      return Boolean(row?.fill_token) && row!.fill_token === token;
    },

    async mintFillLink(id, publicBaseUrl) {
      const row = await db.queryOne<{ fill_token: string | null; status: string }>(
        `SELECT fill_token, status FROM case_events WHERE id = ?`,
        [id]
      );
      if (!row || row.status !== 'pending_family' || !row.fill_token) return null;
      const base = publicBaseUrl.replace(/\/+$/, '');
      return `${base}/public/case-events/${id}/fill?token=${row.fill_token}`;
    },

    async fillByFamily(id, input, actor) {
      const row = await getEventRow(id);
      if (row.type_category !== 'checklist') {
        throw new ValidationError('این رویداد چک‌لیست خانواده نیست');
      }
      if (row.status === 'cancelled') throw new ConflictError('این چک‌لیست لغو شده است');
      if (row.status !== 'pending_family') throw new ConflictError('این چک‌لیست قبلاً پاسخ گرفته است');
      if (input.viaWeb) {
        // گیت توکن — بررسی در مسیر عمومی انجام شده؛ این‌جا انقضا دوباره چک می‌شود
        if (!row.fill_expires_at || new Date(row.fill_expires_at).getTime() < now().getTime()) {
          throw new ConflictError('مهلت پر کردن این چک‌لیست تمام شده است');
        }
      }

      const type = typeRowToRecord(await loadTypeRow(row.event_type_id));
      const bands = type.bands;
      const subscales = type.subscales;
      const values = input.values;
      for (const f of type.fields) {
        if (values[f.key] === undefined) {
          throw new ValidationError(`آیتم «${f.label}» بی‌پاسخ مانده است`);
        }
      }
      // تحلیل v2: معکوس/گزینه‌های نمره‌دار/زیرمقیاس/پرچم بحرانی/تفسیر خودکار
      const analysis = analyzeChecklist(type.fields, bands, values, subscales);
      // payload نمایشی: نمرهٔ خام برای scale؛ برچسب گزینه برای گزینه‌ای نمره‌دار
      const payload: Record<string, { value: string; label: string }> = {};
      for (const f of type.fields) {
        const raw = values[f.key];
        const display = f.type === 'single'
          ? (f.scoredOptions?.[Number(raw)]?.label ?? String(raw))
          : String(raw);
        payload[f.key] = { value: display, label: f.label };
      }
      const summary = buildSummary(payload, analysis);
      const sourceTag = input.viaWeb ? `web:${now().toISOString()}` : (input.sourceChatId ?? 'unknown');

      await db.execute(
        `UPDATE case_events
            SET status = 'completed', payload = ?, analysis = ?, summary = ?,
                filled_by_chat_id = ?, updated_at = ?
          WHERE id = ?`,
        [JSON.stringify(payload), JSON.stringify(analysis), summary, sourceTag, now().toISOString(), id]
      );
      await audit.log({
        actorId: actor.staffId,
        action: 'case_event.family_filled',
        resourceType: 'case_event',
        resourceId: id,
        changes: {
          studentId: { from: null, to: row.student_id },
          answered: { from: null, to: analysis.answered },
          via: { from: null, to: input.viaWeb ? 'web' : 'bot' }
        }
      });
      log.info('event.family_filled', { id, answered: analysis.answered, score: analysis.score, via: input.viaWeb ? 'web' : 'bot' });
      return eventRowToRecord(await getEventRow(id));
    }
  };
}

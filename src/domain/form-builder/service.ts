/* form-builder/service.ts — سرویس فرم‌ساز عمومی (v1.27.34 — REFERRAL-DESIGN §A/M4/M8)
 * CRUD فرم‌ها (مدیر/منشی) + ثبت پاسخ عمومی با اعتبارسنجی کامل در برابر بلوک‌های منتشرشده.
 * حذف نرم + audit همه‌جا؛ بدون CHECK در SQL — enumها در constants+Zod. */
import type { AuthContext } from '@core/shared';
import { FORM_RESPONSE_LIMIT, currentSchoolYear } from '@core/shared';
import { ConflictError, NotFoundError, ValidationError } from '@core/errors';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { DbClient } from '@core/db';
import { hasDuplicateOptionValues, validateAnswers } from './pure';
import type {
  FormAnswer,
  FormBlock,
  FormBuilderDeps,
  FormBuilderService,
  FormDefinition,
  FormResponse,
  FormResponseSubmitInput,
  FormUpsertInput,
  ResponseMeta
} from './types';

interface FormRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  blocks: string;
  published: number;
  academic_year: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface ResponseRow {
  id: string;
  form_id: string;
  answers: string;
  respondent_name: string;
  respondent_phone: string | null;
  channel: string;
  status: string;
  academic_year: string | null;
  created_at: string;
}

function parseBlocks(raw: string): FormBlock[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as FormBlock[]) : [];
  } catch {
    return [];
  }
}

function parseAnswers(raw: string): FormAnswer[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as FormAnswer[]) : [];
  } catch {
    return [];
  }
}

function formRowToDomain(r: FormRow): FormDefinition {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description,
    blocks: parseBlocks(r.blocks),
    published: r.published === 1,
    academicYear: r.academic_year,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

function responseRowToDomain(r: ResponseRow): FormResponse {
  return {
    id: r.id,
    formId: r.form_id,
    answers: parseAnswers(r.answers),
    respondentName: r.respondent_name,
    respondentPhone: r.respondent_phone,
    channel: r.channel,
    status: r.status as FormResponse['status'],
    academicYear: r.academic_year,
    createdAt: r.created_at
  };
}

const FORM_SELECT = `SELECT * FROM forms WHERE deleted_at IS NULL`;
const RESPONSE_BY_ID = `SELECT * FROM form_responses WHERE id = ? AND deleted_at IS NULL`;

export function createFormBuilderService(deps: FormBuilderDeps): FormBuilderService {
  const { db, audit, logger } = deps;
  const log = logger.child('form-builder');

  async function loadForm(id: string): Promise<FormRow> {
    const row = await db.queryOne<FormRow>(`${FORM_SELECT} AND id = ?`, [id]);
    if (!row) throw new NotFoundError('فرم');
    return row;
  }

  async function assertSlugFree(slug: string, exceptId?: string): Promise<void> {
    const dup = await db.queryOne<{ id: string }>(
      `${FORM_SELECT} AND slug = ? AND (? IS NULL OR id != ?) LIMIT 1`,
      [slug, exceptId ?? null, exceptId ?? null]
    );
    if (dup) throw new ConflictError('این اسلاگ قبلاً گرفته شده — لینک عمومی باید یکتا بماند');
  }

  /* اعتبارسنجی بلوک‌ها فراتر از شِما: گزینه‌های تکراری و اندیس‌گذاری امن */
  function assertBlocksSane(blocks: unknown[]): void {
    const parsed = blocks as FormBlock[];
    for (const b of parsed) {
      if (hasDuplicateOptionValues(b)) {
        throw new ValidationError(`گزینه‌های «${b.label}» مقدار تکراری دارند`);
      }
    }
  }

  const service: FormBuilderService = {
    async list(): Promise<FormDefinition[]> {
      const rows = await db.query<FormRow>(`${FORM_SELECT} ORDER BY created_at DESC, id DESC LIMIT 200`);
      return rows.map(formRowToDomain);
    },

    async getById(id: string): Promise<FormDefinition | null> {
      const row = await db.queryOne<FormRow>(`${FORM_SELECT} AND id = ?`, [id]);
      return row ? formRowToDomain(row) : null;
    },

    async create(input: FormUpsertInput, actor: AuthContext): Promise<FormDefinition> {
      await assertSlugFree(input.slug);
      assertBlocksSane(input.blocks);
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await db.transaction(async (tx) => {
        await tx.execute(
          `INSERT INTO forms (id, slug, title, description, blocks, published, academic_year, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            input.slug,
            input.title,
            input.description ?? null,
            JSON.stringify(input.blocks),
            input.published ? 1 : 0,
            currentSchoolYear(),
            actor.staffId,
            now,
            now
          ]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'form.create',
          resourceType: 'form',
          resourceId: id,
          changes: { slug: { from: null, to: input.slug }, blocks: { from: null, to: input.blocks.length } }
        });
      });
      log.info('form.created', { id, slug: input.slug });
      return formRowToDomain(await loadForm(id));
    },

    /* ویرایش کل‌جایگزین — ویرایشگر همیشه کل فرم را می‌فرستد (عین الگوی ثبت نتیجهٔ ارزیابی) */
    async update(id: string, input: FormUpsertInput, actor: AuthContext): Promise<FormDefinition> {
      const current = await loadForm(id);
      if (current.slug !== input.slug) await assertSlugFree(input.slug, id);
      assertBlocksSane(input.blocks);
      await db.transaction(async (tx) => {
        await tx.execute(
          `UPDATE forms
             SET slug = ?, title = ?, description = ?, blocks = ?, published = ?, updated_at = ?
           WHERE id = ?`,
          [
            input.slug,
            input.title,
            input.description ?? null,
            JSON.stringify(input.blocks),
            input.published ? 1 : 0,
            new Date().toISOString(),
            id
          ]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'form.update',
          resourceType: 'form',
          resourceId: id,
          changes: {
            slug: { from: current.slug, to: input.slug },
            published: { from: current.published === 1, to: input.published },
            blocks: { from: parseBlocks(current.blocks).length, to: input.blocks.length }
          }
        });
      });
      log.info('form.updated', { id, slug: input.slug });
      return formRowToDomain(await loadForm(id));
    },

    async remove(id: string, actor: AuthContext): Promise<void> {
      const current = await loadForm(id);
      await db.transaction(async (tx) => {
        await tx.execute(`UPDATE forms SET deleted_at = ?, updated_at = datetime('now') WHERE id = ?`, [
          new Date().toISOString(),
          id
        ]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'form.delete',
          resourceType: 'form',
          resourceId: id,
          changes: { slug: { from: current.slug, to: null } }
        });
      });
      log.info('form.deleted', { id });
    },

    async getBySlugPublished(slug: string): Promise<FormDefinition | null> {
      const row = await db.queryOne<FormRow>(`${FORM_SELECT} AND slug = ? AND published = 1`, [slug]);
      return row ? formRowToDomain(row) : null;
    },

    /* ثبت پاسخ عمومی — فقط فرم منتشرشده؛ اعتبارسنجی کامل پاسخ‌ها در برابر بلوک‌های زندهٔ فرم */
    async submitResponse(slug: string, input: FormResponseSubmitInput, meta: ResponseMeta): Promise<FormResponse> {
      const form = await db.queryOne<FormRow>(`${FORM_SELECT} AND slug = ? AND published = 1`, [slug]);
      if (!form) throw new NotFoundError('فرم');
      const blocks = parseBlocks(form.blocks);
      const check = validateAnswers(blocks, input.answers);
      if (!check.ok) throw new ValidationError(check.error ?? 'پاسخ‌ها معتبر نیستند');
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const channel = input.token ? 'bot' : 'web';
      await db.transaction(async (tx) => {
        await tx.execute(
          `INSERT INTO form_responses
             (id, form_id, answers, respondent_name, respondent_phone, channel, token, academic_year, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)`,
          [
            id,
            form.id,
            JSON.stringify(check.normalized),
            input.respondent_name,
            input.respondent_phone ?? null,
            channel,
            input.token ?? null,
            currentSchoolYear(),
            now,
            now
          ]
        );
        await audit.logInTransaction(tx, {
          actorId: 'public',
          action: 'form.response_submit',
          resourceType: 'form',
          resourceId: form.id,
          changes: {
            slug: { from: null, to: form.slug },
            answers: { from: null, to: check.normalized.length },
            channel: { from: null, to: channel }
          }
        });
      });
      log.info('form.response.submitted', { formId: form.id, slug: form.slug, ip: meta.ip });
      return responseRowToDomain((await db.queryOne<ResponseRow>(RESPONSE_BY_ID, [id]))!);
    },

    async listResponses(formId: string, status?: string): Promise<FormResponse[]> {
      const where = ['deleted_at IS NULL', 'form_id = ?'];
      const params: string[] = [formId];
      if (status) {
        where.push('status = ?');
        params.push(status);
      }
      const rows = await db.query<ResponseRow>(
        `SELECT * FROM form_responses
          WHERE ${where.join(' AND ')}
          ORDER BY created_at DESC, id DESC
          LIMIT ${FORM_RESPONSE_LIMIT}`,
        params
      );
      return rows.map(responseRowToDomain);
    },

    async markResponseSeen(id: string, actor: AuthContext): Promise<FormResponse> {
      const row = await db.queryOne<ResponseRow>(RESPONSE_BY_ID, [id]);
      if (!row) throw new NotFoundError('پاسخ');
      await db.transaction(async (tx) => {
        await tx.execute(`UPDATE form_responses SET status = 'seen', updated_at = ? WHERE id = ?`, [
          new Date().toISOString(),
          id
        ]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'form.response_seen',
          resourceType: 'form_response',
          resourceId: id,
          changes: { status: { from: row.status, to: 'seen' } }
        });
      });
      log.info('form.response.seen', { id });
      return responseRowToDomain((await db.queryOne<ResponseRow>(RESPONSE_BY_ID, [id]))!);
    }
  };

  return service;
}

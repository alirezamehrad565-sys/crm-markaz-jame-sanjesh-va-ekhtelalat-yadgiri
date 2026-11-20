/* form-builder/types.ts — فرم‌ساز تعاملی عمومی (v1.27.34 — REFERRAL-DESIGN §A / INTAKE-DESIGN §۳.۲)
 *
 * جدول تازه = ماژول تازه (قرارداد design.md). فرم تعریفشده با بلوک‌های JSON شِمادار منتشر
 * می‌شود و پاسخ‌های بدون‌لاگین در form_responses می‌نشیند. شمای بلوک‌ها در FormBlockSchema
 * (core/shared) اعمال می‌شود؛ منطق پاسخ‌ها در pure.ts.
 */
import type { AuthContext } from '@core/shared';
import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';

export type FormBlockKind =
  | 'text'
  | 'longtext'
  | 'number'
  | 'phone'
  | 'select'
  | 'multi'
  | 'yes_no'
  | 'note';

export interface FormBlock {
  kind: FormBlockKind;
  label: string;
  required: boolean;
  options?: { value: string; label: string }[];
  note?: string;
}

export interface FormDefinition {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  blocks: FormBlock[];
  published: boolean;
  academicYear: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface FormAnswer {
  index: number;
  value: string | string[] | number | boolean;
}

export interface FormResponse {
  id: string;
  formId: string;
  answers: FormAnswer[];
  respondentName: string;
  respondentPhone: string | null;
  channel: string;
  status: 'new' | 'seen';
  academicYear: string | null;
  createdAt: string;
}

/* ورودی‌ها از مسیر FormUpsertSchema / FormResponseSubmitSchema (core/shared) parse می‌شوند */
export interface FormUpsertInput {
  title: string;
  slug: string;
  description?: string;
  blocks: unknown[];
  published: boolean;
}

export interface FormResponseSubmitInput {
  answers: { index: number; value: unknown }[];
  respondent_name: string;
  respondent_phone?: string | null;
  token?: string;
}

export interface ResponseMeta {
  ip?: string;
}

export interface FormBuilderDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
}

export interface FormBuilderService {
  list(): Promise<FormDefinition[]>;
  getById(id: string): Promise<FormDefinition | null>;
  create(input: FormUpsertInput, actor: AuthContext): Promise<FormDefinition>;
  update(id: string, input: FormUpsertInput, actor: AuthContext): Promise<FormDefinition>;
  remove(id: string, actor: AuthContext): Promise<void>;
  getBySlugPublished(slug: string): Promise<FormDefinition | null>;
  submitResponse(slug: string, input: FormResponseSubmitInput, meta: ResponseMeta): Promise<FormResponse>;
  listResponses(formId: string, status?: string): Promise<FormResponse[]>;
  markResponseSeen(id: string, actor: AuthContext): Promise<FormResponse>;
}

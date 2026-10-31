import type { AuthContext, StaffRole } from '@core/shared';

// ─── درون‌ریزی اکسل: انواع ماژول ───
// الگو: قالب و پارس فایل سمت مرورگر انجام می‌شود (SheetJS وندورشده)؛
// سرور منبع حقیقت ستون‌ها است (registry) + اعتبارسنجی و ثبت تراکنشی.

export type ImportColumnType = 'text' | 'longtext' | 'date' | 'enum' | 'phone' | 'code';

export interface ImportColumnOption {
  value: string;
  label: string;
  /** مترادف‌های پذیرفته‌شده در سلول اکسل (مثل «برنامه ریزی شده» بدون نیم‌فاصله) */
  aliases?: string[];
}

export interface ImportColumnSpec {
  /** کلید ستون در payload درون‌ریزی */
  key: string;
  /** نام فیلد در رکورد JSON خروجی API — برای «دریافت داده‌های فعلی» (undefined = همان key) */
  recordKey?: string;
  /** هدر فارسی ستون در اکسل */
  label: string;
  type: ImportColumnType;
  required?: boolean;
  options?: ImportColumnOption[];
  maxLength?: number;
  /** عرض ستون در فایل اکسل (تعداد نویسه) */
  width?: number;
  /** توضیح برای شیت «راهنما» */
  help: string;
  /** نمونهٔ مقدار برای شیت راهنما */
  example?: string;
}

/** موجودیت قابل درون‌ریزی — JSON-safe (سمت مرورگر هم مصرف می‌شود) */
export interface ImportRegistryEntity {
  key: string;
  title: string;
  hint: string;
  roles: StaffRole[];
  /** مسیر GET داده‌های فعلی برای خروجی اکسل */
  listUrl: string;
  /** نام ستون کلید تشخیص ویرایش */
  keyLabel: string;
  columns: ImportColumnSpec[];
}

export type ImportRowStatus = 'add' | 'update' | 'error';

export interface ImportValidatedRow {
  index: number; // شماره سطر در فایل (از ۱، بعد از سرستون)
  status: ImportRowStatus;
  errors: string[];
  /** مقادیر نرمال‌شده برای پیش‌نمایش (تاریخ شمسی، برچسب فارسی وضعیت و…) */
  display: Record<string, string>;
}

export interface ImportValidateResult {
  total: number;
  summary: { add: number; update: number; error: number };
  rows: ImportValidatedRow[];
}

export interface ImportCommitResult {
  added: number;
  updated: number;
  skipped: number;
}

export interface ImportService {
  registryFor(role: StaffRole): ImportRegistryEntity[];
  validate(entityKey: string, role: StaffRole, rawRows: unknown): Promise<ImportValidateResult>;
  commit(
    entityKey: string,
    rawRows: unknown,
    actor: AuthContext
  ): Promise<ImportCommitResult>;
}

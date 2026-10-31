import { faDigits } from '@core/shared';
import { ForbiddenError, NotFoundError, ValidationError } from '@core/errors';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { DbClient } from '@core/db';
import type { AuthContext, StaffRole } from '@core/shared';
import { IMPORT_ENTITIES, IMPORT_ROWS_MAX, findImportEntity } from './registry';
import {
  jalaliDisplayOfYmd,
  matchEnum,
  nameKey,
  normalizeCellText,
  normalizeCode,
  normalizePhone,
  parseFlexibleDate
} from './pure';
import type {
  ImportColumnSpec,
  ImportCommitResult,
  ImportRegistryEntity,
  ImportValidatedRow,
  ImportValidateResult
} from './types';

// ─── درون‌ریزی اکسل: سرویس (اعتبارسنجی سطری + ثبت تراکنشی) ───
// قاعدهٔ ویرایش: خانهٔ خالی = مقدار قبلی حفظ می‌شود (در راهنمای قالب هم آمده است).

type RawRow = Record<string, string>;

interface FieldResult {
  errors: string[];
  display: Record<string, string>;
  normalized: Record<string, unknown>;
}

interface InternalRow {
  index: number; // از ۱
  raw: RawRow;
  result: FieldResult;
  status: 'add' | 'update' | 'error';
  key: string | null; // کلید نرمال‌شدهٔ تطبیق
  existingId: string | null;
}

interface SchoolRow {
  id: string;
  name: string;
  kind: string;
  gender_type: string | null;
  phone: string | null;
  address: string | null;
  principal_name: string | null;
  principal_phone: string | null;
  code: string | null;
  notes: string | null;
}

interface PlanRow {
  id: string;
  title: string;
  admin_actions: string;
  center_actions: string;
  from_date: string;
  to_date: string | null;
  status: string;
  tag: string | null;
  sort_order: number;
}

interface ClassDbRow {
  id: string;
  school_id: string;
  name: string;
  teacher_name: string | null;
  teacher_phone: string | null;
  active: number;
}

interface SchoolLite {
  id: string;
  name: string;
}

function coerceRows(rawRows: unknown): RawRow[] {
  if (!Array.isArray(rawRows)) throw new ValidationError('rows باید آرایه باشد');
  if (rawRows.length === 0) throw new ValidationError('هیچ ردیفی برای درون‌ریزی ارسال نشده است');
  if (rawRows.length > IMPORT_ROWS_MAX) {
    throw new ValidationError(`حداکثر ${faDigits(IMPORT_ROWS_MAX)} ردیف در هر بار درون‌ریزی مجاز است`);
  }
  return rawRows.map((r) => {
    if (typeof r !== 'object' || r === null || Array.isArray(r)) {
      throw new ValidationError('هر ردیف باید شیء مقادیر ستون‌ها باشد');
    }
    const out: RawRow = {};
    for (const [k, v] of Object.entries(r as Record<string, unknown>)) {
      if (v === null || v === undefined) {
        out[k] = '';
      } else if (typeof v === 'string') {
        out[k] = v;
      } else if (typeof v === 'number' && Number.isFinite(v)) {
        out[k] = String(v);
      } else {
        out[k] = String(v);
      }
    }
    return out;
  });
}

function labelOf(col: ImportColumnSpec): string {
  return col.label;
}

// ─── اعتبارسنجی سطری — مدارس ───

function validateSchoolRow(raw: RawRow, colByKey: Map<string, ImportColumnSpec>): FieldResult {
  const errors: string[] = [];
  const display: Record<string, string> = {};
  const normalized: Record<string, unknown> = {};

  // نام (الزامی — کلید تطبیق)
  const name = normalizeCellText(raw.name ?? '');
  if (!name) errors.push(`«${labelOf(colByKey.get('name')!)}» خالی است`);
  else if (name.length < 2) errors.push('«نام مدرسه» حداقل ۲ نویسه است');
  else if (name.length > 200) errors.push('«نام مدرسه» حداکثر ۲۰۰ نویسه است');
  normalized.name = name || null;
  display.name = name;

  // نوع
  const kindRaw = normalizeCellText(raw.kind ?? '');
  if (!kindRaw) {
    normalized.kind = null;
    display.kind = '—';
  } else {
    const k = matchEnum(kindRaw, colByKey.get('kind')!.options!);
    if (!k) errors.push('«نوع» نامعتبر است — مدرسه یا مهدکودک');
    else {
      normalized.kind = k;
      display.kind = colByKey.get('kind')!.options!.find((o) => o.value === k)!.label;
    }
  }

  // جنسیت
  const genderRaw = normalizeCellText(raw.gender_type ?? '');
  if (!genderRaw) {
    normalized.gender_type = null;
    display.gender_type = '—';
  } else {
    const g = matchEnum(genderRaw, colByKey.get('gender_type')!.options!);
    if (!g) errors.push('«جنسیت» نامعتبر است — مختلط، پسرانه یا دخترانه');
    else {
      normalized.gender_type = g;
      display.gender_type = colByKey.get('gender_type')!.options!.find((o) => o.value === g)!.label;
    }
  }

  // کد مدرسه
  const codeRaw = normalizeCellText(raw.code ?? '');
  if (codeRaw) {
    const code = normalizeCode(codeRaw);
    if (code.length > 20) errors.push('«کد مدرسه» حداکثر ۲۰ نویسه است');
    else {
      normalized.code = code;
      display.code = code;
    }
  } else {
    normalized.code = null;
    display.code = '';
  }

  // تلفن‌ها
  for (const key of ['phone', 'principal_phone'] as const) {
    const rawVal = normalizeCellText(raw[key] ?? '');
    if (!rawVal) {
      normalized[key] = null;
      display[key] = '';
      continue;
    }
    const p = normalizePhone(rawVal);
    if (!p.ok) errors.push(`«${labelOf(colByKey.get(key)!)}» معتبر نیست`);
    else if (p.value.length > 20) errors.push(`«${labelOf(colByKey.get(key)!)}» حداکثر ۲۰ نویسه است`);
    else {
      normalized[key] = p.value;
      display[key] = p.value;
    }
  }

  // نام مدیر
  const principalName = normalizeCellText(raw.principal_name ?? '');
  if (principalName.length > 120) errors.push('«نام مدیر» حداکثر ۱۲۰ نویسه است');
  normalized.principal_name = principalName || null;
  display.principal_name = principalName;

  // نشانی و یادداشت
  for (const key of ['address', 'notes'] as const) {
    const v = normalizeCellText(raw[key] ?? '');
    const max = colByKey.get(key)!.maxLength ?? 500;
    if (v.length > max) errors.push(`«${labelOf(colByKey.get(key)!)}» حداکثر ${faDigits(max)} نویسه است`);
    normalized[key] = v || null;
    display[key] = v;
  }

  return { errors, display, normalized };
}

// ─── اعتبارسنجی سطری — تقویم اجرایی ───

function validatePlanRow(raw: RawRow, colByKey: Map<string, ImportColumnSpec>): FieldResult {
  const errors: string[] = [];
  const display: Record<string, string> = {};
  const normalized: Record<string, unknown> = {};

  // عنوان (الزامی — کلید تطبیق)
  const title = normalizeCellText(raw.title ?? '');
  if (!title) errors.push(`«${labelOf(colByKey.get('title')!)}» خالی است`);
  else if (title.length < 2) errors.push('عنوان فاز حداقل ۲ نویسه است');
  else if (title.length > 150) errors.push('عنوان فاز حداکثر ۱۵۰ نویسه است');
  normalized.title = title || null;
  display.title = title;

  // از تاریخ (الزامی)
  const fromRaw = normalizeCellText(raw.from_date ?? '');
  if (!fromRaw) {
    errors.push('«از تاریخ» خالی است');
  } else {
    const g = parseFlexibleDate(fromRaw);
    if (!g) errors.push('«از تاریخ» نامعتبر است — مثل 1404/07/01');
    else {
      normalized.from_date = g;
      display.from_date = jalaliDisplayOfYmd(g);
    }
  }

  // تا تاریخ (اختیاری)
  const toRaw = normalizeCellText(raw.to_date ?? '');
  if (toRaw) {
    const g = parseFlexibleDate(toRaw);
    if (!g) errors.push('«تا تاریخ» نامعتبر است — مثل 1404/07/07 یا خالی');
    else {
      normalized.to_date = g;
      display.to_date = jalaliDisplayOfYmd(g);
    }
  } else {
    normalized.to_date = null;
    display.to_date = '';
  }

  // ترتیب بازه
  const from = normalized.from_date as string | null;
  const to = normalized.to_date as string | null;
  if (from && to && to < from) errors.push('«تا تاریخ» نمی‌تواند قبل از «از تاریخ» باشد');

  // متن‌های بلند (خالی = بدون تغییر در ویرایش → null)
  for (const key of ['admin_actions', 'center_actions'] as const) {
    const v = normalizeCellText(raw[key] ?? '');
    if (v.length > 2000) errors.push(`«${labelOf(colByKey.get(key)!)}» حداکثر ۲۰۰۰ نویسه است`);
    normalized[key] = v || null;
    display[key] = v;
  }

  // وضعیت
  const statusRaw = normalizeCellText(raw.status ?? '');
  if (!statusRaw) {
    normalized.status = null;
    display.status = '—';
  } else {
    const s = matchEnum(statusRaw, colByKey.get('status')!.options!);
    if (!s) errors.push('«وضعیت» نامعتبر است — برنامه‌ریزی‌شده، در جریان یا تکمیل');
    else {
      normalized.status = s;
      display.status = colByKey.get('status')!.options!.find((o) => o.value === s)!.label;
    }
  }

  // برچسب
  const tag = normalizeCellText(raw.tag ?? '');
  if (tag.length > 40) errors.push('«برچسب فعالیت‌ها» حداکثر ۴۰ نویسه است');
  normalized.tag = tag || null;
  display.tag = tag;

  return { errors, display, normalized };
}

// ─── اعتبارسنجی سطری — کلاس‌ها و معلمان ───

function validateClassRow(raw: RawRow, colByKey: Map<string, ImportColumnSpec>): FieldResult {
  const errors: string[] = [];
  const display: Record<string, string> = {};
  const normalized: Record<string, unknown> = {};

  // نام مدرسه (الزامی — اتصال کلاس به مدرسهٔ ثبت‌شده)
  const school = normalizeCellText(raw.school ?? '');
  if (!school) errors.push(`«${labelOf(colByKey.get('school')!)}» خالی است`);
  else if (school.length > 200) errors.push('«نام مدرسه» حداکثر ۲۰۰ نویسه است');
  normalized.school = school || null;
  display.school = school;

  // نام کلاس (الزامی — کلید تطبیق همراه مدرسه)
  const cls = normalizeCellText(raw.class_name ?? '');
  if (!cls) errors.push(`«${labelOf(colByKey.get('class_name')!)}» خالی است`);
  else if (cls.length < 2) errors.push('«نام کلاس» حداقل ۲ نویسه است');
  else if (cls.length > 120) errors.push('«نام کلاس» حداکثر ۱۲۰ نویسه است');
  normalized.class_name = cls || null;
  display.class_name = cls;

  // نام معلم
  const teacher = normalizeCellText(raw.teacher_name ?? '');
  if (teacher.length > 120) errors.push('«نام معلم کلاس» حداکثر ۱۲۰ نویسه است');
  normalized.teacher_name = teacher || null;
  display.teacher_name = teacher;

  // تلفن معلم
  const phoneRaw = normalizeCellText(raw.teacher_phone ?? '');
  if (!phoneRaw) {
    normalized.teacher_phone = null;
    display.teacher_phone = '';
  } else {
    const p = normalizePhone(phoneRaw);
    if (!p.ok) errors.push('«تلفن معلم» معتبر نیست');
    else if (p.value.length > 20) errors.push('«تلفن معلم» حداکثر ۲۰ نویسه است');
    else {
      normalized.teacher_phone = p.value;
      display.teacher_phone = p.value;
    }
  }

  return { errors, display, normalized };
}

// ─── تطبیق با پایگاه داده + تکراری‌های درون فایل ───

async function finishSchoolRows(
  db: DbClient,
  rows: InternalRow[],
  colByKey: Map<string, ImportColumnSpec>
): Promise<void> {
  const dbRows = await db.query<SchoolRow>(
    `SELECT id, name, kind, gender_type, phone, address, principal_name, principal_phone, code, notes FROM schools`
  );
  const byKey = new Map<string, SchoolRow>();
  const codeOwner = new Map<string, SchoolRow>();
  for (const s of dbRows) {
    byKey.set(nameKey(s.name), s);
    if (s.code) codeOwner.set(normalizeCode(s.code), s);
  }

  const seenKeys = new Map<string, number>();
  const seenCodes = new Map<string, number>();

  for (const row of rows) {
    const key = row.result.normalized.name ? nameKey(row.result.normalized.name as string) : null;
    row.key = key;

    // تکرار درون فایل
    if (key && seenKeys.has(key)) {
      row.result.errors.push(`این ${colByKey.get('name')!.label} در سطر ${faDigits(seenKeys.get(key)!)} هم آمده است`);
    } else if (key) {
      seenKeys.set(key, row.index);
    }

    // کد تکراری درون فایل یا تعارض با مدرسهٔ دیگر
    const code = row.result.normalized.code as string | null;
    if (code) {
      const owner = codeOwner.get(code);
      if (owner && key && nameKey(owner.name) !== key) {
        row.result.errors.push(`«کد مدرسه» قبلاً برای «${owner.name}» ثبت شده است`);
      }
      if (seenCodes.has(code)) {
        row.result.errors.push(`«کد مدرسه» در سطر ${faDigits(seenCodes.get(code)!)} هم آمده است`);
      } else {
        seenCodes.set(code, row.index);
      }
    }

    // وضعیت افزودن/ویرایش
    if (key && byKey.has(key)) {
      row.status = 'update';
      row.existingId = byKey.get(key)!.id;
    } else if (key) {
      row.status = 'add';
      row.existingId = null;
    }
  }
}

async function finishPlanRows(
  db: DbClient,
  rows: InternalRow[],
  colByKey: Map<string, ImportColumnSpec>
): Promise<void> {
  const dbRows = await db.query<PlanRow>(
    `SELECT id, title, admin_actions, center_actions, from_date, to_date, status, tag, sort_order FROM clearbook_plans`
  );
  const byKey = new Map<string, PlanRow>();
  for (const p of dbRows) byKey.set(nameKey(p.title), p);

  const seenKeys = new Map<string, number>();
  for (const row of rows) {
    const key = row.result.normalized.title ? nameKey(row.result.normalized.title as string) : null;
    row.key = key;
    if (key && seenKeys.has(key)) {
      row.result.errors.push(`این ${colByKey.get('title')!.label} در سطر ${faDigits(seenKeys.get(key)!)} هم آمده است`);
    } else if (key) {
      seenKeys.set(key, row.index);
    }
    if (key && byKey.has(key)) {
      row.status = 'update';
      row.existingId = byKey.get(key)!.id;
    } else if (key) {
      row.status = 'add';
      row.existingId = null;
    }
  }
}

async function finishClassRows(
  db: DbClient,
  rows: InternalRow[],
  colByKey: Map<string, ImportColumnSpec>
): Promise<void> {
  const schoolRows = await db.query<SchoolLite>(`SELECT id, name FROM schools`);
  const schoolByKey = new Map<string, SchoolLite>();
  for (const s of schoolRows) schoolByKey.set(nameKey(s.name), s);

  const classRows = await db.query<ClassDbRow>(
    `SELECT id, school_id, name, teacher_name, teacher_phone, active FROM classes`
  );
  const classByPair = new Map<string, ClassDbRow>();
  for (const c of classRows) classByPair.set(`${c.school_id}::${nameKey(c.name)}`, c);

  const seenPairs = new Map<string, number>();
  for (const row of rows) {
    const schoolName = row.result.normalized.school as string | null;
    const clsName = row.result.normalized.class_name as string | null;
    row.key = null;

    if (!schoolName || !clsName) continue;
    const school = schoolByKey.get(nameKey(schoolName));
    if (!school) {
      row.result.errors.push(
        `مدرسه با این نام یافت نشد — اول مدرسه را ثبت کنید (درون‌ریزی «اطلاعات مدارس» یا دکمهٔ «مدرسه جدید»)`
      );
      continue;
    }
    row.result.normalized.school_id = school.id;

    const pair = `${school.id}::${nameKey(clsName)}`;
    row.key = pair;
    if (seenPairs.has(pair)) {
      row.result.errors.push(
        `این کلاس (${colByKey.get('school')!.label} + ${colByKey.get('class_name')!.label}) در سطر ${faDigits(seenPairs.get(pair)!)} هم آمده است`
      );
      continue;
    }
    seenPairs.set(pair, row.index);

    const existing = classByPair.get(pair);
    if (existing) {
      row.status = 'update';
      row.existingId = existing.id;
    } else {
      row.status = 'add';
      row.existingId = null;
    }
  }
}

function toValidated(rows: InternalRow[]): ImportValidateResult {
  const out: ImportValidatedRow[] = rows.map((r) => ({
    index: r.index,
    status: r.result.errors.length > 0 ? 'error' : r.status,
    errors: r.result.errors,
    display: r.result.display
  }));
  return {
    total: out.length,
    summary: {
      add: out.filter((r) => r.status === 'add').length,
      update: out.filter((r) => r.status === 'update').length,
      error: out.filter((r) => r.status === 'error').length
    },
    rows: out
  };
}

export function createImportService(deps: {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
}) {
  const { db, audit, logger } = deps;

  function entityFor(key: string, role: StaffRole): ImportRegistryEntity {
    const entity = findImportEntity(key);
    if (!entity) throw new NotFoundError('موجودیت درون‌ریزی');
    if (!entity.roles.includes(role)) throw new ForbiddenError();
    return entity;
  }

  async function buildInternalRows(
    entity: ImportRegistryEntity,
    rawRows: unknown
  ): Promise<{ rows: InternalRow[]; colByKey: Map<string, ImportColumnSpec> }> {
    const coerced = coerceRows(rawRows);
    const colByKey = new Map(entity.columns.map((c) => [c.key, c]));
    const rows: InternalRow[] = coerced.map((raw, i) => ({
      index: i + 1,
      raw,
      result:
        entity.key === 'schools'
          ? validateSchoolRow(raw, colByKey)
          : entity.key === 'school-classes'
            ? validateClassRow(raw, colByKey)
            : validatePlanRow(raw, colByKey),
      status: 'add',
      key: null,
      existingId: null
    }));
    if (entity.key === 'schools') await finishSchoolRows(db, rows, colByKey);
    else if (entity.key === 'school-classes') await finishClassRows(db, rows, colByKey);
    else await finishPlanRows(db, rows, colByKey);
    return { rows, colByKey };
  }

  return {
    registryFor(role: StaffRole): ImportRegistryEntity[] {
      return IMPORT_ENTITIES.filter((e) => e.roles.includes(role));
    },

    async validate(entityKey: string, role: StaffRole, rawRows: unknown): Promise<ImportValidateResult> {
      const entity = entityFor(entityKey, role);
      const { rows } = await buildInternalRows(entity, rawRows);
      return toValidated(rows);
    },

    async commit(entityKey: string, rawRows: unknown, actor: AuthContext): Promise<ImportCommitResult> {
      const entity = entityFor(entityKey, actor.role);
      const { rows } = await buildInternalRows(entity, rawRows);
      const valid = rows.filter((r) => r.result.errors.length === 0 && (r.status === 'add' || r.status === 'update'));
      const skipped = rows.length - valid.length;

      let added = 0;
      let updated = 0;

      if (entity.key === 'school-classes') {
        await db.transaction(async (tx) => {
          for (const row of valid) {
            const n = row.result.normalized;
            if (row.status === 'update' && row.existingId) {
              // خانهٔ خالی = حفظ مقدار قبلی؛ کلاس هم‌نامِ غیرفعال دوباره فعال می‌شود
              const cur = await tx.queryOne<ClassDbRow>(
                `SELECT id, school_id, name, teacher_name, teacher_phone, active FROM classes WHERE id = ?`,
                [row.existingId]
              );
              if (!cur) continue; // بین اعتبارسنجی و ثبت حذف شده — نادیده
              await tx.execute(
                `UPDATE classes SET name = ?, teacher_name = ?, teacher_phone = ?, active = 1 WHERE id = ?`,
                [
                  n.class_name as string,
                  (n.teacher_name as string | null) ?? cur.teacher_name,
                  (n.teacher_phone as string | null) ?? cur.teacher_phone,
                  row.existingId
                ]
              );
              updated += 1;
            } else {
              await tx.execute(
                `INSERT INTO classes (id, school_id, name, teacher_name, teacher_phone, active) VALUES (?, ?, ?, ?, ?, 1)`,
                [
                  crypto.randomUUID(),
                  n.school_id as string,
                  n.class_name as string,
                  n.teacher_name as string | null,
                  n.teacher_phone as string | null
                ]
              );
              added += 1;
            }
          }
          await audit.logInTransaction(tx, {
            actorId: actor.staffId,
            action: 'import.school_classes',
            resourceType: 'school_class',
            resourceId: 'bulk',
            changes: { added: { from: null, to: added }, updated: { from: null, to: updated }, skipped: { from: null, to: skipped } }
          });
        });
      } else if (entity.key === 'schools') {
        await db.transaction(async (tx) => {
          for (const row of valid) {
            const n = row.result.normalized;
            if (row.status === 'update' && row.existingId) {
              // خانهٔ خالی = حفظ مقدار قبلی
              const cur = await tx.queryOne<SchoolRow>(
                `SELECT id, name, kind, gender_type, phone, address, principal_name, principal_phone, code, notes FROM schools WHERE id = ?`,
                [row.existingId]
              );
              if (!cur) continue; // بین اعتبارسنجی و ثبت حذف شده — نادیده
              await tx.execute(
                `UPDATE schools SET name = ?, kind = ?, gender_type = ?, phone = ?, address = ?, principal_name = ?, principal_phone = ?, code = ?, notes = ? WHERE id = ?`,
                [
                  n.name as string,
                  (n.kind as string | null) ?? cur.kind,
                  (n.gender_type as string | null) ?? cur.gender_type,
                  (n.phone as string | null) ?? cur.phone,
                  (n.address as string | null) ?? cur.address,
                  (n.principal_name as string | null) ?? cur.principal_name,
                  (n.principal_phone as string | null) ?? cur.principal_phone,
                  (n.code as string | null) ?? cur.code,
                  (n.notes as string | null) ?? cur.notes,
                  row.existingId
                ]
              );
              updated += 1;
            } else {
              await tx.execute(
                `INSERT INTO schools (id, name, kind, gender_type, phone, address, principal_name, principal_phone, code, notes, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                [
                  crypto.randomUUID(),
                  n.name as string,
                  (n.kind as string | null) ?? 'school',
                  n.gender_type as string | null,
                  n.phone as string | null,
                  n.address as string | null,
                  n.principal_name as string | null,
                  n.principal_phone as string | null,
                  n.code as string | null,
                  n.notes as string | null
                ]
              );
              added += 1;
            }
          }
          await audit.logInTransaction(tx, {
            actorId: actor.staffId,
            action: 'import.schools',
            resourceType: 'school',
            resourceId: 'bulk',
            changes: { added: { from: null, to: added }, updated: { from: null, to: updated }, skipped: { from: null, to: skipped } }
          });
        });
      } else {
        await db.transaction(async (tx) => {
          const maxRow = await tx.queryOne<{ m: number | null }>(`SELECT MAX(sort_order) AS m FROM clearbook_plans`);
          let seq = maxRow?.m ?? 0;
          for (const row of valid) {
            const n = row.result.normalized;
            if (row.status === 'update' && row.existingId) {
              const cur = await tx.queryOne<PlanRow>(
                `SELECT id, title, admin_actions, center_actions, from_date, to_date, status, tag, sort_order FROM clearbook_plans WHERE id = ?`,
                [row.existingId]
              );
              if (!cur) continue;
              await tx.execute(
                `UPDATE clearbook_plans SET title = ?, admin_actions = ?, center_actions = ?, from_date = ?, to_date = ?, status = ?, tag = ?, updated_at = datetime('now') WHERE id = ?`,
                [
                  n.title as string,
                  (n.admin_actions as string | null) ?? cur.admin_actions,
                  (n.center_actions as string | null) ?? cur.center_actions,
                  n.from_date as string,
                  (n.to_date as string | null) ?? cur.to_date,
                  (n.status as string | null) ?? cur.status,
                  (n.tag as string | null) ?? cur.tag,
                  row.existingId
                ]
              );
              updated += 1;
            } else {
              seq += 1;
              await tx.execute(
                `INSERT INTO clearbook_plans (id, title, admin_actions, center_actions, from_date, to_date, status, tag, sort_order, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  crypto.randomUUID(),
                  n.title as string,
                  (n.admin_actions as string | null) ?? '',
                  (n.center_actions as string | null) ?? '',
                  n.from_date as string,
                  n.to_date as string | null,
                  (n.status as string | null) ?? 'planned',
                  n.tag as string | null,
                  seq,
                  actor.staffId
                ]
              );
              added += 1;
            }
          }
          await audit.logInTransaction(tx, {
            actorId: actor.staffId,
            action: 'import.clearbook_plans',
            resourceType: 'clearbook_plan',
            resourceId: 'bulk',
            changes: { added: { from: null, to: added }, updated: { from: null, to: updated }, skipped: { from: null, to: skipped } }
          });
        });
      }

      logger.child('excel-import').info('commit.done', { entity: entity.key, added, updated, skipped, actor: actor.staffId });
      return { added, updated, skipped };
    }
  };
}

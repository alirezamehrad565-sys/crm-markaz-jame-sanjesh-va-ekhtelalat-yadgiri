import type { AuthContext } from '@core/shared';
import {
  ALLOWED_FILE_MIME_TYPES,
  MAX_EXERCISE_PANEL_FILE_BYTES,
  faDigits
} from '@core/shared';
import { ForbiddenError, NotFoundError, ValidationError } from '@core/errors';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { DbClient } from '@core/db';
import type { ObjectStore } from '@core/storage';
import { sanitizeFilename } from '@domain/exercise-bank/pure';
import type {
  BudgetRecord,
  DonationRecord,
  FinanceAttachmentFile,
  FinanceDeps,
  FinanceFileBytesInput,
  FinanceListOpts,
  FinanceService,
  FinanceSummary,
  InvoiceAttachmentMeta,
  InvoiceRecord,
  NewBudgetInput,
  NewDonationInput,
  NewInvoiceInput,
  UpdateBudgetInput,
  UpdateDonationInput,
  UpdateInvoiceInput
} from './types';

// ─── بودجه و مالی مرکز: سرویس ───
// ساده و عمدی: فاکتور هزینه + کمک خانواده‌ها + تراز بودجه — فقط مدیر.

interface BudgetRow {
  id: string;
  title: string;
  amount: number;
  period_from: string | null;
  period_to: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

interface InvoiceRow {
  id: string;
  title: string;
  amount: number;
  invoice_date: string;
  category: string;
  description: string;
  created_at: string;
  updated_at: string;
}

interface InvoiceFileRow {
  id: string;
  invoice_id: string;
  file_key: string;
  file_name: string;
  file_mime: string;
  file_size: number;
  created_at: string;
}

interface DonationRow {
  id: string;
  donor_name: string;
  amount: number;
  donation_date: string;
  student_id: string | null;
  student_first_name?: string | null;
  student_last_name?: string | null;
  note: string;
  created_at: string;
  updated_at: string;
}

/** سقف سختِ ردیف‌های فهرست — دادهٔ مالی مدیر-محور کوچک است؛ صفحه‌بندی لازم نیست */
const LIST_LIMIT = 500;

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function escapeLike(raw: string): string {
  return String(raw ?? '').replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

function concatSegments(segments: Uint8Array[]): Uint8Array {
  if (segments.length === 1) return segments[0];
  const total = segments.reduce((n, s) => n + s.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const s of segments) {
    out.set(s, off);
    off += s.length;
  }
  return out;
}

function sizeLimitMessage(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  const label = mb >= 1 ? `${faDigits(String(Math.round(mb)))} مگابایت` : `${faDigits(String(Math.round(bytes / 1024)))} کیلوبایت`;
  return `حجم فایل بیش از ${label} است`;
}

export function createFinanceService(deps: FinanceDeps): FinanceService {
  const { db, audit, logger, storage } = deps;
  const log = logger.child('finance');

  // مالی مرکز حساس‌ترین دادهٔ سامانه است — فقط مدیر
  function assertManager(actor: AuthContext): void {
    if (actor.role !== 'manager') {
      throw new ForbiddenError('بودجه و مالی فقط برای مدیر مرکز فعال است');
    }
  }

  // ─── اعتبارسنجی دفاعی (مسیرها هم Zod دارند؛ سرویس مستقل از HTTP درست بماند) ───

  function assertAmount(amount: number): void {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new ValidationError('مبلغ باید عدد صحیح بزرگ‌تر از صفر باشد');
    }
  }

  function assertYmd(ymd: string, field: string): void {
    if (!YMD_RE.test(ymd)) {
      throw new ValidationError(`${field} باید تاریخ میلادی معتبر به قالب YYYY-MM-DD باشد`);
    }
  }

  function assertNonEmpty(value: string, label: string): void {
    if (String(value ?? '').trim().length === 0) {
      throw new ValidationError(`${label} نمی‌تواند خالی باشد`);
    }
  }

  function assertBudgetRange(from: string | null, to: string | null): void {
    if (from && to && to < from) {
      throw new ValidationError('بازهٔ بودجه نامعتبر است — «تا» نباید قبل از «از» باشد');
    }
  }

  // ─── ردیف‌به‌رکورد ───

  function rowToBudget(row: BudgetRow): BudgetRecord {
    return {
      id: row.id,
      title: row.title,
      amount: row.amount,
      periodFrom: row.period_from,
      periodTo: row.period_to,
      notes: row.notes ?? '',
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  function rowToInvoice(row: InvoiceRow, attachment: InvoiceAttachmentMeta | null): InvoiceRecord {
    return {
      id: row.id,
      title: row.title,
      amount: row.amount,
      invoiceDate: row.invoice_date,
      category: row.category ?? '',
      description: row.description ?? '',
      attachment,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  function rowToDonation(row: DonationRow): DonationRecord {
    const fullName = [row.student_first_name, row.student_last_name].filter(Boolean).join(' ').trim();
    return {
      id: row.id,
      donorName: row.donor_name,
      amount: row.amount,
      donationDate: row.donation_date,
      studentId: row.student_id,
      studentName: fullName || null,
      note: row.note ?? '',
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  // ─── کوئری‌های پایه ───

  async function getBudgetRow(id: string): Promise<BudgetRow> {
    const row = await db.queryOne<BudgetRow>(
      `SELECT id, title, amount, period_from, period_to, notes, created_at, updated_at
         FROM finance_budgets WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );
    if (!row) throw new NotFoundError('بودجه');
    return row;
  }

  async function getInvoiceRow(id: string): Promise<InvoiceRow> {
    const row = await db.queryOne<InvoiceRow>(
      `SELECT id, title, amount, invoice_date, category, description, created_at, updated_at
         FROM finance_invoices WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );
    if (!row) throw new NotFoundError('فاکتور');
    return row;
  }

  async function getDonationRow(id: string): Promise<DonationRow> {
    const row = await db.queryOne<DonationRow>(
      `SELECT d.id, d.donor_name, d.amount, d.donation_date, d.student_id, d.note, d.created_at, d.updated_at,
              s.first_name AS student_first_name, s.last_name AS student_last_name
         FROM finance_donations d
         LEFT JOIN students s ON s.id = d.student_id
        WHERE d.id = ? AND d.deleted_at IS NULL`,
      [id]
    );
    if (!row) throw new NotFoundError('کمک مالی');
    return row;
  }

  async function attachmentsOfInvoices(invoiceIds: string[]): Promise<Map<string, InvoiceAttachmentMeta>> {
    const map = new Map<string, InvoiceAttachmentMeta>();
    if (invoiceIds.length === 0) return map;
    const ph = invoiceIds.map(() => '?').join(', ');
    const rows = await db.query<InvoiceFileRow>(
      `SELECT id, invoice_id, file_key, file_name, file_mime, file_size, created_at
         FROM finance_invoice_files WHERE invoice_id IN (${ph})
        ORDER BY created_at DESC, rowid DESC`,
      invoiceIds
    );
    for (const r of rows) {
      // جایگزینی پیوست یعنی همیشه حداکثر یک ردیف — فقط اولین (آخرین) را نگه می‌داریم
      if (map.has(r.invoice_id)) continue;
      map.set(r.invoice_id, { id: r.id, filename: r.file_name, mime: r.file_mime, size: r.file_size });
    }
    return map;
  }

  async function validateAttachmentFile(file: FinanceFileBytesInput): Promise<{ filename: string; mime: string }> {
    const mime = String(file.mimeType ?? '').toLowerCase();
    if (!(ALLOWED_FILE_MIME_TYPES as readonly string[]).includes(mime)) {
      throw new ValidationError('نوع فایل مجاز نیست — فقط تصویر (JPG/PNG/WebP) و سند (PDF/Word/Excel/متن)');
    }
    const filename = sanitizeFilename(file.filename);
    if (!filename) throw new ValidationError('نام فایل نامعتبر است');
    if (!Number.isFinite(file.size) || file.size <= 0) throw new ValidationError('محتوای فایل خالی است');
    if (file.size > Math.min(storage.maxObjectBytes, MAX_EXERCISE_PANEL_FILE_BYTES)) {
      throw new ValidationError(sizeLimitMessage(MAX_EXERCISE_PANEL_FILE_BYTES));
    }
    return { filename, mime };
  }

  async function deleteStorageQuietly(key: string): Promise<void> {
    await storage.delete(key).catch((err: unknown) => {
      log.warn('finance.attachment.storage.delete.failed', {
        key,
        error: err instanceof Error ? err.message : String(err)
      });
    });
  }

  return {
    // ─── تراز بودجه ───

    async summary(opts) {
      const budgetRow = await db.queryOne<{ total: number }>(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM finance_budgets WHERE deleted_at IS NULL`
      );
      const invWhere: string[] = ['deleted_at IS NULL'];
      const invParams: unknown[] = [];
      const donWhere: string[] = ['deleted_at IS NULL'];
      const donParams: unknown[] = [];
      if (opts.from) {
        invWhere.push('invoice_date >= ?');
        invParams.push(opts.from);
        donWhere.push('donation_date >= ?');
        donParams.push(opts.from);
      }
      if (opts.to) {
        invWhere.push('invoice_date <= ?');
        invParams.push(opts.to);
        donWhere.push('donation_date <= ?');
        donParams.push(opts.to);
      }
      const [invRow, donRow] = await Promise.all([
        db.queryOne<{ total: number }>(
          `SELECT COALESCE(SUM(amount), 0) AS total FROM finance_invoices WHERE ${invWhere.join(' AND ')}`,
          invParams
        ),
        db.queryOne<{ total: number }>(
          `SELECT COALESCE(SUM(amount), 0) AS total FROM finance_donations WHERE ${donWhere.join(' AND ')}`,
          donParams
        )
      ]);
      const budgetTotal = budgetRow?.total ?? 0;
      const donationsTotal = donRow?.total ?? 0;
      const invoicesTotal = invRow?.total ?? 0;
      return { budgetTotal, donationsTotal, invoicesTotal, balance: budgetTotal + donationsTotal - invoicesTotal };
    },

    // ─── بودجه‌ها ───

    async listBudgets() {
      const rows = await db.query<BudgetRow>(
        `SELECT id, title, amount, period_from, period_to, notes, created_at, updated_at
           FROM finance_budgets WHERE deleted_at IS NULL
          ORDER BY created_at DESC, id DESC
          LIMIT ${LIST_LIMIT}`
      );
      return rows.map(rowToBudget);
    },

    async createBudget(input, actor) {
      assertManager(actor);
      assertNonEmpty(input.title, 'عنوان بودجه');
      assertAmount(input.amount);
      if (input.periodFrom) assertYmd(input.periodFrom, 'تاریخ شروع');
      if (input.periodTo) assertYmd(input.periodTo, 'تاریخ پایان');
      assertBudgetRange(input.periodFrom, input.periodTo);
      const id = crypto.randomUUID();
      await db.transaction(async (tx) => {
        await tx.execute(
          `INSERT INTO finance_budgets (id, title, amount, period_from, period_to, notes, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
          [id, input.title.trim(), input.amount, input.periodFrom, input.periodTo, input.notes ?? '', actor.staffId]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'finance.budget.create',
          resourceType: 'finance_budget',
          resourceId: id,
          changes: {
            title: { from: null, to: input.title },
            amount: { from: null, to: input.amount }
          }
        });
      });
      log.info('finance.budget.created', { id });
      return rowToBudget(await getBudgetRow(id));
    },

    async updateBudget(id, input, actor) {
      assertManager(actor);
      const existing = await getBudgetRow(id);
      const next = {
        title: input.title !== undefined ? input.title.trim() : existing.title,
        amount: input.amount !== undefined ? input.amount : existing.amount,
        periodFrom: input.periodFrom !== undefined ? input.periodFrom : existing.period_from,
        periodTo: input.periodTo !== undefined ? input.periodTo : existing.period_to,
        notes: input.notes !== undefined ? input.notes : existing.notes
      };
      assertNonEmpty(next.title, 'عنوان بودجه');
      assertAmount(next.amount);
      if (next.periodFrom) assertYmd(next.periodFrom, 'تاریخ شروع');
      if (next.periodTo) assertYmd(next.periodTo, 'تاریخ پایان');
      assertBudgetRange(next.periodFrom, next.periodTo);
      await db.transaction(async (tx) => {
        await tx.execute(
          `UPDATE finance_budgets SET title = ?, amount = ?, period_from = ?, period_to = ?, notes = ?, updated_at = datetime('now')
           WHERE id = ?`,
          [next.title, next.amount, next.periodFrom, next.periodTo, next.notes, id]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'finance.budget.update',
          resourceType: 'finance_budget',
          resourceId: id,
          changes: {
            title: { from: existing.title, to: next.title },
            amount: { from: existing.amount, to: next.amount }
          }
        });
      });
      log.info('finance.budget.updated', { id });
      return rowToBudget(await getBudgetRow(id));
    },

    async removeBudget(id, actor) {
      assertManager(actor);
      const existing = await getBudgetRow(id);
      await db.transaction(async (tx) => {
        await tx.execute(
          `UPDATE finance_budgets SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
          [id]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'finance.budget.delete',
          resourceType: 'finance_budget',
          resourceId: id,
          changes: { title: { from: existing.title, to: null }, amount: { from: existing.amount, to: null } }
        });
      });
      log.info('finance.budget.deleted', { id });
      return { id };
    },

    // ─── فاکتورها ───

    async listInvoices(opts) {
      const where: string[] = ['deleted_at IS NULL'];
      const params: unknown[] = [];
      if (opts.from) {
        where.push('invoice_date >= ?');
        params.push(opts.from);
      }
      if (opts.to) {
        where.push('invoice_date <= ?');
        params.push(opts.to);
      }
      if (opts.q) {
        const like = `%${escapeLike(opts.q)}%`;
        where.push(`(title LIKE ? ESCAPE '\\' OR category LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')`);
        params.push(like, like, like);
      }
      const rows = await db.query<InvoiceRow>(
        `SELECT id, title, amount, invoice_date, category, description, created_at, updated_at
           FROM finance_invoices WHERE ${where.join(' AND ')}
          ORDER BY invoice_date DESC, created_at DESC, id DESC
          LIMIT ${LIST_LIMIT}`,
        params
      );
      const attMap = await attachmentsOfInvoices(rows.map((r) => r.id));
      return rows.map((r) => rowToInvoice(r, attMap.get(r.id) ?? null));
    },

    async createInvoice(input, actor) {
      assertManager(actor);
      assertNonEmpty(input.title, 'عنوان فاکتور');
      assertAmount(input.amount);
      assertYmd(input.invoiceDate, 'تاریخ فاکتور');
      const id = crypto.randomUUID();
      await db.transaction(async (tx) => {
        await tx.execute(
          `INSERT INTO finance_invoices (id, title, amount, invoice_date, category, description, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
          [id, input.title.trim(), input.amount, input.invoiceDate, input.category ?? '', input.description ?? '', actor.staffId]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'finance.invoice.create',
          resourceType: 'finance_invoice',
          resourceId: id,
          changes: {
            title: { from: null, to: input.title },
            amount: { from: null, to: input.amount },
            invoice_date: { from: null, to: input.invoiceDate }
          }
        });
      });
      log.info('finance.invoice.created', { id });
      const row = await getInvoiceRow(id);
      return rowToInvoice(row, null);
    },

    async updateInvoice(id, input, actor) {
      assertManager(actor);
      const existing = await getInvoiceRow(id);
      const next = {
        title: input.title !== undefined ? input.title.trim() : existing.title,
        amount: input.amount !== undefined ? input.amount : existing.amount,
        invoiceDate: input.invoiceDate !== undefined ? input.invoiceDate : existing.invoice_date,
        category: input.category !== undefined ? input.category : existing.category,
        description: input.description !== undefined ? input.description : existing.description
      };
      assertNonEmpty(next.title, 'عنوان فاکتور');
      assertAmount(next.amount);
      assertYmd(next.invoiceDate, 'تاریخ فاکتور');
      await db.transaction(async (tx) => {
        await tx.execute(
          `UPDATE finance_invoices SET title = ?, amount = ?, invoice_date = ?, category = ?, description = ?, updated_at = datetime('now')
           WHERE id = ?`,
          [next.title, next.amount, next.invoiceDate, next.category, next.description, id]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'finance.invoice.update',
          resourceType: 'finance_invoice',
          resourceId: id,
          changes: {
            title: { from: existing.title, to: next.title },
            amount: { from: existing.amount, to: next.amount },
            invoice_date: { from: existing.invoice_date, to: next.invoiceDate }
          }
        });
      });
      log.info('finance.invoice.updated', { id });
      const attMap = await attachmentsOfInvoices([id]);
      return rowToInvoice(await getInvoiceRow(id), attMap.get(id) ?? null);
    },

    async removeInvoice(id, actor) {
      assertManager(actor);
      const existing = await getInvoiceRow(id);
      await db.transaction(async (tx) => {
        await tx.execute(
          `UPDATE finance_invoices SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
          [id]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'finance.invoice.delete',
          resourceType: 'finance_invoice',
          resourceId: id,
          changes: { title: { from: existing.title, to: null }, amount: { from: existing.amount, to: null } }
        });
      });
      log.info('finance.invoice.deleted', { id });
      return { id };
    },

    // ─── پیوست اسکن فاکتور ───

    async setInvoiceAttachment(id, file, actor) {
      assertManager(actor);
      await getInvoiceRow(id);
      const prepared = await validateAttachmentFile(file);
      const attId = crypto.randomUUID();
      const key = `finance/invoices/${id}/${attId}`;
      // فایل جدید اول ذخیره می‌شود تا اگر آپلود شکست خورد، پیوست قبلی سالم بماند
      if (storage.putSegments) {
        await storage.putSegments(key, file.segments);
      } else {
        await storage.put(key, concatSegments(file.segments), prepared.mime);
      }
      const oldRows = await db.query<InvoiceFileRow>(
        `SELECT id, invoice_id, file_key, file_name, file_mime, file_size, created_at FROM finance_invoice_files WHERE invoice_id = ?`,
        [id]
      );
      await db.transaction(async (tx) => {
        await tx.execute(`DELETE FROM finance_invoice_files WHERE invoice_id = ?`, [id]);
        await tx.execute(
          `INSERT INTO finance_invoice_files (id, invoice_id, file_key, file_name, file_mime, file_size, created_at)
           VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
          [attId, id, key, prepared.filename, prepared.mime, file.size]
        );
        await tx.execute(`UPDATE finance_invoices SET updated_at = datetime('now') WHERE id = ?`, [id]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'finance.invoice.attachment.set',
          resourceType: 'finance_invoice',
          resourceId: id,
          changes: {
            filename: { from: oldRows[0]?.file_name ?? null, to: prepared.filename },
            sizeBytes: { from: null, to: file.size },
            replaced: { from: null, to: oldRows.length > 0 }
          }
        });
      });
      // حذف فایل(های) قدیمی از ObjectStore — بهترین تلاش، بعد از ثبات DB
      for (const old of oldRows) {
        if (old.file_key !== key) await deleteStorageQuietly(old.file_key);
      }
      log.info('finance.invoice.attachment.set', { id, attachmentId: attId });
      const attMap = await attachmentsOfInvoices([id]);
      return rowToInvoice(await getInvoiceRow(id), attMap.get(id) ?? null);
    },

    async getInvoiceAttachmentFile(id) {
      const row = await db.queryOne<InvoiceFileRow>(
        `SELECT id, invoice_id, file_key, file_name, file_mime, file_size, created_at
           FROM finance_invoice_files WHERE invoice_id = ?
          ORDER BY created_at DESC, rowid DESC
          LIMIT 1`,
        [id]
      );
      if (!row) return null;
      const obj = await storage.get(row.file_key);
      if (!obj) return null;
      return { attachmentId: row.id, bytes: obj.bytes, filename: row.file_name, mime: row.file_mime ?? obj.mime };
    },

    async removeInvoiceAttachment(id, actor) {
      assertManager(actor);
      await getInvoiceRow(id);
      const row = await db.queryOne<InvoiceFileRow>(
        `SELECT id, invoice_id, file_key, file_name, file_mime, file_size, created_at
           FROM finance_invoice_files WHERE invoice_id = ?
          ORDER BY created_at DESC, rowid DESC
          LIMIT 1`,
        [id]
      );
      if (!row) throw new NotFoundError('پیوست فاکتور');
      await deleteStorageQuietly(row.file_key);
      await db.transaction(async (tx) => {
        await tx.execute(`DELETE FROM finance_invoice_files WHERE id = ?`, [row.id]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'finance.invoice.attachment.delete',
          resourceType: 'finance_invoice',
          resourceId: id,
          changes: { filename: { from: row.file_name, to: null }, sizeBytes: { from: row.file_size, to: null } }
        });
      });
      log.info('finance.invoice.attachment.deleted', { id, attachmentId: row.id });
      return rowToInvoice(await getInvoiceRow(id), null);
    },

    // ─── کمک‌ها / دونیشن ───

    async listDonations(opts) {
      const where: string[] = ['d.deleted_at IS NULL'];
      const params: unknown[] = [];
      if (opts.from) {
        where.push('d.donation_date >= ?');
        params.push(opts.from);
      }
      if (opts.to) {
        where.push('d.donation_date <= ?');
        params.push(opts.to);
      }
      if (opts.studentId) {
        where.push('d.student_id = ?');
        params.push(opts.studentId);
      }
      if (opts.q) {
        const like = `%${escapeLike(opts.q)}%`;
        where.push(`(d.donor_name LIKE ? ESCAPE '\\' OR d.note LIKE ? ESCAPE '\\')`);
        params.push(like, like);
      }
      const rows = await db.query<DonationRow>(
        `SELECT d.id, d.donor_name, d.amount, d.donation_date, d.student_id, d.note, d.created_at, d.updated_at,
                s.first_name AS student_first_name, s.last_name AS student_last_name
           FROM finance_donations d
           LEFT JOIN students s ON s.id = d.student_id
          WHERE ${where.join(' AND ')}
          ORDER BY d.donation_date DESC, d.created_at DESC, d.id DESC
          LIMIT ${LIST_LIMIT}`,
        params
      );
      return rows.map(rowToDonation);
    },

    async createDonation(input, actor) {
      assertManager(actor);
      assertNonEmpty(input.donorName, 'نام اهداکننده');
      assertAmount(input.amount);
      assertYmd(input.donationDate, 'تاریخ کمک');
      const id = crypto.randomUUID();
      await db.transaction(async (tx) => {
        await tx.execute(
          `INSERT INTO finance_donations (id, donor_name, amount, donation_date, student_id, note, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
          [id, input.donorName.trim(), input.amount, input.donationDate, input.studentId, input.note ?? '', actor.staffId]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'finance.donation.create',
          resourceType: 'finance_donation',
          resourceId: id,
          changes: {
            donor_name: { from: null, to: input.donorName },
            amount: { from: null, to: input.amount },
            donation_date: { from: null, to: input.donationDate }
          }
        });
      });
      log.info('finance.donation.created', { id });
      return rowToDonation(await getDonationRow(id));
    },

    async updateDonation(id, input, actor) {
      assertManager(actor);
      const existing = await getDonationRow(id);
      const next = {
        donorName: input.donorName !== undefined ? input.donorName.trim() : existing.donor_name,
        amount: input.amount !== undefined ? input.amount : existing.amount,
        donationDate: input.donationDate !== undefined ? input.donationDate : existing.donation_date,
        studentId: input.studentId !== undefined ? input.studentId : existing.student_id,
        note: input.note !== undefined ? input.note : existing.note
      };
      assertNonEmpty(next.donorName, 'نام اهداکننده');
      assertAmount(next.amount);
      assertYmd(next.donationDate, 'تاریخ کمک');
      await db.transaction(async (tx) => {
        await tx.execute(
          `UPDATE finance_donations SET donor_name = ?, amount = ?, donation_date = ?, student_id = ?, note = ?, updated_at = datetime('now')
           WHERE id = ?`,
          [next.donorName, next.amount, next.donationDate, next.studentId, next.note, id]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'finance.donation.update',
          resourceType: 'finance_donation',
          resourceId: id,
          changes: {
            donor_name: { from: existing.donor_name, to: next.donorName },
            amount: { from: existing.amount, to: next.amount },
            donation_date: { from: existing.donation_date, to: next.donationDate }
          }
        });
      });
      log.info('finance.donation.updated', { id });
      return rowToDonation(await getDonationRow(id));
    },

    async removeDonation(id, actor) {
      assertManager(actor);
      const existing = await getDonationRow(id);
      await db.transaction(async (tx) => {
        await tx.execute(
          `UPDATE finance_donations SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
          [id]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'finance.donation.delete',
          resourceType: 'finance_donation',
          resourceId: id,
          changes: { donor_name: { from: existing.donor_name, to: null }, amount: { from: existing.amount, to: null } }
        });
      });
      log.info('finance.donation.deleted', { id });
      return { id };
    }
  };
}

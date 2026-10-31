import type { AppHono } from '@core/shared';
import { UuidSchema } from '@core/shared';
import { NotFoundError, ValidationError } from '@core/errors';
import { getAuthContext, requireRole } from '@core/auth';
import { z } from 'zod';
import { parseMultipartStream } from '@domain/exercise-bank/multipart';
import type { FinanceService } from './types';

// ─── بودجه و مالی مرکز: مسیرها (همه فقط مدیر) ───

const EXT_MIME_FALLBACK: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  txt: 'text/plain',
  csv: 'text/csv',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

function guessMime(filename: string, declared: string): string {
  const t = (declared || '').toLowerCase();
  if (t && t !== 'application/octet-stream') return t;
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MIME_FALLBACK[ext] ?? t ?? 'application/octet-stream';
}

function fileHeaders(filename: string, mimeType: string, inline: boolean): Record<string, string> {
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  const type = mimeType.startsWith('text/') ? `${mimeType}; charset=utf-8` : mimeType;
  const headers: Record<string, string> = {
    'Content-Type': type,
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  };
  // پیش‌نمایش درون‌مرورگری pdf/image — مثل /public/exercise-files در سندباکس CSP اجرا شود
  if (inline) headers['Content-Security-Policy'] = 'sandbox allow-scripts allow-popups';
  return headers;
}

// ─── اسکیماهای Zod لوکال (به @core/shared چیزی اضافه نمی‌کنیم) ───

const FinanceYmdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'تاریخ باید به قالب YYYY-MM-DD باشد');

const FinanceAmountSchema = z
  .number({ invalid_type_error: 'مبلغ باید عدد باشد', required_error: 'مبلغ الزامی است' })
  .int('مبلغ باید عدد صحیح باشد')
  .positive('مبلغ باید بزرگ‌تر از صفر باشد');

const ShortText = (label: string) => z.string().trim().min(1, `${label} الزامی است`).max(200, `${label} حداکثر ۲۰۰ نویسه است`);

const BudgetCreateSchema = z.object({
  title: ShortText('عنوان بودجه'),
  amount: FinanceAmountSchema,
  period_from: FinanceYmdSchema.nullable().optional(),
  period_to: FinanceYmdSchema.nullable().optional(),
  notes: z.string().max(2000).optional().default('')
});

const BudgetUpdateSchema = z.object({
  title: ShortText('عنوان بودجه').optional(),
  amount: FinanceAmountSchema.optional(),
  period_from: FinanceYmdSchema.nullable().optional(),
  period_to: FinanceYmdSchema.nullable().optional(),
  notes: z.string().max(2000).optional()
});

const InvoiceCreateSchema = z.object({
  title: ShortText('عنوان فاکتور'),
  amount: FinanceAmountSchema,
  invoice_date: FinanceYmdSchema,
  category: z.string().trim().max(120).optional().default(''),
  description: z.string().max(2000).optional().default('')
});

const InvoiceUpdateSchema = z.object({
  title: ShortText('عنوان فاکتور').optional(),
  amount: FinanceAmountSchema.optional(),
  invoice_date: FinanceYmdSchema.optional(),
  category: z.string().trim().max(120).optional(),
  description: z.string().max(2000).optional()
});

const DonationCreateSchema = z.object({
  donor_name: ShortText('نام اهداکننده'),
  amount: FinanceAmountSchema,
  donation_date: FinanceYmdSchema,
  student_id: UuidSchema.nullish(),
  note: z.string().max(2000).optional().default('')
});

const DonationUpdateSchema = z.object({
  donor_name: ShortText('نام اهداکننده').optional(),
  amount: FinanceAmountSchema.optional(),
  donation_date: FinanceYmdSchema.optional(),
  student_id: UuidSchema.nullish(),
  note: z.string().max(2000).optional()
});

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function optYmd(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  if (!YMD_RE.test(raw)) throw new ValidationError('بازهٔ تاریخ نامعتبر است');
  return raw;
}

export function registerFinanceRoutes(app: AppHono, service: FinanceService): void {
  const manager = requireRole('manager');

  // ─── تراز بودجه ───

  app.get('/api/finance/summary', manager, async (c) => {
    const q = c.req.query();
    const result = await service.summary({ from: optYmd(q.from), to: optYmd(q.to) });
    return c.json({ data: result }, 200);
  });

  // ─── بودجه‌ها ───

  app.get('/api/finance/budgets', manager, async (c) => {
    const items = await service.listBudgets();
    return c.json({ data: items }, 200);
  });

  app.post('/api/finance/budgets', manager, async (c) => {
    const actor = getAuthContext(c);
    const body = BudgetCreateSchema.parse(await c.req.json<unknown>());
    const result = await service.createBudget(
      {
        title: body.title,
        amount: body.amount,
        periodFrom: body.period_from ?? null,
        periodTo: body.period_to ?? null,
        notes: body.notes ?? ''
      },
      actor
    );
    return c.json({ data: result }, 201);
  });

  app.patch('/api/finance/budgets/:id', manager, async (c) => {
    const actor = getAuthContext(c);
    const id = UuidSchema.parse(c.req.param('id'));
    const body = BudgetUpdateSchema.parse(await c.req.json<unknown>());
    const result = await service.updateBudget(
      id,
      {
        title: body.title,
        amount: body.amount,
        periodFrom: body.period_from,
        periodTo: body.period_to,
        notes: body.notes
      },
      actor
    );
    return c.json({ data: result }, 200);
  });

  app.delete('/api/finance/budgets/:id', manager, async (c) => {
    const actor = getAuthContext(c);
    const id = UuidSchema.parse(c.req.param('id'));
    const result = await service.removeBudget(id, actor);
    return c.json({ data: result }, 200);
  });

  // ─── فاکتورها ───

  app.get('/api/finance/invoices', manager, async (c) => {
    const q = c.req.query();
    const items = await service.listInvoices({
      from: optYmd(q.from),
      to: optYmd(q.to),
      q: q.q || undefined
    });
    return c.json({ data: items }, 200);
  });

  app.post('/api/finance/invoices', manager, async (c) => {
    const actor = getAuthContext(c);
    const body = InvoiceCreateSchema.parse(await c.req.json<unknown>());
    const result = await service.createInvoice(
      {
        title: body.title,
        amount: body.amount,
        invoiceDate: body.invoice_date,
        category: body.category ?? '',
        description: body.description ?? ''
      },
      actor
    );
    return c.json({ data: result }, 201);
  });

  app.patch('/api/finance/invoices/:id', manager, async (c) => {
    const actor = getAuthContext(c);
    const id = UuidSchema.parse(c.req.param('id'));
    const body = InvoiceUpdateSchema.parse(await c.req.json<unknown>());
    const result = await service.updateInvoice(
      id,
      {
        title: body.title,
        amount: body.amount,
        invoiceDate: body.invoice_date,
        category: body.category,
        description: body.description
      },
      actor
    );
    return c.json({ data: result }, 200);
  });

  app.delete('/api/finance/invoices/:id', manager, async (c) => {
    const actor = getAuthContext(c);
    const id = UuidSchema.parse(c.req.param('id'));
    const result = await service.removeInvoice(id, actor);
    return c.json({ data: result }, 200);
  });

  // پیوست اسکن فاکتور — مولتی‌پارت تک‌فایل (نام فیلد: file؛ هر فیلد دارای فایل پذیرفته می‌شود)
  app.post('/api/finance/invoices/:id/attachment', manager, async (c) => {
    const actor = getAuthContext(c);
    const id = UuidSchema.parse(c.req.param('id'));
    const contentType = c.req.header('content-type') ?? '';
    const parsed = await parseMultipartStream(c.req.raw.body as ReadableStream<Uint8Array>, contentType);
    const file = parsed.files.find((f) => f.size > 0);
    if (!file) throw new ValidationError('فایل پیوست ارسال نشده است');
    const result = await service.setInvoiceAttachment(
      id,
      {
        filename: file.filename || 'file',
        mimeType: guessMime(file.filename ?? '', file.mimeType ?? ''),
        segments: file.segments,
        size: file.size
      },
      actor
    );
    return c.json({ data: result }, 201);
  });

  app.get('/api/finance/invoices/:id/attachment', manager, async (c) => {
    UuidSchema.parse(c.req.param('id'));
    const file = await service.getInvoiceAttachmentFile(c.req.param('id'));
    if (!file) throw new NotFoundError('پیوست فاکتور');
    const wantsInline = c.req.query('inline') === '1';
    const mime = file.mime.toLowerCase();
    const inlineable = mime.startsWith('image/') || mime === 'application/pdf';
    return new Response(file.bytes as unknown as BodyInit, {
      status: 200,
      headers: fileHeaders(file.filename, file.mime, wantsInline && inlineable)
    });
  });

  app.delete('/api/finance/invoices/:id/attachment', manager, async (c) => {
    const actor = getAuthContext(c);
    const id = UuidSchema.parse(c.req.param('id'));
    const result = await service.removeInvoiceAttachment(id, actor);
    return c.json({ data: result }, 200);
  });

  // ─── کمک‌ها / دونیشن ───

  app.get('/api/finance/donations', manager, async (c) => {
    const q = c.req.query();
    const items = await service.listDonations({
      from: optYmd(q.from),
      to: optYmd(q.to),
      q: q.q || undefined,
      studentId: q.student_id ? UuidSchema.parse(q.student_id) : undefined
    });
    return c.json({ data: items }, 200);
  });

  app.post('/api/finance/donations', manager, async (c) => {
    const actor = getAuthContext(c);
    const body = DonationCreateSchema.parse(await c.req.json<unknown>());
    const result = await service.createDonation(
      {
        donorName: body.donor_name,
        amount: body.amount,
        donationDate: body.donation_date,
        studentId: body.student_id ?? null,
        note: body.note ?? ''
      },
      actor
    );
    return c.json({ data: result }, 201);
  });

  app.patch('/api/finance/donations/:id', manager, async (c) => {
    const actor = getAuthContext(c);
    const id = UuidSchema.parse(c.req.param('id'));
    const body = DonationUpdateSchema.parse(await c.req.json<unknown>());
    const result = await service.updateDonation(
      id,
      {
        donorName: body.donor_name,
        amount: body.amount,
        donationDate: body.donation_date,
        studentId: body.student_id,
        note: body.note
      },
      actor
    );
    return c.json({ data: result }, 200);
  });

  app.delete('/api/finance/donations/:id', manager, async (c) => {
    const actor = getAuthContext(c);
    const id = UuidSchema.parse(c.req.param('id'));
    const result = await service.removeDonation(id, actor);
    return c.json({ data: result }, 200);
  });
}

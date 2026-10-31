import type { AuthContext } from '@core/shared';
import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { ObjectStore } from '@core/storage';

// ─── بودجه و مالی مرکز: انواع ماژول ───
// مرکز دولتی و تک‌بودجه — طراحی ساده عمدی: فاکتور هزینه + کمک خانواده‌ها + تراز بودجه.
// هیچ تسویهٔ درمانگر، هیچ صورتحساب دانش‌آموزی، هیچ گزارش پیچیده‌ای.
// دسترسی: فقط مدیر (کنترل در service و routes هر دو).

export interface FinanceDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
  storage: ObjectStore;
}

export interface FinanceSummary {
  budgetTotal: number; // جمع بودجه‌های غیرحذف‌شده (بدون فیلتر تاریخ)
  donationsTotal: number; // کمک‌های بازهٔ [from,to]
  invoicesTotal: number; // فاکتورهای بازهٔ [from,to]
  balance: number; // budgetTotal + donationsTotal − invoicesTotal
}

export interface BudgetRecord {
  id: string;
  title: string;
  amount: number; // تومان
  periodFrom: string | null; // YMD میلادی
  periodTo: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceAttachmentMeta {
  id: string;
  filename: string;
  mime: string;
  size: number;
}

export interface InvoiceRecord {
  id: string;
  title: string;
  amount: number; // تومان
  invoiceDate: string; // YMD میلادی
  category: string;
  description: string;
  attachment: InvoiceAttachmentMeta | null;
  createdAt: string;
  updatedAt: string;
}

export interface DonationRecord {
  id: string;
  donorName: string;
  amount: number; // تومان
  donationDate: string; // YMD میلادی
  studentId: string | null;
  studentName: string | null;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface FinanceListOpts {
  from?: string; // YMD میلادی inclusive
  to?: string;
  q?: string;
  studentId?: string; // فقط کمک‌ها
}

export interface FinanceFileBytesInput {
  filename: string;
  mimeType: string;
  segments: Uint8Array[];
  size: number;
}

export interface FinanceAttachmentFile {
  attachmentId: string;
  bytes: Uint8Array;
  filename: string;
  mime: string;
}

export interface NewBudgetInput {
  title: string;
  amount: number;
  periodFrom: string | null;
  periodTo: string | null;
  notes: string;
}

export interface UpdateBudgetInput {
  title?: string;
  amount?: number;
  periodFrom?: string | null;
  periodTo?: string | null;
  notes?: string;
}

export interface NewInvoiceInput {
  title: string;
  amount: number;
  invoiceDate: string;
  category: string;
  description: string;
}

export interface UpdateInvoiceInput {
  title?: string;
  amount?: number;
  invoiceDate?: string;
  category?: string;
  description?: string;
}

export interface NewDonationInput {
  donorName: string;
  amount: number;
  donationDate: string;
  studentId: string | null;
  note: string;
}

export interface UpdateDonationInput {
  donorName?: string;
  amount?: number;
  donationDate?: string;
  studentId?: string | null;
  note?: string;
}

export interface FinanceService {
  // تراز بودجه
  summary(opts: { from?: string; to?: string }): Promise<FinanceSummary>;

  // بودجه‌ها
  listBudgets(): Promise<BudgetRecord[]>;
  createBudget(input: NewBudgetInput, actor: AuthContext): Promise<BudgetRecord>;
  updateBudget(id: string, input: UpdateBudgetInput, actor: AuthContext): Promise<BudgetRecord>;
  removeBudget(id: string, actor: AuthContext): Promise<{ id: string }>;

  // فاکتورها (هزینه)
  listInvoices(opts: FinanceListOpts): Promise<InvoiceRecord[]>;
  createInvoice(input: NewInvoiceInput, actor: AuthContext): Promise<InvoiceRecord>;
  updateInvoice(id: string, input: UpdateInvoiceInput, actor: AuthContext): Promise<InvoiceRecord>;
  removeInvoice(id: string, actor: AuthContext): Promise<{ id: string }>;

  // پیوست اسکن فاکتور — تک‌فایل، بارگذاری جدید جایگزین قبلی می‌شود
  setInvoiceAttachment(id: string, file: FinanceFileBytesInput, actor: AuthContext): Promise<InvoiceRecord>;
  getInvoiceAttachmentFile(id: string): Promise<FinanceAttachmentFile | null>;
  removeInvoiceAttachment(id: string, actor: AuthContext): Promise<InvoiceRecord>;

  // کمک‌ها / دونیشن خانواده‌ها
  listDonations(opts: FinanceListOpts): Promise<DonationRecord[]>;
  createDonation(input: NewDonationInput, actor: AuthContext): Promise<DonationRecord>;
  updateDonation(id: string, input: UpdateDonationInput, actor: AuthContext): Promise<DonationRecord>;
  removeDonation(id: string, actor: AuthContext): Promise<{ id: string }>;
}
